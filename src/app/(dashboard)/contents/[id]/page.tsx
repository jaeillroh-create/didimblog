import { createClient } from "@/lib/supabase/server";
import type {
  Content,
  Category,
  Profile,
  StateTransition,
} from "@/lib/types/database";
import { ContentDetailClient } from "./content-detail-client";
import { ContentNotFound } from "./content-not-found";

// 데모 콘텐츠 데이터
function getDemoContent(id: string): Content | null {
  // 데모 ID 패턴: W01-01, W02-01, ... W10-01
  const demoIds = [
    "W01-01", "W02-01", "W03-01", "W04-01", "W05-01",
    "W06-01", "W07-01", "W08-01", "W09-01", "W10-01",
  ];
  if (!demoIds.includes(id)) return null;

  return {
    id,
    title: "스타트업 세무 가이드: 법인 설립 후 첫 세금 신고 완벽 정리",
    category_id: "CAT-A",
    secondary_category: null,
    target_keyword: "스타트업 세무",
    target_audience: "startup",
    status: "S2",
    publish_date: "2026-03-17",
    briefing_due: "2026-03-12",
    draft_due: "2026-03-14",
    review_due: "2026-03-15",
    image_due: "2026-03-16",
    publish_due: "2026-03-17",
    briefing_done_at: "2026-03-11T10:00:00Z",
    draft_done_at: "2026-03-13T14:00:00Z",
    review_done_at: null,
    image_done_at: null,
    published_at: null,
    revision_count: 2,
    author_id: "user-1",
    reviewer_id: "user-2",
    designer_id: "user-3",
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
    ai_generation_id: null,
    is_ai_generated: false,
    ai_edited_by: null,
    ai_edit_ratio: null,
    notes: "법인 설립 초기 기업 대상 세무 가이드 콘텐츠",
    created_at: "2026-03-01T09:00:00Z",
    updated_at: "2026-03-09T12:00:00Z",
  };
}

function getDemoCategories(): Category[] {
  return [
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
      connected_services: ["tax_consulting"],
      target_keywords: ["세무", "회계"],
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
      target_keywords: ["절세"],
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
      connected_services: ["patent"],
      target_keywords: ["특허", "지식재산"],
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
      target_keywords: ["디딤", "기업 성장"],
      sort_order: 4,
      created_at: "2026-01-01T00:00:00Z",
    },
  ];
}

function getDemoProfiles(): Profile[] {
  return [
    {
      id: "user-1",
      email: "admin@didimip.com",
      name: "노재일",
      role: "admin",
      avatar_url: null,
      created_at: "2026-01-01T00:00:00Z",
    },
  ];
}

function getDemoTransitions(): StateTransition[] {
  return [
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
      conditions: { seo_required_pass: true },
      auto_checks: ["seo_check", "fact_check"],
      description: "초안→검토: 팩트체크+SEO필수 통과",
      is_reversible: false,
    },
    {
      id: 3,
      entity_type: "content",
      from_status: "S2",
      to_status: "S3",
      conditions: { image_done: true },
      auto_checks: ["image_check"],
      description: "검토→발행예정: 이미지+최종편집 완료",
      is_reversible: false,
    },
    {
      id: 4,
      entity_type: "content",
      from_status: "S3",
      to_status: "S4",
      conditions: { publish_time_reached: true },
      auto_checks: ["schedule_check"],
      description: "발행예정→발행완료: 예약 시간 도래",
      is_reversible: false,
    },
    {
      id: 5,
      entity_type: "content",
      from_status: "S4",
      to_status: "S5",
      conditions: { quality_score_entered: true },
      auto_checks: ["quality_check"],
      description: "발행→성과측정: 품질점수 입력 완료",
      is_reversible: false,
    },
    {
      id: 6,
      entity_type: "content",
      from_status: "S1",
      to_status: "S0",
      conditions: null,
      auto_checks: [],
      description: "초안→기획: 전면 변경 시 역행",
      is_reversible: true,
    },
    {
      id: 7,
      entity_type: "content",
      from_status: "S2",
      to_status: "S1",
      conditions: null,
      auto_checks: [],
      description: "검토→초안: 수정 필요 시 역행",
      is_reversible: true,
    },
  ];
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ContentDetailPage({ params }: PageProps) {
  const { id } = await params;

  let content: Content | null = null;
  let categories: Category[] = [];
  let profiles: Profile[] = [];
  let transitions: StateTransition[] = [];
  let isDbConnected = false;

  try {
    const supabase = await createClient();

    // 병렬로 데이터 조회
    const [contentRes, categoriesRes, profilesRes, transitionsRes] =
      await Promise.all([
        supabase.from("contents").select("*").eq("id", id).single(),
        supabase.from("categories").select("*").order("sort_order"),
        supabase.from("profiles").select("*"),
        supabase
          .from("state_transitions")
          .select("*")
          .eq("entity_type", "content"),
      ]);

    if (contentRes.data) {
      const c = contentRes.data as Content;
      // soft-deleted 콘텐츠는 찾을 수 없음 처리
      if (c.is_deleted) {
        content = null;
      } else {
        content = c;
      }
      isDbConnected = true;
    } else if (contentRes.error?.code === "PGRST116") {
      // 데이터 없음 (single row not found)
      isDbConnected = true;
      content = null;
    }

    if (categoriesRes.data) categories = categoriesRes.data as Category[];
    if (profilesRes.data) profiles = profilesRes.data as Profile[];
    if (transitionsRes.data)
      transitions = transitionsRes.data as StateTransition[];
  } catch {
    console.log("Supabase 연결 실패, 데모 데이터 사용");
  }

  // DB에 연결되었지만 콘텐츠가 없으면 → 찾을 수 없음
  if (isDbConnected && !content) {
    return <ContentNotFound />;
  }

  // DB 미연결 시 데모 데이터 폴백
  if (!content) {
    const demo = getDemoContent(id);
    if (!demo) return <ContentNotFound />;
    content = demo;
  }
  if (categories.length === 0) categories = getDemoCategories();
  if (profiles.length === 0) profiles = getDemoProfiles();
  if (transitions.length === 0) transitions = getDemoTransitions();

  return (
    <ContentDetailClient
      content={content}
      categories={categories}
      profiles={profiles}
      transitions={transitions}
    />
  );
}
