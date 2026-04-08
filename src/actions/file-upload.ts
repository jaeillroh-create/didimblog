"use server";

import { createClient } from "@/lib/supabase/server";
import { generateFull } from "@/lib/llm";
import type { LLMConfig } from "@/lib/types/database";
import { PROMPT_BRIEFING_FROM_FILE } from "@/lib/constants/prompts";
import type { BriefingData } from "@/actions/briefing";

// ── 타입 정의 ──

interface FileAnalysisInput {
  fileBase64: string;
  fileName: string;
  fileType: string;
  categoryId?: string;
  llmConfigId?: number;
}

interface FileAnalysisResult {
  success: boolean;
  extractedText?: string;
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
  let cleaned = text.trim();

  // ```json ... ``` 블록 추출
  if (cleaned.includes("```")) {
    const match = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (match) cleaned = match[1].trim();
  }

  // JSON 객체 부분만 추출 (첫 번째 { 부터 마지막 } 까지)
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // 아래로 폴백
    }
  }

  // 전체를 시도
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

const VALID_PRIMARY_CATEGORIES = ["CAT-A", "CAT-B", "CAT-B-03", "CAT-C"];
const VALID_SECONDARY_CATEGORIES = [
  "CAT-A-01", "CAT-A-02", "CAT-A-03", "CAT-A-04",
  "CAT-B-01", "CAT-B-02", "CAT-B-03",
  "CAT-C-01", "CAT-C-02", "CAT-C-03",
];

async function extractTextFromFile(
  fileBase64: string,
  fileType: string
): Promise<string> {
  // TXT 파일
  if (fileType === "text/plain") {
    return Buffer.from(fileBase64, "base64").toString("utf-8");
  }

  // DOCX 파일
  if (
    fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    const buffer = Buffer.from(fileBase64, "base64");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // PDF와 이미지는 Claude Vision API로 처리하므로 빈 문자열 반환
  return "";
}

function isVisionFile(fileType: string): boolean {
  return (
    fileType === "application/pdf" ||
    fileType.startsWith("image/")
  );
}

function getMediaType(
  fileType: string
): "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  if (fileType === "application/pdf") return "application/pdf";
  if (fileType === "image/png") return "image/png";
  if (fileType === "image/webp") return "image/webp";
  if (fileType === "image/gif") return "image/gif";
  return "image/jpeg";
}

// ── Server Action ──

export async function analyzeFileForBriefing(
  input: FileAnalysisInput
): Promise<FileAnalysisResult> {
  try {
    const supabase = await createClient();

    const llmConfig = await getActiveLLMConfig(supabase, input.llmConfigId);
    if (!llmConfig) {
      return { success: false, error: "활성화된 LLM 설정이 없습니다." };
    }

    if (!llmConfig.api_key_encrypted) {
      return { success: false, error: "API 키가 설정되지 않았습니다." };
    }

    const apiKey = await decryptApiKey(llmConfig.api_key_encrypted);

    let systemPrompt = PROMPT_BRIEFING_FROM_FILE;
    if (input.categoryId) {
      systemPrompt += `\n\n카테고리는 반드시 ${input.categoryId}를 사용하세요.`;
    }

    // Vision API를 사용하는 파일 (PDF, 이미지)인 경우
    if (isVisionFile(input.fileType)) {
      // Claude Vision API를 통해 직접 분석
      // Claude provider만 vision 지원 — 다른 provider면 안내
      if (llmConfig.provider !== "claude") {
        return {
          success: false,
          error: "PDF/이미지 파일 분석은 Claude API에서만 지원됩니다. Claude LLM을 기본으로 설정해주세요.",
        };
      }

      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey });

      const contentType = input.fileType === "application/pdf" ? "document" : "image";
      const mediaType = getMediaType(input.fileType);

      const response = await client.messages.create({
        model: llmConfig.model_id,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: contentType,
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: input.fileBase64,
                },
              } as Parameters<typeof client.messages.create>[0]["messages"][0]["content"] extends Array<infer T> ? T : never,
              {
                type: "text",
                text: "이 문서의 내용을 분석하여 블로그 브리핑 양식을 JSON으로 작성해주세요.",
              },
            ],
          },
        ],
      });

      const resultText =
        response.content[0].type === "text" ? response.content[0].text : "";

      const parsed = parseJsonResponse(resultText);
      if (!parsed) {
        return { success: false, error: "파일 분석 결과를 파싱할 수 없습니다. 다른 형식으로 시도해주세요." };
      }

      const briefing = buildBriefingFromParsed(parsed, input);
      return { success: true, briefing };
    }

    // 텍스트 추출 가능한 파일 (TXT, DOCX)
    let extractedText: string;
    try {
      extractedText = await extractTextFromFile(input.fileBase64, input.fileType);
    } catch {
      return { success: false, error: "파일을 읽을 수 없습니다. PDF나 TXT로 변환 후 다시 시도해주세요." };
    }

    if (!extractedText.trim()) {
      return { success: false, error: "파일에서 텍스트를 추출할 수 없습니다." };
    }

    // 8,000자 제한
    const truncated = extractedText.length > 8000;
    const fileContent = truncated ? extractedText.slice(0, 8000) : extractedText;

    const userMessage = `[문서 내용]\n${fileContent}${truncated ? "\n\n(파일이 길어 앞부분만 포함되었습니다)" : ""}`;

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userMessage },
    ];

    const result = await generateFull(
      {
        provider: llmConfig.provider,
        model: llmConfig.model_id,
        apiKey,
        maxTokens: 4096,
        temperature: 0.7,
      },
      messages
    );

    const parsed = parseJsonResponse(result);
    if (!parsed) {
      console.error("[file-upload] JSON 파싱 실패. LLM 전체 원문:", result);
      return { success: false, error: "브리핑 생성 결과를 파싱할 수 없습니다. LLM 응답 형식 오류." };
    }

    const briefing = buildBriefingFromParsed(parsed, input);
    return {
      success: true,
      extractedText: truncated ? `${fileContent}\n\n(앞 8,000자만 분석됨)` : fileContent,
      briefing,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("파일 분석 상세 오류:", errMsg);
    return { success: false, error: `파일 분석 실패: ${errMsg.slice(0, 100)}` };
  }
}

function buildBriefingFromParsed(
  parsed: Record<string, unknown>,
  input: { fileBase64?: string; fileName?: string; categoryId?: string }
): BriefingData {
  const briefing: BriefingData = {
    categoryId: String(parsed.categoryId || "CAT-A"),
    secondaryCategoryId: String(parsed.secondaryCategoryId || ""),
    topic: String(parsed.topic || ""),
    keyword: String(parsed.keyword || ""),
    targetAudience: String(parsed.targetAudience || ""),
    episode: String(parsed.episode || ""),
    additionalContext: String(parsed.additionalContext || ""),
  };

  if (!VALID_PRIMARY_CATEGORIES.includes(briefing.categoryId)) {
    briefing.categoryId = "CAT-A";
  }
  if (
    briefing.secondaryCategoryId &&
    !VALID_SECONDARY_CATEGORIES.includes(briefing.secondaryCategoryId)
  ) {
    briefing.secondaryCategoryId = "";
  }

  return briefing;
}
