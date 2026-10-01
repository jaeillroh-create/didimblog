# KPI·대시보드 요약·성과 분석 원문

> 원본 그대로. 포팅: scripts/dashboard_kpi.py.

## 목차
1. 명세 — SPEC.md §4.1 대시보드, §4.7 성과 분석, §5.3 품질점수 / UPGRADE_SPEC Sprint 4·5
2. 대시보드 KPI — dashboard.ts getDashboardKPI, kpi-cards.tsx
3. 월간 성과 요약·TOP 글 — recommendations.ts getMonthlySummary, getTopPerformingPosts
4. 성과 분석 — analytics.ts 전체, analytics/page.tsx
5. 품질 랭킹·카테고리 비교 — quality-ranking.tsx, category-comparison.tsx
6. 품질점수 — lib/utils/quality-score.ts
7. 테이블 — 001 content_metrics, category_metrics

## 1. 명세
SPEC.md:420-426, 464-468, 517-529

```markdown
### 4.1 대시보드 (/dashboard)
**사용 빈도:** 매일
**핵심 컴포넌트:**
- KPI 카드 7개: 일일방문자, 월간방문자, 키워드순위, 평균체류시간, 이웃수, 상담문의, 계약체결
- 이번 주 할 일: 이번 주 발행 예정 글의 SLA 현황 (D-5~D-0 진행 상태)
- SLA 위반 알림: 기한 초과 항목 빨간색 하이라이트
- 최근 리드: 최근 5건의 상담 문의
```

```markdown
### 4.7 성과 분석 (/analytics)
- KPI 트렌드 차트 (월별 추이, Recharts LineChart)
- 글별 품질 랭킹 (Top 10 / Bottom 10)
- 카테고리 비교 (레이더 차트)
- 월간 리포트 자동 생성 (인쇄용)
```

```text
### 5.3 품질점수 계산 공식
```
quality_score = (views_normalized * 40) + (duration_normalized * 30) + (conversion_normalized * 30)

각 지표 정규화: 해당 월 전체 글 대비 상대 점수 (0~100)

등급:
- excellent: 80+
- good: 60~79
- average: 40~59
- poor: 20~39
- critical: 0~19
```
```

docs/UPGRADE_SPEC.md:684-699 (Sprint 4·5)

```markdown
### Sprint 4: 대시보드 + 추천 엔진
- [ ] 대시보드 홈 페이지 신규 생성
- [ ] 이번 주 추천 (4소스 종합): 카테고리 균형 + 키워드 커버리지 + 성과 기반 + 시의성 뉴스
- [ ] 월간 발행 현황 (카테고리별 진행률 바)
- [ ] 월간 성과 요약 (조회수 합계, 상담 건수, 계약 건수)
- [ ] 업데이트 필요 글 목록
- [ ] TOP 성과 글 (조회수 기준 TOP 5)
- [ ] DB 마이그레이션: keyword_pool + schedule_templates + 시드 데이터
- [ ] 같은 카테고리 연속 2주 방지 경고

### Sprint 5: 성과 추적
- [ ] 글별 성과 입력 탭 (조회수, 유입 키워드 TOP 3, 댓글 수, 이웃 추가 수)
- [ ] 상담 로그 페이지 (CRUD)
- [ ] 키워드 순위 추적 (타깃 키워드 등록 + 월별 순위 입력)
- [ ] 전환 기여 분석 (상담 로그의 경유 글 집계 → 글별 전환율)
- [ ] DB 마이그레이션: post_metrics + consultations + keyword_rankings
```

## 2. 대시보드 KPI — src/actions/dashboard.ts:1-151

```ts
"use server";

import { createClient } from "@/lib/supabase/server";

export interface DashboardKPI {
  weeklyPublished: number;
  weeklyTarget: number;
  monthlyViews: number;
  monthlyViewsChange: number | null;
  avgQualityScore: number | null;
  avgQualityChange: number | null;
  activeLeads: number;
  activeLeadsChange: number | null;
  conversionRate: number | null;
  conversionRateChange: number | null;
  totalContents: number;
}

export interface DashboardTask {
  id: string;
  label: string;
  status: string;
}

export interface DashboardSlaAlert {
  id: string;
  status: "overdue" | "warning" | "on-track";
  statusLabel: string;
  content: string;
  timeInfo: string;
}

export interface DashboardLead {
  id: number;
  company_name: string;
  interested_service: string | null;
  contact_date: string;
  visitor_status: string;
}

export async function getDashboardKPI(): Promise<DashboardKPI> {
  try {
    const supabase = await createClient();

    // 이번 주 발행 수
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const { count: weeklyPublished } = await supabase
      .from("contents")
      .select("*", { count: "exact", head: true })
      .in("status", ["S4", "S5"])
      .gte("published_at", weekStart.toISOString())
      .lt("published_at", weekEnd.toISOString());

    // 총 콘텐츠 수
    const { count: totalContents } = await supabase
      .from("contents")
      .select("*", { count: "exact", head: true });

    // 활성 리드 수 (S3, S4)
    const { count: activeLeads } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .in("visitor_status", ["S3", "S4"]);

    // 평균 품질점수
    const { data: qualityData } = await supabase
      .from("contents")
      .select("quality_score_final")
      .not("quality_score_final", "is", null);

    let avgQualityScore: number | null = null;
    if (qualityData && qualityData.length > 0) {
      const total = qualityData.reduce((sum, c) => sum + (c.quality_score_final ?? 0), 0);
      avgQualityScore = Math.round(total / qualityData.length);
    }

    // 월간 조회수 합계
    const { data: viewsData } = await supabase
      .from("contents")
      .select("views_1m")
      .not("views_1m", "is", null);

    let monthlyViews = 0;
    if (viewsData && viewsData.length > 0) {
      monthlyViews = viewsData.reduce((sum, c) => sum + (c.views_1m ?? 0), 0);
    }

    // 이번 달 vs 지난 달 content_metrics 비교로 monthlyViewsChange 계산
    let monthlyViewsChange: number | null = null;
    try {
      const thisMonth = now.toISOString().substring(0, 7); // YYYY-MM
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonth = prevDate.toISOString().substring(0, 7);

      const { data: thisMonthMetrics } = await supabase
        .from("content_metrics")
        .select("views")
        .gte("measured_at", `${thisMonth}-01`)
        .lt("measured_at", `${thisMonth}-32`);

      const { data: prevMonthMetrics } = await supabase
        .from("content_metrics")
        .select("views")
        .gte("measured_at", `${prevMonth}-01`)
        .lt("measured_at", `${prevMonth}-32`);

      const thisTotal = (thisMonthMetrics ?? []).reduce((s, r) => s + (r.views ?? 0), 0);
      const prevTotal = (prevMonthMetrics ?? []).reduce((s, r) => s + (r.views ?? 0), 0);

      if (prevTotal > 0) {
        monthlyViewsChange = Math.round(((thisTotal - prevTotal) / prevTotal) * 100);
      }
    } catch {
      // content_metrics 조회 실패 시 null 유지
    }

    return {
      weeklyPublished: weeklyPublished ?? 0,
      weeklyTarget: 3,
      monthlyViews,
      monthlyViewsChange,
      avgQualityScore,
      avgQualityChange: null,
      activeLeads: activeLeads ?? 0,
      activeLeadsChange: null,
      conversionRate: null,
      conversionRateChange: null,
      totalContents: totalContents ?? 0,
    };
  } catch (err) {
    console.error("[getDashboardKPI] 에러:", err);
    return {
      weeklyPublished: 0,
      weeklyTarget: 3,
      monthlyViews: 0,
      monthlyViewsChange: null,
      avgQualityScore: null,
      avgQualityChange: null,
      activeLeads: 0,
      activeLeadsChange: null,
      conversionRate: null,
      conversionRateChange: null,
      totalContents: 0,
    };
  }
}
```

src/components/dashboard/kpi-cards.tsx 전체

```tsx
import { KPICard } from "@/components/common/kpi-card";
import { getDashboardKPI } from "@/actions/dashboard";
import { EmptyState } from "@/components/common/empty-state";

/** 대시보드 상단 KPI 카드 — Supabase 실시간 데이터 */
export async function KpiCards() {
  const kpi = await getDashboardKPI();

  const isEmpty =
    kpi.totalContents === 0 &&
    kpi.activeLeads === 0 &&
    kpi.monthlyViews === 0;

  if (isEmpty) {
    return (
      <EmptyState
        icon={<span className="tf tf-14">📊</span>}
        title="아직 데이터가 없습니다"
        description="콘텐츠를 발행하고 리드를 등록하면 KPI가 여기에 표시됩니다."
      />
    );
  }

  const kpiData = [
    {
      title: "이번 주 발행",
      value: `${kpi.weeklyPublished}/${kpi.weeklyTarget}건`,
      icon: <span className="tf tf-14">📝</span>,
      change: undefined,
    },
    {
      title: "월간 조회수",
      value: kpi.monthlyViews > 0 ? kpi.monthlyViews.toLocaleString() : "-",
      icon: <span className="tf tf-14">👀</span>,
      change: kpi.monthlyViewsChange ?? undefined,
      changeLabel: "전월 대비",
    },
    {
      title: "평균 품질점수",
      value: kpi.avgQualityScore !== null ? `${kpi.avgQualityScore}점` : "-",
      icon: <span className="tf tf-14">⭐</span>,
      change: kpi.avgQualityChange ?? undefined,
      changeLabel: "전월 대비",
    },
    {
      title: "활성 리드",
      value: `${kpi.activeLeads}건`,
      icon: <span className="tf tf-14">👥</span>,
      change: kpi.activeLeadsChange ?? undefined,
      changeLabel: "전월 대비",
    },
    {
      title: "총 콘텐츠",
      value: `${kpi.totalContents}건`,
      icon: <span className="tf tf-14">📋</span>,
      change: undefined,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {kpiData.map((kpi) => (
        <KPICard
          key={kpi.title}
          title={kpi.title}
          value={kpi.value}
          icon={kpi.icon}
          change={kpi.change}
          changeLabel={kpi.changeLabel}
        />
      ))}
    </div>
  );
}
```

## 3. 월간 성과 요약·TOP 글 — src/actions/recommendations.ts:558-725

```ts
// ── 월간 성과 요약 ──

export interface MonthlySummary {
  totalViews: number;
  consultations: number;
  contracts: number;
}

export async function getMonthlySummary(): Promise<MonthlySummary> {
  try {
    const supabase = await createClient();
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

    // 조회수 합계
    const { data: viewsData } = await supabase
      .from("contents")
      .select("views_1m")
      .eq("status", "S4")
      .eq("is_deleted", false)
      .not("views_1m", "is", null);

    const totalViews = (viewsData ?? []).reduce(
      (sum, c) => sum + (c.views_1m ?? 0),
      0
    );

    // 이번 달 상담 건수
    const { count: consultations } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .gte("contact_date", firstDay.toISOString().split("T")[0]);

    // 이번 달 계약 건수
    const { count: contracts } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("contract_yn", true)
      .gte("contact_date", firstDay.toISOString().split("T")[0]);

    return {
      totalViews,
      consultations: consultations ?? 0,
      contracts: contracts ?? 0,
    };
  } catch (err) {
    console.error("[getMonthlySummary] 에러:", err);
    return { totalViews: 0, consultations: 0, contracts: 0 };
  }
}

// ── 업데이트 필요 글 ──

export interface UpdateNeededPost {
  id: string;
  title: string;
  publishedAt: string;
  daysSincePublish: number;
  categoryId: string;
}

export async function getUpdateNeededPosts(): Promise<UpdateNeededPost[]> {
  try {
    const supabase = await createClient();
    const now = new Date();

    // 발행 완료 글 중 60/90일 경과 글
    const { data } = await supabase
      .from("contents")
      .select("id, title, published_at, category_id, health_status")
      .eq("status", "S4")
      .eq("is_deleted", false)
      .not("published_at", "is", null)
      .order("published_at", { ascending: true });

    if (!data || data.length === 0) return [];

    const results: UpdateNeededPost[] = [];

    for (const post of data) {
      if (!post.published_at) continue;

      const publishedDate = new Date(post.published_at);
      const daysSince = Math.floor(
        (now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const primaryCat = getPrimaryCategoryId(post.category_id ?? "");

      // 현장수첩: 60일, 나머지: 90일
      const threshold = primaryCat === "CAT-A" ? 60 : 90;

      if (
        daysSince >= threshold ||
        post.health_status === "CHECK_NEEDED" ||
        post.health_status === "UPDATE_NEEDED"
      ) {
        results.push({
          id: post.id,
          title: post.title ?? "제목 없음",
          publishedAt: post.published_at,
          daysSincePublish: daysSince,
          categoryId: post.category_id ?? "",
        });
      }
    }

    return results.slice(0, 5);
  } catch (err) {
    console.error("[getUpdateNeededPosts] 에러:", err);
    return [];
  }
}

// ── TOP 성과 글 ──

export interface TopPerformingPost {
  id: string;
  title: string;
  views: number;
  consultations: number;
}

export async function getTopPerformingPosts(): Promise<TopPerformingPost[]> {
  try {
    const supabase = await createClient();

    // 조회수 TOP 5
    const { data: posts } = await supabase
      .from("contents")
      .select("id, title, views_1m")
      .eq("status", "S4")
      .eq("is_deleted", false)
      .not("views_1m", "is", null)
      .order("views_1m", { ascending: false })
      .limit(5);

    if (!posts || posts.length === 0) return [];

    // 각 글별 상담 건수 집계
    const { data: leads } = await supabase
      .from("leads")
      .select("source_content_id")
      .not("source_content_id", "is", null);

    const leadCounts: Record<string, number> = {};
    for (const lead of leads ?? []) {
      if (lead.source_content_id) {
        leadCounts[lead.source_content_id] =
          (leadCounts[lead.source_content_id] ?? 0) + 1;
      }
    }

    return posts.map((p) => ({
      id: p.id,
      title: p.title ?? "제목 없음",
      views: p.views_1m ?? 0,
      consultations: leadCounts[p.id] ?? 0,
    }));
  } catch (err) {
    console.error("[getTopPerformingPosts] 에러:", err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// 멀티소스 추천 (키워드 풀 / 뉴스 / 스케줄) — 2~3개 동시 표시
// 010 migration: content_recommendations 테이블을 사용해 피드백 저장 & 블랙리스트
// ─────────────────────────────────────────────────────────────
```

## 4. 성과 분석 — src/actions/analytics.ts 전체

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import type { QualityGrade } from "@/lib/types/database";

// ── 타입 정의 ──

export interface MonthlyKPI {
  month: string;
  totalViews: number;
  avgDuration: number;
  conversions: number;
  publishedCount: number;
  leadCount: number;
  contractAmount: number;
}

export interface ContentRanking {
  id: string;
  title: string;
  category_name: string;
  quality_score: number;
  grade: QualityGrade;
  views: number;
  avg_duration_sec: number;
  search_rank: number | null;
  cta_clicks: number;
}

export interface CategoryMetricData {
  category_id: string;
  category_name: string;
  month: string;
  published_count: number;
  target_ratio: number | null;
  total_views: number;
  avg_duration_sec: number;
  estimated_conversions: number;
  composite_score: number | null;
  grade: QualityGrade | null;
}

export interface AnalyticsSummary {
  totalViews: number;
  totalViewsChange: number;
  avgDuration: number;
  avgDurationChange: number;
  publishedCount: number;
  publishedCountChange: number;
  conversionRate: number;
  conversionRateChange: number;
}

// ── 헬퍼: contents 테이블에서 폴백 KPI 생성 ──

async function getMonthlyKPIFallback(): Promise<MonthlyKPI[]> {
  try {
    const supabase = await createClient();

    // published_at이 있는 콘텐츠에서 월별 집계
    const { data, error } = await supabase
      .from("contents")
      .select("published_at, views_1m, avg_duration_sec, cta_clicks")
      .not("published_at", "is", null);

    if (error || !data || data.length === 0) return [];

    const monthMap = new Map<string, MonthlyKPI>();
    for (const row of data) {
      const month = (row.published_at as string).substring(0, 7);
      const existing = monthMap.get(month) ?? {
        month,
        totalViews: 0,
        avgDuration: 0,
        conversions: 0,
        publishedCount: 0,
        leadCount: 0,
        contractAmount: 0,
      };
      existing.totalViews += row.views_1m ?? 0;
      existing.conversions += row.cta_clicks ?? 0;
      existing.publishedCount += 1;
      monthMap.set(month, existing);
    }

    return Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));
  } catch {
    return [];
  }
}

// ── Server Actions ──

export async function getMonthlyKPI(): Promise<{
  data: MonthlyKPI[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("content_metrics")
      .select("*")
      .order("measured_at", { ascending: true });

    if (error) throw error;

    if (data && data.length > 0) {
      // 월별로 그룹핑
      const monthMap = new Map<string, MonthlyKPI>();
      for (const row of data) {
        const month = row.measured_at.substring(0, 7);
        const existing = monthMap.get(month) ?? {
          month,
          totalViews: 0,
          avgDuration: 0,
          conversions: 0,
          publishedCount: 0,
          leadCount: 0,
          contractAmount: 0,
        };
        existing.totalViews += row.views ?? 0;
        existing.conversions += row.estimated_cta_clicks ?? 0;
        monthMap.set(month, existing);
      }
      return { data: Array.from(monthMap.values()), error: null };
    }

    return { data: [], error: null };
  } catch (err) {
    console.error("[getMonthlyKPI] 에러:", err);
    return { data: [], error: "KPI 데이터를 불러올 수 없습니다." };
  }
}

export async function getContentRankings(): Promise<{
  data: ContentRanking[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("contents")
      .select("*, category:categories(name)")
      .not("quality_score_final", "is", null)
      .order("quality_score_final", { ascending: false });

    if (error) throw error;

    const rankings: ContentRanking[] = (data ?? []).map((c) => ({
      id: c.id,
      title: c.title ?? "",
      category_name: (c.category as { name: string } | null)?.name ?? "",
      quality_score: c.quality_score_final ?? 0,
      grade: c.quality_grade ?? "average",
      views: c.views_1m ?? c.views_1w ?? 0,
      avg_duration_sec: c.avg_duration_sec ?? 0,
      search_rank: c.search_rank,
      cta_clicks: c.cta_clicks ?? 0,
    }));
    return { data: rankings, error: null };
  } catch (err) {
    console.error("[getContentRankings] 에러:", err);
    return { data: [], error: "콘텐츠 순위를 불러올 수 없습니다." };
  }
}

export async function getCategoryMetrics(): Promise<{
  data: CategoryMetricData[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("category_metrics")
      .select("*, category:categories(name)")
      .order("month", { ascending: true });

    if (error) throw error;

    const metrics: CategoryMetricData[] = (data ?? []).map((m) => ({
      category_id: m.category_id,
      category_name: (m.category as { name: string } | null)?.name ?? "",
      month: m.month,
      published_count: m.published_count,
      target_ratio: m.target_ratio,
      total_views: m.total_views,
      avg_duration_sec: m.avg_duration_sec ?? 0,
      estimated_conversions: m.estimated_conversions,
      composite_score: m.composite_score,
      grade: m.grade,
    }));
    return { data: metrics, error: null };
  } catch (err) {
    console.error("[getCategoryMetrics] 에러:", err);
    return { data: [], error: "카테고리 메트릭을 불러올 수 없습니다." };
  }
}

export async function getAnalyticsSummary(): Promise<{
  data: AnalyticsSummary;
  error: string | null;
}> {
  try {
    let { data: kpiData } = await getMonthlyKPI();

    // content_metrics에 데이터가 없으면 contents 테이블에서 폴백
    if (kpiData.length === 0) {
      kpiData = await getMonthlyKPIFallback();
    }

    if (kpiData.length >= 2) {
      const current = kpiData[kpiData.length - 1];
      const previous = kpiData[kpiData.length - 2];

      const viewsChange = previous.totalViews > 0
        ? ((current.totalViews - previous.totalViews) / previous.totalViews) * 100
        : 0;
      const durationChange = previous.avgDuration > 0
        ? ((current.avgDuration - previous.avgDuration) / previous.avgDuration) * 100
        : 0;
      const publishedChange = previous.publishedCount > 0
        ? ((current.publishedCount - previous.publishedCount) / previous.publishedCount) * 100
        : 0;

      const currentConvRate = current.totalViews > 0
        ? (current.conversions / current.totalViews) * 100
        : 0;
      const prevConvRate = previous.totalViews > 0
        ? (previous.conversions / previous.totalViews) * 100
        : 0;
      const convRateChange = prevConvRate > 0
        ? ((currentConvRate - prevConvRate) / prevConvRate) * 100
        : 0;

      return {
        data: {
          totalViews: current.totalViews,
          totalViewsChange: viewsChange,
          avgDuration: current.avgDuration,
          avgDurationChange: durationChange,
          publishedCount: current.publishedCount,
          publishedCountChange: publishedChange,
          conversionRate: currentConvRate,
          conversionRateChange: convRateChange,
        },
        error: null,
      };
    }

    // 데이터 부족 시 0 반환
    const defaultSummary: AnalyticsSummary = {
      totalViews: 0,
      totalViewsChange: 0,
      avgDuration: 0,
      avgDurationChange: 0,
      publishedCount: 0,
      publishedCountChange: 0,
      conversionRate: 0,
      conversionRateChange: 0,
    };

    if (kpiData.length === 1) {
      const current = kpiData[0];
      defaultSummary.totalViews = current.totalViews;
      defaultSummary.avgDuration = current.avgDuration;
      defaultSummary.publishedCount = current.publishedCount;
      defaultSummary.conversionRate = current.totalViews > 0
        ? (current.conversions / current.totalViews) * 100
        : 0;
    }

    return { data: defaultSummary, error: null };
  } catch (err) {
    console.error("[getAnalyticsSummary] 에러:", err);
    return {
      data: {
        totalViews: 0,
        totalViewsChange: 0,
        avgDuration: 0,
        avgDurationChange: 0,
        publishedCount: 0,
        publishedCountChange: 0,
        conversionRate: 0,
        conversionRateChange: 0,
      },
      error: "성과 요약을 불러올 수 없습니다.",
    };
  }
}
```

src/app/(dashboard)/analytics/page.tsx:17-95

```tsx
export default async function AnalyticsPage() {
  const [kpiResult, rankingsResult, categoryResult, summaryResult, highKeywords] =
    await Promise.all([
      getMonthlyKPI(),
      getContentRankings(),
      getCategoryMetrics(),
      getAnalyticsSummary(),
      getHighKeywords(),
    ]);

  const keywordIds = highKeywords.map((k) => k.id);
  const keywordRankings = keywordIds.length > 0 ? await getKeywordRankings(keywordIds) : [];

  const summary = summaryResult.data;

  const hasNoData =
    kpiResult.data.length === 0 &&
    rankingsResult.data.length === 0 &&
    categoryResult.data.length === 0 &&
    summary.totalViews === 0 &&
    summary.publishedCount === 0;

  const formatDuration = (seconds: number): string => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    if (min === 0) return `${sec}초`;
    return `${min}분 ${sec}초`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="성과 분석"
        description="콘텐츠 성과 및 KPI 분석"
      />

      {hasNoData ? (
        <EmptyState
          icon={<BarChart3 className="h-6 w-6" />}
          title="아직 성과 데이터가 없습니다"
          description="글을 발행하고 성과를 입력하면 여기에 표시됩니다."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard
              title="이번 달 조회수"
              value={summary.totalViews.toLocaleString()}
              change={summary.totalViewsChange}
              changeLabel="전월 대비"
              icon={<span className="tf tf-14">👀</span>}
            />
            <KPICard
              title="평균 체류시간"
              value={formatDuration(summary.avgDuration)}
              change={summary.avgDurationChange}
              changeLabel="전월 대비"
              icon={<span className="tf tf-14">⏱️</span>}
            />
            <KPICard
              title="발행 건수"
              value={`${summary.publishedCount}건`}
              change={summary.publishedCountChange}
              changeLabel="전월 대비"
              icon={<span className="tf tf-14">📝</span>}
            />
            <KPICard
              title="전환율"
              value={`${summary.conversionRate.toFixed(2)}%`}
              change={summary.conversionRateChange}
              changeLabel="전월 대비"
              icon={<span className="tf tf-14">📈</span>}
            />
          </div>

          <KpiTrendChart data={kpiResult.data} />

          <div className="grid gap-6 lg:grid-cols-2">
            <QualityRanking data={rankingsResult.data} />
```

## 5. 품질 랭킹·카테고리 비교

quality-ranking.tsx:80-112

```tsx
}

export function QualityRanking({ data }: QualityRankingProps) {
  const sorted = [...data].sort((a, b) => b.quality_score - a.quality_score);
  const top10 = sorted.slice(0, 10);
  const bottom5 = sorted.slice(-5).reverse();

  return (
    <div className="scard">
      <div className="scard-head">
        <div className="scard-head-left">
          <span className="tf tf-16">🏆</span>
          <span className="scard-head-title">품질 점수 랭킹</span>
        </div>
      </div>
      <div className="scard-body">
        <Tabs defaultValue="top">
          <TabsList>
            <TabsTrigger value="top">상위 10개</TabsTrigger>
            <TabsTrigger value="bottom">하위 5개</TabsTrigger>
          </TabsList>
          <TabsContent value="top">
            <RankingTable items={top10} startRank={1} />
          </TabsContent>
          <TabsContent value="bottom">
            <RankingTable
              items={bottom5}
              startRank={sorted.length - 4}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
```

category-comparison.tsx:35-38, 73-130

```tsx
function normalizeValue(value: number, max: number): number {
  if (max === 0) return 0;
  return Math.round((value / max) * 100);
}
```

```tsx
export function CategoryComparison({ data }: CategoryComparisonProps) {
  // 가장 최근 월 데이터로 레이더 차트 구성
  const latestMonth = data.length > 0
    ? data.reduce((latest, d) => (d.month > latest ? d.month : latest), data[0].month)
    : "";

  const latestData = data.filter((d) => d.month === latestMonth);

  // 정규화를 위한 최대값 계산
  const maxPublished = Math.max(...latestData.map((d) => d.published_count), 1);
  const maxViews = Math.max(...latestData.map((d) => d.total_views), 1);
  const maxDuration = Math.max(...latestData.map((d) => d.avg_duration_sec), 1);
  const maxConversions = Math.max(...latestData.map((d) => d.estimated_conversions), 1);

  // 레이더 차트 데이터 구성
  const radarAxes = ["발행률", "조회수", "체류시간", "전환수"];
  const radarData = radarAxes.map((axis) => {
    const entry: Record<string, string | number> = { axis };
    for (const cat of latestData) {
      let value = 0;
      switch (axis) {
        case "발행률":
          value = normalizeValue(cat.published_count, maxPublished);
          break;
        case "조회수":
          value = normalizeValue(cat.total_views, maxViews);
          break;
        case "체류시간":
          value = normalizeValue(cat.avg_duration_sec, maxDuration);
          break;
        case "전환수":
          value = normalizeValue(cat.estimated_conversions, maxConversions);
          break;
      }
      entry[cat.category_name] = value;
    }
    return entry;
  });

  // 카테고리별 고유 이름 목록
  const categoryNames = [...new Set(latestData.map((d) => d.category_name))];
  const categoryIdMap = Object.fromEntries(
    latestData.map((d) => [d.category_name, d.category_id])
  );

  // 바 차트 데이터: 월별 발행 건수
  const months = [...new Set(data.map((d) => d.month))].sort();
  const barData = months.map((month) => {
    const entry: Record<string, string | number> = {
      month,
      monthLabel: MONTH_LABELS[month] ?? month,
    };
    for (const cat of data.filter((d) => d.month === month)) {
      entry[cat.category_name] = cat.published_count;
    }
    return entry;
  });

```

## 6. src/lib/utils/quality-score.ts 전체

```ts
import type { QualityGrade } from "@/lib/types/database";

// 품질점수 계산 공식
// quality_score = (views_normalized * 40) + (duration_normalized * 30) + (conversion_normalized * 30)
// 각 지표 정규화: 해당 월 전체 글 대비 상대 점수 (0~100)

interface QualityInput {
  views: number;
  avgDurationSec: number;
  ctaClicks: number;
}

interface MonthlyStats {
  maxViews: number;
  maxDuration: number;
  maxCtaClicks: number;
}

export function calculateQualityScore(
  input: QualityInput,
  stats: MonthlyStats
): number {
  const viewsNormalized =
    stats.maxViews > 0 ? (input.views / stats.maxViews) * 100 : 0;
  const durationNormalized =
    stats.maxDuration > 0
      ? (input.avgDurationSec / stats.maxDuration) * 100
      : 0;
  const conversionNormalized =
    stats.maxCtaClicks > 0
      ? (input.ctaClicks / stats.maxCtaClicks) * 100
      : 0;

  return (
    viewsNormalized * 0.4 +
    durationNormalized * 0.3 +
    conversionNormalized * 0.3
  );
}

export function getQualityGrade(score: number): QualityGrade {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "average";
  if (score >= 20) return "poor";
  return "critical";
```

## 7. 테이블 — supabase/migrations/001_initial_schema.sql:110-140

```sql
-- ============================================
-- 6. content_metrics (글별 성과 - 시계열)
-- ============================================
create table public.content_metrics (
  id serial primary key,
  content_id text references public.contents(id) on delete cascade,
  measured_at date not null,
  views int not null default 0,
  avg_duration_sec int,
  search_rank int,
  estimated_cta_clicks int default 0,
  source text check (source in ('manual', 'auto')),
  unique (content_id, measured_at)
);

-- ============================================
-- 7. category_metrics (카테고리 월간 성과)
-- ============================================
create table public.category_metrics (
  id serial primary key,
  category_id text references public.categories(id) on delete cascade,
  month date not null,
  published_count int not null default 0,
  target_ratio numeric(5,2),
  total_views int not null default 0,
  avg_duration_sec int,
  estimated_conversions int default 0,
  composite_score numeric(5,2),
  grade text check (grade in ('excellent', 'good', 'average', 'poor', 'critical')),
  unique (category_id, month)
);
```
