/**
 * 클라이언트 사이드에서 LLM API를 직접 스트리밍 호출 (Claude/OpenAI/Gemini)
 * Vercel 서버리스 타임아웃과 무관하게 동작
 */

import type { Phase1Outline } from "@/lib/types/database";
import type { PromptKey } from "@/lib/constants/prompts";

export type ClientLLMProvider = "claude" | "openai" | "gemini";

export interface ClientGenerateParams {
  messages: { role: string; content: string }[];
  model: string;
  apiKey: string;
  provider?: ClientLLMProvider; // 기본 claude (하위호환)
  maxTokens?: number;
  temperature?: number;
  onProgress?: (text: string) => void;
}

/**
 * Claude(Anthropic) Messages API 스트리밍 호출
 */
async function streamClaude(params: ClientGenerateParams): Promise<string> {
  const systemMessage = params.messages.find((m) => m.role === "system");
  const userMessages = params.messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens: params.maxTokens ?? 6000,
    temperature: params.temperature ?? 0.7,
    stream: true,
    messages: userMessages,
  };

  if (systemMessage) {
    body.system = systemMessage.content;
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Anthropic API 오류 (${response.status}): ${errorBody.slice(0, 200)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("스트림을 읽을 수 없습니다.");

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === "content_block_delta" && parsed.delta?.text) {
          fullText += parsed.delta.text;
          params.onProgress?.(fullText);
        }
      } catch {
        // 무시
      }
    }
  }

  return fullText;
}

/**
 * OpenAI Chat Completions API 스트리밍 호출
 * - GPT-5.x 계열은 max_tokens 대신 max_completion_tokens 를 사용한다
 *   (max_tokens 를 보내면 "Unsupported parameter" 400 에러)
 */
async function streamOpenAI(params: ClientGenerateParams): Promise<string> {
  const body = {
    model: params.model,
    max_completion_tokens: params.maxTokens ?? 6000,
    temperature: params.temperature ?? 0.7,
    stream: true,
    messages: params.messages.map((m) => ({
      role: m.role === "system" ? "system" : m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`OpenAI API 오류 (${response.status}): ${errorBody.slice(0, 200)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("스트림을 읽을 수 없습니다.");

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          params.onProgress?.(fullText);
        }
      } catch {
        // 무시
      }
    }
  }

  return fullText;
}

/**
 * Google Gemini API 스트리밍 호출 (streamGenerateContent + alt=sse)
 */
async function streamGemini(params: ClientGenerateParams): Promise<string> {
  const systemMessage = params.messages.find((m) => m.role === "system");
  const nonSystemMessages = params.messages.filter((m) => m.role !== "system");

  const contents = nonSystemMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: params.maxTokens ?? 6000,
      temperature: params.temperature ?? 0.7,
    },
  };

  if (systemMessage) {
    body.systemInstruction = { parts: [{ text: systemMessage.content }] };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(params.apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Gemini API 오류 (${response.status}): ${errorBody.slice(0, 200)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("스트림을 읽을 수 없습니다.");

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data) continue;
      try {
        const parsed = JSON.parse(data);
        const text = parsed.candidates?.[0]?.content?.parts
          ?.map((p: { text?: string }) => p.text || "")
          .join("");
        if (text) {
          fullText += text;
          params.onProgress?.(fullText);
        }
      } catch {
        // 무시
      }
    }
  }

  return fullText;
}

/**
 * provider별 스트리밍 호출 라우터
 */
async function streamLLM(params: ClientGenerateParams): Promise<string> {
  const provider = params.provider ?? "claude";
  if (provider === "openai") return streamOpenAI(params);
  if (provider === "gemini") return streamGemini(params);
  return streamClaude(params);
}

export async function clientGenerateDraft(
  params: ClientGenerateParams
): Promise<string> {
  return streamLLM(params);
}

// ── 팩트체크 ──

export interface FactCheckIssue {
  category: string;
  severity: "high" | "medium" | "low";
  location: string;
  description: string;
  suggestion: string;
  original_text?: string;
  replacement_text?: string;
}

export interface FactCheckItem {
  claim: string;
  verdict: "정확" | "확인필요" | "오류";
  reason: string;
}

export interface FactCheckResult {
  overall_score: number;
  verdict: "pass" | "fix_required" | "major_issues";
  issues: FactCheckIssue[];
  strengths: string[];
  fact_check_items: FactCheckItem[];
}

function parseFactCheckJson(text: string): object | null {
  let cleaned = text.trim();

  // 1. ```json ... ``` 블록 추출
  if (cleaned.includes("```")) {
    const match = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (match) cleaned = match[1].trim();
  }

  // 2. JSON 객체 부분만 추출
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // 3. 잘린 JSON 복구 시도
      let partial = jsonMatch[0];
      const lastComplete = Math.max(partial.lastIndexOf("}"), partial.lastIndexOf("]"));
      if (lastComplete > 0) {
        partial = partial.substring(0, lastComplete + 1);
      }
      const openBraces = (partial.match(/\{/g) || []).length;
      const closeBraces = (partial.match(/\}/g) || []).length;
      const openBrackets = (partial.match(/\[/g) || []).length;
      const closeBrackets = (partial.match(/\]/g) || []).length;
      for (let i = 0; i < openBrackets - closeBrackets; i++) partial += "]";
      for (let i = 0; i < openBraces - closeBraces; i++) partial += "}";
      try {
        return JSON.parse(partial);
      } catch {
        // 복구 실패
      }
    }
  }

  // 전체를 시도
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export interface ClientFactCheckParams {
  title: string;
  body: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  provider?: ClientLLMProvider; // 기본 claude
  onProgress?: (text: string) => void;
}

export async function clientFactCheck(
  params: ClientFactCheckParams
): Promise<{ success: boolean; result?: FactCheckResult; error?: string }> {
  try {
    const userMessage = `제목: ${params.title}\n\n본문:\n${params.body}`;

    const fullText = await streamLLM({
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: userMessage },
      ],
      model: params.model,
      apiKey: params.apiKey,
      provider: params.provider ?? "claude",
      maxTokens: 4096,
      temperature: 0.3,
      onProgress: params.onProgress,
    });

    // JSON 파싱 (3단계 + 잘린 JSON 복구)
    const parsed = parseFactCheckJson(fullText);
    if (!parsed) {
      return { success: false, error: "팩트체크 결과를 파싱할 수 없습니다. 수동으로 검토해주세요." };
    }

    // original_text/replacement_text 폴백 생성
    const result = parsed as FactCheckResult;
    result.issues = result.issues ?? [];
    result.strengths = result.strengths ?? [];
    result.fact_check_items = result.fact_check_items ?? [];
    if (result.issues.length > 0) {
      const bodyLines = params.body.split("\n");
      for (const issue of result.issues) {
        if (!issue.original_text && issue.location) {
          const matchLine = bodyLines.find((line) => line.includes(issue.location));
          if (matchLine) {
            issue.original_text = matchLine.trim();
          }
        }
        if (!issue.replacement_text && issue.suggestion) {
          issue.replacement_text = issue.suggestion;
        }
      }
    }

    return { success: true, result };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "팩트체크 실패" };
  }
}

// ── 교차검증 (Cross-Validation) ──

export interface CrossValidationProviderConfig {
  provider: ClientLLMProvider;
  model: string;
  apiKey: string;
  displayName: string;
}

export interface CrossValidationProviderResult {
  provider: ClientLLMProvider;
  displayName: string;
  success: boolean;
  result?: FactCheckResult;
  error?: string;
}

/**
 * 여러 LLM에 동시에 팩트체크를 요청해서 결과 목록 반환
 * 각 결과는 독립적으로 성공/실패할 수 있음
 */
export async function clientCrossValidate(params: {
  title: string;
  body: string;
  systemPrompt: string;
  providers: CrossValidationProviderConfig[];
  onProviderDone?: (result: CrossValidationProviderResult) => void;
}): Promise<CrossValidationProviderResult[]> {
  const promises = params.providers.map(async (cfg): Promise<CrossValidationProviderResult> => {
    const res = await clientFactCheck({
      title: params.title,
      body: params.body,
      model: cfg.model,
      apiKey: cfg.apiKey,
      provider: cfg.provider,
      systemPrompt: params.systemPrompt,
    });
    const out: CrossValidationProviderResult = {
      provider: cfg.provider,
      displayName: cfg.displayName,
      success: res.success,
      result: res.result,
      error: res.error,
    };
    params.onProviderDone?.(out);
    return out;
  });

  return Promise.all(promises);
}

// ── 피드백 반영 재작성 ──

export interface SelectedIssue {
  category: string;
  description: string;
  suggestion: string;
  original_text?: string;
  replacement_text?: string;
  provider: string; // 어느 LLM이 지적했는지
}

/**
 * 사용자가 선택한 교차검증 이슈들을 반영하여 본문을 재작성
 * 원본 LLM(=초안 생성 LLM)을 사용
 */
export async function clientRewriteWithFeedback(params: {
  title: string;
  body: string;
  selectedIssues: SelectedIssue[];
  model: string;
  apiKey: string;
  provider: ClientLLMProvider;
  onProgress?: (text: string) => void;
}): Promise<{ success: boolean; rewrittenBody?: string; error?: string }> {
  try {
    if (params.selectedIssues.length === 0) {
      return { success: false, error: "반영할 항목이 선택되지 않았습니다." };
    }

    const feedbackBlock = params.selectedIssues
      .map((it, i) => {
        const lines = [
          `${i + 1}. [${it.category}] (${it.provider})`,
          `   - 지적: ${it.description}`,
          `   - 제안: ${it.suggestion}`,
        ];
        if (it.original_text) lines.push(`   - 원문: "${it.original_text}"`);
        if (it.replacement_text) lines.push(`   - 수정안: "${it.replacement_text}"`);
        return lines.join("\n");
      })
      .join("\n\n");

    const systemPrompt = `당신은 한국어 블로그 글 편집 전문가입니다.
사용자가 제공한 원본 본문을, 아래 지적 사항들을 모두 반영하여 다시 작성합니다.

작성 지침:
- 원본의 카테고리·톤·구조·이미지 마커([IMAGE: ...])·CTA·태그를 그대로 유지하세요.
- 지적 사항만 정확히 반영하고, 그 외 부분은 가능한 한 원문 그대로 두세요.
- 마크다운 형식, 줄바꿈, 단락 구분을 원본과 동일하게 유지하세요.
- 응답에는 어떠한 설명·서문·코드펜스도 붙이지 말고, 오직 수정된 전체 본문만 출력하세요.`;

    const userPrompt = `[원본 제목]
${params.title}

[원본 본문]
${params.body}

[반영해야 할 지적 사항]
${feedbackBlock}

위 지적 사항을 모두 반영한 새 본문을 출력해주세요. 본문 외 다른 텍스트는 출력하지 마세요.`;

    const rewritten = await streamLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: params.model,
      apiKey: params.apiKey,
      provider: params.provider,
      maxTokens: 8000,
      temperature: 0.5,
      onProgress: params.onProgress,
    });

    // 코드펜스가 섞여 들어오면 제거
    let cleaned = rewritten.trim();
    const fenceMatch = cleaned.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();

    if (!cleaned) {
      return { success: false, error: "재작성 결과가 비어있습니다." };
    }

    return { success: true, rewrittenBody: cleaned };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "재작성 실패" };
  }
}

// ─────────────────────────────────────────────────────────────
// 3-Phase 파이프라인 — Phase 1 (구조) / Phase 2 (본문) / Phase 3 (SEO)
// ─────────────────────────────────────────────────────────────

/**
 * 코드펜스 / 앞뒤 텍스트 / 부분 잘림에 모두 견디는 JSON 추출 파서.
 * Phase 1 응답이 LLM 별로 형식이 다를 수 있어 다층 시도.
 */
function parsePhase1Json(text: string): Phase1Outline | null {
  let cleaned = text.trim();

  // 1. ```json ... ``` 블록 추출
  if (cleaned.includes("```")) {
    const match = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (match) cleaned = match[1].trim();
  }

  // 2. 첫 { 부터 마지막 } 까지 추출
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    return null;
  }
  const candidate = cleaned.slice(firstBrace, lastBrace + 1);

  try {
    const parsed = JSON.parse(candidate);
    if (typeof parsed !== "object" || parsed === null) return null;
    if (typeof parsed.title !== "string") return null;
    return parsed as Phase1Outline;
  } catch {
    // 잘린 JSON 복구 시도
    let partial = candidate;
    const openBraces = (partial.match(/\{/g) || []).length;
    const closeBraces = (partial.match(/\}/g) || []).length;
    const openBrackets = (partial.match(/\[/g) || []).length;
    const closeBrackets = (partial.match(/\]/g) || []).length;
    for (let i = 0; i < openBrackets - closeBrackets; i++) partial += "]";
    for (let i = 0; i < openBraces - closeBraces; i++) partial += "}";
    try {
      return JSON.parse(partial) as Phase1Outline;
    } catch {
      return null;
    }
  }
}

function replaceTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}

export interface ClientPhaseLLMConfig {
  provider: ClientLLMProvider;
  model: string;
  apiKey: string;
}

/**
 * Phase 1 — 구조 설계
 * PHASE1_PROMPT 의 placeholder 를 채워서 user 메시지로 보냄.
 * JSON 파싱 실패 시 1회 재시도 (system 강화).
 */
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
      maxTokens: 1500,
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

/**
 * Phase 2 — 본문 생성 (스트리밍).
 * PHASE2_PROMPT 의 placeholder 4개 채워서 user 메시지로 보냄.
 */
export async function clientRunPhase2(params: {
  llm: ClientPhaseLLMConfig;
  phase2Prompt: string; // PHASE2_PROMPT 원문
  categoryToneRules: string;
  commonWritingRules: string;
  visualRules: string;
  phase1Outline: Phase1Outline;
  onProgress?: (text: string) => void;
}): Promise<{ success: boolean; body?: string; error?: string }> {
  const phase1Json = JSON.stringify(params.phase1Outline, null, 2);
  const userMessage = replaceTemplate(params.phase2Prompt, {
    category_tone_rules: params.categoryToneRules,
    common_writing_rules: params.commonWritingRules,
    visual_rules: params.visualRules,
    phase1_output: phase1Json,
  });

  try {
    const body = await streamLLM({
      messages: [
        {
          role: "system",
          content:
            "당신은 한국어 블로그 콘텐츠 작성자입니다. 사용자가 제공한 아웃라인을 그대로 따라 본문을 마크다운으로 작성합니다. 본문 외 메타 설명/코드펜스를 출력하지 마세요.",
        },
        { role: "user", content: userMessage },
      ],
      model: params.llm.model,
      apiKey: params.llm.apiKey,
      provider: params.llm.provider,
      maxTokens: 4000,
      temperature: 0.7,
      onProgress: params.onProgress,
    });

    let cleaned = body.trim();
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
 * Phase 3 — SEO 정량 체크 + 마무리 (스트리밍).
 * PHASE3_PROMPT 또는 PHASE3_PROMPT_DIARY 의 placeholder 채워서 user 메시지로 보냄.
 */
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
      maxTokens: 5000,
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

/**
 * Phase 3 종료 후 후처리 — CTA / 서명 / 태그 한 줄을 본문 끝에 append.
 * 다이어리 카테고리는 그대로 반환 (CTA 금지).
 *
 * LLM 이 [TAGS] ... [/TAGS] 블록을 출력하면 그걸 파싱하고, 없으면
 * target_keyword 와 브랜드 태그만으로 한 줄을 만든다. 항상 #특허그룹디딤
 * #디딤변리사 두 브랜드 태그가 포함되도록 보장.
 */
export function appendCtaAndSignature(params: {
  body: string;
  promptKey: PromptKey;
  ctaText?: string;
  emailSubject?: string;
  targetKeyword?: string;
}): string {
  if (params.promptKey === "PROMPT_DIARY") {
    return params.body;
  }

  // [TAGS] ... [/TAGS] 가 있으면 추출
  let llmTags: string[] = [];
  const tagsMatch = params.body.match(/\[TAGS\]([\s\S]*?)\[\/TAGS\]/);
  let bodyWithoutTagsBlock = params.body;
  if (tagsMatch) {
    llmTags = tagsMatch[1]
      .split(/[,\n#]/)
      .map((t) => t.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 8);
    bodyWithoutTagsBlock = params.body.replace(tagsMatch[0], "").trimEnd();
  }

  // 키워드 + 브랜드 태그 머지
  const keyword = (params.targetKeyword ?? "").replace(/\s+/g, "");
  const fixedTags = ["특허그룹디딤", "디딤변리사"];
  const merged = Array.from(
    new Set([
      ...(keyword ? [keyword] : []),
      ...llmTags.map((t) => t.replace(/\s+/g, "")),
      ...fixedTags,
    ])
  ).slice(0, 12);

  const tagLine = merged.map((t) => `#${t}`).join(" ");

  const cta = params.ctaText?.trim() ||
    "관련해서 궁금하신 점이 있다면 admin@didimip.com 으로 편하게 연락주세요.";
  const subject = params.emailSubject?.trim() || "상담 문의";

  const block = `

━━━━━━━━━━━━━━━━━━
${cta}

특허그룹 디딤 | 기업을 아는 변리사
📞 02-571-6613
📧 admin@didimip.com (메일 제목: '${subject}')

${tagLine}`;

  return bodyWithoutTagsBlock.trimEnd() + block;
}
