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
from datetime import date, datetime, timedelta, timezone

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
    "categoryNo": "category_no", "타깃 키워드": "target_keyword", "발행일": "publish_date",
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
        out["published_at"] = out["publish_date"]  # Notion 은 발행일만 기록
    if out.get("views_1m") is None and out.get("views_recent") is not None:
        out["views_1m"] = out["views_recent"]
    return out


DEFAULT_BLOG_START_DATE = "2026-01-06"
KST = timezone(timedelta(hours=9))
ROTATION = [25, 27, 24, 26]  # DECISIONS §3 (ISO 주차 기준 4주 로테이션)
ROTATION_FALLBACK = {26: 27}  # 사례: 사건 메모가 없으면 출원·심판 실무

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


def kst_date(value):
    dt = parse_js_date(value)
    return dt.astimezone(KST).date() if dt else None


def rotation_for(d, has_case_memo=True):
    iso_year, iso_week, _ = d.isocalendar()
    slot = (iso_week - 1) % 4
    planned = ROTATION[slot]
    actual = planned if (planned != 26 or has_case_memo) else ROTATION_FALLBACK[26]
    return {"iso_year": iso_year, "iso_week": iso_week, "rotation_slot": slot + 1,
            "planned_category_no": planned, "planned_category": CATEGORY_TABLE[planned]["name"],
            "category_no": actual, "category": CATEGORY_TABLE[actual]["name"],
            "fallback_applied": actual != planned}


# ── calendar.ts (contents 폴백 경로) ──

def contents_to_items(contents):
    rows = [normalize_content(c) for c in contents]
    rows = [c for c in rows if c.get("publish_date")]
    rows.sort(key=lambda c: str(c["publish_date"]))
    items = []
    for c in rows:
        st = c.get("status")
        cal = "planned"
        if st in ("S4", "S5"):
            cal = "published"
        elif st in ("S1", "S2", "S3"):
            cal = "in_progress"
        cat = content_category(c)
        items.append({
            "planned_date": str(c["publish_date"])[:10],
            "category": cat["name"] if cat else (c.get("category_name") or ""),
            "categoryNo": cat["no"] if cat else None,
            "statCategoryNo": cat["stat"] if cat else None,
            "statCategory": cat["stat_name"] if cat else None,
            "legacy": bool(cat and cat["group"] == "legacy"),
            "title": c.get("title") or c.get("id"),
            "status": cal,
            "status_ko": STATUS_LABEL_KO[cal],
        })
    return items


def cmd_items(args):
    items = contents_to_items(load_json(args.contents))
    if args.month:
        items = [i for i in items if i["planned_date"].startswith(args.month)]
    for i in items:
        d = date.fromisoformat(i["planned_date"])
        i["weekday_is_tuesday"] = d.weekday() == 1
        i["rotation_expected"] = rotation_for(d)["category"]
    print(json.dumps({"items": items}, ensure_ascii=False, indent=2))


# ── ratio-gauge.tsx (GCD 알고리즘 유지, 대상 카테고리는 신규 구조) ──

def gcd(a, b):
    return a if b == 0 else gcd(b, a % b)


def ratio_gauge(items):
    total = len(items)
    cats = []
    for no in ROTATION:
        cnt = sum(1 for s in items if s["statCategoryNo"] == no)
        pct = (cnt / total) * 100 if total > 0 else 0
        cats.append({"categoryNo": no, "name": CATEGORY_TABLE[no]["name"], "target": 1, "count": cnt,
                     "pct": pct, "pct_rounded": math.floor(pct + 0.5), "bar_label": f"{cnt}건" if pct >= 10 else ""})
    values = [c["count"] for c in cats]
    common = values[0] or 1  # 원본: countValues[0] || 1
    for v in values:
        common = gcd(common, v)
    ratio = ":".join(str(v // common) if common > 0 else "0" for v in values)
    extras = {CATEGORY_TABLE[no]["name"]: sum(1 for s in items if s["statCategoryNo"] == no) for no in (28, 17)}
    unknown = sum(1 for s in items if s["statCategoryNo"] is None)
    return {"total": total, "rotation_categories": cats, "current_ratio": ratio,
            "target_ratio": "1:1:1:1 (지원사업·인증과 특허 : 출원·심판 실무 : 지식재산 경영 : 사례)",
            "extra_outside_rotation": extras, "unclassified": unknown}


def consecutive_warnings(items):
    """같은 카테고리 연속 2주 방지 (DECISIONS §3). 주(ISO)별 첫 글 기준."""
    by_week = {}
    for i in items:
        d = date.fromisoformat(i["planned_date"])
        key = d.isocalendar()[:2]
        by_week.setdefault(key, i)
    weeks = sorted(by_week)
    warns = []
    for a, b in zip(weeks, weeks[1:]):
        ya, wa = a
        yb, wb = b
        adjacent = (date.fromisocalendar(yb, wb, 1) - date.fromisocalendar(ya, wa, 1)).days == 7
        ca, cb = by_week[a]["statCategoryNo"], by_week[b]["statCategoryNo"]
        if adjacent and ca and ca == cb and ca in ROTATION:
            warns.append(f"{ya}-W{wa:02d}·{yb}-W{wb:02d} 연속 '{CATEGORY_TABLE[ca]['name']}'")
    return warns


def cmd_ratio(args):
    items = contents_to_items(load_json(args.contents))
    if args.month:
        items = [i for i in items if i["planned_date"].startswith(args.month)]
    out = ratio_gauge(items)
    out["consecutive_same_category"] = consecutive_warnings(items)
    out["scope"] = f"month={args.month}" if args.month else "all(원본과 동일: 기간 필터 없음)"
    print(json.dumps(out, ensure_ascii=False, indent=2))


# ── recommendations.ts getMonthlyPublishProgress (목표는 로테이션 기준) ──

def cmd_progress(args):
    contents = [normalize_content(c) for c in load_json(args.contents)]
    now = parse_js_date(args.now) if args.now else datetime.now(timezone.utc)
    today = now.astimezone(KST).date()
    first = today.replace(day=1)
    nxt = (first + timedelta(days=32)).replace(day=1)
    targets = {no: 0 for no in ROTATION}
    tuesdays = []
    d = first
    while d < nxt:
        if d.weekday() == 1:
            r = rotation_for(d, has_case_memo=not args.no_case_memo)
            targets[r["category_no"]] = targets.get(r["category_no"], 0) + 1
            tuesdays.append({"date": d.isoformat(), "iso_week": r["iso_week"], "category": r["category"]})
        d += timedelta(days=1)
    published = {}
    for c in contents:
        if c.get("status") not in ("S4", "S5") or c.get("is_deleted"):
            continue
        pd = kst_date(c.get("published_at") or c.get("publish_date"))
        if pd is None or not (first <= pd < nxt):
            continue
        cat = content_category(c)
        key = cat["stat"] if cat else None
        published[key] = published.get(key, 0) + 1
    rows = [{"categoryNo": no, "categoryName": CATEGORY_TABLE[no]["name"],
             "published": published.get(no, 0), "target": targets.get(no, 0)} for no in ROTATION]
    rows += [{"categoryNo": no, "categoryName": CATEGORY_TABLE[no]["name"], "published": published.get(no, 0),
              "target": None, "note": "로테이션 외 추가 발행"} for no in (28, 17)]
    total_pub = sum(v for k, v in published.items() if k is not None)
    print(json.dumps({"month": first.strftime("%Y-%m"), "tuesdays": tuesdays,
                      "weekly_target": 1, "monthly_target_total": len(tuesdays), "published_total": total_pub,
                      "progress": rows,
                      "note": "목표 = 이번 달 화요일들의 로테이션 슬롯 수. 발행 = 상태 S4·S5, 발행일(KST)이 이번 달."},
                     ensure_ascii=False, indent=2))


def cmd_rotation(args):
    d = date.fromisoformat(args.date) if args.date else datetime.now(KST).date()
    tue = d + timedelta(days=(1 - d.weekday()) % 7)  # 해당 주(또는 다음) 화요일
    r = rotation_for(tue, has_case_memo=args.has_case_memo)
    out = {"date": d.isoformat(), "publish_tuesday": tue.isoformat(), **r, "warnings": []}
    if args.contents:
        items = contents_to_items(load_json(args.contents))
        prev_week = (tue - timedelta(days=7)).isocalendar()[:2]
        prev = [i for i in items if date.fromisoformat(i["planned_date"]).isocalendar()[:2] == prev_week]
        if prev and prev[0]["statCategoryNo"] == r["category_no"]:
            out["warnings"].append(f"지난주도 '{r['category']}' — 같은 카테고리 연속 2주 방지 규칙. 다음 슬롯 카테고리로 바꾸세요.")
        out["previous_week_posts"] = prev
    if r["planned_category_no"] == 26 and not args.has_case_memo:
        out["warnings"].append("사례(26)는 사용자가 준 사건 메모 없이는 쓰지 않습니다 → 출원·심판 실무(27)로 대체.")
    print(json.dumps(out, ensure_ascii=False, indent=2))


def cmd_legacy_schedule(args):
    data = SCHEDULE_12WEEKS
    if args.week:
        data = [s for s in data if s["week"] == args.week]
    print(json.dumps({"status": "폐기(기록용) — skills/_DECISIONS.md §3", "start": DEFAULT_BLOG_START_DATE,
                      "schedule": data}, ensure_ascii=False, indent=2))


def main():
    p = argparse.ArgumentParser(description="디딤 블로그 발행 캘린더·카테고리 비율·4주 로테이션 — JSON 출력")
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("items", help="콘텐츠 → 캘린더 항목(발행 완료/진행 중/예정)")
    a.add_argument("--contents", required=True)
    a.add_argument("--month", help="YYYY-MM 필터(선택)")
    a.set_defaults(func=cmd_items)

    r = sub.add_parser("ratio", help="발행 비율 게이지 (현재 비율 vs 목표 1:1:1:1)")
    r.add_argument("--contents", required=True)
    r.add_argument("--month", help="YYYY-MM 필터(선택; 원본은 전체 기간)")
    r.set_defaults(func=cmd_ratio)

    g = sub.add_parser("progress", help="이번 달 카테고리별 발행 현황(목표 = 로테이션 슬롯 수)")
    g.add_argument("--contents", required=True)
    g.add_argument("--now", help="기준 시각 ISO (기본: 현재)")
    g.add_argument("--no-case-memo", action="store_true", help="사례 슬롯을 출원·심판 실무로 대체해 목표 계산")
    g.set_defaults(func=cmd_progress)

    w = sub.add_parser("rotation", help="발행 화요일의 4주 로테이션 카테고리(ISO 주차, KST)")
    w.add_argument("--date", help="YYYY-MM-DD (기본: 오늘 KST). 그 주(또는 다음) 화요일 기준")
    w.add_argument("--has-case-memo", action="store_true", help="사례용 사건 메모가 있음")
    w.add_argument("--contents", help="콘텐츠 배열(지난주 같은 카테고리 연속 확인)")
    w.set_defaults(func=cmd_rotation)

    s = sub.add_parser("legacy-schedule", help="폐기된 12주 스케줄 원문(기록용)")
    s.add_argument("--week", type=int)
    s.set_defaults(func=cmd_legacy_schedule)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
