"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CategoryBadgeProps {
  /** 카테고리 ID */
  categoryId: string;
  /** 카테고리 이름 */
  categoryName: string;
  /** 카테고리 색상 (hex) — 미지정 시 기본 브랜드 색상 */
  color?: string;
}

/**
 * 색상 점 + 카테고리 이름을 표시하는 배지 컴포넌트
 */
export function CategoryBadge({ categoryId, categoryName, color }: CategoryBadgeProps) {
  const dotColor = color ?? "hsl(var(--brand-primary))";

  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center gap-1.5 border-muted font-normal text-sm px-2.5 py-0.5"
      )}
      data-category-id={categoryId}
    >
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: dotColor }}
        aria-hidden="true"
      />
      {categoryName}
    </Badge>
  );
}
