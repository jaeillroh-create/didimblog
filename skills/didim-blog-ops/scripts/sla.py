#!/usr/bin/env python3
"""디딤 블로그 SLA·발행일·콘텐츠 ID 계산 — 원본 TS 포팅.

원본:
  - src/lib/utils/date-helpers.ts : calculateSlaDates(), getNextTuesday(), formatDate()
  - src/lib/utils/sla-checker.ts  : checkSla(), getSlaStatus()
  - src/actions/dashboard.ts      : getDashboardSlaAlerts()
  - src/actions/contents.ts       : createContent() 의 W{주차}-{순번} ID 규칙
  - src/components/common/sla-indicator.tsx : calculateSLAStatus()

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
    c = load_json(args.content)
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
    notes = []
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
    contents = load_json(args.contents)
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
