#!/usr/bin/env python3
"""SEO 자동 점수 — src/lib/seo-calculator.ts + src/lib/constants/seo-rubrics.ts 포팅.

카테고리별 루브릭(CAT-A / CAT-B / CAT-B-03 / CAT-C), 상태별 검사 범위(S0~S5),
범위 기반 부분 점수(만점/67%/33%/0), 다이어리 CTA 부재 가점, 정규화 점수,
판정(pass / fix_required / blocked), 점수 색상 3단계를 계산한다.

입력(JSON, stdin 또는 --input):
{
  "title": "직무발명보상금으로 법인세 줄이는 3가지 방법 정리",
  "body": "...마크다운 본문...",
  "target_keyword": "직무발명보상금",
  "tags": ["직무발명보상금", "..."],
  "status": "S1",                  // S0~S5, 생략 시 S2
  "category_id": "CAT-A",          // 1차 카테고리
  "secondary_category": "CAT-A-01" // 2차(있으면 우선) — 원본: secondary_category || category_id
}
출력(JSON): totalScore, maxPossibleScore, normalizedScore, items[], verdict, activeItemCount,
           + verdictLabel, scoreColor, scoreBgColor, progressColor, blockedMessage, rubricKey
"""

import argparse
import json
import math
import re
import sys

from _jscompat import JS_DOT, JS_WS, js_len, js_round

# ── seo-rubrics.ts: SEO_RUBRICS ──
SEO_RUBRICS = {
    # 변리사의 현장 수첩
    "CAT-A": {
        "bodyLength": {"min": 1500, "max": 2000, "weight": 15},
        "keywordFreq": {"min": 3, "max": 5, "weight": 15},
        "subHeadings": {"min": 2, "max": 3, "weight": 10},
        "ctaRequired": True,
        "ctaWeight": 10,
        "structureRequired": True,
        "titleLength": {"min": 25, "max": 30, "weight": 10},
        "tagCount": {"min": 10, "max": 10, "weight": 5},
        "imageCount": {"min": 3, "max": 5, "weight": 10},
    },
    # IP 라운지 (일반)
    "CAT-B": {
        "bodyLength": {"min": 1500, "max": 2000, "weight": 15},
        "keywordFreq": {"min": 3, "max": 5, "weight": 15},
        "subHeadings": {"min": 2, "max": 3, "weight": 10},
        "ctaRequired": True,
        "ctaWeight": 10,
        "structureRequired": True,
        "titleLength": {"min": 25, "max": 30, "weight": 10},
        "tagCount": {"min": 10, "max": 10, "weight": 5},
        "imageCount": {"min": 3, "max": 5, "weight": 10},
    },
    # IP 뉴스 한 입 (경량)
    "CAT-B-03": {
        "bodyLength": {"min": 800, "max": 1200, "weight": 15},
        "keywordFreq": {"min": 2, "max": 3, "weight": 15},
        "subHeadings": {"min": 0, "max": 1, "weight": 5},
        "ctaRequired": True,
        "ctaWeight": 5,
        "structureRequired": False,
        "titleLength": {"min": 25, "max": 30, "weight": 10},
        "tagCount": {"min": 10, "max": 10, "weight": 5},
        "imageCount": {"min": 1, "max": 3, "weight": 10},
    },
    # 디딤 다이어리
    "CAT-C": {
        "bodyLength": {"min": 800, "max": 1500, "weight": 15},
        "keywordFreq": {"min": 1, "max": 2, "weight": 10},
        "subHeadings": {"min": 0, "max": 2, "weight": 0},
        "ctaRequired": False,
        "ctaWeight": 0,
        "ctaAbsenceBonus": 10,
        "structureRequired": False,
        "titleLength": {"min": 15, "max": 35, "weight": 10},
        "tagCount": {"min": 10, "max": 10, "weight": 5},
        "imageCount": {"min": 1, "max": 5, "weight": 5},
    },
}

_ALL = ["titleLength", "bodyLength", "keywordFreq", "subHeadings", "ctaCheck", "imageCount", "tagCount"]
STATUS_CHECK_RANGES = {
    "S0": ["titleLength"],
    "S1": ["titleLength", "bodyLength", "keywordFreq", "subHeadings", "ctaCheck"],
    "S2": list(_ALL),
    "S3": list(_ALL),
    "S4": list(_ALL),
    "S5": list(_ALL),
}


def get_rubric_key(category_id):
    """getRubric: 정확 매칭 → 상위(앞 2토막) 폴백 → CAT-A."""
    if not category_id:
        return "CAT-A"
    if category_id in SEO_RUBRICS:
        return category_id
    parent = "-".join(category_id.split("-")[:2])
    if parent in SEO_RUBRICS:
        return parent
    return "CAT-A"


def get_score_color(score):
    if score >= 80:
        return "text-green-600"
    if score >= 50:
        return "text-orange-500"
    return "text-red-500"


def get_score_bg_color(score):
    if score >= 80:
        return "bg-green-50"
    if score >= 50:
        return "bg-orange-50"
    return "bg-red-50"


def calc_partial_score(actual, rng):
    mn, mx, w = rng["min"], rng["max"], rng["weight"]
    if w == 0:
        return 0
    if mn <= actual <= mx:
        return w
    span = max(mx - mn, 1)
    tol1 = max(math.ceil(span * 1.6), 5)
    tol2 = max(math.ceil(span * 2.2), 10)
    if mn - tol1 <= actual <= mx + tol1:
        return js_round(w * 0.67)
    if mn - tol2 <= actual <= mx + tol2:
        return js_round(w * 0.33)
    return 0


def count_keyword(body, keyword):
    if not keyword or not body:
        return 0
    return len(re.findall(re.escape(keyword), body, re.IGNORECASE))


_SUBHEAD_RE = re.compile(r"(?:^|(?<=[\n\r  ]))#{2,3}" + JS_WS + "+" + JS_DOT + "+")  # /^#{2,3}\s+.+/gm
_IMAGE_RE = re.compile(r"\[IMAGE:" + JS_WS + "*" + JS_DOT + r"+?\]")  # /\[IMAGE:\s*.+?\]/g
_CTA_PATTERNS = [
    re.compile(r"━{3,}"),
    re.compile(r"admin@didimip\.com"),
    re.compile(r"이웃" + JS_WS + r"*추가"),
    re.compile(r"02-571-6613"),
    re.compile(r"Tel:" + JS_WS + r"*[0-9-]+"),
    re.compile(r"재무제표"),
    re.compile(r"시뮬레이션을?" + JS_WS + r"*만들어"),
    re.compile(r"무료" + JS_WS + r"*진단"),
]


def count_sub_headings(body):
    if not body:
        return 0
    return len(_SUBHEAD_RE.findall(body))


def count_images(body):
    if not body:
        return 0
    return len(_IMAGE_RE.findall(body))


def has_cta(body):
    if not body:
        return False
    return any(p.search(body) for p in _CTA_PATTERNS)


def _fmt(n):
    return f"{n:,}"


def calculate_seo_score(content, category_id):
    rubric = SEO_RUBRICS[get_rubric_key(category_id)]
    status = content.get("status")
    if status not in STATUS_CHECK_RANGES:
        raise ValueError(f"알 수 없는 상태값: {status} (S0~S5)")
    active = STATUS_CHECK_RANGES[status]
    items = []
    total = 0
    max_possible = 0
    body = content.get("body") or ""
    title = content.get("title") or ""
    keyword = content.get("target_keyword") or ""
    tags = content.get("tags") or []

    if "titleLength" in active:
        r = rubric["titleLength"]
        n = js_len(title)
        score = calc_partial_score(n, r)
        passed = r["min"] <= n <= r["max"]
        items.append({
            "key": "titleLength", "label": "제목 길이", "score": score, "maxScore": r["weight"],
            "actual": n, "expected": f"{r['min']}~{r['max']}자", "passed": passed,
            "hint": "" if passed else f"제목을 {r['min']}~{r['max']}자로 조정하세요 (현재 {n}자)",
        })
        total += score
        max_possible += r["weight"]

    if "bodyLength" in active:
        r = rubric["bodyLength"]
        n = js_len(re.sub(JS_WS, "", body))
        score = calc_partial_score(n, r)
        passed = r["min"] <= n <= r["max"]
        items.append({
            "key": "bodyLength", "label": "본문 분량", "score": score, "maxScore": r["weight"],
            "actual": n, "expected": f"{_fmt(r['min'])}~{_fmt(r['max'])}자", "passed": passed,
            "hint": "" if passed else f"본문을 {_fmt(r['min'])}~{_fmt(r['max'])}자로 조정하세요 (현재 {_fmt(n)}자)",
        })
        total += score
        max_possible += r["weight"]

    if "keywordFreq" in active:
        r = rubric["keywordFreq"]
        freq = count_keyword(body, keyword)
        score = calc_partial_score(freq, r) if keyword else 0
        passed = r["min"] <= freq <= r["max"]
        if not keyword:
            hint = "타겟 키워드를 설정하세요"
        elif passed:
            hint = ""
        elif freq < r["min"]:
            hint = f"키워드를 {r['min']}회 이상 사용하세요 (현재 {freq}회)"
        else:
            hint = f"키워드 과다 사용 — {r['max']}회 이하로 줄이세요 (현재 {freq}회)"
        items.append({
            "key": "keywordFreq", "label": "키워드 빈도", "score": score, "maxScore": r["weight"],
            "actual": f"{freq}회" if keyword else "키워드 미설정", "expected": f"{r['min']}~{r['max']}회",
            "passed": passed if keyword else False, "hint": hint,
        })
        total += score
        max_possible += r["weight"]

    if "subHeadings" in active:
        r = rubric["subHeadings"]
        h = count_sub_headings(body)
        score = calc_partial_score(h, r) if r["weight"] > 0 else 0
        passed = r["weight"] == 0 or (r["min"] <= h <= r["max"])
        if r["weight"] > 0:
            items.append({
                "key": "subHeadings", "label": "소제목 개수", "score": score, "maxScore": r["weight"],
                "actual": f"{h}개", "expected": f"{r['min']}~{r['max']}개", "passed": passed,
                "hint": "" if passed else f"소제목(##)을 {r['min']}~{r['max']}개 사용하세요",
            })
            total += score
            max_possible += r["weight"]

    if "ctaCheck" in active:
        c = has_cta(body)
        if rubric["ctaRequired"]:
            score = rubric["ctaWeight"] if c else 0
            items.append({
                "key": "ctaCheck", "label": "CTA 배치", "score": score, "maxScore": rubric["ctaWeight"],
                "actual": "있음" if c else "없음", "expected": "CTA 필수", "passed": c,
                "hint": "" if c else "구분선(━━━) 아래에 CTA를 배치하세요",
            })
            total += score
            max_possible += rubric["ctaWeight"]
        elif rubric.get("ctaAbsenceBonus"):
            bonus = rubric["ctaAbsenceBonus"]
            score = 0 if c else bonus
            items.append({
                "key": "ctaCheck", "label": "CTA 미포함", "score": score, "maxScore": bonus,
                "actual": "있음 (부적절)" if c else "없음 (적절)", "expected": "CTA 없어야 함", "passed": not c,
                "hint": "디딤 다이어리에는 CTA를 넣지 마세요" if c else "",
            })
            total += score
            max_possible += bonus

    if "imageCount" in active:
        r = rubric["imageCount"]
        n = count_images(body)
        score = calc_partial_score(n, r)
        passed = r["min"] <= n <= r["max"]
        items.append({
            "key": "imageCount", "label": "이미지 마커", "score": score, "maxScore": r["weight"],
            "actual": f"{n}개", "expected": f"{r['min']}~{r['max']}개", "passed": passed,
            "hint": "" if passed else f"[IMAGE: 설명] 마커를 {r['min']}개 이상 배치하세요",
        })
        total += score
        max_possible += r["weight"]

    if "tagCount" in active:
        r = rubric["tagCount"]
        n = len(tags)
        chars = js_len("".join(tags))
        passed = n >= r["min"] and chars < 100
        score = r["weight"] if passed else calc_partial_score(n, r)
        if chars >= 100:
            hint = f"태그 총 글자수가 100자를 초과합니다 ({chars}자). 핵심 태그만 남기세요."
        elif n < r["min"]:
            hint = f"태그를 {r['min']}개로 채워주세요 (현재 {n}개)"
        else:
            hint = ""
        items.append({
            "key": "tagCount", "label": "네이버 태그", "score": score, "maxScore": r["weight"],
            "actual": f"{n}개 / {chars}자", "expected": f"{r['min']}개 이상, 100자 미만", "passed": passed,
            "hint": hint,
        })
        total += score
        max_possible += r["weight"]

    normalized = js_round((total / max_possible) * 100) if max_possible > 0 else 0
    verdict = "pass"
    if normalized < 80:
        verdict = "fix_required"
    if normalized < 50 and status in ("S3", "S4", "S5"):
        verdict = "blocked"

    return {
        "totalScore": total,
        "maxPossibleScore": max_possible,
        "normalizedScore": normalized,
        "items": items,
        "verdict": verdict,
        "activeItemCount": len(items),
    }


VERDICT_LABELS = {"pass": "통과", "fix_required": "수정 필요", "blocked": "발행 불가"}


def decorate(result, rubric_key):
    s = result["normalizedScore"]
    out = dict(result)
    out["rubricKey"] = rubric_key
    out["verdictLabel"] = VERDICT_LABELS[result["verdict"]]
    out["scoreColor"] = get_score_color(s)
    out["scoreBgColor"] = get_score_bg_color(s)
    out["progressColor"] = "bg-green-500" if s >= 80 else ("bg-orange-400" if s >= 50 else "bg-red-500")
    out["summary"] = f"{result['activeItemCount']}개 항목 검사 ({result['totalScore']}/{result['maxPossibleScore']}점)"
    out["blockedMessage"] = (
        "발행 불가 — SEO 점수가 50점 미만입니다\nS3(발행예정) 이상에서는 50점 이상이어야 발행 가능합니다."
        if result["verdict"] == "blocked"
        else None
    )
    return out


def main():
    ap = argparse.ArgumentParser(description="카테고리별 루브릭·상태별 범위로 SEO 점수를 계산한다 (seo-calculator.ts 포팅).")
    ap.add_argument("--input", help="입력 JSON 파일. 없으면 stdin")
    ap.add_argument("--body-file", help="본문을 별도 파일로 줄 때 (JSON 의 body 를 덮어씀)")
    args = ap.parse_args()
    data = json.load(open(args.input, encoding="utf-8")) if args.input else json.load(sys.stdin)
    if args.body_file:
        data["body"] = open(args.body_file, encoding="utf-8").read()
    data.setdefault("status", "S2")
    cat = data.get("secondary_category") or data.get("category_id")
    res = calculate_seo_score(data, cat)
    print(json.dumps(decorate(res, get_rubric_key(cat)), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
