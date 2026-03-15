import type { Content } from "@/lib/types/database";
import { getPrimaryCategoryId } from "@/lib/recommendation-engine";

// ── 내부 링크 추천 결과 ──

export interface InternalLinkSuggestion {
  contentId: string;
  title: string;
  relevanceScore: number;
  reason: string;
  categoryId: string;
}

// ── 키워드 기반 유사도 계산 ──

function calculateRelevance(
  source: Content,
  target: Content
): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  // 1. 같은 카테고리 가산 (+20)
  const sourcePrimary = getPrimaryCategoryId(source.category_id ?? "");
  const targetPrimary = getPrimaryCategoryId(target.category_id ?? "");
  if (sourcePrimary === targetPrimary) {
    score += 20;
    reasons.push("같은 카테고리");
  }

  // 2. 같은 2차 분류 가산 (+15)
  if (
    source.secondary_category &&
    source.secondary_category === target.secondary_category
  ) {
    score += 15;
    reasons.push("같은 2차 분류");
  }

  // 3. 키워드 일치 가산 (+30)
  const sourceKeyword = source.target_keyword?.toLowerCase() ?? "";
  const targetTitle = target.title?.toLowerCase() ?? "";
  const targetBody = target.body?.toLowerCase() ?? "";
  const targetKeyword = target.target_keyword?.toLowerCase() ?? "";

  if (sourceKeyword && targetKeyword && sourceKeyword === targetKeyword) {
    score += 30;
    reasons.push("동일 타겟 키워드");
  } else if (sourceKeyword && targetTitle.includes(sourceKeyword)) {
    score += 25;
    reasons.push("제목에 키워드 포함");
  } else if (sourceKeyword && targetBody.includes(sourceKeyword)) {
    score += 15;
    reasons.push("본문에 키워드 포함");
  }

  // 4. 태그 교집합 가산
  const sourceTags = new Set(source.tags?.map((t) => t.toLowerCase()) ?? []);
  const targetTags = target.tags?.map((t) => t.toLowerCase()) ?? [];
  const commonTags = targetTags.filter((t) => sourceTags.has(t));
  if (commonTags.length > 0) {
    score += commonTags.length * 10;
    reasons.push(`공통 태그 ${commonTags.length}개`);
  }

  // 5. 조회수 보너스 (인기글 우선)
  if (target.views_1m && target.views_1m > 500) {
    score += 10;
    reasons.push("인기글");
  }

  return { score, reason: reasons.join(", ") };
}

// ── 내부 링크 추천 ──

export function recommendInternalLinks(
  source: Content,
  allContents: Content[],
  maxResults: number = 5
): InternalLinkSuggestion[] {
  // 자기 자신과 삭제된 글 제외, 발행(S4+) 글만
  const candidates = allContents.filter(
    (c) =>
      c.id !== source.id &&
      !c.is_deleted &&
      (c.status === "S4" || c.status === "S5")
  );

  const scored = candidates
    .map((target) => {
      const { score, reason } = calculateRelevance(source, target);
      return {
        contentId: target.id,
        title: target.title ?? "제목 없음",
        relevanceScore: score,
        reason,
        categoryId: target.category_id ?? "",
      };
    })
    .filter((s) => s.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, maxResults);

  return scored;
}
