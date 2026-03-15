"use server";

import { createClient } from "@/lib/supabase/server";
import { checkContentHealth, type HealthCheckResult } from "@/lib/content-health";
import { recommendInternalLinks, type InternalLinkSuggestion } from "@/lib/internal-link-recommender";
import type { Content, Series, HealthStatus, KeywordPool } from "@/lib/types/database";

// ── 헬스체크 전체 실행 ──

export async function runHealthCheck(): Promise<{
  results: HealthCheckResult[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    const { data: contents, error } = await supabase
      .from("contents")
      .select("*")
      .eq("status", "S4")
      .eq("is_deleted", false)
      .not("published_at", "is", null);

    if (error) throw error;
    if (!contents || contents.length === 0) {
      return { results: [], error: null };
    }

    const results = (contents as Content[]).map((c) => checkContentHealth(c));

    // 상태 업데이트가 필요한 건들 자동 반영
    for (const result of results) {
      if (result.recommendedStatus !== result.currentStatus) {
        await supabase
          .from("contents")
          .update({
            health_status: result.recommendedStatus,
            health_checked_at: new Date().toISOString(),
          })
          .eq("id", result.contentId);
      }
    }

    return { results, error: null };
  } catch (err) {
    console.error("[runHealthCheck] 에러:", err);
    return { results: [], error: "헬스체크 실행에 실패했습니다." };
  }
}

// ── 단일 콘텐츠 헬스 상태 업데이트 ──

export async function updateHealthStatus(
  contentId: string,
  status: HealthStatus
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from("contents")
      .update({
        health_status: status,
        health_checked_at: new Date().toISOString(),
      })
      .eq("id", contentId);

    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    console.error("[updateHealthStatus] 에러:", err);
    return { success: false, error: "상태 업데이트에 실패했습니다." };
  }
}

// ── 헬스체크 대상 글 목록 ──

export async function getHealthCheckContents(): Promise<{
  data: (Content & { healthCheck: HealthCheckResult })[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    const { data: contents, error } = await supabase
      .from("contents")
      .select("*")
      .eq("status", "S4")
      .eq("is_deleted", false)
      .not("published_at", "is", null)
      .order("published_at", { ascending: true });

    if (error) throw error;
    if (!contents || contents.length === 0) {
      return { data: [], error: null };
    }

    const results = (contents as Content[]).map((c) => ({
      ...c,
      healthCheck: checkContentHealth(c),
    }));

    // 문제가 있는 글을 먼저 표시
    results.sort((a, b) => {
      const statusOrder: Record<HealthStatus, number> = {
        UPDATE_NEEDED: 0,
        CHECK_NEEDED: 1,
        HEALTHY: 2,
        UPDATED: 3,
      };
      return (
        statusOrder[a.healthCheck.recommendedStatus] -
        statusOrder[b.healthCheck.recommendedStatus]
      );
    });

    return { data: results, error: null };
  } catch (err) {
    console.error("[getHealthCheckContents] 에러:", err);
    return { data: [], error: "헬스체크 데이터를 불러오지 못했습니다." };
  }
}

// ── 내부 링크 추천 ──

export async function getInternalLinkSuggestions(
  contentId: string
): Promise<{
  suggestions: InternalLinkSuggestion[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    // 현재 콘텐츠
    const { data: content, error: contentError } = await supabase
      .from("contents")
      .select("*")
      .eq("id", contentId)
      .single();

    if (contentError) throw contentError;

    // 발행된 모든 콘텐츠
    const { data: allContents, error: allError } = await supabase
      .from("contents")
      .select("*")
      .in("status", ["S4", "S5"])
      .eq("is_deleted", false);

    if (allError) throw allError;

    const suggestions = recommendInternalLinks(
      content as Content,
      (allContents ?? []) as Content[]
    );

    return { suggestions, error: null };
  } catch (err) {
    console.error("[getInternalLinkSuggestions] 에러:", err);
    return { suggestions: [], error: "내부 링크 추천에 실패했습니다." };
  }
}

// ── 시리즈 CRUD ──

export async function getSeriesList(): Promise<{
  data: (Series & { contentCount: number; publishedCount: number })[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    const { data: seriesList, error } = await supabase
      .from("series")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!seriesList || seriesList.length === 0) {
      return { data: [], error: null };
    }

    // 각 시리즈의 콘텐츠 개수 집계
    const result = await Promise.all(
      (seriesList as Series[]).map(async (series) => {
        const { count: contentCount } = await supabase
          .from("contents")
          .select("*", { count: "exact", head: true })
          .eq("series_id", series.id)
          .eq("is_deleted", false);

        const { count: publishedCount } = await supabase
          .from("contents")
          .select("*", { count: "exact", head: true })
          .eq("series_id", series.id)
          .eq("status", "S4")
          .eq("is_deleted", false);

        return {
          ...series,
          contentCount: contentCount ?? 0,
          publishedCount: publishedCount ?? 0,
        };
      })
    );

    return { data: result, error: null };
  } catch (err) {
    console.error("[getSeriesList] 에러:", err);
    return { data: [], error: "시리즈 목록을 불러오지 못했습니다." };
  }
}

export async function createSeries(
  name: string,
  totalPlanned: number
): Promise<{ data: Series | null; error: string | null }> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("series")
      .insert({ name, total_planned: totalPlanned })
      .select()
      .single();

    if (error) throw error;
    return { data: data as Series, error: null };
  } catch (err) {
    console.error("[createSeries] 에러:", err);
    return { data: null, error: "시리즈 생성에 실패했습니다." };
  }
}

export async function deleteSeries(
  seriesId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();

    // 시리즈에 속한 콘텐츠의 series_id 해제
    await supabase
      .from("contents")
      .update({ series_id: null, series_order: null })
      .eq("series_id", seriesId);

    const { error } = await supabase
      .from("series")
      .delete()
      .eq("id", seriesId);

    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    console.error("[deleteSeries] 에러:", err);
    return { success: false, error: "시리즈 삭제에 실패했습니다." };
  }
}

export async function assignContentToSeries(
  contentId: string,
  seriesId: string | null,
  seriesOrder: number | null
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from("contents")
      .update({ series_id: seriesId, series_order: seriesOrder })
      .eq("id", contentId);

    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    console.error("[assignContentToSeries] 에러:", err);
    return { success: false, error: "시리즈 지정에 실패했습니다." };
  }
}

// ── 키워드 커버리지 ──

export interface KeywordCoverageItem {
  keyword: KeywordPool;
  coveredContent: { id: string; title: string } | null;
}

export async function getKeywordCoverage(): Promise<{
  data: KeywordCoverageItem[];
  stats: { total: number; covered: number; uncovered: number };
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    const { data: keywords, error } = await supabase
      .from("keyword_pool")
      .select("*")
      .order("priority", { ascending: true })
      .order("category_id", { ascending: true });

    if (error) throw error;
    if (!keywords || keywords.length === 0) {
      return {
        data: [],
        stats: { total: 0, covered: 0, uncovered: 0 },
        error: null,
      };
    }

    // 커버된 콘텐츠 정보 가져오기
    const coveredIds = (keywords as KeywordPool[])
      .filter((k) => k.covered_content_id)
      .map((k) => k.covered_content_id!);

    const contentMap: Record<string, { id: string; title: string }> = {};
    if (coveredIds.length > 0) {
      const { data: contents } = await supabase
        .from("contents")
        .select("id, title")
        .in("id", coveredIds);

      for (const c of contents ?? []) {
        contentMap[c.id] = { id: c.id, title: c.title ?? "제목 없음" };
      }
    }

    const data: KeywordCoverageItem[] = (keywords as KeywordPool[]).map((kw) => ({
      keyword: kw,
      coveredContent: kw.covered_content_id
        ? contentMap[kw.covered_content_id] ?? null
        : null,
    }));

    const covered = data.filter((d) => d.coveredContent !== null).length;

    return {
      data,
      stats: {
        total: data.length,
        covered,
        uncovered: data.length - covered,
      },
      error: null,
    };
  } catch (err) {
    console.error("[getKeywordCoverage] 에러:", err);
    // 데모 데이터 폴백
    const { getKeywordPool } = await import("@/actions/keywords");
    const keywords = await getKeywordPool();
    const data: KeywordCoverageItem[] = keywords.map((kw) => ({
      keyword: kw,
      coveredContent: null,
    }));
    return {
      data,
      stats: { total: data.length, covered: 0, uncovered: data.length },
      error: null,
    };
  }
}
