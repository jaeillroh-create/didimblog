import type { LLMMessage, LLMProvider, LLMStreamConfig } from "@/lib/types/database";
import * as claude from "./providers/claude";
import * as openai from "./providers/openai";
import * as gemini from "./providers/gemini";

const providers = {
  claude,
  openai,
  gemini,
} as const;

/**
 * LLM 통합 스트리밍 인터페이스
 * provider에 따라 적절한 SDK로 라우팅
 */
export async function* generateStream(
  config: LLMStreamConfig,
  messages: LLMMessage[]
): AsyncGenerator<string> {
  const provider = providers[config.provider];
  if (!provider) {
    throw new Error(`지원하지 않는 LLM 프로바이더: ${config.provider}`);
  }

  yield* provider.generateStream(config, messages);
}

/**
 * LLM 연결 테스트
 */
export async function testConnection(
  provider: LLMProvider,
  apiKey: string
): Promise<boolean> {
  const providerModule = providers[provider];
  if (!providerModule) {
    throw new Error(`지원하지 않는 LLM 프로바이더: ${provider}`);
  }

  return providerModule.testConnection(apiKey);
}

/**
 * 스트리밍 결과를 전체 텍스트로 수집
 */
export async function generateFull(
  config: LLMStreamConfig,
  messages: LLMMessage[]
): Promise<string> {
  let result = "";
  for await (const chunk of generateStream(config, messages)) {
    result += chunk;
  }
  return result;
}
