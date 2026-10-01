# didim-blog-factcheck — 팩트체크·교차검증

## 1. 기능 개요
Phase 2 초안(또는 사용자가 준 글)의 사실 정확성과 논리 일관성을 검증하고, 지적 사항을 본문에 정밀하게 반영한다. 검증 프롬프트(PROMPT_CROSS_VALIDATION)는 법률 조문·서식 번호, 숫자 4단계 트랙(추출 → Known Facts 대조 → 내부 일관성 → 계산 정합성 → 표현 완화), 과도한 단정, 출처, 논리 연결, 광고규정, 기관명 현행화를 본다. 원본은 초안을 쓰지 않은 외부 LLM 여러 개에 동시에 보내고, 결과를 같은 original_text 기준으로 묶어 중복 지적 시 심각도를 올린다. 사용자는 묶음마다 반영/무시를 고르고, 반영은 단순 치환(숫자·법률·기관명 등) 또는 문단 재작성(심각/주의·논리·단정·출처·광고규정) 경로로 처리된다. 모든 묶음을 처리해야 Phase 3 로 넘어간다.

## 2. 원본 코드 위치
| 파일 | 함수/상수 |
|---|---|
| src/lib/constants/prompts.ts | PROMPT_FACT_CHECK (L1533), PROMPT_FACT_CHECK_QUICK (L1581), PROMPT_CROSS_VALIDATION (L1625-1743) |
| src/lib/constants/legal-facts.ts | LegalFact, LEGAL_FACTS (L21), LEGAL_FACTS_META (L138), filterRelevantFacts (L147), formatFactsForPrompt (L158) |
| src/lib/client-generate.ts | FactCheckIssue/Result (L279-301), parseFactCheckJson (L303), clientFactCheck (L356), clientCrossValidate (L428), clientRewriteWithFeedback (L473), SEVERITY_KO_TO_EN (L1145), normalizeCrossValidationIssue (L1166), parseCrossValidationJson (L1179), clientCrossValidateV2 (L1243), clientRewriteParagraph (L1422) |
| src/components/contents/cross-llm-validation-panel.tsx | SEVERITY_STYLES (L70), normalizeCategoryDisplay (L80), upgradeSeverity (L107), needsParagraphRewrite (L146), findParagraphContaining (L175), normalizeKey (L211), groupRows (L217), otherProviderConfigs (L277), handleApplyGroup (L397), handleRewriteParagraph (L439), handleConfirmParagraph (L473), handleUndoGroup (L515) |
| src/app/(dashboard)/contents/ai-editor/[id]/ai-editor-client.tsx | fuzzyApplyFix (L137), normalizeParagraph/tokenizeParagraph/fuzzyApplyParagraph (L324-483), 문단 ID 주입 (L871), applyFixToBody (L1081), applyParagraphToBody (L1113), undoParagraphInBody (L1151), undoFixInBody (L1169), 패널 연결 (L1998-2016) |
| src/lib/utils/paragraph-ids.ts | hasParagraphIds, injectParagraphIds, stripParagraphIds, extractParagraphMap, findParagraphIdForText, getParagraphById |
| src/components/contents/fact-check-panel.tsx, cross-validation-panel.tsx, src/actions/ai.ts requestCrossValidation | 레거시(현재 화면에서 import 되지 않음) |
| 열린 PR #89 (브랜치 claude/validate-numeric-fields-BlLho, 커밋 2627f20) | PROMPT_CROSS_VALIDATION 에 "기준 시점(오늘 날짜/올해)" 블록, clientCrossValidateV2 에 {{current_year}}/{{current_date}} 치환 — main 미반영 |

## 3. 입력
- 본문(Phase 2 결과, 문단 ID 주입본), 제목
- legal_references: Phase 1 outline 의 법령 목록(없으면 빈 배열)
- category_name(카테고리명), target_keyword(핵심 키워드)
- 원본: 교차검증용 LLM 설정(베이스 provider 제외, provider 별 기본 모델 1개). 스킬: 독립 검토 패스 수(기본 2)
- 오늘 날짜(스킬: Asia/Seoul)
- 사용자 선택: 그룹별 반영/무시/되돌리기, 문단 재작성 미리보기 승인

## 4. 처리 규칙
1. 교차검증용 LLM 은 베이스(초안) provider 를 제외하고 provider 당 1개(기본 모델 우선)를 고른다. 0개면 "다른 LLM을 최소 1개 이상 등록" 안내와 "교차검증 건너뛰고 Phase 3 진행" 버튼만 보인다 (cross-llm-validation-panel.tsx:277-296, 557-602).
2. 패널이 열리면 한 번만 자동으로 검증을 시작한다 (L338-344).
3. 프롬프트 조립: `{{legal_references}}` = `- 항목` 줄 join 또는 "(Phase 1 에서 legal_references 가 추출되지 않음)", `{{legal_facts}}` = filterRelevantFacts → formatFactsForPrompt, `{{category_name}}`, `{{target_keyword}}`, `{{phase2_output}}` 순으로 split/join 전체 치환 (client-generate.ts:1246-1260). system 메시지는 "JSON 출력 전용 팩트체커" 고정문, maxTokens 4096, temperature 0.3 (L1264-1279).
4. Known Facts 필터: 본문 소문자에 팩트 keywords 중 하나라도 포함되면 주입, 없으면 "(관련 고정 사실 없음)". 한 줄 형식 `- {description}: **{value}** ({source}, {effectiveDate})` (legal-facts.ts:147-166).
5. 응답 파싱: 코드펜스 제거 → 첫 `{`~마지막 `}` → JSON.parse, 실패 시 괄호 개수 맞춰 보정 후 재시도, 그래도 실패면 "응답 JSON 파싱 실패" (client-generate.ts:1179-1206, 1283-1291).
6. 정규화: severity 심각/주의/경미 → high/medium/low(없거나 모르면 medium), problem → description, suggested_text → replacement_text, location 없으면 original_text 앞 20자, category 없으면 "기타". verdict 는 점수로 추론: ≥80 pass, ≥60 fix_required, 그 외 major_issues (L1145-1224).
7. 병합: 성공한 결과의 issue 를 평탄화 → original_text 를 `\s+`→공백, trim, 앞 60자, 소문자로 만든 키로 묶음(없으면 `noref-{provider}:{idx}`) → 대표는 severity weight 최고 행 → 행이 2개 이상이면 severity 1단계 상향(⬆) (cross-llm-validation-panel.tsx:211-243, 107-111).
8. 카운트는 pending 그룹만 effectiveSeverity 로 센다. 모든 그룹이 applied/ignored 이거나 지적이 0건일 때만 "Phase 3 진행" 활성 (L373-391, 732-751).
9. 카테고리 표시: 숫자팩트·숫자일관·숫자 → "숫자 오류", 숫자완화 → "표현 완화", 법률팩트·광고규정·기관명 → 그대로(고유 색), 그 외 → category 원문 (L80-105).
10. 재작성 판정(needsParagraphRewrite, primary issue 의 원래 severity 기준): 숫자팩트/숫자일관/숫자완화/숫자/법률팩트/기관명 → 단순 치환; severity high·medium → 재작성; category 에 논리·단정·출처·광고규정 포함 → 재작성; |len(repl)−len(orig)|/len(orig) ≥ 0.5 → 재작성; 그 외 단순 치환 (L146-168).
11. 단순 치환(fuzzyApplyFix): original/replacement 에서 `<!--\s*p:\d+\s*-->\n?` 제거(가짜 문단 ID 대응) → exact(첫 출현 replace) → 문단 ID 가 있으면 findParagraphIdForText 로 문단을 찾아 문단 안 exact/공백 유연 교체 후 `body.slice(0,pIdx)+newP+body.slice(pIdx+len)` → 공백 유연 정규식(5자↑) → 마크다운 기호 제거 매칭 후 원본 인덱스 역매핑 slice 교체(5자↑) → 앞 20자(8자↑) + 첫 문장 종결자까지(최대 원문×1.8+80자) 교체 → 실패 (ai-editor-client.tsx:137-292).
12. 호출 측: matched 인데 본문이 그대로면 실패 처리. exact 외 모드는 "본문을 확인해주세요" 안내 (L1081-1105). 실패 시 문단 ID 주입 후 1회 재시도 → 그래도 실패면 원문/교체안을 클립보드로 주고 수동 수정 안내 (cross-llm-validation-panel.tsx:397-430).
13. 문단 재작성: findParagraphContaining(문단 ID 제거 → `\n\n+` 분할 문단 중 exact → 공백 정규화 5자↑ → 앞 20자 8자↑) → 베이스 LLM 에 clientRewriteParagraph(카테고리 톤 + 원문단 + 원문/수정/이유, maxTokens 1500, temperature 0.5) → 미리보기 → [적용] 시 fuzzyApplyParagraph (L439-470; client-generate.ts:1422-1482).
14. fuzzyApplyParagraph: 문단 ID 제거·trim → exact → paragraph-id → normalized(마크다운·━·공백 정규화 후 문단 동일, 5자↑) → sentence(첫·마지막 문장 모두 포함) → first-sentence → similarity(2자↑ 토큰 Jaccard ≥ 0.7) → 실패 시 재작성 문단·원문단을 클립보드로 (ai-editor-client.tsx:357-483, 1113-1145).
15. 되돌리기: 단순 치환은 replacement→original 로 fuzzyApplyFix, 문단은 rewritten→original 로 fuzzyApplyParagraph (L1151-1183; panel L515-547).
16. 문단 ID: Phase 2 완료 시 본문에 ID 가 없으면 injectParagraphIds(기존 ID 제거 후 1부터, ━━·--- 시작 문단 제외) 후 검증 모달을 연다. Phase 3·저장·인포그래픽 설계 전에는 stripParagraphIds(ID 제거, 3줄 이상 개행 → 2줄, trim) (ai-editor-client.tsx:871, 912, 1263, 1771; paragraph-ids.ts).
17. (레거시) clientFactCheck: system=PROMPT_FACT_CHECK(_QUICK), user=`제목: …\n\n본문:\n…`; 파싱 후 issues/strengths/fact_check_items 기본값, original_text 없으면 location 을 포함한 첫 줄 trim, replacement_text 없으면 suggestion (client-generate.ts:356-404).
18. (PR #89) 프롬프트 상단 "## 기준 시점"(오늘 날짜·올해), 법률 팩트의 시행일·개정·일몰 규정을 올해 기준으로 확인, 숫자 정확성에 연도 표기·유효기간·조문 번호 현행 검증 추가. 치환값 currentYear = `getFullYear()`, currentDate = `toISOString().slice(0,10)`.

## 5. 출력
- 검증 패스별: overall_score, verdict, issues[{category, severity, location, description, suggestion, original_text?, replacement_text?}] (성공/실패, 실패 시 error)
- 병합 그룹 목록: effectiveSeverity(⬆ 여부), 표시 라벨, 지적 패스, 단순 치환/문단 재작성, 처리 상태
- 요약 카운트: 심각/주의/경미(대기 기준), 반영/무시/대기
- 반영된 최종 본문(문단 ID 제거) 및 모드별 안내(근사 반영 시 확인 요청), 매칭 실패 시 수동 수정용 원문/수정안
- (스킬) `notion_record`: 콘텐츠 DB `교차검증`·`교차검증일` 값, 남은 심각 수, 페이지 `## 검수 기록` 에 붙일 마크다운

## 6. 예외·오류 처리
- 교차검증 LLM 0개 → 안내 + 건너뛰기 (원본). 스킬: 서브에이전트 없으면 별도 검증 패스로 대체.
- 패스별 실패(네트워크·파싱)는 그 패스만 실패로 표시, 나머지 결과로 진행. 전체 실패 시 toast 오류.
- 원문/교체문 누락 그룹은 반영 불가 "수동 확인 필요" (panel L398-401).
- 매칭 실패: 클립보드 폴백 + 수동 수정 안내. matched 이지만 본문 불변 → 실패.
- 문단 재작성 결과가 비면 "재작성 결과가 비어있습니다" (client-generate.ts:1476-1478).
- 되돌리기 시 교체된 문장을 못 찾으면 "수동 편집됨?" 안내.

## 7. 데이터 저장
원본 V2 교차검증 결과는 DB 에 저장되지 않는다(패널 React 상태로만 존재). 레거시 requestCrossValidation 만 ai_generations(generation_type="cross_validation").validation_results 에 저장했다.
스킬은 _DECISIONS.md §6·§7(Notion 확장)에 따라 Notion **"디딤 블로그 콘텐츠"** `collection://463bc815-11ab-4290-9d86-22bd1aa9cfed` 의 전용 열과 페이지 본문에 기록한다. **`메모` 열은 쓰지 않는다**(사람이 쓰는 자유 기록 전용).

| 백오피스 | 스킬에서의 대체 |
|---|---|
| ai_generations.phase1_output.legal_references | 사용자 입력 또는 didim-blog-writer 의 Phase 1 결과 |
| ai_generations.phase2_output / 편집 본문(editText) | 사용자가 붙여넣은 본문, 또는 콘텐츠 DB 해당 글 페이지 본문 `## 본문` 섹션 |
| llm_configs (교차검증 LLM) | 없음 — 독립 검토 패스(서브에이전트) |
| 패널 groupStatus(반영/무시) | 대화 내 상태 → merge_issues.py `status` 입력 |
| validation_results(검증 결과) / content-detail 의 "교차검증 완료(권장)" 체크 | **`교차검증`** select: `미실시`(성공한 검토 패스 없음) / `통과`(반영 후 남은 심각 이슈 0건) / `심각 이슈 남음`. merge_issues.py `notion_record.properties` |
| (없음 — 검증 시각) | **`교차검증일`** date(KST 판정일) |
| (검증 요약·이슈 목록) | 페이지 본문 **`## 검수 기록`** 섹션 끝에 `notion_record.review_log_md` 추가: `### 교차검증 YYYY-MM-DD — 판정`, 검토 패스·점수, 반영/무시/대기 수, 남은 심각 이슈 원문·문제, 반영 항목 |
| 반영된 최종 본문 | 사용자 확인 후 페이지 `## 본문` 갱신(문단 ID 제거본) |

통과 판정 규칙: 남은 심각 이슈 = 병합 그룹 중 표시 심각도(effectiveSeverity, 2개 이상 패스 중복 시 ⬆ 상향 포함)가 `high`(심각)이고 상태가 `applied`(반영)가 아닌 것(대기·무시). 0건이면 통과, 1건 이상이면 심각 이슈 남음. 주의·경미만 남은 경우는 통과. QUICK 모드(단일 패스 팩트체크) 결과로는 `교차검증` 을 바꾸지 않는다.

(_DECISIONS.md §7: `교차검증` 은 factcheck 가 쓰고 didim-blog-ops 가 S1→S2 전이의 권장 조건으로 읽는다.)

## 8. 원본 코드와 달라진 점
1. **기준 시점 검증 포함** — main 에는 없고 열린 PR #89(open, 커밋 2627f20)에만 있는 "오늘 날짜/올해 기준" 규칙을 스킬 템플릿에 넣었다(_DECISIONS.md §5). PR 은 숫자 4단계 트랙(a53ac08) 이전 main 에서 갈라져 `2. 숫자 정확성` 문맥이 충돌하므로, main 원문에 PR 의 ① 기준 시점 블록 ② 법률 팩트 시행일·일몰 문구 ③ 연도·유효기간·조문 번호 검증 4줄을 얹고, PR 의 "우회 표현" 문장은 main Step 2(교정, 완화 X)와 충돌해 제외했다. 원문·diff·병합본을 references/prompts.md 에 나란히 둔다.
2. **날짜 기준** — PR 은 `toISOString()`(UTC)이라 한국 시간 00~09시에는 전날이 들어간다. 스킬은 Asia/Seoul 오늘 날짜를 쓴다.
3. **다른 LLM 교차검증 → 독립 검토 패스** — GPT/Gemini 호출 대신 같은 렌더 프롬프트를 서브에이전트 2개(없으면 별도 패스)로 실행한다. 행이 2개 이상이면 severity 상향하는 병합 규칙은 그대로 적용하므로, 패스 간 독립성이 원본보다 약할 수 있다.
4. **문단 재작성 LLM** — 원본은 베이스(초안) LLM 이 재작성. 스킬은 Claude 가 같은 규칙으로 직접 다듬는다.
5. **ID 주입 후 재시도** — 원본 handleApplyGroup/handleConfirmParagraph 는 실패 시 onEnsureParagraphIds() 후 재시도하지만, setEditText 가 비동기라 재시도가 같은(오래된) editText 로 실행된다(React stale closure) — 사실상 재시도 효과 없음(확인 필요). apply_fix.py 는 기본값을 원본 실제 동작(재시도 없음)으로 두고, `--retry-with-ids` 로 의도된 동작을 선택할 수 있게 했다.
6. **hasParagraphIds 상태 버그 미재현** — 원본은 전역(/g) 정규식에 `.test()` 를 써서 호출할 때마다 lastIndex 가 남아 같은 본문에도 true/false 가 번갈아 나온다(node 로 확인: `[true,false,true,false]`). 그 결과 fuzzyApplyFix 의 문단 ID 단계가 간헐적으로 건너뛰어진다. 포팅은 상태 없이 판정한다.
7. **문자열 길이 단위** — JS 는 UTF-16 코드 유닛, Python 은 코드 포인트. 이모지(📷 등)가 포함된 original_text 의 앞 20자·1.8배 한도·앞 60자 그룹 키가 몇 글자 다를 수 있다. 판정 길이(5자/8자/50% 비율)는 UTF-16 기준으로 맞췄다.
8. **결과 기록(결정 사항 7절 반영)** — 원본 V2 는 저장하지 않음. 스킬은 콘텐츠 DB `교차검증`(미실시/통과/심각 이슈 남음)·`교차검증일` 열에 쓰고 요약은 페이지 본문 `## 검수 기록` 섹션에 붙인다. 이전에 쓰던 `메모` 열 한 줄 기록은 중지(메모는 사람 전용). 통과 기준은 원본에 없는 스킬 규칙: 반영 후 남은 심각(표시 심각도 high, ⬆ 포함) 그룹 0건 — 원본 "교차검증 완료(권장)" 체크가 쓰던 high 개수(validation_results)에 사용자 반영 여부를 더한 것(merge_issues.py `notion_record`).
9. **콘텐츠 상세의 "교차검증 완료(권장)" 체크는 현재 동작하지 않는 것으로 보임(확인 필요)** — content-detail 은 contents.ai_generation_id 행의 validation_results 를 읽는데(page.tsx:48-59), V2 는 저장하지 않고 레거시 requestCrossValidation 은 별도 행(cross_validation)에 저장하며 그 패널도 import 되지 않는다. 스킬은 이 체크를 Notion `교차검증` 열(8번 규칙)로 대신하고 critical_count_raw 는 검수 기록에 참고로 남긴다.
10. **Known Facts 기준일** — LEGAL_FACTS_META.last_updated 2026-01-15. 오늘(2026-10-01) 기준 개정 여부는 코드로 보장되지 않으므로, 스킬은 표와 다르다는 이유만으로 단정하지 말고 사용자 확인을 받도록 했다.
11. PROMPT_FACT_CHECK/_QUICK, clientFactCheck, clientCrossValidate, clientRewriteWithFeedback, FactCheckPanel 은 현재 UI 에서 호출되지 않는다(정의만 존재). 스킬은 QUICK 모드로만 활용한다.

## 9. 다른 스킬과의 연결
- 받는 쪽: **didim-blog-writer** — Phase 2 본문(페이지 `## 본문`), Phase 1 outline(legal_references, category_name), 핵심 키워드, CATEGORY_TONE_RULES(문단 재작성 톤). **didim-blog-core** — 광고 규정·명칭 매핑(특허청→지식재산처)·카테고리·Notion 저장소 규칙. **didim-blog-planner** — 뉴스·공고 기반 글의 원문 링크(콘텐츠 DB `근거 URL`).
- 넘기는 쪽: **didim-blog-writer** Phase 3(SEO 다듬기)로 수정된 본문(문단 ID 제거). **didim-blog-seo** 로 점검 대상 본문. **didim-blog-ops** — 콘텐츠 DB `교차검증`(통과 여부 = S1→S2 권장 조건)·`교차검증일`, 페이지 `## 검수 기록`. **didim-blog-infographic** 은 교정된 수치를 기준으로 설계해야 하므로 반영 후 본문을 넘긴다. **didim-blog-health** 는 `교차검증일` 을 재점검 판단에 참고할 수 있다.
