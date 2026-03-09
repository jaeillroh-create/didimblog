-- ============================================
-- 1. users (Supabase Auth 확장)
-- ============================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  name text not null,
  role text not null check (role in ('admin', 'editor', 'designer')),
  avatar_url text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "프로필 조회는 인증된 사용자 모두 가능"
  on public.profiles for select
  using (auth.role() = 'authenticated');

create policy "프로필 수정은 본인만 가능"
  on public.profiles for update
  using (auth.uid() = id);

-- ============================================
-- 2. categories (카테고리 마스터)
-- ============================================
create table public.categories (
  id text primary key,
  name text not null,
  tier text not null check (tier in ('primary', 'secondary')),
  parent_id text references public.categories(id),
  role_type text not null check (role_type in ('conversion', 'traffic_branding', 'trust', 'fixed')),
  funnel_stage text not null check (funnel_stage in ('ATTRACT', 'TRUST', 'CONVERT', 'MULTI')),
  prologue_position text check (prologue_position in ('area1', 'area2', 'area3', null)),
  monthly_target int not null default 0,
  cta_type text check (cta_type in ('direct', 'neighbor', 'none')),
  status text not null default 'NEW' check (status in ('NEW', 'GROW', 'MATURE', 'ADJUST')),
  connected_services text[],
  target_keywords text[],
  sort_order int not null default 0,
  created_at timestamptz default now()
);

-- ============================================
-- 3. contents (콘텐츠 제작 관리)
-- ============================================
create table public.contents (
  id text primary key,
  title text,
  category_id text references public.categories(id),
  secondary_category text,
  target_keyword text,
  target_audience text check (target_audience in ('startup', 'sme', 'cto', null)),
  status text not null default 'S0' check (status in ('S0', 'S1', 'S2', 'S3', 'S4', 'S5')),
  publish_date date,
  briefing_due date,
  draft_due date,
  review_due date,
  image_due date,
  publish_due date,
  briefing_done_at timestamptz,
  draft_done_at timestamptz,
  review_done_at timestamptz,
  image_done_at timestamptz,
  published_at timestamptz,
  revision_count int not null default 0,
  author_id uuid references public.profiles(id),
  reviewer_id uuid references public.profiles(id),
  designer_id uuid references public.profiles(id),
  views_1w int,
  views_1m int,
  avg_duration_sec int,
  search_rank int,
  cta_clicks int,
  quality_score_1st numeric(5,2),
  quality_score_final numeric(5,2),
  quality_grade text check (quality_grade in ('excellent', 'good', 'average', 'poor', 'critical')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- 4. seo_checks (SEO 체크리스트 이력)
-- ============================================
create table public.seo_checks (
  id serial primary key,
  content_id text references public.contents(id) on delete cascade,
  checked_at timestamptz default now(),
  checked_by uuid references public.profiles(id),
  items jsonb not null,
  required_pass_count int not null,
  recommended_pass_count int not null,
  optional_pass_count int not null,
  verdict text not null check (verdict in ('pass', 'fix_required', 'blocked'))
);

-- ============================================
-- 5. briefings (음성 브리핑)
-- ============================================
create table public.briefings (
  id serial primary key,
  content_id text references public.contents(id) on delete cascade,
  type text not null check (type in ('audio', 'text')),
  file_url text,
  key_points jsonb,
  created_at timestamptz default now(),
  created_by uuid references public.profiles(id)
);

-- ============================================
-- 6. content_metrics (글별 성과 - 시계열)
-- ============================================
create table public.content_metrics (
  id serial primary key,
  content_id text references public.contents(id) on delete cascade,
  measured_at date not null,
  views int not null default 0,
  avg_duration_sec int,
  search_rank int,
  estimated_cta_clicks int default 0,
  source text check (source in ('manual', 'auto')),
  unique (content_id, measured_at)
);

-- ============================================
-- 7. category_metrics (카테고리 월간 성과)
-- ============================================
create table public.category_metrics (
  id serial primary key,
  category_id text references public.categories(id) on delete cascade,
  month date not null,
  published_count int not null default 0,
  target_ratio numeric(5,2),
  total_views int not null default 0,
  avg_duration_sec int,
  estimated_conversions int default 0,
  composite_score numeric(5,2),
  grade text check (grade in ('excellent', 'good', 'average', 'poor', 'critical')),
  unique (category_id, month)
);

-- ============================================
-- 8. leads (리드 추적)
-- ============================================
create table public.leads (
  id serial primary key,
  contact_date date not null,
  company_name text not null,
  contact_name text,
  contact_info text,
  source text not null check (source in ('blog', 'referral', 'other')),
  source_content_id text references public.contents(id),
  interested_service text check (interested_service in ('tax_consulting', 'lab_management', 'venture_cert', 'invention_cert', 'patent', 'other')),
  visitor_status text not null default 'S3' check (visitor_status in ('S3', 'S4', 'S5')),
  consultation_result text check (consultation_result in ('consulted', 'proposal_sent', 'pending', 'lost')),
  contract_yn boolean default false,
  contract_amount numeric(15,0),
  notes text,
  assigned_to uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- 9. schedules (발행 스케줄)
-- ============================================
create table public.schedules (
  id serial primary key,
  week_number int not null,
  phase text not null check (phase in ('phase1', 'phase2')),
  category_id text references public.categories(id),
  content_id text references public.contents(id),
  planned_date date not null,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'published', 'delayed', 'skipped')),
  notes text,
  unique (week_number, category_id)
);

-- ============================================
-- 10. state_transitions (상태 전이 규칙)
-- ============================================
create table public.state_transitions (
  id serial primary key,
  entity_type text not null check (entity_type in ('content', 'category', 'lead')),
  from_status text not null,
  to_status text not null,
  conditions jsonb,
  auto_checks text[],
  description text,
  is_reversible boolean default false,
  unique (entity_type, from_status, to_status)
);

-- ============================================
-- RLS 정책
-- ============================================
alter table public.contents enable row level security;
create policy "contents_select" on public.contents for select using (auth.role() = 'authenticated');
create policy "contents_insert" on public.contents for insert with check (auth.role() = 'authenticated');
create policy "contents_update" on public.contents for update using (auth.role() = 'authenticated');
create policy "contents_delete" on public.contents for delete using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

alter table public.leads enable row level security;
create policy "leads_all" on public.leads for all using (auth.role() = 'authenticated');

alter table public.categories enable row level security;
create policy "categories_all" on public.categories for all using (auth.role() = 'authenticated');

alter table public.seo_checks enable row level security;
create policy "seo_checks_all" on public.seo_checks for all using (auth.role() = 'authenticated');

alter table public.briefings enable row level security;
create policy "briefings_all" on public.briefings for all using (auth.role() = 'authenticated');

alter table public.content_metrics enable row level security;
create policy "content_metrics_all" on public.content_metrics for all using (auth.role() = 'authenticated');

alter table public.category_metrics enable row level security;
create policy "category_metrics_all" on public.category_metrics for all using (auth.role() = 'authenticated');

alter table public.schedules enable row level security;
create policy "schedules_all" on public.schedules for all using (auth.role() = 'authenticated');

alter table public.state_transitions enable row level security;
create policy "state_transitions_select" on public.state_transitions for select using (auth.role() = 'authenticated');
create policy "state_transitions_admin" on public.state_transitions for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
