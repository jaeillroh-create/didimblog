#!/usr/bin/env python3
"""품질 점수 — src/lib/utils/quality-score.ts 포팅 (+ QualityBadge / CircularScore 표시 규칙).

quality_score = views_norm×0.4 + duration_norm×0.3 + conversion_norm×0.3
각 지표 정규화 = (글의 값 / 해당 월 전체 글 중 최댓값) × 100 (최댓값 0 이면 0)

입력(JSON, stdin 또는 --input) — 둘 중 하나:
 A) 단건: {"input": {"views": 120, "avgDurationSec": 95, "ctaClicks": 2},
          "stats": {"maxViews": 300, "maxDuration": 180, "maxCtaClicks": 5}}
 B) 월간 목록: {"posts": [{"id": "...", "views": 120, "avgDurationSec": 95, "ctaClicks": 2}, ...]}
    → stats 를 목록의 최댓값으로 만든 뒤 글마다 계산 (원본은 stats 를 호출 측이 넘김 — 스킬 편의 기능)
출력(JSON): score(소수 유지), grade(excellent~critical), gradeLabel(우수~위험), badgeText, circleColor
"""

import argparse
import json
import sys


def calculate_quality_score(inp, stats):
    v = (inp["views"] / stats["maxViews"]) * 100 if stats["maxViews"] > 0 else 0
    d = (inp["avgDurationSec"] / stats["maxDuration"]) * 100 if stats["maxDuration"] > 0 else 0
    c = (inp["ctaClicks"] / stats["maxCtaClicks"]) * 100 if stats["maxCtaClicks"] > 0 else 0
    return v * 0.4 + d * 0.3 + c * 0.3


def get_quality_grade(score):
    if score >= 80:
        return "excellent"
    if score >= 60:
        return "good"
    if score >= 40:
        return "average"
    if score >= 20:
        return "poor"
    return "critical"


# components/common/quality-badge.tsx QUALITY_GRADES (min 이상이면 해당 라벨)
BADGE_LABELS = [(80, "우수"), (60, "양호"), (40, "보통"), (20, "부진"), (0, "위험")]


def badge_label(score):
    for mn, label in BADGE_LABELS:
        if score >= mn:
            return label
    return BADGE_LABELS[-1][1]


def circle_color(score):
    """components/contents/quality-score.tsx CircularScore 색상 토큰."""
    if score >= 80:
        return "var(--success)"
    if score >= 60:
        return "var(--info)"
    if score >= 40:
        return "var(--warning)"
    return "var(--danger)"


def js_num(x):
    """JS Number → 문자열 (정수값이면 소수점 없이)."""
    if isinstance(x, float) and x.is_integer():
        return str(int(x))
    return repr(x) if isinstance(x, float) else str(x)


def describe(score):
    return {
        "score": score,
        "grade": get_quality_grade(score),
        "gradeLabel": badge_label(score),
        "badgeText": f"{js_num(score)}점 · {badge_label(score)}",
        "circleColor": circle_color(score),
    }


def main():
    ap = argparse.ArgumentParser(description="발행 글 품질 점수(조회·체류·전환 상대 점수)와 등급을 계산한다.")
    ap.add_argument("--input", help="입력 JSON 파일. 없으면 stdin")
    args = ap.parse_args()
    d = json.load(open(args.input, encoding="utf-8")) if args.input else json.load(sys.stdin)
    if "posts" in d:
        posts = d["posts"]
        stats = {
            "maxViews": max((p.get("views", 0) for p in posts), default=0),
            "maxDuration": max((p.get("avgDurationSec", 0) for p in posts), default=0),
            "maxCtaClicks": max((p.get("ctaClicks", 0) for p in posts), default=0),
        }
        out = {"stats": stats, "posts": []}
        for p in posts:
            s = calculate_quality_score(p, stats)
            out["posts"].append({"id": p.get("id"), **describe(s)})
    else:
        out = describe(calculate_quality_score(d["input"], d["stats"]))
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
