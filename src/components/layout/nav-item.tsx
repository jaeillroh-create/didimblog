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

/** 사이드바 네비게이션 아이템 — UCL 토큰 적용 */
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
        "flex items-center gap-3 px-3 py-2 t-md transition-colors duration-150",
        isActive
          ? "bg-white/10 text-white font-semibold"
          : "text-white/60 hover:bg-white/5 hover:text-white/80",
        isCollapsed && "justify-center px-0"
      )}
      style={{ borderRadius: "var(--r-sm)" }}
    >
      <span className="flex-shrink-0">{icon}</span>
      {!isCollapsed && <span>{label}</span>}
    </Link>
  );
}
