"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** 품질 등급 정의 */
const QUALITY_GRADES = [
  { min: 80, label: "우수", className: "bg-quality-excellent/20 text-quality-excellent" },
  { min: 60, label: "양호", className: "bg-quality-good/20 text-quality-good" },
  { min: 40, label: "보통", className: "bg-quality-average/20 text-quality-average" },
  { min: 20, label: "부진", className: "bg-quality-poor/20 text-quality-poor" },
  { min: 0, label: "위험", className: "bg-quality-critical/20 text-quality-critical" },
] as const;

function getGrade(score: number) {
  return QUALITY_GRADES.find((g) => score >= g.min) ?? QUALITY_GRADES[QUALITY_GRADES.length - 1];
}

interface QualityBadgeProps {
  /** 품질 점수 (0~100) */
  score: number;
}

/**
 * 품질 점수와 등급을 표시하는 배지 컴포넌트
 */
export function QualityBadge({ score }: QualityBadgeProps) {
  const grade = getGrade(score);

  return (
    <Badge
      variant="outline"
      className={cn("border-transparent font-medium text-sm px-2.5 py-0.5", grade.className)}
    >
      {score}점 · {grade.label}
    </Badge>
  );
}
