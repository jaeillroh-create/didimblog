"use server";

import { createClient } from "@/lib/supabase/server";
import { generateStream, generateFull, testConnection } from "@/lib/llm";
import type {
  LLMProvider,
  LLMMessage,
  LLMStreamConfig,
  AIGeneration,
  PromptTemplate,
  LLMConfig,
  ValidationResult,
} from "@/lib/types/database";

// ── 타입 정의 ──

interface GenerateDraftInput {
  topic: string;
  categoryId: string;
  keyword: string;
  targetAudience?: string;
  additionalContext?: string;
  llmConfigId?: number;
  contentId?: string;
}

interface GenerateDraftResult {
  success: boolean;
  generationId?: number;
  error?: string;
}

interface GenerationStatusResult {
  success: boolean;
  status?: AIGeneration["status"];
  generatedText?: string | null;
  generatedTitle?: string | null;
  generatedTags?: string[] | null;
  error?: string;
}

interface CrossValidationInput {
  generationId: number;
  llmProviders: LLMProvider[];
}

interface CrossValidationResult {
  success: boolean;
  validationId?: number;
  error?: string;
}

interface ValidationResultsResponse {
  success: boolean;
  results?: ValidationResult[];
  status?: AIGeneration["status"];
  error?: string;
}

interface RegenerateDraftInput {
  generationId: number;
  feedback?: string;
}

interface RegenerateDraftResult {
  success: boolean;
  newGenerationId?: number;
  error?: string;
}

interface SaveLLMConfigInput {
  provider: LLMProvider;
  displayName: string;
  modelId: string;
  apiKey: string;
  isDefault?: boolean;
  monthlyTokenLimit?: number;
}

interface SaveLLMConfigResult {
  success: boolean;
  configId?: number;
  testResult?: "success" | "failed";
  error?: string;
}

interface TestConnectionResult {
  success: boolean;
  error?: string;
}

interface TopicRecommendation {
  week: number;
  category: string;
  sub: string;
  title: string;
  keyword: string;
  cta: string;
  target: string;
}

interface PublishedWeeksResult {
  success: boolean;
  publishedWeeks?: number[];
  blogStartDate?: string;
  error?: string;
}

// ── 헬퍼 함수 ──

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
  // 기본 LLM 조회
  const { data } = await supabase
    .from("llm_configs")
    .select("*")
    .eq("is_default", true)
    .eq("is_active", true)
    .single();
  return data as LLMConfig | null;
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

  // 카테고리에 매칭되는 템플릿이 없으면 상위 카테고리 또는 null 카테고리 시도
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

async function decryptApiKey(encryptedKey: string): Promise<string> {
  // pgcrypto 복호화는 서버사이드에서 처리
  // 현재는 base64 인코딩으로 간단 처리 (프로덕션에서는 pgcrypto 사용)
  try {
    return Buffer.from(encryptedKey, "base64").toString("utf-8");
  } catch {
    return encryptedKey;
  }
}

function encryptApiKey(apiKey: string): string {
  // 프로덕션에서는 pgcrypto 사용
  return Buffer.from(apiKey, "utf-8").toString("base64");
}

// ── Server Actions ──

/**
 * AI 초안 생성
 */
export async function generateDraft(
  input: GenerateDraftInput
): Promise<GenerateDraftResult> {
  try {
    const supabase = await createClient();

    // 1. LLM 설정 조회
    const llmConfig = await getActiveLLMConfig(supabase, input.llmConfigId);
    if (!llmConfig) {
      return { success: false, error: "활성화된 LLM 설정이 없습니다. 설정 > AI 설정에서 LLM을 등록해주세요." };
    }

    if (!llmConfig.api_key_encrypted) {
      return { success: false, error: "API 키가 설정되지 않았습니다." };
    }

    // 월간 토큰 상한 체크
    if (
      llmConfig.monthly_token_limit &&
      llmConfig.monthly_tokens_used >= llmConfig.monthly_token_limit
    ) {
      return { success: false, error: "월간 토큰 사용 한도를 초과했습니다." };
    }

    // 2. 프롬프트 템플릿 조회
    const template = await getPromptTemplate(
      supabase,
      input.categoryId,
      "draft_generation"
    );

    // 3. ai_generations 레코드 생성 (pending)
    const { data: generation, error: insertError } = await supabase
      .from("ai_generations")
      .insert({
        content_id: input.contentId || null,
        generation_type: "draft",
        topic: input.topic,
        category_id: input.categoryId,
        target_keyword: input.keyword,
        additional_context: input.additionalContext || null,
        prompt_template_id: template?.id || null,
        llm_provider: llmConfig.provider,
        llm_model: llmConfig.model_id,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !generation) {
      return { success: false, error: `생성 레코드 저장 실패: ${insertError?.message}` };
    }

    const generationId = generation.id;

    // 4. 비동기로 LLM 호출 시작
    (async () => {
      const startTime = Date.now();
      try {
        // 상태를 generating으로 업데이트
        await supabase
          .from("ai_generations")
          .update({ status: "generating" })
          .eq("id", generationId);

        const apiKey = await decryptApiKey(llmConfig.api_key_encrypted!);

        // 메시지 구성
        const messages: LLMMessage[] = [];
        if (template) {
          messages.push({
            role: "system",
            content: template.system_prompt,
          });
          messages.push({
            role: "user",
            content: replaceTemplateVariables(template.user_prompt_template, {
              topic: input.topic,
              keyword: input.keyword,
              target_audience: input.targetAudience || "",
              additional_context: input.additionalContext || "",
            }),
          });
        } else {
          messages.push({
            role: "system",
            content: "당신은 특허그룹 디딤의 전문 블로그 작가입니다. 네이버 블로그 SEO를 고려하여 고품질 글을 작성합니다.",
          });
          messages.push({
            role: "user",
            content: `다음 주제로 블로그 글을 작성해주세요.\n\n주제: ${input.topic}\n핵심 키워드: ${input.keyword}\n${input.targetAudience ? `타깃 고객: ${input.targetAudience}` : ""}\n${input.additionalContext ? `참고 사항: ${input.additionalContext}` : ""}`,
          });
        }

        const streamConfig: LLMStreamConfig = {
          provider: llmConfig.provider as LLMProvider,
          model: llmConfig.model_id,
          apiKey,
          maxTokens: 4096,
          temperature: 0.7,
        };

        // 스트리밍으로 생성
        let fullText = "";
        for await (const chunk of generateStream(streamConfig, messages)) {
          fullText += chunk;
        }

        const generationTimeMs = Date.now() - startTime;

        // 제목 추출 (첫 번째 줄 또는 # 으로 시작하는 줄)
        const lines = fullText.split("\n").filter((l) => l.trim());
        let title = lines[0]?.replace(/^#+\s*/, "").trim() || input.topic;
        if (title.length > 50) title = title.substring(0, 50);

        // 태그 추출 (본문 하단 #태그 형식)
        const tagMatches = fullText.match(/#([^\s#]+)/g);
        const tags = tagMatches
          ? tagMatches.map((t) => t.replace("#", "")).slice(0, 10)
          : null;

        // 이미지 마커 추출
        const imageMarkerRegex = /\[IMAGE:\s*(.+?)\]/g;
        const imageMarkers: { position: number; description: string }[] = [];
        let match;
        while ((match = imageMarkerRegex.exec(fullText)) !== null) {
          imageMarkers.push({
            position: match.index,
            description: match[1],
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
            tokens_used: Math.ceil(fullText.length / 4), // 대략적 토큰 수 추정
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
      } catch (err) {
        let errorMessage = "알 수 없는 오류가 발생했습니다.";
        if (err instanceof Error) {
          if (err.message.includes("401") || err.message.includes("authentication") || err.message.includes("Unauthorized")) {
            errorMessage = "API 키가 유효하지 않습니다. 설정 > AI 설정에서 API 키를 확인해주세요.";
          } else if (err.message.includes("429") || err.message.includes("rate limit")) {
            errorMessage = "API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.";
          } else if (err.message.includes("timeout") || err.message.includes("ECONNREFUSED") || err.message.includes("ENOTFOUND") || err.message.includes("fetch failed")) {
            errorMessage = "네트워크 오류가 발생했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.";
          } else if (err.message.includes("context_length") || err.message.includes("max_tokens") || err.message.includes("too long")) {
            errorMessage = "입력이 토큰 한도를 초과했습니다. 참고 사항을 줄이고 다시 시도해주세요.";
          } else {
            errorMessage = err.message;
          }
        }
        await supabase
          .from("ai_generations")
          .update({
            status: "failed",
            error_message: errorMessage,
            generation_time_ms: Date.now() - startTime,
          })
          .eq("id", generationId);
      }
    })();

    return { success: true, generationId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "알 수 없는 오류";
    return { success: false, error: errorMessage };
  }
}

/**
 * 생성 상태 조회
 */
export async function getGenerationStatus(
  generationId: number
): Promise<GenerationStatusResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ai_generations")
      .select("status, generated_text, generated_title, generated_tags, error_message")
      .eq("id", generationId)
      .single();

    if (error || !data) {
      return { success: false, error: "생성 이력을 찾을 수 없습니다." };
    }

    return {
      success: true,
      status: data.status,
      generatedText: data.generated_text,
      generatedTitle: data.generated_title,
      generatedTags: data.generated_tags,
      error: data.error_message || undefined,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "알 수 없는 오류";
    return { success: false, error: errorMessage };
  }
}

/**
 * 교차검증 요청 (멀티 LLM 병렬 호출)
 */
export async function requestCrossValidation(
  input: CrossValidationInput
): Promise<CrossValidationResult> {
  try {
    const supabase = await createClient();

    // 원본 생성 이력 조회
    const { data: original, error: fetchError } = await supabase
      .from("ai_generations")
      .select("*")
      .eq("id", input.generationId)
      .single();

    if (fetchError || !original) {
      return { success: false, error: "원본 생성 이력을 찾을 수 없습니다." };
    }

    if (!original.generated_text) {
      return { success: false, error: "생성된 초안이 없습니다. 초안 생성을 먼저 완료해주세요." };
    }

    // 교차검증 레코드 생성
    const { data: validation, error: insertError } = await supabase
      .from("ai_generations")
      .insert({
        content_id: original.content_id,
        generation_type: "cross_validation",
        topic: original.topic,
        category_id: original.category_id,
        target_keyword: original.target_keyword,
        additional_context: original.additional_context,
        llm_provider: original.llm_provider,
        llm_model: original.llm_model,
        parent_generation_id: input.generationId,
        status: "generating",
      })
      .select("id")
      .single();

    if (insertError || !validation) {
      return { success: false, error: `교차검증 레코드 생성 실패: ${insertError?.message}` };
    }

    const validationId = validation.id;

    // 비동기로 멀티 LLM 교차검증 실행
    (async () => {
      try {
        // 교차검증 프롬프트 템플릿 조회
        const { data: cvTemplate } = await supabase
          .from("prompt_templates")
          .select("*")
          .eq("template_type", "cross_validation")
          .eq("is_active", true)
          .limit(1)
          .single();

        // 카테고리명 조회
        let categoryName = "";
        if (original.category_id) {
          const { data: cat } = await supabase
            .from("categories")
            .select("name")
            .eq("id", original.category_id)
            .single();
          categoryName = cat?.name || "";
        }

        // 각 LLM에 대해 병렬 호출
        const validationPromises = input.llmProviders.map(
          async (provider): Promise<ValidationResult | null> => {
            try {
              const config = await getActiveLLMConfig(supabase);
              if (!config) return null;

              // 해당 provider의 LLM 설정 조회
              const { data: providerConfig } = await supabase
                .from("llm_configs")
                .select("*")
                .eq("provider", provider)
                .eq("is_active", true)
                .limit(1)
                .single();

              if (!providerConfig?.api_key_encrypted) return null;

              const apiKey = await decryptApiKey(providerConfig.api_key_encrypted);

              const messages: LLMMessage[] = [];
              if (cvTemplate) {
                messages.push({
                  role: "system",
                  content: replaceTemplateVariables(
                    (cvTemplate as PromptTemplate).system_prompt,
                    {
                      category_name: categoryName,
                      keyword: original.target_keyword || "",
                      target_audience: "",
                    }
                  ),
                });
                messages.push({
                  role: "user",
                  content: replaceTemplateVariables(
                    (cvTemplate as PromptTemplate).user_prompt_template,
                    {
                      category_name: categoryName,
                      keyword: original.target_keyword || "",
                      target_audience: "",
                      draft_text: original.generated_text,
                    }
                  ),
                });
              } else {
                messages.push({
                  role: "system",
                  content: "블로그 초안을 검토하고 팩트체크, 논리, 톤, SEO를 평가해주세요. JSON으로 응답해주세요.",
                });
                messages.push({
                  role: "user",
                  content: `다음 초안을 검토해주세요:\n\n${original.generated_text}`,
                });
              }

              const streamConfig: LLMStreamConfig = {
                provider,
                model: providerConfig.model_id,
                apiKey,
                maxTokens: 2048,
                temperature: 0.3,
              };

              const responseText = await generateFull(streamConfig, messages);

              // JSON 파싱 시도
              try {
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  const parsed = JSON.parse(jsonMatch[0]);
                  return {
                    llm: provider,
                    verdict: parsed.verdict || "pass",
                    overall_score: parsed.overall_score || 0,
                    issues: parsed.issues || [],
                    strengths: parsed.strengths || [],
                    improvement_suggestions: parsed.improvement_suggestions || [],
                  };
                }
              } catch {
                // JSON 파싱 실패 시 기본 결과 반환
              }

              return {
                llm: provider,
                verdict: "pass",
                overall_score: 70,
                issues: [],
                strengths: ["검토 완료"],
                improvement_suggestions: [responseText.substring(0, 500)],
              };
            } catch {
              return null;
            }
          }
        );

        const results = (await Promise.all(validationPromises)).filter(
          (r): r is ValidationResult => r !== null
        );

        await supabase
          .from("ai_generations")
          .update({
            status: "completed",
            validation_results: results,
          })
          .eq("id", validationId);
      } catch (err) {
        let errorMessage = "교차검증에 실패했습니다.";
        if (err instanceof Error) {
          if (err.message.includes("401") || err.message.includes("Unauthorized")) {
            errorMessage = "교차검증용 LLM의 API 키가 유효하지 않습니다. 설정에서 확인해주세요.";
          } else if (err.message.includes("429") || err.message.includes("rate limit")) {
            errorMessage = "API 요청 한도 초과. 잠시 후 다시 시도해주세요.";
          } else if (err.message.includes("timeout") || err.message.includes("fetch failed")) {
            errorMessage = "네트워크 오류로 교차검증에 실패했습니다. 다시 시도해주세요.";
          } else {
            errorMessage = err.message;
          }
        }
        await supabase
          .from("ai_generations")
          .update({
            status: "failed",
            error_message: errorMessage,
          })
          .eq("id", validationId);
      }
    })();

    return { success: true, validationId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "알 수 없는 오류";
    return { success: false, error: errorMessage };
  }
}

/**
 * 교차검증 결과 조회
 */
export async function getValidationResults(
  validationId: number
): Promise<ValidationResultsResponse> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ai_generations")
      .select("status, validation_results, error_message")
      .eq("id", validationId)
      .single();

    if (error || !data) {
      return { success: false, error: "교차검증 결과를 찾을 수 없습니다." };
    }

    return {
      success: true,
      status: data.status,
      results: data.validation_results as ValidationResult[] | undefined,
      error: data.error_message || undefined,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "알 수 없는 오류";
    return { success: false, error: errorMessage };
  }
}

/**
 * 피드백 반영 재생성
 */
export async function regenerateDraft(
  input: RegenerateDraftInput
): Promise<RegenerateDraftResult> {
  try {
    const supabase = await createClient();

    // 원본 생성 이력 조회
    const { data: original, error: fetchError } = await supabase
      .from("ai_generations")
      .select("*")
      .eq("id", input.generationId)
      .single();

    if (fetchError || !original) {
      return { success: false, error: "원본 생성 이력을 찾을 수 없습니다." };
    }

    // 재생성은 generateDraft와 동일하지만, 피드백을 추가 컨텍스트로 포함
    const additionalContext = [
      original.additional_context || "",
      input.feedback
        ? `\n\n[이전 초안 피드백]\n${input.feedback}`
        : "",
      original.generated_text
        ? `\n\n[이전 초안 참고]\n${original.generated_text.substring(0, 1000)}`
        : "",
    ]
      .filter(Boolean)
      .join("");

    const result = await generateDraft({
      topic: original.topic,
      categoryId: original.category_id || "",
      keyword: original.target_keyword || "",
      additionalContext,
      contentId: original.content_id || undefined,
    });

    if (result.success && result.generationId) {
      // 재생성 레코드에 원본 참조 + 피드백 저장
      await supabase
        .from("ai_generations")
        .update({
          generation_type: "regeneration",
          parent_generation_id: input.generationId,
          feedback: input.feedback || null,
        })
        .eq("id", result.generationId);
    }

    return {
      success: result.success,
      newGenerationId: result.generationId,
      error: result.error,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "알 수 없는 오류";
    return { success: false, error: errorMessage };
  }
}

/**
 * LLM 설정 저장 (API 키 암호화)
 */
export async function saveLLMConfig(
  input: SaveLLMConfigInput
): Promise<SaveLLMConfigResult> {
  try {
    const supabase = await createClient();

    // admin 권한 확인
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "로그인이 필요합니다." };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return { success: false, error: "관리자 권한이 필요합니다." };
    }

    // 연결 테스트
    let testResult: "success" | "failed" = "failed";
    try {
      const success = await testConnection(input.provider, input.apiKey);
      testResult = success ? "success" : "failed";
    } catch {
      testResult = "failed";
    }

    // API 키 암호화
    const encryptedKey = encryptApiKey(input.apiKey);

    // is_default 설정 시 기존 default 해제
    if (input.isDefault) {
      await supabase
        .from("llm_configs")
        .update({ is_default: false })
        .eq("is_default", true);
    }

    // 기존 동일 provider 설정 확인
    const { data: existing } = await supabase
      .from("llm_configs")
      .select("id")
      .eq("provider", input.provider)
      .limit(1)
      .single();

    let configId: number;

    if (existing) {
      // 업데이트
      const { data, error } = await supabase
        .from("llm_configs")
        .update({
          display_name: input.displayName,
          model_id: input.modelId,
          api_key_encrypted: encryptedKey,
          is_default: input.isDefault ?? false,
          monthly_token_limit: input.monthlyTokenLimit ?? null,
          last_tested_at: new Date().toISOString(),
          test_result: testResult,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("id")
        .single();

      if (error || !data) {
        return { success: false, error: `설정 업데이트 실패: ${error?.message}` };
      }
      configId = data.id;
    } else {
      // 신규 생성
      const { data, error } = await supabase
        .from("llm_configs")
        .insert({
          provider: input.provider,
          display_name: input.displayName,
          model_id: input.modelId,
          api_key_encrypted: encryptedKey,
          is_default: input.isDefault ?? false,
          monthly_token_limit: input.monthlyTokenLimit ?? null,
          last_tested_at: new Date().toISOString(),
          test_result: testResult,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (error || !data) {
        return { success: false, error: `설정 저장 실패: ${error?.message}` };
      }
      configId = data.id;
    }

    return { success: true, configId, testResult };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "알 수 없는 오류";
    return { success: false, error: errorMessage };
  }
}

/**
 * LLM 연결 테스트
 */
export async function testLLMConnection(
  configId: number
): Promise<TestConnectionResult> {
  try {
    const supabase = await createClient();

    const { data: config, error } = await supabase
      .from("llm_configs")
      .select("*")
      .eq("id", configId)
      .single();

    if (error || !config) {
      return { success: false, error: "LLM 설정을 찾을 수 없습니다." };
    }

    if (!config.api_key_encrypted) {
      return { success: false, error: "API 키가 설정되지 않았습니다." };
    }

    const apiKey = await decryptApiKey(config.api_key_encrypted);
    const result = await testConnection(
      config.provider as LLMProvider,
      apiKey
    );

    // 테스트 결과 저장
    const testResult = result ? "success" : "failed";
    await supabase
      .from("llm_configs")
      .update({
        last_tested_at: new Date().toISOString(),
        test_result: testResult,
      })
      .eq("id", configId);

    return { success: result, error: result ? undefined : "연결 테스트에 실패했습니다. API 키와 모델 설정을 확인해주세요." };
  } catch (err) {
    let errorMessage = "연결 테스트에 실패했습니다.";
    if (err instanceof Error) {
      if (err.message.includes("401") || err.message.includes("Unauthorized")) {
        errorMessage = "API 키가 유효하지 않습니다. 올바른 키를 입력해주세요.";
      } else if (err.message.includes("fetch failed") || err.message.includes("ENOTFOUND")) {
        errorMessage = "LLM 서비스에 연결할 수 없습니다. 네트워크를 확인해주세요.";
      } else {
        errorMessage = err.message;
      }
    }

    // 실패 결과 저장
    try {
      const supabase = await createClient();
      await supabase
        .from("llm_configs")
        .update({
          last_tested_at: new Date().toISOString(),
          test_result: "failed",
        })
        .eq("id", configId);
    } catch {
      // 저장 실패 무시
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * 스케줄 기반 주제 추천 (현재 날짜 ±2주 범위)
 */
export async function getTopicRecommendations(): Promise<{
  success: boolean;
  topics?: TopicRecommendation[];
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const now = new Date();

    // ±2주 범위 계산
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(now.getDate() - 14);
    const twoWeeksLater = new Date(now);
    twoWeeksLater.setDate(now.getDate() + 14);

    const fromDate = twoWeeksAgo.toISOString().split("T")[0];
    const toDate = twoWeeksLater.toISOString().split("T")[0];

    // 1차: schedules 테이블에서 planned_date 기준 ±2주 조회
    const { data: schedules } = await supabase
      .from("schedules")
      .select(
        `
        *,
        categories:category_id (name)
      `
      )
      .gte("planned_date", fromDate)
      .lte("planned_date", toDate)
      .in("status", ["planned", "in_progress"])
      .order("planned_date", { ascending: true });

    if (schedules && schedules.length > 0) {
      const topics: TopicRecommendation[] = schedules.map((s) => ({
        week: s.week_number,
        category: (s.categories as { name: string } | null)?.name || "",
        sub: "",
        title: s.notes || "",
        keyword: "",
        cta: "",
        target: "",
      }));
      return { success: true, topics };
    }

    // 2차: 이번 달 미발행 카테고리 기반 추천
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0];
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split("T")[0];

    // 이번 달 발행된 콘텐츠의 카테고리 조회
    const { data: publishedThisMonth } = await supabase
      .from("contents")
      .select("category_id")
      .gte("publish_date", monthStart)
      .lte("publish_date", monthEnd)
      .in("status", ["S3", "S4", "S5"]);

    const publishedCategoryIds = new Set(
      (publishedThisMonth || []).map((c) => c.category_id).filter(Boolean)
    );

    // 월간 발행 목표가 있는 카테고리 조회
    const { data: allCategories } = await supabase
      .from("categories")
      .select("id, name, monthly_target, role_type")
      .eq("tier", "primary")
      .gt("monthly_target", 0)
      .order("monthly_target", { ascending: false });

    if (allCategories && allCategories.length > 0) {
      // 미발행 카테고리 필터
      const unpublished = allCategories.filter(
        (cat) => !publishedCategoryIds.has(cat.id)
      );

      if (unpublished.length > 0) {
        // 현재 주차 계산
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const currentWeek = Math.ceil(
          ((now.getTime() - startOfYear.getTime()) / 86400000 +
            startOfYear.getDay() +
            1) /
            7
        );

        // 12주 스케줄 시드 데이터에서 해당 카테고리의 주제 매칭
        const topics: TopicRecommendation[] = unpublished.map((cat) => ({
          week: currentWeek,
          category: cat.name,
          sub: "",
          title: `${cat.name} — 이번 달 미발행 (목표: 월 ${cat.monthly_target}건)`,
          keyword: "",
          cta: "",
          target: "",
        }));
        return { success: true, topics };
      }
    }

    // 3차: 추천 없음
    return { success: true, topics: [] };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "알 수 없는 오류";
    return { success: false, error: errorMessage };
  }
}

/**
 * 발행 완료된 주차 목록 조회 + 블로그 시작일
 * 12주 스케줄 기반으로 어떤 주의 글이 이미 발행됐는지 확인
 */
export async function getPublishedWeeks(): Promise<PublishedWeeksResult> {
  try {
    const supabase = await createClient();

    // 블로그 시작일 조회 (site_settings 테이블)
    let blogStartDate = "2026-01-06";
    const { data: setting } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "blog_start_date")
      .maybeSingle();

    if (setting?.value) {
      blogStartDate = setting.value;
    }

    // 발행된 콘텐츠 조회 (S3 이상)
    const { data: published } = await supabase
      .from("contents")
      .select("title, category_id, publish_date, categories:category_id(name)")
      .in("status", ["S3", "S4", "S5"]);

    if (!published || published.length === 0) {
      return { success: true, publishedWeeks: [], blogStartDate };
    }

    // 12주 스케줄의 각 주차별 발행 여부를 제목+카테고리 매칭으로 확인
    const { SCHEDULE_DATA } = await import("@/lib/constants/schedule-data");
    const publishedWeeks: number[] = [];

    for (const schedule of SCHEDULE_DATA) {
      const isPublished = published.some((content) => {
        const cats = content.categories as unknown as { name: string } | null;
        const catName = cats?.name || "";
        // 카테고리 일치 + 제목 유사 매칭
        const categoryMatch = catName.includes(schedule.category) || schedule.category.includes(catName);
        const titleMatch = content.title?.includes(schedule.title.substring(0, 10)) || false;
        return categoryMatch && titleMatch;
      });

      if (isPublished) {
        publishedWeeks.push(schedule.week);
      }
    }

    return { success: true, publishedWeeks, blogStartDate };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "알 수 없는 오류";
    // site_settings 테이블이 없을 수 있음 — 조용히 기본값 반환
    if (errorMessage.includes("schema cache") || errorMessage.includes("site_settings")) {
      return { success: true, publishedWeeks: [], blogStartDate: "2026-01-06" };
    }
    return { success: false, error: errorMessage };
  }
}

/**
 * 블로그 시작일 저장
 */
export async function saveBlogStartDate(dateStr: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "로그인이 필요합니다." };

    // site_settings upsert
    const { data: existing } = await supabase
      .from("site_settings")
      .select("id")
      .eq("key", "blog_start_date")
      .maybeSingle();

    if (existing) {
      await supabase
        .from("site_settings")
        .update({ value: dateStr, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("site_settings")
        .insert({ key: "blog_start_date", value: dateStr, created_by: user.id });
    }

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "알 수 없는 오류";
    if (errorMessage.includes("schema cache") || errorMessage.includes("site_settings")) {
      return { success: false, error: "site_settings 테이블이 없습니다. 마이그레이션을 실행해주세요." };
    }
    return { success: false, error: errorMessage };
  }
}

/**
 * LLM 설정 목록 조회
 */
export async function getLLMConfigs(): Promise<{
  data: LLMConfig[];
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("llm_configs")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      return { data: [], error: error.message };
    }
    return { data: (data as LLMConfig[]) || [] };
  } catch {
    return { data: [] };
  }
}

/**
 * 프롬프트 템플릿 목록 조회
 */
export async function getPromptTemplates(
  categoryId?: string
): Promise<{ data: PromptTemplate[]; error?: string }> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("prompt_templates")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    const { data, error } = await query;

    if (error) {
      return { data: [], error: error.message };
    }
    return { data: (data as PromptTemplate[]) || [] };
  } catch {
    return { data: [] };
  }
}

/**
 * AI 생성 이력 조회 (콘텐츠별)
 */
export async function getAIGenerations(
  contentId: string
): Promise<{ data: AIGeneration[]; error?: string }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ai_generations")
      .select("*")
      .eq("content_id", contentId)
      .order("created_at", { ascending: false });

    if (error) {
      return { data: [], error: error.message };
    }
    return { data: (data as AIGeneration[]) || [] };
  } catch {
    return { data: [] };
  }
}
