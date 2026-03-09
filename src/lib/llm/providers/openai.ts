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

export async function testConnection(apiKey: string): Promise<boolean> {
  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 10,
    messages: [{ role: "user", content: "Hi" }],
  });
  return response.id !== undefined;
}
