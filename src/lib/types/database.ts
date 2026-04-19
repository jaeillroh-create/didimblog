// Supabase 데이터베이스 타입 (추후 supabase gen types로 자동생성 대체)

export type UserRole = "admin" | "editor" | "designer" | "pending";

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
}

export type CategoryTier = "primary" | "secondary";
export type CategoryRoleType = "conversion" | "traffic_branding" | "trust" | "fixed";
export type FunnelStage = "ATTRACT" | "TRUST" | "CONVERT" | "MULTI";
export type CategoryStatus = "NEW" | "GROW" | "MATURE" | "ADJUST";

export interface Category {
  id: string;
  name: string;
  tier: CategoryTier;
  parent_id: string | null;
  role_type: CategoryRoleType;
  funnel_stage: FunnelStage;
  prologue_position: "area1" | "area2" | "area3" | null;
  monthly_target: number;
  cta_type: "direct" | "neighbor" | "none";
  status: CategoryStatus;
  connected_services: string[];
  target_keywords: string[];
  sort_order: number;
  created_at: string;
}

export type ContentStatus = "S0" | "S1" | "S2" | "S3" | "S4" | "S5";
export type TargetAudience = "startup" | "sme" | "cto" | null;
export type QualityGrade = "excellent" | "good" | "average" | "poor" | "critical";

export interface Content {
  id: string;
  title: string | null;
  category_id: string | null;
  secondary_category: string | null;
  target_keyword: string | null;
  target_audience: TargetAudience;
  status: ContentStatus;
  publish_date: string | null;
  briefing_due: string | null;
  draft_due: string | null;
  review_due: string | null;
  image_due: string | null;
  publish_due: string | null;
  briefing_done_at: string | null;
  draft_done_at: string | null;
  review_done_at: string | null;
  image_done_at: string | null;
  published_at: string | null;
  revision_count: number;
  author_id: string | null;
  reviewer_id: string | null;
  designer_id: string | null;
  views_1w: number | null;
  views_1m: number | null;
  avg_duration_sec: number | null;
  search_rank: number | null;
  cta_clicks: number | null;
  quality_score_1st: number | null;
  quality_score_final: number | null;
  quality_grade: QualityGrade | null;
  // 본문 및 태그
  body: string | null;
  tags: string[] | null;
  seo_keywords: string | null;
  scheduled_at: string | null;
  is_deleted: boolean;
  // SEO 점수 (자동 계산)
  seo_score: number | null;
  // 건강 상태
  health_status: HealthStatus;
  health_checked_at: string | null;
  // 시리즈
  series_id: string | null;
  series_order: number | null;
  // AI 관련 필드
  ai_generation_id: number | null;
  is_ai_generated: boolean;
  ai_edited_by: string | null;
  ai_edit_ratio: number | null;
  notes: string | null;
  // 대표 검수
  review_status: ReviewStatus;
  review_memo: string | null;
  created_at: string;
  updated_at: string;
}

export type ReviewStatus = "pending" | "approved" | "revision_requested";

// ── AI 콘텐츠 생성 엔진 타입 ──

export type LLMProvider = "claude" | "openai" | "gemini";
export type GenerationStatus = "pending" | "generating" | "completed" | "failed" | "cancelled";
export type GenerationType = "draft" | "cross_validation" | "regeneration";
export type TemplateType = "draft_generation" | "cross_validation" | "seo_optimization";
export type ValidationVerdict = "pass" | "fix_required" | "major_issues";
export type IssueSeverity = "high" | "medium" | "low";
export type IssueCategory = "팩트체크" | "논리" | "톤" | "SEO" | "독자" | "CTA";

export interface LLMConfig {
  id: number;
  provider: LLMProvider;
  display_name: string;
  model_id: string;
  api_key_encrypted: string | null;
  is_active: boolean;
  is_default: boolean;
  monthly_token_limit: number | null;
  monthly_tokens_used: number;
  last_tested_at: string | null;
  test_result: "success" | "failed" | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface PromptTemplateVariable {
  name: string;
  description: string;
  required: boolean;
}

export interface PromptTemplateOutputFormat {
  min_chars?: number;
  max_chars?: number;
  image_markers?: { min: number; max: number };
  include_title?: boolean;
  include_tags?: boolean;
  include_cta?: boolean;
  format?: string;
  response_schema?: string;
}

export interface PromptTemplate {
  id: number;
  name: string;
  category_id: string | null;
  template_type: TemplateType;
  system_prompt: string;
  user_prompt_template: string;
  variables: PromptTemplateVariable[] | null;
  output_format: PromptTemplateOutputFormat | null;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ValidationIssue {
  category: IssueCategory;
  severity: IssueSeverity;
  description: string;
  suggestion: string;
}

export interface ValidationResult {
  llm: LLMProvider;
  verdict: ValidationVerdict;
  overall_score: number;
  issues: ValidationIssue[];
  strengths: string[];
  improvement_suggestions: string[];
}

export interface ImageMarker {
  position: number;
  description: string;
  suggested_type?: string;
  imageUrl?: string;
  imageId?: string;
  altText?: string;
  generationStatus?: "pending" | "generating" | "completed" | "failed";
}

export interface GeneratedImage {
  id: string;
  generation_id: number;
  marker_index: number;
  description: string;
  prompt_used: string | null;
  image_provider: string;
  image_model: string;
  storage_path: string | null;
  public_url: string | null;
  alt_text: string | null;
  status: "pending" | "generating" | "completed" | "failed";
  error_message: string | null;
  generation_time_ms: number | null;
  created_at: string;
}

/**
 * 3-Phase 파이프라인의 현재 단계.
 * - phase1: 구조 설계 진행 중 또는 진행 전
 * - phase2: 본문 생성 진행 중
 * - phase3: SEO 최적화 진행 중
 * - completed: 모든 단계 종료 (Phase 3 를 건너뛴 경우 phase2 직후 completed 로도 진입 가능)
 * - failed: 어느 단계든 실패
 */
export type PipelinePhase = "phase1" | "phase2" | "phase25" | "phase3" | "completed" | "failed";

/**
 * Phase 1 구조 설계 결과 — PHASE1_PROMPT 의 JSON 응답 스키마.
 */
export interface Phase1Outline {
  title: string;
  hook_type: string;
  hook_summary: string;
  sections: Array<{
    heading: string;
    content_summary: string;
    has_infographic?: boolean;
    infographic_type?: string;
  }>;
  keyword_plan: {
    total_count: string | number;
    positions: string[];
  };
  legal_references: string[];
  /** @deprecated Phase 2.5 에서 별도 생성. 기존 데이터 호환을 위해 optional 유지. */
  infographic_plan?: Array<{
    position: string;
    type: string;
    data_source: string;
    emotion: string;
  }>;
  content_type: string;
}

export interface AIGeneration {
  id: number;
  content_id: string | null;
  generation_type: GenerationType;
  topic: string;
  category_id: string | null;
  target_keyword: string | null;
  additional_context: string | null;
  prompt_template_id: number | null;
  llm_provider: LLMProvider;
  llm_model: string;
  generated_text: string | null;
  generated_title: string | null;
  generated_tags: string[] | null;
  image_markers: ImageMarker[] | null;
  validation_results: ValidationResult[] | null;
  status: GenerationStatus;
  tokens_used: number | null;
  generation_time_ms: number | null;
  error_message: string | null;
  parent_generation_id: number | null;
  feedback: string | null;
  created_at: string;
  created_by: string | null;
  // 3-Phase 파이프라인 (009 마이그레이션)
  phase1_output: Phase1Outline | null;
  phase2_output: string | null;
  phase: PipelinePhase;
}

// LLM 메시지 인터페이스 (프록시 유틸리티용)
export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMStreamConfig {
  provider: LLMProvider;
  model: string;
  apiKey: string;
  maxTokens?: number;
  temperature?: number;
}

export type SeoVerdict = "pass" | "fix_required" | "blocked";

export type SearchApiProvider = "naver" | "google";

export interface SearchApiConfig {
  id: number;
  provider: SearchApiProvider;
  display_name: string;
  client_id: string;
  client_secret_encrypted: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface NewsArticle {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  source?: SearchApiProvider;
}

export interface SeoCheck {
  id: number;
  content_id: string;
  checked_at: string;
  checked_by: string;
  items: Record<string, { passed: boolean; note: string }>;
  required_pass_count: number;
  recommended_pass_count: number;
  optional_pass_count: number;
  verdict: SeoVerdict;
}

export interface Briefing {
  id: number;
  content_id: string;
  type: "audio" | "text";
  file_url: string | null;
  key_points: string[] | null;
  created_at: string;
  created_by: string;
}

export interface ContentMetric {
  id: number;
  content_id: string;
  measured_at: string;
  views: number;
  avg_duration_sec: number | null;
  search_rank: number | null;
  estimated_cta_clicks: number;
  source: "manual" | "auto";
}

export interface CategoryMetric {
  id: number;
  category_id: string;
  month: string;
  published_count: number;
  target_ratio: number | null;
  total_views: number;
  avg_duration_sec: number | null;
  estimated_conversions: number;
  composite_score: number | null;
  grade: QualityGrade | null;
}

export type LeadSource = "blog" | "referral" | "other";
export type InterestedService =
  | "tax_consulting"
  | "lab_management"
  | "venture_cert"
  | "invention_cert"
  | "patent"
  | "other";
export type ConsultationResult = "consulted" | "proposal_sent" | "pending" | "lost";

export interface Lead {
  id: number;
  contact_date: string;
  company_name: string;
  contact_name: string | null;
  contact_info: string | null;
  source: LeadSource;
  source_content_id: string | null;
  interested_service: InterestedService | null;
  visitor_status: "S3" | "S4" | "S5";
  consultation_result: ConsultationResult | null;
  contract_yn: boolean;
  contract_amount: number | null;
  notes: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export type ScheduleStatus = "planned" | "in_progress" | "published" | "delayed" | "skipped";

export interface Schedule {
  id: number;
  week_number: number;
  phase: "phase1" | "phase2";
  category_id: string | null;
  content_id: string | null;
  planned_date: string;
  status: ScheduleStatus;
  notes: string | null;
}

// ── 시리즈 ──

export interface Series {
  id: string;
  name: string;
  total_planned: number;
  created_at: string;
}

// ── 건강 상태 타입 ──
export type HealthStatus = "HEALTHY" | "CHECK_NEEDED" | "UPDATE_NEEDED" | "UPDATED";

// ── 키워드 풀 ──

export type KeywordPriority = "HIGH" | "MEDIUM" | "LOW";

export interface KeywordPool {
  id: string;
  keyword: string;
  category_id: string;
  sub_category_id: string | null;
  priority: KeywordPriority;
  covered_content_id: string | null;
  created_at: string;
}

// ── 대시보드 추천 피드백 (010 migration) ──

export type RecommendationSource = "keyword_pool" | "news_api" | "schedule" | "manual";
export type RecommendationStatus = "pending" | "accepted" | "rejected" | "generated";

export interface ContentRecommendation {
  id: string;
  recommended_topic: string;
  recommended_category: string | null;
  recommended_subcategory: string | null;
  recommended_keywords: string[] | null;
  source: RecommendationSource;
  /** 소스별 부가 정보 (뉴스 URL, 원본 키워드 ID, 스케줄 week 번호 등) */
  source_detail: Record<string, unknown> | null;
  status: RecommendationStatus;
  rejection_reason: string | null;
  rejection_keywords: string[] | null;
  created_at: string;
  acted_at: string | null;
  created_by: string | null;
}

// ── 키워드 순위 추적 ──

export interface KeywordRanking {
  id: string;
  keyword_id: string;
  month: string;
  rank: number | null;
  created_at: string;
}

// ── 뉴스 수집 ──

export interface NewsItem {
  id: number;
  title: string;
  description: string | null;
  link: string;
  pub_date: string | null;
  search_keyword: string;
  source: string;
  is_used: boolean;
  used_content_id: string | null;
  ai_summary: string | null;
  blog_angle: string | null;
  created_at: string;
}

export type EntityType = "content" | "category" | "lead";

export interface StateTransition {
  id: number;
  entity_type: EntityType;
  from_status: string;
  to_status: string;
  conditions: Record<string, unknown> | null;
  auto_checks: string[];
  description: string | null;
  is_reversible: boolean;
}
