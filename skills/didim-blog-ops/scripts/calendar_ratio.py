#!/usr/bin/env python3
"""디딤 블로그 발행 캘린더·카테고리 비율·월간 발행 현황·12주 스케줄 — 원본 TS 포팅.

원본:
  - src/actions/calendar.ts               : getCalendarSchedules() (contents 폴백 경로)
  - src/components/calendar/ratio-gauge.tsx : 발행 비율 게이지 (GCD 단순화, 목표 2:1:1)
  - src/actions/recommendations.ts        : getMonthlyPublishProgress()
  - src/lib/recommendation-engine.ts      : getPrimaryCategoryId(), calcMonthlyStats()
  - src/lib/constants/schedule-data.ts    : DEFAULT_BLOG_START_DATE, getCurrentWeek(), getMonthWeeks()
  - seed_data/schedule_12weeks.json       : 12주 스케줄

사용 예:
  python3 calendar_ratio.py items --contents contents.json
  python3 calendar_ratio.py ratio --contents contents.json [--month 2026-10]
  python3 calendar_ratio.py progress --contents contents.json --now 2026-10-20T00:00:00Z
  python3 calendar_ratio.py week --now 2026-02-10T01:00:00Z
  python3 calendar_ratio.py schedule [--week 5]
"""
import argparse
import json
import math
import re
import sys
from datetime import datetime, timezone

# seed_data/schedule_12weeks.json 원문
SCHEDULE_12WEEKS = [
    {"week": 1, "category": "현장 수첩", "sub": "절세 시뮬레이션", "title": "법인세 2억 내던 대표님, 지금은 5천만원입니다", "keyword": "직무발명보상금 절세, 법인세 줄이는 방법", "cta": "절세 시뮬레이션 무료 신청", "target": "2차 타깃 (중소기업 대표)", "legal_basis": "조특법 제10조, 시행령 제9조, 소득세법 제12조"},
    {"week": 2, "category": "IP 라운지", "sub": "특허 전략 노트", "title": "특허 1건으로 벤처인증 + 투자유치 + 정부과제 3마리 토끼", "keyword": "스타트업 특허 전략, 벤처인증 특허", "cta": "이웃 추가", "target": "1차 타깃 (스타트업 대표)", "legal_basis": "벤처기업육성법"},
    {"week": 3, "category": "현장 수첩", "sub": "연구소 운영 실무", "title": "연구소 세무조사 통지서 받고 전화 온 대표님", "keyword": "기업부설연구소 세무조사, R&D 세액공제 환수", "cta": "사후관리 서비스 안내", "target": "2차+3차 타깃", "legal_basis": "기초연구진흥법 제14조"},
    {"week": 4, "category": "디딤 다이어리", "sub": "대표의 생각", "title": "KAIST → CIPO → 변리사, 디딤을 만든 이유", "keyword": "특허그룹디딤", "cta": "없음", "target": "전체", "legal_basis": "—"},
    {"week": 5, "category": "현장 수첩", "sub": "절세 시뮬레이션", "title": "대표이사에게 보상금 지급, 가능한가요? (가능합니다)", "keyword": "대표이사 직무발명보상금", "cta": "절세 시뮬레이션 무료 신청", "target": "2차 타깃", "legal_basis": "조특법 제10조, 발명진흥법 제17조"},
    {"week": 6, "category": "IP 라운지", "sub": "AI와 IP", "title": "ChatGPT로 만든 로고, 상표등록 될까?", "keyword": "AI 상표등록, ChatGPT 저작권", "cta": "이웃 추가", "target": "3차 타깃 (CTO)", "legal_basis": "상표법, 저작권법"},
    {"week": 7, "category": "현장 수첩", "sub": "인증 가이드", "title": "벤처인증 3번 떨어진 회사, 4번째에 성공한 비결", "keyword": "벤처기업인증 방법", "cta": "인증 요건 무료 진단", "target": "1차 타깃", "legal_basis": "벤처기업육성법 제2조의2"},
    {"week": 8, "category": "디딤 다이어리", "sub": "컨설팅 후기", "title": "이번 달 벤처인증 3건 완료 — 세 회사 세 가지 전략", "keyword": "벤처인증 컨설팅", "cta": "없음", "target": "전체", "legal_basis": "—"},
    {"week": 9, "category": "현장 수첩", "sub": "절세 시뮬레이션", "title": "상여금으로 줬으면 6,600만원 더 나갔습니다", "keyword": "직무발명보상금 vs 상여금", "cta": "절세 시뮬레이션 무료 신청", "target": "2차 타깃", "legal_basis": "조특법 제10조, 소득세법 제12조 제3호"},
    {"week": 10, "category": "IP 라운지", "sub": "IP 뉴스 한 입", "title": "직무발명보상 5만원 줬다가 2조 소송당한 회사", "keyword": "직무발명 소송 사례", "cta": "보상규정 컨설팅 안내", "target": "2차+3차 타깃", "legal_basis": "발명진흥법"},
    {"week": 11, "category": "현장 수첩", "sub": "인증 가이드", "title": "직원 2명이면 연구소 됩니다 — 설립한 대표님 후기", "keyword": "기업부설연구소 설립, 연구전담요원 2인", "cta": "설립 요건 무료 진단", "target": "1차+2차 타깃", "legal_basis": "기초연구진흥법 제14조"},
    {"week": 12, "category": "디딤 다이어리", "sub": "디딤 일상", "title": "변리사가 서울대 AI 과정을 듣는 이유", "keyword": "AI 특허 전문가", "cta": "없음", "target": "전체", "legal_basis": "—"},
]

DEFAULT_BLOG_START_DATE = "2026-01-06"

# ratio-gauge.tsx CATEGORY_CONFIG
GAUGE_CATEGORIES = [
    {"id": "CAT-A", "name": "현장 수첩", "target": 2},
    {"id": "CAT-B", "name": "IP 라운지", "target": 1},
    {"id": "CAT-C", "name": "디딤 다이어리", "target": 1},
]

PROGRESS_CATEGORIES = [
    ("CAT-A", "변리사의 현장 수첩", "field", 2),
    ("CAT-B", "IP 라운지", "lounge", 1),
    ("CAT-C", "디딤 다이어리", "diary", 1),
]

CATEGORY_NAMES = {
    "CAT-INTRO": "디딤 소개", "CAT-A": "변리사의 현장 수첩", "CAT-A-01": "절세 시뮬레이션",
    "CAT-A-02": "인증 가이드", "CAT-A-03": "연구소 운영 실무", "CAT-B": "IP 라운지",
    "CAT-B-01": "AI와 IP", "CAT-B-02": "특허 전략 노트", "CAT-B-03": "IP 뉴스 한 입",
    "CAT-C": "디딤 다이어리", "CAT-C-01": "컨설팅 후기", "CAT-C-02": "디딤 일상",
    "CAT-C-03": "대표의 생각", "CAT-CONSULT": "상담 안내",
}

STATUS_LABEL_KO = {"published": "발행 완료", "in_progress": "진행 중", "planned": "예정",
                   "delayed": "지연", "skipped": "건너뜀"}


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


def get_primary_category_id(category_id):
    if category_id in ("CAT-A", "CAT-B", "CAT-C"):
        return category_id
    parts = category_id.split("-")
    if len(parts) >= 2:
        return f"{parts[0]}-{parts[1]}"
    return category_id


# ── calendar.ts (contents 폴백 경로) ──

def contents_to_items(contents):
    rows = [c for c in contents if c.get("publish_date")]
    rows.sort(key=lambda c: c["publish_date"])
    items = []
    for c in rows:
        st = c.get("status")
        cal = "planned"
        if st in ("S4", "S5"):
            cal = "published"
        elif st in ("S1", "S2", "S3"):
            cal = "in_progress"
        items.append({
            "planned_date": c["publish_date"],
            "category": c.get("category_name") or CATEGORY_NAMES.get(c.get("category_id") or "", ""),
            "categoryId": c.get("category_id") or "",
            "title": c.get("title") or c.get("id"),
            "status": cal,
            "status_ko": STATUS_LABEL_KO[cal],
        })
    return items


def cmd_items(args):
    contents = load_json(args.contents)
    items = contents_to_items(contents)
    if args.month:
        items = [i for i in items if i["planned_date"].startswith(args.month)]
    print(json.dumps({"items": items}, ensure_ascii=False, indent=2))


# ── ratio-gauge.tsx ──

def gcd(a, b):
    return a if b == 0 else gcd(b, a % b)


def ratio_gauge(items):
    total = len(items)
    counts = [dict(cat, count=sum(1 for s in items if s["categoryId"] == cat["id"])) for cat in GAUGE_CATEGORIES]
    values = [c["count"] for c in counts]
    common = values[0] or 1  # countValues[0] || 1
    for v in values:
        common = gcd(common, v)
    ratio = [(v / common if common > 0 else 0) for v in values]
    ratio_str = ":".join(str(int(r)) if float(r).is_integer() else str(r) for r in ratio)
    for c in counts:
        pct = (c["count"] / total) * 100 if total > 0 else 0
        c["pct"] = pct
        c["pct_rounded"] = math.floor(pct + 0.5)
        c["bar_label"] = f"{c['count']}건" if pct >= 10 else ""
    return {"total": total, "categories": counts, "current_ratio": ratio_str, "target_ratio": "2:1:1"}


def cmd_ratio(args):
    contents = load_json(args.contents)
    items = contents_to_items(contents)
    if args.month:
        items = [i for i in items if i["planned_date"].startswith(args.month)]
    out = ratio_gauge(items)
    # 스킬 추가 정보: 2차 카테고리 ID 로 저장된 글까지 1차로 묶어 센 값
    prim = {cat["id"]: 0 for cat in GAUGE_CATEGORIES}
    for i in items:
        p = get_primary_category_id(i["categoryId"])
        if p in prim:
            prim[p] += 1
    out["counts_by_primary_category"] = prim
    out["scope"] = f"month={args.month}" if args.month else "all(원본과 동일: 기간 필터 없음)"
    print(json.dumps(out, ensure_ascii=False, indent=2))


# ── recommendations.ts getMonthlyPublishProgress ──

def cmd_progress(args):
    contents = load_json(args.contents)
    now = parse_js_date(args.now) if args.now else datetime.now(timezone.utc)
    first_day = datetime(now.year, now.month, 1, tzinfo=timezone.utc)  # 서버(UTC) 기준
    stats = {"field": 0, "lounge": 0, "diary": 0}
    for c in contents:
        if c.get("status") != "S4":
            continue
        if c.get("is_deleted", False) is not False:
            continue
        pa = parse_js_date(c.get("published_at"))
        if pa is None or pa < first_day:
            continue
        primary = get_primary_category_id(c.get("category_id") or "")
        if primary == "CAT-A":
            stats["field"] += 1
        elif primary == "CAT-B":
            stats["lounge"] += 1
        elif primary == "CAT-C":
            stats["diary"] += 1
    out = [{"categoryId": cid, "categoryName": name, "published": stats[key], "target": target}
           for cid, name, key, target in PROGRESS_CATEGORIES]
    print(json.dumps({"month": first_day.strftime("%Y-%m"), "progress": out,
                      "note": "원본은 status=S4 만 집계(S5 제외), published_at >= 이번 달 1일(UTC)"},
                     ensure_ascii=False, indent=2))


# ── schedule-data.ts ──

def current_week(now, start=DEFAULT_BLOG_START_DATE):
    start_dt = parse_js_date(start)
    diff_days = (now - start_dt).total_seconds() / 86400
    return math.ceil(diff_days / 7)


def month_weeks(week):
    idx = math.ceil(week / 4)
    s = (idx - 1) * 4 + 1
    return [w for w in (s, s + 1, s + 2, s + 3) if w <= 12]


def cmd_week(args):
    now = parse_js_date(args.now) if args.now else datetime.now(timezone.utc)
    w = current_week(now, args.start)
    entry = next((s for s in SCHEDULE_12WEEKS if s["week"] == w), None)
    print(json.dumps({"start": args.start, "now": now.isoformat(), "current_week": w,
                      "month_weeks": month_weeks(w), "schedule_entry": entry,
                      "note": None if entry else "12주 스케줄 범위(1~12주)를 벗어났습니다. 주제는 didim-blog-planner 로 정합니다."},
                     ensure_ascii=False, indent=2))


def cmd_schedule(args):
    data = SCHEDULE_12WEEKS
    if args.week:
        data = [s for s in data if s["week"] == args.week]
    print(json.dumps(data, ensure_ascii=False, indent=2))


def main():
    p = argparse.ArgumentParser(description="디딤 블로그 발행 캘린더·카테고리 비율·12주 스케줄 — JSON 출력")
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("items", help="콘텐츠 → 캘린더 항목(발행 완료/진행 중/예정)")
    a.add_argument("--contents", required=True)
    a.add_argument("--month", help="YYYY-MM 필터(선택)")
    a.set_defaults(func=cmd_items)

    r = sub.add_parser("ratio", help="발행 비율 게이지 (현재 비율 vs 목표 2:1:1)")
    r.add_argument("--contents", required=True)
    r.add_argument("--month", help="YYYY-MM 필터(선택; 원본은 전체 기간)")
    r.set_defaults(func=cmd_ratio)

    g = sub.add_parser("progress", help="이번 달 카테고리별 발행 현황(목표 2/1/1)")
    g.add_argument("--contents", required=True)
    g.add_argument("--now", help="기준 시각 ISO (기본: 현재 UTC)")
    g.set_defaults(func=cmd_progress)

    w = sub.add_parser("week", help="블로그 시작일 기준 현재 주차·4주 묶음·해당 주 스케줄")
    w.add_argument("--now")
    w.add_argument("--start", default=DEFAULT_BLOG_START_DATE)
    w.set_defaults(func=cmd_week)

    s = sub.add_parser("schedule", help="12주 스케줄 원문 출력")
    s.add_argument("--week", type=int)
    s.set_defaults(func=cmd_schedule)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
