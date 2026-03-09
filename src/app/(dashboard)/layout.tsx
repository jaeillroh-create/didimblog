"use client";

import { Sidebar } from "@/components/layout/sidebar";

/** 대시보드 레이아웃 — 사이드바 + 메인 콘텐츠 영역 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 bg-[var(--neutral-bg)] overflow-auto min-h-screen">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
