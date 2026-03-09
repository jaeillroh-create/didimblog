"use server";

import { createClient } from "@/lib/supabase/server";

const ADMIN_EMAIL = "jaeill.roh@gmail.com";

/** 회원가입: Supabase Auth 계정 생성 + profiles 테이블에 pending으로 추가 */
export async function signUp(formData: {
  name: string;
  email: string;
  password: string;
}): Promise<{ error: string | null }> {
  const { name, email, password } = formData;

  if (!name || !email || !password) {
    return { error: "모든 필드를 입력해주세요." };
  }

  if (password.length < 6) {
    return { error: "비밀번호는 6자 이상이어야 합니다." };
  }

  try {
    const supabase = await createClient();

    // 1. Supabase Auth에 사용자 생성
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      if (authError.message.includes("already registered")) {
        return { error: "이미 등록된 이메일입니다." };
      }
      return { error: authError.message };
    }

    if (!authData.user) {
      return { error: "회원가입에 실패했습니다." };
    }

    // 2. 첫 번째 사용자(admin 이메일)인지 확인
    const isFirstAdmin = email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

    // 3. profiles 테이블에 추가
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: authData.user.id,
      email,
      name,
      role: isFirstAdmin ? "admin" : "pending",
      avatar_url: null,
    });

    if (profileError) {
      console.error("[signUp] profiles 저장 에러:", profileError);
      // Auth 계정은 생성되었으므로 에러를 무시하고 진행
    }

    return { error: null };
  } catch (err) {
    console.error("[signUp] 에러:", err);
    return { error: "회원가입 중 오류가 발생했습니다." };
  }
}

/** 현재 사용자의 role 조회 */
export async function getCurrentUserRole(): Promise<{
  role: string | null;
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { role: null, error: "인증되지 않은 사용자입니다." };
    }

    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    // 프로필이 없으면 첫 번째 admin 이메일 확인
    if (!data) {
      const isAdmin =
        user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
      return { role: isAdmin ? "admin" : "pending", error: null };
    }

    return { role: data.role, error: null };
  } catch (err) {
    console.error("[getCurrentUserRole] 에러:", err);
    return { role: null, error: "역할 조회에 실패했습니다." };
  }
}
