# 품질 점수 원문

원본: `src/lib/utils/quality-score.ts`(전체), `SPEC.md` §5.3, 표시: `src/components/common/quality-badge.tsx`, `src/components/contents/quality-score.tsx`.
스크립트: `scripts/quality_score.py` (원본과 대조 일치).

## 규칙 요약
- `quality_score = views_norm×0.4 + duration_norm×0.3 + conversion_norm×0.3`
- 각 정규화 = 글의 값 ÷ 해당 월 전체 글의 최댓값 × 100. 최댓값이 0 이면 그 지표는 0. 입력: 조회수(views), 평균 체류시간 초(avgDurationSec), CTA 클릭 수(ctaClicks).
- 등급(getQualityGrade): 80↑ excellent, 60↑ good, 40↑ average, 20↑ poor, 그 외 critical.
- 뱃지 라벨(QualityBadge): 80↑ 우수, 60↑ 양호, 40↑ 보통, 20↑ 부진, 0↑ 위험. 표기 `{점수}점 · {라벨}`.
- 원형 점수 색(CircularScore): 80↑ `var(--success)`, 60↑ `var(--info)`, 40↑ `var(--warning)`, 그 외 `var(--danger)`.
- 상태가 S4(발행) 미만이면 점수 대신 "발행 후 측정됩니다". 표시 점수 = `quality_score_final ?? quality_score_1st ?? 0`, 1차와 최종이 다르면 "초기 N점 → 최종 M점".
- DB 필드: `quality_score_1st`(발행 2주 후 1차), `quality_score_final`(4주 후 최종), `quality_grade`. S4→S5 전이 조건이 `quality_score_final not null`(SPEC §5.1) — 상태 전이는 didim-blog-ops, 성과 수치 입력은 didim-blog-performance 담당.
- 코드상 `calculateQualityScore`/`getQualityGrade` 를 호출하는 곳은 없다(정의만 존재). 점수는 사람이 입력한 값을 표시한다 — 확인 필요.

## quality-score.ts 원문

```ts
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
```

## SPEC.md §5.3 원문

### 5.3 품질점수 계산 공식
```
quality_score = (views_normalized * 40) + (duration_normalized * 30) + (conversion_normalized * 30)

각 지표 정규화: 해당 월 전체 글 대비 상대 점수 (0~100)

등급:
- excellent: 80+
- good: 60~79
- average: 40~59
- poor: 20~39
- critical: 0~19
```


(SPEC 의 `×40/×30/×30` 은 0~100 정규화 값과 곱하면 0~10000 이 되므로, 코드의 `×0.4/×0.3/×0.3` 이 실제 규칙이다.)

## quality-badge.tsx 원문 (등급 표)

```tsx
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
```
