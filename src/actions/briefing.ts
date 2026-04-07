"use server";

import { createClient } from "@/lib/supabase/server";
import { generateFull } from "@/lib/llm";
import type { LLMConfig } from "@/lib/types/database";
import { PROMPT_BRIEFING_GENERATE } from "@/lib/constants/prompts";

// ── 타입 정의 ──

interface GenerateBriefingInput {
  topic: string;
  categoryId?: string;
  llmConfigId?: number;
}

export interface BriefingData {
  categoryId: string;
  secondaryCategoryId: string;
  topic: string;
  keyword: string;
  targetAudience: string;
  episode: string;
  additionalContext: string;
}

interface BriefingResult {
  success: boolean;
  briefing?: BriefingData;
  error?: string;
}

// ── 헬퍼 함수 ──

async function getActiveLLMConfig(
  supabase: Awaited<ReturnType<typeof createClient>>,
  configId?: number
): Promise<LLMConfig | null> {
  if (configId) {
    const { data } = await supabase
      .from("llm_configs")
      .select("*")
      .eq("id", configId)
      .eq("is_active", true)
      .single();
    return data as LLMConfig | null;
  }
  const { data } = await supabase
    .from("llm_configs")
    .select("*")
    .eq("is_default", true)
    .eq("is_active", true)
    .single();

  if (data) return data as LLMConfig;

  const { data: fallback } = await supabase
    .from("llm_configs")
    .select("*")
    .eq("is_active", true)
    .order("id", { ascending: true })
    .limit(1)
    .single();

  return (fallback as LLMConfig) ?? null;
}

async function decryptApiKey(encryptedKey: string): Promise<string> {
  try {
    return Buffer.from(encryptedKey, "base64").toString("utf-8");
  } catch {
    return encryptedKey;
  }
}

function parseJsonResponse(text: string): Record<string, unknown> | null {
  // ```json 펜스 제거
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

const VALID_PRIMARY_CATEGORIES = ["CAT-A", "CAT-B", "CAT-B-03", "CAT-C"];
const VALID_SECONDARY_CATEGORIES = [
  "CAT-A-01", "CAT-A-02", "CAT-A-03",
  "CAT-B-01", "CAT-B-02", "CAT-B-03",
  "CAT-C-01", "CAT-C-02", "CAT-C-03",
];

// ── Server Action ──

export async function generateBriefing(
  input: GenerateBriefingInput
): Promise<BriefingResult> {
  try {
    const supabase = await createClient();

    const llmConfig = await getActiveLLMConfig(supabase, input.llmConfigId);
    if (!llmConfig) {
      return { success: false, error: "활성화된 LLM 설정이 없습니다. 설정 > AI 설정에서 LLM을 등록해주세요." };
    }

    if (!llmConfig.api_key_encrypted) {
      return { success: false, error: "API 키가 설정되지 않았습니다." };
    }

    const apiKey = await decryptApiKey(llmConfig.api_key_encrypted);

    let systemPrompt = PROMPT_BRIEFING_GENERATE;
    if (input.categoryId) {
      systemPrompt += `\n\n카테고리는 반드시 ${input.categoryId}를 사용하세요.`;
    }

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: `주제: ${input.topic}` },
    ];

    const result = await generateFull(
      {
        provider: llmConfig.provider,
        model: llmConfig.model_id,
        apiKey,
        maxTokens: 1024,
        temperature: 0.7,
      },
      messages
    );

    const parsed = parseJsonResponse(result);
    if (!parsed) {
      return { success: false, error: "브리핑 생성에 실패했습니다. 직접 입력해주세요." };
    }

    const briefing: BriefingData = {
      categoryId: String(parsed.categoryId || "CAT-A"),
      secondaryCategoryId: String(parsed.secondaryCategoryId || ""),
      topic: String(parsed.topic || input.topic),
      keyword: String(parsed.keyword || ""),
      targetAudience: String(parsed.targetAudience || ""),
      episode: String(parsed.episode || ""),
      additionalContext: String(parsed.additionalContext || ""),
    };

    // 카테고리 유효성 검증
    if (!VALID_PRIMARY_CATEGORIES.includes(briefing.categoryId)) {
      briefing.categoryId = "CAT-A";
    }
    if (
      briefing.secondaryCategoryId &&
      !VALID_SECONDARY_CATEGORIES.includes(briefing.secondaryCategoryId)
    ) {
      briefing.secondaryCategoryId = "";
    }

    return { success: true, briefing };
  } catch (error) {
    console.error("브리핑 생성 오류:", error);
    return { success: false, error: "브리핑 생성 중 오류가 발생했습니다. 다시 시도해주세요." };
  }
}
