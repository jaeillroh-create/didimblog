/**
 * 현재 요청 사용자가 관리자(admin)인지 확인하는 공통 유틸.
 *
 * 문제 배경:
 * - profiles.role CHECK 제약이 ('admin','editor','designer')로 되어 있으나,
 *   signUp 로직이 role='pending'으로 upsert를 시도해 CHECK 위반으로 실패하는
 *   경우가 있고, 에러는 로깅 후 무시되어 profiles row 가 생성되지 않는 사례가
 *   보고됨. 그 결과 saveLLMConfig 등의 admin 체크가 "관리자 권한이 필요합니다"
 *   로 실패.
 * - 또한 수동으로 profiles row 를 만들 때 id 컬럼 값이 auth.users.id 와 어긋난
 *   경우도 있어, id 대신 email 로도 찾아봐야 한다.
 *
 * 다층 폴백 전략:
 *   1) 세션 클라이언트로 profiles.id 매칭 조회
 *   2) service role 클라이언트로 profiles.id 매칭 재조회 (RLS 우회)
 *   3) service role / 세션 클라이언트로 profiles.email 매칭 조회 (id 어긋남 복구)
 *   4) ADMIN_EMAIL 하드코딩 부트스트랩 폴백
 *
 * 모든 단계의 결과를 서버 로그로 남겨 Vercel Logs 에서 원인 파악이 가능하도록
 * 하고, 실패 시 사용자에게 반환되는 에러 메시지에도 핵심 디버그 정보를 포함해
 * 개발자가 즉시 원인을 볼 수 있게 한다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

const ADMIN_EMAIL = "jaeill.roh@gmail.com";

export interface EnsureAdminSuccess {
  success: true;
  userId: string;
  email: string | null;
  source: "session-id" | "service-role-id" | "email" | "admin-email";
}

export interface EnsureAdminFailure {
  success: false;
  error: string;
}

export type EnsureAdminResult = EnsureAdminSuccess | EnsureAdminFailure;

type ProfileRow = { role: string | null; email: string | null } | null;

async function lookupProfileById(
  client: SupabaseClient,
  userId: string
): Promise<{ profile: ProfileRow; error: string | null }> {
  const { data, error } = await client
    .from("profiles")
    .select("role, email")
    .eq("id", userId)
    .maybeSingle();
  return { profile: (data as ProfileRow) ?? null, error: error?.message ?? null };
}

async function lookupProfileByEmail(
  client: SupabaseClient,
  email: string
): Promise<{ profile: ProfileRow; error: string | null }> {
  const { data, error } = await client
    .from("profiles")
    .select("role, email")
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  return { profile: (data as ProfileRow) ?? null, error: error?.message ?? null };
}

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
  const adminClient = createAdminClient();
  const hasServiceRole = !!adminClient;
  const steps: Array<{ step: string; role: string | null; error: string | null }> = [];

  // 1) 세션 클라이언트 + id
  const s1 = await lookupProfileById(supabase, user.id);
  steps.push({ step: "session-id", role: s1.profile?.role ?? null, error: s1.error });
  if (s1.profile?.role === "admin") {
    console.log("[ensureAdmin] PASS via session-id", { userId: user.id, email });
    return { success: true, userId: user.id, email, source: "session-id" };
  }

  // 2) service-role 클라이언트 + id
  if (adminClient) {
    const s2 = await lookupProfileById(adminClient, user.id);
    steps.push({ step: "service-role-id", role: s2.profile?.role ?? null, error: s2.error });
    if (s2.profile?.role === "admin") {
      console.log("[ensureAdmin] PASS via service-role-id", { userId: user.id, email });
      return { success: true, userId: user.id, email, source: "service-role-id" };
    }
  }

  // 3) email 기반 조회 (service-role 우선, 없으면 세션)
  if (email) {
    const emailClient = adminClient ?? supabase;
    const s3 = await lookupProfileByEmail(emailClient, email);
    steps.push({
      step: adminClient ? "service-role-email" : "session-email",
      role: s3.profile?.role ?? null,
      error: s3.error,
    });
    if (s3.profile?.role === "admin") {
      console.log("[ensureAdmin] PASS via email", { userId: user.id, email });
      return { success: true, userId: user.id, email, source: "email" };
    }
  }

  // 4) ADMIN_EMAIL 부트스트랩 폴백
  if (email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    console.warn("[ensureAdmin] PASS via ADMIN_EMAIL bootstrap", { userId: user.id, email, steps });
    return { success: true, userId: user.id, email, source: "admin-email" };
  }

  console.error("[ensureAdmin] 관리자 검증 실패:", { userId: user.id, email, hasServiceRole, steps });

  const stepSummary = steps
    .map((s) => `${s.step}:role=${s.role ?? "null"}${s.error ? ` err=${s.error}` : ""}`)
    .join(" | ");

  return {
    success: false,
    error:
      `관리자 권한이 필요합니다. ` +
      `[email=${email ?? "없음"} | service-role=${hasServiceRole ? "ON" : "OFF"} | ${stepSummary || "조회 단계 없음"}]`,
  };
}
