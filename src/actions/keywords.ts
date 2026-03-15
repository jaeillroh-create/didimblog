"use server";

import { createClient } from "@/lib/supabase/server";
import type { KeywordPool, KeywordRanking } from "@/lib/types/database";

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
    return (data ?? []) as KeywordPool[];
  } catch (err) {
    console.error("[getKeywordPool] 에러:", err);
    return [];
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
    return (data ?? []) as KeywordPool[];
  } catch (err) {
    console.error("[getHighKeywords] 에러:", err);
    return [];
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
  } catch (err) {
    console.error("[getKeywordRankings] 에러:", err);
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
