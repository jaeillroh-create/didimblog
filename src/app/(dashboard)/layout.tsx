import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import type { Profile } from "@/lib/types/database";

/** 대시보드 레이아웃 — 인증 체크 + 사용자 정보 + 사이드바 + 메인 콘텐츠 영역 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // profiles 테이블에서 현재 사용자 정보 조회
  let profile: Pick<Profile, "name" | "role"> | null = null;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("name, role")
      .eq("id", user.id)
      .single();
    profile = data;
  } catch {
    // profiles 테이블이 없거나 조회 실패 시 무시
  }

  const userName = profile?.name ?? user.email?.split("@")[0] ?? "사용자";
  const userRole = profile?.role ?? "admin";

  const ROLE_LABELS: Record<string, string> = {
    admin: "관리자",
    editor: "에디터",
    designer: "디자이너",
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar
        userName={userName}
        userRole={ROLE_LABELS[userRole] ?? userRole}
      />
      <main className="flex-1 bg-[var(--neutral-bg)] overflow-auto min-h-screen">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
