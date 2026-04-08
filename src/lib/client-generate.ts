/**
 * 클라이언트 사이드에서 Anthropic API를 직접 스트리밍 호출
 * Vercel 서버리스 타임아웃과 무관하게 동작
 */

export interface ClientGenerateParams {
  messages: { role: string; content: string }[];
  model: string;
  apiKey: string;
  onProgress?: (text: string) => void;
}

export async function clientGenerateDraft(
  params: ClientGenerateParams
): Promise<string> {
  // messages에서 system 메시지 분리 (Anthropic API는 system을 top-level로 받음)
  const systemMessage = params.messages.find((m) => m.role === "system");
  const userMessages = params.messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens: 4096,
    temperature: 0.7,
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

    // SSE 이벤트 파싱
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // 마지막 불완전한 줄은 버퍼에 유지

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
        // JSON 파싱 실패 무시
      }
    }
  }

  return fullText;
}

// ── 팩트체크 ──

export interface FactCheckIssue {
  category: string;
  severity: "high" | "medium" | "low";
  location: string;
  description: string;
  suggestion: string;
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

export async function clientFactCheck(params: {
  title: string;
  body: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  onProgress?: (text: string) => void;
}): Promise<{ success: boolean; result?: FactCheckResult; error?: string }> {
  try {
    const userMessage = `제목: ${params.title}\n\n본문:\n${params.body}`;

    const body: Record<string, unknown> = {
      model: params.model,
      max_tokens: 2048,
      temperature: 0.3,
      stream: true,
      messages: [{ role: "user", content: userMessage }],
      system: params.systemPrompt,
    };

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
      return { success: false, error: `API 오류 (${response.status}): ${errorBody.slice(0, 200)}` };
    }

    const reader = response.body?.getReader();
    if (!reader) return { success: false, error: "스트림을 읽을 수 없습니다." };

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

    // JSON 파싱
    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, error: "검증 결과를 파싱할 수 없습니다." };
    }

    const result = JSON.parse(jsonMatch[0]) as FactCheckResult;
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "팩트체크 실패" };
  }
}
