"use server";

import { createClient } from "@/lib/supabase/server";
import type { Category, CategoryMetric } from "@/lib/types/database";

/**
 * 전체 카테고리 조회 (sort_order 정렬)
 */
export async function getCategories(): Promise<Category[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) throw error;

    return (data ?? []) as Category[];
  } catch (err) {
    console.error("[getCategories] 에러:", err);
    return [];
  }
}

/**
 * 특정 카테고리의 월별 메트릭 조회
 */
export async function getCategoryMetrics(
  categoryId: string
): Promise<CategoryMetric[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("category_metrics")
      .select("*")
      .eq("category_id", categoryId)
      .order("month", { ascending: true });

    if (error) throw error;

    return (data ?? []) as CategoryMetric[];
  } catch (err) {
    console.error("[getCategoryMetrics] 에러:", err);
    return [];
  }
}

/**
 * 카테고리 수정
 */
export async function updateCategory(
  id: string,
  data: Partial<Omit<Category, "id" | "created_at">>
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("categories")
      .update(data)
      .eq("id", id);

    if (error) throw error;

    return { success: true };
  } catch (err) {
    console.error("[updateCategory] 에러:", err);
    return {
      success: false,
      error: "카테고리 수정 중 오류가 발생했습니다.",
    };
  }
}
