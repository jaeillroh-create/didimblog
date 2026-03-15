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
