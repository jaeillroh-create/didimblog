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

export async function testConnection(apiKey: string): Promise<boolean> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent("Hi");
  return result.response.text() !== undefined;
}
