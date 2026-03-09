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
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type SeoVerdict = "pass" | "fix_required" | "blocked";

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
