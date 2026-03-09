# AI 콘텐츠 생성 엔진 — 상세 기획서

> **기능명세서 디벨롭 가이드 Phase 1~4 적용**
> 기존 섹션 3 "콘텐츠 제작 매뉴얼"의 음성 브리핑 → AI 기반 초안 생성으로 전면 교체

---

## 변경 요약

| 제거 항목 | 대체 항목 |
|-----------|-----------|
| 음성 브리핑 (D-5) | AI 주제 추천 + 주제 선정 |
| 대표 음성 → 초안 작성 | LLM 기반 초안 자동 생성 |
| 수동 팩트체크 | 멀티 LLM 교차검증 |
| briefings 테이블 | ai_generations 테이블 + llm_configs 테이블 |

---

## Phase 1: Gap 분석

### 신규 기능 11개 영역 평가

| # | 영역 | 완성도 | 심각도 | 핵심 누락 |
|---|------|--------|--------|-----------|
| 1 | 사업 목적/맥락 | ⬤⬤⬤⬤◯ | 🟡낮음 | AI 생성 글의 품질이 "사람이 보이는 블로그" 원칙에 부합하는지 검증 기준 필요 |
| 2 | 기능 정의 | ⬤⬤⬤◯◯ | 🟠중간 | 주제 추천 알고리즘, LLM 프롬프트 설계, 교차검증 방법론 상세 필요 |
| 3 | 유저 플로우 | ⬤◯◯◯◯ | 🔴높음 | 주제선정→생성→검증→편집→발행 end-to-end 플로우 부재 |
| 4 | UI/UX 명세 | ⬤◯◯◯◯ | 🔴높음 | AI 생성 화면, 교차검증 결과 표시, 에디터 UI 설계 필요 |
| 5 | 예외/에러 처리 | ⬤◯◯◯◯ | 🔴높음 | API 실패, 토큰 초과, 부적절 콘텐츠 생성, 교차검증 불일치 대응 |
| 6 | 상태 전이 규칙 | ⬤⬤◯◯◯ | 🟠중간 | 기존 S0~S5에 AI 생성 단계를 어떻게 매핑하는지 |
| 7 | 데이터 스키마 | ⬤◯◯◯◯ | 🔴높음 | AI 생성 이력, LLM 설정, 프롬프트 템플릿, 교차검증 결과 테이블 |
| 8 | API 스펙 | ⬤◯◯◯◯ | 🔴높음 | LLM API 호출 패턴, 스트리밍, 에러 핸들링, 프록시 설계 |
| 9 | 권한/보안 | ⬤⬤◯◯◯ | 🟠중간 | API 키 암호화 저장, 사용량 제한, 키 접근 권한 |
| 10 | 기존 시스템 연동 | ⬤⬤⬤◯◯ | 🟠중간 | 기존 콘텐츠 파이프라인(S0~S5), SEO 체크리스트, 카테고리와 연동 |
| 11 | 작업 분리 | ⬤◯◯◯◯ | 🔴높음 | 구현 태스크, 의존성, 수용 기준 분해 필요 |

**전체 완성도: 약 20% (아이디어 단계)**
**🔴 심각 5건, 🟠 중간 4건, 🟡 낮음 2건**

---

## Phase 2: 핵심 결정 사항

### 비즈니스 결정 (8건)

| ID | 심각도 | 결정 항목 | 선택지 | 추천 |
|----|--------|-----------|--------|------|
| D-1 | 🔴필수 | AI 생성 글의 최종 편집 주체 | A. AI가 완성본 제공, 사람은 검토만 / **B. AI가 초안, 사람이 반드시 편집+개인 경험 추가** / C. AI가 골격, 사람이 대폭 재작성 | **B 추천** — "사람이 보이는 블로그" 원칙 유지하려면 AI 초안에 대표님의 실제 경험/사례를 반드시 추가해야 함 |
| D-2 | 🔴필수 | 주제 추천 방식 | **A. 12주 스케줄 기반 자동 추천 + 사용자 수동 입력 병행** / B. 키워드 트렌드 분석 자동 추천만 / C. 사용자 수동 입력만 | **A 추천** — 기존 12주 스케줄을 기본으로 하되, 필요 시 자유 주제도 생성 가능 |
| D-3 | 🔴필수 | 교차검증 기본 모드 | A. 항상 멀티 LLM 교차검증 / **B. 기본은 단일 LLM(Claude), 필요 시 교차검증 선택** / C. 교차검증은 수동 요청 시에만 | **B 추천** — 비용 효율성. 일반 글은 Claude만, 법률/세무 관련 글은 멀티 검증 |
| D-4 | 🔴필수 | 이미지 생성 방식 | A. LLM이 이미지도 직접 생성 (DALL-E 등) / **B. 이미지 삽입 위치+캡션만 AI가 지정, 실제 이미지는 Canva 템플릿 또는 수동** / C. 이미지는 AI 범위 밖 | **B 추천** — 네이버 블로그에서 AI 생성 이미지는 품질/저작권 리스크. 템플릿 기반이 현실적 |
| D-5 | 🟠중요 | API 키 관리 권한 | **A. admin만 API 키 등록/변경 가능** / B. 모든 사용자가 본인 키 등록 가능 | **A 추천** — 비용 관리 + 보안 |
| D-6 | 🟠중요 | 생성 비용 관리 | **A. 월간 토큰 사용량 상한 설정 (초과 시 경고)** / B. 무제한 / C. 건당 비용 표시만 | **A 추천** — API 비용 예측 가능성 |
| D-7 | 🟠중요 | 카테고리별 프롬프트 차별화 | **A. 카테고리별 전용 시스템 프롬프트 (톤, 구조, CTA 자동 차별화)** / B. 공통 프롬프트만 | **A 추천** — 현장수첩/IP라운지/다이어리의 톤이 완전히 다르므로 |
| D-8 | 🟡참고 | 생성 이력 보관 기간 | A. 무제한 / **B. 6개월** / C. 발행된 것만 보관 | **B 추천** — 스토리지 비용 관리 |

### 기술적 결정 (제가 이렇게 정했습니다 — 검토 필요)

| ID | 항목 | 결정 내용 | 이유 |
|----|------|-----------|------|
| T-1 | LLM API 호출 방식 | Server Action에서 직접 호출, 스트리밍 응답 | 별도 백엔드 서버 불필요, Vercel Serverless Function으로 충분 |
| T-2 | API 키 저장 | Supabase에 암호화 저장 (pgcrypto + 서버사이드 복호화) | 클라이언트에 키 노출 방지 |
| T-3 | 최종 문서 작성 LLM | Claude (단일 LLM 모드에서도 Claude) | 사용자 요구사항. 한국어 품질 우수 |
| T-4 | 교차검증 결과 구조 | JSON 배열 [{llm, verdict, issues[], suggestions[]}] | 검증 항목별 비교 용이 |
| T-5 | 프롬프트 템플릿 저장 | DB 테이블 (prompt_templates) | 코드 변경 없이 프롬프트 수정 가능 |
| T-6 | 이미지 삽입 지시 | AI가 본문 중 [IMAGE: 설명] 마커로 삽입 위치 지정 | 사용자가 이후 실제 이미지로 교체 |

---

## Phase 3: 단계별 명세

### 3.1 상태 전이 규칙 — 기존 S0~S5에 AI 단계 매핑

**기존 음성 브리핑 방식:**
```
S0 기획중 → [음성 브리핑] → S1 초안완료 → S2 검토완료 → S3 발행예정 → S4 발행완료 → S5 성과측정
```

**변경된 AI 방식:**
```
S0 기획중 → [AI 주제선정 + 초안생성 + 교차검증] → S1 초안완료 → S2 검토완료 → S3 발행예정 → S4 발행완료 → S5 성과측정
```

**S0 내부 세부 상태 (AI 생성 파이프라인):**

| 세부 상태 | 상태명 | 진입 조건 | 전이 트리거 |
|-----------|--------|-----------|-------------|
| S0-A | 주제 선정 | 스케줄에서 자동 배정 또는 사용자 직접 입력 | 주제 + 카테고리 + 키워드 확정 |
| S0-B | 초안 생성중 | LLM API 호출 시작 | 초안 생성 완료 (스트리밍 종료) |
| S0-C | 초안 생성 완료 | LLM 응답 수신 완료 | 사용자가 "교차검증 요청" 또는 "편집으로 이동" 선택 |
| S0-D | 교차검증중 | 멀티 LLM 교차검증 시작 | 모든 LLM 응답 완료 |
| S0-E | 검증 완료 | 교차검증 결과 수신 | 사용자가 "편집으로 이동" 또는 "재생성" 선택 |

**전이 규칙:**
- S0-A → S0-B: 주제/카테고리/키워드가 모두 입력된 상태
- S0-B → S0-C: LLM 응답 완료 (에러 시 S0-A로 역행 + 에러 메시지)
- S0-C → S0-D: 사용자가 교차검증 선택 (단일 LLM 모드면 이 단계 skip)
- S0-C → S1: 사용자가 "편집으로 이동" 선택 (교차검증 생략)
- S0-D → S0-E: 모든 LLM 응답 완료
- S0-E → S1: 사용자가 검증 결과 확인 후 "편집으로 이동"
- S0-E → S0-B: 사용자가 "재생성" 선택 (검증 피드백을 반영하여 재생성)
- **역행:** S0-B/S0-D에서 API 에러 발생 시 → S0-A로 복귀
- **기존 S1→S5 전이는 그대로 유지**

### 3.2 유저 플로우

#### 플로우 1: 스케줄 기반 주제 추천 → AI 초안 생성

| 단계 | 사용자 행동 | 시스템 반응 | 화면 |
|------|-----------|-----------|------|
| 1 | 콘텐츠 관리 페이지 접속 | 이번 주 발행 예정 주제가 상단에 추천으로 표시 | /contents |
| 2 | "AI 초안 생성" 버튼 클릭 | 주제 설정 Dialog 오픈 (추천 주제 프리필 or 빈칸) | Dialog |
| 3 | 주제/카테고리/키워드/타깃고객 확인 또는 수정 | 카테고리에 따라 톤/구조 프리셋 자동 설정 | Dialog |
| 4 | "생성 시작" 클릭 | LLM API 호출, 스트리밍으로 실시간 표시 | /contents/new (에디터) |
| 5 | 초안 생성 완료 대기 (30초~2분) | 완성된 초안이 에디터에 표시. [IMAGE: 설명] 마커 포함 | 에디터 |
| 6-A | "교차검증 요청" 클릭 (선택) | 멀티 LLM에 초안 전달, 검증 결과 대기 | 교차검증 패널 |
| 6-B | 바로 편집 시작 | S1 상태로 전이, 사용자가 개인 경험/사례 추가 | 에디터 |
| 7 | 교차검증 결과 확인 | 각 LLM의 팩트체크/논리/톤 피드백 표시 | 검증 결과 패널 |
| 8 | 피드백 반영하여 편집 또는 "재생성" | S1 전이 또는 S0-B로 복귀 | 에디터 |

#### 플로우 2: 사용자 직접 주제 입력 → AI 초안 생성

| 단계 | 사용자 행동 | 시스템 반응 |
|------|-----------|-----------|
| 1 | "새 글 만들기" → "AI 생성" 탭 선택 | 주제 입력 폼 표시 |
| 2 | 주제/카테고리/핵심키워드/참고자료(선택) 입력 | 카테고리별 프롬프트 프리셋 로드 |
| 3~8 | 플로우 1의 4~8번과 동일 | 동일 |

#### 플로우 3: API 키 관리 (admin)

| 단계 | 사용자 행동 | 시스템 반응 |
|------|-----------|-----------|
| 1 | 설정 → "AI 설정" 탭 | LLM 설정 화면 표시 |
| 2 | LLM 제공사 선택 (Claude/GPT/Gemini) | API 키 입력 필드 + 모델 선택 드롭다운 |
| 3 | API 키 입력 → "저장" | 암호화 저장 + 연결 테스트 (간단한 "Hello" 호출) |
| 4 | 연결 성공/실패 표시 | 성공: 초록 체크 / 실패: 빨간 X + 에러 메시지 |
| 5 | 기본 LLM 설정 | 초안 생성용 기본 LLM 선택 (Claude 고정) |
| 6 | 월간 사용량 상한 설정 | 토큰 수 또는 금액 기준 |

### 3.3 예외/에러 처리

| ID | 심각도 | 예외 상황 | 대응 전략 |
|----|--------|----------|----------|
| E-1 | 🔴 | LLM API 호출 실패 (네트워크/인증) | ① API 키 유효성 재확인 안내 ② 3회 자동 재시도 ③ 다른 LLM으로 폴백 옵션 ④ 에러 로그 기록 |
| E-2 | 🔴 | 토큰 한도 초과 (응답 잘림) | ① 글 분량을 줄여서 재생성 ② 본문을 2회로 나눠 생성 후 병합 ③ 모델을 대용량 컨텍스트 모델로 전환 |
| E-3 | 🔴 | 부적절 콘텐츠 생성 (법률 오류, 허위 정보) | ① 교차검증에서 자동 감지 ② "법률 정보 주의" 경고 라벨 자동 부착 ③ 관련 글은 반드시 교차검증 필수 설정 |
| E-4 | 🟠 | 교차검증 LLM 간 의견 불일치 | ① 불일치 항목을 하이라이트 표시 ② 각 LLM의 근거 병렬 표시 ③ 사용자가 최종 판단 ④ "전문가 확인 필요" 라벨 |
| E-5 | 🟠 | API 키 만료/잔액 부족 | ① 설정 페이지에 상태 표시 (활성/만료/잔액부족) ② 생성 시도 전 사전 체크 ③ admin에게 알림 |
| E-6 | 🟠 | 스트리밍 중 사용자 이탈 | ① 백그라운드 생성 계속 ② 재접속 시 결과 표시 ③ 미완료 시 "생성중" 상태 유지 |
| E-7 | 🟡 | 카테고리별 톤 불일치 (현장수첩인데 딱딱한 톤) | ① 톤 체크를 교차검증 항목에 포함 ② "톤 불일치" 경고 ③ 프롬프트 템플릿 조정 안내 |
| E-8 | 🟡 | 이미지 마커 위치 부적절 | ① 에디터에서 마커를 드래그로 이동 가능 ② 마커 삭제/추가 버튼 |

### 3.4 데이터 스키마

#### 신규 테이블 3개 + 기존 테이블 수정 2개

```sql
-- ============================================
-- 신규 1. llm_configs (LLM 설정 — API 키, 모델)
-- ============================================
CREATE TABLE public.llm_configs (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('claude', 'openai', 'gemini')),
  display_name TEXT NOT NULL,              -- "Claude 3.5 Sonnet", "GPT-4o" 등
  model_id TEXT NOT NULL,                  -- "claude-sonnet-4-20250514", "gpt-4o" 등
  api_key_encrypted TEXT,                  -- pgcrypto로 암호화된 API 키
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false, -- 초안 생성 기본 LLM
  monthly_token_limit INTEGER,             -- 월간 토큰 상한 (null=무제한)
  monthly_tokens_used INTEGER DEFAULT 0,
  last_tested_at TIMESTAMPTZ,              -- 마지막 연결 테스트 시간
  test_result TEXT CHECK (test_result IN ('success', 'failed', null)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id)
);

-- ============================================
-- 신규 2. prompt_templates (카테고리별 프롬프트 템플릿)
-- ============================================
CREATE TABLE public.prompt_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,                      -- "현장수첩_절세", "IP라운지_일반" 등
  category_id TEXT REFERENCES public.categories(id),
  template_type TEXT NOT NULL CHECK (template_type IN ('draft_generation', 'cross_validation', 'seo_optimization')),
  system_prompt TEXT NOT NULL,             -- 시스템 프롬프트 (톤/구조/규칙)
  user_prompt_template TEXT NOT NULL,      -- 사용자 프롬프트 템플릿 ({{topic}}, {{keyword}} 등 변수)
  variables JSONB,                         -- 사용 가능한 변수 목록 [{name, description, required}]
  output_format JSONB,                     -- 출력 형식 지정 {structure, min_chars, max_chars, image_markers}
  is_active BOOLEAN DEFAULT true,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 신규 3. ai_generations (AI 생성 이력)
-- ============================================
CREATE TABLE public.ai_generations (
  id SERIAL PRIMARY KEY,
  content_id TEXT REFERENCES public.contents(id) ON DELETE CASCADE,
  generation_type TEXT NOT NULL CHECK (generation_type IN ('draft', 'cross_validation', 'regeneration')),
  -- 입력
  topic TEXT NOT NULL,
  category_id TEXT REFERENCES public.categories(id),
  target_keyword TEXT,
  additional_context TEXT,                 -- 사용자 추가 참고사항
  prompt_template_id INTEGER REFERENCES public.prompt_templates(id),
  -- LLM 설정
  llm_provider TEXT NOT NULL,              -- 'claude', 'openai', 'gemini'
  llm_model TEXT NOT NULL,                 -- 모델 ID
  -- 출력
  generated_text TEXT,                     -- 생성된 본문 (HTML 또는 Markdown)
  generated_title TEXT,                    -- 생성된 제목
  generated_tags JSONB,                    -- 생성된 태그 배열
  image_markers JSONB,                     -- [{position, description, suggested_type}]
  -- 교차검증 결과 (generation_type='cross_validation'인 경우)
  validation_results JSONB,               -- [{llm, verdict, issues[], suggestions[], scores{}}]
  -- 메타
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed', 'cancelled')),
  tokens_used INTEGER,
  generation_time_ms INTEGER,              -- 생성 소요 시간
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id)
);

-- ============================================
-- 기존 테이블 수정 1: contents — briefing 관련 필드 제거, AI 필드 추가
-- ============================================
-- 제거: briefing_due, briefing_done_at (음성 브리핑 관련)
-- 추가:
ALTER TABLE public.contents ADD COLUMN ai_generation_id INTEGER REFERENCES public.ai_generations(id);
ALTER TABLE public.contents ADD COLUMN is_ai_generated BOOLEAN DEFAULT false;
ALTER TABLE public.contents ADD COLUMN ai_edited_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.contents ADD COLUMN ai_edit_ratio NUMERIC(5,2); -- AI 원문 대비 편집 비율 (%)

-- ============================================
-- 기존 테이블 수정 2: briefings 테이블 → 폐기 (또는 보관)
-- ============================================
-- briefings 테이블은 더 이상 사용하지 않음
-- 기존 데이터 보관 후 향후 삭제
-- DROP TABLE IF EXISTS public.briefings; -- 실행 시점은 마이그레이션 시

-- ============================================
-- RLS 정책
-- ============================================
ALTER TABLE public.llm_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "llm_configs_select" ON public.llm_configs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "llm_configs_admin" ON public.llm_configs FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prompt_templates_select" ON public.prompt_templates FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "prompt_templates_admin" ON public.prompt_templates FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_generations_all" ON public.ai_generations FOR ALL USING (auth.role() = 'authenticated');
```

#### 시드 데이터: 카테고리별 프롬프트 템플릿

```sql
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
```

### 3.5 API 스펙 (Server Actions)

| 액션 | 경로 | 입력 | 출력 | 설명 |
|------|------|------|------|------|
| generateDraft | src/actions/ai.ts | topic, categoryId, keyword, targetAudience?, context? | {generationId, streamUrl} | LLM 초안 생성 시작 (스트리밍) |
| getGenerationStatus | src/actions/ai.ts | generationId | {status, text?, error?} | 생성 상태 폴링 |
| requestCrossValidation | src/actions/ai.ts | generationId, llmProviders[] | {validationId} | 멀티 LLM 교차검증 시작 |
| getValidationResults | src/actions/ai.ts | validationId | {results[]} | 교차검증 결과 조회 |
| regenerateDraft | src/actions/ai.ts | generationId, feedback? | {newGenerationId} | 피드백 반영 재생성 |
| saveLLMConfig | src/actions/ai.ts | provider, modelId, apiKey | {configId, testResult} | LLM 설정 저장 + 연결 테스트 |
| testLLMConnection | src/actions/ai.ts | configId | {success, error?} | API 키 유효성 테스트 |
| getPromptTemplates | src/actions/ai.ts | categoryId? | {templates[]} | 프롬프트 템플릿 목록 |
| updatePromptTemplate | src/actions/ai.ts | templateId, systemPrompt, userPrompt | {success} | 프롬프트 수정 |
| getTopicRecommendations | src/actions/ai.ts | weekNumber? | {topics[]} | 이번 주 추천 주제 |

### 3.6 UI/UX 명세

#### 화면 1: AI 초안 생성 Dialog (콘텐츠 관리 페이지에서 호출)

```
┌─────────────────────────────────────────────────────┐
│  AI 초안 생성                                    [X] │
│                                                      │
│  ┌─[추천 주제]──────────┬─[직접 입력]──────────────┐  │
│  │ (탭 전환)            │                          │  │
│  └──────────────────────┘                          │  │
│                                                      │
│  주제 *                                              │
│  ┌──────────────────────────────────────────────────┐│
│  │ 법인세 2억 내던 대표님, 지금은 5천만원입니다     ││
│  └──────────────────────────────────────────────────┘│
│                                                      │
│  카테고리 *          2차 분류                        │
│  [현장 수첩 ▼]       [절세 시뮬레이션 ▼]            │
│                                                      │
│  핵심 키워드 *       타깃 고객군                     │
│  [직무발명보상금 절세] [중소기업 대표 ▼]             │
│                                                      │
│  참고 사항 (선택)                                    │
│  ┌──────────────────────────────────────────────────┐│
│  │ 최근 만난 제조업 대표님 사례 포함해주세요        ││
│  └──────────────────────────────────────────────────┘│
│                                                      │
│  LLM 모델: Claude Sonnet 4 ▼                        │
│                                                      │
│  ┌────────────────┐  ┌───────────────────────────┐  │
│  │    취소         │  │  🤖 AI 초안 생성 시작     │  │
│  └────────────────┘  └───────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

#### 화면 2: AI 에디터 (초안 생성 결과 + 편집)

```
┌──────────────────────────────────────────────────────────────────┐
│  ← 콘텐츠 관리    초안 편집                    [교차검증] [저장] │
│──────────────────────────────────────────────────────────────────│
│  ┌──────────────────────────────────┬───────────────────────────┐│
│  │         에디터 영역 (좌)         │      사이드 패널 (우)     ││
│  │                                  │                           ││
│  │  제목:                           │  📊 SEO 점수: 82/100     ││
│  │  ┌──────────────────────────┐   │                           ││
│  │  │ 법인세 2억 내던 대표님,   │   │  ✅ 제목 길이 28자       ││
│  │  │ 지금은 5천만원입니다      │   │  ✅ 키워드 앞 15자       ││
│  │  └──────────────────────────┘   │  ✅ 본문 키워드 4회       ││
│  │                                  │  ⚠️ 소제목 1개 (2개+)    ││
│  │  본문: (리치 텍스트 에디터)      │  ✅ 이미지 마커 4개       ││
│  │  ┌──────────────────────────┐   │  ...                      ││
│  │  │ 얼마 전 제조업 대표님을   │   │                           ││
│  │  │ 만났습니다. 매출 80억,    │   │  ─── 생성 정보 ───       ││
│  │  │ 법인세만 2억...           │   │  LLM: Claude Sonnet 4    ││
│  │  │                           │   │  토큰: 2,340             ││
│  │  │ [IMAGE: 법인세 절감       │   │  생성시간: 45초          ││
│  │  │  비교 인포그래픽]         │   │                           ││
│  │  │                           │   │  ─── 태그 ───            ││
│  │  │ 결론부터 말씀드리면...    │   │  직무발명보상금절세       ││
│  │  └──────────────────────────┘   │  법인세줄이는방법         ││
│  │                                  │  중소기업세액공제         ││
│  │                                  │  ...                      ││
│  └──────────────────────────────────┴───────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

#### 화면 3: 교차검증 결과 패널

```
┌──────────────────────────────────────────────────────────────────┐
│  교차검증 결과                                         [닫기]   │
│──────────────────────────────────────────────────────────────────│
│                                                                  │
│  검증 LLM: Claude ✅ | GPT-4o ✅ | Gemini ⏳                    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  ◆ Claude (85점)                                     pass  ││
│  │  ─────────────────────────────────────────────────────────  ││
│  │  ✅ 팩트체크: 조특법 제10조 인용 정확                      ││
│  │  ⚠️ 논리: 도입부 → 본론 전환이 다소 급격                   ││
│  │  ✅ 톤: 현장수첩 톤에 적합                                 ││
│  │  ✅ SEO: 키워드 배치 양호                                  ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  ◆ GPT-4o (78점)                            fix_required  ││
│  │  ─────────────────────────────────────────────────────────  ││
│  │  ⚠️ 팩트체크: 세액공제율 25% → 최근 30%로 변경 확인 필요   ││
│  │  ✅ 논리: 흐름 양호                                        ││
│  │  ✅ 톤: 적합                                               ││
│  │  ⚠️ SEO: "법인세 절감" 키워드 추가 권장                    ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  [피드백 반영 재생성]  [현재 초안으로 편집 진행]                 │
└──────────────────────────────────────────────────────────────────┘
```

#### 화면 4: 설정 > AI 설정 탭

```
┌──────────────────────────────────────────────────────────────────┐
│  설정 > AI 설정                                                  │
│──────────────────────────────────────────────────────────────────│
│                                                                  │
│  ■ LLM 연결 관리                                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Claude          claude-sonnet-4    ● 활성   [수정]      │   │
│  │  API Key: sk-ant-...****           연결됨 ✅              │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │  OpenAI (GPT)    gpt-4o            ○ 비활성  [설정]      │   │
│  │  API Key: 미설정                                          │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │  Google (Gemini) gemini-2.5-pro    ○ 비활성  [설정]      │   │
│  │  API Key: 미설정                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ■ 기본 설정                                                    │
│  초안 생성 기본 LLM: [Claude ▼]                                 │
│  월간 토큰 상한: [500,000 ▼] (현재 사용: 123,456)               │
│                                                                  │
│  ■ 프롬프트 템플릿                                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  현장수첩_절세    draft_generation    v1    [편집]        │   │
│  │  IP라운지_일반    draft_generation    v1    [편집]        │   │
│  │  디딤다이어리     draft_generation    v1    [편집]        │   │
│  │  교차검증_공통    cross_validation   v1    [편집]        │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Phase 4: 통합 검토

### 용어 통일
- "AI 생성" = LLM 기반 초안 자동 생성
- "교차검증" = 멀티 LLM에 의한 품질/팩트 검증
- "프롬프트 템플릿" = 카테고리별 시스템/사용자 프롬프트
- "음성 브리핑" → 완전 제거 (모든 문서에서)

### 상태명 일치 확인
- S0 내부 세부 상태 (S0-A~S0-E) → ai_generations.status와 매핑
- S0-A=pending, S0-B=generating, S0-C=completed, S0-D=generating(validation), S0-E=completed(validation)

### 기존 기능과의 충돌 확인
- briefings 테이블 → 사용 중단, ai_generations로 대체
- contents.briefing_due, briefing_done_at → 제거 (마이그레이션 시)
- SLA 기준 D-5(음성 브리핑) → D-5(AI 주제선정+초안생성)으로 재정의
- SEO 체크리스트 → AI 에디터 사이드 패널에서 실시간 체크로 통합
- 콘텐츠 칸반보드 → S0 카드에 "AI 생성중" 배지 추가

### 작업 분리 (10건)

| ID | 우선순위 | 태스크 | 의존성 | 수용 기준 |
|----|---------|--------|--------|----------|
| AI-1 | 🔴P0 | DB 마이그레이션 (3개 테이블 생성 + 기존 수정) | 없음 | DDL 실행 성공, 시드 데이터 입력 |
| AI-2 | 🔴P0 | LLM 프록시 Server Action (Claude/GPT/Gemini 통합) | AI-1 | 3개 LLM API 호출+스트리밍 성공 |
| AI-3 | 🔴P0 | API 키 관리 UI + 암호화 저장 (설정 > AI 설정) | AI-1 | 키 저장/수정/테스트 동작 |
| AI-4 | 🔴P0 | AI 초안 생성 Dialog + 에디터 UI | AI-2, AI-3 | 주제 입력 → 생성 → 에디터 표시 |
| AI-5 | 🟠P1 | 교차검증 기능 (멀티 LLM 병렬 호출 + 결과 UI) | AI-2 | 2개+ LLM 결과 병렬 표시 |
| AI-6 | 🟠P1 | 프롬프트 템플릿 관리 UI | AI-1 | 템플릿 CRUD + 미리보기 |
| AI-7 | 🟠P1 | 주제 추천 기능 (12주 스케줄 기반) | AI-1 | 이번 주 추천 주제 표시 |
| AI-8 | 🟠P1 | 기존 콘텐츠 파이프라인 연동 (칸반보드 S0 확장) | AI-4 | AI 생성 → S1 전이 동작 |
| AI-9 | 🟡P2 | AI 에디터 SEO 실시간 체크 사이드 패널 | AI-4 | 18항목 실시간 점수 표시 |
| AI-10 | 🟡P2 | 토큰 사용량 모니터링 + 상한 관리 | AI-2 | 월간 사용량 차트 + 경고 |
