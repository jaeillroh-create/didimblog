# didim-blog-core — 브랜드·카테고리·CTA·면책·명칭·광고 규정 공통 기반

## 1. 기능 개요
특허그룹 디딤 네이버 블로그 운영에 공통으로 쓰이는 상수와 규칙(네이버 실제 카테고리와 categoryNo 정본 및 레거시 CAT-* 별칭 매핑, 카테고리별 역할·퍼널·CTA 유형·프롬프트 키, 글쓰기·톤 규칙, CTA 문구와 선택 로직, 면책조항 레벨과 문구, 폐지 기관명 치환, 디딤 연락처·서명·변리사 프로필, 절대원칙, 변리사 광고 규정 표현 규칙)을 코드에서 원문 그대로 옮겨 제공한다. skills/_DECISIONS.md(2026-10-01 확정: 네이버 categoryNo 정본, 신규 카테고리 구조 25/27/26/24/28, Notion DB 2개)를 반영하며, 다른 didim-blog-* 스킬이 이 규칙과 Notion 저장소 안내를 근거로 기획·작성·검수·발행 준비·기록을 한다. 결정적 로직(명칭 치환, 프롬프트 키, 생성용 CTA 선택, 면책 레벨, 이메일 강제, 초안 검증)은 Python 으로 포팅했다.

## 2. 원본 코드 위치
| 파일 | 함수/상수 |
|---|---|
| src/lib/constants/categories.ts:2-47 | CATEGORY_COLORS, CATEGORY_ROLE_TYPES, FUNNEL_STAGES, CATEGORY_STATUSES, DIDIM_EMAIL, DIDIM_PHONE, DIDIM_SIGNATURE, DIDIM_PROFILE_NOH, DIDIM_PROFILE_LEE, CATEGORY_HIERARCHY |
| supabase/seed.sql:1-16 (= SPEC.md:389-403) | categories 시드 15행 |
| supabase/migrations/001_initial_schema.sql:26-41 | categories 테이블 스키마(role_type, funnel_stage, prologue_position, cta_type 등) |
| src/lib/constants/sub-category-pool.ts:1-148 | SUB_CATEGORY_POOL (CAT-A-04 포함 2차 10개) |
| src/lib/constants/prompts.ts:3-7, 11-119 | PromptKey, FIELD_CTA, DEFAULT_CTA, getPromptKey, getFieldCta |
| src/lib/constants/prompts.ts:121-312 | COMMON_TITLE/LEGAL/TONE/EMPHASIS/HOOK/PARAGRAPH_RULES, CONTENT_TYPE_RULES, COMMON_WRITING_RULES |
| src/lib/constants/prompts.ts:865-929 | CATEGORY_TONE_RULES |
| src/lib/constants/prompts.ts:993-1006, 1145-1150, 1681-1704, 437-441 | 광고규정 준수(PHASE2), 광고규정 최종 검수(PHASE3), 교차검증 항목 3~7, 첫 이미지 절대 금지 |
| src/lib/constants/prompts.ts:1487-1499 | 브리핑 프롬프트 카테고리 판단 기준 |
| src/lib/constants/prompts.ts:1760-1807 | DIARY_CTA_KEYWORDS, validateGeneratedDraft |
| src/lib/constants/name-mappings.ts:1-62 | DeprecatedName, DEPRECATED_NAMES, replaceDeprecatedNames |
| src/lib/client-generate.ts:1351-1405 | cleanFinalText (replaceDeprecatedNames 호출) |
| src/lib/client-generate.ts:1496-1583 | appendCtaAndSignature (면책+CTA+서명+태그 블록) |
| src/lib/client-generate.ts:1585-1697 | DisclaimerLevel, AI_NOTICE, DISCLAIMER_TEMPLATES, LEVEL_A/B_KEYWORDS, determineDisclaimerLevel, DISCLAIMER_LEVEL_LABELS, getDisclaimerText |
| src/lib/utils/publish-helpers.ts:273-277 | enforceEmail |
| supabase/migrations/011_seed_cta_templates.sql | cta_templates 시드 4건 |
| supabase/migrations/013_disclaimer_templates.sql | disclaimer_templates 테이블 + 시드 4건 |
| seed_data/cta_templates.json | CTA 초기 데이터(5키) |
| src/lib/constants/schedule-data.ts:55-83 | getPromptKey(이름 기반), getCtaKey |
| src/actions/briefing.ts:88-93, src/actions/file-upload.ts:96-101 | VALID_PRIMARY/SECONDARY_CATEGORIES |
| src/app/(dashboard)/contents/ai-editor/[id]/ai-editor-client.tsx:971-986 | 면책·CTA 런타임 적용 |
| src/lib/seo-calculator.ts:98-115, 261-271 | hasCta, 다이어리 CTA 부재 보너스 |
| docs/UPGRADE_SPEC.md §0(13-20), §5(308-402), §11(719-728) | 절대원칙, 카테고리/CTA 상수 기획, 통합 체크리스트 |
| skills/_DECISIONS.md 1·2·4·5·6절 | 네이버 categoryNo 정본, 신규 구조 운영 규칙, Notion DB(코드 아님 — 운영 결정) |
| src/app/(dashboard)/contents/[id]/publish/publish-prep-client.tsx:53-137 | FALLBACK_CTA, CTA_KEYWORD_MAP (신규 구조 CTA 선택에 재사용) |

## 3. 입력
- 카테고리(네이버 이름, categoryNo, 또는 CAT-* 별칭), 타깃 키워드, 제목, 본문(마크다운/텍스트), AI 생성 여부, 디딤 소식이면 사무소 소식 여부.
- 스크립트 `scripts/core_rules.py` 하위 명령별 JSON: category {key}, cta {category, target_keyword, title, office_news}, replace-names {body}, prompt-key {category|category_id}, field-cta {category_id, target_keyword}, disclaimer {category|category_id, body, is_ai_generated}, enforce-email {text}, check {text, category|category_id}, constants {}.

## 4. 처리 규칙
1. 카테고리 정본 = 네이버 실제 구조, ID = 네이버 categoryNo(_DECISIONS.md 1절): 신규 25 지원사업·인증과 특허, 27 출원·심판 실무, 26 사례, 24 지식재산 경영, 28 디딤 소식 / 유지 17 디딤 다이어리(18·19·20) / 고정 7 디딤 소개, 22 상담 안내 / 레거시 9 변리사의 현장 수첩(10·11·12·23), 13 IP 라운지(14·15·16). 코드의 CAT-* 는 별칭으로만 쓴다(9→CAT-A, 10→A-01, 11→A-02, 12→A-03, 23→A-04, 13→CAT-B, 14→B-01, 15→B-02, 16→B-03, 17→CAT-C, 18~20→C-01~03, 7→CAT-INTRO, 22→CAT-CONSULT). 레거시 → 신규 대응: 10·11·12→25, 23→27, 14·15→24, 16→28.
2. 코드 내부 카테고리 모순(사실 기록): CAT-A-04 는 seed.sql:4-7·categories.ts:43-47·briefing.ts:89-93·UPGRADE_SPEC.md:316 에 없고 sub-category-pool.ts:68-80·prompts.ts:27-31,1491·file-upload.ts:98·publish-prep-client.tsx:83-97 에 있다. CAT-B-01/02 는 seed.sql:9-10·prompts.ts:1492-1493 에서 B-01=AI와 IP, prompts.ts:32-41·sub-category-pool.ts:83-111 에서 B-01=특허 전략 노트. 별칭은 코드 런타임(FIELD_CTA) 기준을 쓰고 CAT-B-01/02 단독 입력은 이름 확인을 요구한다.
2-1. 신규 구조 프롬프트 키(_DECISIONS.md 2절): 25·27·26 → PROMPT_FIELD, 24 → PROMPT_LOUNGE_GENERAL, 28 → PROMPT_LOUNGE_BITE, 17 → PROMPT_DIARY. 사용자가 레거시 카테고리를 지정하면 그대로 따르고, 지정이 없으면 신규 구조를 쓴다.
2-2. 신규 구조 CTA(스킬 규칙, 문구는 기존 원문): 25 → CTA_KEYWORD_MAP(publish-prep-client.tsx:129-137) 중 절세·인증·연구소 정규식을 타깃 키워드→제목 순으로, 불일치 시 현장수첩_인증 / 27 → 현장수첩_출원 / 26 → 정규식 7개 전체, 불일치 시 현장수첩_출원 / 24 → seed_data "IP라운지" 이웃 추가 문구 / 28 → ━×18 + FIELD_CTA["CAT-B-03"] 문장 + 서명, 사무소 소식은 없음 / 17 없음 / 7·22 대상 아님. 한 글에 CTA 는 하나.
2-3. 신규 구조 면책 별칭: 25 → CTA 매칭 절세/인증/연구소면 CAT-A-01/02/03, 아니면 CAT-A; 27 → CAT-A-04; 26 → CAT-A; 24 → CAT-B; 28 → CAT-B-03; 17 → CAT-C.
3. 라벨: role_type(categories.ts:11-16), funnel_stage(19-24), status(27-32), cta_type(category-detail-card.tsx:25-29), 색상(categories.ts:2-8).
4. 프롬프트 키(prompts.ts:57-80): CAT-A/CAT-A-* → PROMPT_FIELD, CAT-B-03 → PROMPT_LOUNGE_BITE, CAT-B/CAT-B-* → PROMPT_LOUNGE_GENERAL, CAT-C/CAT-C-* → PROMPT_DIARY, 그 외 → PROMPT_LOUNGE_GENERAL.
5. 톤 규칙: PHASE2 의 `{{category_tone_rules}}` = CATEGORY_TONE_RULES[promptKey](prompts.ts:871-929, ai-editor-client.tsx:779), `{{common_writing_rules}}` = COMMON_WRITING_RULES(prompts.ts:299-312, ai-editor-client.tsx:780).
6. 생성용 CTA(getFieldCta, prompts.ts:88-119): FIELD_CTA[categoryId] 정확 일치 → 키워드 소문자 포함 검사(절세·세액공제·법인세·보상금→A-01 / 인증·벤처·이노비즈→A-02 / 연구소·연구활동·사후관리→A-03 / 출원·상표·특허출원·pct→A-04 / ai·인공지능·생성형→B-02) → CAT-A*→A-04, CAT-B*→B-01 → DEFAULT_CTA.
7. CTA 블록 조립(client-generate.ts:1563-1580): cta 없으면 "관련해서 궁금하신 점이 있다면 admin@didimip.com 으로 편하게 연락주세요.", 메일 제목 없으면 "상담 문의". 순서: (면책) → ━×18 → cta → 빈 줄 → 서명 → 📞 → 📧(메일 제목) → 빈 줄 → 태그 줄. PROMPT_DIARY 는 블록 전체 생략(1504-1507).
8. 런타임 CTA 소스: 초안 생성은 FIELD_CTA(ai-editor-client.tsx:977-986, actions/ai.ts:434-446, generation-runner.ts:183-195), 발행 화면은 DB cta_templates(011) + FALLBACK_CTA(publish-prep-client.tsx:53-126, 153-157). seed_data/cta_templates.json 과 UPGRADE_SPEC §5.2 는 코드에서 읽지 않는다(grep 결과 schedule-data.ts:72 주석뿐).
9. 면책 레벨(client-generate.ts:1631-1678): CAT-C* → none; CAT-A-01 또는 (LEVEL_A_KEYWORDS 포함 ∧ `/\d+[만백천]?\s*[억만원]/`) → A; CAT-B-03 → C; CAT-A*/CAT-B* → B; 그 외 → B. isAiGenerated=false 면 AI_NOTICE 줄과 뒤 빈 줄 제거(1653 등, 1695).
10. 명칭 치환(name-mappings.ts:37-62): 보호 패턴 5개를 순서대로 `__PROTECTED_NAME_i__` 토큰으로 바꾼 뒤 '특허청'→'지식재산처' 전역 치환, 토큰 복원(각 1회). cleanFinalText 첫 단계로 실행(client-generate.ts:1368).
11. 이메일 강제(publish-helpers.ts:273-277): `/[\w.-]+@[\w.-]+\.\w+/g` → admin@didimip.com.
12. 초안 검증(prompts.ts:1769-1807): LOUNGE_BITE 공백 제외 1,200자 초과 경고, DIARY 에 DIARY_CTA_KEYWORDS 포함 경고, admin@didimip.com 외 이메일 경고.
13. 광고 규정 표현: 결과 단정·절대적 약속·전제 없는 수치·"업계 최고/세계 1위" 금지, 허용 표현 4종(prompts.ts:993-1006, 1145-1150, 1693-1698). 썸네일에 결과 확정 표현 금지(prompts.ts:440).

## 5. 출력
- 조회: 카테고리·라벨 표, 상수 값.
- 문구: CTA·면책·서명 원문(코드 블록, 줄바꿈·구분선 보존).
- 검수: 위반 표(위치 | 원문 | 위반 규칙 | 수정안) + 건수.
- 스크립트: JSON(예: field-cta → {cta, emailSubject, _rule}, disclaimer → {level, label, text}, check → [{type, message}]).

## 6. 예외·오류 처리
- 카테고리 ID 가 표에 없으면 category 명령은 null → 이름으로 다시 묻는다.
- CAT-B-01/02 처럼 ID 만 주어지고 기준이 불명확하면 이름 확인을 요청한다.
- 빈 본문: disclaimer 는 카테고리만으로 판정, replace-names 는 빈 문자열 반환.
- enforce-email 입력이 비면 null(원본과 동일).
- 명칭 치환 후 조사 불일치("지식재산처은")는 자동 수정하지 않고 사람이 다듬는다(원본 동일).
- 스크립트 실행 불가 환경: references 규칙을 같은 순서로 수동 적용.

## 7. 데이터 저장
저장소 = Notion(_DECISIONS.md 4·6절, 2026-10-01 생성). 상세 속성·선택지는 skills/didim-blog-core/references/notion-storage.md (Notion 스키마 직접 조회 결과).
| 백오피스 테이블.컬럼 | 스킬에서의 대체 |
|---|---|
| categories.* | references/categories.md 정적 표(네이버 categoryNo 정본 + CAT 별칭) |
| cta_templates.* | references/cta-templates.md 원문. 설정 화면에서 바꾼 최신 문구는 사용자 입력으로 덮어씀 |
| disclaimer_templates.* | references/disclaimers.md (코드 하드코딩 문구 기준) |
| contents.title | "디딤 블로그 콘텐츠".제목 (title) |
| contents.status | 〃.상태 (select: S0 기획중 / S1 초안완료 / S2 검토완료 / S3 발행예정 / S4 발행완료 / S5 성과측정) |
| contents.category_id | 〃.카테고리 (select: 지원사업·인증과 특허 / 출원·심판 실무 / 사례 / 지식재산 경영 / 디딤 소식 / 디딤 다이어리 / 레거시) + categoryNo (number) |
| contents.secondary_category | 〃.레거시 2차 분류 (select: 레거시·다이어리 2차 이름 10개) |
| contents.target_keyword | 〃.타깃 키워드 (text) |
| contents.body, tags, is_ai_generated | DB 속성 없음 → 페이지 본문(초안, 태그 줄, "AI 도움" 한 줄) 또는 사용자 입력 |
| consultations(리드) | "디딤 블로그 상담" (회사명, 상담일, 유입 경로, 경유 글, 관심 서비스, 상태, 계약 여부, 계약 금액, 메모) |
위치: 상위 페이지 "DIDIM 블로그 운영", 콘텐츠 DB data source collection://463bc815-11ab-4290-9d86-22bd1aa9cfed, 상담 DB collection://e1272822-7efd-4850-b8c8-cfce02db7d00. 커넥터가 없으면 표로 출력해 붙여넣기 요청. 이 스킬은 쓰기를 직접 하지 않고 기록 규칙만 제공한다.

## 8. 원본 코드와 달라진 점
1. **카테고리 ID 체계 교체**: 코드의 CAT-* 대신 네이버 categoryNo 를 정본 ID 로 쓴다(_DECISIONS.md 1절, 코드 내부 모순 — CAT-A-04 누락, CAT-B-01/02 뒤바뀜 — 때문). CAT-* 는 레거시 코드 규칙(면책·포맷 가이드·태그 접미사·FIELD_CTA)을 계산할 때만 별칭으로 쓴다. CAT-A-04 '특허·상표 출원 실무'는 categoryNo 23(레거시)으로 실재하며 신규 '출원·심판 실무'(27)가 흡수.
2. **신규 카테고리 구조 추가**(25/27/26/24/28): 코드에 없는 운영 결정이다. 프롬프트 키·CTA 정책은 _DECISIONS.md 2절을 따르고, 세부 선택 규칙(25 키워드 불일치 시 '인증 진단' 기본, 26 불일치 시 '출원', 28 가벼운 CTA 문구 조합, 면책 별칭)은 스킬이 정했다(확인 필요). CAT-B-01/02 별칭은 코드 런타임(FIELD_CTA·sub-category-pool) 기준이며 DB 시드와 반대(**확인 필요**: 백오피스 DB 에 저장된 콘텐츠의 secondary_category 실제 값).
3. CTA 문구가 4개 소스에서 다르다(FIELD_CTA / migration 011=FALLBACK / seed_data JSON / UPGRADE_SPEC §5.2). 스킬은 모두 원문으로 싣는다. 백오피스는 생성 단계(FIELD_CTA 블록을 본문에 부착)와 발행 단계(011+FALLBACK 카드)가 서로 다른 CTA 를 써 한 글에 두 개가 생길 수 있었으나, 스킬은 카테고리별 CTA 하나만 쓴다(신규 구조). seed_data JSON 의 'IP라운지' 이웃 추가 문구는 런타임 미사용이었지만 지식재산 경영(24) CTA 로 채택했다(_DECISIONS '이웃 추가 CTA'). 그 안의 '매주 화요일'은 현재 발행 요일과 맞는지 확인 필요. 연구소 메일 제목 태그가 "연구소 관리"/"연구소 진단"/"연구소 점검"으로 갈린다.
4. disclaimer_templates 테이블(013)은 코드에서 조회되지 않는다. 스킬은 코드 하드코딩 문구(AI 고지 포함)를 쓴다. 013 의 B/C 키워드 판정은 코드에 구현되지 않았다.
5. 검수 절차에 광고 규정 체크리스트를 Claude 가 직접 적용하도록 했다(원본은 LLM 교차검증 프롬프트 항목). 다른 LLM 교차검증은 "가능하면 서브에이전트/별도 패스로 독립 검토"로 대체(didim-blog-factcheck 소관).
6. UPGRADE_SPEC §0-5(Vercel 프리셋), §0-6(LLM 기본값 claude-sonnet-4-6)은 스킬 환경과 무관하여 적용 대상에서 제외했다.
7. core_rules.py 의 category·cta 명령·append_cta_block 은 스킬 추가 기능이며 원본 단일 함수와 1:1 대응하지 않는다(cta 는 FALLBACK_CTA·CTA_KEYWORD_MAP 원문을 재사용).
8. 저장소: 백오피스 Supabase 대신 Notion DB 2개(콘텐츠·상담). 별도 성과 DB 없음(_DECISIONS.md 4절). 콘텐츠 DB 에는 본문·태그·AI 생성 여부 속성이 없어 페이지 본문으로 대체.

## 9. 다른 스킬과의 연결
| 스킬 | 관계 |
|---|---|
| didim-blog-planner | 카테고리 정본(categoryNo)·신규 구조 목적·4주 로테이션 대상 카테고리를 받아 주제 추천·주간 기획 |
| didim-blog-writer | 톤 규칙, COMMON_WRITING_RULES, FIELD_CTA·서명 블록, 면책, 명칭 치환, 초안 검증을 받음 |
| didim-blog-infographic | 첫 이미지 브랜드 라인·금지 표현(광고 규정) |
| didim-blog-factcheck | 광고규정·기관명 검증 항목, name-mappings |
| didim-blog-seo | 다이어리 CTA 부재 보너스, 카테고리별 루브릭 키 |
| didim-blog-publish-prep | 발행 화면 CTA 매칭·면책·이메일 강제 문구 원문 |
| didim-blog-ops / health / performance | 카테고리 매핑(레거시→신규 합산), Notion DB 속성·선택지(notion-storage.md) |
