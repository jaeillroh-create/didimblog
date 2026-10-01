# didim-blog-writer — 블로그 초안 생성 (3-Phase 파이프라인 · 브리핑 입력 · 자동 마무리·검증)

> skills/_DECISIONS.md(2026-10-01)를 반영함: 카테고리 정본 = 네이버 categoryNo, 신규 구조 우선, 저장소 = Notion "디딤 블로그 콘텐츠".

## 1. 기능 개요 (한 문단)
주제·카테고리·핵심 키워드(또는 주제 한 줄/자료 파일로 만든 브리핑)를 받아 디딤 네이버 블로그 초안을 만든다. 백오피스 AI 에디터와 같은 순서로 Phase 1(구조 설계 JSON 아웃라인) → Phase 2(카테고리 톤 + 공통 글쓰기 규칙으로 본문 작성, 끊기면 이어쓰기) → Phase 2.5(인포그래픽 — didim-blog-infographic 위임) → 교차검증(didim-blog-factcheck 위임) → Phase 3(현장수첩·IP 라운지·IP 뉴스 한 입은 SEO 정량 수정 + 광고규정 검수, 다이어리는 에세이 편집) → 자동 마무리(짧은 결과 폴백, 이미지 마커 복원, 불확실성 표기·기관명 정리, 면책 문구, CTA·서명·태그 줄, 자동 태그 10개, 문단 ID 제거, 상태 S1, 발행예정일 다음 화요일) → 품질 검증을 수행한다. LLM 호출은 Claude가 원문 프롬프트를 직접 따르는 절차로, 결정적 로직은 Python 포팅 스크립트로 대체한다.

## 2. 원본 코드 위치 (파일:함수/상수 목록)
| 파일 | 함수/상수 |
|---|---|
| src/app/(dashboard)/contents/ai-editor/[id]/ai-editor-client.tsx | `startClientGeneration`(:700-887), `runPhase3`(:894-1074), `doSave`/`handleSave`(:1260-1302), `TARGET_RANGE_BY_PROMPT`(:96-104), `extractImageMarkers`(:501-538), `DraftQualityPanel` 호출(:1880-1884) |
| src/lib/client-generate.ts | `streamClaude`(:31-103), `replaceTemplate`(:595-601), `parsePhase1Json`(:556-593), `clientRunPhase1`(:614-679), `clientRunPhase2`(:689-809), `findOverlap`(:815-821), `clientRunPhase25`(:846-898, 연결만), `clientRunPhase3`(:1092-1136), `DEFAULT_TAGS_BY_CATEGORY`(:1320-1349), `cleanFinalText`(:1367-1405), `appendCtaAndSignature`(:1496-1583), `DISCLAIMER_TEMPLATES`·`determineDisclaimerLevel`·`getDisclaimerText`(:1587-1697), `generateAutoTags`·`getCategorySuffixes`(:1711-1790) |
| src/lib/constants/prompts.ts | `PromptKey`(:3-7), `FIELD_CTA`·`DEFAULT_CTA`(:11-53), `getPromptKey`(:57-80), `getFieldCta`(:88-119), `COMMON_*_RULES`·`CONTENT_TYPE_RULES`·`COMMON_WRITING_RULES`(:123-312), `VISUAL_RULES_FIELD/LOUNGE/DIARY`(:444-473), `ALT_TEXT_RULES`(:475-483), `PROMPT_FIELD`(:487-575), `PROMPT_LOUNGE_GENERAL`(:577-675), `PROMPT_LOUNGE_BITE`(:677-762), `PROMPT_DIARY`(:764-857), `CATEGORY_TONE_RULES`(:871-929), `PHASE1_PROMPT`(:937-962), `PHASE2_PROMPT`(:976-1009), `PHASE3_PROMPT`(:1119-1160), `PHASE3_PROMPT_DIARY`(:1166-1191), `PHASE3_PROMPT_BY_KEY`(:1197-1202), `PHASE_MAX_TOKENS`(:1208-1212), `LEGACY_PROMPT_*`·`SYSTEM_PROMPTS`(:1217-1229), `USER_PROMPTS`(:1233-1468), `PROMPT_BRIEFING_GENERATE`(:1472-1499), `PROMPT_BRIEFING_FROM_FILE`(:1501-1529), `validateGeneratedDraft`(:1762-1807) |
| src/lib/generation-runner.ts | `replaceTemplateVariables`(:19-28), `runGeneration`(:127-314) — LEGACY |
| src/actions/ai.ts | `generateDraft`(:324-388), `executeGeneration`(:395-400), `getGenerationPrompt`(:405-471), `saveGenerationResult`(:476-528), `savePhase1Output`/`savePhase2Output`(:555-597), `getGenerationMeta`(:603-629), `getCategoryName`(:634-649), `saveAiDraftToContent`(:710-810), `getGenerationStatus`(:815-853), `regenerateDraft`(:1098-1160) |
| src/lib/draft-validator.ts | `validateDraft`(:11-176), `calcDraftScore`(:178-189) |
| src/lib/utils/paragraph-ids.ts | `hasParagraphIds`, `injectParagraphIds`, `stripParagraphIds`, `extractParagraphMap`, `findParagraphIdForText`, `getParagraphById`, `replaceParagraphById`(:1-153) |
| src/lib/constants/name-mappings.ts | `DEPRECATED_NAMES`, `replaceDeprecatedNames`(:1-62) |
| src/actions/briefing.ts | `parseJsonResponse`(:75-86), `VALID_*_CATEGORIES`(:88-93), `generateBriefing`(:97-166) |
| src/actions/file-upload.ts | `parseJsonResponse`(:69-94), `VALID_*_CATEGORIES`(:96-101), `extractTextFromFile`(:103-124), `analyzeFileForBriefing`(:145-272), `buildBriefingFromParsed`(:274-299) |
| src/components/contents/ai-draft-dialog.tsx | `applyBriefingToManual`(:324-346), `handleFileSelect`(:349-372), `handleSubmit`(:442-466) |
| src/components/contents/content-form.tsx | AI 자동작성 `generateDraft` 호출(:106-114) |
| supabase/seed.sql | categories 이름(:3-16) |
| supabase/migrations/009_phase_pipeline.sql | `ai_generations.phase1_output/phase2_output/phase` |

## 3. 입력
| 입력 | 필수 | 출처(원본) | 스킬에서 |
|---|---|---|---|
| topic | ✓ | `ai_generations.topic` | 사용자 입력 또는 브리핑 |
| category_id | ✓ | `ai_generations.category_id` (다이얼로그: 2차 우선 / 콘텐츠 폼: 1차만) | 발행 카테고리 — 네이버 categoryNo 또는 이름(_DECISIONS.md 1절). 지정 없으면 신규 구조, 레거시 지정 시 그대로. CAT-*도 받음 |
| 사건 메모 | 사례(26)만 필수 | (원본에 없음) | 사용자가 직접 준 익명화 사건 기록 |
| news_kind | 디딤 소식(28)만 | (원본에 없음) | ip(IP 뉴스 한 입) / office(사무소 소식, CTA 없음) |
| target_keyword | ✓(다이어리 선택) | `ai_generations.target_keyword` | 사용자 입력 |
| additional_context | 선택 | `ai_generations.additional_context` (3-Phase에서는 미사용) | Phase 1·2에 덧붙임(8절) |
| 브리핑 입력: 주제 한 줄 | 선택 | `generateBriefing({topic, categoryId?})` | `render --phase briefing` |
| 브리핑 입력: 파일 | 선택 | PDF·DOCX·TXT·JPG·PNG, 10MB 이하 (`ai-draft-dialog.tsx:351-369`) | 같은 제한, Claude가 직접 읽음 |
| 기존 초안(Phase 3·검증만) | 선택 | 에디터 본문 | 사용자 붙여넣기 / Notion |

## 4. 처리 규칙
1. **실행 경로**: 현재 런타임은 3-Phase 경로다. 생성 레코드 상태가 `pending`이면 에디터가 `startClientGeneration`을 한 번만 자동 실행한다(ai-editor-client.tsx:693-698). LEGACY 단일 프롬프트(`SYSTEM_PROMPTS`+`USER_PROMPTS`, DB `prompt_templates` 우선)는 `runGeneration`/`executeGeneration`/`getGenerationPrompt`에만 있고 셋 다 호출처가 없다(src 전체 grep; `src/app/api`에는 `llm-config`만 존재, ai.ts:391-393 주석의 `/api/generate`는 없음).
2. **프롬프트 키**: `getPromptKey(categoryId)` — CAT-A·CAT-A-* → PROMPT_FIELD, CAT-B-03 → PROMPT_LOUNGE_BITE, CAT-B·CAT-B-* → PROMPT_LOUNGE_GENERAL, CAT-C·CAT-C-* → PROMPT_DIARY, 기타 → PROMPT_LOUNGE_GENERAL (prompts.ts:57-80). 에디터는 저장된 `category_id`로 다시 계산한다(ai-editor-client.tsx:736, :907).
3. **카테고리명**: `getCategoryName(category_id)` = DB `categories.name` (ai.ts:634-649). 2차 ID가 저장돼 있으면 2차 이름이 `{{category_name}}`에 들어간다.
4. **Phase 1**: user = `PHASE1_PROMPT`에 `category_name/topic/target_keyword` 치환, system = JSON 전용 문장, max_tokens 2000, temperature 0.4 (client-generate.ts:621-642). 파싱은 펜스 추출 → 첫 `{`~마지막 `}` → `title` 문자열 필수 → 실패 시 괄호 개수 보정 재파싱(:556-593). 실패하면 system을 강화해 1회 재시도, 다시 실패하면 에러(:658-678). 아웃라인은 `phase1_output`에 저장, `phase`='phase2'(ai.ts:555-573).
5. **Phase 2**: user = `PHASE2_PROMPT`에 `category_tone_rules = CATEGORY_TONE_RULES[key]`, `common_writing_rules = COMMON_WRITING_RULES`, `visual_rules = ""`, `phase1_output = JSON.stringify(outline, null, 2)` 치환(client-generate.ts:700-706, ai-editor-client.tsx:776-782). max_tokens 8000, temperature 0.7(:726-727).
6. **이어쓰기**: 종료 사유가 `length`(Claude `max_tokens`)면 최대 2회 — 아웃라인 + 누적 본문 마지막 200자를 넣은 이어쓰기 프롬프트로 재호출, 앞부분 중복(누적 끝 최대 80자와 이어쓰기 앞 160자의 최대 겹침이 15자 초과)을 잘라 붙인다(:738-797, :815-821). 끝으로 ```markdown 펜스를 벗기고 비면 실패(:799-804).
7. **Phase 2 저장 → 문단 ID**: Phase 2 본문 저장(`phase`='phase3') 후 문단 ID가 없으면 `injectParagraphIds`(ai-editor-client.tsx:797-803). 문단 분할은 `\n\n+`, 각 문단 trim, `━━`/`---`로 시작하는 블록은 ID 없음(paragraph-ids.ts:23-43).
8. **Phase 2.5 연결**: 문단 ID 본문·카테고리명·키워드·`FIRST_IMAGE_RULES`로 `clientRunPhase25` 호출, 성공하면 `insertInfographicMarkers`로 삽입·재저장, 실패는 안내만 하고 진행(ai-editor-client.tsx:811-840). 다이어리 판정은 `categoryName.includes("다이어리")`(client-generate.ts:857).
9. **Phase 2 완료 처리**: 제목 = Phase 1 `title`(:849), `saveGenerationResult`로 status `completed`(:853-859), 문단 ID 본문으로 교차검증 모달 자동 오픈(:871-875). Phase 3는 사용자 버튼으로만 실행.
10. **Phase 3**: 입력 = `stripParagraphIds(editText)`(:912), 프롬프트 = `PHASE3_PROMPT_BY_KEY[key]`(다이어리만 `PHASE3_PROMPT_DIARY`, prompts.ts:1197-1202), 치환 `target_keyword/category_name/phase2_output`, system = SEO 편집자 문장, max_tokens 8000, temperature 0.4(client-generate.ts:1100-1123), 펜스 제거·빈 응답 실패(:1126-1131).
11. **Phase 3 폴백**: 결과 공백 제외 200자 미만이면 Phase 2 본문 사용(ai-editor-client.tsx:934-940).
12. **마커 복원**: 입력의 `━━ 📷 이미지…━━…━━━━━━━━━━━━━━` 블록 수보다 결과가 적으면, 뒤에서부터 블록 앞 30자가 없는 것을 `(i+1)/(n+1)` 위치 다음 빈 줄에 재삽입(끝 100자 이내면 맨 끝)(:914-969).
13. **면책 레벨**: CAT-C* → none; CAT-A-01 또는 (A 키워드 포함 ∧ `\d+[만백천]?\s*[억만원]`) → A; CAT-B-03 → C; 나머지 → B. AI 생성이면 AI 고지 문구 포함(client-generate.ts:1631-1678).
14. **CTA 매칭**: `getFieldCta(categoryId, keyword)` — 2차 정확 매칭 → 키워드(절세/세액공제/법인세/보상금 → A-01, 인증/벤처/이노비즈 → A-02, 연구소/연구활동/사후관리 → A-03, 출원/상표/특허출원/pct → A-04, ai/인공지능/생성형 → B-02) → 1차 폴백(CAT-A → A-04, CAT-B → B-01) → 범용(prompts.ts:88-119).
15. **appendCtaAndSignature**: 다이어리는 `cleanFinalText`만 적용하고 반환. 그 외 본문이 공백 제외 50자 미만이면 그대로 반환. `cleanFinalText`(기관명 치환 → `(확인 필요)` 붙은 조특법·시행령·시행규칙·별지 서식 번호 일반화 → 단독 `(확인 필요)/(미확인)/(확정 아님)` 삭제 → 공백·빈 줄 정리) 후 `[TAGS]` 블록 추출, 태그 = 키워드 → LLM 태그 → 카테고리 기본 → 브랜드 순 중복 제거 10개(브랜드 2개 보장), 면책 + 구분선 + CTA + 서명(02-571-6613, admin@didimip.com, 메일 제목) + 태그 줄 append(client-generate.ts:1496-1583, :1367-1405).
16. **자동 태그(에디터 태그 필드)**: 다이어리 → 브랜드 2개만. 그 외 키워드 공백 제거 → 마지막 두 단어 결합/전체 결합 → 키워드+카테고리 접미사(5개까지) → Phase 1 `keyword_plan.positions` 콜론 뒤(8개까지) → 카테고리 기본(8개까지) → 브랜드, 2자 미만 제외, 최대 10개(:1711-1790).
17. **마무리 저장**: `saveGenerationResult`(본문·태그), 이어서 `saveAiDraftToContent`(문단 ID 제거 본문, 태그, 키워드 → `contents` status `S1`, `draft_done_at`, `is_ai_generated`), `seo_score` = 에디터 간이 SEO 점수, `publish_date` = 다음 화요일(ai-editor-client.tsx:1006-1059, ai.ts:710-810).
18. **품질 체크**: `validateDraft` 15개(+CTA·서명 2개, categoryId가 CAT-C로 시작하지 않을 때) 규칙, 점수 = 통과/전체×100 반올림(draft-validator.ts). 에디터는 categoryId `""`로 호출(:1295, :1883). 저장 시 미통과 3개 이상이면 확인 다이얼로그, 본문 공백 제외 200자 미만이면 저장 중단(:1266-1274, :1294-1302).
19. **생성 후 경고**: `validateGeneratedDraft` — BITE 1,200자(공백 제외) 초과, 다이어리 CTA 키워드 7종, admin@didimip.com 외 이메일(prompts.ts:1769-1807). `getGenerationStatus`에서만 호출되며 그 함수는 호출처가 없다.
20. **브리핑(주제)**: system = `PROMPT_BRIEFING_GENERATE`(+카테고리 지정 문장), user = `주제: {topic}`, max_tokens 1024, temperature 0.7, 펜스 제거 후 JSON 파싱 실패 시 "브리핑 생성에 실패했습니다. 직접 입력해주세요."(briefing.ts:114-138). 1차 유효값 외 → CAT-A, 2차 유효 목록 외 → ""(:150-159).
21. **브리핑(파일)**: TXT는 UTF-8 디코드, DOCX는 mammoth 원문 추출, 비면 "파일에서 텍스트를 추출할 수 없습니다."; 8,000자 초과 시 앞 8,000자 + "(파일이 길어 앞부분만 포함되었습니다)"; PDF·이미지는 Claude provider일 때만 비전 입력(document/image 블록 + 고정 지시문), max_tokens 4096(file-upload.ts:167-272).
22. **브리핑 → 초안 입력**: topic·keyword 복사, targetAudience 비움, 카테고리 = 1차 매칭 시 1차 + 2차, `additional_context` = `[에피소드]\n…` + `\n\n` + `[참고사항]\n…`(ai-draft-dialog.tsx:324-346). 제출 시 `categoryId: secondaryCategory || categoryId`(:450).
23. **LEGACY(미사용) 규칙**: 변수 `topic, keyword, target_audience="", additional_context, subcategory="", cta_text/email_subject(PROMPT_FIELD일 때 getFieldCta(categoryId))`, max_tokens 3000, temperature 0.5, 제목 = 첫 비어있지 않은 줄(50자 컷), `[TAGS]` 또는 `#태그` 10개, `[ALT_TEXTS]`, `[IMAGE: …]` 단일 행 마커 추출(generation-runner.ts:183-275).

24. **[결정 반영] 카테고리 해석**(skills/_DECISIONS.md 1·2절, `scripts/categories.py`): 정본 ID = 네이버 categoryNo. 25 지원사업·인증과 특허·27 출원·심판 실무·26 사례 → PROMPT_FIELD, 24 지식재산 경영 → PROMPT_LOUNGE_GENERAL, 28 디딤 소식 → PROMPT_LOUNGE_BITE, 17(18·19·20) 디딤 다이어리 → PROMPT_DIARY, 레거시 9~16·23 → 원래 매핑, 7·22 고정 페이지는 생성 거부. 원본 함수(면책·태그 접미사·validateDraft)에는 별칭 CAT-*를 넘긴다(25·27·26 → CAT-A, 24 → CAT-B, 28 → CAT-B-03, 17 → CAT-C). CAT-* 직접 입력은 원본 코드 동작 그대로.
25. **[결정 반영] CTA**: 25 = 키워드 매칭(절세·세액공제·법인세·보상금 → 절세 시뮬레이션, 연구소·연구활동·사후관리 → 연구소 관리, 그 외 인증 진단), 27 = 출원 CTA(FIELD_CTA CAT-A-04), 26 = getFieldCta("CAT-A", 키워드), 24 = 이웃 추가 문구(USER_PROMPTS.PROMPT_LOUNGE_GENERAL 원문), 28 = FIELD_CTA CAT-B-03(사무소 소식은 없음), 다이어리 없음. 레거시 14 특허 전략 노트·15 AI와 IP는 이름 의미대로 각각 포트폴리오·AI CTA.
26. **[결정 반영] 카테고리명 치환**: 프롬프트 원문은 보존하고, 신규 구조 발행 시 렌더링 결과에서 자기 카테고리 정체성 문구만 치환 — FIELD: `"변리사의 현장 수첩" 카테고리`, `변리사의 현장 수첩 — `; LOUNGE_GENERAL: `"IP 라운지" 카테고리`, `IP 라운지 — `; BITE: `"IP 라운지" 카테고리`, `IP 뉴스 한 입 — `(→ `디딤 소식(IP 뉴스 한 입) — `). `{{category_name}}`은 발행 이름. 레거시 지정 시 치환 없음.
27. **[결정 반영] 사례(26)**: 사건 메모(`--context-file`) 없으면 `render`가 거부하고 메모를 요청한다.
28. **[결정 반영] 다이어리 Phase 2.5 생략**: prompt_key가 PROMPT_DIARY(17·18·19·20)면 인포그래픽 단계를 건너뛴다(인포그래픽 v2 규칙과 일치, 카테고리 정본 기준 판정).
29. **[결정 반영] 브리핑 매핑**: 브리핑 프롬프트 원문은 유지, 2차 유효 목록은 file-upload.ts 목록(CAT-A-04 포함)으로 통일, 결과 CAT-*를 신규 categoryNo로 매핑(A·A-01~03 → 25, A-04 → 27, B·B-01·B-02 → 24, B-03 → 28, C-01 → 26, C-02 → 19, C-03 → 20, C → 17). 사용자 지정 카테고리가 우선.
30. **[결정 반영] 사무소 소식·다이어리 마무리**: CTA·서명·태그 줄·면책 없이 `cleanFinalText`만 적용, 검증 시 CTA·서명 검사 제외 + 다이어리 CTA 키워드 검사. 신규 구조에서는 기본 태그 "IP라운지"를 발행 카테고리명(공백 제거)으로 교체.

## 5. 출력
- 제목(Phase 1 `title`), 최종 본문(`body_for_save`: 문단 ID 제거, 다이어리 외 면책·CTA·서명·태그 줄 포함), 에디터 태그 10개, 면책 레벨, CTA, 발행예정일(다음 화요일), 상태 S1.
- 검증 결과: validateDraft 항목·점수·미통과 목록, validateGeneratedDraft 경고, 마무리 경고(폴백·마커 복원·짧은 본문).
- 중간 산출물: `outline.json`(Phase 1), `phase2.md`, `phase2_ids.md`(문단 ID), `phase3.md`, Phase 3 수정 내역(`edit_notes`).

## 6. 예외·오류 처리
| 상황 | 원본 처리 | 스킬 처리 |
|---|---|---|
| Phase 1 JSON 파싱 실패 | 강화 system으로 1회 재시도 후 에러, 생성 `failed` | `phase1-retry` 1회 후 중단·원문 제시 |
| Phase 2 출력 한도 끊김 | 이어쓰기 최대 2회 | 동일(`render --phase continuation` + `merge-continuation`) |
| Phase 2/3 빈 응답 | "Phase 2(3) 응답이 비어있습니다." | 동일 문구로 중단 |
| Phase 2.5 실패 | 안내 후 계속 | 인포그래픽 스킬 없음/실패 시 안내 후 계속 |
| Phase 3 결과 200자 미만 | Phase 2 본문으로 폴백 + 토스트 | `finalize` 경고 |
| Phase 3 마커 손실 | 균등 위치 재삽입 + 토스트 | `finalize` 경고 |
| 마무리 저장 일부 실패 | "자동 처리 일부 실패: …" | Notion 저장 실패 시 본문을 채팅으로 전달 |
| 본문 200자 미만 저장 | 저장 중단 | 저장하지 않음 |
| 품질 미통과 3개 이상 | 확인 다이얼로그 | 사용자 확인 |
| 브리핑 파싱 실패 | "브리핑 생성에 실패했습니다. 직접 입력해주세요." / "파일 분석 결과를 파싱할 수 없습니다…" | 같은 안내 후 직접 입력 |
| 지원하지 않는 파일 | "PDF, DOCX, TXT, JPG, PNG만 지원합니다." / "10MB 이하 파일만 업로드 가능합니다." | 동일 |
| LLM 설정·API 키 없음, 토큰 한도 | 설정 안내 | 해당 없음(Claude 직접 수행) |

## 7. 데이터 저장
저장 위치: Notion 비공개 페이지 "DIDIM 블로그 운영" 아래 **"디딤 블로그 콘텐츠"** DB — data source `collection://463bc815-11ab-4290-9d86-22bd1aa9cfed` (2026-10-01 fetch로 스키마 확인). 다른 워크스페이스면 이름으로 찾고, 없으면 DB를 만들지 않고 표로 출력해 붙여넣기를 요청한다.

| 백오피스 테이블.컬럼 | Notion 열 (타입) | 스킬이 쓰는 값 |
|---|---|---|
| contents.title | 제목 (title) | Phase 1 제목 |
| contents.status | 상태 (select: S0 기획중 / S1 초안완료 / S2 검토완료 / S3 발행예정 / S4 발행완료 / S5 성과측정) | "S1 초안완료" (정확한 값 우선, 없으면 'S1' 접두사 선택지로 폴백, 새 선택지 생성 금지) |
| contents.category_id | 카테고리 (select: 지원사업·인증과 특허 / 출원·심판 실무 / 사례 / 지식재산 경영 / 디딤 소식 / 디딤 다이어리 / 레거시) | 신규 이름, 레거시면 "레거시" |
| (2차 분류) | 2차 분류 (select: 절세 시뮬레이션 … 대표의 생각) | 레거시 2차·다이어리 하위(18~20) 이름 |
| (신규) | categoryNo (number) | 네이버 categoryNo |
| contents.target_keyword | 타깃 키워드 (text) | 핵심 키워드 |
| contents.publish_date | 발행예정일 (date) | 다음 화요일(`publish_date`) |
| (실제 발행) | 발행일 (date) | 비워 둠 — 실제 발행 후에만 기록 |
| (신규) | 발행 URL (url) | 비워 둠 |
| (추천 출처) | 추천 소스 (select: 키워드 풀 / 뉴스 / 지원매치 리포트 / 로테이션 / 직접 입력) | planner가 준 값, 없으면 직접 입력 |
| (신규) | 시리즈 (text) / 시리즈 회차 (number) | 연재일 때 |
| contents.updated_at | 마지막 업데이트일 (date) | 오늘 |
| contents.tags, seo/면책/검증 | 메모 (text) | `면책 레벨 · 품질 점수 · 태그 · 수정 내역 요약` |
| contents.body | 페이지 본문 | 최종 본문 마크다운 |
| contents.draft_done_at, is_ai_generated, ai_generations.* | 없음 | 저장하지 않음 (Phase 1 아웃라인 등 중간 산출물은 작업 폴더) |

## 8. 원본 코드와 달라진 점
1. **LLM 호출 → Claude 직접 수행**: Claude/OpenAI/Gemini 스트리밍 호출(`streamLLM`)과 LLM 설정·API 키·토큰 사용량 기록을 없앴다. Claude가 `render`로 조립한 system+user 원문을 따라 응답을 작성한다. max_tokens·temperature는 참고값으로만 남는다(스킬 환경에서 제어 불가). 이어쓰기는 "출력이 끊겼을 때" Claude가 판단해 수행한다.
2. **additional_context를 Phase 1·2에 덧붙임**: 원본 3-Phase는 `additional_context`(브리핑 에피소드·참고사항 포함)를 저장·조회만 하고 프롬프트에 넣지 않는다(ai-editor-client.tsx:733-737 — topic·category_id·target_keyword만 사용). 사용자 제공 사례 없이 쓰면 사례를 지어낼 위험이 커서, 스킬은 `--context-file`로 user 메시지 끝에 `[참고 사항 — 사용자 제공 자료 …]` 블록을 붙인다. 타깃 고객도 여기에 합친다.
3. **Phase 3 `<!-- 수정: … -->` 주석 분리**: 원본은 PHASE3 지시대로 남긴 수정 주석을 제거하지 않고 본문에 저장한다(cleanFinalText·stripParagraphIds 모두 미제거; 발행 준비에서의 처리 여부는 확인 필요). 스킬은 `finalize`에서 `edit_notes`로 분리한다(`--keep-edit-comments`로 원본 동작 재현).
4. **발행예정일 날짜 계산**: 원본은 `getNextTuesday().toISOString().slice(0,10)`(UTC 변환)이라 KST 오전 9시 이전에는 하루 앞 날짜(월요일)가 될 수 있다. 스킬은 로컬 날짜 기준 다음 화요일.
5. **검증 시 실제 카테고리 전달·문단 ID 제거 후 검사**: 원본 에디터는 `validateDraft(…, "")`로 다이어리에도 CTA·서명 검사를 적용하고, 문단 ID가 섞인 본문을 검사한다. 스킬은 실제 category_id와 문단 ID 제거본으로 검사한다(원본 재현은 `--category-id ""`).
6. **validateGeneratedDraft 실행**: 원본에서는 호출처가 없지만 UPGRADE_SPEC §3.2가 요구하는 경고이므로 스킬은 7·10단계에서 실행한다.
7. **IP 뉴스 한 입 Phase 3 분량**: PHASE3_PROMPT 8번(1,500-2,500자)이 BITE에도 공유되어 1,200자 규칙과 충돌한다. 스킬은 BITE에서 이 항목을 분량 확대 근거로 쓰지 않도록 지시한다(프롬프트 원문은 그대로).
8. **볼드 개수 목표 3개**: 카테고리 프롬프트(5개 이하)·PHASE3(3개 이하)·validateDraft(3개 이상) 충돌을 동시에 만족하는 값으로 안내.
9. **교차검증 다른 LLM → 별도 스킬**: GPT/Gemini 교차검증은 didim-blog-factcheck로 넘기며, 그 스킬이 "가능하면 서브에이전트/별도 패스로 독립 검토"로 대체한다.
10. **DB 프롬프트 템플릿 미사용**: LEGACY 경로의 `prompt_templates`(DB 우선) 대신 상수만 쓴다. LEGACY 모드는 사용자가 명시 요청할 때만.
11. **문단 ID `hasParagraphIds`**: 원본은 전역 정규식 `lastIndex` 잔존으로 연속 호출 시 오판할 수 있으나 포팅본은 상태가 없다.
12. **카테고리명 CAT-A-04**: seed.sql에 없어 원본 `getCategoryName`은 ""를 반환할 것으로 보이나(DB에 수동 추가 여부 확인 필요), 스킬은 prompts.ts 표기 "특허·상표 출원 실무"를 쓴다.
13. **JS 호환**: 글자 수·위치는 JS와 같은 UTF-16 코드 유닛, `\s`·`\d`·`\w`는 JS 집합으로 계산한다(차이 없음을 확인).

14. **[결정 사항 반영] 카테고리 구조 교체** (skills/_DECISIONS.md, 2026-10-01): 원본의 CAT-* 카테고리·getPromptKey 대신 네이버 categoryNo 정본 + 신규 구조(4절 24~30). 원본 getPromptKey·getFieldCta는 CAT-* 입력용으로 그대로 보존(43건 검증 유지).
15. **[결정 사항 반영] 프롬프트 속 카테고리명 치환**: 원문 상수는 바꾸지 않고 렌더링 결과에서만 치환(4절 26).
16. **[결정 사항 반영] 사례 메모 필수, 사무소 소식 CTA 없음, 다이어리 Phase 2.5 생략**(원본은 다이어리에도 인포그래픽 3개 설계·이름 문자열로 판정).
17. **[결정 사항 반영] 브리핑의 CAT-A-04 누락 재현 폐기**: 원본 briefing.ts는 CAT-A-04를 2차 유효 목록에서 빠뜨려 빈 값으로 바꾸지만, 스킬은 재현하지 않고 신규 구조로 매핑한다(4절 29).
18. **[결정 사항 반영] 저장소**: contents 테이블 → Notion "디딤 블로그 콘텐츠"(7절). AI 생성 여부·초안 완료일 등은 저장하지 않음.
19. **레거시 14·15의 CTA**: 코드 CAT-B-01/02 뒤바뀜 대신 이름 의미대로 고정(특허 전략 노트 = 포트폴리오 CTA, AI와 IP = AI CTA).
20. **25 지원사업·인증과 특허 CTA 기본값 = 인증 진단**: 키워드 미매칭 시 인증 진단 CTA (코디네이터 확정, 2026-10-01).

원본에 그대로 둔 코드 내부 모순(스킬도 원문 유지, 확인 필요)
- `PHASE2_PROMPT`에 `{{visual_rules}}` 자리가 없음(주석·호출부는 전달).
- `PHASE1_PROMPT` 주석의 `infographic_plan`·1500토큰 vs 실제 프롬프트·2000토큰. 이어쓰기 프롬프트도 존재하지 않는 `infographic_plan`을 참조.
- `PHASE_MAX_TOKENS`(1500/4000/5000)는 선언만 되고 미사용.
- 훅 패턴: COMMON_HOOK_RULES A~F vs PHASE1 hook_type A~E(E 의미 다름).
- FIELD_CTA 주석의 CAT-B-01/02 명칭이 seed.sql과 반대.
- briefing.ts 2차 유효 목록에 CAT-A-04 없음(file-upload.ts에는 있음) — 스킬은 재현하지 않음(8절 17).
- 다이어리에도 Phase 2.5가 인포그래픽 3개를 설계(VISUAL_RULES_DIARY는 분위기 사진 1~2장)하며, 2차 분류명이 저장되면 다이어리 판정이 실패한다 — 스킬은 Phase 2.5 생략(8절 16).
- LEGACY 추출 코드의 `[TAGS]`/`[ALT_TEXTS]` vs USER_PROMPTS의 `태그:`/`[BODY_HASHTAGS]`/`[NAVER_TAGS]` 형식 불일치.
- getPromptKey 폴백: UPGRADE_SPEC §5.3은 PROMPT_FIELD, 코드는 PROMPT_LOUNGE_GENERAL(코드를 따름).

## 9. 다른 스킬과의 연결
| 방향 | 스킬 | 주고받는 것 |
|---|---|---|
| 기반 | didim-blog-core | 브랜드·카테고리·CTA·절대원칙·명칭 매핑·광고 규정·면책 정책 |
| 받음 | didim-blog-planner | 추천 주제·4주 로테이션·지원매치 리포트·뉴스 → topic/categoryNo/keyword/참고 사항/추천 소스 (브리핑 양식 공유) |
| 넘김 → 받음 | didim-blog-infographic | Phase 2.5: 문단 ID 본문·발행 카테고리명·categoryNo·키워드 → 이미지 마커 삽입 본문 (다이어리는 넘기지 않음) |
| 넘김 → 받음 | didim-blog-factcheck | Phase 2(+2.5) 직후: 문단 ID 본문 → 사용자가 고른 수정 반영 본문 |
| 넘김 | didim-blog-seo | 최종 제목·본문·키워드·카테고리 → SEO 점수 |
| 넘김 | didim-blog-publish-prep | 최종 본문·태그 → 네이버 붙여넣기용 텍스트·태그·ALT·체크리스트 |
| 넘김 | didim-blog-ops | Notion 상태 "S1 초안완료"·발행예정일 열 → 검수·상태 전이·캘린더 |
| 참고 | didim-blog-health | 기존 글과 중복 회피·내부 링크([내부링크] 마커) 후보 |
