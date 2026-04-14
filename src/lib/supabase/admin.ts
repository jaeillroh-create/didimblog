/**
 * Service Role 기반 Supabase 클라이언트.
 * RLS를 우회하므로 관리자 검증 등 서버 사이드 최소 범위에서만 사용할 것.
 * SUPABASE_SERVICE_ROLE_KEY 가 설정되어 있지 않으면 null을 반환한다.
 */

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

export function createAdminClient(): SupabaseClient | null {
  const { supabaseUrl } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
