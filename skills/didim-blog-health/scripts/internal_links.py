#!/usr/bin/env python3
"""디딤 블로그 내부 링크 추천 — src/lib/internal-link-recommender.ts 포팅.

점수 (calculateRelevance):
  같은 1차 카테고리 +20 (결정 사항: 레거시는 신규 카테고리로 합산한 categoryNo 로 비교) / 같은 2차 분류 +15
  키워드: 동일 타겟 키워드 +30, 아니면 대상 제목에 키워드 포함 +25, 아니면 대상 본문에 포함 +15
  공통 태그 1개당 +10 / 대상 월간 조회수(views_1m) > 500 이면 +10 (인기글)
후보: 자기 자신 제외, 삭제 안 된, status S4/S5 글. 점수 > 0 만, 내림차순, 최대 5개.

사용 예:
  python3 internal_links.py --source source.json --contents contents.json [--max 5]
  (source 를 contents 안의 id 또는 제목으로 지정: --source-id W40-01)
입력은 contents 컬럼명 또는 Notion 한글 속성명(제목·상태·카테고리·categoryNo·2차 분류·타깃 키워드·조회수(최근)·발행 URL).
"""
import argparse
import json
import sys


def load_json(path):
    if path == "-":
        return json.load(sys.stdin)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


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
    # Notion: 카테고리="레거시" 이면 "2차 분류" 값(원래 이름)으로 판정
    if c.get("category_name") == "레거시" or c.get("카테고리") == "레거시":
        r = resolve_category(c.get("legacy_sub") or c.get("2차 분류"))
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
    "콘텐츠 ID": "id", "제목": "title", "2차 분류": "legacy_sub", "상담": "consultations", "상태": "status", "카테고리": "category_name",
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


def primary_key(c):
    """원본 getPrimaryCategoryId(CAT-A-01→CAT-A) 대신 결정 사항의 합산 카테고리(categoryNo)."""
    cat = content_category(c)
    if cat and cat["stat"]:
        return cat["stat"]
    return get_primary_category_id(c.get("category_id") or "")


def secondary_key(c):
    if c.get("secondary_category"):
        return c["secondary_category"]
    cat = content_category(c)
    return cat["name"] if cat and cat["is_sub"] else None


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
    if primary_key(source) == primary_key(target):
        score += 20
        reasons.append("같은 카테고리")
    if secondary_key(source) and secondary_key(source) == secondary_key(target):
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
    def ident(c):  # Notion 행은 id 가 없으므로 제목으로 식별
        return c.get("id") or c.get("title")

    candidates = [c for c in all_contents
                  if ident(c) != ident(source) and not c.get("is_deleted")
                  and c.get("status") in ("S4", "S5")]
    scored = []
    for t in candidates:
        s, r = calculate_relevance(source, t)
        scored.append({"contentId": t.get("id") or t.get("title"), "url": t.get("naver_url"), "title": t.get("title") or "제목 없음",
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

    contents = [normalize_content(c) for c in load_json(args.contents)]
    if args.source:
        source = normalize_content(load_json(args.source))
    else:
        source = next((c for c in contents if c.get("id") == args.source_id or c.get("title") == args.source_id), None)
        if source is None:
            print(json.dumps({"error": f"id {args.source_id} 를 찾을 수 없습니다."}, ensure_ascii=False))
            sys.exit(1)
    result = recommend_internal_links(source, contents, args.max)
    print(json.dumps({"source": source.get("id"), "suggestions": result,
                      "guide": "SEO 권장 항목: 내부 링크 2~3개. 상위 2~3개를 본문 관련 문단에 삽입하세요."},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
