"use server";

import { createClient } from "@/lib/supabase/server";
import {
  type Content,
  type Category,
  type Profile,
  type StateTransition,
  type ContentStatus,
} from "@/lib/types/database";
import { formatDate, calculateSlaDates, getNextTuesday } from "@/lib/utils/date-helpers";

// ── 콘텐츠 목록 조회 ──

export interface ContentWithCategory extends Content {
  category?: Category | null;
}

export async function getContents(): Promise<{
  data: ContentWithCategory[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("contents")
      .select("*, category:categories(*)")
      .or("is_deleted.is.null,is_deleted.eq.false")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return { data: (data ?? []) as ContentWithCategory[], error: null };
  } catch (err) {
    console.error("[getContents] 에러:", err);
    return { data: [], error: "콘텐츠 목록을 불러올 수 없습니다." };
  }
}

// ── 카테고리 목록 조회 ──

export async function getCategories(): Promise<{
  data: Category[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) throw error;

    return { data: (data ?? []) as Category[], error: null };
  } catch (err) {
    console.error("[getCategories] 에러:", err);
    return { data: [], error: "카테고리를 불러올 수 없습니다." };
  }
}

// ── 프로필(팀원) 목록 조회 ──

export async function getProfiles(): Promise<{
  data: Profile[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("name", { ascending: true });

    if (error) throw error;

    return { data: (data ?? []) as Profile[], error: null };
  } catch (err) {
    console.error("[getProfiles] 에러:", err);
    return { data: [], error: "팀원 목록을 불러올 수 없습니다." };
  }
}

// ── 상태 전이 규칙 조회 ──

export async function getStateTransitions(): Promise<{
  data: StateTransition[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("state_transitions")
      .select("*")
      .eq("entity_type", "content");

    if (error) throw error;

    return { data: (data ?? []) as StateTransition[], error: null };
  } catch (err) {
    console.error("[getStateTransitions] 에러:", err);
    return { data: [], error: "상태 전이 규칙을 불러올 수 없습니다." };
  }
}

// ── 콘텐츠 생성 ──

interface CreateContentInput {
  title: string;
  category_id: string;
  secondary_category?: string;
  target_keyword?: string;
  target_audience?: "startup" | "sme" | "cto";
  publish_date?: string;
  author_id?: string;
}

export async function createContent(input: CreateContentInput): Promise<{
  data: Content | null;
  error: string | null;
}> {
  try {
    const publishDate = input.publish_date
      ? new Date(input.publish_date)
      : getNextTuesday();
    const slaDates = calculateSlaDates(publishDate);

    // W{주차}-{순번} 형식 ID 생성
    const weekNumber = Math.ceil(
      (publishDate.getTime() - new Date("2026-01-05").getTime()) /
        (7 * 24 * 60 * 60 * 1000)
    );
    const weekStr = String(weekNumber).padStart(2, "0");

    const supabase = await createClient();

    // 해당 주차의 기존 콘텐츠 수 확인
    const { count } = await supabase
      .from("contents")
      .select("*", { count: "exact", head: true })
      .like("id", `W${weekStr}-%`);

    const seq = String((count ?? 0) + 1).padStart(2, "0");
    const contentId = `W${weekStr}-${seq}`;

    const newContent: Omit<Content, "created_at" | "updated_at"> = {
      id: contentId,
      title: input.title,
      category_id: input.category_id,
      secondary_category: input.secondary_category ?? null,
      target_keyword: input.target_keyword ?? null,
      target_audience: (input.target_audience as Content["target_audience"]) ?? null,
      status: "S0",
      publish_date: formatDate(publishDate),
      briefing_due: formatDate(slaDates.briefingDue),
      draft_due: formatDate(slaDates.draftDue),
      review_due: formatDate(slaDates.reviewDue),
      image_due: formatDate(slaDates.imageDue),
      publish_due: formatDate(slaDates.publishDue),
      briefing_done_at: null,
      draft_done_at: null,
      review_done_at: null,
      image_done_at: null,
      published_at: null,
      revision_count: 0,
      author_id: input.author_id ?? null,
      reviewer_id: null,
      designer_id: null,
      views_1w: null,
      views_1m: null,
      avg_duration_sec: null,
      search_rank: null,
      cta_clicks: null,
      quality_score_1st: null,
      quality_score_final: null,
      quality_grade: null,
      body: null,
      tags: null,
      seo_keywords: null,
      scheduled_at: null,
      is_deleted: false,
      seo_score: null,
      health_status: "HEALTHY" as const,
      health_checked_at: null,
      series_id: null,
      series_order: null,
      ai_generation_id: null,
      is_ai_generated: false,
      ai_edited_by: null,
      ai_edit_ratio: null,
      notes: null,
    };

    const { data, error } = await supabase
      .from("contents")
      .insert(newContent)
      .select()
      .single();

    if (error) throw error;

    return { data: data as Content, error: null };
  } catch (err) {
    console.error("[createContent] 에러:", err);
    return { data: null, error: "콘텐츠 생성에 실패했습니다." };
  }
}

// ── 상태 전이 검증 ──

export async function validateTransition(
  contentId: string,
  fromStatus: ContentStatus,
  toStatus: ContentStatus
): Promise<{
  valid: boolean;
  failedConditions: string[];
  transition: StateTransition | null;
}> {
  try {
    const { data: transitions } = await getStateTransitions();

    // 해당 전이 규칙 찾기
    const transition = transitions.find(
      (t) => t.from_status === fromStatus && t.to_status === toStatus
    );

    if (!transition) {
      return {
        valid: false,
        failedConditions: [`${fromStatus}에서 ${toStatus}로의 전이는 허용되지 않습니다.`],
        transition: null,
      };
    }

    const failedConditions: string[] = [];
    const conditions = transition.conditions ?? {};

    const supabase = await createClient();
    const { data: content } = await supabase
      .from("contents")
      .select("*")
      .eq("id", contentId)
      .single();

    if (content) {
      if (conditions.ai_generation_done && !content.ai_generation_id) {
        failedConditions.push("AI 초안 생성이 완료되지 않았습니다.");
      }
      if (conditions.review_done && !content.review_done_at) {
        failedConditions.push("검토가 완료되지 않았습니다.");
      }
      if (conditions.image_done && !content.image_done_at) {
        failedConditions.push("이미지가 준비되지 않았습니다.");
      }
      if (conditions.revision_count_lt_3 && content.revision_count >= 3) {
        failedConditions.push("수정 횟수가 최대치(2회)를 초과했습니다.");
      }
      if (conditions.quality_measured && !content.quality_score_final) {
        failedConditions.push("품질 점수가 입력되지 않았습니다.");
      }
    }

    return {
      valid: failedConditions.length === 0,
      failedConditions,
      transition,
    };
  } catch (err) {
    console.error("[validateTransition] 에러:", err);
    return {
      valid: false,
      failedConditions: ["전이 검증 중 오류가 발생했습니다."],
      transition: null,
    };
  }
}

// ── 콘텐츠 상태 변경 ──

export async function updateContentStatus(
  contentId: string,
  newStatus: ContentStatus
): Promise<{
  data: Content | null;
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    const updateData: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    // 상태별 타임스탬프 자동 기록
    if (newStatus === "S1") {
      updateData.draft_done_at = new Date().toISOString();
    } else if (newStatus === "S2") {
      updateData.review_done_at = new Date().toISOString();
    } else if (newStatus === "S3") {
      updateData.image_done_at = new Date().toISOString();
    } else if (newStatus === "S4") {
      updateData.published_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("contents")
      .update(updateData)
      .eq("id", contentId)
      .select()
      .single();

    if (error) throw error;

    return { data: data as Content, error: null };
  } catch (err) {
    console.error("[updateContentStatus] 에러:", err);
    return { data: null, error: "상태 변경에 실패했습니다." };
  }
}

// ── 콘텐츠 수정 (저장) ──

export interface UpdateContentInput {
  title?: string | null;
  body?: string | null;
  category_id?: string | null;
  secondary_category?: string | null;
  target_keyword?: string | null;
  target_audience?: "startup" | "sme" | "cto" | null;
  status?: ContentStatus;
  publish_date?: string | null;
  tags?: string[] | null;
  seo_keywords?: string | null;
  scheduled_at?: string | null;
  notes?: string | null;
  seo_score?: number | null;
}

export async function updateContent(
  contentId: string,
  input: UpdateContentInput
): Promise<{
  data: Content | null;
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    const updateData: Record<string, unknown> = {
      ...input,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("contents")
      .update(updateData)
      .eq("id", contentId)
      .select()
      .single();

    if (error) throw error;

    return { data: data as Content, error: null };
  } catch (err) {
    console.error("[updateContent] 에러:", err);
    return { data: null, error: "저장에 실패했습니다." };
  }
}

// ── 콘텐츠 삭제 (soft delete) ──

export async function deleteContent(
  contentId: string
): Promise<{
  success: boolean;
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from("contents")
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq("id", contentId);

    if (error) throw error;

    return { success: true, error: null };
  } catch (err) {
    console.error("[deleteContent] 에러:", err);
    return { success: false, error: "삭제에 실패했습니다." };
  }
}

// ── 단일 콘텐츠 조회 ──

export async function getContent(
  contentId: string
): Promise<{
  data: Content | null;
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("contents")
      .select("*")
      .eq("id", contentId)
      .single();

    if (error) throw error;

    const content = data as Content;

    // soft-deleted 콘텐츠는 찾을 수 없음 처리
    if (content?.is_deleted) {
      return { data: null, error: null };
    }

    return { data: content, error: null };
  } catch (err) {
    console.error("[getContent] 에러:", err);
    return { data: null, error: "콘텐츠를 불러오지 못했습니다." };
  }
}
