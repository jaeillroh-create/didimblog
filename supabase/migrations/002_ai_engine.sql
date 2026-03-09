-- ============================================
-- AI 콘텐츠 생성 엔진 마이그레이션
-- 신규 테이블 3개 + 기존 테이블 수정
-- ============================================

-- ============================================
-- 1. llm_configs (LLM 설정 — API 키, 모델)
-- ============================================
CREATE TABLE public.llm_configs (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('claude', 'openai', 'gemini')),
  display_name TEXT NOT NULL,
  model_id TEXT NOT NULL,
  api_key_encrypted TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  monthly_token_limit INTEGER,
  monthly_tokens_used INTEGER DEFAULT 0,
  last_tested_at TIMESTAMPTZ,
  test_result TEXT CHECK (test_result IN ('success', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id)
);

-- is_default 유니크 제약 (활성 상태에서 기본 LLM은 하나만)
CREATE UNIQUE INDEX llm_configs_single_default
  ON public.llm_configs (is_default)
  WHERE is_default = true;

-- ============================================
-- 2. prompt_templates (카테고리별 프롬프트 템플릿)
-- ============================================
CREATE TABLE public.prompt_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES public.categories(id),
  template_type TEXT NOT NULL CHECK (template_type IN ('draft_generation', 'cross_validation', 'seo_optimization')),
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT NOT NULL,
  variables JSONB,
  output_format JSONB,
  is_active BOOLEAN DEFAULT true,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. ai_generations (AI 생성 이력)
-- ============================================
CREATE TABLE public.ai_generations (
  id SERIAL PRIMARY KEY,
  content_id TEXT REFERENCES public.contents(id) ON DELETE CASCADE,
  generation_type TEXT NOT NULL CHECK (generation_type IN ('draft', 'cross_validation', 'regeneration')),
  -- 입력
  topic TEXT NOT NULL,
  category_id TEXT REFERENCES public.categories(id),
  target_keyword TEXT,
  additional_context TEXT,
  prompt_template_id INTEGER REFERENCES public.prompt_templates(id),
  -- LLM 설정
  llm_provider TEXT NOT NULL,
  llm_model TEXT NOT NULL,
  -- 출력
  generated_text TEXT,
  generated_title TEXT,
  generated_tags JSONB,
  image_markers JSONB,
  -- 교차검증 결과
  validation_results JSONB,
  -- 메타
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed', 'cancelled')),
  tokens_used INTEGER,
  generation_time_ms INTEGER,
  error_message TEXT,
  -- 재생성 시 원본 참조
  parent_generation_id INTEGER REFERENCES public.ai_generations(id),
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id)
);

-- 콘텐츠별 생성 이력 조회 인덱스
CREATE INDEX idx_ai_generations_content_id ON public.ai_generations(content_id);
CREATE INDEX idx_ai_generations_status ON public.ai_generations(status);

-- ============================================
-- 4. contents 테이블 AI 관련 컬럼 추가
-- briefing_due, briefing_done_at은 nullable로 유지 (제거하지 않음)
-- ============================================
ALTER TABLE public.contents ADD COLUMN IF NOT EXISTS ai_generation_id INTEGER REFERENCES public.ai_generations(id);
ALTER TABLE public.contents ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT false;
ALTER TABLE public.contents ADD COLUMN IF NOT EXISTS ai_edited_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.contents ADD COLUMN IF NOT EXISTS ai_edit_ratio NUMERIC(5,2);

-- ============================================
-- 5. RLS 정책
-- ============================================

-- llm_configs: 조회는 인증 사용자 전체, 수정은 admin만
ALTER TABLE public.llm_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "llm_configs_select" ON public.llm_configs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "llm_configs_insert" ON public.llm_configs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "llm_configs_update" ON public.llm_configs
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "llm_configs_delete" ON public.llm_configs
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- prompt_templates: 조회는 인증 사용자 전체, 수정은 admin만
ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prompt_templates_select" ON public.prompt_templates
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "prompt_templates_insert" ON public.prompt_templates
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "prompt_templates_update" ON public.prompt_templates
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "prompt_templates_delete" ON public.prompt_templates
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ai_generations: 인증 사용자 전체 접근
ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_generations_select" ON public.ai_generations
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "ai_generations_insert" ON public.ai_generations
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "ai_generations_update" ON public.ai_generations
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "ai_generations_delete" ON public.ai_generations
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================
-- 6. 프롬프트 템플릿 시드 데이터
-- ============================================

INSERT INTO public.prompt_templates (name, category_id, template_type, system_prompt, user_prompt_template, variables, output_format) VALUES

-- 현장 수첩 (절세)
('현장수첩_절세', 'CAT-A-01', 'draft_generation',
'당신은 특허그룹 디딤의 노재일 변리사입니다. KAIST 공학석사, 前 CIPO 출신으로 기업 절세 전문가입니다.
글쓰기 원칙:
1. 톤: "경험 많은 선배가 후배 사장님에게 커피 한 잔 하며 알려주는 느낌". 1인칭("제가 만난 대표님은..."), 구어체
2. 구조: 상황 묘사(고객의 고민) 30% → 해결 과정(숫자+근거) 40% → 결론+CTA 30%
3. 도입부는 반드시 "사람의 상황"으로 시작 (제도 설명 시작 금지)
4. 법적 근거는 괄호 안에 (참고: 조세특례제한법 제10조) 식으로 배치
5. 핵심 숫자(절세 금액, 세율 등)를 반드시 포함
6. 본문 1,500~2,500자
7. 제목 25~30자, 핵심 키워드 앞 15자
8. 태그 10개 (핵심3+연관3+브랜드2+롱테일2)
9. [IMAGE: 설명] 마커를 본문 중 3~5개 삽입 (인포그래픽, 비교표 등)
10. CTA: "재무제표를 보내주세요. 48시간 안에 절세 시뮬레이션을 만들어 드립니다."',
'다음 주제로 블로그 글을 작성해주세요.

주제: {{topic}}
핵심 키워드: {{keyword}}
타깃 고객: {{target_audience}}
참고 사항: {{additional_context}}

네이버 블로그 SEO를 고려하여:
- 제목에 키워드를 앞 15자에 배치
- 본문에 키워드 3~5회 자연스럽게 포함
- 소제목(##) 2개 이상, 소제목에 키워드 변형 포함
- 이미지 삽입 위치를 [IMAGE: 설명] 형태로 3~5곳에 표시',
'[{"name":"topic","description":"글 주제","required":true},{"name":"keyword","description":"핵심 키워드","required":true},{"name":"target_audience","description":"타깃 고객군","required":false},{"name":"additional_context","description":"추가 참고사항","required":false}]',
'{"min_chars":1500,"max_chars":2500,"image_markers":{"min":3,"max":5},"include_title":true,"include_tags":true,"include_cta":true}'
),

-- IP 라운지
('IP라운지_일반', 'CAT-B', 'draft_generation',
'당신은 특허그룹 디딤의 IP 전문 칼럼니스트입니다.
글쓰기 원칙:
1. 톤: "옆자리 전문가가 흥미로운 이야기를 들려주는 느낌". 격식 없는 전문 칼럼체
2. 구조: 이슈 소개 20% → 대표에게 미치는 영향 40% → 디딤의 제안 40%
3. 질문형 도입 ("요즘 대표님들 만나면 꼭 받는 질문이 있습니다")
4. 본문 1,200~2,000자
5. CTA: 이웃 추가 유도 + 이메일 안내
6. [IMAGE: 설명] 마커 2~4개',
'다음 주제로 IP 라운지 칼럼을 작성해주세요.

주제: {{topic}}
핵심 키워드: {{keyword}}
참고 사항: {{additional_context}}',
'[{"name":"topic","description":"칼럼 주제","required":true},{"name":"keyword","description":"핵심 키워드","required":true},{"name":"additional_context","description":"추가 참고사항","required":false}]',
'{"min_chars":1200,"max_chars":2000,"image_markers":{"min":2,"max":4},"include_title":true,"include_tags":true,"include_cta":true}'
),

-- 디딤 다이어리
('디딤다이어리_일반', 'CAT-C', 'draft_generation',
'당신은 특허그룹 디딤의 노재일 변리사입니다. 오늘 있었던 일을 일기처럼 씁니다.
글쓰기 원칙:
1. 톤: "일기장에 가깝게, 격식 없이, 인간적으로". 1인칭, 당일 경험 기반, 감정과 생각 포함
2. 구조: 오늘 있었던 일 40% → 느낀 점/배운 점 30% → 독자에게 한마디 30%
3. 본문 800~1,500자 (다이어리는 짧게)
4. CTA 넣지 않음 (진정성 훼손)
5. [IMAGE: 설명] 마커 1~2개 (실제 현장 분위기)',
'다음 주제로 디딤 다이어리를 작성해주세요.

주제: {{topic}}
참고 사항: {{additional_context}}

CTA는 넣지 마세요. 자연스럽고 인간적인 톤으로 작성해주세요.',
'[{"name":"topic","description":"다이어리 주제","required":true},{"name":"additional_context","description":"추가 참고사항","required":false}]',
'{"min_chars":800,"max_chars":1500,"image_markers":{"min":1,"max":2},"include_title":true,"include_tags":true,"include_cta":false}'
),

-- 교차검증용 공통 프롬프트
('교차검증_공통', NULL, 'cross_validation',
'당신은 전문 콘텐츠 검수자입니다. 아래 블로그 초안을 검토하고 다음 항목을 평가해주세요.

평가 항목:
1. 팩트체크: 법률 조항, 숫자, 제도명이 정확한가? 오류가 있으면 구체적으로 지적
2. 논리 흐름: 도입→본론→결론의 논리가 자연스러운가?
3. 톤 적합성: 카테고리({{category_name}})에 맞는 톤인가?
4. SEO 적합성: 키워드({{keyword}}) 배치가 적절한가? 네이버 SEO에 맞는가?
5. 독자 관점: 타깃 고객({{target_audience}})이 읽고 "우리 회사도 해당되나?" 느낌이 드는가?
6. CTA 효과성: 전환을 유도하는 CTA가 자연스러운가?

JSON 형식으로 응답:
{
  "verdict": "pass" | "fix_required" | "major_issues",
  "overall_score": 0-100,
  "issues": [{"category": "팩트체크|논리|톤|SEO|독자|CTA", "severity": "high|medium|low", "description": "...", "suggestion": "..."}],
  "strengths": ["..."],
  "improvement_suggestions": ["..."]
}',
'다음 블로그 초안을 검토해주세요.

카테고리: {{category_name}}
핵심 키워드: {{keyword}}
타깃 고객: {{target_audience}}

--- 초안 ---
{{draft_text}}
--- 초안 끝 ---',
'[{"name":"category_name","required":true},{"name":"keyword","required":true},{"name":"target_audience","required":false},{"name":"draft_text","required":true}]',
'{"format":"json","response_schema":"validation_result"}'
);
