#!/usr/bin/env python3
"""디딤 블로그 성과 KPI·대시보드 요약 — 원본 TS 포팅.

원본:
  - src/actions/dashboard.ts       : getDashboardKPI()  (KPI 카드 5종)
  - src/actions/analytics.ts       : getMonthlyKPI(), getMonthlyKPIFallback(), getAnalyticsSummary(),
                                     getContentRankings()
  - src/actions/recommendations.ts : getMonthlySummary(), getTopPerformingPosts()
  - src/components/analytics/quality-ranking.tsx     : TOP 10 / 하위 5
  - src/components/analytics/category-comparison.tsx : 레이더 정규화(최근 월, 최댓값 대비 %)
  - src/lib/utils/quality-score.ts : calculateQualityScore(), getQualityGrade()
  - src/actions/keywords.ts        : saveContentPerformance() (성과 저장 → content_metrics 행)

입력: 하나의 JSON 파일 {"contents":[], "leads":[], "content_metrics":[], "category_metrics":[]}
(없는 키는 빈 배열). 서버 함수는 Vercel(UTC) 기준이므로 기본 시간대는 UTC.

사용 예:
  python3 dashboard_kpi.py dashboard --data data.json --now 2026-10-01T03:00:00Z
  python3 dashboard_kpi.py summary   --data data.json --now 2026-10-01T03:00:00Z
  python3 dashboard_kpi.py top-posts --data data.json
  python3 dashboard_kpi.py analytics --data data.json
  python3 dashboard_kpi.py rankings  --data data.json
  python3 dashboard_kpi.py radar     --data data.json
  python3 dashboard_kpi.py quality   --data data.json --month 2026-09
  python3 dashboard_kpi.py metric-row --content-id W40-01 --views-1m 1200 --cta-clicks 3 --today 2026-10-01
"""
import argparse
import json
import math
import re
import sys
from datetime import datetime, timedelta, timezone

DAY = timedelta(days=1)


def load_data(path):
    if path == "-":
        d = json.load(sys.stdin)
    else:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
    for k in ("contents", "leads", "content_metrics", "category_metrics"):
        d.setdefault(k, [])
    return d


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


def get_now(args):
    return parse_js_date(args.now) if args.now else datetime.now(timezone.utc)


def js_round(x):
    """JS Math.round (0.5 는 +무한대 방향)."""
    return math.floor(x + 0.5)


def not_deleted_eq_false(c):
    # .eq("is_deleted", false): NULL 은 제외, 키가 없으면 DB 기본값 false
    return c.get("is_deleted", False) is False


def pct_change(cur, prev):
    return ((cur - prev) / prev) * 100 if prev > 0 else 0


# ── dashboard.ts getDashboardKPI ──

def cmd_dashboard(args):
    d = load_data(args.data)
    now = get_now(args)
    # weekStart = now 에서 getDay() 만큼 뺀 날(일요일) — 시각은 now 그대로 유지됨(원본 동작)
    js_day = (now.weekday() + 1) % 7  # JS getDay(): 일=0
    week_start = now - js_day * DAY
    week_end = week_start + 7 * DAY
    weekly = 0
    for c in d["contents"]:
        if c.get("status") in ("S4", "S5"):
            pa = parse_js_date(c.get("published_at"))
            if pa and week_start <= pa < week_end:
                weekly += 1
    total_contents = len(d["contents"])  # 원본은 is_deleted 필터 없음
    active_leads = sum(1 for l in d["leads"] if l.get("visitor_status") in ("S3", "S4"))
    q = [c["quality_score_final"] for c in d["contents"] if c.get("quality_score_final") is not None]
    avg_quality = js_round(sum(q) / len(q)) if q else None
    monthly_views = sum(c.get("views_1m") or 0 for c in d["contents"] if c.get("views_1m") is not None)

    this_month = now.strftime("%Y-%m")
    prev_month = (now.replace(day=1) - DAY).strftime("%Y-%m")
    this_total = sum(m.get("views") or 0 for m in d["content_metrics"] if str(m.get("measured_at", "")).startswith(this_month))
    prev_total = sum(m.get("views") or 0 for m in d["content_metrics"] if str(m.get("measured_at", "")).startswith(prev_month))
    views_change = js_round(((this_total - prev_total) / prev_total) * 100) if prev_total > 0 else None

    kpi = {
        "weeklyPublished": weekly, "weeklyTarget": 3,
        "monthlyViews": monthly_views, "monthlyViewsChange": views_change,
        "avgQualityScore": avg_quality, "avgQualityChange": None,
        "activeLeads": active_leads, "activeLeadsChange": None,
        "conversionRate": None, "conversionRateChange": None,
        "totalContents": total_contents,
    }
    cards = [
        {"title": "이번 주 발행", "value": f"{weekly}/3건"},
        {"title": "월간 조회수", "value": f"{monthly_views:,}" if monthly_views > 0 else "-",
         "change": views_change, "changeLabel": "전월 대비"},
        {"title": "평균 품질점수", "value": f"{avg_quality}점" if avg_quality is not None else "-"},
        {"title": "활성 리드", "value": f"{active_leads}건"},
        {"title": "총 콘텐츠", "value": f"{total_contents}건"},
    ]
    print(json.dumps({"now": now.isoformat(), "week_window": [week_start.isoformat(), week_end.isoformat()],
                      "kpi": kpi, "cards": cards}, ensure_ascii=False, indent=2))


# ── recommendations.ts getMonthlySummary ──

def cmd_summary(args):
    d = load_data(args.data)
    now = get_now(args)
    first_day = now.strftime("%Y-%m-01")
    total_views = sum(c.get("views_1m") or 0 for c in d["contents"]
                      if c.get("status") == "S4" and not_deleted_eq_false(c) and c.get("views_1m") is not None)
    consultations = sum(1 for l in d["leads"] if str(l.get("contact_date", "")) >= first_day)
    contracts = sum(1 for l in d["leads"] if l.get("contract_yn") is True and str(l.get("contact_date", "")) >= first_day)
    print(json.dumps({"month": now.strftime("%Y-%m"),
                      "summary": {"totalViews": total_views, "consultations": consultations, "contracts": contracts},
                      "note": "totalViews 는 원본대로 S4 글의 views_1m 누계(이번 달 필터 없음)"},
                     ensure_ascii=False, indent=2))


# ── recommendations.ts getTopPerformingPosts ──

def cmd_top_posts(args):
    d = load_data(args.data)
    posts = [c for c in d["contents"] if c.get("status") == "S4" and not_deleted_eq_false(c) and c.get("views_1m") is not None]
    posts.sort(key=lambda c: -(c.get("views_1m") or 0))
    posts = posts[:5]
    counts = {}
    for l in d["leads"]:
        sid = l.get("source_content_id")
        if sid:
            counts[sid] = counts.get(sid, 0) + 1
    out = [{"id": p.get("id"), "title": p.get("title") or "제목 없음", "views": p.get("views_1m") or 0,
            "consultations": counts.get(p.get("id"), 0)} for p in posts]
    print(json.dumps({"top_posts": out}, ensure_ascii=False, indent=2))


# ── analytics.ts ──

def monthly_kpi(d):
    rows = sorted(d["content_metrics"], key=lambda r: str(r.get("measured_at", "")))
    months = {}
    for r in rows:
        m = str(r["measured_at"])[:7]
        e = months.setdefault(m, {"month": m, "totalViews": 0, "avgDuration": 0, "conversions": 0,
                                  "publishedCount": 0, "leadCount": 0, "contractAmount": 0})
        e["totalViews"] += r.get("views") or 0
        e["conversions"] += r.get("estimated_cta_clicks") or 0
    return list(months.values())


def monthly_kpi_fallback(d):
    months = {}
    for c in d["contents"]:
        if not c.get("published_at"):
            continue
        m = str(c["published_at"])[:7]
        e = months.setdefault(m, {"month": m, "totalViews": 0, "avgDuration": 0, "conversions": 0,
                                  "publishedCount": 0, "leadCount": 0, "contractAmount": 0})
        e["totalViews"] += c.get("views_1m") or 0
        e["conversions"] += c.get("cta_clicks") or 0
        e["publishedCount"] += 1
    return sorted(months.values(), key=lambda e: e["month"])


def analytics_summary(kpi):
    zero = {"totalViews": 0, "totalViewsChange": 0, "avgDuration": 0, "avgDurationChange": 0,
            "publishedCount": 0, "publishedCountChange": 0, "conversionRate": 0, "conversionRateChange": 0}
    if len(kpi) >= 2:
        cur, prev = kpi[-1], kpi[-2]
        cur_rate = (cur["conversions"] / cur["totalViews"]) * 100 if cur["totalViews"] > 0 else 0
        prev_rate = (prev["conversions"] / prev["totalViews"]) * 100 if prev["totalViews"] > 0 else 0
        return {
            "totalViews": cur["totalViews"], "totalViewsChange": pct_change(cur["totalViews"], prev["totalViews"]),
            "avgDuration": cur["avgDuration"], "avgDurationChange": pct_change(cur["avgDuration"], prev["avgDuration"]),
            "publishedCount": cur["publishedCount"],
            "publishedCountChange": pct_change(cur["publishedCount"], prev["publishedCount"]),
            "conversionRate": cur_rate,
            "conversionRateChange": ((cur_rate - prev_rate) / prev_rate) * 100 if prev_rate > 0 else 0,
        }
    if len(kpi) == 1:
        cur = kpi[0]
        zero.update({"totalViews": cur["totalViews"], "avgDuration": cur["avgDuration"],
                     "publishedCount": cur["publishedCount"],
                     "conversionRate": (cur["conversions"] / cur["totalViews"]) * 100 if cur["totalViews"] > 0 else 0})
    return zero


def fmt_duration(sec):
    sec = int(sec)
    m, s = sec // 60, sec % 60
    return f"{s}초" if m == 0 else f"{m}분 {s}초"


def cmd_analytics(args):
    d = load_data(args.data)
    kpi = monthly_kpi(d)
    source = "content_metrics"
    kpi_for_summary = kpi
    if len(kpi) == 0:
        kpi_for_summary = monthly_kpi_fallback(d)
        source = "contents 폴백(published_at 월별)"
    s = analytics_summary(kpi_for_summary)
    cards = [
        {"title": "이번 달 조회수", "value": f"{s['totalViews']:,}", "change": s["totalViewsChange"]},
        {"title": "평균 체류시간", "value": fmt_duration(s["avgDuration"]), "change": s["avgDurationChange"]},
        {"title": "발행 건수", "value": f"{s['publishedCount']}건", "change": s["publishedCountChange"]},
        {"title": "전환율", "value": f"{s['conversionRate']:.2f}%", "change": s["conversionRateChange"]},
    ]
    print(json.dumps({"monthly_kpi_trend": kpi, "summary_source": source, "summary_series": kpi_for_summary,
                      "summary": s, "cards": cards,
                      "note": "원본 getMonthlyKPI 는 avgDuration·publishedCount·leadCount·contractAmount 를 계산하지 않아 0 입니다."},
                     ensure_ascii=False, indent=2))


def cmd_rankings(args):
    d = load_data(args.data)
    rows = [c for c in d["contents"] if c.get("quality_score_final") is not None]
    rows.sort(key=lambda c: -c["quality_score_final"])
    data = [{"id": c.get("id"), "title": c.get("title") or "",
             "category_name": c.get("category_name") or "",
             "quality_score": c.get("quality_score_final") or 0,
             "grade": c.get("quality_grade") or "average",
             "views": c.get("views_1m") if c.get("views_1m") is not None else (c.get("views_1w") or 0),
             "avg_duration_sec": c.get("avg_duration_sec") or 0,
             "search_rank": c.get("search_rank"), "cta_clicks": c.get("cta_clicks") or 0} for c in rows]
    srt = sorted(data, key=lambda r: -r["quality_score"])
    top10 = srt[:10]
    bottom5 = list(reversed(srt[-5:]))
    print(json.dumps({"top10": top10, "bottom5": bottom5, "bottom_start_rank": len(srt) - 4},
                     ensure_ascii=False, indent=2))


def cmd_radar(args):
    d = load_data(args.data)
    data = d["category_metrics"]
    if not data:
        print(json.dumps({"latest_month": "", "radar": []}, ensure_ascii=False, indent=2))
        return
    latest = data[0]["month"]
    for r in data:
        if r["month"] > latest:
            latest = r["month"]
    rows = [r for r in data if r["month"] == latest]

    def mx(key):
        return max([r.get(key) or 0 for r in rows] + [1])

    maxes = {"published_count": mx("published_count"), "total_views": mx("total_views"),
             "avg_duration_sec": mx("avg_duration_sec"), "estimated_conversions": mx("estimated_conversions")}
    axes = [("발행률", "published_count"), ("조회수", "total_views"), ("체류시간", "avg_duration_sec"),
            ("전환수", "estimated_conversions")]
    radar = []
    for label, key in axes:
        e = {"axis": label}
        for r in rows:
            m = maxes[key]
            e[r.get("category_name") or r.get("category_id")] = js_round(((r.get(key) or 0) / m) * 100) if m else 0
        radar.append(e)
    print(json.dumps({"latest_month": latest, "radar": radar}, ensure_ascii=False, indent=2))


# ── quality-score.ts ──

def quality_grade(score):
    if score >= 80:
        return "excellent"
    if score >= 60:
        return "good"
    if score >= 40:
        return "average"
    if score >= 20:
        return "poor"
    return "critical"


GRADE_KO = {"excellent": "우수", "good": "양호", "average": "보통", "poor": "미흡", "critical": "위험"}


def cmd_quality(args):
    """월별 상대평가 품질점수 (원본 함수 그대로, 대상 월은 published_at 기준)."""
    d = load_data(args.data)
    rows = [c for c in d["contents"] if str(c.get("published_at") or "").startswith(args.month)
            and c.get("status") in ("S4", "S5") and not c.get("is_deleted")]
    max_views = max([c.get("views_1m") or 0 for c in rows] + [0])
    max_dur = max([c.get("avg_duration_sec") or 0 for c in rows] + [0])
    max_cta = max([c.get("cta_clicks") or 0 for c in rows] + [0])
    out = []
    for c in rows:
        vn = ((c.get("views_1m") or 0) / max_views) * 100 if max_views > 0 else 0
        dn = ((c.get("avg_duration_sec") or 0) / max_dur) * 100 if max_dur > 0 else 0
        cn = ((c.get("cta_clicks") or 0) / max_cta) * 100 if max_cta > 0 else 0
        score = vn * 0.4 + dn * 0.3 + cn * 0.3
        g = quality_grade(score)
        out.append({"id": c.get("id"), "title": c.get("title"), "quality_score": round(score, 2),
                    "quality_grade": g, "grade_ko": GRADE_KO[g]})
    out.sort(key=lambda r: -r["quality_score"])
    print(json.dumps({"month": args.month, "monthly_max": {"views_1m": max_views, "avg_duration_sec": max_dur,
                      "cta_clicks": max_cta}, "scores": out,
                      "note": "원본 코드에는 이 점수를 quality_score_final 에 저장하는 경로가 없습니다(확인 필요)."},
                     ensure_ascii=False, indent=2))


def cmd_metric_row(args):
    """keywords.ts saveContentPerformance(): contents 갱신 + content_metrics upsert 행."""
    contents_update = {k: v for k, v in {
        "views_1w": args.views_1w, "views_1m": args.views_1m, "avg_duration_sec": args.avg_duration,
        "search_rank": args.search_rank, "cta_clicks": args.cta_clicks}.items()}
    today = args.today or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    row = {"content_id": args.content_id, "measured_at": today,
           "views": args.views_1m if args.views_1m is not None else 0,
           "avg_duration_sec": args.avg_duration, "search_rank": args.search_rank,
           "estimated_cta_clicks": args.cta_clicks if args.cta_clicks is not None else 0, "source": "manual"}
    print(json.dumps({"contents_update": contents_update, "content_metrics_upsert": row,
                      "upsert_key": ["content_id", "measured_at"]}, ensure_ascii=False, indent=2))


def cmd_snapshot(args):
    """contents.ts updateContentStatusWithMeta(): S4→S5 성과 스냅샷 저장 형태."""
    now = get_now(args)
    update = {}
    if args.views_1w is not None:
        update["views_1w"] = args.views_1w
    if args.comments is not None:
        update["cta_clicks"] = args.comments  # 원본 매핑 그대로: 댓글 수 → cta_clicks 컬럼
    parts = []
    if args.views_1w is not None:
        parts.append(f"조회수 {args.views_1w}")
    if args.comments is not None:
        parts.append(f"댓글 {args.comments}")
    if args.neighbor_added is not None:
        parts.append(f"이웃 +{args.neighbor_added}")
    parts.append(f"상담 {'유입' if args.consultation else '없음'}")
    stamp = now.strftime("%Y-%m-%d %H:%M")
    block = f"\n\n── {stamp} (S5) ──\n[성과 1주차] {' · '.join(parts)}"
    print(json.dumps({"contents_update": update, "notes_append": block,
                      "notion_performance_row": {"조회수": args.views_1w, "댓글 수": args.comments,
                                                 "이웃 추가 수": args.neighbor_added,
                                                 "상담 유입": bool(args.consultation), "측정 구분": "1주차"}},
                     ensure_ascii=False, indent=2))


def main():
    p = argparse.ArgumentParser(description="디딤 블로그 KPI·대시보드 요약·성과 분석 — JSON 입출력")
    sub = p.add_subparsers(dest="cmd", required=True)

    def add(name, func, help_, now=False):
        s = sub.add_parser(name, help=help_)
        s.add_argument("--data", required=True, help='{"contents":[],"leads":[],"content_metrics":[],"category_metrics":[]}')
        if now:
            s.add_argument("--now", help="기준 시각 ISO (기본: 현재 UTC)")
        s.set_defaults(func=func)
        return s

    add("dashboard", cmd_dashboard, "대시보드 KPI 카드 5종", now=True)
    add("summary", cmd_summary, "월간 성과 요약(조회수·상담·계약)", now=True)
    add("top-posts", cmd_top_posts, "조회수 TOP 5 + 글별 상담 건수")
    add("analytics", cmd_analytics, "월별 KPI 추이 + 성과 요약 4카드(전월 대비)")
    add("rankings", cmd_rankings, "품질 점수 TOP 10 / 하위 5")
    add("radar", cmd_radar, "카테고리 비교 레이더(최근 월 정규화)")
    q = add("quality", cmd_quality, "월별 상대평가 품질점수·등급")
    q.add_argument("--month", required=True, help="YYYY-MM")

    m = sub.add_parser("metric-row", help="성과 입력 → contents 갱신값 + content_metrics 행")
    m.add_argument("--content-id", required=True)
    m.add_argument("--views-1w", type=int)
    m.add_argument("--views-1m", type=int)
    m.add_argument("--avg-duration", type=int, help="평균 체류시간(초)")
    m.add_argument("--search-rank", type=int)
    m.add_argument("--cta-clicks", type=int)
    m.add_argument("--today", help="측정일 YYYY-MM-DD (기본: 오늘 UTC)")
    m.set_defaults(func=cmd_metric_row)

    sn = sub.add_parser("snapshot", help="S4→S5 1주차 성과 스냅샷(조회수·댓글·이웃·상담) 저장 형태")
    sn.add_argument("--views-1w", type=int)
    sn.add_argument("--comments", type=int)
    sn.add_argument("--neighbor-added", type=int)
    sn.add_argument("--consultation", action="store_true", help="상담 문의 있음")
    sn.add_argument("--now", help="기준 시각 ISO (UTC 표기로 스탬프)")
    sn.set_defaults(func=cmd_snapshot)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
