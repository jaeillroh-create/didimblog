"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CONTENT_STATES, type ContentStatus } from "@/lib/constants/content-states";

interface StatusBadgeProps {
  /** 콘텐츠 상태 코드 (S0~S5) */
  status: ContentStatus;
  /** 배지 크기 */
  size?: "sm" | "md";
}

/**
 * 콘텐츠 상태를 색상 배지로 표시하는 컴포넌트
 */
export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const state = CONTENT_STATES[status];

  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent font-medium",
        size === "sm" && "text-xs px-1.5 py-0",
        size === "md" && "text-sm px-2.5 py-0.5"
      )}
      style={{
        backgroundColor: `${state.color}20`,
        color: state.color,
      }}
    >
      {state.label}
    </Badge>
  );
}
