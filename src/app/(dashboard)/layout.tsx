import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";

/** 대시보드 레이아웃 — 인증 체크 + 사이드바 + 메인 콘텐츠 영역 */
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

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 bg-[var(--neutral-bg)] overflow-auto min-h-screen">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
