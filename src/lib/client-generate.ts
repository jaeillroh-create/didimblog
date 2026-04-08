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
      max_tokens: 4096,
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

    // JSON 파싱 (3단계 + 잘린 JSON 복구)
    const parsed = parseFactCheckJson(fullText);
    if (!parsed) {
      return { success: false, error: "팩트체크 결과를 파싱할 수 없습니다. 수동으로 검토해주세요." };
    }

    return { success: true, result: parsed as FactCheckResult };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "팩트체크 실패" };
  }
}
