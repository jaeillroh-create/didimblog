# SPEC.md — 디딤 블로그 운영 시스템 (DidiM Blog Ops)

> **이 문서는 Claude Code가 프로젝트 전체 맥락을 파악하기 위한 스펙 문서입니다.**
> **구현 시 이 문서를 기준으로 작업해주세요.**

---

## 1. 프로젝트 개요

### 1.1 무엇을 만드는가
특허그룹 디딤의 네이버 블로그 운영을 관리하는 **내부 백오피스 웹 시스템**.
블로그 콘텐츠의 기획→제작→발행→성과측정 전 과정을 관리하고, 리드(상담 문의) 추적부터 KPI 대시보드까지 포함.

### 1.2 사용자
- **노재일 대표** (admin): 음성 브리핑 제공, 팩트체크, 최종 승인
- **콘텐츠 담당자** (editor): 초안 작성, SEO 체크, 발행 관리
- **디자인 담당자** (designer): 이미지 제작/업로드
- **외부 대행사** (editor): 초안 작성 위탁 시
- 동시 접속 최대 5명 이하. 순수 내부 도구.

### 1.3 핵심 가치
> "이 글을 읽은 대표가 디딤에 전화하게 만드는 것"
> 블로그의 단일 목적. 모든 기능은 이 목적에 연결되어야 함.

---

## 2. 기술 스택

| 영역 | 기술 | 버전/티어 |
|------|------|-----------|
| Frontend | Next.js (App Router) | 15.x |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 3.x |
| UI Components | shadcn/ui | latest |
| State (Client) | Zustand | 5.x |
| State (Server) | TanStack Query | 5.x |
| Charts | Recharts | 2.x |
| Drag & Drop | @hello-pangea/dnd | latest |
| Tables | TanStack Table | 8.x |
| Backend/DB | Supabase (PostgreSQL) | Pro tier |
| Auth | Supabase Auth | Email + Google OAuth |
| Storage | Supabase Storage | 이미지/음성파일 |
| Realtime | Supabase Realtime | SLA 위반 알림 |
| Deploy | Vercel | Free → Pro |
| Repo | GitHub | Private |

### 2.1 프로젝트 구조 (목표)

```
didim-blog-ops/
├── SPEC.md                    # 이 파일
├── CLAUDE.md                  # Claude Code 지시사항
├── .env.local                 # Supabase 키 (gitignore)
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql   # DDL
│   └── seed.sql                     # 초기 데이터
├── src/
│   ├── app/
│   │   ├── layout.tsx               # 루트 레이아웃 (사이드바)
│   │   ├── page.tsx                 # / → /dashboard 리다이렉트
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── dashboard/
│   │   │   └── page.tsx             # 대시보드 (홈)
│   │   ├── contents/
│   │   │   ├── page.tsx             # 콘텐츠 칸반보드
│   │   │   └── [id]/
│   │   │       └── page.tsx         # 콘텐츠 상세
│   │   ├── calendar/
│   │   │   └── page.tsx             # 발행 캘린더
│   │   ├── categories/
│   │   │   └── page.tsx             # 카테고리 관리
│   │   ├── leads/
│   │   │   └── page.tsx             # 리드 추적 CRM
│   │   ├── analytics/
│   │   │   └── page.tsx             # 성과 분석
│   │   └── settings/
│   │       └── page.tsx             # 설정
│   ├── components/
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   ├── header.tsx
│   │   │   └── nav-item.tsx
│   │   ├── contents/
│   │   │   ├── kanban-board.tsx     # S0~S5 칸반
│   │   │   ├── kanban-column.tsx
│   │   │   ├── content-card.tsx
│   │   │   ├── seo-checklist.tsx    # SEO 18항목 체크
│   │   │   ├── quality-score.tsx    # 품질점수 표시
│   │   │   └── content-form.tsx     # 글 생성/편집 폼
│   │   ├── dashboard/
│   │   │   ├── kpi-cards.tsx
│   │   │   ├── weekly-tasks.tsx
│   │   │   ├── recent-leads.tsx
│   │   │   └── sla-alerts.tsx
│   │   ├── leads/
│   │   │   ├── lead-table.tsx
│   │   │   ├── lead-form.tsx
│   │   │   └── pipeline-chart.tsx
│   │   ├── analytics/
│   │   │   ├── kpi-trend-chart.tsx
│   │   │   ├── quality-ranking.tsx
│   │   │   └── category-comparison.tsx
│   │   └── ui/                      # shadcn/ui 컴포넌트
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts            # 브라우저 클라이언트
│   │   │   ├── server.ts            # 서버 클라이언트
│   │   │   └── middleware.ts        # 인증 미들웨어
│   │   ├── constants/
│   │   │   ├── content-states.ts    # S0~S5 상태 정의
│   │   │   ├── seo-items.ts         # SEO 18항목 정의
│   │   │   └── categories.ts        # 카테고리 초기 데이터
│   │   ├── utils/
│   │   │   ├── quality-score.ts     # 품질점수 계산
│   │   │   ├── sla-checker.ts       # SLA 위반 체크
│   │   │   └── date-helpers.ts
│   │   └── types/
│   │       └── database.ts          # Supabase 타입 (자동생성)
│   ├── actions/
│   │   ├── contents.ts              # 콘텐츠 CRUD + 상태전이
│   │   ├── seo-checks.ts           # SEO 체크리스트
│   │   ├── leads.ts                 # 리드 CRUD
│   │   ├── categories.ts           # 카테고리 관리
│   │   └── analytics.ts            # 성과 데이터 조회
│   └── stores/
│       ├── content-filter.ts        # 콘텐츠 목록 필터
│       └── ui.ts                    # 사이드바 상태 등
└── middleware.ts                    # Next.js 미들웨어 (인증)
```

---

## 3. 데이터베이스 스키마 (Supabase PostgreSQL)

### 3.1 테이블 DDL

```sql
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
  id text primary key,                          -- 예: CAT-A, CAT-A-01
  name text not null,                           -- 예: 변리사의 현장 수첩
  tier text not null check (tier in ('primary', 'secondary')),
  parent_id text references public.categories(id),
  role_type text not null check (role_type in ('conversion', 'traffic_branding', 'trust', 'fixed')),
  funnel_stage text not null check (funnel_stage in ('ATTRACT', 'TRUST', 'CONVERT', 'MULTI')),
  prologue_position text check (prologue_position in ('area1', 'area2', 'area3', null)),
  monthly_target int not null default 0,        -- 월간 발행 목표
  cta_type text check (cta_type in ('direct', 'neighbor', 'none')),
  status text not null default 'NEW' check (status in ('NEW', 'GROW', 'MATURE', 'ADJUST')),
  connected_services text[],                    -- 연결 서비스라인 배열
  target_keywords text[],                       -- 타깃 키워드 배열
  sort_order int not null default 0,
  created_at timestamptz default now()
);

-- ============================================
-- 3. contents (콘텐츠 제작 관리)
-- ============================================
create table public.contents (
  id text primary key,                          -- W01-01 형식
  title text,                                   -- 25~30자
  category_id text references public.categories(id),
  secondary_category text,                      -- 2차 분류명
  target_keyword text,                          -- 핵심 키워드
  target_audience text check (target_audience in ('startup', 'sme', 'cto', null)),
  status text not null default 'S0' check (status in ('S0', 'S1', 'S2', 'S3', 'S4', 'S5')),
  publish_date date,                            -- 발행 예정일 (화요일 고정)
  -- SLA 추적
  briefing_due date,                            -- D-5
  draft_due date,                               -- D-3
  review_due date,                              -- D-2
  image_due date,                               -- D-1
  publish_due date,                             -- D-0
  briefing_done_at timestamptz,
  draft_done_at timestamptz,
  review_done_at timestamptz,
  image_done_at timestamptz,
  published_at timestamptz,
  -- 수정 추적
  revision_count int not null default 0,        -- 최대 2회
  -- 담당자
  author_id uuid references public.profiles(id),
  reviewer_id uuid references public.profiles(id),
  designer_id uuid references public.profiles(id),
  -- 성과 (발행 후 입력)
  views_1w int,
  views_1m int,
  avg_duration_sec int,
  search_rank int,
  cta_clicks int,
  quality_score_1st numeric(5,2),               -- 2주 후 1차
  quality_score_final numeric(5,2),             -- 4주 후 최종
  quality_grade text check (quality_grade in ('excellent', 'good', 'average', 'poor', 'critical')),
  -- 메타
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
  items jsonb not null,                         -- {항목번호: {passed: bool, note: string}}
  required_pass_count int not null,             -- /10
  recommended_pass_count int not null,          -- /5
  optional_pass_count int not null,             -- /3
  verdict text not null check (verdict in ('pass', 'fix_required', 'blocked'))
);

-- ============================================
-- 5. briefings (음성 브리핑)
-- ============================================
create table public.briefings (
  id serial primary key,
  content_id text references public.contents(id) on delete cascade,
  type text not null check (type in ('audio', 'text')),
  file_url text,                                -- Supabase Storage URL
  key_points jsonb,                             -- ["포인트1", "포인트2", "포인트3"]
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
  month date not null,                          -- 2025-04-01 형식 (월 첫째날)
  published_count int not null default 0,
  target_ratio numeric(5,2),                    -- 목표 대비 발행률 %
  total_views int not null default 0,
  avg_duration_sec int,
  estimated_conversions int default 0,
  composite_score numeric(5,2),                 -- 조회50+전환30+체류20
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
  contact_info text,                            -- 전화번호 or 이메일
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
  week_number int not null,                     -- 1~52
  phase text not null check (phase in ('phase1', 'phase2')),
  category_id text references public.categories(id),
  content_id text references public.contents(id),
  planned_date date not null,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'published', 'delayed', 'skipped')),
  notes text,
  unique (week_number, category_id)
);

-- ============================================
-- 10. state_transitions (상태 전이 규칙 - 데이터 관리)
-- ============================================
create table public.state_transitions (
  id serial primary key,
  entity_type text not null check (entity_type in ('content', 'category', 'lead')),
  from_status text not null,
  to_status text not null,
  conditions jsonb,                             -- 전이 조건 JSON
  auto_checks text[],                           -- 자동 검증 항목 배열
  description text,
  is_reversible boolean default false,
  unique (entity_type, from_status, to_status)
);

-- ============================================
-- RLS 정책 (핵심)
-- ============================================

-- contents: 인증된 사용자 모두 조회 가능, 수정은 역할별
alter table public.contents enable row level security;
create policy "contents_select" on public.contents for select using (auth.role() = 'authenticated');
create policy "contents_insert" on public.contents for insert with check (auth.role() = 'authenticated');
create policy "contents_update" on public.contents for update using (auth.role() = 'authenticated');
create policy "contents_delete" on public.contents for delete using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- leads: admin만 삭제 가능, 나머지는 모두 가능
alter table public.leads enable row level security;
create policy "leads_all" on public.leads for all using (auth.role() = 'authenticated');

-- 나머지 테이블도 동일 패턴 (인증된 사용자 전체 접근, 삭제는 admin만)
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
```

### 3.2 초기 시드 데이터

```sql
-- 카테고리 시드 데이터
insert into public.categories (id, name, tier, parent_id, role_type, funnel_stage, prologue_position, monthly_target, cta_type, status, connected_services, sort_order) values
('CAT-INTRO', '디딤 소개', 'primary', null, 'fixed', 'MULTI', null, 0, 'none', 'MATURE', '{}', 1),
('CAT-A', '변리사의 현장 수첩', 'primary', null, 'conversion', 'ATTRACT', 'area1', 2, 'direct', 'NEW', '{"절세컨설팅","사후관리","벤처인증","우수기업인증"}', 2),
('CAT-A-01', '절세 시뮬레이션', 'secondary', 'CAT-A', 'conversion', 'CONVERT', null, 0, 'direct', 'NEW', '{"절세컨설팅"}', 1),
('CAT-A-02', '인증 가이드', 'secondary', 'CAT-A', 'conversion', 'CONVERT', null, 0, 'direct', 'NEW', '{"벤처인증","우수기업인증"}', 2),
('CAT-A-03', '연구소 운영 실무', 'secondary', 'CAT-A', 'conversion', 'CONVERT', null, 0, 'direct', 'NEW', '{"사후관리"}', 3),
('CAT-B', 'IP 라운지', 'primary', null, 'traffic_branding', 'ATTRACT', 'area2', 1, 'neighbor', 'NEW', '{"특허출원","AI특허","기술보호"}', 3),
('CAT-B-01', 'AI와 IP', 'secondary', 'CAT-B', 'traffic_branding', 'ATTRACT', null, 0, 'neighbor', 'NEW', '{"AI특허"}', 1),
('CAT-B-02', '특허 전략 노트', 'secondary', 'CAT-B', 'traffic_branding', 'TRUST', null, 0, 'neighbor', 'NEW', '{"특허출원","기술보호"}', 2),
('CAT-B-03', 'IP 뉴스 한 입', 'secondary', 'CAT-B', 'traffic_branding', 'ATTRACT', null, 0, 'neighbor', 'NEW', '{}', 3),
('CAT-C', '디딤 다이어리', 'primary', null, 'trust', 'TRUST', 'area3', 1, 'none', 'NEW', '{}', 4),
('CAT-C-01', '컨설팅 후기', 'secondary', 'CAT-C', 'trust', 'TRUST', null, 0, 'none', 'NEW', '{}', 1),
('CAT-C-02', '디딤 일상', 'secondary', 'CAT-C', 'trust', 'TRUST', null, 0, 'none', 'NEW', '{}', 2),
('CAT-C-03', '대표의 생각', 'secondary', 'CAT-C', 'trust', 'TRUST', null, 0, 'none', 'NEW', '{}', 3),
('CAT-CONSULT', '상담 안내', 'primary', null, 'fixed', 'CONVERT', null, 0, 'direct', 'MATURE', '{}', 5);

-- 콘텐츠 상태 전이 규칙
insert into public.state_transitions (entity_type, from_status, to_status, conditions, auto_checks, description, is_reversible) values
('content', 'S0', 'S1', '{"briefing_done": true}', '{"briefing_exists"}', '기획→초안: 브리핑 완료 필요', false),
('content', 'S1', 'S2', '{"review_done": true, "seo_required_pass": true}', '{"seo_required_check", "fact_check_done"}', '초안→검토: 팩트체크+SEO필수 통과', true),
('content', 'S2', 'S3', '{"image_done": true, "final_edit_done": true}', '{"image_uploaded", "publish_date_set"}', '검토→발행예정: 이미지+최종편집 완료', false),
('content', 'S3', 'S4', '{"scheduled_time_reached": true}', '{}', '발행예정→발행완료: 예약 시간 도래 (자동)', false),
('content', 'S4', 'S5', '{"quality_measured": true}', '{"quality_score_calculated"}', '발행→성과측정: 품질점수 입력 완료', false),
('content', 'S1', 'S0', '{"major_revision": true}', '{}', '초안→기획: 전면 변경 시 역행', true),
('content', 'S2', 'S1', '{"minor_revision": true, "revision_count_lt_3": true}', '{}', '검토→초안: 수정 필요 시 역행 (최대2회)', true);
```

---

## 4. 페이지별 상세 스펙

### 4.1 대시보드 (/dashboard)
**사용 빈도:** 매일
**핵심 컴포넌트:**
- KPI 카드 7개: 일일방문자, 월간방문자, 키워드순위, 평균체류시간, 이웃수, 상담문의, 계약체결
- 이번 주 할 일: 이번 주 발행 예정 글의 SLA 현황 (D-5~D-0 진행 상태)
- SLA 위반 알림: 기한 초과 항목 빨간색 하이라이트
- 최근 리드: 최근 5건의 상담 문의

### 4.2 콘텐츠 관리 (/contents)
**사용 빈도:** 주 3~4회
**핵심 UX:** S0~S5 **칸반보드** (가장 중요한 화면)
- 6개 칼럼: 기획중 / 초안완료 / 검토완료 / 발행예정 / 발행완료 / 성과측정
- 카드 드래그 시 상태 전이 규칙 자동 검증 (state_transitions 테이블 참조)
- 전이 조건 미충족 시 팝업으로 미충족 항목 표시 + 전이 블록
- 상단에 필터: 카테고리 / 상태 / 담당자 / 날짜 범위
- "새 글 만들기" 버튼 → content-form 모달

### 4.3 콘텐츠 상세 (/contents/[id])
- 글 정보 편집 폼 (제목, 카테고리, 키워드, 타깃 고객군)
- 상태 전이 버튼 (현재 상태에서 가능한 전이만 활성화)
- SEO 체크리스트 (18항목, 등급별 색상 구분: 필수=빨강, 권장=주황, 선택=회색)
- 브리핑 관리 (음성 파일 업로드 or 텍스트 입력)
- SLA 타임라인 (D-5~D-0 진행 상황 시각화)
- 품질점수 표시 (발행 후 2주/4주 측정값)
- 수정 이력 (revision_count 표시)

### 4.4 발행 캘린더 (/calendar)
- 월간 캘린더 뷰
- 카테고리별 색상 코드: 현장수첩=오렌지, IP라운지=네이비, 다이어리=그레이
- 화요일에만 발행 마커 표시
- 발행 비율 게이지 (현재 비율 vs 목표 2:1:1)

### 4.5 카테고리 관리 (/categories)
- 트리 구조 시각화 (1차 → 2차 하위)
- 카테고리별 생애주기 상태 배지 (NEW/GROW/MATURE/ADJUST)
- 월간 성과 미니 차트 (조회수/전환/체류시간)
- 발행 비율 모니터링 (현재 vs 목표)

### 4.6 리드 추적 (/leads)
- 리드 목록 테이블 (정렬/필터/검색)
- 유입 경로 통계 (블로그 vs 소개 vs 기타)
- 파이프라인 시각화 (S3 리드 → S4 상담 → S5 계약)
- 계약 전환율 + 누적 계약금액

### 4.7 성과 분석 (/analytics)
- KPI 트렌드 차트 (월별 추이, Recharts LineChart)
- 글별 품질 랭킹 (Top 10 / Bottom 10)
- 카테고리 비교 (레이더 차트)
- 월간 리포트 자동 생성 (인쇄용)

### 4.8 설정 (/settings)
- 팀 멤버 관리 (초대/역할변경/삭제)
- CTA 템플릿 관리 (카테고리별)
- SEO 기준 설정 (필수/권장/선택 항목 조정)
- 상태 전이 규칙 편집 (admin only)

---

## 5. 핵심 비즈니스 로직

### 5.1 콘텐츠 상태 전이 규칙 (S0~S5)

| 전이 | 조건 | 자동 검증 |
|------|------|-----------|
| S0→S1 | 브리핑 완료 | briefings 테이블에 레코드 존재 |
| S1→S2 | 팩트체크 완료 + SEO 필수 10항목 통과 | seo_checks.verdict = 'pass' |
| S2→S3 | 이미지 완료 + 최종 편집 완료 | image_done_at not null + publish_date 설정됨 |
| S3→S4 | 예약 시간 도래 (자동) | 현재시간 >= publish_date |
| S4→S5 | 품질점수 입력 완료 | quality_score_final not null |
| S1→S0 | 전면 변경 (역행) | revision_count < 3 |
| S2→S1 | 수정 필요 (역행) | revision_count < 3, revision_count++ |

### 5.2 SEO 체크리스트 18항목 등급

**필수 (10개) — 모두 통과해야 발행 가능:**
1. 제목 길이 25~30자
2. 제목 키워드 앞 15자
4. 도입부 톤 (사람의 상황으로 시작)
5. 본문 키워드 3~5회
8. 이미지 최소 3장
9. 첫 이미지 브랜딩 썸네일
11. 본문 분량 1,500~2,500자
14. 태그 10개
16. CTA 배치 (구분선 + 연락처)
18. 예약 시간 화요일 09:00

**권장 (5개) — 2개까지 미충족 허용:**
6. 소제목 '제목2' 2개+
7. 소제목 키워드 변형
12. 내부 링크 2~3개
15. 태그 구성 (핵심3+연관3+브랜드2+롱테일2)

**선택 (3개) — 미충족 허용:**
3. 제목 숫자 포함
10. 이미지 ALT 텍스트
17. 맞춤법 검사 통과

### 5.3 품질점수 계산 공식
```
quality_score = (views_normalized * 40) + (duration_normalized * 30) + (conversion_normalized * 30)

각 지표 정규화: 해당 월 전체 글 대비 상대 점수 (0~100)

등급:
- excellent: 80+
- good: 60~79
- average: 40~59
- poor: 20~39
- critical: 0~19
```

### 5.4 SLA 기준 (발행일 기준 역산)
```
D-5 (목요일): 음성 브리핑 완료
D-3 (토요일): 초안 작성 완료
D-2 (일요일): 팩트체크 + 검수 완료
D-1 (월요일): 이미지 제작 완료
D-0 (화요일): 최종 편집 + 09:00 예약 발행
```

---

## 6. UI/UX 가이드라인

### 6.1 디자인 토큰
- Primary: #1B3A5C (네이비)
- Accent: #2E75B6 (블루)
- 현장수첩 색상: #D4740A (오렌지)
- IP라운지 색상: #1B3A5C (네이비)
- 다이어리 색상: #6B7280 (그레이)
- 배경: #F8FAFC
- 카드: #FFFFFF, border: #E2E8F0, shadow: sm
- 폰트: Pretendard (한글) + Inter (영문/숫자)

### 6.2 레이아웃
- 사이드바 (240px, 접기 가능) + 메인 콘텐츠 영역
- 사이드바: 로고 + 네비게이션 8개 메뉴 + 하단 사용자 프로필
- 헤더: 페이지 제목 + 브레드크럼 + 알림 벨 + 사용자 아바타

### 6.3 반응형
- 데스크톱 우선 (1280px+)
- 태블릿 지원 (768px+)
- 모바일은 뷰어 전용 (편집 기능 제한)

## 추가: 컴포넌트 구조 (SPEC.md에 붙여넣기)

### 재사용 가능 공통 컴포넌트 (12개)

| 컴포넌트 | Props | 사용 위치 |
|---------|-------|----------|
| StatusBadge | status: 'S0'~'S5', size?: 'sm'|'md' | 칸반카드, 테이블, 상세 |
| QualityBadge | grade: 'excellent'~'critical' | 테이블, 상세, 분석 |
| CategoryBadge | categoryId: string | 칸반, 캘린더, 테이블 |
| SLAIndicator | steps: SLAStep[], current: number | 대시보드, 칸반, 상세 |
| KPICard | title, value, change?, icon? | 대시보드, 분석 |
| EmptyState | title, description, action? | 모든 리스트 |
| LoadingSkeleton | variant: 'card'|'table'|'kanban' | 모든 페이지 |
| ConfirmDialog | title, message, onConfirm, variant? | 삭제/상태변경 |
| SearchInput | placeholder, value, onChange, filters? | 콘텐츠, 리드 |
| DataTable | columns, data, sorting?, pagination? | 리드, 분석 |
| TimelineStep | steps: Step[], activeIndex | SLA, 파이프라인 |
| PageHeader | title, description?, actions? | 모든 페이지 |

### 디자인 토큰 파일
design-tokens.ts → src/lib/constants/design-tokens.ts에 배치
globals.css에서 CSS 변수로 변환, tailwind.config.ts에서 extend
