"use server";

import { createClient } from "@/lib/supabase/server";
import type { Category, CategoryMetric } from "@/lib/types/database";

// ── 데모 카테고리 데이터 (Supabase 미연결 시 폴백) ──
const DEMO_CATEGORIES: Category[] = [
  {
    id: "CAT-INTRO",
    name: "디딤 소개",
    tier: "primary",
    parent_id: null,
    role_type: "fixed",
    funnel_stage: "MULTI",
    prologue_position: null,
    monthly_target: 0,
    cta_type: "none",
    status: "MATURE",
    connected_services: [],
    target_keywords: [],
    sort_order: 1,
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "CAT-A",
    name: "변리사의 현장 수첩",
    tier: "primary",
    parent_id: null,
    role_type: "conversion",
    funnel_stage: "ATTRACT",
    prologue_position: "area1",
    monthly_target: 2,
    cta_type: "direct",
    status: "NEW",
    connected_services: ["절세컨설팅", "사후관리", "벤처인증", "우수기업인증"],
    target_keywords: [],
    sort_order: 2,
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "CAT-A-01",
    name: "절세 시뮬레이션",
    tier: "secondary",
    parent_id: "CAT-A",
    role_type: "conversion",
    funnel_stage: "CONVERT",
    prologue_position: null,
    monthly_target: 0,
    cta_type: "direct",
    status: "NEW",
    connected_services: ["절세컨설팅"],
    target_keywords: [],
    sort_order: 1,
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "CAT-A-02",
    name: "인증 가이드",
    tier: "secondary",
    parent_id: "CAT-A",
    role_type: "conversion",
    funnel_stage: "CONVERT",
    prologue_position: null,
    monthly_target: 0,
    cta_type: "direct",
    status: "NEW",
    connected_services: ["벤처인증", "우수기업인증"],
    target_keywords: [],
    sort_order: 2,
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "CAT-A-03",
    name: "연구소 운영 실무",
    tier: "secondary",
    parent_id: "CAT-A",
    role_type: "conversion",
    funnel_stage: "CONVERT",
    prologue_position: null,
    monthly_target: 0,
    cta_type: "direct",
    status: "NEW",
    connected_services: ["사후관리"],
    target_keywords: [],
    sort_order: 3,
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "CAT-B",
    name: "IP 라운지",
    tier: "primary",
    parent_id: null,
    role_type: "traffic_branding",
    funnel_stage: "ATTRACT",
    prologue_position: "area2",
    monthly_target: 1,
    cta_type: "neighbor",
    status: "NEW",
    connected_services: ["특허출원", "AI특허", "기술보호"],
    target_keywords: [],
    sort_order: 3,
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "CAT-B-01",
    name: "AI와 IP",
    tier: "secondary",
    parent_id: "CAT-B",
    role_type: "traffic_branding",
    funnel_stage: "ATTRACT",
    prologue_position: null,
    monthly_target: 0,
    cta_type: "neighbor",
    status: "NEW",
    connected_services: ["AI특허"],
    target_keywords: [],
    sort_order: 1,
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "CAT-B-02",
    name: "특허 전략 노트",
    tier: "secondary",
    parent_id: "CAT-B",
    role_type: "traffic_branding",
    funnel_stage: "TRUST",
    prologue_position: null,
    monthly_target: 0,
    cta_type: "neighbor",
    status: "NEW",
    connected_services: ["특허출원", "기술보호"],
    target_keywords: [],
    sort_order: 2,
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "CAT-B-03",
    name: "IP 뉴스 한 입",
    tier: "secondary",
    parent_id: "CAT-B",
    role_type: "traffic_branding",
    funnel_stage: "ATTRACT",
    prologue_position: null,
    monthly_target: 0,
    cta_type: "neighbor",
    status: "NEW",
    connected_services: [],
    target_keywords: [],
    sort_order: 3,
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "CAT-C",
    name: "디딤 다이어리",
    tier: "primary",
    parent_id: null,
    role_type: "trust",
    funnel_stage: "TRUST",
    prologue_position: "area3",
    monthly_target: 1,
    cta_type: "none",
    status: "NEW",
    connected_services: [],
    target_keywords: [],
    sort_order: 4,
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "CAT-C-01",
    name: "컨설팅 후기",
    tier: "secondary",
    parent_id: "CAT-C",
    role_type: "trust",
    funnel_stage: "TRUST",
    prologue_position: null,
    monthly_target: 0,
    cta_type: "none",
    status: "NEW",
    connected_services: [],
    target_keywords: [],
    sort_order: 1,
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "CAT-C-02",
    name: "디딤 일상",
    tier: "secondary",
    parent_id: "CAT-C",
    role_type: "trust",
    funnel_stage: "TRUST",
    prologue_position: null,
    monthly_target: 0,
    cta_type: "none",
    status: "NEW",
    connected_services: [],
    target_keywords: [],
    sort_order: 2,
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "CAT-C-03",
    name: "대표의 생각",
    tier: "secondary",
    parent_id: "CAT-C",
    role_type: "trust",
    funnel_stage: "TRUST",
    prologue_position: null,
    monthly_target: 0,
    cta_type: "none",
    status: "NEW",
    connected_services: [],
    target_keywords: [],
    sort_order: 3,
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "CAT-CONSULT",
    name: "상담 안내",
    tier: "primary",
    parent_id: null,
    role_type: "fixed",
    funnel_stage: "CONVERT",
    prologue_position: null,
    monthly_target: 0,
    cta_type: "direct",
    status: "MATURE",
    connected_services: [],
    target_keywords: [],
    sort_order: 5,
    created_at: "2025-01-01T00:00:00Z",
  },
];

// ── 데모 메트릭 데이터 ──
const DEMO_METRICS: CategoryMetric[] = [
  { id: 1, category_id: "CAT-A", month: "2026-01", published_count: 3, target_ratio: 1.5, total_views: 1850, avg_duration_sec: 185, estimated_conversions: 4, composite_score: 72, grade: "good" },
  { id: 2, category_id: "CAT-A", month: "2026-02", published_count: 2, target_ratio: 1.0, total_views: 2340, avg_duration_sec: 195, estimated_conversions: 6, composite_score: 78, grade: "good" },
  { id: 3, category_id: "CAT-A", month: "2026-03", published_count: 4, target_ratio: 2.0, total_views: 2890, avg_duration_sec: 210, estimated_conversions: 8, composite_score: 85, grade: "excellent" },
  { id: 4, category_id: "CAT-B", month: "2026-01", published_count: 1, target_ratio: 1.0, total_views: 980, avg_duration_sec: 145, estimated_conversions: 1, composite_score: 58, grade: "average" },
  { id: 5, category_id: "CAT-B", month: "2026-02", published_count: 2, target_ratio: 2.0, total_views: 1560, avg_duration_sec: 160, estimated_conversions: 2, composite_score: 65, grade: "good" },
  { id: 6, category_id: "CAT-B", month: "2026-03", published_count: 1, target_ratio: 1.0, total_views: 2100, avg_duration_sec: 170, estimated_conversions: 3, composite_score: 70, grade: "good" },
  { id: 7, category_id: "CAT-C", month: "2026-01", published_count: 2, target_ratio: 2.0, total_views: 620, avg_duration_sec: 120, estimated_conversions: 0, composite_score: 45, grade: "average" },
  { id: 8, category_id: "CAT-C", month: "2026-02", published_count: 1, target_ratio: 1.0, total_views: 890, avg_duration_sec: 135, estimated_conversions: 0, composite_score: 52, grade: "average" },
  { id: 9, category_id: "CAT-C", month: "2026-03", published_count: 2, target_ratio: 2.0, total_views: 1250, avg_duration_sec: 150, estimated_conversions: 1, composite_score: 60, grade: "good" },
];

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

    if (data && data.length > 0) {
      return data as Category[];
    }

    return DEMO_CATEGORIES.sort((a, b) => a.sort_order - b.sort_order);
  } catch (err) {
    console.error("[getCategories] 에러:", err);
    return DEMO_CATEGORIES.sort((a, b) => a.sort_order - b.sort_order);
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

    if (data && data.length > 0) {
      return data as CategoryMetric[];
    }

    return DEMO_METRICS.filter((m) => m.category_id === categoryId);
  } catch (err) {
    console.error("[getCategoryMetrics] 에러:", err);
    return DEMO_METRICS.filter((m) => m.category_id === categoryId);
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
