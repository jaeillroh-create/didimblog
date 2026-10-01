#!/usr/bin/env python3
"""디딤 블로그 상담(리드) KPI·파이프라인·전환 기여·키워드 순위 변동 — 원본 TS 포팅 + _DECISIONS.md 반영.

원본:
  - src/actions/leads.ts                  : createLead() 입력 규칙(회사명 필수, 블로그일 때만 경유글, 초기 S3)
  - src/app/(dashboard)/leads/page.tsx    : 총 리드·상담 전환율·계약 전환율·누적 계약금액
  - src/components/leads/pipeline-chart.tsx : S3→S4, S4→S5 전환율, 유입경로 분포
  - src/components/leads/lead-table.tsx   : 라벨 매핑
  - src/actions/recommendations.ts        : getTopPerformingPosts() 의 글별 상담 건수 집계
  - src/components/analytics/keyword-ranking-tracker.tsx : 월 키(YYYY-MM-01), 변동 = 지난달 - 이번달

Notion "디딤 블로그 상담" (data source collection://e1272822-7efd-4850-b8c8-cfce02db7d00) 행을 그대로 받는다:
  회사명, 상담일, 유입 경로(블로그/지원매치/특허인증센터/소개/기타), 경유 글, 관심 서비스(다중:
  출원·심판/지원사업 가점용 특허·인증/절세·연구소/기타), 상태(신규/진행 중/제안/계약/보류/종료),
  계약 여부, 계약 금액, 메모.  원본 leads 컬럼(source, visitor_status S3~S5, interested_service …)도 받는다.

단계 매핑(스킬 정의): 신규 = 원본 S3(리드) / 진행 중·제안·보류·종료 = S4(상담 도달) / 계약 = S5.

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

# Notion 선택지 값 (_DECISIONS.md §6)
SOURCE_OPTIONS = ["블로그", "지원매치", "특허인증센터", "소개", "기타"]
SERVICE_OPTIONS = ["출원·심판", "지원사업 가점용 특허·인증", "절세·연구소", "기타"]
STAGE_OPTIONS = ["신규", "진행 중", "제안", "계약", "보류", "종료"]

# 원본 코드값 → Notion 값
LEGACY_SOURCE = {"blog": "블로그", "referral": "소개", "other": "기타"}
LEGACY_SERVICE = {"tax_consulting": "절세·연구소", "lab_management": "절세·연구소",
                  "venture_cert": "지원사업 가점용 특허·인증", "invention_cert": "지원사업 가점용 특허·인증",
                  "patent": "출원·심판", "other": "기타"}
LEGACY_SERVICE_LABELS = {"tax_consulting": "절세 컨설팅", "lab_management": "연구소 관리", "venture_cert": "벤처인증",
                         "invention_cert": "발명인증", "patent": "특허", "other": "기타"}
STAGE_TO_VISITOR = {"신규": "S3", "진행 중": "S4", "제안": "S4", "보류": "S4", "종료": "S4", "계약": "S5"}
CONSULTATION_TO_STAGE = {"consulted": "진행 중", "proposal_sent": "제안", "pending": "보류", "lost": "종료"}

LEAD_KEYS = {"회사명": "company_name", "상담일": "contact_date", "유입 경로": "source_ko", "경유 글": "source_content",
             "관심 서비스": "services", "상태": "stage", "계약 여부": "contract_yn", "계약 금액": "contract_amount",
             "메모": "notes", "담당자명": "contact_name", "연락처": "contact_info"}


def load_json(path):
    if path == "-":
        return json.load(sys.stdin)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def js_round(x):
    return math.floor(x + 0.5)


def fmt_won(n):
    return f"{int(n):,}원"


def to_bool(v):
    if isinstance(v, str):
        return v.strip() in ("__YES__", "true", "True", "예", "Y", "y", "1", "계약")
    return bool(v)


def normalize_lead(l):
    out = dict(l)
    for k, v in l.items():
        if k in LEAD_KEYS and LEAD_KEYS[k] not in l:
            out[LEAD_KEYS[k]] = v
    # 유입 경로
    if not out.get("source_ko"):
        out["source_ko"] = LEGACY_SOURCE.get(out.get("source"), out.get("source"))
    # 관심 서비스(다중)
    sv = out.get("services")
    if isinstance(sv, str):
        try:
            sv = json.loads(sv)
        except ValueError:
            sv = [s.strip() for s in sv.split(",") if s.strip()]
    if not sv and out.get("interested_service"):
        sv = [LEGACY_SERVICE.get(out["interested_service"], "기타")]
    out["services"] = sv or []
    # 단계
    if not out.get("stage"):
        vs = out.get("visitor_status")
        if vs == "S5":
            out["stage"] = "계약"
        elif vs == "S4":
            out["stage"] = CONSULTATION_TO_STAGE.get(out.get("consultation_result"), "진행 중")
        elif vs == "S3":
            out["stage"] = "신규"
    out["visitor_status"] = out.get("visitor_status") or STAGE_TO_VISITOR.get(out.get("stage"))
    out["contract_yn"] = to_bool(out.get("contract_yn"))
    # 경유 글
    if not out.get("source_content_id") and out.get("source_content"):
        sc = out["source_content"]
        if isinstance(sc, str) and sc.startswith("["):
            try:
                sc = json.loads(sc)
            except ValueError:
                pass
        out["source_content_id"] = sc[0] if isinstance(sc, list) and sc else sc
    return out


def cmd_stats(args):
    leads = [normalize_lead(l) for l in load_json(args.leads)]
    total = len(leads)
    s3 = sum(1 for l in leads if l.get("visitor_status") == "S3")
    s4 = sum(1 for l in leads if l.get("visitor_status") == "S4")
    s5 = sum(1 for l in leads if l.get("visitor_status") == "S5")
    reached_s4 = s4 + s5
    consultation_rate = js_round(reached_s4 / total * 100) if total > 0 else 0
    contract_rate = js_round(s5 / reached_s4 * 100) if reached_s4 > 0 else 0
    amount = sum(l.get("contract_amount") or 0 for l in leads if l.get("contract_yn") and l.get("contract_amount"))
    total_from_s3 = s3 + s4 + s5
    s3_to_s4 = js_round(reached_s4 / total_from_s3 * 100) if total_from_s3 > 0 else 0
    s4_to_s5 = js_round(s5 / reached_s4 * 100) if reached_s4 > 0 else 0
    sources = {k: 0 for k in SOURCE_OPTIONS}
    for l in leads:
        k = l.get("source_ko") or "기타"
        sources[k] = sources.get(k, 0) + 1
    source_dist = [{"name": k, "value": v, "percent": f"{(v / total * 100):.0f}%" if total else "0%"}
                   for k, v in sources.items() if v > 0]
    stages = {k: sum(1 for l in leads if l.get("stage") == k) for k in STAGE_OPTIONS}
    services = {k: 0 for k in SERVICE_OPTIONS}
    for l in leads:
        for sv in l["services"] or ["미지정"]:
            services[sv] = services.get(sv, 0) + 1
    print(json.dumps({
        "kpi_cards": [
            {"title": "총 리드 수", "value": total},
            {"title": "상담 전환율 (S3→S4)", "value": f"{consultation_rate}%"},
            {"title": "계약 전환율 (S4→S5)", "value": f"{contract_rate}%"},
            {"title": "누적 계약금액", "value": fmt_won(amount)},
        ],
        "pipeline": [{"name": "리드 (S3, 신규)", "count": s3}, {"name": "상담 (S4, 진행 중·제안·보류·종료)", "count": s4},
                     {"name": "계약 (S5)", "count": s5}],
        "pipeline_rates": {"s3ToS4Rate": s3_to_s4, "s4ToS5Rate": s4_to_s5},
        "stage_counts": stages,
        "source_distribution": source_dist,
        "interested_service_counts": services,
    }, ensure_ascii=False, indent=2))


def content_key_map(contents):
    m = {}
    for c in contents:
        for k in ("id", "url", "발행 URL", "naver_url", "제목", "title"):
            if c.get(k):
                m[str(c[k])] = c
    return m


def cmd_attribution(args):
    leads = [normalize_lead(l) for l in load_json(args.leads)]
    contents = load_json(args.contents) if args.contents else []
    by_key = content_key_map(contents)
    agg = {}
    for l in leads:
        sid = l.get("source_content_id")
        if not sid:
            continue
        a = agg.setdefault(str(sid), {"leads": 0, "consulted": 0, "contracts": 0, "contract_amount": 0})
        a["leads"] += 1
        if l.get("visitor_status") in ("S4", "S5"):
            a["consulted"] += 1
        if l.get("contract_yn"):
            a["contracts"] += 1
            a["contract_amount"] += l.get("contract_amount") or 0
    rows = []
    for sid, a in agg.items():
        c = by_key.get(sid, {})
        views = next((c.get(k) for k in ("views_1m", "조회수(최근)", "views_1w") if c.get(k) is not None), None)
        rate = (a["leads"] / views * 100) if views else None
        rows.append({"content": sid, "title": c.get("title") or c.get("제목") or "제목 없음", "views": views,
                     **a, "lead_per_view_percent": round(rate, 3) if rate is not None else None})
    rows.sort(key=lambda r: (-r["leads"], -r["contract_amount"]))
    blog_total = sum(1 for l in leads if l.get("source_ko") == "블로그")
    blog_no_post = sum(1 for l in leads if l.get("source_ko") == "블로그" and not l.get("source_content_id"))
    print(json.dumps({"by_post": rows, "blog_leads": blog_total, "blog_leads_without_post": blog_no_post,
                      "note": "글별 상담 건수는 원본 getTopPerformingPosts 와 같은 방식(경유 글 집계). "
                              "lead_per_view_percent 는 스킬 보완 지표."}, ensure_ascii=False, indent=2))


def cmd_new_lead(args):
    """leads.ts createLead() 규칙 + Notion 상담 DB 선택지로 저장할 행."""
    inp = normalize_lead(load_json(args.input))
    name = (inp.get("company_name") or "").strip()
    if not name:
        print(json.dumps({"ok": False, "error": "회사명은 필수 입력 항목입니다."}, ensure_ascii=False, indent=2))
        return
    source = inp.get("source_ko") or "블로그"
    if source not in SOURCE_OPTIONS:
        print(json.dumps({"ok": False, "error": f"유입 경로는 {SOURCE_OPTIONS} 중 하나여야 합니다."},
                         ensure_ascii=False, indent=2))
        return
    bad = [s for s in inp["services"] if s not in SERVICE_OPTIONS]
    if bad:
        print(json.dumps({"ok": False, "error": f"관심 서비스 값이 올바르지 않습니다: {bad}",
                          "allowed": SERVICE_OPTIONS}, ensure_ascii=False, indent=2))
        return
    stage = inp.get("stage") or "신규"
    if stage not in STAGE_OPTIONS:
        print(json.dumps({"ok": False, "error": f"상태는 {STAGE_OPTIONS} 중 하나여야 합니다."},
                         ensure_ascii=False, indent=2))
        return
    notes = (inp.get("notes") or "").strip()
    extra = [f"담당자 {inp['contact_name'].strip()}" for _ in [0] if (inp.get("contact_name") or "").strip()]
    extra += [f"연락처 {inp['contact_info'].strip()}" for _ in [0] if (inp.get("contact_info") or "").strip()]
    if extra:
        notes = (notes + "\n" if notes else "") + " · ".join(extra)
    notion_row = {
        "회사명": name,
        "상담일": inp.get("contact_date") or args.today or date.today().isoformat(),
        "유입 경로": source,
        "경유 글": (inp.get("source_content_id") or None) if source == "블로그" else None,
        "관심 서비스": inp["services"],
        "상태": stage,
        "계약 여부": bool(inp.get("contract_yn")),
        "계약 금액": inp.get("contract_amount"),
        "메모": notes or None,
    }
    warn = []
    if source != "블로그" and inp.get("source_content_id"):
        warn.append("원본 규칙: 경유 글은 유입 경로가 '블로그'일 때만 저장합니다(지원매치·특허인증센터 경유 글을 남기려면 메모에).")
    print(json.dumps({"ok": True, "notion_row": notion_row, "warnings": warn,
                      "legacy_equivalent": {"visitor_status": STAGE_TO_VISITOR[stage], "source": next(
                          (k for k, v in LEGACY_SOURCE.items() if v == source), None)}},
                     ensure_ascii=False, indent=2))


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
        r = next((r for r in rankings if r.get("keyword_id") == kid and str(r.get("month"))[:7] == m[:7]), None)
        return r.get("rank") if r else None

    rows = []
    for k in keywords:
        kid = k.get("id") or k.get("keyword")
        cr, lr = rank(kid, cur_m), rank(kid, last_m)
        change, trend = None, "-"
        if cr is not None and lr is not None:
            change = lr - cr
            trend = "상승" if change > 0 else ("하락" if change < 0 else "유지")
        rows.append({"keyword_id": kid, "keyword": k.get("keyword"),
                     "this_month": cr, "last_month": lr, "change": change, "trend": trend})
    print(json.dumps({"current_month": cur_m, "last_month": last_m, "rows": rows,
                      "note": "순위 null = TOP 100 밖 또는 미입력. 변동 = 지난달 - 이번달(양수=개선)."},
                     ensure_ascii=False, indent=2))


def main():
    p = argparse.ArgumentParser(description="디딤 블로그 상담(리드) KPI·전환 기여·키워드 순위 — JSON 입출력")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("stats", help="리드 KPI 4카드·파이프라인·상태·유입 경로·관심 서비스 분포")
    s.add_argument("--leads", required=True, help="상담 행 JSON 배열(Notion 한글 속성명 또는 leads 컬럼명)")
    s.set_defaults(func=cmd_stats)

    a = sub.add_parser("attribution", help="경유 글별 상담·계약 집계(전환 기여)")
    a.add_argument("--leads", required=True)
    a.add_argument("--contents", help="콘텐츠 배열(제목·조회수(최근)·발행 URL)")
    a.set_defaults(func=cmd_attribution)

    n = sub.add_parser("new-lead", help="새 상담 입력 검증 → Notion 상담 DB 에 쓸 행")
    n.add_argument("--input", required=True, help="{회사명, 유입 경로, 경유 글, 관심 서비스[], 상태, 메모 …}")
    n.add_argument("--today", help="상담일 기본값 YYYY-MM-DD (기본: 오늘)")
    n.set_defaults(func=cmd_new_lead)

    k = sub.add_parser("keyword-rank", help="키워드 월별 순위(이번 달/지난 달/변동)")
    k.add_argument("--keywords", required=True, help="[{id?, keyword, priority?}]")
    k.add_argument("--rankings", help="[{keyword_id(또는 키워드), month:'YYYY-MM(-01)', rank}]")
    k.add_argument("--now", help="기준일 YYYY-MM-DD")
    k.add_argument("--only-high", action="store_true", help="원본처럼 HIGH 키워드만")
    k.set_defaults(func=cmd_keyword_rank)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
