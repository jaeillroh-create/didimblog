/**
 * OpenAI Chat Completions API 어댑터.
 *
 * - GPT-5.x 계열은 max_tokens 가 아닌 max_completion_tokens 를 사용한다
 *   (max_tokens 전송 시 "Unsupported parameter: 'max_tokens' is not
 *   supported with this model. Use 'max_completion_tokens' instead." 400 에러).
 * - SDK 대신 fetch 직접 호출로 testConnection 과 일관성 유지하고
 *   SDK hidden 에러를 회피한다.
 */

import type { LLMMessage, LLMStreamConfig } from "@/lib/types/database";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

export async function* generateStream(
  config: LLMStreamConfig,
  messages: LLMMessage[]
): AsyncGenerator<string> {
  const body = {
    model: config.model,
    max_completion_tokens: config.maxTokens ?? 4096,
    temperature: config.temperature ?? 0.7,
    stream: true,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  };

  const response = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`OpenAI API ${response.status} ${response.statusText}: ${errorBody.slice(0, 400)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("OpenAI 스트림을 읽을 수 없습니다.");

  const decoder = new TextDecoder();
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
        if (delta) yield delta;
      } catch {
        // SSE 파싱 실패 무시
      }
    }
  }
}

/**
 * OpenAI Chat Completions API 연결 테스트
 * - SDK 대신 fetch 로 직접 호출 (SDK hidden 에러 회피)
 * - 사용자가 지정한 model 로 정확히 테스트
 * - GPT-5.x 는 max_completion_tokens 사용
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

  const body = {
    model,
    // GPT-5.x reasoning 모델은 reasoning + visible 토큰을 모두 합산하므로
    // 너무 작으면 visible 출력이 비어 200 응답인데 본문이 없을 수 있음.
    // 연결 가능 여부만 보면 충분하므로 32 정도로 잡는다.
    max_completion_tokens: 32,
    messages: [{ role: "user", content: "Hi" }],
  };

  console.log("[openai.testConnection] 요청:", { url: OPENAI_CHAT_URL, model, apiKeyPrefix: apiKey.slice(0, 8) });

  let response: Response;
  try {
    response = await fetch(OPENAI_CHAT_URL, {
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
