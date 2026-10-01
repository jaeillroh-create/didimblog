#!/usr/bin/env python3
"""디딤 블로그 글 건강 점검(업데이트 필요 판정)·법률 키워드 감지 — 원본 TS 포팅.

원본:
  - src/lib/content-health.ts        : THRESHOLDS, LEGAL_KEYWORDS, checkContentHealth(), HEALTH_STATUS_LABELS
  - src/actions/manage.ts            : runHealthCheck(), getHealthCheckContents() (대상 필터·정렬·자동 반영)
  - src/actions/recommendations.ts   : getUpdateNeededPosts() (대시보드 '업데이트 필요' — 현장수첩 60일·기타 90일)
  - src/lib/recommendation-engine.ts : getPrimaryCategoryId() (→ 결정 사항의 categoryNo 합산으로 대체)
  - skills/_DECISIONS.md : 카테고리 정본, 업데이트 주기 매핑(전환형 3개 = 60일), Notion 속성

입력은 contents 컬럼명 또는 Notion "디딤 블로그 콘텐츠" 한글 속성명(상태 'S4 발행완료', 카테고리, categoryNo,
레거시 2차 분류, 발행일, 마지막 업데이트일 …).

사용 예:
  python3 content_health.py check --contents contents.json --now 2026-10-01T00:00:00Z
  python3 content_health.py update-needed --contents contents.json --now 2026-10-01T00:00:00Z
  python3 content_health.py legal-news --contents contents.json --news "조세특례제한법 개정안 국회 통과"
"""
import argparse
import json
import math
import re
import sys
from datetime import datetime, timezone

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


# 원본 content-health.ts THRESHOLDS (CAT-A 60/90, CAT-B 90/120, CAT-C 120/180, 기본 90/120)를
# _DECISIONS.md 카테고리에 매핑: 전환형 3개(25·27·26)=CAT-A 값, 24·28=CAT-B 값, 디딤 다이어리(17)=CAT-C 값
THRESHOLDS_BY_STAT = {25: {"check": 60, "update": 90}, 27: {"check": 60, "update": 90},
                      26: {"check": 60, "update": 90}, 24: {"check": 90, "update": 120},
                      28: {"check": 90, "update": 120}, 17: {"check": 120, "update": 180}}
DEFAULT_THRESHOLD = {"check": 90, "update": 120}


def stat_of(content):
    cat = content_category(content)
    return cat["stat"] if cat else None


def base_date(content):
    """경과일 기준일: 발행일, 단 '마지막 업데이트일'이 더 늦으면 그 날(스킬 보완)."""
    pub = parse_js_date(content.get("published_at"))
    upd = parse_js_date(content.get("last_updated_at"))
    if upd and (pub is None or upd > pub):
        return upd, "마지막 업데이트일"
    return pub, "발행일"

LEGAL_KEYWORDS = [
    "세액공제", "연구소", "벤처인증", "직무발명", "특허법", "법인세", "소득세", "R&D",
    "기업부설연구소", "세무조사", "조세특례제한법", "중소기업기본법",
]

HEALTH_STATUS_LABELS = {
    "HEALTHY": "정상",
    "CHECK_NEEDED": "점검 필요",
    "UPDATE_NEEDED": "업데이트 필요",
    "UPDATED": "업데이트 완료",
}

STATUS_ORDER = {"UPDATE_NEEDED": 0, "CHECK_NEEDED": 1, "HEALTHY": 2, "UPDATED": 3}
DAY_MS = 1000 * 60 * 60 * 24


def load_json(path):
    if path == "-":
        return json.load(sys.stdin)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def parse_js_date(value):
    if value is None or value == "":
        return None
    v = str(value).strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
        return datetime.fromisoformat(v).replace(tzinfo=timezone.utc)
    v = v.replace("Z", "+00:00").replace(" ", "T", 1)
    dt = datetime.fromisoformat(v)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def days_between(now, then):
    return math.floor((now - then).total_seconds() * 1000 / DAY_MS)


def get_primary_category_id(category_id):
    if category_id in ("CAT-A", "CAT-B", "CAT-C"):
        return category_id
    parts = category_id.split("-")
    if len(parts) >= 2:
        return f"{parts[0]}-{parts[1]}"
    return category_id


def check_content_health(content, now):
    """content-health.ts checkContentHealth()."""
    reasons = []
    recommended = "HEALTHY"
    published, base_label = base_date(content)
    days_since_publish = days_between(now, published) if published else 0
    last_check = parse_js_date(content.get("health_checked_at"))
    days_since_last_check = days_between(now, last_check) if last_check else None

    threshold = THRESHOLDS_BY_STAT.get(stat_of(content), DEFAULT_THRESHOLD)
    prefix = "발행 후" if base_label == "발행일" else "마지막 업데이트 후"

    if days_since_publish >= threshold["update"]:
        recommended = "UPDATE_NEEDED"
        reasons.append(f"{prefix} {days_since_publish}일 경과 (업데이트 권장 {threshold['update']}일)")
    elif days_since_publish >= threshold["check"]:
        recommended = "CHECK_NEEDED"
        reasons.append(f"{prefix} {days_since_publish}일 경과 (점검 권장 {threshold['check']}일)")

    body_text = f"{content.get('title') or ''} {content.get('body') or ''} {content.get('target_keyword') or ''}"
    found = [kw for kw in LEGAL_KEYWORDS if kw in body_text]
    has_legal = len(found) > 0
    if has_legal and days_since_publish >= 30:
        if recommended == "HEALTHY":
            recommended = "CHECK_NEEDED"
        reasons.append(f"법률/세무 키워드 포함: {', '.join(found)}")

    if content.get("health_status") == "UPDATED":
        recommended = "HEALTHY"
        reasons = ["최근 업데이트 완료"]

    return {
        "contentId": content.get("id"),
        "title": content.get("title") or "제목 없음",
        "currentStatus": content.get("health_status"),
        "recommendedStatus": recommended,
        "recommendedLabel": HEALTH_STATUS_LABELS[recommended],
        "daysSincePublish": days_since_publish,
        "daysSinceLastCheck": days_since_last_check,
        "reasons": reasons,
        "hasLegalKeywords": has_legal,
        "legalKeywordsFound": found,
        "threshold": threshold,
        "elapsed_from": base_label,
        "category": (content_category(content) or {}).get("stat_name"),
    }


def is_not_deleted(c):
    # .eq("is_deleted", false): NULL 은 제외, 키가 없으면 DB 기본값 false 로 간주
    return c.get("is_deleted", False) is False


def published_filter(c, s4_only):
    ok_status = ("S4",) if s4_only else ("S4", "S5")
    return c.get("status") in ok_status and is_not_deleted(c) and c.get("published_at")


def cmd_check(args):
    contents = [normalize_content(c) for c in load_json(args.contents)]
    now = parse_js_date(args.now) if args.now else datetime.now(timezone.utc)
    targets = contents if args.all else [c for c in contents if published_filter(c, args.s4_only)]
    results = [check_content_health(c, now) for c in targets]
    results.sort(key=lambda r: STATUS_ORDER[r["recommendedStatus"]])  # 안정 정렬 (JS sort 와 동일)
    updates = [{"id": r["contentId"], "health_status": r["recommendedStatus"], "health_checked_at": iso(now)}
               for r in results if r["recommendedStatus"] != r["currentStatus"]]
    problems = [r for r in results if r["recommendedStatus"] in ("CHECK_NEEDED", "UPDATE_NEEDED")]
    print(json.dumps({
        "now": iso(now),
        "summary": f"발행 글 {len(results)}개 중 {len(problems)}개 점검 필요",
        "results": results,
        "auto_updates_runHealthCheck": updates,
        "notion_note": "Notion 에는 건강 상태를 저장하지 않는다. 글을 고쳤으면 '마지막 업데이트일'을 오늘로 쓴다.",
    }, ensure_ascii=False, indent=2))


def cmd_update_needed(args):
    """recommendations.ts getUpdateNeededPosts()."""
    contents = [normalize_content(c) for c in load_json(args.contents)]
    now = parse_js_date(args.now) if args.now else datetime.now(timezone.utc)
    rows = [c for c in contents if published_filter(c, args.s4_only)]
    rows.sort(key=lambda c: parse_js_date(c["published_at"]))
    out = []
    for post in rows:
        base, _ = base_date(post)
        days = days_between(now, base)
        # 원본: 현장수첩(CAT-A) 60일·그 외 90일 → 결정 사항: 전환형 3개(25·27·26) 60일·그 외 90일
        threshold = 60 if stat_of(post) in CONVERSION_STATS else 90
        if days >= threshold or post.get("health_status") in ("CHECK_NEEDED", "UPDATE_NEEDED"):
            out.append({"id": post.get("id"), "title": post.get("title") or "제목 없음",
                        "publishedAt": post["published_at"], "daysSincePublish": days,
                        "categoryId": post.get("category_id") or "", "threshold": threshold})
    print(json.dumps({"now": iso(now), "total_flagged": len(out), "posts": out[:5]},
                     ensure_ascii=False, indent=2))


def cmd_legal_news(args):
    """스킬 추가 기능: 법률 변경 뉴스 → 관련 발행 글 CHECK_NEEDED 후보.
    근거: docs/UPGRADE_SPEC.md §1.3 '법률 변경 뉴스 감지 시: 관련 글 즉시 CHECK_NEEDED 전이'.
    매칭 사전은 content-health.ts LEGAL_KEYWORDS 를 그대로 사용."""
    contents = [normalize_content(c) for c in load_json(args.contents)]
    news_texts = list(args.news or [])
    if args.news_file:
        news_texts.extend(load_json(args.news_file))
    news_join = " ".join(n if isinstance(n, str) else f"{n.get('title', '')} {n.get('description', '')}"
                         for n in news_texts)
    news_kw = [kw for kw in LEGAL_KEYWORDS if kw in news_join]
    hits = []
    for c in contents:
        if c.get("status") not in ("S4", "S5") or not is_not_deleted(c):
            continue
        text = f"{c.get('title') or ''} {c.get('body') or ''} {c.get('target_keyword') or ''}"
        matched = [kw for kw in news_kw if kw in text]
        if matched:
            hits.append({"id": c.get("id"), "title": c.get("title") or "제목 없음", "matched": matched,
                         "current_health_status": c.get("health_status") or "HEALTHY",
                         "recommended_health_status": "CHECK_NEEDED"
                         if (c.get("health_status") or "HEALTHY") in ("HEALTHY", "UPDATED") else c.get("health_status")})
    hits.sort(key=lambda h: -len(h["matched"]))
    print(json.dumps({"news_legal_keywords": news_kw, "affected_posts": hits},
                     ensure_ascii=False, indent=2))


def main():
    p = argparse.ArgumentParser(description="디딤 블로그 글 건강 점검·업데이트 필요 글·법률 뉴스 영향 글 — JSON 출력")
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("check", help="건강 점검(카테고리별 점검/업데이트 임계값 + 법률 키워드)")
    c.add_argument("--contents", required=True, help="콘텐츠 JSON 배열('-'=stdin)")
    c.add_argument("--now", help="기준 시각 ISO (기본: 현재 UTC)")
    c.add_argument("--all", action="store_true", help="상태 필터 없이 전체 입력을 점검")
    c.add_argument("--s4-only", action="store_true", help="원본처럼 S4 만 점검(기본: S4·S5)")
    c.set_defaults(func=cmd_check)

    u = sub.add_parser("update-needed", help="대시보드 '업데이트 필요 글' (현장수첩 60일·기타 90일, 최대 5건)")
    u.add_argument("--contents", required=True)
    u.add_argument("--now")
    u.add_argument("--s4-only", action="store_true", help="원본처럼 S4 만(기본: S4·S5)")
    u.set_defaults(func=cmd_update_needed)

    l = sub.add_parser("legal-news", help="법률 변경 뉴스와 같은 법률 키워드를 가진 발행 글 찾기(스킬 추가)")
    l.add_argument("--contents", required=True)
    l.add_argument("--news", action="append", help="뉴스 제목/요약 텍스트(여러 번 지정 가능)")
    l.add_argument("--news-file", help="뉴스 JSON 배열 파일([{title, description}] 또는 문자열 배열)")
    l.set_defaults(func=cmd_legal_news)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
