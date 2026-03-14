import type { ContentStatus } from "@/lib/types/database";

// ── 카테고리별 SEO 루브릭 ──

export interface RubricRange {
  min: number;
  max: number;
  weight: number;
}

export interface CategoryRubric {
  /** 본문 분량 (자) */
  bodyLength: RubricRange;
  /** 키워드 빈도 (회) */
  keywordFreq: RubricRange;
  /** 소제목 개수 */
  subHeadings: RubricRange;
  /** CTA 필수 여부 */
  ctaRequired: boolean;
  /** CTA 배점 */
  ctaWeight: number;
  /** CTA 미포함 시 보너스 (디딤 다이어리) */
  ctaAbsenceBonus?: number;
  /** 7단계 구조 필수 여부 */
  structureRequired: boolean;
  /** 제목 길이 (자) */
  titleLength: RubricRange;
  /** 태그 개수 */
  tagCount: RubricRange;
  /** 이미지 개수 */
  imageCount: RubricRange;
}

/**
 * 카테고리별 SEO 루브릭
 * 카테고리 ID 기반 매핑 (CAT-A, CAT-B, CAT-B-03, CAT-C)
 */
export const SEO_RUBRICS: Record<string, CategoryRubric> = {
  // 변리사의 현장 수첩
  "CAT-A": {
    bodyLength: { min: 1500, max: 2000, weight: 15 },
    keywordFreq: { min: 3, max: 5, weight: 15 },
    subHeadings: { min: 2, max: 3, weight: 10 },
    ctaRequired: true,
    ctaWeight: 10,
    structureRequired: true,
    titleLength: { min: 25, max: 30, weight: 10 },
    tagCount: { min: 10, max: 10, weight: 5 },
    imageCount: { min: 3, max: 5, weight: 10 },
  },

  // IP 라운지 (일반)
  "CAT-B": {
    bodyLength: { min: 1500, max: 2000, weight: 15 },
    keywordFreq: { min: 3, max: 5, weight: 15 },
    subHeadings: { min: 2, max: 3, weight: 10 },
    ctaRequired: true,
    ctaWeight: 10,
    structureRequired: true,
    titleLength: { min: 25, max: 30, weight: 10 },
    tagCount: { min: 10, max: 10, weight: 5 },
    imageCount: { min: 3, max: 5, weight: 10 },
  },

  // IP 뉴스 한 입 (경량)
  "CAT-B-03": {
    bodyLength: { min: 800, max: 1200, weight: 15 },
    keywordFreq: { min: 2, max: 3, weight: 15 },
    subHeadings: { min: 0, max: 1, weight: 5 },
    ctaRequired: true,
    ctaWeight: 5,
    structureRequired: false,
    titleLength: { min: 25, max: 30, weight: 10 },
    tagCount: { min: 10, max: 10, weight: 5 },
    imageCount: { min: 1, max: 3, weight: 10 },
  },

  // 디딤 다이어리
  "CAT-C": {
    bodyLength: { min: 800, max: 1500, weight: 15 },
    keywordFreq: { min: 1, max: 2, weight: 10 },
    subHeadings: { min: 0, max: 2, weight: 0 },
    ctaRequired: false,
    ctaWeight: 0,
    ctaAbsenceBonus: 10,
    structureRequired: false,
    titleLength: { min: 15, max: 35, weight: 10 },
    tagCount: { min: 10, max: 10, weight: 5 },
    imageCount: { min: 1, max: 5, weight: 5 },
  },
};

/**
 * 카테고리 ID로 루브릭 조회
 * secondary → primary 폴백
 */
export function getRubric(categoryId: string | null): CategoryRubric {
  if (!categoryId) return SEO_RUBRICS["CAT-A"]; // 기본값

  // 정확한 매칭
  if (SEO_RUBRICS[categoryId]) return SEO_RUBRICS[categoryId];

  // 상위 카테고리 폴백 (CAT-A-01 → CAT-A)
  const parentId = categoryId.split("-").slice(0, 2).join("-");
  if (SEO_RUBRICS[parentId]) return SEO_RUBRICS[parentId];

  return SEO_RUBRICS["CAT-A"];
}

// ── 상태별 체크 범위 ──

/** 상태별 활성 SEO 항목 ID 범위 */
export const STATUS_CHECK_RANGES: Record<ContentStatus, string[]> = {
  // S0(기획): 제목 관련만
  S0: ["titleLength"],
  // S1(초안): + 본문, 키워드, 소제목, CTA
  S1: ["titleLength", "bodyLength", "keywordFreq", "subHeadings", "ctaCheck"],
  // S2(검토): + 이미지, 태그
  S2: [
    "titleLength",
    "bodyLength",
    "keywordFreq",
    "subHeadings",
    "ctaCheck",
    "imageCount",
    "tagCount",
  ],
  // S3+(발행예정 이상): 전체
  S3: [
    "titleLength",
    "bodyLength",
    "keywordFreq",
    "subHeadings",
    "ctaCheck",
    "imageCount",
    "tagCount",
  ],
  S4: [
    "titleLength",
    "bodyLength",
    "keywordFreq",
    "subHeadings",
    "ctaCheck",
    "imageCount",
    "tagCount",
  ],
  S5: [
    "titleLength",
    "bodyLength",
    "keywordFreq",
    "subHeadings",
    "ctaCheck",
    "imageCount",
    "tagCount",
  ],
};

/**
 * 점수 색상 결정
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 50) return "text-orange-500";
  return "text-red-500";
}

/**
 * 점수 배경색 결정
 */
export function getScoreBgColor(score: number): string {
  if (score >= 80) return "bg-green-50";
  if (score >= 50) return "bg-orange-50";
  return "bg-red-50";
}
