import { createClient } from "@/lib/supabase/server";
import { getSeoCheck } from "@/actions/seo-checks";
import type {
  Content,
  Category,
  Profile,
  StateTransition,
  Briefing,
} from "@/lib/types/database";
import { ContentDetailClient } from "./content-detail-client";

// 데모 콘텐츠 데이터
function getDemoContent(id: string): Content {
  return {
    id,
    title: "스타트업 세무 가이드: 법인 설립 후 첫 세금 신고 완벽 정리",
    category_id: "CAT-A",
    secondary_category: "CAT-B",
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
    notes: "법인 설립 초기 기업 대상 세무 가이드 콘텐츠",
    created_at: "2026-03-01T09:00:00Z",
    updated_at: "2026-03-09T12:00:00Z",
  };
}

function getDemoCategories(): Category[] {
  return [
    {
      id: "CAT-A",
      name: "현장 수첩",
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
      sort_order: 2,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "CAT-C",
      name: "디딤 다이어리",
      tier: "secondary",
      parent_id: null,
      role_type: "trust",
      funnel_stage: "TRUST",
      prologue_position: "area3",
      monthly_target: 2,
      cta_type: "none",
      status: "MATURE",
      connected_services: [],
      target_keywords: ["디딤", "기업 성장"],
      sort_order: 3,
      created_at: "2026-01-01T00:00:00Z",
    },
  ];
}

function getDemoProfiles(): Profile[] {
  return [
    {
      id: "user-1",
      email: "author@didim.com",
      name: "김작가",
      role: "editor",
      avatar_url: null,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "user-2",
      email: "reviewer@didim.com",
      name: "박검수",
      role: "admin",
      avatar_url: null,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "user-3",
      email: "designer@didim.com",
      name: "이디자인",
      role: "designer",
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
      conditions: { briefing_done: true },
      auto_checks: ["briefing_exists"],
      description: "기획→초안: 브리핑 완료 필요",
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

function getDemoBriefing(contentId: string): Briefing | null {
  return {
    id: 1,
    content_id: contentId,
    type: "text",
    file_url: null,
    key_points: [
      "법인 설립 후 첫 세금 신고 시기와 종류",
      "부가가치세, 법인세 신고 절차",
      "초기 스타트업이 놓치기 쉬운 세무 포인트",
    ],
    created_at: "2026-03-11T10:00:00Z",
    created_by: "user-1",
  };
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
  let briefing: Briefing | null = null;

  try {
    const supabase = await createClient();

    // 병렬로 데이터 조회
    const [contentRes, categoriesRes, profilesRes, transitionsRes, briefingRes] =
      await Promise.all([
        supabase.from("contents").select("*").eq("id", id).single(),
        supabase.from("categories").select("*").order("sort_order"),
        supabase.from("profiles").select("*"),
        supabase
          .from("state_transitions")
          .select("*")
          .eq("entity_type", "content"),
        supabase
          .from("briefings")
          .select("*")
          .eq("content_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    if (contentRes.data) content = contentRes.data as Content;
    if (categoriesRes.data) categories = categoriesRes.data as Category[];
    if (profilesRes.data) profiles = profilesRes.data as Profile[];
    if (transitionsRes.data)
      transitions = transitionsRes.data as StateTransition[];
    if (briefingRes.data) briefing = briefingRes.data as Briefing;
  } catch {
    console.log("Supabase 연결 실패, 데모 데이터 사용");
  }

  // 데모 데이터 폴백
  if (!content) content = getDemoContent(id);
  if (categories.length === 0) categories = getDemoCategories();
  if (profiles.length === 0) profiles = getDemoProfiles();
  if (transitions.length === 0) transitions = getDemoTransitions();
  if (!briefing) briefing = getDemoBriefing(id);

  // SEO 체크 데이터
  const seoCheck = await getSeoCheck(id);

  return (
    <ContentDetailClient
      content={content}
      categories={categories}
      profiles={profiles}
      transitions={transitions}
      briefing={briefing}
      seoCheck={seoCheck}
    />
  );
}
