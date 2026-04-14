"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateImage } from "@/lib/llm/providers/image-gen";
import { PROMPT_IMAGE_INFOGRAPHIC } from "@/lib/constants/prompts";
import type { LLMConfig } from "@/lib/types/database";

// ── 타입 정의 ──

interface GenerateImageInput {
  description: string;
  blogTopic: string;
  categoryId?: string;
  generationId: number;
  markerIndex: number;
}

interface GenerateImageResult {
  success: boolean;
  imageUrl?: string;
  imageId?: string;
  error?: string;
}

interface GenerateAllImagesInput {
  generationId: number;
  blogTopic: string;
  categoryId?: string;
  markers: { index: number; description: string }[];
}

interface GenerateAllImagesResult {
  success: boolean;
  images: { markerIndex: number; imageUrl?: string; error?: string }[];
}

interface GetGeneratedImagesResult {
  success: boolean;
  images?: Array<{
    marker_index: number;
    public_url: string | null;
    status: string;
    alt_text: string | null;
  }>;
  error?: string;
}

// ── 헬퍼 ──

async function getOpenAIConfig(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<LLMConfig | null> {
  const { data } = await supabase
    .from("llm_configs")
    .select("*")
    .eq("provider", "openai")
    .eq("is_active", true)
    .limit(1)
    .single();
  return data as LLMConfig | null;
}

async function decryptApiKey(encryptedKey: string): Promise<string> {
  try {
    return Buffer.from(encryptedKey, "base64").toString("utf-8");
  } catch {
    return encryptedKey;
  }
}

function buildImagePrompt(description: string, blogTopic: string): string {
  return PROMPT_IMAGE_INFOGRAPHIC
    .replace("{{description}}", description)
    .replace("{{blog_topic}}", blogTopic);
}

// ── Server Actions ──

export async function checkImageGenAvailable(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const config = await getOpenAIConfig(supabase);
    return !!config?.api_key_encrypted;
  } catch {
    return false;
  }
}

export async function generateInfographic(
  input: GenerateImageInput
): Promise<GenerateImageResult> {
  try {
    const supabase = await createClient();

    const openaiConfig = await getOpenAIConfig(supabase);
    if (!openaiConfig?.api_key_encrypted) {
      return {
        success: false,
        error: "이미지 생성을 위해 설정 > AI 설정에서 OpenAI API를 등록해주세요.",
      };
    }

    const apiKey = await decryptApiKey(openaiConfig.api_key_encrypted);
    const prompt = buildImagePrompt(input.description, input.blogTopic);

    // 사전 검증: ai_generations row 존재 확인 (FK 위반 방지)
    const { data: parentGen, error: parentError } = await supabase
      .from("ai_generations")
      .select("id, status")
      .eq("id", input.generationId)
      .maybeSingle();

    if (parentError) {
      console.error("[generateInfographic] ai_generations 조회 실패:", parentError);
      return {
        success: false,
        error: `상위 생성 레코드 조회 실패: ${parentError.message} (code=${parentError.code})`,
      };
    }
    if (!parentGen) {
      return {
        success: false,
        error: `상위 생성 레코드(id=${input.generationId})를 찾을 수 없습니다. 초안을 먼저 저장한 뒤 이미지를 생성해주세요.`,
      };
    }

    // generated_images 레코드 생성 (generating)
    // RLS(authenticated) 가 끊긴 세션에서 거부할 수 있으므로 service-role 우선
    const dbClient = createAdminClient() ?? supabase;
    const usingServiceRole = dbClient !== supabase;

    const { data: imageRecord, error: insertError } = await dbClient
      .from("generated_images")
      .insert({
        generation_id: input.generationId,
        marker_index: input.markerIndex,
        description: input.description,
        prompt_used: prompt,
        image_provider: "openai",
        image_model: "dall-e-3",
        status: "generating",
      })
      .select("id")
      .single();

    if (insertError || !imageRecord) {
      console.error("[generateInfographic] 이미지 레코드 INSERT 실패:", {
        error: insertError,
        usingServiceRole,
        generationId: input.generationId,
        markerIndex: input.markerIndex,
      });
      const detail = insertError?.message ?? "(no message)";
      const code = insertError?.code ? ` code=${insertError.code}` : "";
      const hint = !usingServiceRole
        ? " — SUPABASE_SERVICE_ROLE_KEY 가 환경변수에 설정되어 있지 않으면 RLS 정책으로 거부되었을 수 있습니다."
        : "";
      return {
        success: false,
        error: `이미지 레코드 저장 실패${code}: ${detail}${hint}`,
      };
    }

    const startTime = Date.now();

    let imageResult;
    try {
      imageResult = await generateImage(apiKey, prompt);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : "이미지 생성 실패";

      // content policy 위반 체크
      const isPolicyViolation =
        errMsg.includes("content_policy") || errMsg.includes("safety");

      await dbClient
        .from("generated_images")
        .update({
          status: "failed",
          error_message: isPolicyViolation
            ? "이미지 생성 정책에 맞지 않는 요청입니다."
            : errMsg,
          generation_time_ms: Date.now() - startTime,
        })
        .eq("id", imageRecord.id);

      return {
        success: false,
        error: isPolicyViolation
          ? "이미지 생성 정책에 맞지 않는 요청입니다. 설명을 수정해주세요."
          : "이미지 생성에 실패했습니다. 다시 시도해주세요.",
      };
    }

    const genTimeMs = Date.now() - startTime;

    // Supabase Storage에 업로드
    const fileName = `gen-${input.generationId}/marker-${input.markerIndex}-${Date.now()}.png`;
    const imageBuffer = Buffer.from(imageResult.url, "base64");

    const { error: uploadError } = await supabase.storage
      .from("blog-images")
      .upload(fileName, imageBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("[generateInfographic] Storage 업로드 실패:", uploadError);
      await dbClient
        .from("generated_images")
        .update({
          status: "failed",
          error_message: `Storage 업로드 실패: ${uploadError.message}`,
          generation_time_ms: genTimeMs,
        })
        .eq("id", imageRecord.id);

      return { success: false, error: `이미지 Storage 업로드 실패: ${uploadError.message}` };
    }

    // Public URL 생성
    const { data: publicUrlData } = supabase.storage
      .from("blog-images")
      .getPublicUrl(fileName);

    const publicUrl = publicUrlData.publicUrl;

    // DB 업데이트 (completed)
    await dbClient
      .from("generated_images")
      .update({
        status: "completed",
        storage_path: fileName,
        public_url: publicUrl,
        generation_time_ms: genTimeMs,
      })
      .eq("id", imageRecord.id);

    return {
      success: true,
      imageUrl: publicUrl,
      imageId: imageRecord.id,
    };
  } catch (error) {
    console.error("인포그래픽 생성 오류:", error);
    return { success: false, error: "이미지 생성 중 오류가 발생했습니다." };
  }
}

export async function generateAllInfographics(
  input: GenerateAllImagesInput
): Promise<GenerateAllImagesResult> {
  const results: GenerateAllImagesResult["images"] = [];

  // 순차 실행 (DALL-E rate limit 방지)
  for (const marker of input.markers) {
    const result = await generateInfographic({
      description: marker.description,
      blogTopic: input.blogTopic,
      categoryId: input.categoryId,
      generationId: input.generationId,
      markerIndex: marker.index,
    });

    results.push({
      markerIndex: marker.index,
      imageUrl: result.imageUrl,
      error: result.error,
    });
  }

  return { success: true, images: results };
}

export async function getGeneratedImages(
  generationId: number
): Promise<GetGeneratedImagesResult> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("generated_images")
      .select("marker_index, public_url, status, alt_text")
      .eq("generation_id", generationId)
      .eq("status", "completed")
      .order("marker_index", { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, images: data || [] };
  } catch (error) {
    console.error("이미지 목록 조회 오류:", error);
    return { success: false, error: "이미지 목록 조회에 실패했습니다." };
  }
}
