# 초안 생성 런타임 흐름 (코드 추적)

원본 코드에서 실제로 실행되는 경로와 호출 파라미터를 그대로 옮긴 문서. 프롬프트 원문은 `phase-prompts.md`, 후처리는 `finalization.md`.

## 목차
1. 실행 경로 판별 — Phase 경로 vs LEGACY 단일 프롬프트
2. 진입점: 생성 요청 레코드(generateDraft)
3. 에디터 파이프라인(startClientGeneration) 원문
4. Phase별 호출 파라미터 표
5. 템플릿 변수 치환 규칙
6. 프롬프트 키 매핑 · 카테고리명
7. CTA 매칭(getFieldCta)
8. 분량 · max tokens 규칙
9. Phase 2 이어쓰기(끊김 복구)
10. Phase 3 실행(runPhase3) 원문

---

## 1. 실행 경로 판별

| 경로 | 구성 | 호출하는 곳 | 판정 |
|---|---|---|---|
| **3-Phase 경로** | Phase 1(JSON 아웃라인) → Phase 2(본문) → Phase 2.5(인포그래픽) → 교차검증 모달 → Phase 3(SEO/다이어리 편집) → 자동 마무리 | `ai-editor-client.tsx` `startClientGeneration`(생성 상태 `pending` 감지 시 자동 실행, :693-698) + `runPhase3`(사용자가 "SEO 최적화 (Phase 3)" 버튼 클릭) | **현재 실제 사용** |
| LEGACY 단일 프롬프트 | `SYSTEM_PROMPTS[promptKey]`(= PROMPT_FIELD 등 4종) + `USER_PROMPTS[promptKey]`를 한 번에 호출. DB `prompt_templates`(draft_generation)가 있으면 그것을 우선 | `generation-runner.ts runGeneration` ← `actions/ai.ts executeGeneration` / `actions/ai.ts getGenerationPrompt` | **미사용(데드 코드)** — `executeGeneration`, `getGenerationPrompt`, `runGeneration`, `clientGenerateDraft` 모두 호출처 없음(전체 src grep). `/api/generate` 라우트도 없음(`src/app/api`에는 `llm-config`만 존재) |
| 생성 후 자동 검증 `validateGeneratedDraft` | 분량(BITE 1,200자)·다이어리 CTA 키워드·이메일 | `actions/ai.ts getGenerationStatus`(:831-838) | **미사용** — `getGenerationStatus` 호출처 없음 |
| 품질 체크 `validateDraft` | 15~17개 규칙 | 에디터 `DraftQualityPanel`(categoryId `""`), 저장 버튼 `handleSave`(categoryId `""`) | 사용 중 |

근거: `prompts.ts:859-863` 주석("기존 PROMPT_FIELD/LOUNGE_*/DIARY 는 LEGACY_ alias 로 보존 … 새 코드는 PHASE1/PHASE2/PHASE3 를 사용"), `prompts.ts:1214-1216`.

## 2. 진입점: 생성 요청 레코드

- 수동 입력 다이얼로그(`ai-draft-dialog.tsx:442-466`): `categoryId: secondaryCategory || categoryId` → 2차 분류가 있으면 2차 ID가 `ai_generations.category_id`에 저장된다.
- 콘텐츠 생성 폼(`content-form.tsx:106-114`): `categoryId`(1차)와 `subCategoryId`(2차)를 따로 넘기지만, `generateDraft`는 `category_id: input.categoryId`(1차)만 저장한다. `subCategoryId`는 promptKey 계산에만 쓰이고 버려지며, 에디터는 저장된 `category_id`로 promptKey를 다시 계산한다.
- `targetAudience`는 `ai_generations`에 컬럼이 없어 저장되지 않는다.
- `additional_context`는 저장되지만 3-Phase 경로의 어느 프롬프트에도 들어가지 않는다(`getGenerationMeta`가 읽기만 하고 `startClientGeneration`은 topic·category_id·target_keyword만 사용).

````ts
// src/actions/ai.ts:321-388
/**
 * AI 초안 생성
 */
export async function generateDraft(
  input: GenerateDraftInput
): Promise<GenerateDraftResult> {
  try {
    const supabase = await createClient();

    // 1. LLM 설정 조회
    const llmConfig = await getActiveLLMConfig(supabase, input.llmConfigId);
    if (!llmConfig) {
      return { success: false, error: "활성화된 LLM 설정이 없습니다. 설정 > AI 설정에서 LLM을 등록해주세요." };
    }

    if (!llmConfig.api_key_encrypted) {
      return { success: false, error: "API 키가 설정되지 않았습니다." };
    }

    // 월간 토큰 상한 체크
    if (
      llmConfig.monthly_token_limit &&
      llmConfig.monthly_tokens_used >= llmConfig.monthly_token_limit
    ) {
      return { success: false, error: "월간 토큰 사용 한도를 초과했습니다." };
    }

    // 2. 프롬프트 키 결정 (category + subCategory → 4개 분기)
    const effectiveCategoryId = input.subCategoryId || input.categoryId;
    const promptKey = getPromptKey(effectiveCategoryId);

    // DB 프롬프트 템플릿도 함께 조회 (있으면 우선, 없으면 상수 폴백)
    const template = await getPromptTemplate(
      supabase,
      effectiveCategoryId,
      "draft_generation"
    );

    // 3. ai_generations 레코드 생성 (pending)
    const { data: generation, error: insertError } = await supabase
      .from("ai_generations")
      .insert({
        content_id: input.contentId || null,
        generation_type: "draft",
        topic: input.topic,
        category_id: input.categoryId,
        target_keyword: input.keyword,
        additional_context: input.additionalContext || null,
        prompt_template_id: template?.id || null,
        llm_provider: llmConfig.provider,
        llm_model: llmConfig.model_id,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !generation) {
      return { success: false, error: `생성 레코드 저장 실패: ${insertError?.message}` };
    }

    const generationId = generation.id;

    return { success: true, generationId, promptKey };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "알 수 없는 오류";
    return { success: false, error: errorMessage };
  }
}
````

## 3. 에디터 파이프라인 원문 (Phase 1 → 2 → 2.5 → 교차검증 대기)

````ts
// src/app/(dashboard)/contents/ai-editor/[id]/ai-editor-client.tsx:729-876
      // 생성 메타 (topic, category_id, target_keyword) 조회
      const meta = await getGenerationMeta(genId);
      if (!meta.success || !meta.data) throw new Error(meta.error || "생성 메타 조회 실패");

      const topic = meta.data.topic ?? "";
      const categoryId = meta.data.category_id ?? "";
      const targetKeyword = meta.data.target_keyword ?? "";
      const promptKey = getPromptKey(categoryId);
      const categoryName = await getCategoryName(categoryId);

      if (targetKeyword && isMounted.current) {
        setKeyword(targetKeyword);
      }
      if (isMounted.current) {
        setPipelineCategoryName(categoryName);
        setPipelinePromptKey(promptKey);
      }

      // ── Phase 1: 구조 설계 ──
      console.log("[Phase 1] 시작 — provider:", provider, "model:", model);
      if (isMounted.current) setStreamingText("📋 구조 설계 중...");
      const phase1Result = await clientRunPhase1({
        llm,
        phase1Prompt: PHASE1_PROMPT,
        categoryName,
        topic,
        targetKeyword,
      });

      if (!phase1Result.success || !phase1Result.outline) {
        throw new Error(phase1Result.error || "Phase 1 실패");
      }

      console.log("[Phase 1] 완료 — 제목:", phase1Result.outline.title);
      await savePhase1Output(genId, phase1Result.outline);
      if (isMounted.current) {
        setPhase1Outline(phase1Result.outline);
        setPipelinePhase("phase2");
      }

      // ── Phase 2: 본문 생성 (스트리밍) ──
      console.log("[Phase 2] 시작");
      if (isMounted.current) {
        setStreamingText("");
        setContinuationAttempt(0);
      }

      const phase2Result = await clientRunPhase2({
        llm,
        phase2Prompt: PHASE2_PROMPT,
        categoryToneRules: CATEGORY_TONE_RULES[promptKey],
        commonWritingRules: COMMON_WRITING_RULES,
        visualRules: "",
        phase1Outline: phase1Result.outline,
        onProgress: (text) => {
          if (isMounted.current) setStreamingText(text);
        },
        onContinuationStart: (attempt) => {
          if (isMounted.current) setContinuationAttempt(attempt);
        },
      });

      if (!phase2Result.success || !phase2Result.body) {
        throw new Error(phase2Result.error || "Phase 2 실패");
      }

      console.log("[Phase 2] 완료, 길이:", phase2Result.body.length);
      let phase2Body = phase2Result.body;
      await savePhase2Output(genId, phase2Body);

      // ── Phase 2.5: 인포그래픽 설계 (본문 완성 후 별도 LLM 분석) ──
      // Phase 2.5 에 문단 ID 가 필요하므로 먼저 주입
      if (!hasParagraphIds(phase2Body)) {
        phase2Body = injectParagraphIds(phase2Body);
      }
      const pIdCount = (phase2Body.match(/<!-- p:\d+ -->/g) || []).length;
      console.log("[Phase 2.5] 시작, 본문:", phase2Body.length, "자, 문단 ID:", pIdCount, "개");
      if (isMounted.current) {
        setPipelinePhase("phase25");
        setStreamingText("📊 인포그래픽 설계 중...");
      }

      try {
        const phase25Result = await clientRunPhase25({
          llm,
          phase25Prompt: PHASE25_INFOGRAPHIC_PROMPT,
          phase2Body,
          categoryName,
          targetKeyword,
          firstImageRules: FIRST_IMAGE_RULES,
          onProgress: (text) => {
            if (isMounted.current) setStreamingText(text);
          },
        });

        if (phase25Result.success && phase25Result.infographics && phase25Result.infographics.length > 0) {
          const count = phase25Result.infographics.length;
          console.log("[Phase 2.5] 완료, 인포그래픽:", count, "개, 유형:", phase25Result.infographics.map((i) => i.type).join(","));
          const beforeLen = phase2Body.length;
          phase2Body = insertInfographicMarkers(phase2Body, phase25Result.infographics);
          const markerCount = (phase2Body.match(/\[IMAGE:/g) || []).length;
          console.log("[Phase 2.5] 마커 삽입 후:", phase2Body.length, "자 (삽입 전:", beforeLen, "), 마커 수:", markerCount);
          await savePhase2Output(genId, phase2Body);
          if (isMounted.current) toast.success(`📊 인포그래픽 ${markerCount}개 삽입 완료`);
        } else {
          console.warn("[Phase 2.5] 설계 실패:", phase25Result.error);
          if (isMounted.current) toast.info(`인포그래픽 설계 건너뜀: ${phase25Result.error ?? "결과 없음"}`);
        }
      } catch (err) {
        console.error("[Phase 2.5] 예외:", err);
        if (isMounted.current) toast.error(`인포그래픽 설계 오류: ${err instanceof Error ? err.message : "알 수 없는 오류"}`);
      }

      // 본문에서 이미지 마커 추출 (Phase 2.5 결과 포함)
      const imageMarkers = extractImageMarkers(phase2Body).map((mk) => ({
        position: mk.position,
        description: mk.description,
      }));

      // 제목은 Phase 1 outline 의 title 을 신뢰
      const title = phase1Result.outline.title;
      const generationTimeMs = Date.now() - startTime;

      // 저장
      await saveGenerationResult(genId, {
        generatedText: phase2Body,
        generatedTitle: title,
        generatedTags: [],
        imageMarkers,
        generationTimeMs,
      });

      if (isMounted.current) {
        setGeneratedText(phase2Body);
        setGeneratedTitle(title);
        setEditTitle(title);
        setStatus("completed");
        setPipelinePhase("phase3"); // Phase 3 트리거 가능 상태
        const seoNow = calculateSeoScore(title, phase2Body, targetKeyword || "").score;
        setSeoScoreBeforePhase3(seoNow);
        // 교차검증 전에 본문에 문단 ID 주입
        // ⚠️ phase2Body 를 직접 사용해야 함. editText 는 stale closure 로 아직 이전 값임.
        const bodyWithIds = hasParagraphIds(phase2Body) ? phase2Body : injectParagraphIds(phase2Body);
        setEditText(bodyWithIds);
        console.log("[Phase 2] editText 설정 완료, 길이:", bodyWithIds.length);
        // Phase 2 완료 직후 교차검증 모달 자동 오픈
        setShowValidation(true);
      }
````

요점
- Phase 2에 `visualRules: ""`를 넘기지만 `PHASE2_PROMPT`에는 `{{visual_rules}}` 자리가 없다 → 시각 규칙은 Phase 2에 전달되지 않는다.
- Phase 2 결과는 저장 후 문단 ID(`<!-- p:N -->`)를 주입하고 Phase 2.5로 넘긴다. Phase 2.5 실패는 경고만 하고 계속 진행.
- 제목은 Phase 1 아웃라인의 `title`을 그대로 신뢰한다(본문 첫 줄에서 추출하지 않음).
- Phase 2 직후 SEO 점수를 계산해 보관하고, 문단 ID가 들어간 본문으로 교차검증 모달을 자동으로 연다. Phase 3는 자동 실행되지 않는다.

## 4. Phase별 호출 파라미터 표

| 단계 | system 메시지 (원문) | user 메시지 | max_tokens | temperature | 실패 처리 |
|---|---|---|---|---|---|
| Phase 1 | `당신은 JSON 출력 전용 어시스턴트입니다. 마크다운, 코드펜스, 설명, 서문 없이 오직 JSON 객체 한 개만 출력합니다.` | `PHASE1_PROMPT` 치환 | 2000 | 0.4 | 파싱 실패 시 system 강화(아래)로 1회 재시도 → 또 실패면 에러 "Phase 1 JSON 파싱 실패 (1회 재시도까지 모두 실패). LLM 응답을 수동으로 확인해주세요." |
| Phase 1 재시도 | 위 문장 + `\n\n위 지시를 어기면 글 전체가 실패합니다. 절대로 마크다운 코드펜스(```) 를 출력하지 마세요. 반드시 { 로 시작해서 } 로 끝나는 JSON 객체 하나만 출력합니다.` | 동일 | 2000 | 0.4 | |
| Phase 2 | `당신은 한국어 블로그 콘텐츠 작성자입니다. 사용자가 제공한 아웃라인을 그대로 따라 본문을 마크다운으로 작성합니다. 본문 외 메타 설명/코드펜스를 출력하지 마세요.` | `PHASE2_PROMPT` 치환 | 8000 | 0.7 | 종료 사유 `length`면 이어쓰기 최대 2회. 펜스 제거 후 비면 "Phase 2 응답이 비어있습니다." |
| Phase 2.5 | (system 없음) | `PHASE25_INFOGRAPHIC_PROMPT` 치환 — didim-blog-infographic 담당 | 6000 | 0.5 | 실패 시 건너뜀 |
| Phase 3 | `당신은 한국어 블로그 SEO 편집자입니다. 사용자가 제공한 초안을 지시 항목만 정확히 수정해 출력합니다. 본문 외 설명을 출력하지 마세요.` | `PHASE3_PROMPT_BY_KEY[promptKey]` 치환 | 8000 | 0.4 | 펜스 제거 후 비면 "Phase 3 응답이 비어있습니다." |
| LEGACY | `SYSTEM_PROMPTS[key]` 치환 (DB 템플릿 있으면 `template.system_prompt`) | `USER_PROMPTS[key]` 치환 | 3000 | 0.5 | (미사용 경로) |

스트리밍 기본값(`streamClaude`): `max_tokens: params.maxTokens ?? 6000`, `temperature: params.temperature ?? 0.7`.

````ts
// src/lib/client-generate.ts:614-679
export async function clientRunPhase1(params: {
  llm: ClientPhaseLLMConfig;
  phase1Prompt: string; // PHASE1_PROMPT 원문
  categoryName: string;
  topic: string;
  targetKeyword: string;
}): Promise<{ success: boolean; outline?: Phase1Outline; rawText?: string; error?: string }> {
  const userMessage = replaceTemplate(params.phase1Prompt, {
    category_name: params.categoryName,
    topic: params.topic,
    target_keyword: params.targetKeyword,
  });

  const baseSystem =
    "당신은 JSON 출력 전용 어시스턴트입니다. 마크다운, 코드펜스, 설명, 서문 없이 오직 JSON 객체 한 개만 출력합니다.";

  async function callOnce(systemPrompt: string): Promise<string> {
    return streamLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      model: params.llm.model,
      apiKey: params.llm.apiKey,
      provider: params.llm.provider,
      // Phase 1 구조 설계: JSON 출력. legal_references + infographic_plan 이 길어질 수 있음
      maxTokens: 2000,
      temperature: 0.4,
    });
  }

  // 1차 시도
  let raw = "";
  try {
    raw = await callOnce(baseSystem);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Phase 1 호출 실패" };
  }

  let parsed = parsePhase1Json(raw);
  if (parsed) {
    return { success: true, outline: parsed, rawText: raw };
  }

  // 2차 재시도 — 더 강한 system + 짧은 user 트리거
  const stricter =
    baseSystem +
    "\n\n위 지시를 어기면 글 전체가 실패합니다. 절대로 마크다운 코드펜스(```) 를 출력하지 마세요. " +
    "반드시 { 로 시작해서 } 로 끝나는 JSON 객체 하나만 출력합니다.";
  try {
    raw = await callOnce(stricter);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Phase 1 재시도 실패" };
  }

  parsed = parsePhase1Json(raw);
  if (parsed) {
    return { success: true, outline: parsed, rawText: raw };
  }

  return {
    success: false,
    rawText: raw,
    error: "Phase 1 JSON 파싱 실패 (1회 재시도까지 모두 실패). LLM 응답을 수동으로 확인해주세요.",
  };
}
````

````ts
// src/lib/client-generate.ts:1092-1136
export async function clientRunPhase3(params: {
  llm: ClientPhaseLLMConfig;
  phase3Prompt: string; // PHASE3_PROMPT_BY_KEY[promptKey]
  targetKeyword: string;
  categoryName: string;
  phase2Body: string;
  onProgress?: (text: string) => void;
}): Promise<{ success: boolean; body?: string; error?: string }> {
  const userMessage = replaceTemplate(params.phase3Prompt, {
    target_keyword: params.targetKeyword,
    category_name: params.categoryName,
    phase2_output: params.phase2Body,
  });

  try {
    const body = await streamLLM({
      messages: [
        {
          role: "system",
          content:
            "당신은 한국어 블로그 SEO 편집자입니다. 사용자가 제공한 초안을 지시 항목만 정확히 수정해 출력합니다. 본문 외 설명을 출력하지 마세요.",
        },
        { role: "user", content: userMessage },
      ],
      model: params.llm.model,
      apiKey: params.llm.apiKey,
      provider: params.llm.provider,
      // Phase 3 는 본문 전체 + 주석 + 태그 블록을 포함해서 출력하므로 Phase 2 와
      // 동일한 안전 마진 필요.
      maxTokens: 8000,
      temperature: 0.4,
      onProgress: params.onProgress,
    });

    let cleaned = body.trim();
    const fence = cleaned.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
    if (fence) cleaned = fence[1].trim();
    if (!cleaned) {
      return { success: false, error: "Phase 3 응답이 비어있습니다." };
    }
    return { success: true, body: cleaned };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Phase 3 호출 실패" };
  }
}
````

## 5. 템플릿 변수 치환 규칙

- 3-Phase(클라이언트): `replaceTemplate` — 넘긴 변수 순서대로 `{{키}}`를 전부 치환(split/join). 넘기지 않은 placeholder는 그대로 남는다.
- LEGACY(서버): `replaceTemplateVariables` — `replaceAll`, 값이 비면 빈 문자열.
- Phase 2의 `{{phase1_output}}`에는 아웃라인 객체를 `JSON.stringify(outline, null, 2)`(2칸 들여쓰기)로 넣는다.

````ts
// src/lib/client-generate.ts:595-601
function replaceTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}
````

````ts
// src/lib/generation-runner.ts:19-28
function replaceTemplateVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value || "");
  }
  return result;
}
````

| 단계 | placeholder | 넣는 값 |
|---|---|---|
| Phase 1 | `{{category_name}}` | `getCategoryName(category_id)` — DB `categories.name` (2차 ID면 2차 이름, 예 "절세 시뮬레이션") |
| | `{{topic}}` | 생성 요청의 주제 |
| | `{{target_keyword}}` | 생성 요청의 핵심 키워드 |
| Phase 2 | `{{category_tone_rules}}` | `CATEGORY_TONE_RULES[promptKey]` |
| | `{{common_writing_rules}}` | `COMMON_WRITING_RULES` |
| | `{{visual_rules}}` | `""` (프롬프트에 자리 없음 — 효과 없음) |
| | `{{phase1_output}}` | Phase 1 아웃라인 JSON(2칸 들여쓰기) |
| Phase 3 | `{{target_keyword}}` | 핵심 키워드 |
| | `{{category_name}}` | 카테고리명 |
| | `{{phase2_output}}` | 에디터 본문에서 문단 ID를 제거한 것(`stripParagraphIds(editText)`) |
| LEGACY | `{{topic}}`, `{{keyword}}`, `{{additional_context}}` | 생성 레코드 값 |
| | `{{target_audience}}`, `{{subcategory}}` | 항상 `""` |
| | `{{cta_text}}`, `{{email_subject}}` | PROMPT_FIELD일 때만 `getFieldCta(categoryId)`(키워드 인자 없음), 그 외 `""` |

## 6. 프롬프트 키 매핑 · 카테고리명

````ts
// src/lib/constants/prompts.ts:1-7
// ── 프롬프트 키 타입 ──

export type PromptKey =
  | "PROMPT_FIELD"
  | "PROMPT_LOUNGE_GENERAL"
  | "PROMPT_LOUNGE_BITE"
  | "PROMPT_DIARY";
````

````ts
// src/lib/constants/prompts.ts:55-80
// ── getPromptKey: category + subCategory → PromptKey ──

export function getPromptKey(categoryId: string): PromptKey {
  // CAT-A (현장수첩) — subCategory(CAT-A-01/02/03)도 모두 PROMPT_FIELD
  if (categoryId === "CAT-A" || categoryId.startsWith("CAT-A-")) {
    return "PROMPT_FIELD";
  }

  // CAT-B-03 (IP 뉴스 한 입) — 경량 포맷
  if (categoryId === "CAT-B-03") {
    return "PROMPT_LOUNGE_BITE";
  }

  // CAT-B (IP 라운지 일반) — 특허 전략 노트, AI와 IP 등
  if (categoryId === "CAT-B" || categoryId.startsWith("CAT-B-")) {
    return "PROMPT_LOUNGE_GENERAL";
  }

  // CAT-C (디딤 다이어리) — 에세이/일기
  if (categoryId === "CAT-C" || categoryId.startsWith("CAT-C-")) {
    return "PROMPT_DIARY";
  }

  // 기타 (매칭 안 되면 일반 라운지 폴백)
  return "PROMPT_LOUNGE_GENERAL";
}
````

카테고리명(`supabase/seed.sql` categories):

| ID | 이름 | promptKey |
|---|---|---|
| CAT-A | 변리사의 현장 수첩 | PROMPT_FIELD |
| CAT-A-01 | 절세 시뮬레이션 | PROMPT_FIELD |
| CAT-A-02 | 인증 가이드 | PROMPT_FIELD |
| CAT-A-03 | 연구소 운영 실무 | PROMPT_FIELD |
| CAT-A-04 | (seed.sql에 없음. prompts.ts 주석·브리핑 프롬프트 표기: 특허·상표 출원 실무 — 확인 필요) | PROMPT_FIELD |
| CAT-B | IP 라운지 | PROMPT_LOUNGE_GENERAL |
| CAT-B-01 | AI와 IP | PROMPT_LOUNGE_GENERAL |
| CAT-B-02 | 특허 전략 노트 | PROMPT_LOUNGE_GENERAL |
| CAT-B-03 | IP 뉴스 한 입 | PROMPT_LOUNGE_BITE |
| CAT-C | 디딤 다이어리 | PROMPT_DIARY |
| CAT-C-01/02/03 | 컨설팅 후기 / 디딤 일상 / 대표의 생각 | PROMPT_DIARY |
| 그 외 | — | PROMPT_LOUNGE_GENERAL (폴백) |

> **스킬 적용 (skills/_DECISIONS.md, 2026-10-01)**: 위 매핑은 원본 코드 기록이다. 스킬은 네이버 categoryNo를 정본으로 하고 신규 구조를 우선한다 — 지원사업·인증과 특허(25)·출원·심판 실무(27)·사례(26) → PROMPT_FIELD, 지식재산 경영(24) → PROMPT_LOUNGE_GENERAL, 디딤 소식(28) → PROMPT_LOUNGE_BITE, 디딤 다이어리(17) → PROMPT_DIARY. CAT-*는 레거시 별칭(`scripts/categories.py`). 신규 구조로 발행할 때는 렌더링한 프롬프트 속 자기 카테고리 이름을 발행 이름으로 치환한다(SKILL.md 2단계).

## 7. CTA 매칭

````ts
// src/lib/constants/prompts.ts:9-53
// ── 모든 subCategory별 CTA ──

export const FIELD_CTA: Record<string, { cta: string; emailSubject: string }> = {
  // 현장수첩 > 절세 시뮬레이션
  "CAT-A-01": {
    cta: "재무제표를 보내주세요. 48시간 안에 절세 시뮬레이션을 만들어 드립니다. (무료)",
    emailSubject: "절세 시뮬레이션",
  },
  // 현장수첩 > 인증 가이드
  "CAT-A-02": {
    cta: "인증 요건 해당 여부, 무료 진단해드립니다.",
    emailSubject: "인증 진단",
  },
  // 현장수첩 > 연구소 운영 실무
  "CAT-A-03": {
    cta: "연구소 사후관리가 걱정되시면 연락 주세요. 연구활동조사표부터 연차보고까지 도와드립니다.",
    emailSubject: "연구소 관리",
  },
  // 현장수첩 > 특허·상표 출원 실무
  "CAT-A-04": {
    cta: "출원 전략이 궁금하시면 편하게 연락 주세요. 기술 내용을 보내주시면 출원 가능성과 전략을 검토해 드립니다.",
    emailSubject: "출원 상담",
  },
  // IP 라운지 > 특허 전략 노트
  "CAT-B-01": {
    cta: "특허 포트폴리오 전략이 궁금하시면 편하게 연락 주세요.",
    emailSubject: "상담 문의",
  },
  // IP 라운지 > AI와 IP
  "CAT-B-02": {
    cta: "AI 기술의 특허 가능성이 궁금하시면 편하게 연락 주세요.",
    emailSubject: "상담 문의",
  },
  // IP 라운지 > IP 뉴스 한 입
  "CAT-B-03": {
    cta: "IP 이슈에 대해 더 알고 싶으시면 이웃 추가 해주세요.",
    emailSubject: "상담 문의",
  },
};

/** 범용 CTA — 어디에도 매칭 안 될 때 */
const DEFAULT_CTA = {
  cta: "궁금하신 점이 있으시면 편하게 연락 주세요.",
  emailSubject: "상담 문의",
};
````

````ts
// src/lib/constants/prompts.ts:82-119
// ── getFieldCta: 현장수첩 subCategory별 CTA 반환 ──

/**
 * 카테고리 + 키워드 기반 CTA 매칭.
 * 2차 분류 정확 매칭 → 키워드 기반 추론 → 1차 카테고리 폴백 → 범용.
 */
export function getFieldCta(
  categoryId: string,
  targetKeyword?: string
): { cta: string; emailSubject: string } {
  // 1) 2차 분류 정확 매칭
  if (FIELD_CTA[categoryId]) return FIELD_CTA[categoryId];

  // 2) 키워드 기반 추론 (2차 분류 ID가 없을 때)
  const kw = (targetKeyword ?? "").toLowerCase();
  if (kw.includes("절세") || kw.includes("세액공제") || kw.includes("법인세") || kw.includes("보상금")) {
    return FIELD_CTA["CAT-A-01"];
  }
  if (kw.includes("인증") || kw.includes("벤처") || kw.includes("이노비즈")) {
    return FIELD_CTA["CAT-A-02"];
  }
  if (kw.includes("연구소") || kw.includes("연구활동") || kw.includes("사후관리")) {
    return FIELD_CTA["CAT-A-03"];
  }
  if (kw.includes("출원") || kw.includes("상표") || kw.includes("특허출원") || kw.includes("pct")) {
    return FIELD_CTA["CAT-A-04"];
  }
  if (kw.includes("ai") || kw.includes("인공지능") || kw.includes("생성형")) {
    return FIELD_CTA["CAT-B-02"];
  }

  // 3) 1차 카테고리 폴백 — 해당 1차의 첫 번째 2차 CTA
  if (categoryId.startsWith("CAT-A")) return FIELD_CTA["CAT-A-04"]; // 출원 실무 (가장 범용)
  if (categoryId.startsWith("CAT-B")) return FIELD_CTA["CAT-B-01"]; // 전략 노트

  // 4) 범용
  return DEFAULT_CTA;
}
````

주의: FIELD_CTA 주석은 CAT-B-01을 "특허 전략 노트", CAT-B-02를 "AI와 IP"로 적었지만 seed.sql은 반대(CAT-B-01 = AI와 IP). 코드는 ID로만 매칭한다(확인 필요).

## 8. 분량 · max tokens 규칙

선언만 되고 쓰이지 않는 권장값:

````ts
// src/lib/constants/prompts.ts:1204-1212
/**
 * 3-Phase max_tokens 권장값.
 * 호출 코드(client-generate.ts 또는 generation-runner)에서 사용.
 */
export const PHASE_MAX_TOKENS = {
  PHASE1: 1500,
  PHASE2: 4000,
  PHASE3: 5000,
} as const;
````

실제 호출값은 4절 표(Phase 1 = 2000, Phase 2 = 8000 + 이어쓰기 8000×최대 2, Phase 2.5 = 6000, Phase 3 = 8000, LEGACY = 3000).

에디터 화면의 목표 글자수(공백 제외, 생성 중 글자수 색상 분기용):

````ts
// src/app/(dashboard)/contents/ai-editor/[id]/ai-editor-client.tsx:92-104
/**
 * 카테고리 (promptKey) 별 본문 글자수 목표 범위 (공백 제외).
 * 생성 중 화면에서 현재 글자수의 색상 (초록/회색/주황) 분기에 사용.
 */
const TARGET_RANGE_BY_PROMPT: Record<
  import("@/lib/constants/prompts").PromptKey,
  { min: number; max: number }
> = {
  PROMPT_FIELD: { min: 1500, max: 2500 },
  PROMPT_LOUNGE_GENERAL: { min: 1500, max: 2500 },
  PROMPT_LOUNGE_BITE: { min: 800, max: 1200 },
  PROMPT_DIARY: { min: 800, max: 1500 },
};
````

프롬프트별 분량 규정 원문 요약 위치

| 출처 | FIELD | LOUNGE_GENERAL | LOUNGE_BITE | DIARY |
|---|---|---|---|---|
| 카테고리 시스템 프롬프트 "## 분량" | 1,500~2,000자 | 1,500~2,000자 | 800~1,200자 (절대 초과 금지) | 800~1,500자 |
| CATEGORY_TONE_RULES (Phase 2) | — | — | 본문 1,200자 이내 | — |
| COMMON_WRITING_RULES 유형별 길이 (Phase 2) | A 2,000~2,500 / B 1,800~2,200 / C 1,200~1,500 / D 1,500~1,800 / E 1,800~2,000 | 동일 | 동일 | 동일 |
| PHASE3_PROMPT 8번 | 1,500-2,500자 | 1,500-2,500자 | 1,500-2,500자 (같은 프롬프트 공유) | (PHASE3_PROMPT_DIARY: 분량 항목 없음) |
| validateDraft body-length | 1,500~2,500자 | 동일 | 동일 | 동일 |
| validateGeneratedDraft | — | — | 1,200자 초과 경고 | — |

## 9. Phase 2 이어쓰기

````ts
// src/lib/client-generate.ts:689-821
export async function clientRunPhase2(params: {
  llm: ClientPhaseLLMConfig;
  phase2Prompt: string; // PHASE2_PROMPT 원문
  categoryToneRules: string;
  commonWritingRules: string;
  visualRules: string;
  phase1Outline: Phase1Outline;
  onProgress?: (text: string) => void;
  /** 이어쓰기 단계 알림 — UI 에 "본문 이어서 작성 중..." 표시용 */
  onContinuationStart?: (attempt: number) => void;
}): Promise<{ success: boolean; body?: string; error?: string }> {
  const phase1Json = JSON.stringify(params.phase1Outline, null, 2);
  const userMessage = replaceTemplate(params.phase2Prompt, {
    category_tone_rules: params.categoryToneRules,
    common_writing_rules: params.commonWritingRules,
    visual_rules: params.visualRules,
    phase1_output: phase1Json,
  });

  const systemPrompt =
    "당신은 한국어 블로그 콘텐츠 작성자입니다. 사용자가 제공한 아웃라인을 그대로 따라 본문을 마크다운으로 작성합니다. 본문 외 메타 설명/코드펜스를 출력하지 마세요.";

  // finishReason 을 ref-like 객체로 보관 — TypeScript 의 타입 narrowing 을 우회
  const frState: { value: FinishReason } = { value: "other" };

  try {
    // ── 1차 호출 ──
    const initialBody = await streamLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      model: params.llm.model,
      apiKey: params.llm.apiKey,
      provider: params.llm.provider,
      // 한국어 본문 + 인포그래픽 마커 (한·영 이중) 포함 시 기존 4000 은 부족.
      // 8000 으로 상향 + 이어쓰기 fallback 으로 안전망.
      maxTokens: 8000,
      temperature: 0.7,
      onProgress: params.onProgress,
      onFinishReason: (r) => {
        frState.value = r;
      },
    });

    let accumulated = initialBody;

    // ── 이어쓰기 루프 (최대 2회) ──
    // finish_reason 이 "length" 이면 토큰 한도로 끊긴 것. 이어서 작성 프롬프트로 재호출.
    const MAX_CONTINUATIONS = 2;
    for (let attempt = 1; attempt <= MAX_CONTINUATIONS; attempt++) {
      if (frState.value !== "length") break;

      console.log(`[clientRunPhase2] finish_reason=length 감지 — 이어쓰기 ${attempt}/${MAX_CONTINUATIONS}`);
      params.onContinuationStart?.(attempt);

      const tailContext = accumulated.slice(-200);
      const continuationUser = `아래 블로그 본문이 토큰 한도로 중간에 끊겼습니다. 중단된 지점부터 이어서 완성해주세요.

규칙:
- 이미 작성된 부분을 반복하지 말고 **정확히 중단된 지점부터 이어가세요**.
- 전체 톤과 구조(1인칭, 구어체, 카테고리 톤)를 그대로 유지하세요.
- 인포그래픽 마커는 아웃라인의 infographic_plan 을 따라 빠진 것을 마저 삽입하세요.
- 응답은 이어쓰기 부분만 출력하세요. 중복 텍스트, 설명, 코드펜스 금지.

[아웃라인 — 참고용]
${phase1Json}

[지금까지 작성된 본문의 마지막 부분 — 여기 바로 다음부터 이어가세요]
${tailContext}`;

      // 다음 루프 판단을 위해 기본값으로 리셋
      frState.value = "other";
      const continuation = await streamLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: continuationUser },
        ],
        model: params.llm.model,
        apiKey: params.llm.apiKey,
        provider: params.llm.provider,
        maxTokens: 8000,
        temperature: 0.7,
        onProgress: (partialContinuation) => {
          // UI 에는 누적된 body + 이어쓰기 스트리밍 을 함께 표시
          params.onProgress?.(accumulated + partialContinuation);
        },
        onFinishReason: (r) => {
          frState.value = r;
        },
      });

      // 이어쓰기 결과에서 중복 prefix 제거 — 끝부분 50자 정도가 이어쓰기 첫 부분에
      // 그대로 반복되어 있으면 제거
      let cleanedContinuation = continuation.trim();
      const overlapCheckLen = Math.min(80, tailContext.length);
      if (overlapCheckLen > 20) {
        const lastChunk = accumulated.slice(-overlapCheckLen);
        const firstChunk = cleanedContinuation.slice(0, overlapCheckLen * 2);
        const overlap = findOverlap(lastChunk, firstChunk);
        if (overlap > 15) {
          cleanedContinuation = cleanedContinuation.slice(overlap).trimStart();
        }
      }

      accumulated = accumulated + cleanedContinuation;
      params.onProgress?.(accumulated);
      // frState.value 는 이미 이번 이어쓰기의 콜백에서 업데이트됨 → 루프 상단에서 판단
    }

    let cleaned = accumulated.trim();
    const fence = cleaned.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
    if (fence) cleaned = fence[1].trim();
    if (!cleaned) {
      return { success: false, error: "Phase 2 응답이 비어있습니다." };
    }
    return { success: true, body: cleaned };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Phase 2 호출 실패" };
  }
}

/**
 * 두 문자열 사이의 최대 겹침 길이 계산 (a 의 suffix 와 b 의 prefix 가 겹치는 길이).
 * 이어쓰기 시 중복 prefix 제거 용도.
 */
function findOverlap(a: string, b: string): number {
  const maxLen = Math.min(a.length, b.length);
  for (let len = maxLen; len >= 1; len--) {
    if (a.slice(-len) === b.slice(0, len)) return len;
  }
  return 0;
}
````

## 10. Phase 3 실행 원문 (후처리·마무리 저장 포함)

````ts
// src/app/(dashboard)/contents/ai-editor/[id]/ai-editor-client.tsx:889-1074
  /**
   * Phase 3 — SEO 정량 체크 + CTA/서명/태그 append
   * 사용자가 헤더의 "SEO 최적화 (Phase 3)" 버튼을 누르면 실행.
   * Phase 2 결과를 입력으로 받아 새 본문을 생성하고 editText 로 교체.
   */
  async function runPhase3() {
    if (!baseLLMRef.current) return;
    if (phase3Loading) return;

    setPhase3Loading(true);
    setPhase3Error(null);

    try {
      const meta = await getGenerationMeta(currentGenerationId);
      if (!meta.success || !meta.data) throw new Error(meta.error || "메타 조회 실패");

      const categoryId = meta.data.category_id ?? "";
      const targetKeyword = meta.data.target_keyword ?? "";
      const promptKey = getPromptKey(categoryId);
      const categoryName = await getCategoryName(categoryId);
      const phase3Prompt = PHASE3_PROMPT_BY_KEY[promptKey];

      // Phase 3 에 보내기 전 문단 ID 주석 제거 (LLM 이 깨트릴 수 있음)
      const cleanBody = stripParagraphIds(editText);

      // 마커 보존: Phase 3 이 마커를 손실할 경우 복원하기 위해 미리 추출
      const prePhase3Markers = cleanBody.match(/━━ 📷 이미지[^\n]*━━[\s\S]*?━━━━━━━━━━━━━━/g) || [];
      console.log("[Phase 3] 시작, 입력 마커 수:", prePhase3Markers.length);

      const result = await clientRunPhase3({
        llm: baseLLMRef.current,
        phase3Prompt,
        targetKeyword,
        categoryName,
        phase2Body: cleanBody,
        onProgress: (text) => {
          if (isMounted.current) setStreamingText(text);
        },
      });

      if (!result.success || !result.body) {
        throw new Error(result.error || "Phase 3 실패");
      }

      // Phase 3 본문 검증 — 빈 body 방지
      const phase3BodyLength = result.body.replace(/\s/g, "").length;
      console.log("[Phase 3] 완료, 원본 길이:", result.body.length, "공백 제외:", phase3BodyLength);
      if (phase3BodyLength < 200) {
        console.error("[Phase 3] 본문이 너무 짧음 — Phase 2 본문으로 폴백");
        result.body = cleanBody;
        toast.error("Phase 3 결과가 너무 짧아 Phase 2 원본을 사용합니다");
      }

      // 마커 복원: Phase 3 가 마커를 손실했으면 Phase 2.5 마커를 재삽입
      if (prePhase3Markers.length > 0) {
        const postPhase3Markers = (result.body.match(/━━ 📷 이미지[^\n]*━━[\s\S]*?━━━━━━━━━━━━━━/g) || []).length;
        console.log("[Phase 3] 마커 보존 체크:", postPhase3Markers, "/", prePhase3Markers.length);
        if (postPhase3Markers < prePhase3Markers.length) {
          console.warn("[Phase 3] 마커 손실 감지 — Phase 2.5 마커 복원 시작");
          // Phase 3 결과에서 마커가 빠졌으면, 본문을 균등 분할하여 마커 재삽입
          let restored = result.body;
          for (let i = prePhase3Markers.length - 1; i >= 0; i--) {
            const markerBlock = prePhase3Markers[i];
            // 이미 존재하면 건너뛰기
            if (restored.includes(markerBlock.slice(0, 30))) continue;
            // 균등 위치에 삽입
            const fraction = (i + 1) / (prePhase3Markers.length + 1);
            const approxPos = Math.floor(restored.length * fraction);
            const nearBreak = restored.indexOf("\n\n", approxPos);
            if (nearBreak !== -1 && nearBreak < restored.length - 100) {
              restored = restored.slice(0, nearBreak) + "\n\n" + markerBlock + restored.slice(nearBreak);
            } else {
              restored += "\n\n" + markerBlock;
            }
          }
          result.body = restored;
          const finalCount = (restored.match(/\[IMAGE:/g) || []).length;
          toast.info(`Phase 3에서 손실된 인포그래픽 마커 ${prePhase3Markers.length - postPhase3Markers}개를 복원했습니다`);
          console.log("[Phase 3] 마커 복원 완료, 최종 마커 수:", finalCount);
        }
      }

      // Disclaimer 자동 매칭 + CTA / 서명 / 태그 한 줄 append
      const disclaimer = determineDisclaimerLevel({
        categoryId,
        body: result.body,
        isAiGenerated: true,
      });
      // CTA 매칭: 2차 분류 → 키워드 기반 → 1차 폴백 → 범용 (다이어리는 건너뜀)
      const cta = getFieldCta(categoryId, targetKeyword);
      const finalBody = appendCtaAndSignature({
        body: result.body,
        promptKey,
        ctaText: cta.cta,
        emailSubject: cta.emailSubject,
        targetKeyword,
        disclaimerText: disclaimer.text,
      });

      // 태그 자동 생성 (코드 기반, LLM 호출 없음)
      const autoTags = generateAutoTags({
        promptKey,
        targetKeyword,
        phase1Outline,
        categoryId,
      });

      if (isMounted.current) {
        setEditText(finalBody);
        setEditTags(autoTags);
        setBodyHighlight(true);
        setTimeout(() => setBodyHighlight(false), 3000);
        setPipelinePhase("completed");
        setStreamingText("");
      }

      // DB 저장 — ai_generations 테이블
      await saveGenerationResult(currentGenerationId, {
        generatedText: finalBody,
        generatedTitle: editTitle,
        generatedTags: autoTags,
        imageMarkers: [],
        generationTimeMs: 0,
      });

      // ── 마무리 단계 (Finalization) — contents 테이블 자동 업데이트 ──
      console.log("[Finalization] 시작 — 본문/태그/발행일/SEO 자동 저장");
      const finalizationErrors: string[] = [];

      try {
        // 문단 ID 제거한 본문 저장
        const bodyForDb = stripParagraphIds(finalBody);

        // SEO 점수 재계산 (로컬 calculateSeoScore 사용)
        const seoCalc = calculateSeoScore(editTitle, bodyForDb, targetKeyword);
        const seoScore = seoCalc.score;

        // 발행예정일 — 기존에 없으면 다음 화요일 자동 배정
        const { getNextTuesday } = await import("@/lib/utils/date-helpers");
        const nextTue = getNextTuesday().toISOString().slice(0, 10);

        const saveResult = await saveAiDraftToContent(
          currentGenerationId,
          {
            title: editTitle,
            body: bodyForDb,
            tags: autoTags,
            keyword: targetKeyword || undefined,
          }
        );

        if (!saveResult.success || !saveResult.contentId) {
          finalizationErrors.push(`본문 저장: ${saveResult.error ?? "알 수 없는 오류"}`);
          console.error("[Finalization] 본문 저장 실패:", saveResult.error);
        } else {
          // 추가 필드 업데이트 (SEO, 발행일)
          const { updateContent: updateFn } = await import("@/actions/contents");
          const { error: updateErr } = await updateFn(saveResult.contentId, {
            seo_score: seoScore,
            publish_date: nextTue,
          });
          if (updateErr) {
            finalizationErrors.push(`SEO/발행일: ${updateErr}`);
          }
          console.log("[Finalization] 완료 — 본문:", bodyForDb.length, "자, SEO:", seoScore, "점, 발행일:", nextTue);
        }
      } catch (finErr) {
        const msg = finErr instanceof Error ? finErr.message : "마무리 단계 실패";
        finalizationErrors.push(msg);
        console.error("[Finalization] 예외:", finErr);
      }

      if (finalizationErrors.length > 0) {
        toast.error(`자동 처리 일부 실패: ${finalizationErrors.join("; ")}`, { duration: 8000 });
      } else {
        toast.success("Phase 3 완료 · 본문/태그/발행일 자동 저장됨 · 대표 검수를 기다리고 있습니다");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Phase 3 실패";
      console.error("[Phase 3] 에러:", err);
      setPhase3Error(msg);
      toast.error(msg);
    } finally {
      setPhase3Loading(false);
    }
  }
````

저장 버튼 경로(Phase 3 없이 저장할 때도 동일):

````ts
// src/app/(dashboard)/contents/ai-editor/[id]/ai-editor-client.tsx:1259-1302
  // 저장 실행
  function doSave() {
    startTransition(async () => {
      // 저장 시 문단 ID 주석 제거 (네이버 블로그에 불필요)
      const bodyForSave = stripParagraphIds(editText);

      // ⚠️ 본문 비어있음 방어 — 빈 본문 저장 방지
      const bodyContentLength = bodyForSave.replace(/\s/g, "").length;
      if (bodyContentLength < 200) {
        toast.error(
          `본문이 너무 짧습니다 (${bodyContentLength}자). 저장을 중단합니다. Phase 2/3 가 정상 완료되었는지 확인하세요.`,
          { duration: 8000 }
        );
        console.error("[저장 중단] 본문 길이:", bodyContentLength, "원본 editText 길이:", editText.length);
        return;
      }
      console.log("[저장] body 길이:", bodyForSave.length, "공백 제외:", bodyContentLength);

      const result = await saveAiDraftToContent(currentGenerationId, {
        title: editTitle,
        body: bodyForSave,
        tags: editTags,
        keyword: keyword || undefined,
      });

      if (!result.success) {
        setGenError(result.error || "저장에 실패했습니다.");
        return;
      }

      router.push("/contents");
    });
  }

  // 저장 버튼 클릭: 미통과 3개 이상이면 확인 모달
  function handleSave() {
    const draftChecks = validateDraft(editTitle, editText, "");
    const { failedItems } = calcDraftScore(draftChecks);
    if (failedItems.length >= 3) {
      setSaveConfirmOpen(true);
    } else {
      doSave();
    }
  }
````
