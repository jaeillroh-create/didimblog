"use server";

import { createClient } from "@/lib/supabase/server";
import type { KeywordPool, KeywordRanking } from "@/lib/types/database";

// ── 데모 데이터 ──

const DEMO_KEYWORDS: KeywordPool[] = [
  { id: "kw-1", keyword: "직무발명보상금 절세", category_id: "CAT-A", sub_category_id: "CAT-A-01", priority: "HIGH", covered_content_id: null, created_at: "2026-01-01T00:00:00Z" },
  { id: "kw-2", keyword: "법인세 줄이는 방법", category_id: "CAT-A", sub_category_id: "CAT-A-01", priority: "HIGH", covered_content_id: null, created_at: "2026-01-01T00:00:00Z" },
  { id: "kw-3", keyword: "대표이사 직무발명보상금", category_id: "CAT-A", sub_category_id: "CAT-A-01", priority: "HIGH", covered_content_id: null, created_at: "2026-01-01T00:00:00Z" },
  { id: "kw-4", keyword: "기업부설연구소 세액공제", category_id: "CAT-A", sub_category_id: "CAT-A-03", priority: "HIGH", covered_content_id: null, created_at: "2026-01-01T00:00:00Z" },
  { id: "kw-5", keyword: "연구소 세무조사", category_id: "CAT-A", sub_category_id: "CAT-A-03", priority: "HIGH", covered_content_id: null, created_at: "2026-01-01T00:00:00Z" },
  { id: "kw-6", keyword: "R&D 세액공제 환수", category_id: "CAT-A", sub_category_id: "CAT-A-03", priority: "HIGH", covered_content_id: null, created_at: "2026-01-01T00:00:00Z" },
  { id: "kw-7", keyword: "벤처기업인증 혜택", category_id: "CAT-A", sub_category_id: "CAT-A-02", priority: "MEDIUM", covered_content_id: null, created_at: "2026-01-01T00:00:00Z" },
  { id: "kw-8", keyword: "AI 특허 출원", category_id: "CAT-B", sub_category_id: "CAT-B-01", priority: "MEDIUM", covered_content_id: null, created_at: "2026-01-01T00:00:00Z" },
  { id: "kw-9", keyword: "스타트업 특허 전략", category_id: "CAT-B", sub_category_id: "CAT-B-02", priority: "MEDIUM", covered_content_id: null, created_at: "2026-01-01T00:00:00Z" },
  { id: "kw-10", keyword: "직무발명 소송 사례", category_id: "CAT-B", sub_category_id: "CAT-B-03", priority: "MEDIUM", covered_content_id: null, created_at: "2026-01-01T00:00:00Z" },
];

// ── 키워드 풀 조회 ──

export async function getKeywordPool(): Promise<KeywordPool[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("keyword_pool")
      .select("*")
      .order("priority", { ascending: true })
      .order("keyword", { ascending: true });

    if (error) throw error;
    if (data && data.length > 0) return data as KeywordPool[];
    return DEMO_KEYWORDS;
  } catch {
    return DEMO_KEYWORDS;
  }
}

// ── HIGH 키워드 목록 (순위 추적용) ──

export async function getHighKeywords(): Promise<KeywordPool[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("keyword_pool")
      .select("*")
      .eq("priority", "HIGH")
      .order("keyword", { ascending: true });

    if (error) throw error;
    if (data && data.length > 0) return data as KeywordPool[];
    return DEMO_KEYWORDS.filter((k) => k.priority === "HIGH");
  } catch {
    return DEMO_KEYWORDS.filter((k) => k.priority === "HIGH");
  }
}

// ── 키워드 순위 조회 ──

export async function getKeywordRankings(
  keywordIds: string[]
): Promise<KeywordRanking[]> {
  if (keywordIds.length === 0) return [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("keyword_rankings")
      .select("*")
      .in("keyword_id", keywordIds)
      .order("month", { ascending: false });

    if (error) throw error;
    return (data ?? []) as KeywordRanking[];
  } catch {
    return [];
  }
}

// ── 키워드 순위 저장/업데이트 ──

export async function saveKeywordRanking(
  keywordId: string,
  month: string,
  rank: number | null
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();

    const { error } = await supabase.from("keyword_rankings").upsert(
      {
        keyword_id: keywordId,
        month,
        rank,
      },
      { onConflict: "keyword_id,month" }
    );

    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    console.error("[saveKeywordRanking] 에러:", err);
    return { success: false, error: "순위 저장에 실패했습니다." };
  }
}

// ── 성과 데이터 저장 ──

export async function saveContentPerformance(
  contentId: string,
  data: {
    views_1w?: number | null;
    views_1m?: number | null;
    avg_duration_sec?: number | null;
    search_rank?: number | null;
    cta_clicks?: number | null;
  }
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from("contents")
      .update(data)
      .eq("id", contentId);

    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    console.error("[saveContentPerformance] 에러:", err);
    return { success: false, error: "성과 데이터 저장에 실패했습니다." };
  }
}
