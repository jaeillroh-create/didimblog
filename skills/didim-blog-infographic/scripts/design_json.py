#!/usr/bin/env python3
"""인포그래픽 설계 JSON 읽기 — client-generate.ts parsePhase25Json(3단계 복구) 포팅.

다른 스크립트(render.py, check_sources.py, insert_markers.py)가 import 해서 쓴다.
단독 실행: python3 design_json.py --input raw.txt  → 복구된 JSON 을 stdout 으로.

복구 단계 (원본: src/lib/client-generate.ts:904-976):
  1차: ```json 펜스 제거 후 첫 '{' ~ 마지막 '}' 그대로 파싱
  2차: 잘린 JSON — 마지막 '}' 까지 자르고 열린 [ 와 { 개수만큼 닫기
  3차: 개별 객체 추출 — "position" … "type" … "korean_prompt"(레거시) 또는 "headline"(v2) 까지 정규식으로 잘라 파싱
최상위가 배열이면(스킬에서 Claude 가 배열로 낸 경우) 그대로 받아 {"infographics": [...]} 로 감싼다(스킬 추가).
"""
import argparse
import json
import re
import sys


def parse_phase25_json(raw):
    cleaned = re.sub(r"```\s*", "", re.sub(r"```json\s*", "", raw)).strip()

    # (스킬 추가) 최상위 배열
    if cleaned.startswith("["):
        try:
            arr = json.loads(cleaned)
            if isinstance(arr, list):
                return {"infographics": arr}
        except ValueError:
            pass

    # 1차: 그대로 파싱
    m = re.search(r"\{[\s\S]*\}", cleaned)
    if m:
        try:
            return json.loads(m.group(0))
        except ValueError as e:
            sys.stderr.write(f"[Phase 2.5] 1차 파싱 실패: {e}\n")

    # 2차: 잘린 JSON 복구
    try:
        text = cleaned
        fb = text.find("{")
        if fb == -1:
            raise ValueError("{ 없음")
        text = text[fb:]
        lb = text.rfind("}")
        if lb > 0:
            text = text[: lb + 1]
        ob = text.count("[") - text.count("]")
        text += "]" * max(ob, 0)
        oc = text.count("{") - text.count("}")
        text += "}" * max(oc, 0)
        return json.loads(text)
    except ValueError as e:
        sys.stderr.write(f"[Phase 2.5] 2차 복구 파싱 실패: {e}\n")

    # 3차: 개별 객체 추출 (레거시 korean_prompt 또는 v2 headline 까지)
    obj_re = re.compile(
        r'\{\s*"position"\s*:\s*"[^"]*"[\s\S]*?"type"\s*:\s*"[^"]*"[\s\S]*?"(?:korean_prompt|headline)"\s*:\s*"[^"]*"'
    )
    items = []
    for mm in obj_re.findall(cleaned):
        base = mm[mm.find("{"):]
        obj = base if base.endswith("}") else base + '"}'
        try:  # 원본과 동일한 시도 (원본은 값 끝 따옴표 뒤에 '"}' + '}' 를 붙여 사실상 항상 실패함 — spec 8절)
            partial = json.loads(obj + "}")
        except ValueError:
            try:  # (스킬 보정) 마지막 값 바로 뒤에서 객체를 닫는다
                partial = json.loads(base + "}")
            except ValueError:
                continue
        items.append(partial)
    if items:
        sys.stderr.write(f"[Phase 2.5] 3차 개별 추출 성공: {len(items)}개\n")
        return {"infographics": items}
    return None


def load_designs(raw):
    """문자열 → 설계 객체 목록. 객체 1개, 배열, {"infographics": [...]} 모두 허용."""
    parsed = parse_phase25_json(raw)
    if parsed is None:
        raise SystemExit("설계 JSON 을 해석하지 못했습니다 (3단계 복구 모두 실패).")
    if isinstance(parsed, dict) and isinstance(parsed.get("infographics"), list):
        return parsed["infographics"]
    if isinstance(parsed, dict):
        return [parsed]
    return list(parsed)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", "-i", required=True, help="LLM 원문 응답 또는 JSON 파일 (- 는 stdin)")
    a = ap.parse_args()
    raw = sys.stdin.read() if a.input == "-" else open(a.input, encoding="utf-8").read()
    print(json.dumps({"infographics": load_designs(raw)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
