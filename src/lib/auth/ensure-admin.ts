/**
 * 현재 요청 사용자가 관리자(admin)인지 확인하는 공통 유틸.
 *
 * 문제 배경:
 * - profiles.role CHECK 제약이 ('admin','editor','designer')로 되어 있으나,
 *   signUp 로직이 role='pending'으로 upsert를 시도해 CHECK 위반으로 실패하는
 *   경우가 있고, 에러는 로깅 후 무시되어 profiles row가 생성되지 않는 사례가
 *   보고됨. 그 결과 saveLLMConfig 등의 admin 체크가 "관리자 권한이 필요합니다"
 *   로 실패.
 *
 * 다층 폴백 전략:
 *   1) 세션 클라이언트로 profiles 조회 (role == 'admin' 통과)
 *   2) service role 클라이언트로 재시도 (RLS 우회)
 *   3) ADMIN_EMAIL 하드코딩 폴백 (최초 관리자 부트스트랩)
 *
 * 모든 단계의 결과를 서버 로그로 남겨 Vercel Logs 에서 원인 파악이 가능하도록
 * 하고, 사용자에게 반환되는 에러는 간단한 메시지로 유지.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

const ADMIN_EMAIL = "jaeill.roh@gmail.com";

export interface EnsureAdminSuccess {
  success: true;
  userId: string;
  email: string | null;
  source: "session" | "service-role" | "admin-email";
}

export interface EnsureAdminFailure {
  success: false;
  error: string;
}

export type EnsureAdminResult = EnsureAdminSuccess | EnsureAdminFailure;

export async function ensureAdmin(
  supabase: SupabaseClient
): Promise<EnsureAdminResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("[ensureAdmin] auth.getUser 실패:", userError);
    return { success: false, error: "로그인이 필요합니다." };
  }

  const email = user.email ?? null;
  const debug: Record<string, unknown> = {
    userId: user.id,
    email,
  };

  // 1) 세션 클라이언트로 profiles 조회
  const { data: sessionProfile, error: sessionError } = await supabase
    .from("profiles")
    .select("role, email")
    .eq("id", user.id)
    .maybeSingle();

  debug.sessionProfile = sessionProfile;
  debug.sessionError = sessionError?.message;

  console.log("[ensureAdmin] 세션 조회 결과:", {
    userId: user.id,
    email,
    role: sessionProfile?.role ?? null,
    error: sessionError?.message ?? null,
  });

  if (sessionProfile?.role === "admin") {
    return { success: true, userId: user.id, email, source: "session" };
  }

  // 2) service role 클라이언트로 재시도 (RLS 우회)
  const adminClient = createAdminClient();
  if (adminClient) {
    const { data: adminProfile, error: adminError } = await adminClient
      .from("profiles")
      .select("role, email")
      .eq("id", user.id)
      .maybeSingle();

    debug.adminProfile = adminProfile;
    debug.adminError = adminError?.message;

    console.log("[ensureAdmin] service-role 재조회 결과:", {
      role: adminProfile?.role ?? null,
      error: adminError?.message ?? null,
    });

    if (adminProfile?.role === "admin") {
      return { success: true, userId: user.id, email, source: "service-role" };
    }
  } else {
    debug.adminClientAvailable = false;
    console.warn(
      "[ensureAdmin] SUPABASE_SERVICE_ROLE_KEY 미설정 — service-role 폴백 불가"
    );
  }

  // 3) ADMIN_EMAIL 부트스트랩 폴백
  if (email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    console.warn(
      "[ensureAdmin] profiles 조회는 실패했지만 ADMIN_EMAIL 일치 — 관리자로 통과",
      debug
    );
    return { success: true, userId: user.id, email, source: "admin-email" };
  }

  console.error("[ensureAdmin] 관리자 검증 실패:", debug);
  return {
    success: false,
    error:
      "관리자 권한이 필요합니다. (profiles 조회 실패 또는 role이 admin이 아님 — 서버 로그를 확인해주세요)",
  };
}
