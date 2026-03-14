# didimblog 고도화 기능명세서 v1.0

> **프로젝트:** 특허그룹 디딤 블로그 관리 웹서비스 고도화
> **스택:** Next.js 15 + Supabase + Vercel (기존 유지)
> **GitHub:** jaeillroh-create/didimblog
> **Supabase:** krfjzmjrymfuwgwktwzr.supabase.co
> **배포:** didimblog.vercel.app
> **사용자:** 노재일 대표 (1인)
> **목적:** 네이버 블로그를 통한 특허그룹 디딤의 수임 증대

---

## 0. 절대 원칙 (모든 Sprint에서 위반 불가)

1. **이메일은 admin@didimip.com만.** AI 생성, CTA 템플릿, 어디서든 이 주소 외 다른 주소가 나오면 버그.
2. **디딤 다이어리에 CTA 넣으면 버그.** SEO 점수에서도 CTA 없어야 가점. AI 프롬프트에서도 CTA 생성 금지.
3. **카테고리·2차 분류 문자열은 네이버와 100% 일치.** 아래 상수 사용.
4. **모든 카테고리의 글쓰기 공식은 독립.** 프롬프트 4종은 완전 격리. 톤·분량·구조가 카테고리 간 오염 금지.
5. **Vercel Framework Preset은 반드시 "Next.js".** "Other" 설정 시 미들웨어/라우팅 전부 깨짐.
6. **LLM 기본값은 Claude Sonnet 4.6** (model id: `claude-sonnet-4-6`).

---

## 1. 상태 전이 규칙

### 1.1 콘텐츠 상태

```
기획중(PLANNING) → 초안완료(DRAFTED) → 검토완료(REVIEWED) → 발행예정(SCHEDULED) → 발행완료(PUBLISHED)
```

허용 전이:
- PLANNING → DRAFTED (AI 초안 생성 완료 시 자동 전이, 또는 수동)
- DRAFTED → REVIEWED (대표 검수 완료 표시)
- REVIEWED → SCHEDULED (예약 시간 설정 완료)
- SCHEDULED → PUBLISHED (네이버 발행 완료 확인)
- **역방향 전이 허용:** DRAFTED → PLANNING, REVIEWED → DRAFTED, SCHEDULED → REVIEWED (수정 필요 시)
- **삭제:** 모든 상태에서 가능. PUBLISHED 삭제 시 경고: "네이버 블로그에서도 별도로 삭제해야 합니다."

불가:
- PLANNING → SCHEDULED/PUBLISHED (중간 단계 건너뛰기 금지)
- PUBLISHED → 다른 상태로 변경 금지 (발행 취소는 삭제로만)

### 1.2 상담 상태

```
접수(RECEIVED) → 상담중(IN_PROGRESS) → 계약(CONTRACTED) / 미계약(NOT_CONTRACTED)
```

### 1.3 글 건강 상태

```
정상(HEALTHY) → 점검필요(CHECK_NEEDED) → 수정필요(UPDATE_NEEDED) → 수정완료(UPDATED)
```

- 현장수첩: 발행 후 60일 경과 시 HEALTHY → CHECK_NEEDED 자동 전이
- 기타 카테고리: 발행 후 90일 경과 시 자동 전이
- 법률 변경 뉴스 감지 시: 관련 글 즉시 CHECK_NEEDED 전이

---

## 2. 유저 플로우

### 2.1 주간 루틴 플로우 (메인)

```
[웹서비스 접속]
    ↓
[대시보드 확인] — "이번 주 추천" + "월간 현황" + "성과 요약" 한눈에
    ↓
[추천 주제 클릭] → "이 주제로 초안 생성" 버튼
    ↓
[AI 초안 생성] — 카테고리·2차분류·주제·키워드 확인 → 생성 클릭
    ↓ (자동: 본문 + 태그 10개 + ALT 텍스트 3개 + CTA)
[초안 편집] — 본문 수정, SEO 점수 실시간 확인 → 저장
    ↓
[네이버 발행 준비 뷰] — [제목 복사] [본문 복사] [CTA 복사] [태그 복사] [ALT 복사]
    ↓ (네이버 에디터에서 수동 작업)
[발행 완료 표시] — 상태를 PUBLISHED로 변경
```

### 2.2 금요일 성과 입력 플로우

```
[대시보드] → [이번 주 발행 글 클릭]
    ↓
[글 상세 > 성과 탭] — 조회수, 유입 키워드 TOP 3, 댓글 수 입력 → 저장
```

### 2.3 상담 기록 플로우

```
[대시보드 또는 사이드 메뉴 > 상담 로그]
    ↓
[새 상담 추가] — 날짜, 회사명, 유입 경로, 경유 글(드롭다운), 관심 서비스, 메모
    ↓
[상담 결과 업데이트] — 진행중 → 계약/미계약
```

### 2.4 글 건강 점검 플로우

```
[대시보드 "업데이트 필요 N편" 클릭]
    ↓
[글 관리 > 점검 필요 탭] — 해당 글 목록
    ↓
[글 클릭] → [상세 페이지에서 내용 검토]
    ↓
["확인 완료" 또는 "수정 필요" 버튼] → 상태 업데이트 + 점검일 기록
```

---

## 3. 예외/에러 처리

### 3.1 모든 페이지 공통 4가지 상태

| 상태 | UI |
|---|---|
| 빈 상태 (Empty) | 안내 메시지 + 행동 유도 버튼. 예: "아직 발행된 글이 없습니다. 첫 글을 만들어보세요." |
| 로딩 (Loading) | 스켈레톤 UI (각 페이지 레이아웃에 맞는 형태) |
| 에러 (Error) | "데이터를 불러오지 못했습니다. [다시 시도]" 버튼. console에 에러 상세 로깅 |
| 정상 (Normal) | 데이터 표시 |

### 3.2 AI 초안 생성 에러

| 에러 | 처리 |
|---|---|
| API 키 미설정 | "설정에서 Anthropic API 키를 먼저 등록해주세요" 안내 + 설정 페이지 링크 |
| API 호출 실패 (네트워크) | "AI 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요." + 재시도 버튼 |
| 생성 결과 검증 실패 | 경고 배너: "생성된 초안에 문제가 있습니다: [분량 초과/CTA 누락/이메일 불일치]" — 초안은 보여주되 경고 표시 |
| 토큰 한도 초과 | "글이 너무 길게 생성되었습니다. 다시 생성하시겠습니까?" |

### 3.3 저장/삭제 에러

| 에러 | 처리 |
|---|---|
| Supabase 연결 실패 | 토스트: "저장에 실패했습니다. 인터넷 연결을 확인해주세요." |
| RLS 정책 위반 | 토스트: "권한이 없습니다." (발생하면 안 되지만 방어) |
| 삭제 확인 모달 | "이 콘텐츠를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다." — PUBLISHED 글 추가 경고 |

### 3.4 뉴스 검색 에러

| 에러 | 처리 |
|---|---|
| Naver API 실패 | "네이버 검색에 실패했습니다." — Google 검색 결과만 표시 (가용 시) |
| Google API 미설정 | Google 영역 숨김. Naver만 표시 |
| 검색 결과 0건 | "검색 결과가 없습니다. 다른 키워드로 시도해보세요." |

---

## 4. 데이터 스키마

### 4.1 기존 테이블 보강: posts

```sql
-- 기존 posts 테이블에 컬럼 추가 (ALTER TABLE)
-- 먼저 실제 테이블 구조를 확인한 후, 없는 컬럼만 추가

ALTER TABLE posts ADD COLUMN IF NOT EXISTS sub_category TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS target_keywords TEXT[] DEFAULT '{}';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS cta_text TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_alt_texts TEXT[] DEFAULT '{}';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS seo_score INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS seo_details JSONB DEFAULT '{}';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS health_status TEXT DEFAULT 'HEALTHY' CHECK (health_status IN ('HEALTHY', 'CHECK_NEEDED', 'UPDATE_NEEDED', 'UPDATED'));
ALTER TABLE posts ADD COLUMN IF NOT EXISTS health_checked_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES series(id);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS series_order INTEGER;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
```

### 4.2 신규 테이블: post_metrics (글별 성과)

```sql
CREATE TABLE post_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  recorded_date DATE NOT NULL,
  views INTEGER DEFAULT 0,
  top_keywords TEXT[] DEFAULT '{}',  -- 유입 키워드 TOP 3
  comments INTEGER DEFAULT 0,
  neighbor_adds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, recorded_date)
);

CREATE INDEX idx_post_metrics_post_id ON post_metrics(post_id);
CREATE INDEX idx_post_metrics_date ON post_metrics(recorded_date);
```

### 4.3 신규 테이블: consultations (상담 로그)

```sql
CREATE TABLE consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_date DATE NOT NULL,
  company_name TEXT,  -- 익명 가능 (A사, B사)
  source TEXT NOT NULL CHECK (source IN ('BLOG', 'REFERRAL', 'OTHER')),
  source_post_id UUID REFERENCES posts(id),  -- 경유 글 (블로그 유입 시)
  service_interest TEXT NOT NULL CHECK (service_interest IN ('TAX_SAVING', 'CERTIFICATION', 'LAB_MGMT', 'PATENT', 'TRADEMARK', 'OTHER')),
  status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'IN_PROGRESS', 'CONTRACTED', 'NOT_CONTRACTED')),
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_consultations_date ON consultations(consultation_date);
CREATE INDEX idx_consultations_source_post ON consultations(source_post_id);
```

### 4.4 신규 테이블: keyword_pool (키워드 커버리지)

```sql
CREATE TABLE keyword_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,  -- '변리사의 현장 수첩', 'IP 라운지', '디딤 다이어리'
  sub_category TEXT,
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
  covered_post_id UUID REFERENCES posts(id),  -- NULL이면 미커버
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 초기 시드 데이터 (매뉴얼 기반)
INSERT INTO keyword_pool (keyword, category, sub_category, priority) VALUES
  ('직무발명보상금 절세', '변리사의 현장 수첩', '절세 시뮬레이션', 'HIGH'),
  ('법인세 줄이는 방법', '변리사의 현장 수첩', '절세 시뮬레이션', 'HIGH'),
  ('대표이사 직무발명보상금', '변리사의 현장 수첩', '절세 시뮬레이션', 'HIGH'),
  ('기업부설연구소 세액공제', '변리사의 현장 수첩', '연구소 운영 실무', 'HIGH'),
  ('연구소 세무조사', '변리사의 현장 수첩', '연구소 운영 실무', 'HIGH'),
  ('R&D 세액공제 환수', '변리사의 현장 수첩', '연구소 운영 실무', 'HIGH'),
  ('벤처기업인증 혜택', '변리사의 현장 수첩', '인증 가이드', 'MEDIUM'),
  ('벤처인증 방법', '변리사의 현장 수첩', '인증 가이드', 'MEDIUM'),
  ('기업부설연구소 설립 방법', '변리사의 현장 수첩', '인증 가이드', 'MEDIUM'),
  ('미처분이익잉여금 정리', '변리사의 현장 수첩', '절세 시뮬레이션', 'MEDIUM'),
  ('직무발명보상금 vs 상여금', '변리사의 현장 수첩', '절세 시뮬레이션', 'MEDIUM'),
  ('AI 특허 출원', 'IP 라운지', 'AI와 IP', 'MEDIUM'),
  ('생성형 AI 저작권', 'IP 라운지', 'AI와 IP', 'MEDIUM'),
  ('인공지능 기본법', 'IP 라운지', 'AI와 IP', 'MEDIUM'),
  ('스타트업 특허 전략', 'IP 라운지', '특허 전략 노트', 'MEDIUM'),
  ('기술유출 방지', 'IP 라운지', '특허 전략 노트', 'LOW'),
  ('특허 가치평가', 'IP 라운지', '특허 전략 노트', 'LOW'),
  ('직무발명 소송 사례', 'IP 라운지', 'IP 뉴스 한 입', 'MEDIUM'),
  ('중국 상표 선점', 'IP 라운지', 'IP 뉴스 한 입', 'LOW');
```

### 4.5 신규 테이블: keyword_rankings (키워드 순위 추적)

```sql
CREATE TABLE keyword_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id UUID NOT NULL REFERENCES keyword_pool(id) ON DELETE CASCADE,
  month DATE NOT NULL,  -- 매월 1일 기준
  rank INTEGER,  -- NULL이면 TOP 100 밖
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(keyword_id, month)
);
```

### 4.6 신규 테이블: series (시리즈물 관리)

```sql
CREATE TABLE series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,  -- "직무발명보상 절세 완전 가이드"
  total_planned INTEGER NOT NULL,  -- 계획 편수 (예: 5)
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.7 신규 테이블: schedule_templates (스케줄 템플릿)

```sql
CREATE TABLE schedule_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week INTEGER NOT NULL,
  category TEXT NOT NULL,
  sub_category TEXT NOT NULL,
  title TEXT NOT NULL,
  keywords TEXT[] DEFAULT '{}',
  cta_type TEXT NOT NULL,  -- 'TAX_SIM', 'CERT_DIAG', 'LAB_MGMT', 'NEIGHBOR', 'NONE'
  phase INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12주 스케줄 시드 데이터
INSERT INTO schedule_templates (week, category, sub_category, title, keywords, cta_type, phase) VALUES
  (1, '변리사의 현장 수첩', '절세 시뮬레이션', '법인세 2억 내던 대표님, 지금은 5천만원입니다', ARRAY['직무발명보상금 절세', '법인세 줄이는 방법'], 'TAX_SIM', 1),
  (2, 'IP 라운지', '특허 전략 노트', '특허 1건으로 벤처인증 + 투자유치 + 정부과제 3마리 토끼', ARRAY['스타트업 특허 전략', '벤처인증 특허'], 'NEIGHBOR', 1),
  (3, '변리사의 현장 수첩', '연구소 운영 실무', '연구소 세무조사 통지서 받고 전화 온 대표님', ARRAY['기업부설연구소 세무조사', 'R&D 환수'], 'LAB_MGMT', 1),
  (4, '디딤 다이어리', '대표의 생각', 'KAIST → CIPO → 변리사, 디딤을 만든 이유', ARRAY['특허그룹디딤'], 'NONE', 1),
  (5, '변리사의 현장 수첩', '절세 시뮬레이션', '대표이사에게 보상금, 가능한가요? (가능합니다)', ARRAY['대표이사 직무발명보상금'], 'TAX_SIM', 1),
  (6, 'IP 라운지', 'AI와 IP', 'ChatGPT로 만든 로고, 상표등록 될까?', ARRAY['AI 상표등록', 'ChatGPT 저작권'], 'NEIGHBOR', 1),
  (7, '변리사의 현장 수첩', '인증 가이드', '벤처인증 3번 떨어진 회사, 4번째에 성공한 비결', ARRAY['벤처기업인증 방법'], 'CERT_DIAG', 1),
  (8, '디딤 다이어리', '컨설팅 후기', '이번 달 벤처인증 3건 완료 — 세 회사 세 가지 전략', ARRAY['벤처인증 컨설팅'], 'NONE', 1),
  (9, '변리사의 현장 수첩', '절세 시뮬레이션', '상여금으로 줬으면 6,600만원 더 나갔습니다', ARRAY['직무발명보상금 vs 상여금'], 'TAX_SIM', 1),
  (10, 'IP 라운지', 'IP 뉴스 한 입', '직무발명보상 5만원 줬다가 2조 소송당한 회사', ARRAY['직무발명 소송 사례'], 'NEIGHBOR', 1),
  (11, '변리사의 현장 수첩', '인증 가이드', '직원 2명이면 연구소 됩니다 — 설립한 대표님 후기', ARRAY['기업부설연구소 설립', '연구전담요원 2인'], 'CERT_DIAG', 1),
  (12, '디딤 다이어리', '디딤 일상', '변리사가 서울대 AI 과정을 듣는 이유', ARRAY['AI 특허 전문가'], 'NONE', 1);
```

---

## 5. 카테고리/CTA 상수 (코드에 하드코딩)

### 5.1 카테고리 구조 (네이버와 100% 일치)

```typescript
export const CATEGORIES = {
  FIELD: {
    name: '변리사의 현장 수첩',
    subCategories: ['절세 시뮬레이션', '인증 가이드', '연구소 운영 실무'],
    color: 'orange',
    monthlyTarget: 2,
  },
  LOUNGE: {
    name: 'IP 라운지',
    subCategories: ['특허 전략 노트', 'AI와 IP', 'IP 뉴스 한 입'],
    color: 'navy',
    monthlyTarget: 1,
  },
  DIARY: {
    name: '디딤 다이어리',
    subCategories: ['컨설팅 후기', '디딤 일상', '대표의 생각'],
    color: 'gray',
    monthlyTarget: 1,
  },
  INTRO: { name: '디딤 소개', subCategories: [], color: 'neutral', monthlyTarget: 0 },
  CONSULT: { name: '상담 안내', subCategories: [], color: 'neutral', monthlyTarget: 0 },
} as const;
```

### 5.2 CTA 템플릿 (카테고리·2차분류별)

```typescript
export const CTA_TEMPLATES = {
  TAX_SIM: `━━━━━━━━━━━━━━━━━━
"우리 회사도 가능할까?" 궁금하시다면 재무제표를 보내주세요.
48시간 안에 절세 시뮬레이션을 만들어 드립니다. (무료)

Tel: 000-0000-0000
Mail: admin@didimip.com
(메일 제목에 '절세 시뮬레이션'이라고 적어주세요)

특허그룹 디딤 | 기업을 아는 변리사`,

  CERT_DIAG: `━━━━━━━━━━━━━━━━━━
우리 회사가 인증 요건에 해당하는지 5분이면 확인할 수 있습니다.
아래 연락처로 문의 주시면 무료 진단을 도와드리겠습니다.

Tel: 000-0000-0000
Mail: admin@didimip.com
(메일 제목에 '인증 진단'이라고 적어주세요)

특허그룹 디딤 | 기업을 아는 변리사`,

  LAB_MGMT: `━━━━━━━━━━━━━━━━━━
연구소 운영 상태가 걱정되시나요?
사후관리 점검을 무료로 도와드립니다.

Tel: 000-0000-0000
Mail: admin@didimip.com
(메일 제목에 '연구소 점검'이라고 적어주세요)

특허그룹 디딤 | 기업을 아는 변리사`,

  NEIGHBOR: `━━━━━━━━━━━━━━━━━━
이런 IP 이야기가 도움이 되셨다면 디딤 블로그를 이웃 추가해주세요.
매주 화요일, 중소기업 대표님께 실질적인 IP 정보를 전해드립니다.

IP 관련 상담이 필요하시면: admin@didimip.com

특허그룹 디딤 | 기업을 아는 변리사`,

  NONE: '',  // 디딤 다이어리용
} as const;
```

### 5.3 프롬프트 키 매핑

```typescript
export function getPromptKey(category: string, subCategory: string): string {
  if (category === '변리사의 현장 수첩') return 'PROMPT_FIELD';
  if (category === 'IP 라운지' && subCategory === 'IP 뉴스 한 입') return 'PROMPT_LOUNGE_BITE';
  if (category === 'IP 라운지') return 'PROMPT_LOUNGE_GENERAL';
  if (category === '디딤 다이어리') return 'PROMPT_DIARY';
  return 'PROMPT_FIELD';
}

export function getCTAType(category: string, subCategory: string): string {
  if (category === '디딤 다이어리') return 'NONE';
  if (category === 'IP 라운지') return 'NEIGHBOR';
  if (subCategory === '절세 시뮬레이션') return 'TAX_SIM';
  if (subCategory === '인증 가이드') return 'CERT_DIAG';
  if (subCategory === '연구소 운영 실무') return 'LAB_MGMT';
  return 'NEIGHBOR';
}
```

---

## 6. SEO 체크리스트 루브릭

### 6.1 상태별 체크 범위

| 상태 | 체크 항목 ID |
|---|---|
| PLANNING | 1, 2, 3 (제목 관련 3항목) |
| DRAFTED | 1~7 (+ 분량, 키워드, 소제목, CTA) |
| REVIEWED | 1~9 (+ 이미지 안내, 내부 링크 안내) |
| SCHEDULED / PUBLISHED | 1~18 (전체) |

### 6.2 카테고리별 루브릭 차이

```typescript
export const SEO_RUBRICS = {
  '변리사의 현장 수첩': {
    bodyLength: { min: 1500, max: 2000, weight: 15 },
    keywordFreq: { min: 3, max: 5, weight: 15 },
    subHeadings: { min: 2, max: 3, weight: 10 },
    ctaRequired: true,
    ctaWeight: 10,
    structureRequired: true,  // 7단계 구조
  },
  'IP 라운지': {  // 일반 (특허 전략 노트, AI와 IP)
    bodyLength: { min: 1500, max: 2000, weight: 15 },
    keywordFreq: { min: 3, max: 5, weight: 15 },
    subHeadings: { min: 2, max: 3, weight: 10 },
    ctaRequired: true,
    ctaWeight: 10,
    structureRequired: true,
  },
  'IP 뉴스 한 입': {  // IP 라운지 하위 특수
    bodyLength: { min: 800, max: 1200, weight: 15 },
    keywordFreq: { min: 2, max: 3, weight: 15 },
    subHeadings: { min: 0, max: 1, weight: 5 },
    ctaRequired: true,
    ctaWeight: 5,
    structureRequired: false,  // 경량 포맷
  },
  '디딤 다이어리': {
    bodyLength: { min: 800, max: 1500, weight: 15 },
    keywordFreq: { min: 1, max: 2, weight: 10 },
    subHeadings: { min: 0, max: 2, weight: 0 },  // 없어도 OK
    ctaRequired: false,  // CTA 없어야 가점
    ctaAbsenceBonus: 10,  // CTA 없으면 +10점
    structureRequired: false,  // 자유 에세이
  },
} as const;
```

### 6.3 부분 점수 계산 공식

```typescript
function calcPartialScore(actual: number, min: number, max: number, weight: number): number {
  if (actual >= min && actual <= max) return weight;  // 만점
  
  const tolerance1 = Math.round((max - min) * 0.5);  // ±50% 범위
  const tolerance2 = Math.round((max - min) * 1.0);  // ±100% 범위
  
  if (actual >= min - tolerance1 && actual <= max + tolerance1) return Math.round(weight * 0.67);
  if (actual >= min - tolerance2 && actual <= max + tolerance2) return Math.round(weight * 0.33);
  return 0;
}
```

점수 색상: 80+ → `text-green-600`, 50~79 → `text-orange-500`, 0~49 → `text-red-500`

---

## 7. 추천 엔진 로직

```typescript
async function getWeeklyRecommendation(): Promise<Recommendation[]> {
  const recommendations: Recommendation[] = [];
  
  // Step 1: 긴급 발행 체크 (최근 3일 뉴스)
  const urgentNews = await checkUrgentIPNews();
  if (urgentNews) {
    recommendations.push({
      priority: 'URGENT',
      category: 'IP 라운지',
      subCategory: 'IP 뉴스 한 입',
      title: urgentNews.suggestedTitle,
      reason: `${urgentNews.daysAgo}일 전 뉴스: ${urgentNews.headline}`,
      newsUrl: urgentNews.url,
    });
  }
  
  // Step 2: 카테고리 균형 (이번 달 2:1:1)
  const monthlyStats = await getMonthlyPublishStats();
  const lastWeekCategory = await getLastWeekCategory();
  const neededCategory = determineNeededCategory(monthlyStats, lastWeekCategory);
  
  // Step 3: 주제 결정
  if (neededCategory === '디딤 다이어리') {
    recommendations.push({
      priority: 'PRIMARY',
      category: '디딤 다이어리',
      subCategory: suggestDiarySub(),
      title: '(자유 주제)',
      reason: `이번 달 다이어리 ${monthlyStats.diary}/${CATEGORIES.DIARY.monthlyTarget}편`,
    });
  } else {
    // HIGH 가중치 미커버 키워드 우선
    const uncoveredHigh = await getUncoveredKeywords(neededCategory, 'HIGH');
    if (uncoveredHigh.length > 0) {
      recommendations.push({
        priority: 'PRIMARY',
        category: neededCategory,
        subCategory: uncoveredHigh[0].sub_category,
        title: generateTitleFromKeyword(uncoveredHigh[0].keyword),
        reason: `키워드 '${uncoveredHigh[0].keyword}' 미발행 (매출 가중치 HIGH)`,
        keywords: [uncoveredHigh[0].keyword],
      });
    }
    
    // 성과 기반 후속편
    const topPosts = await getTopPerformingPosts(neededCategory, 3);
    const withoutSequel = topPosts.filter(p => !p.hasSequel);
    if (withoutSequel.length > 0) {
      recommendations.push({
        priority: 'SECONDARY',
        category: neededCategory,
        subCategory: withoutSequel[0].sub_category,
        title: `"${withoutSequel[0].title}" 후속편`,
        reason: `원글 조회수 ${withoutSequel[0].totalViews}회, 후속편 없음`,
      });
    }
  }
  
  return recommendations;
}

function determineNeededCategory(stats: MonthlyStats, lastWeek: string): string {
  // 2:1:1 미달 카테고리 중 가장 부족한 것
  const gaps = [
    { cat: '변리사의 현장 수첩', gap: 2 - stats.field, target: 2 },
    { cat: 'IP 라운지', gap: 1 - stats.lounge, target: 1 },
    { cat: '디딤 다이어리', gap: 1 - stats.diary, target: 1 },
  ].filter(g => g.gap > 0).sort((a, b) => b.gap - a.gap);
  
  if (gaps.length === 0) return '변리사의 현장 수첩';  // 모두 충족 시 기본
  
  // 전주와 같은 카테고리면 차순위로
  if (gaps[0].cat === lastWeek && gaps.length > 1) return gaps[1].cat;
  return gaps[0].cat;
}
```

---

## 8. 네이버 발행 준비 뷰 상세

### 8.1 레이아웃

```
┌─────────────────────────────────────────────┐
│ ← 돌아가기        네이버 발행 준비           │
├─────────────────────────────────────────────┤
│                                             │
│ 📋 제목                            [복사]   │
│ ┌─────────────────────────────────────┐     │
│ │ 법인세 2억 내던 대표님, 지금은 5천만원... │     │
│ └─────────────────────────────────────┘     │
│                                             │
│ 📋 본문                            [복사]   │
│ ┌─────────────────────────────────────┐     │
│ │ (마크다운 없는 순수 텍스트)         │     │
│ │ 소제목도 그냥 텍스트로 표시         │     │
│ │ ...                                 │     │
│ └─────────────────────────────────────┘     │
│                                             │
│ 📋 CTA                             [복사]   │
│ ┌─────────────────────────────────────┐     │
│ │ ━━━━━━━━━━━━━━━━━━                  │     │
│ │ "우리 회사도 가능할까?" ...         │     │
│ │ admin@didimip.com                   │     │
│ └─────────────────────────────────────┘     │
│                                             │
│ 📋 태그 10개                        [복사]   │
│ ┌─────────────────────────────────────┐     │
│ │ 직무발명보상금절세, 법인세줄이는방법, ... │     │
│ └─────────────────────────────────────┘     │
│                                             │
│ 📋 이미지 ALT 텍스트                [각각 복사] │
│  1: "직무발명보상금 절세 시뮬레이션 비교표"  │
│  2: "법인세 절감 전후 비교 인포그래픽"       │
│  3: "특허그룹 디딤 무료 상담 안내"           │
│                                             │
│ ─── 서식 가이드 (참고용, 복사 안 됨) ───    │
│ • 1행 "직무발명보상금..." → 네이버 제목2     │
│ • 15행 "연구소는 왜..." → 네이버 제목2       │
│ • 28행 "━━━" → 네이버 구분선 삽입            │
│ • 3행 뒤 → 이미지1 삽입 위치                 │
│ • 12행 뒤 → 이미지2 삽입 위치                │
│                                             │
│ ─── 이미지 가이드 ───                        │
│ • 썸네일: 오렌지 계열, 1200×630px            │
│ • 본문 이미지 2장 + 인포그래픽 1장           │
│                                             │
│ ─── 발행 전 최종 체크 ───                    │
│ ☐ 네이버 에디터에 본문 붙여넣기 완료         │
│ ☐ 소제목에 "제목2" 서식 적용                 │
│ ☐ 이미지 3장 삽입 + ALT 텍스트 입력          │
│ ☐ 구분선 + CTA 서식 확인                     │
│ ☐ 태그 10개 입력                             │
│ ☐ 화요일 09:00 예약 발행 설정                │
│ ☐ PC + 모바일 미리보기 확인                  │
│                                             │
│         [발행 완료로 상태 변경]              │
└─────────────────────────────────────────────┘
```

### 8.2 복사 기능 구현

모든 [복사] 버튼은 `navigator.clipboard.writeText()`로 **순수 텍스트만** 복사. HTML 태그 절대 포함 금지. 복사 성공 시 버튼 텍스트 "복사됨 ✓" 2초간 표시 후 원복.

본문 복사 시: 마크다운 구문(`##`, `**`, `` ``` `` 등) 전부 제거. 소제목은 줄바꿈 + 텍스트로만.

---

## 9. 페이지 구조 (라우팅)

```
app/
  (dashboard)/
    page.tsx                    — 대시보드 (모듈 A)
    content/
      page.tsx                  — 콘텐츠 관리 칸반/리스트 (모듈 B)
      [id]/
        page.tsx                — 콘텐츠 상세/편집
        publish/
          page.tsx              — 네이버 발행 준비 뷰
    news/
      page.tsx                  — 뉴스 검색 (모듈 F)
    performance/
      page.tsx                  — 성과 추적 (모듈 D)
    consultations/
      page.tsx                  — 상담 로그 (모듈 D)
    manage/
      page.tsx                  — 글 관리 (모듈 E) — 건강 점검, 내부 링크, 시리즈
    keywords/
      page.tsx                  — 키워드 커버리지 맵 (모듈 E)
    settings/
      page.tsx                  — API 키 설정, LLM 모델 선택
```

---

## 10. Sprint 정의

### Sprint 1: 기반 안정화
- [ ] 미해결 버그 전수 확인 및 수정 (저장, 카드 크래시, 필터)
- [ ] CTA 이메일 admin@didimip.com 하드코딩 확인/수정
- [ ] LLM 기본값 Sonnet 4.6으로 변경
- [ ] 삭제 기능 추가 (칸반 카드 + 상세 페이지)
- [ ] 카테고리 필터 계층적 필터링 수정
- [ ] 콘텐츠 상세 페이지 (없으면 생성, 있으면 에러 수정)

### Sprint 2: 네이버 발행 준비
- [ ] 네이버 발행 준비 뷰 페이지 신규 생성
- [ ] 복사 버튼 6개 (제목/본문/CTA/태그/ALT/각각) — writeText 순수 텍스트
- [ ] 서식 가이드 (본문 밖, 소제목 행번호 자동 계산)
- [ ] 이미지 가이드 (카테고리별 색상/사이즈/장수)
- [ ] 발행 전 체크리스트 (체크박스 7개)
- [ ] AI 초안 생성 시 태그 10개 동시 생성 (핵심3+연관3+브랜드2+롱테일2)
- [ ] AI 초안 생성 시 이미지 ALT 텍스트 3개 동시 생성
- [ ] 본문 출력 시 마크다운 구문 완전 제거

### Sprint 3: SEO 완전 개편
- [ ] 상태별 체크 범위 분기 구현
- [ ] 카테고리별 루브릭 4종 구현 (현장수첩/IP라운지일반/IP뉴스한입/다이어리)
- [ ] 부분 점수 계산 공식 구현
- [ ] 점수 색상 3단계 (초록/주황/빨강)
- [ ] 각 미충족 항목에 개선 힌트 인라인 표시
- [ ] 다이어리 CTA 부재 가점 로직
- [ ] "발행 불가" → PLANNING/DRAFTED에서 표시 안 함. SCHEDULED 이상에서만.

### Sprint 4: 대시보드 + 추천 엔진
- [ ] 대시보드 홈 페이지 신규 생성
- [ ] 이번 주 추천 (4소스 종합): 카테고리 균형 + 키워드 커버리지 + 성과 기반 + 시의성 뉴스
- [ ] 월간 발행 현황 (카테고리별 진행률 바)
- [ ] 월간 성과 요약 (조회수 합계, 상담 건수, 계약 건수)
- [ ] 업데이트 필요 글 목록
- [ ] TOP 성과 글 (조회수 기준 TOP 5)
- [ ] DB 마이그레이션: keyword_pool + schedule_templates + 시드 데이터
- [ ] 같은 카테고리 연속 2주 방지 경고

### Sprint 5: 성과 추적
- [ ] 글별 성과 입력 탭 (조회수, 유입 키워드 TOP 3, 댓글 수, 이웃 추가 수)
- [ ] 상담 로그 페이지 (CRUD)
- [ ] 키워드 순위 추적 (타깃 키워드 등록 + 월별 순위 입력)
- [ ] 전환 기여 분석 (상담 로그의 경유 글 집계 → 글별 전환율)
- [ ] DB 마이그레이션: post_metrics + consultations + keyword_rankings

### Sprint 6: 글 관리
- [ ] 업데이트 알림 (현장수첩 60일, 기타 90일 자동 플래그)
- [ ] 법률 변경 감지 (뉴스 키워드 매칭 → 관련 기존 글 경고)
- [ ] 내부 링크 추천 (같은 카테고리/키워드 글 간 상호 링크 제안)
- [ ] 시리즈물 관리 (시리즈 등록, 편 번호 추적, 다음 편 발행 상태)
- [ ] 키워드 커버리지 맵 시각화 (전체 풀 vs 발행 매핑, 매출 가중치 색상)
- [ ] DB 마이그레이션: series 테이블

### Sprint 7: 뉴스 검색 강화 + 추천 고도화
- [ ] Google Custom Search API 연동
- [ ] AI 키워드 확장 (검색어 입력 시 관련 키워드 추천)
- [ ] AI 뉴스 요약 (기사 1줄 요약)
- [ ] 뉴스 → 초안 원클릭 연결 ("이 이슈로 초안 생성" 버튼)
- [ ] 긴급 발행 감지 (IP 관련 주요 이슈 감지 시 대시보드 표시)
- [ ] 추천 엔진: 성과 기반 후속편 로직 (조회수 TOP 3 후속편 추천)

---

## 11. 통합 검토 체크리스트

- [ ] posts 테이블의 status 값이 UI 상태명, API 응답, 칸반 칼럼명에서 동일한가
- [ ] 카테고리 문자열이 DB 시드, UI 드롭다운, AI 프롬프트, CTA 매핑에서 완전 동일한가
- [ ] SEO 루브릭의 카테고리명이 DB category 컬럼 값과 정확히 일치하는가
- [ ] CTA 템플릿의 이메일이 admin@didimip.com인가 (다른 주소 없는가)
- [ ] 다이어리 글 생성 시 CTA가 절대 포함되지 않는가
- [ ] 발행 준비 뷰의 복사 버튼이 순수 텍스트만 복사하는가 (HTML 없는가)
- [ ] 추천 엔진의 카테고리 균형 계산이 실제 발행 이력 기반인가
- [ ] 상태 전이 시 SEO 체크 범위가 정확히 분기되는가
