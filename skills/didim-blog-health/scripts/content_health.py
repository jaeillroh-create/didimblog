#!/usr/bin/env python3
"""디딤 블로그 글 건강 점검(업데이트 필요 판정)·법률 키워드 감지 — 원본 TS 포팅.

원본:
  - src/lib/content-health.ts        : THRESHOLDS, LEGAL_KEYWORDS, checkContentHealth(), HEALTH_STATUS_LABELS
  - src/actions/manage.ts            : runHealthCheck(), getHealthCheckContents() (대상 필터·정렬·자동 반영)
  - src/actions/recommendations.ts   : getUpdateNeededPosts() (대시보드 '업데이트 필요' — 현장수첩 60일·기타 90일)
  - src/lib/recommendation-engine.ts : getPrimaryCategoryId()

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

THRESHOLDS = {
    "CAT-A": {"check": 60, "update": 90},
    "CAT-B": {"check": 90, "update": 120},
    "CAT-C": {"check": 120, "update": 180},
}
DEFAULT_THRESHOLD = {"check": 90, "update": 120}

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
    published = parse_js_date(content.get("published_at"))
    days_since_publish = days_between(now, published) if published else 0
    last_check = parse_js_date(content.get("health_checked_at"))
    days_since_last_check = days_between(now, last_check) if last_check else None

    primary = get_primary_category_id(content.get("category_id") or "")
    threshold = THRESHOLDS.get(primary, DEFAULT_THRESHOLD)

    if days_since_publish >= threshold["update"]:
        recommended = "UPDATE_NEEDED"
        reasons.append(f"발행 후 {days_since_publish}일 경과 (업데이트 권장 {threshold['update']}일)")
    elif days_since_publish >= threshold["check"]:
        recommended = "CHECK_NEEDED"
        reasons.append(f"발행 후 {days_since_publish}일 경과 (점검 권장 {threshold['check']}일)")

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
    }


def is_not_deleted(c):
    # .eq("is_deleted", false): NULL 은 제외, 키가 없으면 DB 기본값 false 로 간주
    return c.get("is_deleted", False) is False


def cmd_check(args):
    contents = load_json(args.contents)
    now = parse_js_date(args.now) if args.now else datetime.now(timezone.utc)
    targets = contents if args.all else [
        c for c in contents
        if c.get("status") == "S4" and is_not_deleted(c) and c.get("published_at")
    ]
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
    }, ensure_ascii=False, indent=2))


def cmd_update_needed(args):
    """recommendations.ts getUpdateNeededPosts()."""
    contents = load_json(args.contents)
    now = parse_js_date(args.now) if args.now else datetime.now(timezone.utc)
    rows = [c for c in contents if c.get("status") == "S4" and is_not_deleted(c) and c.get("published_at")]
    rows.sort(key=lambda c: parse_js_date(c["published_at"]))
    out = []
    for post in rows:
        days = days_between(now, parse_js_date(post["published_at"]))
        primary = get_primary_category_id(post.get("category_id") or "")
        threshold = 60 if primary == "CAT-A" else 90
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
    contents = load_json(args.contents)
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
    c.add_argument("--all", action="store_true", help="S4 필터 없이 전체 입력을 점검(원본은 S4·미삭제·발행일 있는 글만)")
    c.set_defaults(func=cmd_check)

    u = sub.add_parser("update-needed", help="대시보드 '업데이트 필요 글' (현장수첩 60일·기타 90일, 최대 5건)")
    u.add_argument("--contents", required=True)
    u.add_argument("--now")
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
