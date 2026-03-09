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

export async function testConnection(apiKey: string): Promise<boolean> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 10,
    messages: [{ role: "user", content: "Hi" }],
  });
  return response.id !== undefined;
}
