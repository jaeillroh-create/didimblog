import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMMessage, LLMStreamConfig } from "@/lib/types/database";

export async function* generateStream(
  config: LLMStreamConfig,
  messages: LLMMessage[]
): AsyncGenerator<string> {
  const genAI = new GoogleGenerativeAI(config.apiKey);
  const model = genAI.getGenerativeModel({
    model: config.model,
    generationConfig: {
      maxOutputTokens: config.maxTokens ?? 4096,
      temperature: config.temperature ?? 0.7,
    },
  });

  const systemMessage = messages.find((m) => m.role === "system");
  const chatMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: m.content }],
    }));

  const chat = model.startChat({
    history: chatMessages.slice(0, -1),
    systemInstruction: systemMessage
      ? { role: "user" as const, parts: [{ text: systemMessage.content }] }
      : undefined,
  });

  const lastMessage = chatMessages[chatMessages.length - 1];
  const result = await chat.sendMessageStream(
    lastMessage?.parts[0]?.text ?? ""
  );

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) {
      yield text;
    }
  }
}

/**
 * Google Gemini API 연결 테스트
 * - fetch 로 직접 호출 (REST API)
 * - 사용자가 지정한 model 로 정확히 테스트
 */
export async function testConnection(
  apiKey: string,
  model: string
): Promise<{ success: boolean; error?: string }> {
  if (!apiKey) return { success: false, error: "API 키가 비어있습니다." };
  if (!model) return { success: false, error: "모델 ID가 비어있습니다." };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: "Hi" }] }],
    generationConfig: { maxOutputTokens: 10 },
  };

  console.log("[gemini.testConnection] 요청:", { model, apiKeyPrefix: apiKey.slice(0, 8) });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[gemini.testConnection] fetch 실패:", msg);
    return { success: false, error: `네트워크 오류: ${msg}` };
  }

  const rawBody = await response.text().catch(() => "");

  if (!response.ok) {
    let parsed: { error?: { message?: string; status?: string } } | null = null;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      // raw text fallback
    }
    const apiMessage = parsed?.error?.message ?? rawBody.slice(0, 400) ?? "(응답 본문 없음)";
    const errorMessage = `Gemini API ${response.status} ${response.statusText}: ${apiMessage}`;
    console.error("[gemini.testConnection] 실패:", errorMessage);
    return { success: false, error: errorMessage };
  }

  // 성공 응답에 candidates 가 있어야 함
  try {
    const json = JSON.parse(rawBody);
    if (!json?.candidates) {
      return { success: false, error: "Gemini 응답에 candidates 가 없습니다: " + rawBody.slice(0, 200) };
    }
  } catch {
    return { success: false, error: "Gemini 응답을 JSON 으로 파싱할 수 없습니다: " + rawBody.slice(0, 200) };
  }

  console.log("[gemini.testConnection] 성공:", { model });
  return { success: true };
}
