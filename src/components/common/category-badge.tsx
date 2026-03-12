"use client";

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
 * UCL Badge 패턴 적용
 */
export function CategoryBadge({ categoryId, categoryName, color }: CategoryBadgeProps) {
  const dotColor = color ?? "var(--brand)";

  return (
    <span
      className="ucl-badge ucl-badge-sm"
      style={{
        backgroundColor: "var(--g100)",
        color: "var(--g600)",
      }}
      data-category-id={categoryId}
    >
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: dotColor }}
        aria-hidden="true"
      />
      {categoryName}
    </span>
  );
}
