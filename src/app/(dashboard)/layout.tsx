import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import type { Profile } from "@/lib/types/database";

const ROLE_LABELS: Record<string, string> = {
  admin: "관리자",
  editor: "에디터",
  designer: "디자이너",
};

/**
 * 대시보드 레이아웃
 * - 인증: 미들웨어에서 1차 처리, 여기서 2차 안전장치 (defense-in-depth)
 * - 사용자 정보 조회 후 사이드바에 전달
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 미들웨어에서 이미 리다이렉트하지만, 안전장치로 유지
  if (!user) {
    redirect("/login");
  }

  // profiles 테이블에서 현재 사용자 정보 조회
  let profile: Pick<Profile, "name" | "role"> | null = null;
  const { data } = await supabase
    .from("profiles")
    .select("name, role")
    .eq("id", user.id)
    .single();
  if (data) {
    profile = data;
  }

  const userName = profile?.name ?? user.email?.split("@")[0] ?? "사용자";
  const userRole = profile?.role ?? "admin";

  return (
    <div className="flex min-h-screen">
      <Sidebar
        userName={userName}
        userRole={ROLE_LABELS[userRole] ?? userRole}
      />
      <main className="flex-1 overflow-auto min-h-screen" style={{ background: "var(--g50)" }}>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
