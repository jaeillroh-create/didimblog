import type { Content } from "@/lib/types/database";

// ── 추천 결과 타입 ──

export interface Recommendation {
  priority: "URGENT" | "PRIMARY" | "SECONDARY";
  category: string;
  categoryId: string;
  subCategory?: string;
  subCategoryId?: string;
  title: string;
  reason: string;
  keywords?: string[];
  newsUrl?: string;
  sourcePostId?: string;
}

// ── 월간 발행 통계 ──

export interface MonthlyPublishStats {
  field: number; // CAT-A
  lounge: number; // CAT-B
  diary: number; // CAT-C
}

// ── 카테고리별 월간 목표 ──

const MONTHLY_TARGETS: Record<string, number> = {
  "CAT-A": 2,
  "CAT-B": 1,
  "CAT-C": 1,
};

const CATEGORY_NAMES: Record<string, string> = {
  "CAT-A": "변리사의 현장 수첩",
  "CAT-B": "IP 라운지",
  "CAT-C": "디딤 다이어리",
};

// ── 카테고리 결정 ──

export function determineNeededCategory(
  stats: MonthlyPublishStats,
  lastPublishedCategoryId: string | null
): { categoryId: string; categoryName: string } {
  const gaps = [
    { categoryId: "CAT-A", gap: MONTHLY_TARGETS["CAT-A"] - stats.field },
    { categoryId: "CAT-B", gap: MONTHLY_TARGETS["CAT-B"] - stats.lounge },
    { categoryId: "CAT-C", gap: MONTHLY_TARGETS["CAT-C"] - stats.diary },
  ]
    .filter((g) => g.gap > 0)
    .sort((a, b) => b.gap - a.gap);

  if (gaps.length === 0) {
    // 모두 충족 → 현장수첩 기본 (매출 직결)
    return { categoryId: "CAT-A", categoryName: CATEGORY_NAMES["CAT-A"] };
  }

  // 전주와 같으면 차순위
  if (gaps[0].categoryId === lastPublishedCategoryId && gaps.length > 1) {
    const next = gaps[1];
    return {
      categoryId: next.categoryId,
      categoryName: CATEGORY_NAMES[next.categoryId],
    };
  }

  return {
    categoryId: gaps[0].categoryId,
    categoryName: CATEGORY_NAMES[gaps[0].categoryId],
  };
}

// ── 1차 카테고리 ID 추출 (2차 → 1차 폴백) ──

export function getPrimaryCategoryId(categoryId: string): string {
  if (["CAT-A", "CAT-B", "CAT-C"].includes(categoryId)) return categoryId;
  // CAT-A-01 → CAT-A
  const parts = categoryId.split("-");
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  return categoryId;
}

// ── 월간 발행 통계 계산 ──

export function calcMonthlyStats(
  publishedContents: Pick<Content, "category_id">[]
): MonthlyPublishStats {
  const stats: MonthlyPublishStats = { field: 0, lounge: 0, diary: 0 };

  for (const c of publishedContents) {
    const primary = getPrimaryCategoryId(c.category_id ?? "");
    if (primary === "CAT-A") stats.field++;
    else if (primary === "CAT-B") stats.lounge++;
    else if (primary === "CAT-C") stats.diary++;
  }

  return stats;
}

// ── 다이어리 2차 분류 추천 ──

const DIARY_SUBS = [
  { id: "CAT-C-01", name: "컨설팅 후기" },
  { id: "CAT-C-02", name: "디딤 일상" },
  { id: "CAT-C-03", name: "대표의 생각" },
];

export function suggestDiarySub(): { id: string; name: string } {
  return DIARY_SUBS[Math.floor(Math.random() * DIARY_SUBS.length)];
}

// ── 제목 제안 생성 ──

export function generateTitleSuggestion(keyword: string): string {
  const templates = [
    `${keyword} — 실무에서 꼭 알아야 할 핵심 정리`,
    `${keyword}, 대표님이 직접 확인해야 하는 이유`,
    `${keyword} 완벽 가이드 (2026년 최신)`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

// ── 뉴스 검색 키워드 ──

export const URGENT_NEWS_KEYWORDS = [
  "특허법 개정",
  "직무발명 판례",
  "AI 기본법",
  "세액공제 변경",
  "벤처인증 요건",
];
