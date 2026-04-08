import { createClient } from "@/lib/supabase/server";
import { generateStream } from "@/lib/llm";
import type {
  LLMProvider,
  LLMMessage,
  LLMStreamConfig,
  LLMConfig,
  PromptTemplate,
} from "@/lib/types/database";
import {
  getPromptKey,
  getFieldCta,
  SYSTEM_PROMPTS,
  USER_PROMPTS,
} from "@/lib/constants/prompts";

// ── 헬퍼 (ai.ts의 private 함수 복제) ──

function replaceTemplateVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value || "");
  }
  return result;
}

async function decryptApiKey(encryptedKey: string): Promise<string> {
  try {
    return Buffer.from(encryptedKey, "base64").toString("utf-8");
  } catch {
    return encryptedKey;
  }
}

async function getActiveLLMConfig(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<LLMConfig | null> {
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

async function getPromptTemplate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  categoryId: string,
  templateType: string
): Promise<PromptTemplate | null> {
  const { data } = await supabase
    .from("prompt_templates")
    .select("*")
    .eq("category_id", categoryId)
    .eq("template_type", templateType)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  if (data) return data as PromptTemplate;

  const { data: category } = await supabase
    .from("categories")
    .select("parent_id")
    .eq("id", categoryId)
    .single();

  if (category?.parent_id) {
    const { data: parentTemplate } = await supabase
      .from("prompt_templates")
      .select("*")
      .eq("category_id", category.parent_id)
      .eq("template_type", templateType)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    if (parentTemplate) return parentTemplate as PromptTemplate;
  }

  const { data: fallback } = await supabase
    .from("prompt_templates")
    .select("*")
    .is("category_id", null)
    .eq("template_type", templateType)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  return fallback as PromptTemplate | null;
}

// ── 메인 생성 함수 ──

function classifyError(err: unknown): string {
  if (!(err instanceof Error)) return "알 수 없는 오류가 발생했습니다.";
  const msg = err.message;
  if (msg.includes("401") || msg.includes("authentication") || msg.includes("Unauthorized"))
    return "API 키가 유효하지 않습니다. 설정 > AI 설정에서 API 키를 확인해주세요.";
  if (msg.includes("429") || msg.includes("rate limit"))
    return "API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.";
  if (msg.includes("timeout") || msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND") || msg.includes("fetch failed"))
    return "네트워크 오류가 발생했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.";
  if (msg.includes("context_length") || msg.includes("max_tokens") || msg.includes("too long"))
    return "입력이 토큰 한도를 초과했습니다. 참고 사항을 줄이고 다시 시도해주세요.";
  return msg;
}

export async function runGeneration(
  generationId: number
): Promise<{ success: boolean; error?: string }> {
  const startTime = Date.now();
  const supabase = await createClient();

  try {
    // 생성 레코드 조회
    const { data: gen, error: fetchError } = await supabase
      .from("ai_generations")
      .select("*")
      .eq("id", generationId)
      .single();

    if (fetchError || !gen) {
      return { success: false, error: "생성 레코드를 찾을 수 없습니다." };
    }

    // 이미 generating/completed/failed 이면 중복 실행 방지
    if (gen.status !== "pending") {
      return { success: true };
    }

    // 상태를 generating으로 업데이트
    await supabase
      .from("ai_generations")
      .update({ status: "generating" })
      .eq("id", generationId);

    // LLM 설정 조회
    const llmConfig = await getActiveLLMConfig(supabase);
    if (!llmConfig?.api_key_encrypted) {
      await supabase
        .from("ai_generations")
        .update({ status: "failed", error_message: "LLM 설정 없음" })
        .eq("id", generationId);
      return { success: false, error: "LLM 설정이 없습니다." };
    }

    const apiKey = await decryptApiKey(llmConfig.api_key_encrypted);

    // 프롬프트 키 결정
    const effectiveCategoryId = gen.category_id || "";
    const promptKey = getPromptKey(effectiveCategoryId);

    // DB 프롬프트 템플릿 조회
    const template = effectiveCategoryId
      ? await getPromptTemplate(supabase, effectiveCategoryId, "draft_generation")
      : null;

    // 컨텍스트: 사용자 입력만 사용 (외부 API 호출 제거로 시간 단축)
    const enrichedContext = gen.additional_context || "";

    // 메시지 구성
    const messages: LLMMessage[] = [];

    const fieldCta = promptKey === "PROMPT_FIELD"
      ? getFieldCta(effectiveCategoryId)
      : { cta: "", emailSubject: "" };

    const templateVariables: Record<string, string> = {
      topic: gen.topic,
      keyword: gen.target_keyword || "",
      target_audience: "",
      additional_context: enrichedContext,
      subcategory: "",
      cta_text: fieldCta.cta,
      email_subject: fieldCta.emailSubject,
    };

    if (template) {
      messages.push({ role: "system", content: template.system_prompt });
      messages.push({
        role: "user",
        content: replaceTemplateVariables(template.user_prompt_template, templateVariables),
      });
    } else {
      messages.push({
        role: "system",
        content: replaceTemplateVariables(SYSTEM_PROMPTS[promptKey], templateVariables),
      });
      messages.push({
        role: "user",
        content: replaceTemplateVariables(USER_PROMPTS[promptKey], templateVariables),
      });
    }

    const streamConfig: LLMStreamConfig = {
      provider: llmConfig.provider as LLMProvider,
      model: llmConfig.model_id,
      apiKey,
      maxTokens: 3000,
      temperature: 0.5,
    };

    // 스트리밍으로 생성
    let fullText = "";
    for await (const chunk of generateStream(streamConfig, messages)) {
      fullText += chunk;
    }

    const generationTimeMs = Date.now() - startTime;

    // 제목 추출
    const lines = fullText.split("\n").filter((l) => l.trim());
    let title = lines[0]?.replace(/^#+\s*/, "").trim() || gen.topic;
    if (title.length > 50) title = title.substring(0, 50);

    // 태그 추출
    let tags: string[] | null = null;
    const tagsMatch = fullText.match(/\[TAGS\]\s*([\s\S]*?)\s*\[\/TAGS\]/);
    if (tagsMatch) {
      tags = tagsMatch[1]
        .split(/[,\n]/)
        .map((t) => t.replace(/^\d+\.\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 10);
    } else {
      const tagMatches = fullText.match(/#([^\s#]+)/g);
      tags = tagMatches ? tagMatches.map((t) => t.replace("#", "")).slice(0, 10) : null;
    }

    // ALT 텍스트 추출
    let imageAltTexts: string[] | null = null;
    const altMatch = fullText.match(/\[ALT_TEXTS\]\s*([\s\S]*?)\s*\[\/ALT_TEXTS\]/);
    if (altMatch) {
      imageAltTexts = altMatch[1]
        .split("\n")
        .map((line) => line.replace(/^\d+\.\s*/, "").trim())
        .filter(Boolean);
    }

    // 이미지 마커 추출
    const imageMarkerRegex = /\[IMAGE:\s*(.+?)\]/g;
    const imageMarkers: { position: number; description: string }[] = [];
    let match;
    while ((match = imageMarkerRegex.exec(fullText)) !== null) {
      imageMarkers.push({ position: match.index, description: match[1] });
    }

    // 이미지 마커에 ALT 텍스트 매핑
    if (imageAltTexts && imageAltTexts.length > 0) {
      imageMarkers.forEach((marker, i) => {
        if (imageAltTexts[i]) {
          (marker as Record<string, unknown>).alt_text = imageAltTexts[i];
        }
      });
    }

    // 결과 저장
    await supabase
      .from("ai_generations")
      .update({
        status: "completed",
        generated_text: fullText,
        generated_title: title,
        generated_tags: tags,
        image_markers: imageMarkers.length > 0 ? imageMarkers : null,
        tokens_used: Math.ceil(fullText.length / 4),
        generation_time_ms: generationTimeMs,
      })
      .eq("id", generationId);

    // 토큰 사용량 업데이트
    const estimatedTokens = Math.ceil(fullText.length / 4);
    await supabase
      .from("llm_configs")
      .update({
        monthly_tokens_used: llmConfig.monthly_tokens_used + estimatedTokens,
      })
      .eq("id", llmConfig.id);

    return { success: true };
  } catch (err) {
    const errorMessage = classifyError(err);
    await supabase
      .from("ai_generations")
      .update({
        status: "failed",
        error_message: errorMessage,
        generation_time_ms: Date.now() - startTime,
      })
      .eq("id", generationId);

    return { success: false, error: errorMessage };
  }
}
