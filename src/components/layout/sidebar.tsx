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
  ShieldCheck,
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
  { href: "/manage", icon: ShieldCheck, label: "글 관리" },
  { href: "/analytics", icon: BarChart3, label: "성과 분석" },
  { href: "/settings", icon: Settings, label: "설정" },
] as const;

interface SidebarProps {
  userName?: string;
  userRole?: string;
}

/** 사이드바 컴포넌트 — UCL 디자인 토큰 적용 */
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

  const initial = userName.charAt(0);

  return (
    <aside
      className={cn(
        "flex flex-col min-h-screen transition-all duration-300 relative",
        isCollapsed ? "w-16" : "w-60"
      )}
      style={{ background: "var(--g900)", color: "var(--white)" }}
    >
      {/* 상단: 로고 영역 */}
      <div className="flex items-center gap-2 px-4 py-5">
        <span className="t-xl text-white whitespace-nowrap">
          D!DiM
        </span>
        {!isCollapsed && (
          <span className="t-xs" style={{ color: "var(--g400)" }}>
            블로그 운영
          </span>
        )}
      </div>

      {/* 중간: 네비게이션 메뉴 */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAVIGATION_ITEMS.map((item) => {
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
      <div className="px-3 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-3">
          <div
            className="ucl-avatar shrink-0"
            style={{ width: "32px", height: "32px", fontSize: "12px" }}
          >
            {initial}
          </div>

          {!isCollapsed && (
            <div className="flex-1 overflow-hidden">
              <p className="t-sm font-semibold text-white truncate">
                {userName}
              </p>
              <p className="t-xs truncate" style={{ color: "var(--g400)" }}>
                {userRole}
              </p>
            </div>
          )}

          {!isCollapsed && (
            <button
              onClick={handleLogout}
              className="icon-btn shrink-0"
              style={{ color: "var(--g400)", width: "28px", height: "28px" }}
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
          "bg-white shadow-sm transition-colors duration-150"
        )}
        style={{ border: "1px solid var(--g200)", color: "var(--g600)" }}
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
