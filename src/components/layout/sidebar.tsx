"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Calendar,
  FolderOpen,
  Users,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NavItem } from "@/components/layout/nav-item";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

/** 사이드바 네비게이션 메뉴 목록 */
const NAVIGATION_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "대시보드" },
  { href: "/contents", icon: FileText, label: "콘텐츠 관리" },
  { href: "/calendar", icon: Calendar, label: "발행 캘린더" },
  { href: "/categories", icon: FolderOpen, label: "카테고리" },
  { href: "/leads", icon: Users, label: "리드 추적" },
  { href: "/analytics", icon: BarChart3, label: "성과 분석" },
  { href: "/settings", icon: Settings, label: "설정" },
] as const;

interface SidebarProps {
  userName?: string;
  userRole?: string;
}

/** 사이드바 컴포넌트 - 네이비 배경, 접기/펼치기 지원 */
export function Sidebar({ userName = "사용자", userRole = "관리자" }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("로그아웃에 실패했습니다");
      return;
    }
    router.push("/login");
  };

  // 이름 첫 글자
  const initial = userName.charAt(0);

  return (
    <aside
      className={cn(
        "flex flex-col bg-[var(--neutral-sidebar)] text-[var(--neutral-text-on-dark)]",
        "min-h-screen transition-all duration-300 relative",
        isCollapsed ? "w-16" : "w-60"
      )}
    >
      {/* 상단: 로고 영역 */}
      <div className="flex items-center gap-2 px-4 py-5">
        <span className="text-xl font-bold text-white whitespace-nowrap">
          D!DiM
        </span>
        {!isCollapsed && (
          <span className="text-xs text-[var(--neutral-text-on-dark)] opacity-70">
            블로그 운영
          </span>
        )}
      </div>

      {/* 중간: 네비게이션 메뉴 */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAVIGATION_ITEMS.map((item) => {
          /** 현재 경로가 메뉴 경로와 일치하는지 확인 */
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <NavItem
              key={item.href}
              href={item.href}
              icon={<item.icon className="h-5 w-5" />}
              label={item.label}
              isActive={isActive}
              isCollapsed={isCollapsed}
            />
          );
        })}
      </nav>

      {/* 하단: 사용자 프로필 영역 + 로그아웃 */}
      <div className="border-t border-white/10 px-3 py-4">
        <div className="flex items-center gap-3">
          {/* 아바타 */}
          <div className="h-8 w-8 flex-shrink-0 rounded-full bg-[var(--brand-cta)] flex items-center justify-center">
            <span className="text-xs font-medium text-white">{initial}</span>
          </div>

          {/* 이름 + 역할 - 접힌 상태에서는 숨김 */}
          {!isCollapsed && (
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-[var(--neutral-text-on-dark)]">
                {userName}
              </p>
              <p className="truncate text-xs text-[var(--neutral-text-on-dark)] opacity-60">
                {userRole}
              </p>
            </div>
          )}

          {/* 로그아웃 버튼 */}
          {!isCollapsed && (
            <button
              onClick={handleLogout}
              className="shrink-0 rounded p-1 text-[var(--neutral-text-on-dark)] opacity-60 hover:opacity-100 transition-opacity"
              aria-label="로그아웃"
              title="로그아웃"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 접기/펼치기 토글 버튼 */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={cn(
          "absolute -right-3 top-7 z-10",
          "flex h-6 w-6 items-center justify-center rounded-full",
          "bg-white border border-[var(--neutral-border)] shadow-sm",
          "text-[var(--neutral-text-secondary)] hover:text-[var(--neutral-text)]",
          "transition-colors duration-150"
        )}
        aria-label={isCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
      >
        {isCollapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5" />
        )}
      </button>
    </aside>
  );
}
