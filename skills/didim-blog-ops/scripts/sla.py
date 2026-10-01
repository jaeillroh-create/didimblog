#!/usr/bin/env python3
"""디딤 블로그 SLA·발행일·콘텐츠 ID 계산 — 원본 TS 포팅.

원본:
  - src/lib/utils/date-helpers.ts : calculateSlaDates(), getNextTuesday(), formatDate()
  - src/lib/utils/sla-checker.ts  : checkSla(), getSlaStatus()
  - src/actions/dashboard.ts      : getDashboardSlaAlerts()
  - src/actions/contents.ts       : createContent() 의 W{주차}-{순번} ID 규칙
  - src/components/common/sla-indicator.tsx : calculateSLAStatus()

Notion "디딤 블로그 콘텐츠" 행(한글 속성명, 발행일·상태만 있음)도 받는다: 마감일은 발행일에서 역산,
완료 여부는 상태로 추정(스킬 보완 — 원본은 *_done_at 컬럼 사용).

날짜 규칙: 'YYYY-MM-DD' 는 JS new Date() 와 같이 UTC 자정으로 해석한다.
'오늘' 판정(checkSla)은 브라우저(KST, UTC+9) 기준 날짜 비교와 같다.

사용 예:
  python3 sla.py dates --publish-date 2026-10-06
  python3 sla.py next-tuesday --from 2026-10-01
  python3 sla.py content-id --publish-date 2026-10-06 --existing W40-01
  python3 sla.py check --content content.json --today 2026-10-03
  python3 sla.py alerts --contents contents.json --now 2026-10-03T01:00:00Z
"""
import argparse
import json
import math
import re
import sys
from datetime import date, datetime, timedelta, timezone

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


KST = timezone(timedelta(hours=9))
WEEKDAY_KO = ["월", "화", "수", "목", "금", "토", "일"]  # date.weekday() 순서
ID_EPOCH = date(2026, 1, 5)  # contents.ts: new Date("2026-01-05")


def load_json(path):
    if path == "-":
        return json.load(sys.stdin)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def to_date(s):
    return date.fromisoformat(str(s)[:10])


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


def today_kst():
    return datetime.now(KST).date()


def fmt(d):
    return {"date": d.isoformat(), "weekday": WEEKDAY_KO[d.weekday()]}


# ── date-helpers.ts ──

def calculate_sla_dates(publish):
    return {
        "briefingDue": publish - timedelta(days=5),  # D-5 목요일 (AI 주제선정+초안생성)
        "draftDue": publish - timedelta(days=3),     # D-3 토요일
        "reviewDue": publish - timedelta(days=2),    # D-2 일요일
        "imageDue": publish - timedelta(days=1),     # D-1 월요일
        "publishDue": publish,                       # D-0 화요일
    }


def next_tuesday(frm):
    """date-fns nextTuesday: 기준일 '다음' 화요일(기준일이 화요일이면 +7일)."""
    delta = (1 - frm.weekday()) % 7
    if delta == 0:
        delta = 7
    return frm + timedelta(days=delta)


def cmd_dates(args):
    publish = to_date(args.publish_date)
    d = calculate_sla_dates(publish)
    out = {
        "publish_date": fmt(publish),
        "contents_fields": {
            "briefing_due": d["briefingDue"].isoformat(),
            "draft_due": d["draftDue"].isoformat(),
            "review_due": d["reviewDue"].isoformat(),
            "image_due": d["imageDue"].isoformat(),
            "publish_due": d["publishDue"].isoformat(),
        },
        "timeline": [
            dict(fmt(d["briefingDue"]), step="D-5", label="AI 주제선정 (D-5)",
                 spec_5_4="음성 브리핑 완료"),
            dict(fmt(d["draftDue"]), step="D-3", label="초안 (D-3)", spec_5_4="초안 작성 완료"),
            dict(fmt(d["reviewDue"]), step="D-2", label="검수 (D-2)", spec_5_4="팩트체크 + 검수 완료"),
            dict(fmt(d["imageDue"]), step="D-1", label="이미지 (D-1)", spec_5_4="이미지 제작 완료"),
            dict(fmt(d["publishDue"]), step="D-0", label="발행 (D-0)",
                 spec_5_4="최종 편집 + 09:00 예약 발행"),
        ],
        "warnings": [],
    }
    if publish.weekday() != 1:
        out["warnings"].append(
            f"발행일 {publish.isoformat()}({WEEKDAY_KO[publish.weekday()]})이 화요일이 아닙니다. "
            "원본 코드는 검증하지 않지만 운영 규칙은 매주 화요일 09:00 발행입니다.")
    print(json.dumps(out, ensure_ascii=False, indent=2))


def cmd_next_tuesday(args):
    frm = to_date(args.frm) if args.frm else today_kst()
    nt = next_tuesday(frm)
    print(json.dumps({"from": fmt(frm), "next_tuesday": fmt(nt)}, ensure_ascii=False, indent=2))


def js_pad2(n):
    s = str(n)
    return s if len(s) >= 2 else "0" * (2 - len(s)) + s


def cmd_content_id(args):
    publish = to_date(args.publish_date) if args.publish_date else next_tuesday(today_kst())
    # Math.ceil((publishDate - 2026-01-05) / 7일) — 화요일이면 시각과 무관하게 같은 값
    days = (publish - ID_EPOCH).days
    week = math.ceil(days / 7)
    week_str = js_pad2(week)
    existing = [e for e in (args.existing or "").split(",") if e]
    count = sum(1 for e in existing if e.startswith(f"W{week_str}-"))
    seq = js_pad2(count + 1)
    print(json.dumps({"publish_date": publish.isoformat(), "week_number": week,
                      "content_id": f"W{week_str}-{seq}",
                      "note": "순번 = 같은 주차 접두어(W{주차}-)를 가진 기존 콘텐츠 수 + 1 (삭제된 글 포함)"},
                     ensure_ascii=False, indent=2))


DONE_FIELDS = ["briefing_done_at", "draft_done_at", "review_done_at", "image_done_at", "published_at"]
DUE_FIELDS = ["briefing_due", "draft_due", "review_due", "image_due", "publish_due"]
STATUS_INDEX = {"S0": 0, "S1": 1, "S2": 2, "S3": 3, "S4": 4, "S5": 5}


def fill_sla_fields(c):
    """스킬 보완: Notion 행은 발행일·상태만 있으므로 마감일은 발행일에서 역산하고,
    완료 여부는 상태로 추정한다(S1↑ 주제선정·초안, S2↑ 검수, S3↑ 이미지, S4↑ 발행)."""
    c = normalize_content(c)
    notes = []
    if c.get("publish_date") and not any(c.get(f) for f in DUE_FIELDS):
        d = calculate_sla_dates(to_date(c["publish_date"]))
        c.update({"briefing_due": d["briefingDue"].isoformat(), "draft_due": d["draftDue"].isoformat(),
                  "review_due": d["reviewDue"].isoformat(), "image_due": d["imageDue"].isoformat(),
                  "publish_due": d["publishDue"].isoformat()})
        notes.append("마감일은 발행일에서 역산했습니다.")
    if not any(k in c for k in DONE_FIELDS[:4]) and c.get("status") in STATUS_INDEX:
        i = STATUS_INDEX[c["status"]]
        mark = "(상태로 추정)"
        c["briefing_done_at"] = mark if i >= 1 else None
        c["draft_done_at"] = mark if i >= 1 else None
        c["review_done_at"] = mark if i >= 2 else None
        c["image_done_at"] = mark if i >= 3 else None
        if not c.get("published_at"):
            c["published_at"] = mark if i >= 4 else None
        notes.append("완료 여부는 상태로 추정했습니다.")
    return c, notes


# ── sla-checker.ts ──

def get_sla_status(due, done, today):
    if done:
        return "completed"
    if not due:
        return "on_track"
    d = to_date(due)
    if d == today:
        return "due_today"
    if d < today:
        return "overdue"
    return "on_track"


SLA_STATUS_KO = {"completed": "완료", "on_track": "정상", "due_today": "오늘 마감", "overdue": "기한 초과"}


def cmd_check(args):
    c, fill_notes = fill_sla_fields(load_json(args.content))
    today = to_date(args.today) if args.today else today_kst()
    spec = [
        ("AI 주제선정 (D-5)", "briefing_due", "briefing_done_at"),
        ("초안 (D-3)", "draft_due", "draft_done_at"),
        ("검수 (D-2)", "review_due", "review_done_at"),
        ("이미지 (D-1)", "image_due", "image_done_at"),
        ("발행 (D-0)", "publish_due", "published_at"),
    ]
    items = []
    for label, due_f, done_f in spec:
        st = get_sla_status(c.get(due_f), c.get(done_f), today)
        items.append({"label": label, "dueDate": c.get(due_f), "completedAt": c.get(done_f),
                      "status": st, "status_ko": SLA_STATUS_KO[st]})
    notes = list(fill_notes)
    if not c.get("briefing_done_at"):
        notes.append("원본 코드에는 briefing_done_at 을 기록하는 곳이 없어 D-5 항목은 마감일이 지나면 항상 '기한 초과'가 됩니다. "
                      "브리핑/주제선정 완료 시 직접 기록하세요.")
    print(json.dumps({"id": c.get("id"), "today": today.isoformat(), "items": items, "notes": notes},
                     ensure_ascii=False, indent=2))


# ── dashboard.ts getDashboardSlaAlerts ──

SLA_MAP = {
    "S0": ("briefing_due", "AI 주제선정"),
    "S1": ("draft_due", "초안"),
    "S2": ("review_due", "검토"),
    "S3": ("publish_due", "발행"),
}


def cmd_alerts(args):
    contents = [fill_sla_fields(c)[0] for c in load_json(args.contents)]
    now = parse_js_date(args.now) if args.now else datetime.now(timezone.utc)
    rows = [c for c in contents if c.get("status") in ("S0", "S1", "S2", "S3")]
    # order("publish_date", asc) — Postgres 기본: NULL 은 마지막
    rows.sort(key=lambda c: (c.get("publish_date") is None, c.get("publish_date") or ""))
    rows = rows[:10]
    alerts = []
    for c in rows:
        field, label = SLA_MAP[c["status"]]
        due_raw = c.get(field)
        if not due_raw:
            continue
        due = parse_js_date(due_raw)
        diff_ms = (due - now).total_seconds() * 1000
        diff_days = math.ceil(diff_ms / (1000 * 60 * 60 * 24))
        if diff_days < 0:
            st, st_label, info = "overdue", "초과", f"{label} SLA {abs(diff_days)}일 초과"
        elif diff_days <= 1:
            st, st_label = "warning", "주의"
            info = f"{label} SLA 오늘 마감" if diff_days == 0 else f"{label} SLA 내일 마감"
        else:
            st, st_label, info = "on-track", "정상", f"{label} SLA {diff_days}일 남음"
        alerts.append({"id": c.get("id"), "status": st, "statusLabel": st_label,
                       "content": c.get("title") or c.get("id"), "timeInfo": info})
    order = {"overdue": 0, "warning": 1, "on-track": 2}
    alerts.sort(key=lambda a: order[a["status"]])
    print(json.dumps({"now": now.isoformat(), "alerts": alerts[:5]}, ensure_ascii=False, indent=2))


def cmd_indicator(args):
    """sla-indicator.tsx calculateSLAStatus()."""
    due = parse_js_date(args.due)
    cur = parse_js_date(args.current) if args.current else datetime.now(timezone.utc)
    days = math.ceil((due - cur).total_seconds() / 86400)
    if days < 0:
        st = "overdue"
    elif days <= 1:
        st = "warning"
    elif days > 30:
        st = "future"
    else:
        st = "on-track"
    labels = {"on-track": "정상", "warning": "주의", "overdue": "초과", "future": "미래"}
    print(json.dumps({"status": st, "label": labels[st], "daysRemaining": days}, ensure_ascii=False, indent=2))


def main():
    p = argparse.ArgumentParser(description="디딤 블로그 SLA(D-5~D-0)·발행일·콘텐츠 ID 계산 — JSON 출력")
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("dates", help="발행일 → SLA 마감일 5개(D-5,D-3,D-2,D-1,D-0)")
    a.add_argument("--publish-date", required=True, help="YYYY-MM-DD (화요일 권장)")
    a.set_defaults(func=cmd_dates)

    b = sub.add_parser("next-tuesday", help="기준일 다음 화요일 (기준일이 화요일이면 +7일)")
    b.add_argument("--from", dest="frm", help="YYYY-MM-DD (기본: 오늘 KST)")
    b.set_defaults(func=cmd_next_tuesday)

    ci = sub.add_parser("content-id", help="W{주차}-{순번} 콘텐츠 ID 생성")
    ci.add_argument("--publish-date", help="YYYY-MM-DD (기본: 다음 화요일)")
    ci.add_argument("--existing", help="기존 콘텐츠 ID 콤마목록")
    ci.set_defaults(func=cmd_content_id)

    ch = sub.add_parser("check", help="콘텐츠 1건의 SLA 5단계 상태")
    ch.add_argument("--content", required=True, help="콘텐츠 JSON ('-'=stdin)")
    ch.add_argument("--today", help="YYYY-MM-DD (기본: 오늘 KST)")
    ch.set_defaults(func=cmd_check)

    al = sub.add_parser("alerts", help="대시보드 SLA 알림 (S0~S3, 최대 5건)")
    al.add_argument("--contents", required=True, help="콘텐츠 JSON 배열 ('-'=stdin)")
    al.add_argument("--now", help="기준 시각 ISO (기본: 현재 UTC)")
    al.set_defaults(func=cmd_alerts)

    ind = sub.add_parser("indicator", help="SLA 인디케이터(정상/주의/초과/미래) 단일 마감일")
    ind.add_argument("--due", required=True)
    ind.add_argument("--current")
    ind.set_defaults(func=cmd_indicator)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
