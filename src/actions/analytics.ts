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

// ── 데모 데이터 ──

const DEMO_MONTHLY_KPI: MonthlyKPI[] = [
  {
    month: "2026-01",
    totalViews: 800,
    avgDuration: 125,
    conversions: 2,
    publishedCount: 4,
    leadCount: 3,
    contractAmount: 5000000,
  },
  {
    month: "2026-02",
    totalViews: 1200,
    avgDuration: 138,
    conversions: 3,
    publishedCount: 5,
    leadCount: 4,
    contractAmount: 8000000,
  },
  {
    month: "2026-03",
    totalViews: 1500,
    avgDuration: 145,
    conversions: 4,
    publishedCount: 6,
    leadCount: 5,
    contractAmount: 12000000,
  },
  {
    month: "2026-04",
    totalViews: 1800,
    avgDuration: 152,
    conversions: 5,
    publishedCount: 7,
    leadCount: 6,
    contractAmount: 15000000,
  },
  {
    month: "2026-05",
    totalViews: 2200,
    avgDuration: 165,
    conversions: 6,
    publishedCount: 8,
    leadCount: 8,
    contractAmount: 20000000,
  },
  {
    month: "2026-06",
    totalViews: 2500,
    avgDuration: 178,
    conversions: 8,
    publishedCount: 9,
    leadCount: 10,
    contractAmount: 25000000,
  },
];

const DEMO_CONTENT_RANKINGS: ContentRanking[] = [
  { id: "W01-01", title: "연구소 절세 시뮬레이션 – 법인세 20% 줄이는 3가지 방법", category_name: "변리사의 현장 수첩", quality_score: 92, grade: "excellent", views: 1850, avg_duration_sec: 210, search_rank: 2, cta_clicks: 45 },
  { id: "W03-01", title: "벤처인증 가점 항목 완전 정리 (2026년 최신)", category_name: "IP 라운지", quality_score: 88, grade: "excellent", views: 2100, avg_duration_sec: 185, search_rank: 1, cta_clicks: 38 },
  { id: "W05-01", title: "연구소 설립 시 세액공제 한도 계산법", category_name: "변리사의 현장 수첩", quality_score: 85, grade: "excellent", views: 1650, avg_duration_sec: 195, search_rank: 3, cta_clicks: 42 },
  { id: "W02-01", title: "특허 출원 전 반드시 확인해야 할 5가지 체크리스트", category_name: "IP 라운지", quality_score: 78, grade: "good", views: 2300, avg_duration_sec: 160, search_rank: 1, cta_clicks: 28 },
  { id: "W04-01", title: "디딤이 걸어온 길 – 창립 10주년 스토리", category_name: "디딤 다이어리", quality_score: 75, grade: "good", views: 980, avg_duration_sec: 240, search_rank: 5, cta_clicks: 12 },
  { id: "W07-01", title: "직무발명 보상 규정 가이드", category_name: "변리사의 현장 수첩", quality_score: 72, grade: "good", views: 1420, avg_duration_sec: 175, search_rank: 4, cta_clicks: 35 },
  { id: "W06-01", title: "IP 분쟁 대응 매뉴얼 – 중소기업 편", category_name: "IP 라운지", quality_score: 68, grade: "good", views: 1780, avg_duration_sec: 150, search_rank: 3, cta_clicks: 22 },
  { id: "W08-01", title: "스타트업 대표가 알아야 할 특허 포트폴리오 전략", category_name: "IP 라운지", quality_score: 65, grade: "good", views: 1950, avg_duration_sec: 140, search_rank: 2, cta_clicks: 18 },
  { id: "W09-01", title: "연구소 인정 요건 변경사항 총정리 (2026)", category_name: "변리사의 현장 수첩", quality_score: 58, grade: "average", views: 1100, avg_duration_sec: 155, search_rank: 6, cta_clicks: 25 },
  { id: "W10-01", title: "디딤 고객 사례 – 특허 전략으로 투자 유치 성공기", category_name: "디딤 다이어리", quality_score: 52, grade: "average", views: 720, avg_duration_sec: 220, search_rank: 8, cta_clicks: 8 },
  { id: "W11-01", title: "중소기업 R&D 세액공제 실무 가이드", category_name: "변리사의 현장 수첩", quality_score: 45, grade: "average", views: 890, avg_duration_sec: 130, search_rank: 10, cta_clicks: 15 },
  { id: "W12-01", title: "해외 특허 출원 로드맵 – 미국·일본·유럽", category_name: "IP 라운지", quality_score: 38, grade: "poor", views: 650, avg_duration_sec: 110, search_rank: 12, cta_clicks: 8 },
  { id: "W13-01", title: "디딤 팀 인터뷰 – 신입 변리사의 하루", category_name: "디딤 다이어리", quality_score: 32, grade: "poor", views: 420, avg_duration_sec: 180, search_rank: 15, cta_clicks: 3 },
  { id: "W14-01", title: "특허 명세서 작성 팁 기초편", category_name: "IP 라운지", quality_score: 25, grade: "poor", views: 380, avg_duration_sec: 95, search_rank: 18, cta_clicks: 5 },
  { id: "W15-01", title: "연구노트 관리 체크리스트", category_name: "변리사의 현장 수첩", quality_score: 18, grade: "critical", views: 250, avg_duration_sec: 80, search_rank: 22, cta_clicks: 2 },
];

const DEMO_CATEGORY_METRICS: CategoryMetricData[] = [
  // CAT-A: 현장수첩 — highest conversions
  { category_id: "CAT-A", category_name: "변리사의 현장 수첩", month: "2026-04", published_count: 3, target_ratio: 0.75, total_views: 820, avg_duration_sec: 175, estimated_conversions: 5, composite_score: 82, grade: "excellent" },
  { category_id: "CAT-A", category_name: "변리사의 현장 수첩", month: "2026-05", published_count: 4, target_ratio: 1.0, total_views: 1050, avg_duration_sec: 182, estimated_conversions: 7, composite_score: 85, grade: "excellent" },
  { category_id: "CAT-A", category_name: "변리사의 현장 수첩", month: "2026-06", published_count: 4, target_ratio: 1.0, total_views: 1200, avg_duration_sec: 190, estimated_conversions: 9, composite_score: 88, grade: "excellent" },
  // CAT-B: IP라운지 — highest views
  { category_id: "CAT-B", category_name: "IP 라운지", month: "2026-04", published_count: 3, target_ratio: 0.75, total_views: 1500, avg_duration_sec: 142, estimated_conversions: 3, composite_score: 70, grade: "good" },
  { category_id: "CAT-B", category_name: "IP 라운지", month: "2026-05", published_count: 4, target_ratio: 1.0, total_views: 1950, avg_duration_sec: 148, estimated_conversions: 4, composite_score: 73, grade: "good" },
  { category_id: "CAT-B", category_name: "IP 라운지", month: "2026-06", published_count: 4, target_ratio: 1.0, total_views: 2200, avg_duration_sec: 155, estimated_conversions: 5, composite_score: 75, grade: "good" },
  // CAT-C: 디딤다이어리 — best engagement (duration)
  { category_id: "CAT-C", category_name: "디딤 다이어리", month: "2026-04", published_count: 1, target_ratio: 0.5, total_views: 380, avg_duration_sec: 215, estimated_conversions: 1, composite_score: 55, grade: "average" },
  { category_id: "CAT-C", category_name: "디딤 다이어리", month: "2026-05", published_count: 2, target_ratio: 1.0, total_views: 520, avg_duration_sec: 228, estimated_conversions: 1, composite_score: 58, grade: "average" },
  { category_id: "CAT-C", category_name: "디딤 다이어리", month: "2026-06", published_count: 2, target_ratio: 1.0, total_views: 650, avg_duration_sec: 235, estimated_conversions: 2, composite_score: 62, grade: "good" },
];

// ── Server Actions ──

export async function getMonthlyKPI(): Promise<{
  data: MonthlyKPI[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    // content_metrics에서 월별 집계 시도
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

    return { data: DEMO_MONTHLY_KPI, error: null };
  } catch (err) {
    console.error("[getMonthlyKPI] 에러:", err);
    return { data: DEMO_MONTHLY_KPI, error: null };
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

    if (data && data.length > 0) {
      const rankings: ContentRanking[] = data.map((c) => ({
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
    }

    return { data: DEMO_CONTENT_RANKINGS, error: null };
  } catch (err) {
    console.error("[getContentRankings] 에러:", err);
    return { data: DEMO_CONTENT_RANKINGS, error: null };
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

    if (data && data.length > 0) {
      const metrics: CategoryMetricData[] = data.map((m) => ({
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
    }

    return { data: DEMO_CATEGORY_METRICS, error: null };
  } catch (err) {
    console.error("[getCategoryMetrics] 에러:", err);
    return { data: DEMO_CATEGORY_METRICS, error: null };
  }
}

export async function getAnalyticsSummary(): Promise<{
  data: AnalyticsSummary;
  error: string | null;
}> {
  try {
    const { data: kpiData } = await getMonthlyKPI();

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

    // 데모 데이터 기반 기본값
    return {
      data: {
        totalViews: 2500,
        totalViewsChange: 13.6,
        avgDuration: 178,
        avgDurationChange: 7.9,
        publishedCount: 9,
        publishedCountChange: 12.5,
        conversionRate: 0.32,
        conversionRateChange: 17.4,
      },
      error: null,
    };
  } catch (err) {
    console.error("[getAnalyticsSummary] 에러:", err);
    return {
      data: {
        totalViews: 2500,
        totalViewsChange: 13.6,
        avgDuration: 178,
        avgDurationChange: 7.9,
        publishedCount: 9,
        publishedCountChange: 12.5,
        conversionRate: 0.32,
        conversionRateChange: 17.4,
      },
      error: null,
    };
  }
}
