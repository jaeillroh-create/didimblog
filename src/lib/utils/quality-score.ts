import type { QualityGrade } from "@/lib/types/database";

// 품질점수 계산 공식
// quality_score = (views_normalized * 40) + (duration_normalized * 30) + (conversion_normalized * 30)
// 각 지표 정규화: 해당 월 전체 글 대비 상대 점수 (0~100)

interface QualityInput {
  views: number;
  avgDurationSec: number;
  ctaClicks: number;
}

interface MonthlyStats {
  maxViews: number;
  maxDuration: number;
  maxCtaClicks: number;
}

export function calculateQualityScore(
  input: QualityInput,
  stats: MonthlyStats
): number {
  const viewsNormalized =
    stats.maxViews > 0 ? (input.views / stats.maxViews) * 100 : 0;
  const durationNormalized =
    stats.maxDuration > 0
      ? (input.avgDurationSec / stats.maxDuration) * 100
      : 0;
  const conversionNormalized =
    stats.maxCtaClicks > 0
      ? (input.ctaClicks / stats.maxCtaClicks) * 100
      : 0;

  return (
    viewsNormalized * 0.4 +
    durationNormalized * 0.3 +
    conversionNormalized * 0.3
  );
}

export function getQualityGrade(score: number): QualityGrade {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "average";
  if (score >= 20) return "poor";
  return "critical";
}
