"use client";

import { cn } from "@/lib/utils";

/** 품질 등급 정의 — UCL Badge 패턴 적용 */
const QUALITY_GRADES = [
  { min: 80, label: "우수", bg: "var(--success-light)", color: "var(--success)" },
  { min: 60, label: "양호", bg: "var(--info-light)", color: "var(--info)" },
  { min: 40, label: "보통", bg: "var(--warning-light)", color: "var(--warning)" },
  { min: 20, label: "부진", bg: "var(--danger-light)", color: "var(--danger)" },
  { min: 0, label: "위험", bg: "var(--danger-light)", color: "#7F1D1D" },
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
    <span
      className="ucl-badge font-num"
      style={{ backgroundColor: grade.bg, color: grade.color }}
    >
      {score}점 · {grade.label}
    </span>
  );
}
