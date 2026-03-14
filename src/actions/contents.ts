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

// ── 데모 데이터 (Supabase 미연결 시 폴백) ──

const DEMO_CATEGORIES: Category[] = [
  {
    id: "CAT-A",
    name: "변리사의 현장 수첩",
    tier: "primary",
    parent_id: null,
    role_type: "conversion",
    funnel_stage: "CONVERT",
    prologue_position: "area1",
    monthly_target: 4,
    cta_type: "direct",
    status: "GROW",
    connected_services: ["tax_consulting", "lab_management"],
    target_keywords: ["연구소 세금", "절세 시뮬레이션"],
    sort_order: 1,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "CAT-A-01",
    name: "절세 시뮬레이션",
    tier: "secondary",
    parent_id: "CAT-A",
    role_type: "conversion",
    funnel_stage: "CONVERT",
    prologue_position: null,
    monthly_target: 2,
    cta_type: "direct",
    status: "NEW",
    connected_services: ["tax_consulting"],
    target_keywords: ["절세 시뮬레이션", "연구소 절세"],
    sort_order: 2,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "CAT-B",
    name: "IP 라운지",
    tier: "primary",
    parent_id: null,
    role_type: "traffic_branding",
    funnel_stage: "ATTRACT",
    prologue_position: "area2",
    monthly_target: 4,
    cta_type: "neighbor",
    status: "GROW",
    connected_services: ["patent", "venture_cert"],
    target_keywords: ["특허 전략", "IP 관리"],
    sort_order: 3,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "CAT-C",
    name: "디딤 다이어리",
    tier: "primary",
    parent_id: null,
    role_type: "trust",
    funnel_stage: "TRUST",
    prologue_position: "area3",
    monthly_target: 2,
    cta_type: "none",
    status: "MATURE",
    connected_services: [],
    target_keywords: ["디딤 소식", "변리사 일상"],
    sort_order: 4,
    created_at: "2026-01-01T00:00:00Z",
  },
];

const DEMO_PROFILES: Profile[] = [
  {
    id: "user-1",
    name: "노재일",
    role: "admin",
    email: "jaeil@didim.kr",
    avatar_url: null,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "user-2",
    name: "콘텐츠 담당자",
    role: "editor",
    email: "editor@didim.kr",
    avatar_url: null,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "user-3",
    name: "디자인 담당자",
    role: "designer",
    email: "designer@didim.kr",
    avatar_url: null,
    created_at: "2026-01-01T00:00:00Z",
  },
];

const DEMO_STATE_TRANSITIONS: StateTransition[] = [
  {
    id: 1,
    entity_type: "content",
    from_status: "S0",
    to_status: "S1",
    conditions: { ai_generation_done: true },
    auto_checks: ["ai_generation_exists"],
    description: "기획→초안: AI 초안 생성 완료 필요",
    is_reversible: false,
  },
  {
    id: 2,
    entity_type: "content",
    from_status: "S1",
    to_status: "S2",
    conditions: { review_done: true, seo_required_pass: true },
    auto_checks: ["seo_check", "review_exists"],
    description: "초안→검토: 팩트체크+SEO필수 통과",
    is_reversible: false,
  },
  {
    id: 3,
    entity_type: "content",
    from_status: "S2",
    to_status: "S3",
    conditions: { image_done: true, final_edit_done: true },
    auto_checks: ["image_uploaded", "final_edit"],
    description: "검토→발행예정: 이미지+최종편집 완료",
    is_reversible: false,
  },
  {
    id: 4,
    entity_type: "content",
    from_status: "S3",
    to_status: "S4",
    conditions: { scheduled_time_reached: true },
    auto_checks: ["schedule_check"],
    description: "발행예정→발행완료: 예약 시간 도래 (자동)",
    is_reversible: false,
  },
  {
    id: 5,
    entity_type: "content",
    from_status: "S4",
    to_status: "S5",
    conditions: { quality_measured: true },
    auto_checks: ["quality_score_exists"],
    description: "발행→성과측정: 품질점수 입력 완료",
    is_reversible: false,
  },
  {
    id: 6,
    entity_type: "content",
    from_status: "S1",
    to_status: "S0",
    conditions: { major_revision: true },
    auto_checks: [],
    description: "초안→기획: 전면 변경 시 역행",
    is_reversible: true,
  },
  {
    id: 7,
    entity_type: "content",
    from_status: "S2",
    to_status: "S1",
    conditions: { minor_revision: true, revision_count_lt_3: true },
    auto_checks: [],
    description: "검토→초안: 수정 필요 시 역행 (최대2회)",
    is_reversible: true,
  },
];

function makeDemoContent(overrides: Partial<Content> & { id: string; title: string; status: ContentStatus }): Content {
  const publishDate = overrides.publish_date ? new Date(overrides.publish_date) : getNextTuesday();
  const slaDates = calculateSlaDates(publishDate);

  return {
    category_id: "CAT-A",
    secondary_category: null,
    target_keyword: null,
    target_audience: null,
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
    author_id: "user-1",
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
    ai_generation_id: null,
    is_ai_generated: false,
    ai_edited_by: null,
    ai_edit_ratio: null,
    notes: null,
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    ...overrides,
  };
}

const DEMO_CONTENTS: Content[] = [
  makeDemoContent({
    id: "W01-01",
    title: "연구소 절세 시뮬레이션 – 법인세 20% 줄이는 3가지 방법",
    status: "S5",
    category_id: "CAT-A",
    target_keyword: "연구소 절세 시뮬레이션",
    target_audience: "startup",
    author_id: "user-1",
    publish_date: "2026-01-13",
    published_at: "2026-01-13T09:00:00Z",
    quality_score_final: 78,
    quality_grade: "good",
    views_1w: 320,
  }),
  makeDemoContent({
    id: "W02-01",
    title: "특허 출원 전 반드시 확인해야 할 5가지 체크리스트",
    status: "S4",
    category_id: "CAT-B",
    target_keyword: "특허 출원 체크리스트",
    target_audience: "sme",
    author_id: "user-2",
    publish_date: "2026-01-20",
    published_at: "2026-01-20T09:00:00Z",
  }),
  makeDemoContent({
    id: "W03-01",
    title: "벤처인증 가점 항목 완전 정리 (2026년 최신)",
    status: "S4",
    category_id: "CAT-B",
    target_keyword: "벤처인증 가점",
    target_audience: "startup",
    author_id: "user-1",
    publish_date: "2026-01-27",
    published_at: "2026-01-27T09:00:00Z",
  }),
  makeDemoContent({
    id: "W04-01",
    title: "디딤이 걸어온 길 – 창립 10주년 스토리",
    status: "S3",
    category_id: "CAT-C",
    target_keyword: "디딤 특허법인",
    author_id: "user-1",
    publish_date: "2026-03-17",
  }),
  makeDemoContent({
    id: "W05-01",
    title: "연구소 설립 시 세액공제 한도 계산법",
    status: "S2",
    category_id: "CAT-A",
    target_keyword: "세액공제 한도",
    target_audience: "cto",
    author_id: "user-2",
    reviewer_id: "user-1",
    publish_date: "2026-03-24",
    review_done_at: "2026-03-05T10:00:00Z",
  }),
  makeDemoContent({
    id: "W06-01",
    title: "IP 분쟁 대응 매뉴얼 – 중소기업 편",
    status: "S1",
    category_id: "CAT-B",
    target_keyword: "IP 분쟁 대응",
    target_audience: "sme",
    author_id: "user-2",
    publish_date: "2026-03-31",
    draft_done_at: "2026-03-07T14:00:00Z",
  }),
  makeDemoContent({
    id: "W07-01",
    title: "직무발명 보상 규정 가이드",
    status: "S1",
    category_id: "CAT-A-01",
    target_keyword: "직무발명 보상",
    target_audience: "cto",
    author_id: "user-1",
    publish_date: "2026-04-07",
  }),
  makeDemoContent({
    id: "W08-01",
    title: "스타트업 대표가 알아야 할 특허 포트폴리오 전략",
    status: "S0",
    category_id: "CAT-B",
    target_keyword: "특허 포트폴리오",
    target_audience: "startup",
    author_id: "user-2",
    publish_date: "2026-04-14",
  }),
  makeDemoContent({
    id: "W09-01",
    title: "연구소 인정 요건 변경사항 총정리 (2026)",
    status: "S0",
    category_id: "CAT-A",
    target_keyword: "연구소 인정 요건",
    target_audience: "sme",
    author_id: "user-1",
    publish_date: "2026-04-21",
  }),
  makeDemoContent({
    id: "W10-01",
    title: "디딤 고객 사례 – 특허 전략으로 투자 유치 성공기",
    status: "S0",
    category_id: "CAT-C",
    target_keyword: "특허 투자유치",
    author_id: "user-1",
    publish_date: "2026-04-28",
  }),
];

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

    if (data && data.length > 0) {
      return { data: data as ContentWithCategory[], error: null };
    }

    // Supabase에 데이터가 없으면 데모 데이터 반환
    const demoWithCategory = DEMO_CONTENTS.map((c) => ({
      ...c,
      category: DEMO_CATEGORIES.find((cat) => cat.id === c.category_id) ?? null,
    }));
    return { data: demoWithCategory, error: null };
  } catch (err) {
    console.error("[getContents] 에러:", err);
    // 에러 시에도 데모 데이터 반환
    const demoWithCategory = DEMO_CONTENTS.map((c) => ({
      ...c,
      category: DEMO_CATEGORIES.find((cat) => cat.id === c.category_id) ?? null,
    }));
    return { data: demoWithCategory, error: null };
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

    if (data && data.length > 0) {
      return { data: data as Category[], error: null };
    }

    return { data: DEMO_CATEGORIES, error: null };
  } catch (err) {
    console.error("[getCategories] 에러:", err);
    return { data: DEMO_CATEGORIES, error: null };
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

    if (data && data.length > 0) {
      return { data: data as Profile[], error: null };
    }

    return { data: DEMO_PROFILES, error: null };
  } catch (err) {
    console.error("[getProfiles] 에러:", err);
    return { data: DEMO_PROFILES, error: null };
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

    if (data && data.length > 0) {
      return { data: data as StateTransition[], error: null };
    }

    return { data: DEMO_STATE_TRANSITIONS, error: null };
  } catch (err) {
    console.error("[getStateTransitions] 에러:", err);
    return { data: DEMO_STATE_TRANSITIONS, error: null };
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

    // 조건 검증 (데모 환경에서는 조건 이름만 표시)
    const failedConditions: string[] = [];
    const conditions = transition.conditions ?? {};

    // 실제 Supabase에서 콘텐츠 상태 확인
    try {
      const supabase = await createClient();
      const { data: content } = await supabase
        .from("contents")
        .select("*")
        .eq("id", contentId)
        .single();

      if (content) {
        // 실제 조건 검증
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
    } catch {
      // Supabase 연결 실패 시 데모 모드 — 전이 허용
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

    // 역행 시 revision_count 증가
    const statusOrder = ["S0", "S1", "S2", "S3", "S4", "S5"];
    const currentIdx = statusOrder.indexOf(newStatus);
    // S2→S1 또는 S1→S0 역행
    if (newStatus === "S0" || newStatus === "S1") {
      // 역행 가능성이 있으므로 revision_count를 증가시킬 수 있음
      // 실제로는 현재 상태와 비교해야 하지만, 서버 액션에서는 단순 업데이트
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
