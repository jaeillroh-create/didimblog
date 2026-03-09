"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

interface NavItemProps {
  /** 링크 경로 */
  href: string;
  /** 아이콘 React 노드 */
  icon: React.ReactNode;
  /** 메뉴 라벨 (한국어) */
  label: string;
  /** 현재 활성 여부 */
  isActive: boolean;
  /** 사이드바 접힘 여부 */
  isCollapsed: boolean;
}

/** 사이드바 네비게이션 아이템 컴포넌트 */
export function NavItem({
  href,
  icon,
  label,
  isActive,
  isCollapsed,
}: NavItemProps) {
  return (
    <Link
      href={href}
      title={isCollapsed ? label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
        "text-[var(--neutral-text-on-dark)] transition-colors duration-150",
        "hover:bg-[var(--neutral-sidebar-hover)]",
        isActive
          ? "bg-[var(--neutral-sidebar-hover)] border-l-2 border-[var(--brand-cta)] opacity-100"
          : "opacity-70 border-l-2 border-transparent",
        isCollapsed && "justify-center px-0"
      )}
    >
      {/* 아이콘 */}
      <span className="flex-shrink-0">{icon}</span>

      {/* 라벨 - 접힌 상태에서는 숨김 */}
      {!isCollapsed && <span>{label}</span>}
    </Link>
  );
}
