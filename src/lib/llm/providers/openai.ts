import OpenAI from "openai";
import type { LLMMessage, LLMStreamConfig } from "@/lib/types/database";

export async function* generateStream(
  config: LLMStreamConfig,
  messages: LLMMessage[]
): AsyncGenerator<string> {
  const client = new OpenAI({ apiKey: config.apiKey });

  const stream = await client.chat.completions.create({
    model: config.model,
    max_tokens: config.maxTokens ?? 4096,
    temperature: config.temperature ?? 0.7,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      yield delta;
    }
  }
}

/**
 * OpenAI Chat Completions API 연결 테스트
 * - SDK 대신 fetch 로 직접 호출 (SDK hidden 에러 회피)
 * - 사용자가 지정한 model 로 정확히 테스트
 * - 실패 시 status code + response body 를 그대로 전달
 */
export async function testConnection(
  apiKey: string,
  model: string
): Promise<{ success: boolean; error?: string }> {
  if (!apiKey) {
    return { success: false, error: "API 키가 비어있습니다." };
  }
  if (!model) {
    return { success: false, error: "모델 ID가 비어있습니다." };
  }

  const url = "https://api.openai.com/v1/chat/completions";
  const body = {
    model,
    max_tokens: 10,
    messages: [{ role: "user", content: "Hi" }],
  };

  console.log("[openai.testConnection] 요청:", { url, model, apiKeyPrefix: apiKey.slice(0, 8) });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[openai.testConnection] fetch 실패:", msg);
    return { success: false, error: `네트워크 오류: ${msg}` };
  }

  const rawBody = await response.text().catch(() => "");

  if (!response.ok) {
    let parsed: { error?: { message?: string; type?: string; code?: string } } | null = null;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      // raw text fallback
    }
    const apiMessage =
      parsed?.error?.message ??
      rawBody.slice(0, 400) ??
      "(응답 본문 없음)";
    const apiCode = parsed?.error?.code ? ` code=${parsed.error.code}` : "";
    const errorMessage = `OpenAI API ${response.status} ${response.statusText}${apiCode}: ${apiMessage}`;
    console.error("[openai.testConnection] 실패:", errorMessage);
    return { success: false, error: errorMessage };
  }

  let json: { id?: string } | null = null;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return {
      success: false,
      error: "OpenAI 응답을 JSON 으로 파싱할 수 없습니다: " + rawBody.slice(0, 200),
    };
  }

  if (!json?.id) {
    return {
      success: false,
      error: "OpenAI 응답에 id 가 없습니다: " + rawBody.slice(0, 200),
    };
  }

  console.log("[openai.testConnection] 성공:", { id: json.id, model });
  return { success: true };
}
