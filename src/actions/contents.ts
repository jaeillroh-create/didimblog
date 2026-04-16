"use server";

import { createClient } from "@/lib/supabase/server";
import {
  type Content,
  type Category,
  type Profile,
  type StateTransition,
  type ContentStatus,
  type ReviewStatus,
} from "@/lib/types/database";
import { formatDate, calculateSlaDates, getNextTuesday } from "@/lib/utils/date-helpers";

// ── 공통 에러 포맷 헬퍼 ──

/**
 * Supabase PostgrestError 또는 일반 Error 에서 디버그 가능한 메시지를 추출.
 *
 * PostgrestError 는 { code, message, details, hint } 구조이고 instanceof Error 가 아니다.
 * 이 함수는 code 와 message 를 결합해서 사용자가 원인을 즉시 파악할 수 있게 한다.
 *
 * 예: "검수 승인 실패: (42703) column \"review_status\" of relation \"contents\" does not exist"
 */
function formatSupabaseError(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "code" in err && "message" in err) {
    const pg = err as { code: string; message: string; details?: string | null; hint?: string | null };
    const parts = [`(${pg.code})`, pg.message];
    if (pg.details) parts.push(`[${pg.details}]`);
    if (pg.hint) parts.push(`힌트: ${pg.hint}`);
    return `${fallback}: ${parts.join(" ")}`;
  }
  if (err instanceof Error) {
    return `${fallback}: ${err.message}`;
  }
  return fallback;
}

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
      review_status: "pending" as const,
      review_memo: null,
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

    // 인증 확인
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return {
        data: null,
        error: `상태 변경 실패: 인증 오류 — ${authError?.message ?? "세션 없음"}`,
      };
    }

    // 현재 상태 조회 (전이 로그용)
    const { data: current } = await supabase
      .from("contents")
      .select("status")
      .eq("id", contentId)
      .single();
    const fromStatus = (current?.status as string) ?? "unknown";

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

    if (error) {
      console.error("[updateContentStatus] Supabase 에러:", JSON.stringify(error));
      return { data: null, error: formatSupabaseError(error, "상태 변경 실패") };
    }

    // 전이 이력 기록 (실패해도 무시)
    await supabase
      .from("state_transitions_log")
      .insert({
        content_id: contentId,
        from_status: fromStatus,
        to_status: newStatus,
        transitioned_by: user.id,
      })
      .then(() => {}, (err) => console.warn("[전이 이력] 기록 실패:", err));

    return { data: data as Content, error: null };
  } catch (err) {
    console.error("[updateContentStatus] 예외:", err);
    return { data: null, error: formatSupabaseError(err, "상태 변경 실패") };
  }
}

/**
 * 확장된 상태 전이 — 메타 정보(URL, 성과, 사유)를 함께 저장.
 *
 * 사용처:
 *   - S3 → S4 발행 완료: naverBlogUrl, publishedAt 주입
 *   - S4 → S5 성과 측정: performanceSnapshot (views / comments / neighbor / consultation)
 *   - 역행 전이: transitionReason 주입
 *
 * 기존 contents.notes 컬럼에 prefix 로 저장하여 마이그레이션 없이 작동한다.
 * notes 의 기존 내용이 있으면 뒤에 append 하는 방식.
 */
export interface UpdateContentStatusWithMetaInput {
  contentId: string;
  newStatus: ContentStatus;
  naverBlogUrl?: string;
  publishedAtOverride?: string;
  performanceSnapshot?: {
    views_1w?: number;
    comments?: number;
    neighbor_added?: number;
    consultation_yn?: boolean;
  };
  transitionReason?: string;
  isReversal?: boolean;
  force?: boolean; // admin 강제 전환 플래그 (서버측 별도 검증 없음 — UI 에서 이미 판단)
}

export async function updateContentStatusWithMeta(
  input: UpdateContentStatusWithMetaInput
): Promise<{
  data: Content | null;
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    // 인증 확인
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return {
        data: null,
        error: `상태 변경 실패: 인증 오류 — ${authError?.message ?? "세션 없음"}`,
      };
    }

    // 기존 content 조회 (notes append + 전이 로그용)
    const { data: existing } = await supabase
      .from("contents")
      .select("notes, views_1w, status")
      .eq("id", input.contentId)
      .single();
    const fromStatus = (existing?.status as string) ?? "unknown";

    const updateData: Record<string, unknown> = {
      status: input.newStatus,
      updated_at: new Date().toISOString(),
    };

    // 상태별 타임스탬프 자동 기록 (override 있으면 그 값 사용)
    if (input.newStatus === "S1") {
      updateData.draft_done_at = new Date().toISOString();
    } else if (input.newStatus === "S2") {
      updateData.review_done_at = new Date().toISOString();
    } else if (input.newStatus === "S3") {
      updateData.image_done_at = new Date().toISOString();
    } else if (input.newStatus === "S4") {
      updateData.published_at = input.publishedAtOverride || new Date().toISOString();
    }

    // 성과 스냅샷 — contents 테이블의 기존 컬럼(views_1w, cta_clicks)에 매핑
    if (input.performanceSnapshot) {
      if (typeof input.performanceSnapshot.views_1w === "number") {
        updateData.views_1w = input.performanceSnapshot.views_1w;
      }
      if (typeof input.performanceSnapshot.comments === "number") {
        updateData.cta_clicks = input.performanceSnapshot.comments;
      }
    }

    // notes 에 메타 정보 append (마이그레이션 없이 작동)
    const existingNotes = (existing?.notes as string | null) ?? "";
    const metaLines: string[] = [];
    if (input.naverBlogUrl) {
      metaLines.push(`[네이버 URL] ${input.naverBlogUrl}`);
    }
    if (input.performanceSnapshot) {
      const s = input.performanceSnapshot;
      const parts: string[] = [];
      if (typeof s.views_1w === "number") parts.push(`조회수 ${s.views_1w}`);
      if (typeof s.comments === "number") parts.push(`댓글 ${s.comments}`);
      if (typeof s.neighbor_added === "number") parts.push(`이웃 +${s.neighbor_added}`);
      if (typeof s.consultation_yn === "boolean")
        parts.push(`상담 ${s.consultation_yn ? "유입" : "없음"}`);
      if (parts.length > 0) {
        metaLines.push(`[성과 1주차] ${parts.join(" · ")}`);
      }
    }
    if (input.transitionReason) {
      const prefix = input.isReversal ? "[역행 전이 사유]" : "[전이 사유]";
      metaLines.push(`${prefix} ${input.transitionReason}`);
    }
    if (metaLines.length > 0) {
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const block = `\n\n── ${stamp} (${input.newStatus}) ──\n${metaLines.join("\n")}`;
      updateData.notes = existingNotes + block;
    }

    const { data, error } = await supabase
      .from("contents")
      .update(updateData)
      .eq("id", input.contentId)
      .select()
      .single();

    if (error) {
      console.error("[updateContentStatusWithMeta] Supabase 에러:", JSON.stringify(error));
      return { data: null, error: formatSupabaseError(error, "상태 변경 실패") };
    }

    // 전이 이력 기록
    await supabase
      .from("state_transitions_log")
      .insert({
        content_id: input.contentId,
        from_status: fromStatus,
        to_status: input.newStatus,
        transitioned_by: user.id,
        is_forced: input.force ?? false,
        force_reason: input.force ? (input.transitionReason ?? "강제 전환") : null,
      })
      .then(() => {}, (err) => console.warn("[전이 이력] 기록 실패:", err));

    return { data: data as Content, error: null };
  } catch (err) {
    console.error("[updateContentStatusWithMeta] 예외:", err);
    return {
      data: null,
      error: formatSupabaseError(err, "상태 변경 실패"),
    };
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

    // 인증 확인
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return {
        data: null,
        error: `저장 실패: 인증 오류 — ${authError?.message ?? "세션 없음"}. 다시 로그인 해주세요.`,
      };
    }

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

    if (error) {
      console.error("[updateContent] Supabase 에러:", JSON.stringify(error));
      return { data: null, error: formatSupabaseError(error, "저장 실패") };
    }

    // RLS 가 UPDATE 를 무시(0 row)하면 .single() 이 PGRST116 에러를 반환하므로
    // 여기까지 왔으면 실제로 1개 row 가 업데이트된 것이다.
    if (!data) {
      return {
        data: null,
        error: "저장 실패: 서버에서 업데이트된 데이터를 반환하지 않았습니다. RLS 정책 또는 콘텐츠 ID를 확인하세요.",
      };
    }

    return { data: data as Content, error: null };
  } catch (err) {
    console.error("[updateContent] 예외:", err);
    return { data: null, error: formatSupabaseError(err, "저장 실패") };
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

// ── 대표 검수 ──

export interface ReviewApproveInput {
  contentId: string;
  checkedItems: string[];
}

/**
 * 대표 검수 승인.
 *
 * 기록:
 *   - review_status = 'approved'
 *   - reviewer_id = 현재 인증 사용자 id
 *   - review_done_at = now()
 *   - review_memo = 체크 항목 기록
 *
 * ⚠️ review_status / review_memo 컬럼이 DB 에 없으면 Supabase 가 42703 에러를 반환.
 *    그 경우 012_review_columns.sql 마이그레이션을 Supabase SQL Editor 에서 수동 실행해야 함.
 */
export async function approveReview(
  input: ReviewApproveInput
): Promise<{ data: Content | null; error: string | null }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        data: null,
        error: `검수 승인 실패: 인증 오류 — ${authError?.message ?? "세션 없음"}. 다시 로그인 해주세요.`,
      };
    }

    const { data, error } = await supabase
      .from("contents")
      .update({
        review_status: "approved" as ReviewStatus,
        reviewer_id: user.id,
        review_done_at: new Date().toISOString(),
        review_memo: `[검수 승인] 체크: ${input.checkedItems.join(", ")}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.contentId)
      .select()
      .single();

    if (error) {
      console.error("[approveReview] Supabase 에러:", JSON.stringify(error));
      return { data: null, error: formatSupabaseError(error, "검수 승인 실패") };
    }
    return { data: data as Content, error: null };
  } catch (err) {
    console.error("[approveReview] 예외:", err);
    return { data: null, error: formatSupabaseError(err, "검수 승인 실패") };
  }
}

export interface RevisionRequestInput {
  contentId: string;
  memo: string;
}

/** 대표 수정 요청 — review_status='revision_requested', revision_count++ */
export async function requestRevision(
  input: RevisionRequestInput
): Promise<{ data: Content | null; error: string | null }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        data: null,
        error: `수정 요청 실패: 인증 오류 — ${authError?.message ?? "세션 없음"}`,
      };
    }

    // 기존 revision_count 조회
    const { data: existing } = await supabase
      .from("contents")
      .select("revision_count")
      .eq("id", input.contentId)
      .single();

    const { data, error } = await supabase
      .from("contents")
      .update({
        review_status: "revision_requested" as ReviewStatus,
        reviewer_id: user.id,
        review_memo: input.memo,
        revision_count: (existing?.revision_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.contentId)
      .select()
      .single();

    if (error) {
      console.error("[requestRevision] Supabase 에러:", JSON.stringify(error));
      return { data: null, error: formatSupabaseError(error, "수정 요청 실패") };
    }
    return { data: data as Content, error: null };
  } catch (err) {
    console.error("[requestRevision] 예외:", err);
    return { data: null, error: formatSupabaseError(err, "수정 요청 실패") };
  }
}

/** 검수 상태 초기화 (수정 완료 후 재검수 요청) */
export async function resetReviewStatus(
  contentId: string
): Promise<{ data: Content | null; error: string | null }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("contents")
      .update({
        review_status: "pending" as ReviewStatus,
        review_memo: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contentId)
      .select()
      .single();

    if (error) {
      console.error("[resetReviewStatus] Supabase 에러:", JSON.stringify(error));
      return { data: null, error: formatSupabaseError(error, "검수 상태 초기화 실패") };
    }
    return { data: data as Content, error: null };
  } catch (err) {
    console.error("[resetReviewStatus] 예외:", err);
    return { data: null, error: formatSupabaseError(err, "검수 상태 초기화 실패") };
  }
}
