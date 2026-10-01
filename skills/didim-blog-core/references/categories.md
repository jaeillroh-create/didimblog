# 카테고리 정본 (1차/2차 · ID · 역할 · 퍼널 · CTA 유형)

> 출처: supabase/seed.sql:1-16, src/lib/constants/categories.ts, src/lib/constants/sub-category-pool.ts,
> src/lib/constants/prompts.ts(FIELD_CTA·getPromptKey·브리핑 프롬프트), docs/UPGRADE_SPEC.md §5.1.
> 네이버 블로그 실제 카테고리 문자열과 100% 일치해야 한다(UPGRADE_SPEC §0-3).

## 목차
1. 정본 표 (스킬에서 쓰는 기준)
2. 라벨 사전 (role_type / funnel_stage / cta_type / status / 색상)
3. 소스별 불일치 기록
4. 원문: supabase/seed.sql 카테고리 시드
5. 원문: categories.ts
6. 원문: UPGRADE_SPEC §5.1 카테고리 구조
7. 원문: 브리핑 프롬프트의 카테고리 판단 기준 (prompts.ts:1487-1499)
8. 원문: sub-category-pool.ts 머리말 / schedule-data.ts 매핑

## 1. 정본 표 (스킬 기준)

| ID | 네이버 카테고리 이름 | 단계 | 상위 | 역할(role_type) | 퍼널(funnel_stage) | CTA 유형 | 프롬프트 키 | 월 목표 |
|---|---|---|---|---|---|---|---|---|
| CAT-INTRO | 디딤 소개 | 1차 | - | 고정(fixed) | 복합(MULTI) | 없음(none) | (해당 없음) | 0 |
| CAT-A | 변리사의 현장 수첩 | 1차 | - | 전환형(conversion) | 유입(ATTRACT) | 직접 CTA(direct) | PROMPT_FIELD | 2 |
| CAT-A-01 | 절세 시뮬레이션 | 2차 | CAT-A | 전환형 | 전환(CONVERT) | 직접 CTA | PROMPT_FIELD | 0 |
| CAT-A-02 | 인증 가이드 | 2차 | CAT-A | 전환형 | 전환 | 직접 CTA | PROMPT_FIELD | 0 |
| CAT-A-03 | 연구소 운영 실무 | 2차 | CAT-A | 전환형 | 전환 | 직접 CTA | PROMPT_FIELD | 0 |
| CAT-A-04 | 특허·상표 출원 실무 | 2차 | CAT-A | (DB 미정의 → 상위 기준 전환형) | (미정의) | 직접 CTA (FIELD_CTA 존재) | PROMPT_FIELD | - |
| CAT-B | IP 라운지 | 1차 | - | 트래픽/브랜딩형(traffic_branding) | 유입 | 이웃 CTA(neighbor) | PROMPT_LOUNGE_GENERAL | 1 |
| CAT-B-01 ※ | 특허 전략 노트 | 2차 | CAT-B | 트래픽/브랜딩형 | 신뢰(TRUST) | 이웃 CTA | PROMPT_LOUNGE_GENERAL | 0 |
| CAT-B-02 ※ | AI와 IP | 2차 | CAT-B | 트래픽/브랜딩형 | 유입 | 이웃 CTA | PROMPT_LOUNGE_GENERAL | 0 |
| CAT-B-03 | IP 뉴스 한 입 | 2차 | CAT-B | 트래픽/브랜딩형 | 유입 | 이웃 CTA | PROMPT_LOUNGE_BITE | 0 |
| CAT-C | 디딤 다이어리 | 1차 | - | 신뢰형(trust) | 신뢰 | 없음 | PROMPT_DIARY | 1 |
| CAT-C-01 | 컨설팅 후기 | 2차 | CAT-C | 신뢰형 | 신뢰 | 없음 | PROMPT_DIARY | 0 |
| CAT-C-02 | 디딤 일상 | 2차 | CAT-C | 신뢰형 | 신뢰 | 없음 | PROMPT_DIARY | 0 |
| CAT-C-03 | 대표의 생각 | 2차 | CAT-C | 신뢰형 | 신뢰 | 없음 | PROMPT_DIARY | 0 |
| CAT-CONSULT | 상담 안내 | 1차 | - | 고정 | 전환 | 직접 CTA | (해당 없음) | 0 |

※ CAT-B-01/CAT-B-02 는 소스마다 이름이 뒤바뀌어 있다(3절). **ID 대신 이름(네이버 문자열)으로 판단**하고, ID가 필요하면 위 표(코드 런타임 기준: FIELD_CTA·sub-category-pool·getFieldCta)를 쓴다. 역할·퍼널은 이름 기준(seed.sql 의 같은 이름 행)으로 적었다.

- 프롤로그 영역(prologue_position): CAT-A=area1(영역 1), CAT-B=area2(영역 2), CAT-C=area3(영역 3), 나머지 null.
- connected_services(seed.sql): CAT-A {절세컨설팅, 사후관리, 벤처인증, 우수기업인증}, CAT-A-01 {절세컨설팅}, CAT-A-02 {벤처인증, 우수기업인증}, CAT-A-03 {사후관리}, CAT-B {특허출원, AI특허, 기술보호}, 'AI와 IP' {AI특허}, '특허 전략 노트' {특허출원, 기술보호}.
- 프롬프트 키 결정(prompts.ts:57-80 getPromptKey): `CAT-A`/`CAT-A-*` → PROMPT_FIELD, `CAT-B-03` → PROMPT_LOUNGE_BITE, `CAT-B`/`CAT-B-*` → PROMPT_LOUNGE_GENERAL, `CAT-C`/`CAT-C-*` → PROMPT_DIARY, 그 외 → PROMPT_LOUNGE_GENERAL.
- 카테고리 판정 입력값은 보통 `secondary_category || category_id` (발행 준비·면책·포맷 가이드), 단 다이어리 CTA 제외 판정은 `category_id`(1차)로 한다(publish-prep-client.tsx:146-151).

## 2. 라벨 사전

| 키 | 값 → 한국어 라벨 | 근거 |
|---|---|---|
| role_type | conversion=전환형, traffic_branding=트래픽/브랜딩형, trust=신뢰형, fixed=고정 | categories.ts:11-16 |
| funnel_stage | ATTRACT=유입, TRUST=신뢰, CONVERT=전환, MULTI=복합 | categories.ts:19-24 |
| cta_type | direct=직접 CTA, neighbor=이웃 CTA, none=없음 | components/categories/category-detail-card.tsx:25-29 |
| status | NEW=신규, GROW=성장, MATURE=안정, ADJUST=조정 | categories.ts:27-32 |
| 색상 | CAT-A #D4740A(오렌지), CAT-B #1B3A5C(네이비), CAT-C #6B7280(그레이), CAT-INTRO #94A3B8, CAT-CONSULT #2E75B6 | categories.ts:2-8 |

## 3. 소스별 불일치 기록 (코드에서 확인한 사실)

### 3-1. CAT-A-04 "특허·상표 출원 실무"
실제 네이버 블로그에는 '특허·상표 출원 실무' 2차 카테고리가 존재한다(사용자 확인). 코드 상태:

| 소스 | CAT-A-04 존재 | 비고 |
|---|---|---|
| supabase/seed.sql (DB categories 시드) | ✗ | CAT-A 아래 01~03만 |
| SPEC.md:389-403 | ✗ | seed.sql 과 동일 |
| docs/UPGRADE_SPEC.md §5.1 | ✗ | subCategories 3개 |
| src/lib/constants/categories.ts CATEGORY_HIERARCHY | ✗ | 'CAT-A': ['CAT-A-01','CAT-A-02','CAT-A-03'] |
| src/actions/briefing.ts:89-93 VALID_SECONDARY_CATEGORIES | ✗ | 브리핑 결과가 CAT-A-04면 검증에서 탈락 |
| src/lib/constants/sub-category-pool.ts:68-80 | ✓ | name "특허·상표 출원 실무" + 키워드 7개 |
| src/lib/constants/prompts.ts FIELD_CTA/getFieldCta | ✓ | CTA "출원 상담", CAT-A 폴백도 CAT-A-04 |
| prompts.ts PROMPT_BRIEFING_GENERATE / FROM_FILE | ✓ | "특허출원/상표출원/디자인출원/해외출원 → CAT-A / CAT-A-04" |
| src/actions/file-upload.ts:97-101 | ✓ | |
| publish-prep-client.tsx FALLBACK_CTA "현장수첩_출원" | ✓ | categoryName "현장 수첩 · 특허·상표 출원 실무" |
| migration 011 cta_templates | ✗ | 4건(절세/인증/연구소/IP라운지)만 |
| seed_data/cta_templates.json | ✗ | |

→ 스킬은 CAT-A-04 를 정식 2차 카테고리로 취급한다(네이버 실재 + 코드 런타임 사용).

### 3-2. CAT-B-01 / CAT-B-02 이름 뒤바뀜

| 소스 | CAT-B-01 | CAT-B-02 |
|---|---|---|
| supabase/seed.sql, SPEC.md | AI와 IP | 특허 전략 노트 |
| prompts.ts 브리핑 프롬프트(1492-1493, 1522-1523) | AI와 IP | 특허 전략 노트 |
| prompts.ts FIELD_CTA 주석(32-41) + getFieldCta(AI 키워드 → CAT-B-02) | 특허 전략 노트 | AI와 IP |
| sub-category-pool.ts:83-111 | 특허 전략 노트 | AI와 IP |
| UPGRADE_SPEC §5.1 subCategories 순서 | 특허 전략 노트(1번째) | AI와 IP(2번째) |

### 3-3. "연구소 운영" vs "연구소 운영 실무"
- 정식 이름은 "연구소 운영 실무"(seed.sql, UPGRADE_SPEC §5.1, sub-category-pool).
- schedule-data.ts 12주 스케줄은 subCategory "연구소 운영"을 쓰고, getCtaKey 가 둘 다 허용한다.
- CTA 템플릿 categoryName 은 "현장 수첩 · 연구소 운영"(migration 011).

### 3-4. 1차 카테고리 ID에 CAT-B-03 혼입
브리핑 프롬프트와 briefing.ts/file-upload.ts 의 VALID_PRIMARY_CATEGORIES 는 `["CAT-A", "CAT-B", "CAT-B-03", "CAT-C"]` 로 2차인 CAT-B-03 을 1차 후보에 포함한다(경량 포맷 분기용). seo-rubrics.ts 도 CAT-A/CAT-B/CAT-B-03/CAT-C 4개 키를 쓴다.

## 4. 원문: supabase/seed.sql:1-16
````sql
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
````

## 5. 원문: src/lib/constants/categories.ts
````ts
// 카테고리 색상 코드
export const CATEGORY_COLORS = {
  "CAT-A": "#D4740A", // 현장수첩 = 오렌지
  "CAT-B": "#1B3A5C", // IP라운지 = 네이비
  "CAT-C": "#6B7280", // 다이어리 = 그레이
  "CAT-INTRO": "#94A3B8",
  "CAT-CONSULT": "#2E75B6",
} as const;

// 카테고리 역할 타입
export const CATEGORY_ROLE_TYPES = {
  conversion: "전환형",
  traffic_branding: "트래픽/브랜딩형",
  trust: "신뢰형",
  fixed: "고정",
} as const;

// 퍼널 단계
export const FUNNEL_STAGES = {
  ATTRACT: "유입",
  TRUST: "신뢰",
  CONVERT: "전환",
  MULTI: "복합",
} as const;

// 카테고리 생애주기 상태
export const CATEGORY_STATUSES = {
  NEW: { label: "신규", color: "#3B82F6" },
  GROW: { label: "성장", color: "#10B981" },
  MATURE: { label: "안정", color: "#6B7280" },
  ADJUST: { label: "조정", color: "#F59E0B" },
} as const;

// ── 디딤 공통 상수 ──

export const DIDIM_EMAIL = 'admin@didimip.com' as const;
export const DIDIM_PHONE = '02-571-6613' as const;
export const DIDIM_SIGNATURE = '특허그룹 디딤 | 기업을 아는 변리사' as const;
export const DIDIM_PROFILE_NOH = 'KAIST 출신 | 前 NHN에듀 최고지식재산책임자(CIPO) | 기업기술가치평가사' as const;
export const DIDIM_PROFILE_LEE = '경희대 겸임교수 | 서울대 AI 최고위과정 | 반도체·디스플레이 IP 전문' as const;

// 카테고리 계층 구조 (1차 → 2차 매핑)
export const CATEGORY_HIERARCHY: Record<string, string[]> = {
  'CAT-A': ['CAT-A-01', 'CAT-A-02', 'CAT-A-03'],
  'CAT-B': ['CAT-B-01', 'CAT-B-02', 'CAT-B-03'],
  'CAT-C': ['CAT-C-01', 'CAT-C-02', 'CAT-C-03'],
} as const;
````

## 6. 원문: docs/UPGRADE_SPEC.md §5.1 (310-335행)
````md
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
````

## 7. 원문: prompts.ts:1487-1499 (PROMPT_BRIEFING_GENERATE 의 카테고리 판단 기준)
````text
카테고리 판단 기준 (categoryId는 상위, secondaryCategoryId는 세부):
- 절세/보상금/법인세 관련 고객 사례 → CAT-A / CAT-A-01 (절세 시뮬레이션)
- 벤처인증/기업부설연구소 인증 관련 → CAT-A / CAT-A-02 (인증 가이드)
- 연구소 운영/사후관리/세무조사 대응 → CAT-A / CAT-A-03 (연구소 운영 실무)
- 특허출원/상표출원/디자인출원/해외출원 → CAT-A / CAT-A-04 (특허·상표 출원 실무)
- AI와 지식재산/기술 트렌드 → CAT-B / CAT-B-01 (AI와 IP)
- 특허 전략/IP 포트폴리오/분쟁 → CAT-B / CAT-B-02 (특허 전략 노트)
- 최신 뉴스 경량 요약 → CAT-B / CAT-B-03 (IP 뉴스 한 입)
- 컨설팅 후기/고객 감사 → CAT-C / CAT-C-01 (컨설팅 후기)
- 일상/사무실/행사 → CAT-C / CAT-C-02 (디딤 일상)
- 대표 개인 생각/에세이 → CAT-C / CAT-C-03 (대표의 생각)

디딤의 핵심 서비스: 직무발명보상 절세 컨설팅, 기업부설연구소 설립, 벤처기업인증, 특허출원`;
````

## 8. 원문: sub-category-pool.ts:1-10 / schedule-data.ts:55-83
````ts
/**
 * 2차 카테고리별 추천 키워드 풀 + 다이어리 주제 풀.
 *
 * 네이버 블로그 카테고리 구조:
 *   변리사의 현장 수첩: CAT-A-01(절세), CAT-A-02(인증), CAT-A-03(연구소), CAT-A-04(출원)
 *   IP 라운지: CAT-B-01(전략노트), CAT-B-02(AI와IP), CAT-B-03(뉴스)
 *   디딤 다이어리: CAT-C-01(후기), CAT-C-02(일상), CAT-C-03(대표생각)
 *
 * 추천 엔진이 2차 카테고리를 로테이션하면서 키워드를 샘플링한다.
 */
````

````ts
/**
 * 카테고리/서브카테고리 → 프롬프트 템플릿 키 매핑
 * - 디딤 다이어리: 브랜딩 톤 (CTA 없음)
 * - IP 라운지 > IP 뉴스 한 입: 뉴스 큐레이션 톤
 * - IP 라운지 (기타): IP 전략/교양 톤
 * - 변리사의 현장 수첩: 실무 사례 톤 (subCategory별 CTA만 다름)
 */
export function getPromptKey(category: string, subCategory: string): PromptKey {
  if (category === "디딤 다이어리") return PROMPT_KEYS.PROMPT_DIARY;
  if (category === "IP 라운지" && subCategory === "IP 뉴스 한 입")
    return PROMPT_KEYS.PROMPT_LOUNGE_BITE;
  if (category === "IP 라운지") return PROMPT_KEYS.PROMPT_LOUNGE_GENERAL;
  return PROMPT_KEYS.PROMPT_FIELD;
}

/**
 * 카테고리/서브카테고리 → CTA 템플릿 키 매핑
 * cta_templates.json 키와 일치
 */
export function getCtaKey(category: string, subCategory: string): CtaKey | null {
  if (category === "디딤 다이어리") return null; // CTA 없음
  if (category === "IP 라운지") return CTA_KEYS.IP라운지;
  // 현장 수첩: subCategory별 CTA 분기
  if (subCategory === "절세 시뮬레이션") return CTA_KEYS.현장수첩_절세;
  if (subCategory === "인증 가이드") return CTA_KEYS.현장수첩_인증;
  if (subCategory === "연구소 운영" || subCategory === "연구소 운영 실무")
    return CTA_KEYS.현장수첩_연구소;
  // 기타 현장 수첩 → 절세 CTA를 기본으로 사용
  return CTA_KEYS.현장수첩_절세;
````
