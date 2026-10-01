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
(없는 키는 빈 배열). contents 는 Notion "디딤 블로그 콘텐츠" 한글 속성명(상태 'S4 발행완료', 조회수(최근),
댓글 수, 발행일 …), leads 는 "디딤 블로그 상담" 속성명(상담일·상태·계약 여부·계약 금액·경유 글)도 받는다.
서버 함수는 Vercel(UTC) 기준이므로 기본 시간대는 UTC.

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
    # Notion: 카테고리="레거시"(또는 디딤 다이어리) 이면 "2차 분류" 값(원래 이름)으로 판정
    sub = c.get("legacy_sub") or c.get("2차 분류") or c.get("레거시 2차 분류")
    if sub and (c.get("category_name") in ("레거시", "디딤 다이어리") or c.get("카테고리") in ("레거시", "디딤 다이어리")):
        r = resolve_category(sub)
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
    "콘텐츠 ID": "id", "제목": "title", "2차 분류": "legacy_sub", "레거시 2차 분류": "legacy_sub",
    "상담": "consultations", "키워드": "keyword_pages", "디딤 소식 종류": "news_kind", "CTA": "cta_type",
    "면책 레벨": "disclaimer_level", "검수 상태": "review_status_ko", "수정 횟수": "revision_count",
    "검수 메모": "review_memo", "SEO 점수": "seo_score", "SEO 판정": "seo_verdict_ko",
    "교차검증": "cross_validation_ko", "교차검증일": "cross_validated_at", "건강 상태": "health_status_ko", "상태": "status", "카테고리": "category_name",
    "categoryNo": "category_no", "타깃 키워드": "target_keyword",
    "발행예정일": "publish_date",  # SLA 역산·캘린더 기준 (초안 단계부터 기입)
    "발행일": "published_at",      # 실제 발행 후에만 기입
    "발행 URL": "naver_url", "추천 소스": "rec_source", "추천 피드백": "rec_feedback",
    "부적합 사유": "rec_reject_reason", "조회수(최근)": "views_recent", "유입 키워드 TOP3": "top_keywords",
    "댓글 수": "comments", "성과 갱신일": "metrics_updated_at", "시리즈": "series_name",
    "시리즈 회차": "series_order", "마지막 업데이트일": "last_updated_at", "메모": "notes",
    "본문": "body", "태그": "tags", "삭제됨": "is_deleted",
}
REVIEW_KO = {"미검수": "pending", "승인": "approved", "수정 요청": "revision_requested", "재검수 요청": "pending"}
REVIEW_TO_KO = {"pending": "미검수", "approved": "승인", "revision_requested": "수정 요청"}
SEO_VERDICT_KO = {"통과": "pass", "수정 필요": "fix_required", "발행 불가": "blocked"}
HEALTH_KO = {"정상": "HEALTHY", "업데이트 필요": "UPDATE_NEEDED", "법률 변경 확인": "CHECK_NEEDED"}
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
    if out.get("review_status") is None and out.get("review_status_ko") in REVIEW_KO:
        out["review_status"] = REVIEW_KO[out["review_status_ko"]]
    if out.get("seo_verdict") is None and out.get("seo_verdict_ko") in SEO_VERDICT_KO:
        out["seo_verdict"] = SEO_VERDICT_KO[out["seo_verdict_ko"]]
    if out.get("health_status") is None and out.get("health_status_ko") in HEALTH_KO:
        out["health_status"] = HEALTH_KO[out["health_status_ko"]]
    if out.get("news_kind") == "사무소 소식":
        out["no_cta"] = True  # _DECISIONS.md §5: 사무소 소식은 CTA 없음
    if isinstance(out.get("tags"), str):
        out["tags"] = [t.strip() for t in out["tags"].replace("#", ",").split(",") if t.strip()]
    if out.get("status") in ("S4", "S5") and not out.get("published_at") and out.get("publish_date"):
        out["published_at"] = out["publish_date"]  # 발행일 미기입 시 발행예정일로 대체
    if out.get("views_1m") is None and out.get("views_recent") is not None:
        out["views_1m"] = out["views_recent"]
    return out


# Notion "디딤 블로그 상담" (collection://e1272822-7efd-4850-b8c8-cfce02db7d00) → leads 컬럼
LEAD_KEYS = {"회사명": "company_name", "상담일": "contact_date", "유입 경로": "source_ko", "경유 글": "source_content",
             "관심 서비스": "services", "상태": "stage", "계약 여부": "contract_yn", "계약 금액": "contract_amount", "메모": "notes"}
STAGE_TO_VISITOR = {"신규": "S3", "진행 중": "S4", "제안": "S4", "보류": "S4", "종료": "S4", "계약": "S5"}


def normalize_lead(l):
    out = dict(l)
    for k, v in l.items():
        if k in LEAD_KEYS and LEAD_KEYS[k] not in l:
            out[LEAD_KEYS[k]] = v
    if not out.get("visitor_status"):
        out["visitor_status"] = STAGE_TO_VISITOR.get(out.get("stage"))
    cy = out.get("contract_yn")
    out["contract_yn"] = (cy.strip() in ("__YES__", "true", "예")) if isinstance(cy, str) else bool(cy)
    if out.get("contact_date") is not None:
        out["contact_date"] = str(out["contact_date"])[:10]
    if not out.get("source_content_id") and out.get("source_content"):
        sc = out["source_content"]
        if isinstance(sc, str) and sc.startswith("["):
            try:
                sc = json.loads(sc)
            except ValueError:
                pass
        out["source_content_id"] = sc[0] if isinstance(sc, list) and sc else sc
    return out


def load_data(path):
    if path == "-":
        d = json.load(sys.stdin)
    else:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
    for k in ("contents", "leads", "content_metrics", "category_metrics"):
        d.setdefault(k, [])
    d["contents"] = [normalize_content(c) for c in d["contents"]]
    for c in d["contents"]:
        c.setdefault("id", c.get("title"))
    d["leads"] = [normalize_lead(l) for l in d["leads"]]
    return d


def pub_statuses(args):
    return ("S4",) if getattr(args, "s4_only", False) else ("S4", "S5")


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
        "weeklyPublished": weekly, "weeklyTarget": args.weekly_target,
        "monthlyViews": monthly_views, "monthlyViewsChange": views_change,
        "avgQualityScore": avg_quality, "avgQualityChange": None,
        "activeLeads": active_leads, "activeLeadsChange": None,
        "conversionRate": None, "conversionRateChange": None,
        "totalContents": total_contents,
    }
    cards = [
        {"title": "이번 주 발행", "value": f"{weekly}/{args.weekly_target}건"},
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
                      if c.get("status") in pub_statuses(args) and not_deleted_eq_false(c) and c.get("views_1m") is not None)
    consultations = sum(1 for l in d["leads"] if str(l.get("contact_date", "")) >= first_day)
    contracts = sum(1 for l in d["leads"] if l.get("contract_yn") is True and str(l.get("contact_date", "")) >= first_day)
    print(json.dumps({"month": now.strftime("%Y-%m"),
                      "summary": {"totalViews": total_views, "consultations": consultations, "contracts": contracts},
                      "note": "totalViews 는 원본대로 S4 글의 views_1m 누계(이번 달 필터 없음)"},
                     ensure_ascii=False, indent=2))


# ── recommendations.ts getTopPerformingPosts ──

def cmd_top_posts(args):
    d = load_data(args.data)
    posts = [c for c in d["contents"] if c.get("status") in pub_statuses(args) and not_deleted_eq_false(c) and c.get("views_1m") is not None]
    posts.sort(key=lambda c: -(c.get("views_1m") or 0))
    posts = posts[:5]
    counts = {}
    for l in d["leads"]:
        sid = l.get("source_content_id")
        if sid:
            counts[sid] = counts.get(sid, 0) + 1
    def lead_count(p):
        return sum(counts.get(str(k), 0) for k in {p.get("id"), p.get("title"), p.get("naver_url")} if k)

    out = [{"id": p.get("id"), "title": p.get("title") or "제목 없음", "views": p.get("views_1m") or 0,
            "consultations": lead_count(p)} for p in posts]
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
    notion = {"조회수(최근)": args.views_1w, "댓글 수": args.comments,
              "성과 갱신일": now.astimezone(timezone(timedelta(hours=9))).strftime("%Y-%m-%d")}
    if args.top_keywords:
        notion["유입 키워드 TOP3"] = ", ".join([k.strip() for k in args.top_keywords.split(",") if k.strip()][:3])
    if args.to_s5:
        notion["상태"] = "S5 성과측정"
    print(json.dumps({"contents_update_original": update, "notes_append_original": block,
                      "notion_content_update": {k: v for k, v in notion.items() if v is not None},
                      "report_only": {"이웃 추가": args.neighbor_added, "상담 유입": bool(args.consultation)},
                      "note": "Notion 에는 별도 성과 DB 가 없다(_DECISIONS.md §4). 이웃 추가는 저장 열이 없어 보고만, "
                              "상담 유입은 '디딤 블로그 상담' DB 에 경유 글로 기록한다. 메모 열은 사람 전용이라 쓰지 않는다."},
                     ensure_ascii=False, indent=2))


def main():
    p = argparse.ArgumentParser(description="디딤 블로그 KPI·대시보드 요약·성과 분석 — JSON 입출력")
    sub = p.add_subparsers(dest="cmd", required=True)

    def add(name, func, help_, now=False):
        s = sub.add_parser(name, help=help_)
        s.add_argument("--data", required=True,
                       help='{"contents":[],"leads":[],"content_metrics":[],"category_metrics":[]} — Notion 한글 속성명 행도 가능')
        s.add_argument("--s4-only", action="store_true", help="원본처럼 S4 만 발행 글로 집계(기본 S4·S5)")
        if now:
            s.add_argument("--now", help="기준 시각 ISO (기본: 현재 UTC)")
        s.set_defaults(func=func)
        return s

    dsh = add("dashboard", cmd_dashboard, "대시보드 KPI 카드 5종", now=True)
    dsh.add_argument("--weekly-target", type=int, default=1, help="주간 발행 목표(결정 사항: 주 1편, 원본 상수 3)")
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
    sn.add_argument("--top-keywords", help="유입 키워드 TOP3 (콤마 구분)")
    sn.add_argument("--to-s5", action="store_true", help="S4→S5 전이와 함께 기록(상태 'S5 성과측정')")
    sn.add_argument("--now", help="기준 시각 ISO (UTC 표기로 스탬프)")
    sn.set_defaults(func=cmd_snapshot)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
