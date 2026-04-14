import Anthropic from "@anthropic-ai/sdk";
import type { LLMMessage, LLMStreamConfig } from "@/lib/types/database";

export async function* generateStream(
  config: LLMStreamConfig,
  messages: LLMMessage[]
): AsyncGenerator<string> {
  const client = new Anthropic({ apiKey: config.apiKey });

  const systemMessage = messages.find((m) => m.role === "system");
  const nonSystemMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  const stream = client.messages.stream({
    model: config.model,
    max_tokens: config.maxTokens ?? 4096,
    temperature: config.temperature ?? 0.7,
    system: systemMessage?.content,
    messages: nonSystemMessages,
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}

/**
 * Anthropic Messages API 연결 테스트
 * - fetch 로 직접 호출하여 SDK 의존성 회피
 * - 사용자가 지정한 model 로 정확히 테스트
 */
export async function testConnection(
  apiKey: string,
  model: string
): Promise<{ success: boolean; error?: string }> {
  if (!apiKey) return { success: false, error: "API 키가 비어있습니다." };
  if (!model) return { success: false, error: "모델 ID가 비어있습니다." };

  const url = "https://api.anthropic.com/v1/messages";
  const body = {
    model,
    max_tokens: 10,
    messages: [{ role: "user", content: "Hi" }],
  };

  console.log("[claude.testConnection] 요청:", { url, model, apiKeyPrefix: apiKey.slice(0, 8) });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[claude.testConnection] fetch 실패:", msg);
    return { success: false, error: `네트워크 오류: ${msg}` };
  }

  const rawBody = await response.text().catch(() => "");

  if (!response.ok) {
    let parsed: { error?: { message?: string; type?: string } } | null = null;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      // raw text fallback
    }
    const apiMessage = parsed?.error?.message ?? rawBody.slice(0, 400) ?? "(응답 본문 없음)";
    const errorMessage = `Anthropic API ${response.status} ${response.statusText}: ${apiMessage}`;
    console.error("[claude.testConnection] 실패:", errorMessage);
    return { success: false, error: errorMessage };
  }

  let json: { id?: string } | null = null;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { success: false, error: "Anthropic 응답을 JSON 으로 파싱할 수 없습니다: " + rawBody.slice(0, 200) };
  }

  if (!json?.id) {
    return { success: false, error: "Anthropic 응답에 id 가 없습니다: " + rawBody.slice(0, 200) };
  }

  console.log("[claude.testConnection] 성공:", { id: json.id, model });
  return { success: true };
}
