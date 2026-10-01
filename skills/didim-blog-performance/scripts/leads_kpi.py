#!/usr/bin/env python3
"""디딤 블로그 상담(리드) KPI·파이프라인·전환 기여·키워드 순위 변동 — 원본 TS 포팅 + 스킬 보완.

원본:
  - src/actions/leads.ts                  : createLead() 입력 규칙(회사명 필수, 블로그일 때만 경유글, 초기 S3)
  - src/app/(dashboard)/leads/page.tsx    : 총 리드·상담 전환율·계약 전환율·누적 계약금액
  - src/components/leads/pipeline-chart.tsx : S3→S4, S4→S5 전환율, 유입경로 분포
  - src/components/leads/lead-table.tsx   : 라벨 매핑, 검색 대상 필드
  - src/actions/recommendations.ts        : getTopPerformingPosts() 의 글별 상담 건수 집계
  - src/components/analytics/keyword-ranking-tracker.tsx : 월 키(YYYY-MM-01), 변동 = 지난달 - 이번달

스킬 보완(spec 8절): attribution 의 글별 전환율(상담 수 / 조회수) — UPGRADE_SPEC Sprint 5 '전환 기여 분석' 근거.

사용 예:
  python3 leads_kpi.py stats --leads leads.json
  python3 leads_kpi.py attribution --leads leads.json --contents contents.json
  python3 leads_kpi.py new-lead --input lead.json --today 2026-10-01
  python3 leads_kpi.py keyword-rank --keywords kw.json --rankings rankings.json --now 2026-10-15
"""
import argparse
import json
import math
import sys
from datetime import date, timedelta

SOURCE_LABELS = {"blog": "블로그", "referral": "소개", "other": "기타"}
SERVICE_LABELS = {"tax_consulting": "절세 컨설팅", "lab_management": "연구소 관리", "venture_cert": "벤처인증",
                  "invention_cert": "발명인증", "patent": "특허", "other": "기타"}
CONSULTATION_LABELS = {"consulted": "상담완료", "proposal_sent": "제안서발송", "pending": "대기중", "lost": "실패"}
LEAD_STATUS_LABELS = {"S3": "리드", "S4": "상담", "S5": "계약"}


def load_json(path):
    if path == "-":
        return json.load(sys.stdin)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def js_round(x):
    return math.floor(x + 0.5)


def fmt_won(n):
    return f"{int(n):,}원"


def cmd_stats(args):
    leads = load_json(args.leads)
    total = len(leads)
    s3 = sum(1 for l in leads if l.get("visitor_status") == "S3")
    s4 = sum(1 for l in leads if l.get("visitor_status") == "S4")
    s5 = sum(1 for l in leads if l.get("visitor_status") == "S5")
    reached_s4 = s4 + s5
    consultation_rate = js_round(reached_s4 / total * 100) if total > 0 else 0
    contract_rate = js_round(s5 / reached_s4 * 100) if reached_s4 > 0 else 0
    amount = sum(l.get("contract_amount") or 0 for l in leads if l.get("contract_yn") and l.get("contract_amount"))
    # pipeline-chart.tsx: totalFromS3 = s3+s4+s5 (visitor_status 가 S3~S5 인 리드만)
    total_from_s3 = s3 + s4 + s5
    s3_to_s4 = js_round(reached_s4 / total_from_s3 * 100) if total_from_s3 > 0 else 0
    s4_to_s5 = js_round(s5 / reached_s4 * 100) if reached_s4 > 0 else 0
    sources = {"blog": 0, "referral": 0, "other": 0}
    for l in leads:
        sources[l.get("source")] = sources.get(l.get("source"), 0) + 1
    source_dist = [{"source": k, "name": SOURCE_LABELS.get(k, k), "value": v,
                    "percent": f"{(v / total * 100):.0f}%" if total else "0%"} for k, v in sources.items() if v > 0]
    services = {}
    for l in leads:
        k = l.get("interested_service") or "미지정"
        services[k] = services.get(k, 0) + 1
    print(json.dumps({
        "kpi_cards": [
            {"title": "총 리드 수", "value": total},
            {"title": "상담 전환율 (S3→S4)", "value": f"{consultation_rate}%"},
            {"title": "계약 전환율 (S4→S5)", "value": f"{contract_rate}%"},
            {"title": "누적 계약금액", "value": fmt_won(amount)},
        ],
        "pipeline": [{"name": "리드 (S3)", "count": s3}, {"name": "상담 (S4)", "count": s4},
                     {"name": "계약 (S5)", "count": s5}],
        "pipeline_rates": {"s3ToS4Rate": s3_to_s4, "s4ToS5Rate": s4_to_s5},
        "source_distribution": source_dist,
        "interested_service_counts": {SERVICE_LABELS.get(k, k): v for k, v in services.items()},
    }, ensure_ascii=False, indent=2))


def cmd_attribution(args):
    leads = load_json(args.leads)
    contents = load_json(args.contents) if args.contents else []
    by_id = {c.get("id"): c for c in contents}
    agg = {}
    for l in leads:
        sid = l.get("source_content_id")
        if not sid:
            continue
        a = agg.setdefault(sid, {"leads": 0, "consulted": 0, "contracts": 0, "contract_amount": 0})
        a["leads"] += 1
        if l.get("visitor_status") in ("S4", "S5"):
            a["consulted"] += 1
        if l.get("contract_yn"):
            a["contracts"] += 1
            a["contract_amount"] += l.get("contract_amount") or 0
    rows = []
    for sid, a in agg.items():
        c = by_id.get(sid, {})
        views = c.get("views_1m") if c.get("views_1m") is not None else c.get("views_1w")
        rate = (a["leads"] / views * 100) if views else None
        rows.append({"content_id": sid, "title": c.get("title") or "제목 없음", "views": views,
                     **a, "lead_per_view_percent": round(rate, 3) if rate is not None else None})
    rows.sort(key=lambda r: (-r["leads"], -r["contract_amount"]))
    blog_total = sum(1 for l in leads if l.get("source") == "blog")
    blog_no_post = sum(1 for l in leads if l.get("source") == "blog" and not l.get("source_content_id"))
    print(json.dumps({"by_post": rows, "blog_leads": blog_total, "blog_leads_without_post": blog_no_post,
                      "note": "글별 상담 건수는 원본 getTopPerformingPosts 와 같은 방식(source_content_id 집계). "
                              "lead_per_view_percent 는 스킬 보완 지표."}, ensure_ascii=False, indent=2))


def cmd_new_lead(args):
    """leads.ts createLead() 규칙으로 저장할 행을 만든다."""
    inp = load_json(args.input)
    name = (inp.get("company_name") or "").strip()
    if not name:
        print(json.dumps({"ok": False, "error": "회사명은 필수 입력 항목입니다."}, ensure_ascii=False, indent=2))
        return
    source = inp.get("source") or "blog"
    if source not in SOURCE_LABELS:
        print(json.dumps({"ok": False, "error": "유입경로는 blog/referral/other 중 하나여야 합니다."},
                         ensure_ascii=False, indent=2))
        return
    service = inp.get("interested_service") or None
    if service is not None and service not in SERVICE_LABELS:
        print(json.dumps({"ok": False, "error": f"관심서비스 값이 올바르지 않습니다: {service}",
                          "allowed": SERVICE_LABELS}, ensure_ascii=False, indent=2))
        return
    row = {
        "contact_date": args.today or date.today().isoformat(),
        "company_name": name,
        "contact_name": (inp.get("contact_name") or "").strip() or None,
        "contact_info": (inp.get("contact_info") or "").strip() or None,
        "source": source,
        "source_content_id": (inp.get("source_content_id") or None) if source == "blog" else None,
        "interested_service": service,
        "visitor_status": "S3",
        "consultation_result": None,
        "contract_yn": False,
        "contract_amount": None,
        "notes": (inp.get("notes") or "").strip() or None,
        "assigned_to": inp.get("assigned_to") or None,
    }
    print(json.dumps({"ok": True, "row": row,
                      "labels": {"source": SOURCE_LABELS[source],
                                 "interested_service": SERVICE_LABELS.get(service) if service else None,
                                 "visitor_status": LEAD_STATUS_LABELS["S3"]}}, ensure_ascii=False, indent=2))


def month_key(d):
    return f"{d.year}-{d.month:02d}-01"


def cmd_keyword_rank(args):
    keywords = load_json(args.keywords)
    rankings = load_json(args.rankings) if args.rankings else []
    now = date.fromisoformat(args.now[:10]) if args.now else date.today()
    cur_m = month_key(now)
    last_m = month_key(now.replace(day=1) - timedelta(days=1))
    if args.only_high:
        keywords = [k for k in keywords if k.get("priority") == "HIGH"]
    keywords = sorted(keywords, key=lambda k: k.get("keyword") or "")

    def rank(kid, m):
        r = next((r for r in rankings if r.get("keyword_id") == kid and r.get("month") == m), None)
        return r.get("rank") if r else None

    rows = []
    for k in keywords:
        cr, lr = rank(k.get("id"), cur_m), rank(k.get("id"), last_m)
        change, trend = None, "-"
        if cr is not None and lr is not None:
            change = lr - cr
            trend = "상승" if change > 0 else ("하락" if change < 0 else "유지")
        rows.append({"keyword_id": k.get("id"), "keyword": k.get("keyword"),
                     "this_month": cr, "last_month": lr, "change": change, "trend": trend})
    print(json.dumps({"current_month": cur_m, "last_month": last_m, "rows": rows,
                      "note": "순위 null = TOP 100 밖 또는 미입력. 변동 = 지난달 - 이번달(양수=개선)."},
                     ensure_ascii=False, indent=2))


def main():
    p = argparse.ArgumentParser(description="디딤 블로그 상담(리드) KPI·전환 기여·키워드 순위 — JSON 입출력")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("stats", help="리드 KPI 4카드·파이프라인·유입경로 분포")
    s.add_argument("--leads", required=True, help="leads JSON 배열")
    s.set_defaults(func=cmd_stats)

    a = sub.add_parser("attribution", help="경유 글별 상담·계약 집계(전환 기여)")
    a.add_argument("--leads", required=True)
    a.add_argument("--contents", help="콘텐츠 배열(제목·조회수)")
    a.set_defaults(func=cmd_attribution)

    n = sub.add_parser("new-lead", help="새 상담 입력 검증 → 저장할 행")
    n.add_argument("--input", required=True, help="{company_name, source, source_content_id, interested_service, ...}")
    n.add_argument("--today", help="문의일 YYYY-MM-DD (기본: 오늘)")
    n.set_defaults(func=cmd_new_lead)

    k = sub.add_parser("keyword-rank", help="키워드 월별 순위(이번 달/지난 달/변동)")
    k.add_argument("--keywords", required=True, help="keyword_pool 배열 [{id, keyword, priority}]")
    k.add_argument("--rankings", help="keyword_rankings 배열 [{keyword_id, month:'YYYY-MM-01', rank}]")
    k.add_argument("--now", help="기준일 YYYY-MM-DD")
    k.add_argument("--only-high", action="store_true", help="원본처럼 HIGH 키워드만")
    k.set_defaults(func=cmd_keyword_rank)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
