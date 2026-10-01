# didim-blog-core — 브랜드·카테고리·CTA·면책·명칭·광고 규정 공통 기반

## 1. 기능 개요
특허그룹 디딤 네이버 블로그 운영에 공통으로 쓰이는 상수와 규칙(1차/2차 카테고리와 ID, 카테고리별 역할·퍼널·CTA 유형·프롬프트 키, 글쓰기·톤 규칙, CTA 문구와 선택 로직, 면책조항 레벨과 문구, 폐지 기관명 치환, 디딤 연락처·서명·변리사 프로필, 절대원칙, 변리사 광고 규정 표현 규칙)을 코드에서 원문 그대로 옮겨 제공한다. 다른 didim-blog-* 스킬이 이 규칙을 근거로 기획·작성·검수·발행 준비를 한다. 결정적 로직(명칭 치환, 프롬프트 키, 생성용 CTA 선택, 면책 레벨, 이메일 강제, 초안 검증)은 Python 으로 포팅했다.

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

## 3. 입력
- 카테고리 이름 또는 ID(1차/2차), 타깃 키워드, 본문(마크다운/텍스트), AI 생성 여부.
- 스크립트 `scripts/core_rules.py` 하위 명령별 JSON: replace-names {body}, prompt-key {category_id}, field-cta {category_id, target_keyword}, disclaimer {category_id, body, is_ai_generated}, enforce-email {text}, check {text, category_id}, category {key}, constants {}.

## 4. 처리 규칙
1. 카테고리 정본: seed.sql 15행 + CAT-A-04(특허·상표 출원 실무). 이름은 네이버 표기와 100% 일치(UPGRADE_SPEC.md:17). CAT-A-04 는 seed.sql:4-7·categories.ts:43-47·briefing.ts:89-93·UPGRADE_SPEC.md:316 에 없고 sub-category-pool.ts:68-80·prompts.ts:27-31,1491·file-upload.ts:98·publish-prep-client.tsx:83-97 에 있다. 실제 네이버 카테고리에 존재하므로 정식 2차로 취급한다(사용자 확인 사항).
2. CAT-B-01/02 이름 충돌: seed.sql:9-10·prompts.ts:1492-1493 는 B-01=AI와 IP, B-02=특허 전략 노트 / prompts.ts:32-41·sub-category-pool.ts:83-111 은 반대. 스킬은 이름 기준으로 판단하고 ID 표기는 코드 런타임(FIELD_CTA) 기준을 쓴다.
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
| 백오피스 테이블.컬럼 | 스킬에서의 대체 |
|---|---|
| categories.* | references/categories.md 정적 표(변경 시 스킬 갱신) |
| cta_templates.key/category_name/text/note/conversion_method/email_subject_tag | references/cta-templates.md 원문. 설정 화면에서 바꾼 최신 문구는 사용자 입력으로 덮어씀 |
| disclaimer_templates.* | references/disclaimers.md (코드 하드코딩 문구 기준) |
| contents.category_id | Notion "디딤 블로그 콘텐츠".카테고리(1차) — 선택: 변리사의 현장 수첩 / IP 라운지 / 디딤 다이어리 / 디딤 소개 / 상담 안내 |
| contents.secondary_category | 〃.2차 분류 — 선택: 2차 10개 이름 |
| contents.target_keyword | 〃.타깃 키워드 |
| contents.is_ai_generated | 〃.AI 생성 여부(체크박스) |
| contents.body | 〃.본문(페이지 본문 또는 텍스트) |
이 스킬은 자체적으로 쓰기를 하지 않는다(읽기·판정만).

## 8. 원본 코드와 달라진 점
1. CAT-A-04 를 정식 2차 카테고리로 정본 표에 넣었다. 근거: 네이버 실재(사용자 확인) + 코드 런타임(FIELD_CTA, sub-category-pool, 브리핑 프롬프트, FALLBACK_CTA)이 사용. DB 시드·briefing.ts 검증 목록·UPGRADE_SPEC §5.1 에는 없음(코드 내부 모순). CAT-A-04 의 funnel_stage 는 어디에도 정의되지 않아 비워 두었다.
2. CAT-B-01/02 의 ID↔이름 충돌을 해소하지 않고 "이름 우선" 규칙으로 처리했다. 정본 표의 ID 는 코드 런타임(FIELD_CTA·sub-category-pool) 기준이며 DB 시드와 반대다(**확인 필요**: 실제 DB 에 저장된 콘텐츠의 secondary_category 값).
3. CTA 문구가 4개 소스에서 다르다(FIELD_CTA / migration 011=FALLBACK / seed_data JSON / UPGRADE_SPEC §5.2). 스킬은 모두 원문으로 싣고, 단계별로 런타임 소스(생성=FIELD_CTA, 발행=011+FALLBACK)를 쓴다. 연구소 메일 제목 태그가 "연구소 관리"/"연구소 진단"/"연구소 점검"으로 갈린다.
4. disclaimer_templates 테이블(013)은 코드에서 조회되지 않는다. 스킬은 코드 하드코딩 문구(AI 고지 포함)를 쓴다. 013 의 B/C 키워드 판정은 코드에 구현되지 않았다.
5. 검수 절차에 광고 규정 체크리스트를 Claude 가 직접 적용하도록 했다(원본은 LLM 교차검증 프롬프트 항목). 다른 LLM 교차검증은 "가능하면 서브에이전트/별도 패스로 독립 검토"로 대체(didim-blog-factcheck 소관).
6. UPGRADE_SPEC §0-5(Vercel 프리셋), §0-6(LLM 기본값 claude-sonnet-4-6)은 스킬 환경과 무관하여 적용 대상에서 제외했다.
7. core_rules.py 의 category 명령·append_cta_block 은 조회 편의 기능(스킬 추가)이며 원본 단일 함수와 1:1 대응하지 않는다.

## 9. 다른 스킬과의 연결
| 스킬 | 관계 |
|---|---|
| didim-blog-planner | 카테고리 정본·역할·퍼널·CAT-A-04 를 받아 주제 추천·주간 기획 |
| didim-blog-writer | 톤 규칙, COMMON_WRITING_RULES, FIELD_CTA·서명 블록, 면책, 명칭 치환, 초안 검증을 받음 |
| didim-blog-infographic | 첫 이미지 브랜드 라인·금지 표현(광고 규정) |
| didim-blog-factcheck | 광고규정·기관명 검증 항목, name-mappings |
| didim-blog-seo | 다이어리 CTA 부재 보너스, 카테고리별 루브릭 키 |
| didim-blog-publish-prep | 발행 화면 CTA 매칭·면책·이메일 강제 문구 원문 |
| didim-blog-ops / health / performance | 카테고리 ID·이름 매핑 |
