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
 * - provider 별 어댑터에 위임
 * - model 을 받아 사용자가 지정한 모델로 정확히 테스트
 * - 실패 시 상세 에러 메시지 반환 ({ success, error })
 */
export async function testConnection(
  provider: LLMProvider,
  apiKey: string,
  model: string
): Promise<{ success: boolean; error?: string }> {
  const providerModule = providers[provider];
  if (!providerModule) {
    return { success: false, error: `지원하지 않는 LLM 프로바이더: ${provider}` };
  }

  return providerModule.testConnection(apiKey, model);
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
