import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    // 인증 체크
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    // 활성 LLM 전체 목록 조회
    const { data: configs, error } = await supabase
      .from("llm_configs")
      .select("*")
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("id", { ascending: true });

    if (error || !configs || configs.length === 0) {
      return Response.json({ error: "활성 LLM 설정이 없습니다." }, { status: 404 });
    }

    // 각 설정의 API 키 복호화
    const models = configs
      .filter((c) => c.api_key_encrypted)
      .map((c) => {
        let apiKey: string;
        try {
          apiKey = Buffer.from(c.api_key_encrypted, "base64").toString("utf-8");
        } catch {
          apiKey = c.api_key_encrypted;
        }
        return {
          id: c.id,
          displayName: c.display_name,
          model: c.model_id,
          provider: c.provider,
          apiKey,
          isDefault: c.is_default,
        };
      });

    if (models.length === 0) {
      return Response.json({ error: "API 키가 설정된 LLM이 없습니다." }, { status: 404 });
    }

    // 하위 호환: 기본 모델의 apiKey, model도 최상위에 포함
    const defaultModel = models.find((m) => m.isDefault) ?? models[0];

    return Response.json({
      apiKey: defaultModel.apiKey,
      model: defaultModel.model,
      provider: defaultModel.provider,
      configId: defaultModel.id,
      models,
    });
  } catch {
    return Response.json({ error: "LLM 설정 조회 실패" }, { status: 500 });
  }
}
