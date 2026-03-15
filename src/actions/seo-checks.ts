"use server";

import { createClient } from "@/lib/supabase/server";
import type { SeoCheck, SeoVerdict } from "@/lib/types/database";
import {
  SEO_ITEMS,
  REQUIRED_PASS_COUNT,
  RECOMMENDED_MAX_FAIL,
} from "@/lib/constants/seo-items";

function calculateVerdict(
  requiredPass: number,
  recommendedPass: number
): SeoVerdict {
  if (requiredPass < REQUIRED_PASS_COUNT) return "blocked";
  const recommendedTotal = SEO_ITEMS.filter(
    (i) => i.grade === "recommended"
  ).length;
  const recommendedFail = recommendedTotal - recommendedPass;
  if (recommendedFail > RECOMMENDED_MAX_FAIL) return "fix_required";
  return "pass";
}

/**
 * 콘텐츠의 최신 SEO 체크 데이터를 가져옵니다.
 */
export async function getSeoCheck(
  contentId: string
): Promise<SeoCheck | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("seo_checks")
      .select("*")
      .eq("content_id", contentId)
      .order("checked_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return data as SeoCheck;
  } catch (err) {
    console.error("[getSeoCheck] 에러:", err);
    return null;
  }
}

/**
 * SEO 체크 항목을 저장/업데이트합니다.
 */
export async function saveSeoCheck(
  contentId: string,
  items: Record<string, { passed: boolean; note: string }>
): Promise<{ success: boolean; error?: string; data?: SeoCheck }> {
  try {
    const requiredPassCount = SEO_ITEMS.filter(
      (i) => i.grade === "required" && items[String(i.id)]?.passed
    ).length;
    const recommendedPassCount = SEO_ITEMS.filter(
      (i) => i.grade === "recommended" && items[String(i.id)]?.passed
    ).length;
    const optionalPassCount = SEO_ITEMS.filter(
      (i) => i.grade === "optional" && items[String(i.id)]?.passed
    ).length;

    const verdict = calculateVerdict(requiredPassCount, recommendedPassCount);

    const seoCheckData = {
      content_id: contentId,
      checked_at: new Date().toISOString(),
      checked_by: "current-user",
      items,
      required_pass_count: requiredPassCount,
      recommended_pass_count: recommendedPassCount,
      optional_pass_count: optionalPassCount,
      verdict,
    };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("seo_checks")
      .upsert(seoCheckData, { onConflict: "content_id" })
      .select()
      .single();

    if (error) throw error;

    return { success: true, data: data as SeoCheck };
  } catch (err) {
    console.error("[saveSeoCheck] 에러:", err);
    return { success: false, error: "SEO 체크 저장에 실패했습니다." };
  }
}
