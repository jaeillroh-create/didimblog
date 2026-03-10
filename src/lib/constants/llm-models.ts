import type { LLMProvider } from "@/lib/types/database";

export interface LLMModel {
  id: string;
  name: string;
  description: string;
}

export interface ProviderInfo {
  label: string;
  models: LLMModel[];
}

export const PROVIDER_INFO: Record<LLMProvider, ProviderInfo> = {
  claude: {
    label: "Claude (Anthropic)",
    models: [
      {
        id: "claude-sonnet-4-6",
        name: "Claude Sonnet 4.6",
        description: "빠르고 저렴, 블로그 초안 생성 추천",
      },
      {
        id: "claude-opus-4-6",
        name: "Claude Opus 4.6",
        description: "최고 성능, 복잡한 분석에 적합",
      },
    ],
  },
  openai: {
    label: "OpenAI (GPT)",
    models: [
      { id: "gpt-5.4", name: "GPT-5.4", description: "범용 고성능 모델" },
      { id: "gpt-5.4-pro", name: "GPT-5.4 Pro", description: "전문 분석용" },
      { id: "gpt-5.3-instant", name: "GPT-5.3 Instant", description: "빠른 응답" },
      { id: "gpt-5-mini", name: "GPT-5 mini", description: "경량 모델" },
    ],
  },
  gemini: {
    label: "Google (Gemini)",
    models: [
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", description: "고성능 분석" },
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash", description: "빠른 응답" },
      { id: "gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite", description: "경량 모델" },
    ],
  },
};

export const PROVIDERS: LLMProvider[] = ["claude", "openai", "gemini"];

/** 기본 추천 모델 ID */
export const DEFAULT_MODEL_ID = "claude-sonnet-4-6";

/** 기본 추천 프로바이더 */
export const DEFAULT_PROVIDER: LLMProvider = "claude";
