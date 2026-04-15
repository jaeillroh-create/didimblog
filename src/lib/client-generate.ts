/**
 * 클라이언트 사이드에서 LLM API를 직접 스트리밍 호출 (Claude/OpenAI/Gemini)
 * Vercel 서버리스 타임아웃과 무관하게 동작
 */

import type { Phase1Outline } from "@/lib/types/database";
import type { PromptKey } from "@/lib/constants/prompts";

export type ClientLLMProvider = "claude" | "openai" | "gemini";

/** LLM 응답 종료 이유 — 이어쓰기 트리거 판단용 */
export type FinishReason = "stop" | "length" | "other";

export interface ClientGenerateParams {
  messages: { role: string; content: string }[];
  model: string;
  apiKey: string;
  provider?: ClientLLMProvider; // 기본 claude (하위호환)
  maxTokens?: number;
  temperature?: number;
  onProgress?: (text: string) => void;
  /** 스트림 종료 시 finish_reason 을 콜백으로 전달 — 이어쓰기 판단 */
  onFinishReason?: (reason: FinishReason) => void;
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
        // Claude 의 finish_reason: message_delta 이벤트의 delta.stop_reason
        // ("end_turn" → stop, "max_tokens" → length, 기타 → other)
        if (parsed.type === "message_delta" && parsed.delta?.stop_reason) {
          const raw = parsed.delta.stop_reason as string;
          const reason: FinishReason =
            raw === "end_turn" ? "stop" : raw === "max_tokens" ? "length" : "other";
          params.onFinishReason?.(reason);
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
        // OpenAI 의 finish_reason: choices[0].finish_reason 이 null 이 아닌 chunk 에서
        // ("stop" → stop, "length" → length, 기타 content_filter/tool_calls → other)
        const fr = parsed.choices?.[0]?.finish_reason;
        if (fr && typeof fr === "string") {
          const reason: FinishReason =
            fr === "stop" ? "stop" : fr === "length" ? "length" : "other";
          params.onFinishReason?.(reason);
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
        // Gemini 의 finish_reason: candidates[0].finishReason
        // ("STOP" → stop, "MAX_TOKENS" → length, 기타 SAFETY/RECITATION → other)
        const fr = parsed.candidates?.[0]?.finishReason;
        if (fr && typeof fr === "string") {
          const reason: FinishReason =
            fr === "STOP" ? "stop" : fr === "MAX_TOKENS" ? "length" : "other";
          params.onFinishReason?.(reason);
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

/**
 * Phase 2 — 본문 생성 (스트리밍).
 * PHASE2_PROMPT 의 placeholder 4개 채워서 user 메시지로 보냄.
 *
 * 끊김 감지 + 이어쓰기: LLM 응답의 finish_reason 이 "length" 이면 토큰 한도
 * 초과로 본문이 중간에 끊긴 것. 이 경우 지금까지의 결과 + 마지막 200자를
 * 컨텍스트로 넘기고 "이어서 작성" 프롬프트로 자동 재호출 (최대 2회).
 */
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

// ─────────────────────────────────────────────────────────────
// Phase 2 ↔ Phase 3 사이 — 사실 검증 (cross-LLM)
// PROMPT_CROSS_VALIDATION 전용. 한국어 severity / problem / suggested_text
// 를 받아 기존 FactCheckIssue 인터페이스 (high/medium/low + description +
// replacement_text) 로 정규화해 기존 UI 와 호환되게 한다.
// ─────────────────────────────────────────────────────────────

const SEVERITY_KO_TO_EN: Record<string, "high" | "medium" | "low"> = {
  심각: "high",
  주의: "medium",
  경미: "low",
  high: "high",
  medium: "medium",
  low: "low",
};

interface RawCrossValidationIssue {
  category?: string;
  severity?: string;
  original_text?: string;
  problem?: string;
  description?: string;
  suggestion?: string;
  suggested_text?: string;
  replacement_text?: string;
  location?: string;
}

function normalizeCrossValidationIssue(raw: RawCrossValidationIssue): FactCheckIssue {
  const original = raw.original_text ?? "";
  return {
    category: raw.category ?? "기타",
    severity: SEVERITY_KO_TO_EN[raw.severity ?? "medium"] ?? "medium",
    location: raw.location ?? original.slice(0, 20),
    description: raw.problem ?? raw.description ?? "",
    suggestion: raw.suggestion ?? "",
    original_text: original || undefined,
    replacement_text: raw.suggested_text ?? raw.replacement_text,
  };
}

function parseCrossValidationJson(text: string): FactCheckResult | null {
  let cleaned = text.trim();

  if (cleaned.includes("```")) {
    const m = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (m) cleaned = m[1].trim();
  }

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) return null;
  let candidate = cleaned.slice(first, last + 1);

  let parsed: { overall_score?: number; issues?: RawCrossValidationIssue[] } | null = null;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    // 잘린 JSON 복구 시도
    const openBraces = (candidate.match(/\{/g) || []).length;
    const closeBraces = (candidate.match(/\}/g) || []).length;
    const openBrackets = (candidate.match(/\[/g) || []).length;
    const closeBrackets = (candidate.match(/\]/g) || []).length;
    for (let i = 0; i < openBrackets - closeBrackets; i++) candidate += "]";
    for (let i = 0; i < openBraces - closeBraces; i++) candidate += "}";
    try {
      parsed = JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== "object") return null;

  const score = typeof parsed.overall_score === "number" ? parsed.overall_score : 0;
  const issues = Array.isArray(parsed.issues) ? parsed.issues.map(normalizeCrossValidationIssue) : [];

  // verdict 는 score 기준으로 자동 추론 (PROMPT_CROSS_VALIDATION 응답에 verdict 필드 없음)
  const verdict: FactCheckResult["verdict"] =
    score >= 80 ? "pass" : score >= 60 ? "fix_required" : "major_issues";

  return {
    overall_score: score,
    verdict,
    issues,
    strengths: [],
    fact_check_items: [],
  };
}

export interface CrossValidateV2Params {
  title: string;
  body: string;
  promptTemplate: string; // PROMPT_CROSS_VALIDATION 원문
  legalReferences: string[]; // Phase 1 outline 의 legal_references
  categoryName: string;
  targetKeyword: string;
  providers: CrossValidationProviderConfig[]; // base 제외된 외부 LLM 목록
  onProviderDone?: (result: CrossValidationProviderResult) => void;
}

/**
 * 새 교차검증 — PROMPT_CROSS_VALIDATION 을 사용해 등록된 외부 LLM 전부에
 * 동시 호출. 각 결과를 기존 FactCheckResult 형태로 정규화.
 */
export async function clientCrossValidateV2(
  params: CrossValidateV2Params
): Promise<CrossValidationProviderResult[]> {
  const legalRefBlock =
    params.legalReferences.length > 0
      ? params.legalReferences.map((r) => `- ${r}`).join("\n")
      : "(Phase 1 에서 legal_references 가 추출되지 않음)";

  const userMessage = params.promptTemplate
    .split("{{legal_references}}").join(legalRefBlock)
    .split("{{category_name}}").join(params.categoryName || "")
    .split("{{target_keyword}}").join(params.targetKeyword || "")
    .split("{{phase2_output}}").join(params.body);

  const promises = params.providers.map(async (cfg): Promise<CrossValidationProviderResult> => {
    try {
      const raw = await streamLLM({
        messages: [
          {
            role: "system",
            content:
              "당신은 JSON 출력 전용 팩트체커입니다. 마크다운/설명/코드펜스 없이 오직 JSON 객체 한 개만 출력합니다.",
          },
          { role: "user", content: userMessage },
        ],
        model: cfg.model,
        apiKey: cfg.apiKey,
        provider: cfg.provider,
        maxTokens: 4096,
        temperature: 0.3,
      });

      const result = parseCrossValidationJson(raw);
      if (!result) {
        const out: CrossValidationProviderResult = {
          provider: cfg.provider,
          displayName: cfg.displayName,
          success: false,
          error: "응답 JSON 파싱 실패",
        };
        params.onProviderDone?.(out);
        return out;
      }

      const out: CrossValidationProviderResult = {
        provider: cfg.provider,
        displayName: cfg.displayName,
        success: true,
        result,
      };
      params.onProviderDone?.(out);
      return out;
    } catch (err) {
      const out: CrossValidationProviderResult = {
        provider: cfg.provider,
        displayName: cfg.displayName,
        success: false,
        error: err instanceof Error ? err.message : "검증 실패",
      };
      params.onProviderDone?.(out);
      return out;
    }
  });

  return Promise.all(promises);
}

/**
 * 카테고리(promptKey)별 기본 태그 — 본문 키워드만으로는 SEO 기준(8개 이상)에
 * 미달이라, 카테고리 정체성에 맞는 일반 태그로 채워서 항상 10개 이상 보장.
 * 사용자가 본문 편집기에서 태그를 자유롭게 추가/삭제할 수 있도록 너무 길지 않게.
 */
const DEFAULT_TAGS_BY_CATEGORY: Record<PromptKey, string[]> = {
  PROMPT_FIELD: [
    "직무발명보상",
    "법인세절감",
    "중소기업절세",
    "변리사",
    "특허출원",
    "기업부설연구소",
    "벤처기업인증",
  ],
  PROMPT_LOUNGE_GENERAL: [
    "지식재산",
    "특허전략",
    "IP라운지",
    "AI특허",
    "스타트업특허",
    "기업IP",
    "변리사칼럼",
  ],
  PROMPT_LOUNGE_BITE: [
    "IP뉴스",
    "특허이슈",
    "지식재산트렌드",
    "특허개정",
    "한입IP",
    "변리사칼럼",
    "IP라운지",
  ],
  PROMPT_DIARY: [],
};

/**
 * 최종 본문에서 "(확인 필요)" / "(미확인)" 같은 불확실성 마커를 제거하는 안전망.
 *
 * Phase 3 LLM 이 PHASE3_PROMPT 의 9번 항목(우회 표현으로 바꾸기) 을 대체로
 * 잘 따르지만, 가끔 본문에 그대로 남는 경우가 있어서 후처리에서 마지막으로 정리.
 *
 * 전략:
 * - "조특법 제○조 (확인 필요)" 같은 패턴 → "조세특례제한법 관련 규정"
 * - "별지 제○호 서식 (확인 필요)" → "관련 별지 서식"
 * - "시행령 제○조 (확인 필요)" → "관련 시행령 규정"
 * - 단독 "(확인 필요)" / "(확인필요)" / "(미확인)" → 빈 문자열로 제거
 * - 연속된 공백 정리
 *
 * 이 함수는 비파괴적이지 않다 — 호출 측이 의도해서 부르는 경우에만 사용한다
 * (Phase 3 후처리에서 appendCtaAndSignature 직전에 호출).
 */
export function cleanFinalText(body: string): string {
  let t = body;

  // 1) 구체적 법령 번호 + (확인 필요) → 일반화
  t = t.replace(
    /조\s*특\s*법\s*제\s*\d+\s*조(?:\s*의\s*\d+)?\s*\(\s*확인\s*필요[^)]*\)/g,
    "조세특례제한법 관련 규정"
  );
  t = t.replace(
    /조세\s*특례\s*제한\s*법\s*제\s*\d+\s*조(?:\s*의\s*\d+)?\s*\(\s*확인\s*필요[^)]*\)/g,
    "조세특례제한법 관련 규정"
  );
  t = t.replace(
    /시행령\s*제\s*\d+\s*조(?:\s*의\s*\d+)?\s*\(\s*확인\s*필요[^)]*\)/g,
    "관련 시행령 규정"
  );
  t = t.replace(
    /시행규칙\s*제\s*\d+\s*조(?:\s*의\s*\d+)?\s*\(\s*확인\s*필요[^)]*\)/g,
    "관련 시행규칙"
  );
  t = t.replace(
    /별지\s*제\s*[0-9]+\s*호\s*서식\s*\(\s*확인\s*필요[^)]*\)/g,
    "관련 별지 서식 (관할 세무서/홈택스에서 최신본 확인 권장)"
  );

  // 2) 단독 "(확인 필요)" / "(확인필요)" / "(미확인)" / "(확정 아님)" 제거
  t = t.replace(/\s*\(\s*확인\s*필요[^)]*\)\s*/g, " ");
  t = t.replace(/\s*\(\s*미확인[^)]*\)\s*/g, " ");
  t = t.replace(/\s*\(\s*확정\s*아님[^)]*\)\s*/g, " ");

  // 3) 연속 공백/탭 정리 (줄바꿈은 보존)
  t = t.replace(/[ \t]{2,}/g, " ");
  // 줄 끝의 trailing space 제거
  t = t.replace(/[ \t]+\n/g, "\n");
  // 3+ 연속 줄바꿈은 2개로 정리
  t = t.replace(/\n{3,}/g, "\n\n");

  return t;
}

/**
 * Phase 2 ↔ Phase 3 사이 — 교차검증 이슈 [반영 + 다듬기] 전용.
 *
 * 교차검증에서 severity 가 심각/주의 이거나 category 가 논리/단정/출처 인 경우,
 * original_text → suggested_text 단순 치환은 앞뒤 문맥이 어색해진다. 이럴 때
 * 해당 문단 전체를 베이스 LLM 에게 보내서 "수정 사항을 반영하고 문단 전체를
 * 자연스럽게 다듬어라" 라고 요청.
 *
 * 입력:
 *   - categoryTone: CATEGORY_TONE_RULES[promptKey] (1인칭/구어체 등)
 *   - originalParagraph: 본문에서 original_text 를 포함하는 문단 전체
 *   - originalText / suggestedText / problem: 교차검증 issue 3개 필드
 *
 * 출력: 다듬어진 문단 전체 (이 문단으로 본문의 originalParagraph 를 교체)
 */
export async function clientRewriteParagraph(params: {
  llm: ClientPhaseLLMConfig;
  categoryTone: string;
  originalParagraph: string;
  originalText: string;
  suggestedText: string;
  problem: string;
}): Promise<{ success: boolean; rewrittenParagraph?: string; error?: string }> {
  const userMessage = `아래 블로그 본문의 특정 문단에서 수정이 발생했습니다.
수정된 문장이 앞뒤 문맥과 자연스럽게 이어지도록 해당 문단 전체를 다듬어주세요.

규칙:
- 수정된 내용(suggested_text)의 의미는 반드시 유지
- 해당 문단의 다른 문장들도 수정 내용에 맞게 자연스럽게 조정
- 글의 전체 톤(1인칭, 구어체)을 유지
- 문단 외의 다른 부분은 절대 건드리지 마세요
- 문단 길이는 원본과 비슷하게 유지 (과도하게 늘리거나 줄이지 말 것)

카테고리 톤:
${params.categoryTone}

--- 수정 전 문단 ---
${params.originalParagraph}

--- 수정 사항 ---
원문: ${params.originalText}
수정: ${params.suggestedText}
수정 이유: ${params.problem}

--- 출력 ---
다듬어진 문단 전체를 출력하세요. 문단만 출력, 다른 텍스트(설명/코드펜스/헤더) 없이.`;

  try {
    const body = await streamLLM({
      messages: [
        {
          role: "system",
          content:
            "당신은 한국어 블로그 편집자입니다. 사용자가 제공한 문단을 지시에 따라 정확히 다듬어 출력합니다. 문단 외 설명/코드펜스/헤더 절대 출력 금지.",
        },
        { role: "user", content: userMessage },
      ],
      model: params.llm.model,
      apiKey: params.llm.apiKey,
      provider: params.llm.provider,
      // 한 문단은 보통 300~800자. 안전 마진 포함 1500.
      maxTokens: 1500,
      temperature: 0.5,
    });

    let cleaned = body.trim();
    const fence = cleaned.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
    if (fence) cleaned = fence[1].trim();
    if (!cleaned) {
      return { success: false, error: "재작성 결과가 비어있습니다." };
    }
    return { success: true, rewrittenParagraph: cleaned };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "문단 재작성 실패" };
  }
}

/**
 * Phase 3 종료 후 후처리 — CTA / 서명 / 태그 한 줄을 본문 끝에 append.
 * 다이어리 카테고리는 그대로 반환 (CTA 금지).
 *
 * 태그 구성 (다이어리 제외, 최소 10개):
 *   1. target_keyword (있으면)
 *   2. LLM 이 [TAGS]...[/TAGS] 로 출력했으면 그 태그들
 *   3. 카테고리별 DEFAULT_TAGS (부족분 채움)
 *   4. 브랜드 태그 (특허그룹디딤, 디딤변리사) — 항상 마지막에 보장
 *
 * 본문은 cleanFinalText 로 한 번 더 정리 후 CTA 블록을 append.
 */
export function appendCtaAndSignature(params: {
  body: string;
  promptKey: PromptKey;
  ctaText?: string;
  emailSubject?: string;
  targetKeyword?: string;
}): string {
  if (params.promptKey === "PROMPT_DIARY") {
    // 다이어리도 (확인 필요) 표기 안전망은 적용 (CTA / 태그는 건너뜀)
    return cleanFinalText(params.body);
  }

  // 안전망: PHASE3 가 우회 처리하지 못한 (확인 필요) 마커를 정리
  const cleaned = cleanFinalText(params.body);

  // [TAGS] ... [/TAGS] 가 있으면 추출
  let llmTags: string[] = [];
  const tagsMatch = cleaned.match(/\[TAGS\]([\s\S]*?)\[\/TAGS\]/);
  let bodyWithoutTagsBlock = cleaned;
  if (tagsMatch) {
    llmTags = tagsMatch[1]
      .split(/[,\n#]/)
      .map((t) => t.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean);
    bodyWithoutTagsBlock = cleaned.replace(tagsMatch[0], "").trimEnd();
  }

  const normalize = (t: string) => t.replace(/\s+/g, "").replace(/^#/, "");

  const keyword = normalize(params.targetKeyword ?? "");
  const categoryDefaults = DEFAULT_TAGS_BY_CATEGORY[params.promptKey] ?? [];
  const fixedBrand = ["특허그룹디딤", "디딤변리사"];

  // 우선순위: keyword → LLM 태그 → 카테고리 기본 → 브랜드
  const ordered: string[] = [];
  const seen = new Set<string>();
  function push(t: string) {
    const n = normalize(t);
    if (!n || seen.has(n)) return;
    seen.add(n);
    ordered.push(n);
  }

  if (keyword) push(keyword);
  for (const t of llmTags) push(t);
  for (const t of categoryDefaults) push(t);
  for (const t of fixedBrand) push(t);

  // 최소 10개 보장이 안 되면 (LLM 태그 + 카테고리 기본 다 합쳐도 부족) — 브랜드는 항상 포함
  // 최대 12개로 자르되, 브랜드 2개는 반드시 살림
  let merged = ordered.slice(0, 12);
  for (const b of fixedBrand) {
    if (!merged.includes(normalize(b))) merged = [...merged.slice(0, 11), normalize(b)];
  }

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
