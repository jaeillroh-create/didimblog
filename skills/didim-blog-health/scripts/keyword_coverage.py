#!/usr/bin/env python3
"""디딤 블로그 키워드 커버리지·시리즈 진행률 — 원본 TS 포팅 + 스킬 보완.

원본:
  - src/actions/manage.ts : getKeywordCoverage() (정렬·커버 판정·통계), getSeriesList() (등록/발행 수)
  - src/components/manage/keyword-coverage-tab.tsx : 커버리지 % (반올림), 색상 구간(80%/50%), 카테고리별 그룹
  - src/components/manage/series-tab.tsx : 진행률 = round(발행 / 계획 × 100)
  - docs/UPGRADE_SPEC.md §4.4 : keyword_pool 초기 시드 19개 (DB 실제 내용은 확인 필요)
  - skills/_DECISIONS.md : 레거시 카테고리를 신규 카테고리로 합산(절세·인증·연구소→지원사업·인증과 특허,
    AI와 IP·특허 전략 노트→지식재산 경영, IP 뉴스 한 입→디딤 소식), Notion 시리즈·시리즈 회차

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

# ── 카테고리 정본 (skills/_DECISIONS.md §1·§2: 네이버 categoryNo = 정본 ID) ──
CATEGORY_TABLE = {
    25: {"name": "지원사업·인증과 특허", "parent": None, "group": "new", "role": "전환형"},
    27: {"name": "출원·심판 실무", "parent": None, "group": "new", "role": "전환형"},
    26: {"name": "사례", "parent": None, "group": "new", "role": "전환형"},
    24: {"name": "지식재산 경영", "parent": None, "group": "new", "role": "브랜딩"},
    28: {"name": "디딤 소식", "parent": None, "group": "new", "role": "트래픽"},
    17: {"name": "디딤 다이어리", "parent": None, "group": "keep", "role": "신뢰"},
    18: {"name": "컨설팅 후기", "parent": 17, "group": "keep", "role": "신뢰"},
    19: {"name": "디딤 일상", "parent": 17, "group": "keep", "role": "신뢰"},
    20: {"name": "대표의 생각", "parent": 17, "group": "keep", "role": "신뢰"},
    7: {"name": "디딤 소개", "parent": None, "group": "fixed", "role": "고정"},
    22: {"name": "상담 안내", "parent": None, "group": "fixed", "role": "고정"},
    9: {"name": "변리사의 현장 수첩", "parent": None, "group": "legacy", "role": "전환형"},
    10: {"name": "절세 시뮬레이션", "parent": 9, "group": "legacy", "role": "전환형"},
    11: {"name": "인증 가이드", "parent": 9, "group": "legacy", "role": "전환형"},
    12: {"name": "연구소 운영 실무", "parent": 9, "group": "legacy", "role": "전환형"},
    23: {"name": "특허·상표 출원 실무", "parent": 9, "group": "legacy", "role": "전환형"},
    13: {"name": "IP 라운지", "parent": None, "group": "legacy", "role": "트래픽"},
    14: {"name": "특허 전략 노트", "parent": 13, "group": "legacy", "role": "트래픽"},
    15: {"name": "AI와 IP", "parent": 13, "group": "legacy", "role": "트래픽"},
    16: {"name": "IP 뉴스 한 입", "parent": 13, "group": "legacy", "role": "트래픽"},
}
# 통계·추천 합산용 신규 카테고리 (DECISIONS §2 '레거시에서 흡수' 열)
STAT_CATEGORY = {9: 25, 10: 25, 11: 25, 12: 25, 23: 27, 18: 26, 13: 24, 14: 24, 15: 24, 16: 28, 19: 17, 20: 17}
# 레거시 별칭(백오피스 CAT-*, supabase/seed.sql 기준) → categoryNo
LEGACY_ALIAS = {"CAT-A": 9, "CAT-A-01": 10, "CAT-A-02": 11, "CAT-A-03": 12, "CAT-A-04": 23,
                "CAT-B": 13, "CAT-B-01": 15, "CAT-B-02": 14, "CAT-B-03": 16,
                "CAT-C": 17, "CAT-C-01": 18, "CAT-C-02": 19, "CAT-C-03": 20,
                "CAT-INTRO": 7, "CAT-CONSULT": 22}
NAME_ALIAS = {"현장 수첩": 9, "현장수첩": 9, "연구소 운영": 12, "IP라운지": 13, "디딤다이어리": 17}
CONVERSION_STATS = {25, 27, 26}  # 전환형 3개 (DECISIONS: 업데이트 주기 60일)


def resolve_category(value):
    """categoryNo(정수/문자열)·이름·CAT-* 별칭 → 카테고리 정보 dict (모르면 None)."""
    if value is None or value == "":
        return None
    no = None
    if isinstance(value, int) or (isinstance(value, str) and value.strip().isdigit()):
        no = int(value)
    elif isinstance(value, str):
        v = value.strip()
        if v.upper().startswith("CAT-"):
            no = LEGACY_ALIAS.get(v.upper())
        else:
            no = next((k for k, c in CATEGORY_TABLE.items() if c["name"] == v), None) or NAME_ALIAS.get(v)
    if no is None or no not in CATEGORY_TABLE:
        return None
    c = CATEGORY_TABLE[no]
    top = c["parent"] or no
    stat = STAT_CATEGORY.get(no, no if c["group"] in ("new", "keep") else None)
    return {"no": no, "name": c["name"], "top": top, "top_name": CATEGORY_TABLE[top]["name"],
            "stat": stat, "stat_name": CATEGORY_TABLE[stat]["name"] if stat else None,
            "group": c["group"], "is_diary": top == 17, "is_fixed": c["group"] == "fixed",
            "is_sub": c["parent"] is not None}


def content_category(c):
    # Notion: 카테고리="레거시" 이면 "레거시 2차 분류" 값(원래 이름)으로 판정
    if c.get("category_name") == "레거시" or c.get("카테고리") == "레거시":
        r = resolve_category(c.get("legacy_sub") or c.get("레거시 2차 분류"))
        if r:
            return r
    for key in ("category_no", "categoryNo", "category_id", "category_name", "category", "카테고리"):
        r = resolve_category(c.get(key))
        if r:
            return r
    return None


# ── Notion "디딤 블로그 콘텐츠" (data source collection://463bc815-11ab-4290-9d86-22bd1aa9cfed) 속성 → 내부 키 ──
# 본문·태그·콘텐츠 ID 는 DB 속성이 아니다(본문=페이지 내용). 대화에서 받은 값을 같은 키로 넣으면 된다.
NOTION_KEYS = {
    "콘텐츠 ID": "id", "제목": "title", "레거시 2차 분류": "legacy_sub", "상담": "consultations", "상태": "status", "카테고리": "category_name",
    "categoryNo": "category_no", "타깃 키워드": "target_keyword",
    "발행예정일": "publish_date",  # SLA 역산·캘린더 기준 (초안 단계부터 기입)
    "발행일": "published_at",      # 실제 발행 후에만 기입
    "발행 URL": "naver_url", "추천 소스": "rec_source", "추천 피드백": "rec_feedback",
    "부적합 사유": "rec_reject_reason", "조회수(최근)": "views_recent", "유입 키워드 TOP3": "top_keywords",
    "댓글 수": "comments", "성과 갱신일": "metrics_updated_at", "시리즈": "series_name",
    "시리즈 회차": "series_order", "마지막 업데이트일": "last_updated_at", "메모": "notes",
    "본문": "body", "태그": "tags", "삭제됨": "is_deleted",
}
STATUS_FULL = {"S0": "S0 기획중", "S1": "S1 초안완료", "S2": "S2 검토완료", "S3": "S3 발행예정",
               "S4": "S4 발행완료", "S5": "S5 성과측정"}  # Notion "상태" 선택지 값 그대로
STATUS_NAMES = {"기획중": "S0", "초안완료": "S1", "검토완료": "S2", "발행예정": "S3", "발행완료": "S4", "성과측정": "S5"}


def normalize_content(c):
    """Notion 한글 속성명 행도 받아 contents 컬럼명으로 맞춘다(원래 키가 있으면 유지)."""
    out = dict(c)
    for k, v in c.items():
        if k in NOTION_KEYS and NOTION_KEYS[k] not in c:
            out[NOTION_KEYS[k]] = v
    st = out.get("status")
    if isinstance(st, str):
        s = st.strip()
        if len(s) >= 2 and s[0] in "Ss" and s[1].isdigit():
            out["status"] = "S" + s[1]
        elif s in STATUS_NAMES:
            out["status"] = STATUS_NAMES[s]
    if isinstance(out.get("tags"), str):
        out["tags"] = [t.strip() for t in out["tags"].replace("#", ",").split(",") if t.strip()]
    if out.get("status") in ("S4", "S5") and not out.get("published_at") and out.get("publish_date"):
        out["published_at"] = out["publish_date"]  # 발행일 미기입 시 발행예정일로 대체
    if out.get("views_1m") is None and out.get("views_recent") is not None:
        out["views_1m"] = out["views_recent"]
    return out


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


def keyword_stat_category(kw):
    """키워드의 집계 카테고리: sub_category_id → category_id 순으로 해석해 신규 카테고리로 합산."""
    for key in ("sub_category_id", "sub_category", "category_no", "category_id", "category"):
        r = resolve_category(kw.get(key))
        if r and r["stat"]:
            return r["stat"]
    return None


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
    contents = [normalize_content(c) for c in load_json(args.contents)] if args.contents else []
    keywords = load_json(args.keywords) if args.keywords else seed_keywords()
    # .order("priority", asc).order("category_id", asc) — 텍스트 정렬이므로 HIGH, LOW, MEDIUM 순
    keywords = sorted(keywords, key=lambda k: (k.get("priority") or "", k.get("category_id") or ""))
    by_id = {(c.get("id") or c.get("title")): c for c in contents}

    data = []
    for kw in keywords:
        covered = None
        match_rule = None
        cid = kw.get("covered_content_id")
        if cid:
            c = by_id.get(cid)
            covered = {"id": cid, "title": c.get("title") or "제목 없음"} if c else None
            match_rule = "covered_content_id" if c else "covered_content_id(콘텐츠 없음 → 미커버 처리)"
        elif args.auto_match:
            c, rule = auto_match(kw.get("keyword") or "", contents)
            if c:
                covered = {"id": c.get("id") or c.get("title"), "title": c.get("title") or "제목 없음"}
                match_rule = f"auto:{rule}"
        data.append({"keyword": kw, "coveredContent": covered, "matchRule": match_rule})

    total = len(data)
    covered_n = sum(1 for d in data if d["coveredContent"] is not None)
    pct = js_round(covered_n / total * 100) if total > 0 else 0
    band = "success(초록)" if pct >= 80 else ("brand(네이비)" if pct >= 50 else "red(빨강)")

    groups = {}
    for d in data:
        stat = keyword_stat_category(d["keyword"])
        cat = str(stat) if stat else (d["keyword"].get("category_id") or "미분류")
        label = CATEGORY_TABLE[stat]["name"] if stat else CATEGORY_LABELS.get(cat, cat)
        g = groups.setdefault(cat, {"label": label, "covered": 0, "total": 0, "items": []})
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
    series_list = load_json(args.series) if args.series else []
    contents = [normalize_content(c) for c in load_json(args.contents)]
    # Notion: 시리즈(텍스트)·시리즈 회차 → series_id·series_order. 계획 편수는 --series 로 받는다.
    for c in contents:
        if c.get("series_id") is None and c.get("series_name"):
            c["series_id"] = c["series_name"]
    known = {s.get("id") or s.get("name") for s in series_list}
    for name in sorted({c["series_id"] for c in contents if c.get("series_id")} - known):
        series_list.append({"id": name, "name": name, "total_planned": 0, "created_at": ""})
    series_list = sorted(series_list, key=lambda s: s.get("created_at") or "", reverse=True)
    out = []
    for s in series_list:
        sid = s.get("id") or s.get("name")
        mine = [c for c in contents if c.get("series_id") in (sid, s.get("name"))
                and c.get("is_deleted", False) is False]
        content_count = len(mine)
        # 원본은 S4 만 발행으로 센다. 스킬은 S4·S5 (원본 동작은 --s4-only)
        pub_status = ("S4",) if args.s4_only else ("S4", "S5")
        published_count = sum(1 for c in mine if c.get("status") in pub_status)
        planned = s.get("total_planned") or 0
        progress = js_round(published_count / planned * 100) if planned > 0 else 0
        ordered = sorted(mine, key=lambda c: (c.get("series_order") is None, c.get("series_order") or 0))
        # 스킬 보완: 다음 편(계획 대비 미등록/미발행) 안내
        orders = [c.get("series_order") for c in mine if c.get("series_order") is not None]
        next_order = (max(orders) + 1) if orders else 1
        unpublished = [{"id": c.get("id") or c.get("title"), "order": c.get("series_order"), "status": c.get("status")}
                       for c in ordered if c.get("status") not in ("S4", "S5")]
        out.append({
            "id": sid, "name": s.get("name"), "total_planned": planned,
            "planned_missing": planned == 0,
            "contentCount": content_count, "publishedCount": published_count,
            "progress_percent": progress, "bar_width_percent": min(progress, 100),
            "label": f"발행 {published_count} / 계획 {planned}편 · 전체 등록 {content_count}편",
            "episodes": [{"order": c.get("series_order"), "id": c.get("id") or c.get("title"), "title": c.get("title"),
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
    s.add_argument("--series", help="[{id 또는 name, total_planned, created_at}] (Notion 에는 계획 편수 열이 없어 사용자 입력)")
    s.add_argument("--contents", required=True, help="series_id·series_order 또는 Notion 시리즈·시리즈 회차가 있는 콘텐츠 배열")
    s.add_argument("--s4-only", action="store_true", help="원본처럼 S4 만 발행으로 집계")
    s.set_defaults(func=cmd_series)

    sd = sub.add_parser("seed", help="기본 키워드 풀(UPGRADE_SPEC §4.4) 출력")
    sd.set_defaults(func=cmd_seed)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
