# 카테고리 정본 — 네이버 categoryNo 기준 (+ 레거시 CAT-* 별칭)

> 결정 근거: skills/_DECISIONS.md 1·2절(2026-10-01 확정, blog.naver.com/didimip 카테고리 위젯의 categoryNo 링크 기준).
> 코드의 CAT-* ID 는 서로 모순(CAT-B-01/02 뒤바뀜, CAT-A-04 누락)이 있어 **내부 ID 로 쓰지 않는다.** 정본 ID 는 네이버 categoryNo, CAT-* 는 별칭(레거시 코드 규칙을 계산할 때만)이다.
> 이름은 네이버 표기와 100% 일치해야 한다(UPGRADE_SPEC §0-3).

## 목차
- A-1. 네이버 실제 카테고리 (정본)
- A-2. 신규 구조 운영 규칙 (새 글 기본)
- A-3. 레거시 → 신규 매핑 + CAT-* 별칭 표
- A-4. 어떤 카테고리를 쓰나 (판단 순서)
- B-1~B-8. 백오피스 코드의 CAT-* 정의와 원문 (레거시 참고)

## A-1. 네이버 실제 카테고리 (정본)
| categoryNo | 이름 (네이버 문자열 그대로) | 상위 | 구분 |
|---|---|---|---|
| 25 | 지원사업·인증과 특허 | 최상위 | 신규 구조 (우선) |
| 27 | 출원·심판 실무 | 최상위 | 신규 구조 (우선) |
| 26 | 사례 | 최상위 | 신규 구조 (우선) |
| 24 | 지식재산 경영 | 최상위 | 신규 구조 (우선) |
| 28 | 디딤 소식 | 최상위 | 신규 구조 (우선) |
| 17 | 디딤 다이어리 (하위 18 컨설팅 후기, 19 디딤 일상, 20 대표의 생각) | 최상위 | 유지 |
| 7 | 디딤 소개 | 최상위 | 고정 페이지(자동 생성 대상 아님) |
| 22 | 상담 안내 | 최상위 | 고정 페이지(자동 생성 대상 아님) |
| 9 | 변리사의 현장 수첩 (하위 10 절세 시뮬레이션, 11 인증 가이드, 12 연구소 운영 실무, 23 특허·상표 출원 실무) | 최상위 | 레거시(기존 글 호환) |
| 13 | IP 라운지 (하위 14 특허 전략 노트, 15 AI와 IP, 16 IP 뉴스 한 입) | 최상위 | 레거시(기존 글 호환) |

## A-2. 신규 구조 운영 규칙 (_DECISIONS.md 2절 원문 표 + 스킬 계산 규칙)
| 신규 카테고리 (categoryNo) | 목적 | 역할/퍼널 | 프롬프트 키 | CTA | 레거시에서 흡수 |
|---|---|---|---|---|---|
| 지원사업·인증과 특허 (25) | 지원매치×디딤 허브: 지원사업 가점·요건으로서의 특허·인증, 벤처·이노비즈·연구소·직무발명 절세 | 전환형 / 유입+전환 | PROMPT_FIELD | 인증 진단·연구소 진단·절세 시뮬레이션 중 키워드 매칭 (+향후 특허인증센터 링크 슬롯) | 절세 시뮬레이션, 인증 가이드, 연구소 운영 실무 |
| 출원·심판 실무 (27) | 디딤 본업 수임: 특허·상표·디자인 출원, 우선심사, 거절 대응, 심판·분쟁 | 전환형 / 전환 | PROMPT_FIELD | 출원 CTA(코드의 출원 CTA) | 특허·상표 출원 실무 |
| 사례 (26) | 경험 기반 신뢰: 익명화한 실제 사건·컨설팅 사례. **사용자가 준 사건 메모 없이는 쓰지 않는다** | 신뢰+전환 | PROMPT_FIELD (사례 서술) | 주제 키워드로 매칭 | 컨설팅 후기 |
| 지식재산 경영 (24) | 개인 브랜드: 노재일 변리사의 IP 경영 관점 연재(링크드인 연재 재활용), 특허 전략, AI와 IP | 트래픽/브랜딩 | PROMPT_LOUNGE_GENERAL | 이웃 추가 CTA | 특허 전략 노트, AI와 IP |
| 디딤 소식 (28) | 시의성: IP 뉴스 한 입 + 사무소 소식 | 트래픽 | PROMPT_LOUNGE_BITE | 가벼운 이웃 추가 CTA (사무소 소식은 CTA 없음) | IP 뉴스 한 입 |
| 디딤 다이어리 (17) | 인간적 신뢰 | 신뢰 | PROMPT_DIARY | **CTA 금지(절대원칙)** | — |

스킬 계산 규칙(코드에 없는 부분은 스킬이 정한 것 — CTA 세부는 cta-templates.md 0절):
- 레거시 코드 함수(면책 레벨·포맷 가이드·태그 접미사)에 넘길 **CAT 별칭**: 25 → CAT-A(CTA 가 절세/인증/연구소로 매칭되면 CAT-A-01/02/03), 27 → CAT-A-04, 26 → CAT-A, 24 → CAT-B, 28 → CAT-B-03, 17 → CAT-C(18/19/20 → CAT-C-01/02/03), 7 → CAT-INTRO, 22 → CAT-CONSULT.
- 계산: `python3 scripts/core_rules.py category` / `cta` / `disclaimer`(category 에 이름 또는 categoryNo).

## A-3. 레거시 → 신규 매핑 + CAT-* 별칭
| 레거시 categoryNo | 레거시 이름 | 코드 CAT 별칭 | 신규 대응 (통계·추천 합산 대상) |
|---|---|---|---|
| 9 | 변리사의 현장 수첩 | CAT-A | 지원사업·인증과 특허 (25) — 하위에 따라 25/27 |
| 10 | 절세 시뮬레이션 | CAT-A-01 | 지원사업·인증과 특허 (25) |
| 11 | 인증 가이드 | CAT-A-02 | 지원사업·인증과 특허 (25) |
| 12 | 연구소 운영 실무 | CAT-A-03 | 지원사업·인증과 특허 (25) |
| 23 | 특허·상표 출원 실무 | CAT-A-04 | 출원·심판 실무 (27) |
| 13 | IP 라운지 | CAT-B | 지식재산 경영 (24) — 하위에 따라 24/28 |
| 14 | 특허 전략 노트 | CAT-B-01 ※ | 지식재산 경영 (24) |
| 15 | AI와 IP | CAT-B-02 ※ | 지식재산 경영 (24) |
| 16 | IP 뉴스 한 입 | CAT-B-03 | 디딤 소식 (28) |
| 18 | 컨설팅 후기 | CAT-C-01 | 디딤 다이어리 (17) 유지 ※사례(26)는 '컨설팅 후기'를 흡수하지만, 기존 글 통계는 다이어리로 둔다(확인 필요) |
| 19 | 디딤 일상 | CAT-C-02 | 디딤 다이어리 (17) |
| 20 | 대표의 생각 | CAT-C-03 | 디딤 다이어리 (17) |
| 7 / 22 | 디딤 소개 / 상담 안내 | CAT-INTRO / CAT-CONSULT | 고정 |

※ CAT-B-01/02 별칭은 코드 런타임(FIELD_CTA·sub-category-pool) 기준이다. DB 시드(seed.sql)는 반대(B-01=AI와 IP)이므로, 백오피스 데이터에서 온 CAT-B-01/02 는 이름으로 다시 확인한다.
- Notion "디딤 블로그 콘텐츠" 에서는 레거시 글을 `카테고리 = 레거시`, `레거시 2차 분류 = 원래 이름`, `categoryNo = 레거시 번호`로 적는다(notion-storage.md).

## A-4. 어떤 카테고리를 쓰나
1. 사용자가 카테고리(레거시 포함)를 지정하면 그대로 따른다(예: 2026-10-01 '특허 전략 노트'에 연재 3편 발행).
2. 지정이 없으면 신규 구조(25/27/26/24/28, 17) 중에서 고른다.
3. 사례(26)는 사용자가 준 사건 메모가 있을 때만. 없으면 출원·심판 실무(27)로 대체.
4. 디딤 소식(28)은 "IP 뉴스 한 입"형 뉴스인지 "사무소 소식"인지 구분한다(사무소 소식은 CTA 없음).
5. 디딤 소개(7)·상담 안내(22)는 고정 페이지라 글을 자동 생성하지 않는다.

---
# B. 백오피스 코드의 CAT-* 정의 (레거시 참고, 원문)

> 출처: supabase/seed.sql:1-16, src/lib/constants/categories.ts, src/lib/constants/sub-category-pool.ts,
> src/lib/constants/prompts.ts(FIELD_CTA·getPromptKey·브리핑 프롬프트), docs/UPGRADE_SPEC.md §5.1.

## B-1. 레거시 코드 카테고리 표 (CAT-*, 백오피스 코드 기준)

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

※ 이 표는 백오피스 코드의 CAT-* 체계다. 스킬의 정본은 A절(네이버 categoryNo)이며 CAT-* 는 별칭으로만 쓴다.
※ CAT-B-01/CAT-B-02 는 소스마다 이름이 뒤바뀌어 있다(B-3절). **ID 대신 이름(네이버 문자열)으로 판단**하고, CAT 별칭이 필요하면 위 표(코드 런타임 기준: FIELD_CTA·sub-category-pool·getFieldCta)를 쓴다. 역할·퍼널은 이름 기준(seed.sql 의 같은 이름 행)으로 적었다.

- 프롤로그 영역(prologue_position): CAT-A=area1(영역 1), CAT-B=area2(영역 2), CAT-C=area3(영역 3), 나머지 null.
- connected_services(seed.sql): CAT-A {절세컨설팅, 사후관리, 벤처인증, 우수기업인증}, CAT-A-01 {절세컨설팅}, CAT-A-02 {벤처인증, 우수기업인증}, CAT-A-03 {사후관리}, CAT-B {특허출원, AI특허, 기술보호}, 'AI와 IP' {AI특허}, '특허 전략 노트' {특허출원, 기술보호}.
- 프롬프트 키 결정(prompts.ts:57-80 getPromptKey): `CAT-A`/`CAT-A-*` → PROMPT_FIELD, `CAT-B-03` → PROMPT_LOUNGE_BITE, `CAT-B`/`CAT-B-*` → PROMPT_LOUNGE_GENERAL, `CAT-C`/`CAT-C-*` → PROMPT_DIARY, 그 외 → PROMPT_LOUNGE_GENERAL.
- 카테고리 판정 입력값은 보통 `secondary_category || category_id` (발행 준비·면책·포맷 가이드), 단 다이어리 CTA 제외 판정은 `category_id`(1차)로 한다(publish-prep-client.tsx:146-151).

## B-2. 라벨 사전

| 키 | 값 → 한국어 라벨 | 근거 |
|---|---|---|
| role_type | conversion=전환형, traffic_branding=트래픽/브랜딩형, trust=신뢰형, fixed=고정 | categories.ts:11-16 |
| funnel_stage | ATTRACT=유입, TRUST=신뢰, CONVERT=전환, MULTI=복합 | categories.ts:19-24 |
| cta_type | direct=직접 CTA, neighbor=이웃 CTA, none=없음 | components/categories/category-detail-card.tsx:25-29 |
| status | NEW=신규, GROW=성장, MATURE=안정, ADJUST=조정 | categories.ts:27-32 |
| 색상 | CAT-A #D4740A(오렌지), CAT-B #1B3A5C(네이비), CAT-C #6B7280(그레이), CAT-INTRO #94A3B8, CAT-CONSULT #2E75B6 | categories.ts:2-8 |

## B-3. 코드 소스별 불일치 기록 (코드에서 확인한 사실)

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

→ 네이버에는 categoryNo 23 '특허·상표 출원 실무'(레거시 '변리사의 현장 수첩' 하위)로 실재한다. 신규 구조에서는 '출원·심판 실무'(27)가 흡수한다.

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

## B-4. 원문: supabase/seed.sql:1-16
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

## B-5. 원문: src/lib/constants/categories.ts
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

## B-6. 원문: docs/UPGRADE_SPEC.md §5.1 (310-335행)
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

## B-7. 원문: prompts.ts:1487-1499 (PROMPT_BRIEFING_GENERATE 의 카테고리 판단 기준)
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

## B-8. 원문: sub-category-pool.ts:1-10 / schedule-data.ts:55-83
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
