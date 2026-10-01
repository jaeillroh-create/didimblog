#!/usr/bin/env python3
"""디딤 블로그 내부 링크 추천 — src/lib/internal-link-recommender.ts 포팅.

점수 (calculateRelevance):
  같은 1차 카테고리 +20 / 같은 2차 분류 +15
  키워드: 동일 타겟 키워드 +30, 아니면 대상 제목에 키워드 포함 +25, 아니면 대상 본문에 포함 +15
  공통 태그 1개당 +10 / 대상 월간 조회수(views_1m) > 500 이면 +10 (인기글)
후보: 자기 자신 제외, 삭제 안 된, status S4/S5 글. 점수 > 0 만, 내림차순, 최대 5개.

사용 예:
  python3 internal_links.py --source source.json --contents contents.json [--max 5]
  (source 를 contents 안의 id 로 지정: --source-id W40-01)
"""
import argparse
import json
import sys


def load_json(path):
    if path == "-":
        return json.load(sys.stdin)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_primary_category_id(category_id):
    if category_id in ("CAT-A", "CAT-B", "CAT-C"):
        return category_id
    parts = category_id.split("-")
    if len(parts) >= 2:
        return f"{parts[0]}-{parts[1]}"
    return category_id


def calculate_relevance(source, target):
    score = 0
    reasons = []
    if get_primary_category_id(source.get("category_id") or "") == get_primary_category_id(target.get("category_id") or ""):
        score += 20
        reasons.append("같은 카테고리")
    if source.get("secondary_category") and source.get("secondary_category") == target.get("secondary_category"):
        score += 15
        reasons.append("같은 2차 분류")

    source_kw = (source.get("target_keyword") or "").lower()
    target_title = (target.get("title") or "").lower()
    target_body = (target.get("body") or "").lower()
    target_kw = (target.get("target_keyword") or "").lower()
    if source_kw and target_kw and source_kw == target_kw:
        score += 30
        reasons.append("동일 타겟 키워드")
    elif source_kw and source_kw in target_title:
        score += 25
        reasons.append("제목에 키워드 포함")
    elif source_kw and source_kw in target_body:
        score += 15
        reasons.append("본문에 키워드 포함")

    source_tags = {t.lower() for t in (source.get("tags") or [])}
    target_tags = [t.lower() for t in (target.get("tags") or [])]
    common = [t for t in target_tags if t in source_tags]
    if common:
        score += len(common) * 10
        reasons.append(f"공통 태그 {len(common)}개")

    views = target.get("views_1m")
    if views and views > 500:
        score += 10
        reasons.append("인기글")
    return score, ", ".join(reasons)


def recommend_internal_links(source, all_contents, max_results=5):
    candidates = [c for c in all_contents
                  if c.get("id") != source.get("id") and not c.get("is_deleted")
                  and c.get("status") in ("S4", "S5")]
    scored = []
    for t in candidates:
        s, r = calculate_relevance(source, t)
        scored.append({"contentId": t.get("id"), "title": t.get("title") or "제목 없음",
                       "relevanceScore": s, "reason": r, "categoryId": t.get("category_id") or ""})
    scored = [s for s in scored if s["relevanceScore"] > 0]
    scored.sort(key=lambda s: -s["relevanceScore"])  # 안정 정렬
    return scored[:max_results]


def main():
    p = argparse.ArgumentParser(description="디딤 블로그 내부 링크 추천 — JSON 입출력")
    p.add_argument("--contents", required=True, help="후보 콘텐츠 JSON 배열('-'=stdin)")
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--source", help="기준 글 JSON 파일")
    g.add_argument("--source-id", help="contents 안의 기준 글 id")
    p.add_argument("--max", type=int, default=5, help="최대 추천 수(기본 5)")
    args = p.parse_args()

    contents = load_json(args.contents)
    if args.source:
        source = load_json(args.source)
    else:
        source = next((c for c in contents if c.get("id") == args.source_id), None)
        if source is None:
            print(json.dumps({"error": f"id {args.source_id} 를 찾을 수 없습니다."}, ensure_ascii=False))
            sys.exit(1)
    result = recommend_internal_links(source, contents, args.max)
    print(json.dumps({"source": source.get("id"), "suggestions": result,
                      "guide": "SEO 권장 항목: 내부 링크 2~3개. 상위 2~3개를 본문 관련 문단에 삽입하세요."},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
