/**
 * Supabase 환경변수 검증
 * 누락 시 명확한 에러 로그를 남기고, 런타임에서 디버깅 가능하게 함
 */
export function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    const missing: string[] = [];
    if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
    if (!supabaseAnonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    console.error(
      `[Supabase] 환경변수 누락: ${missing.join(", ")}. ` +
        "Vercel Dashboard → Settings → Environment Variables에서 확인하세요. " +
        `URL 설정 여부: ${!!supabaseUrl}, ANON_KEY 설정 여부: ${!!supabaseAnonKey}`
    );
  }

  return {
    supabaseUrl: supabaseUrl ?? "",
    supabaseAnonKey: supabaseAnonKey ?? "",
  };
}
