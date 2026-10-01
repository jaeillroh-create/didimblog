# 입력 경로: 브리핑 자동 생성 · 파일 기반 브리핑

초안 생성 전에 주제/파일에서 "브리핑 양식"(카테고리·키워드·타깃·에피소드·참고사항)을 만들어 초안 입력으로 넘기는 경로. 주간 기획·주제 추천은 didim-blog-planner 담당이고, 여기서는 writer 입력으로 쓰는 규칙만 둔다.

## 목차
1. PROMPT_BRIEFING_GENERATE (주제 → 브리핑)
2. PROMPT_BRIEFING_FROM_FILE (문서 → 브리핑)
3. 호출 규칙 · 파싱 · 검증 원문 (briefing.ts)
4. 파일 처리 규칙 원문 (file-upload.ts)
5. 업로드 허용 형식 · 크기 (ai-draft-dialog.tsx)
6. 브리핑 → 초안 입력 매핑

## 1. PROMPT_BRIEFING_GENERATE

system = 이 프롬프트 (+ 사용자가 카테고리를 지정하면 끝에 `\n\n카테고리는 반드시 {categoryId}를 사용하세요.`), user = `주제: {topic}`, max_tokens 1024, temperature 0.7.

````text
당신은 특허그룹 디딤의 블로그 콘텐츠 기획자입니다.
주어진 주제를 분석하여 블로그 브리핑 양식을 작성합니다.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 일체 포함하지 마세요.

{
  "categoryId": "CAT-A | CAT-B | CAT-B-03 | CAT-C 중 하나",
  "secondaryCategoryId": "CAT-A-01 | CAT-A-02 | CAT-A-03 | CAT-A-04 | CAT-B-01 | CAT-B-02 | CAT-B-03 | CAT-C-01 | CAT-C-02 | CAT-C-03 중 적합한 것",
  "topic": "구체적인 글 주제 (한 줄, 상황+결과 포함)",
  "keyword": "네이버 검색용 핵심 키워드 1~2개",
  "targetAudience": "타깃 고객 (업종, 규모, 상황 구체적으로)",
  "episode": "실제 사례/에피소드 (업종, 상황, before/after 숫자 포함)",
  "additionalContext": "참고 사항 (관련 법 조항, 주의점, 강조 포인트)"
}

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

디딤의 핵심 서비스: 직무발명보상 절세 컨설팅, 기업부설연구소 설립, 벤처기업인증, 특허출원
````
<sub>원본: src/lib/constants/prompts.ts:1472-1499 (런타임 문자열, `${...}` 는 TS 보간 — 해당 상수 전체를 그 자리에 삽입)</sub>

## 2. PROMPT_BRIEFING_FROM_FILE

system = 이 프롬프트 (+ 동일한 카테고리 지정 문장). user는 4절 참조. max_tokens 4096, temperature 0.7.

````text
당신은 특허그룹 디딤의 블로그 콘텐츠 기획자입니다.
아래는 사용자가 제공한 문서의 내용입니다. 이 내용을 분석하여 블로그 브리핑 양식을 작성하세요.
문서에서 블로그 글로 전환할 수 있는 핵심 포인트를 추출하고, 디딤의 서비스와 연결하세요.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 일체 포함하지 마세요.

{
  "categoryId": "CAT-A | CAT-B | CAT-B-03 | CAT-C 중 하나",
  "secondaryCategoryId": "CAT-A-01 | CAT-A-02 | CAT-A-03 | CAT-A-04 | CAT-B-01 | CAT-B-02 | CAT-B-03 | CAT-C-01 | CAT-C-02 | CAT-C-03 중 적합한 것",
  "topic": "구체적인 글 주제 (한 줄, 상황+결과 포함)",
  "keyword": "네이버 검색용 핵심 키워드 1~2개",
  "targetAudience": "타깃 고객 (업종, 규모, 상황 구체적으로)",
  "episode": "실제 사례/에피소드 (업종, 상황, before/after 숫자 포함)",
  "additionalContext": "참고 사항 (관련 법 조항, 주의점, 강조 포인트)"
}

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

디딤의 핵심 서비스: 직무발명보상 절세 컨설팅, 기업부설연구소 설립, 벤처기업인증, 특허출원
````
<sub>원본: src/lib/constants/prompts.ts:1501-1529 (런타임 문자열, `${...}` 는 TS 보간 — 해당 상수 전체를 그 자리에 삽입)</sub>

주의(코드 그대로): 두 프롬프트의 판단 기준은 "AI와 지식재산 → CAT-B-01 (AI와 IP)", "특허 전략 → CAT-B-02 (특허 전략 노트)"로 seed.sql 명칭과 일치하지만, `FIELD_CTA` 주석은 반대로 적혀 있다.

## 3. 호출 규칙 · 파싱 · 검증 (briefing.ts)

````ts
// src/actions/briefing.ts:10-24
interface GenerateBriefingInput {
  topic: string;
  categoryId?: string;
  llmConfigId?: number;
}

export interface BriefingData {
  categoryId: string;
  secondaryCategoryId: string;
  topic: string;
  keyword: string;
  targetAudience: string;
  episode: string;
  additionalContext: string;
}
````

````ts
// src/actions/briefing.ts:75-166
function parseJsonResponse(text: string): Record<string, unknown> | null {
  // ```json 펜스 제거
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

const VALID_PRIMARY_CATEGORIES = ["CAT-A", "CAT-B", "CAT-B-03", "CAT-C"];
const VALID_SECONDARY_CATEGORIES = [
  "CAT-A-01", "CAT-A-02", "CAT-A-03",
  "CAT-B-01", "CAT-B-02", "CAT-B-03",
  "CAT-C-01", "CAT-C-02", "CAT-C-03",
];

// ── Server Action ──

export async function generateBriefing(
  input: GenerateBriefingInput
): Promise<BriefingResult> {
  try {
    const supabase = await createClient();

    const llmConfig = await getActiveLLMConfig(supabase, input.llmConfigId);
    if (!llmConfig) {
      return { success: false, error: "활성화된 LLM 설정이 없습니다. 설정 > AI 설정에서 LLM을 등록해주세요." };
    }

    if (!llmConfig.api_key_encrypted) {
      return { success: false, error: "API 키가 설정되지 않았습니다." };
    }

    const apiKey = await decryptApiKey(llmConfig.api_key_encrypted);

    let systemPrompt = PROMPT_BRIEFING_GENERATE;
    if (input.categoryId) {
      systemPrompt += `\n\n카테고리는 반드시 ${input.categoryId}를 사용하세요.`;
    }

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: `주제: ${input.topic}` },
    ];

    const result = await generateFull(
      {
        provider: llmConfig.provider,
        model: llmConfig.model_id,
        apiKey,
        maxTokens: 1024,
        temperature: 0.7,
      },
      messages
    );

    const parsed = parseJsonResponse(result);
    if (!parsed) {
      return { success: false, error: "브리핑 생성에 실패했습니다. 직접 입력해주세요." };
    }

    const briefing: BriefingData = {
      categoryId: String(parsed.categoryId || "CAT-A"),
      secondaryCategoryId: String(parsed.secondaryCategoryId || ""),
      topic: String(parsed.topic || input.topic),
      keyword: String(parsed.keyword || ""),
      targetAudience: String(parsed.targetAudience || ""),
      episode: String(parsed.episode || ""),
      additionalContext: String(parsed.additionalContext || ""),
    };

    // 카테고리 유효성 검증
    if (!VALID_PRIMARY_CATEGORIES.includes(briefing.categoryId)) {
      briefing.categoryId = "CAT-A";
    }
    if (
      briefing.secondaryCategoryId &&
      !VALID_SECONDARY_CATEGORIES.includes(briefing.secondaryCategoryId)
    ) {
      briefing.secondaryCategoryId = "";
    }

    return { success: true, briefing };
  } catch (error) {
    console.error("브리핑 생성 오류:", error);
    return { success: false, error: "브리핑 생성 중 오류가 발생했습니다. 다시 시도해주세요." };
  }
}
````

`VALID_SECONDARY_CATEGORIES`에 `CAT-A-04`가 없어서, 주제 기반 브리핑이 출원 실무(CAT-A-04)를 고르면 2차 분류가 빈 값으로 바뀐다(file-upload.ts 목록에는 있음 — 확인 필요).

> **스킬 적용 (skills/_DECISIONS.md)**: 이 누락은 재현하지 않는다. 두 경로 모두 file-upload.ts 목록으로 검증한 뒤, 브리핑의 CAT-*를 신규 구조 categoryNo로 매핑한다 — CAT-A·A-01·A-02·A-03 → 25, A-04 → 27, CAT-B·B-01·B-02 → 24, B-03 → 28, C-01 → 26(사례, 사건 메모 필요), C-02 → 19, C-03 → 20, CAT-C → 17. 사용자가 카테고리를 지정하면 그 값을 쓴다(`parse-briefing --force-category`). 프롬프트 원문은 바꾸지 않는다.

## 4. 파일 처리 규칙 (file-upload.ts)

````ts
// src/actions/file-upload.ts:69-141
function parseJsonResponse(text: string): Record<string, unknown> | null {
  let cleaned = text.trim();

  // ```json ... ``` 블록 추출
  if (cleaned.includes("```")) {
    const match = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (match) cleaned = match[1].trim();
  }

  // JSON 객체 부분만 추출 (첫 번째 { 부터 마지막 } 까지)
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // 아래로 폴백
    }
  }

  // 전체를 시도
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

const VALID_PRIMARY_CATEGORIES = ["CAT-A", "CAT-B", "CAT-B-03", "CAT-C"];
const VALID_SECONDARY_CATEGORIES = [
  "CAT-A-01", "CAT-A-02", "CAT-A-03", "CAT-A-04",
  "CAT-B-01", "CAT-B-02", "CAT-B-03",
  "CAT-C-01", "CAT-C-02", "CAT-C-03",
];

async function extractTextFromFile(
  fileBase64: string,
  fileType: string
): Promise<string> {
  // TXT 파일
  if (fileType === "text/plain") {
    return Buffer.from(fileBase64, "base64").toString("utf-8");
  }

  // DOCX 파일
  if (
    fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    const buffer = Buffer.from(fileBase64, "base64");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // PDF와 이미지는 Claude Vision API로 처리하므로 빈 문자열 반환
  return "";
}

function isVisionFile(fileType: string): boolean {
  return (
    fileType === "application/pdf" ||
    fileType.startsWith("image/")
  );
}

function getMediaType(
  fileType: string
): "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  if (fileType === "application/pdf") return "application/pdf";
  if (fileType === "image/png") return "image/png";
  if (fileType === "image/webp") return "image/webp";
  if (fileType === "image/gif") return "image/gif";
  return "image/jpeg";
}
````

````ts
// src/actions/file-upload.ts:145-299
export async function analyzeFileForBriefing(
  input: FileAnalysisInput
): Promise<FileAnalysisResult> {
  try {
    const supabase = await createClient();

    const llmConfig = await getActiveLLMConfig(supabase, input.llmConfigId);
    if (!llmConfig) {
      return { success: false, error: "활성화된 LLM 설정이 없습니다." };
    }

    if (!llmConfig.api_key_encrypted) {
      return { success: false, error: "API 키가 설정되지 않았습니다." };
    }

    const apiKey = await decryptApiKey(llmConfig.api_key_encrypted);

    let systemPrompt = PROMPT_BRIEFING_FROM_FILE;
    if (input.categoryId) {
      systemPrompt += `\n\n카테고리는 반드시 ${input.categoryId}를 사용하세요.`;
    }

    // Vision API를 사용하는 파일 (PDF, 이미지)인 경우
    if (isVisionFile(input.fileType)) {
      // Claude Vision API를 통해 직접 분석
      // Claude provider만 vision 지원 — 다른 provider면 안내
      if (llmConfig.provider !== "claude") {
        return {
          success: false,
          error: "PDF/이미지 파일 분석은 Claude API에서만 지원됩니다. Claude LLM을 기본으로 설정해주세요.",
        };
      }

      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey });

      const contentType = input.fileType === "application/pdf" ? "document" : "image";
      const mediaType = getMediaType(input.fileType);

      const response = await client.messages.create({
        model: llmConfig.model_id,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: contentType,
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: input.fileBase64,
                },
              } as Parameters<typeof client.messages.create>[0]["messages"][0]["content"] extends Array<infer T> ? T : never,
              {
                type: "text",
                text: "이 문서의 내용을 분석하여 블로그 브리핑 양식을 JSON으로 작성해주세요.",
              },
            ],
          },
        ],
      });

      const resultText =
        response.content[0].type === "text" ? response.content[0].text : "";

      const parsed = parseJsonResponse(resultText);
      if (!parsed) {
        return { success: false, error: "파일 분석 결과를 파싱할 수 없습니다. 다른 형식으로 시도해주세요." };
      }

      const briefing = buildBriefingFromParsed(parsed, input);
      return { success: true, briefing };
    }

    // 텍스트 추출 가능한 파일 (TXT, DOCX)
    let extractedText: string;
    try {
      extractedText = await extractTextFromFile(input.fileBase64, input.fileType);
    } catch {
      return { success: false, error: "파일을 읽을 수 없습니다. PDF나 TXT로 변환 후 다시 시도해주세요." };
    }

    if (!extractedText.trim()) {
      return { success: false, error: "파일에서 텍스트를 추출할 수 없습니다." };
    }

    // 8,000자 제한
    const truncated = extractedText.length > 8000;
    const fileContent = truncated ? extractedText.slice(0, 8000) : extractedText;

    const userMessage = `[문서 내용]\n${fileContent}${truncated ? "\n\n(파일이 길어 앞부분만 포함되었습니다)" : ""}`;

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userMessage },
    ];

    const result = await generateFull(
      {
        provider: llmConfig.provider,
        model: llmConfig.model_id,
        apiKey,
        maxTokens: 4096,
        temperature: 0.7,
      },
      messages
    );

    const parsed = parseJsonResponse(result);
    if (!parsed) {
      console.error("[file-upload] JSON 파싱 실패. LLM 전체 원문:", result);
      return { success: false, error: "브리핑 생성 결과를 파싱할 수 없습니다. LLM 응답 형식 오류." };
    }

    const briefing = buildBriefingFromParsed(parsed, input);
    return {
      success: true,
      extractedText: truncated ? `${fileContent}\n\n(앞 8,000자만 분석됨)` : fileContent,
      briefing,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("파일 분석 상세 오류:", errMsg);
    return { success: false, error: `파일 분석 실패: ${errMsg.slice(0, 100)}` };
  }
}

function buildBriefingFromParsed(
  parsed: Record<string, unknown>,
  input: { fileBase64?: string; fileName?: string; categoryId?: string }
): BriefingData {
  const briefing: BriefingData = {
    categoryId: String(parsed.categoryId || "CAT-A"),
    secondaryCategoryId: String(parsed.secondaryCategoryId || ""),
    topic: String(parsed.topic || ""),
    keyword: String(parsed.keyword || ""),
    targetAudience: String(parsed.targetAudience || ""),
    episode: String(parsed.episode || ""),
    additionalContext: String(parsed.additionalContext || ""),
  };

  if (!VALID_PRIMARY_CATEGORIES.includes(briefing.categoryId)) {
    briefing.categoryId = "CAT-A";
  }
  if (
    briefing.secondaryCategoryId &&
    !VALID_SECONDARY_CATEGORIES.includes(briefing.secondaryCategoryId)
  ) {
    briefing.secondaryCategoryId = "";
  }

  return briefing;
}
````

## 5. 업로드 허용 형식 · 크기

````ts
// src/components/contents/ai-draft-dialog.tsx:349-372
  // F2: 파일 업로드 처리
  function handleFileSelect(file: File) {
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "image/jpeg",
      "image/png",
    ];
    const allowedExtensions = [".pdf", ".docx", ".txt", ".jpg", ".jpeg", ".png"];
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));

    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(ext)) {
      setFileError("PDF, DOCX, TXT, JPG, PNG만 지원합니다.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setFileError("10MB 이하 파일만 업로드 가능합니다.");
      return;
    }

    setUploadedFile(file);
    setFileError(null);
````

## 6. 브리핑 → 초안 입력 매핑

브리핑 결과를 "직접 입력" 탭으로 옮길 때의 규칙. `targetAudience`는 비우고, 에피소드와 참고사항은 `additional_context`로 합친다.

````ts
// src/components/contents/ai-draft-dialog.tsx:324-346
  // F1: 브리핑 결과를 manual 탭으로 전달
  function applyBriefingToManual(briefing: BriefingData) {
    setTopic(briefing.topic);
    setKeyword(briefing.keyword);
    setTargetAudience("");

    // 카테고리 매핑
    const primaryCat = primaryCategories.find((c) => c.id === briefing.categoryId);
    if (primaryCat) {
      setCategoryId(primaryCat.id);
      const secondaryCat = categories.find(
        (c) => c.tier === "secondary" && c.id === briefing.secondaryCategoryId
      );
      setSecondaryCategory(secondaryCat?.id || "");
    }

    // episode + additionalContext 합산
    const contextParts: string[] = [];
    if (briefing.episode) contextParts.push(`[에피소드]\n${briefing.episode}`);
    if (briefing.additionalContext) contextParts.push(`[참고사항]\n${briefing.additionalContext}`);
    setAdditionalContext(contextParts.join("\n\n"));

    setActiveTab("manual");
````

````ts
// src/components/contents/ai-draft-dialog.tsx:441-466

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim() || !categoryId || !keyword.trim()) return;

    setError(null);
    startTransition(async () => {
      const result = await generateDraft({
        topic: topic.trim(),
        categoryId: secondaryCategory || categoryId,
        keyword: keyword.trim(),
        targetAudience: targetAudience || undefined,
        additionalContext: additionalContext.trim() || undefined,
        llmConfigId: selectedLlmId ? parseInt(selectedLlmId) : undefined,
      });

      if (!result.success) {
        setError(result.error || "AI 초안 생성에 실패했습니다.");
        return;
      }

      resetForm();
      onOpenChange(false);
      router.push(`/contents/ai-editor/${result.generationId}`);
    });
  }
````

→ 저장되는 `category_id` = 2차 분류가 있으면 2차, 없으면 1차. `additional_context` 형식:

````text
[에피소드]
{episode}

[참고사항]
{additionalContext}
````

3-Phase 경로는 이 `additional_context`를 프롬프트에 넣지 않는다(`pipeline-runtime.md` 2절). 스킬은 `--context-file` 확장으로 Phase 1·2에 덧붙인다(SKILL.md 2단계).
