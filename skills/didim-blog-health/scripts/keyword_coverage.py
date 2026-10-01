#!/usr/bin/env python3
"""디딤 블로그 키워드 커버리지·시리즈 진행률 — 원본 TS 포팅 + 스킬 보완.

원본:
  - src/actions/manage.ts : getKeywordCoverage() (정렬·커버 판정·통계), getSeriesList() (등록/발행 수)
  - src/components/manage/keyword-coverage-tab.tsx : 커버리지 % (반올림), 색상 구간(80%/50%), 카테고리별 그룹
  - src/components/manage/series-tab.tsx : 진행률 = round(발행 / 계획 × 100)
  - docs/UPGRADE_SPEC.md §4.4 : keyword_pool 초기 시드 19개 (DB 실제 내용은 확인 필요)

스킬 보완(원본에 없음, spec 8절 참조):
  --auto-match : covered_content_id 가 비어 있는 키워드를 발행 글(S4/S5)과 자동 매칭
                 (target_keyword 일치 → 제목 포함 → 태그 일치 순)

사용 예:
  python3 keyword_coverage.py coverage --contents contents.json [--keywords pool.json] [--auto-match]
  python3 keyword_coverage.py series --series series.json --contents contents.json
  python3 keyword_coverage.py seed
"""
import argparse
import json
import math
import sys

CATEGORY_LABELS = {"CAT-A": "변리사의 현장 수첩", "CAT-B": "IP 라운지", "CAT-C": "디딤 다이어리"}
CATEGORY_NAME_TO_ID = {"변리사의 현장 수첩": "CAT-A", "IP 라운지": "CAT-B", "디딤 다이어리": "CAT-C"}
SUB_NAME_TO_ID = {"절세 시뮬레이션": "CAT-A-01", "인증 가이드": "CAT-A-02", "연구소 운영 실무": "CAT-A-03",
                  "AI와 IP": "CAT-B-01", "특허 전략 노트": "CAT-B-02", "IP 뉴스 한 입": "CAT-B-03"}

# docs/UPGRADE_SPEC.md §4.4 시드 (keyword, category, sub_category, priority)
SEED_POOL = [
    ("직무발명보상금 절세", "변리사의 현장 수첩", "절세 시뮬레이션", "HIGH"),
    ("법인세 줄이는 방법", "변리사의 현장 수첩", "절세 시뮬레이션", "HIGH"),
    ("대표이사 직무발명보상금", "변리사의 현장 수첩", "절세 시뮬레이션", "HIGH"),
    ("기업부설연구소 세액공제", "변리사의 현장 수첩", "연구소 운영 실무", "HIGH"),
    ("연구소 세무조사", "변리사의 현장 수첩", "연구소 운영 실무", "HIGH"),
    ("R&D 세액공제 환수", "변리사의 현장 수첩", "연구소 운영 실무", "HIGH"),
    ("벤처기업인증 혜택", "변리사의 현장 수첩", "인증 가이드", "MEDIUM"),
    ("벤처인증 방법", "변리사의 현장 수첩", "인증 가이드", "MEDIUM"),
    ("기업부설연구소 설립 방법", "변리사의 현장 수첩", "인증 가이드", "MEDIUM"),
    ("미처분이익잉여금 정리", "변리사의 현장 수첩", "절세 시뮬레이션", "MEDIUM"),
    ("직무발명보상금 vs 상여금", "변리사의 현장 수첩", "절세 시뮬레이션", "MEDIUM"),
    ("AI 특허 출원", "IP 라운지", "AI와 IP", "MEDIUM"),
    ("생성형 AI 저작권", "IP 라운지", "AI와 IP", "MEDIUM"),
    ("인공지능 기본법", "IP 라운지", "AI와 IP", "MEDIUM"),
    ("스타트업 특허 전략", "IP 라운지", "특허 전략 노트", "MEDIUM"),
    ("기술유출 방지", "IP 라운지", "특허 전략 노트", "LOW"),
    ("특허 가치평가", "IP 라운지", "특허 전략 노트", "LOW"),
    ("직무발명 소송 사례", "IP 라운지", "IP 뉴스 한 입", "MEDIUM"),
    ("중국 상표 선점", "IP 라운지", "IP 뉴스 한 입", "LOW"),
]

# recommendations.ts pickWeightedKeyword(): 추천 시 우선순위 선택 확률 (매출 가중치)
PRIORITY_WEIGHT = {"HIGH": 0.5, "MEDIUM": 0.3, "LOW": 0.2}


def load_json(path):
    if path == "-":
        return json.load(sys.stdin)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def seed_keywords():
    return [{"id": f"seed-{i + 1:02d}", "keyword": kw, "category_id": CATEGORY_NAME_TO_ID[cat],
             "sub_category_id": SUB_NAME_TO_ID.get(sub), "priority": pr, "covered_content_id": None}
            for i, (kw, cat, sub, pr) in enumerate(SEED_POOL)]


def js_round(x):
    return math.floor(x + 0.5)


def auto_match(keyword, contents):
    k = keyword.strip().lower()
    published = [c for c in contents if c.get("status") in ("S4", "S5") and not c.get("is_deleted")]
    for rule, test in (
        ("target_keyword 일치", lambda c: (c.get("target_keyword") or "").strip().lower() == k),
        ("제목 포함", lambda c: k in (c.get("title") or "").lower()),
        ("태그 일치", lambda c: k in [t.strip().lower() for t in (c.get("tags") or [])]),
    ):
        for c in published:
            if test(c):
                return c, rule
    return None, None


def cmd_coverage(args):
    contents = load_json(args.contents) if args.contents else []
    keywords = load_json(args.keywords) if args.keywords else seed_keywords()
    # .order("priority", asc).order("category_id", asc) — 텍스트 정렬이므로 HIGH, LOW, MEDIUM 순
    keywords = sorted(keywords, key=lambda k: (k.get("priority") or "", k.get("category_id") or ""))
    by_id = {c.get("id"): c for c in contents}

    data = []
    for kw in keywords:
        covered = None
        match_rule = None
        cid = kw.get("covered_content_id")
        if cid:
            c = by_id.get(cid)
            covered = {"id": c["id"], "title": c.get("title") or "제목 없음"} if c else None
            match_rule = "covered_content_id" if c else "covered_content_id(콘텐츠 없음 → 미커버 처리)"
        elif args.auto_match:
            c, rule = auto_match(kw.get("keyword") or "", contents)
            if c:
                covered = {"id": c["id"], "title": c.get("title") or "제목 없음"}
                match_rule = f"auto:{rule}"
        data.append({"keyword": kw, "coveredContent": covered, "matchRule": match_rule})

    total = len(data)
    covered_n = sum(1 for d in data if d["coveredContent"] is not None)
    pct = js_round(covered_n / total * 100) if total > 0 else 0
    band = "success(초록)" if pct >= 80 else ("brand(네이비)" if pct >= 50 else "red(빨강)")

    groups = {}
    for d in data:
        cat = d["keyword"].get("category_id")
        g = groups.setdefault(cat, {"label": CATEGORY_LABELS.get(cat, cat), "covered": 0, "total": 0, "items": []})
        g["total"] += 1
        g["covered"] += 1 if d["coveredContent"] else 0
        g["items"].append(d)

    by_priority = {}
    for pr in ("HIGH", "MEDIUM", "LOW"):
        items = [d for d in data if d["keyword"].get("priority") == pr]
        by_priority[pr] = {"total": len(items),
                           "covered": sum(1 for d in items if d["coveredContent"]),
                           "uncovered_keywords": [d["keyword"]["keyword"] for d in items if not d["coveredContent"]],
                           "recommendation_weight": PRIORITY_WEIGHT[pr]}

    updates = [{"keyword_id": d["keyword"].get("id"), "covered_content_id": d["coveredContent"]["id"]}
               for d in data if d["matchRule"] and d["matchRule"].startswith("auto:")]
    print(json.dumps({
        "stats": {"total": total, "covered": covered_n, "uncovered": total - covered_n},
        "coverage_percent": pct, "color_band": band,
        "by_category": groups, "by_priority": by_priority,
        "auto_match_updates": updates,
        "keyword_source": args.keywords or "UPGRADE_SPEC §4.4 시드(19개) — 실제 DB 키워드 풀은 확인 필요",
    }, ensure_ascii=False, indent=2))


def cmd_series(args):
    """manage.ts getSeriesList() + series-tab.tsx 진행률."""
    series_list = load_json(args.series)
    contents = load_json(args.contents)
    series_list = sorted(series_list, key=lambda s: s.get("created_at") or "", reverse=True)
    out = []
    for s in series_list:
        mine = [c for c in contents if c.get("series_id") == s.get("id") and c.get("is_deleted", False) is False]
        content_count = len(mine)
        published_count = sum(1 for c in mine if c.get("status") == "S4")
        planned = s.get("total_planned") or 0
        progress = js_round(published_count / planned * 100) if planned > 0 else 0
        ordered = sorted(mine, key=lambda c: (c.get("series_order") is None, c.get("series_order") or 0))
        # 스킬 보완: 다음 편(계획 대비 미등록/미발행) 안내
        orders = [c.get("series_order") for c in mine if c.get("series_order") is not None]
        next_order = (max(orders) + 1) if orders else 1
        unpublished = [{"id": c.get("id"), "order": c.get("series_order"), "status": c.get("status")}
                       for c in ordered if c.get("status") not in ("S4", "S5")]
        out.append({
            "id": s.get("id"), "name": s.get("name"), "total_planned": planned,
            "contentCount": content_count, "publishedCount": published_count,
            "progress_percent": progress, "bar_width_percent": min(progress, 100),
            "label": f"발행 {published_count} / 계획 {planned}편 · 전체 등록 {content_count}편",
            "episodes": [{"order": c.get("series_order"), "id": c.get("id"), "title": c.get("title"),
                          "status": c.get("status")} for c in ordered],
            "next_episode_order": next_order if next_order <= planned else None,
            "unpublished_registered": unpublished,
        })
    print(json.dumps({"series": out}, ensure_ascii=False, indent=2))


def cmd_seed(args):
    print(json.dumps(seed_keywords(), ensure_ascii=False, indent=2))


def main():
    p = argparse.ArgumentParser(description="디딤 블로그 키워드 커버리지·시리즈 진행률 — JSON 입출력")
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("coverage", help="키워드 풀 vs 발행 글 커버리지")
    c.add_argument("--contents", help="콘텐츠 JSON 배열(커버 글 제목 조회·자동 매칭용)")
    c.add_argument("--keywords", help="keyword_pool JSON 배열(생략 시 UPGRADE_SPEC 시드 19개)")
    c.add_argument("--auto-match", action="store_true", help="미지정 키워드를 발행 글과 자동 매칭(스킬 보완)")
    c.set_defaults(func=cmd_coverage)

    s = sub.add_parser("series", help="시리즈 진행률(발행 S4 / 계획 편수)")
    s.add_argument("--series", required=True, help="[{id,name,total_planned,created_at}]")
    s.add_argument("--contents", required=True, help="series_id·series_order 가 있는 콘텐츠 배열")
    s.set_defaults(func=cmd_series)

    sd = sub.add_parser("seed", help="기본 키워드 풀(UPGRADE_SPEC §4.4) 출력")
    sd.set_defaults(func=cmd_seed)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
