#!/usr/bin/env python3
"""검증 응답(JSON 텍스트) 파싱·정규화 — client-generate.ts 포팅.

--mode cross     : parseCrossValidationJson + normalizeCrossValidationIssue
                   (PROMPT_CROSS_VALIDATION 응답: 한국어 severity, problem, suggested_text)
--mode factcheck : parseFactCheckJson + clientFactCheck 후처리
                   (PROMPT_FACT_CHECK / _QUICK 응답: original_text 없으면 location 으로 본문 줄 찾기)

사용 예:
  python3 parse_result.py --mode cross --raw-file reply.txt
  python3 parse_result.py --mode factcheck --raw-file reply.txt --body-file draft.md

출력(JSON): {"success": true, "result": {overall_score, verdict, issues[], strengths[], fact_check_items[]}}
           또는 {"success": false, "error": "..."}
"""

import argparse
import json
import re
import sys

from _jscompat import js_trim

_MISSING = object()


def _nn(obj, key, default=_MISSING):
    """JS 의 obj.key ?? default (null/undefined 일 때만 대체)."""
    if isinstance(obj, dict) and key in obj and obj[key] is not None:
        return obj[key]
    return None if default is _MISSING else default


def _try_json(s):
    try:
        return True, json.loads(s)
    except (json.JSONDecodeError, ValueError):
        return False, None


# ── parseFactCheckJson (client-generate.ts) ──
def parse_fact_check_json(text: str):
    cleaned = js_trim(text)
    if "```" in cleaned:
        m = re.search(r"```(?:json)?\s*\n?([\s\S]*?)\n?```", cleaned)
        if m:
            cleaned = js_trim(m.group(1))
    jm = re.search(r"\{[\s\S]*\}", cleaned)
    if jm:
        ok, val = _try_json(jm.group(0))
        if ok:
            return val
        partial = jm.group(0)
        last_complete = max(partial.rfind("}"), partial.rfind("]"))
        if last_complete > 0:
            partial = partial[: last_complete + 1]
        ob, cb = partial.count("{"), partial.count("}")
        obk, cbk = partial.count("["), partial.count("]")
        partial += "]" * max(obk - cbk, 0)
        partial += "}" * max(ob - cb, 0)
        ok, val = _try_json(partial)
        if ok:
            return val
    ok, val = _try_json(cleaned)
    return val if ok else None


def client_fact_check_postprocess(parsed, body: str):
    """clientFactCheck 의 파싱 후 처리 (기본값 + original/replacement 폴백)."""
    if not isinstance(parsed, dict):
        # JS 에서는 배열/원시값이어도 그대로 진행되지만 의미 있는 결과가 아님
        parsed = {}
    result = parsed
    result["issues"] = _nn(result, "issues", [])
    result["strengths"] = _nn(result, "strengths", [])
    result["fact_check_items"] = _nn(result, "fact_check_items", [])
    if len(result["issues"]) > 0:
        body_lines = body.split("\n")
        for issue in result["issues"]:
            if not isinstance(issue, dict):
                continue
            if not issue.get("original_text") and issue.get("location"):
                loc = issue["location"]
                match_line = next((ln for ln in body_lines if loc in ln), None)
                if match_line is not None:
                    issue["original_text"] = js_trim(match_line)
            if not issue.get("replacement_text") and issue.get("suggestion"):
                issue["replacement_text"] = issue["suggestion"]
    return result


# ── PROMPT_CROSS_VALIDATION 전용 ──
SEVERITY_KO_TO_EN = {
    "심각": "high",
    "주의": "medium",
    "경미": "low",
    "high": "high",
    "medium": "medium",
    "low": "low",
}


def normalize_cross_validation_issue(raw):
    if raw is None:
        # JS: null.original_text → TypeError → clientCrossValidateV2 catch → "검증 실패"
        raise TypeError("issue 가 null 입니다")
    if not isinstance(raw, dict):
        raw = {}
    original = _nn(raw, "original_text", "")
    sev_key = _nn(raw, "severity", "medium")
    out = {
        "category": _nn(raw, "category", "기타"),
        "severity": SEVERITY_KO_TO_EN.get(sev_key, "medium") if isinstance(sev_key, str) else "medium",
        "location": _nn(raw, "location", original[:20] if isinstance(original, str) else ""),
        "description": _nn(raw, "problem", _nn(raw, "description", "")),
        "suggestion": _nn(raw, "suggestion", ""),
    }
    if original:
        out["original_text"] = original
    repl = _nn(raw, "suggested_text", _nn(raw, "replacement_text"))
    if repl is not None:
        out["replacement_text"] = repl
    return out


def parse_cross_validation_json(text: str):
    cleaned = js_trim(text)
    if "```" in cleaned:
        m = re.search(r"```(?:json)?\s*\n?([\s\S]*?)\n?```", cleaned)
        if m:
            cleaned = js_trim(m.group(1))
    first = cleaned.find("{")
    last = cleaned.rfind("}")
    if first == -1 or last == -1 or last < first:
        return None
    candidate = cleaned[first: last + 1]
    ok, parsed = _try_json(candidate)
    if not ok:
        ob, cb = candidate.count("{"), candidate.count("}")
        obk, cbk = candidate.count("["), candidate.count("]")
        candidate += "]" * max(obk - cbk, 0)
        candidate += "}" * max(ob - cb, 0)
        ok, parsed = _try_json(candidate)
        if not ok:
            return None
    if parsed is None or not isinstance(parsed, (dict, list)):
        return None
    pd = parsed if isinstance(parsed, dict) else {}
    sc = pd.get("overall_score")
    score = sc if isinstance(sc, (int, float)) and not isinstance(sc, bool) else 0
    issues_raw = pd.get("issues")
    issues = [normalize_cross_validation_issue(r) for r in issues_raw] if isinstance(issues_raw, list) else []
    verdict = "pass" if score >= 80 else ("fix_required" if score >= 60 else "major_issues")
    return {
        "overall_score": score,
        "verdict": verdict,
        "issues": issues,
        "strengths": [],
        "fact_check_items": [],
    }


def main():
    ap = argparse.ArgumentParser(
        description="팩트체크/교차검증 응답 텍스트를 파싱해 FactCheckResult JSON 으로 정규화한다."
    )
    ap.add_argument("--mode", choices=["cross", "factcheck"], default="cross")
    ap.add_argument("--raw-file", help="LLM 응답 원문 파일. 없으면 stdin")
    ap.add_argument("--body-file", help="factcheck 모드: location 폴백용 본문 파일")
    args = ap.parse_args()

    raw = open(args.raw_file, encoding="utf-8").read() if args.raw_file else sys.stdin.read()

    if args.mode == "cross":
        try:
            res = parse_cross_validation_json(raw)
        except TypeError as e:
            print(json.dumps({"success": False, "error": f"검증 실패: {e}"}, ensure_ascii=False))
            return
        if res is None:
            print(json.dumps({"success": False, "error": "응답 JSON 파싱 실패"}, ensure_ascii=False))
            return
        print(json.dumps({"success": True, "result": res}, ensure_ascii=False, indent=2))
    else:
        parsed = parse_fact_check_json(raw)
        # JS: if (!parsed) — {} / [] 는 truthy, None·0·""·false 는 falsy
        if parsed is None or parsed is False or parsed == "" or (
            isinstance(parsed, (int, float)) and not isinstance(parsed, bool) and parsed == 0
        ):
            print(
                json.dumps(
                    {"success": False, "error": "팩트체크 결과를 파싱할 수 없습니다. 수동으로 검토해주세요."},
                    ensure_ascii=False,
                )
            )
            return
        body = open(args.body_file, encoding="utf-8").read() if args.body_file else ""
        res = client_fact_check_postprocess(parsed, body)
        print(json.dumps({"success": True, "result": res}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
