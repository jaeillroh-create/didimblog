import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    // 인증 체크
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    // 기본 LLM 설정 조회
    const { data: config } = await supabase
      .from("llm_configs")
      .select("*")
      .eq("is_default", true)
      .eq("is_active", true)
      .single();

    const llmConfig = config ?? (await supabase
      .from("llm_configs")
      .select("*")
      .eq("is_active", true)
      .order("id", { ascending: true })
      .limit(1)
      .single()).data;

    if (!llmConfig?.api_key_encrypted) {
      return Response.json({ error: "활성 LLM 설정이 없습니다." }, { status: 404 });
    }

    // API 키 복호화
    let apiKey: string;
    try {
      apiKey = Buffer.from(llmConfig.api_key_encrypted, "base64").toString("utf-8");
    } catch {
      apiKey = llmConfig.api_key_encrypted;
    }

    return Response.json({
      apiKey,
      model: llmConfig.model_id,
      provider: llmConfig.provider,
      configId: llmConfig.id,
      monthlyTokensUsed: llmConfig.monthly_tokens_used,
    });
  } catch {
    return Response.json({ error: "LLM 설정 조회 실패" }, { status: 500 });
  }
}
