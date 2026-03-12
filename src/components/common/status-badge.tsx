"use client";

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
 * UCL Badge 패턴 적용 (badge-dot 스타일)
 */
export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const state = CONTENT_STATES[status];

  return (
    <span
      className={cn(
        "ucl-badge badge-dot",
        size === "sm" && "ucl-badge-sm"
      )}
      style={{
        backgroundColor: `${state.color}18`,
        color: state.color,
      }}
    >
      {state.label}
    </span>
  );
}
