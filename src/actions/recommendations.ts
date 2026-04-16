"use server";

import { createClient } from "@/lib/supabase/server";
import {
  type Recommendation,
  type MonthlyPublishStats,
  determineNeededCategory,
  calcMonthlyStats,
  getPrimaryCategoryId,
  suggestDiarySub,
  generateTitleSuggestion,
  generateNewsRecommendationReason,
  validateNewsRelevance,
  URGENT_NEWS_KEYWORDS,
} from "@/lib/recommendation-engine";
import type { KeywordPool, NewsItem } from "@/lib/types/database";
import { SCHEDULE_DATA, getCurrentWeek } from "@/lib/constants/schedule-data";

// ── 뉴스 캐시 (1시간) ──

interface NewsCache {
  data: Recommendation[];
  timestamp: number;
}

let newsCache: NewsCache | null = null;
const NEWS_CACHE_TTL = 60 * 60 * 1000; // 1시간

// ── 추천 새로고침 (캐시 초기화 + 재생성) ──

export async function refreshWeeklyRecommendations(): Promise<Recommendation[]> {
  // 뉴스 캐시 강제 초기화
  newsCache = null;
  return getWeeklyRecommendations();
}

// ── 메인 추천 함수 ──

export async function getWeeklyRecommendations(): Promise<Recommendation[]> {
  const recommendations: Recommendation[] = [];

  try {
    // Step 1: 긴급 뉴스 체크 (캐싱)
    const urgentNews = await getUrgentNewsRecommendations();
    recommendations.push(...urgentNews);
  } catch (err) {
    console.error("[추천엔진] 뉴스 검색 실패:", err);
    // 뉴스 실패해도 나머지 추천은 진행
  }

  try {
    const supabase = await createClient();

    // Step 2: 이번 달 발행 이력
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

    const { data: published } = await supabase
      .from("contents")
      .select("category_id")
      .eq("status", "S4")
      .gte("published_at", firstDay.toISOString())
      .eq("is_deleted", false);

    const monthlyStats = calcMonthlyStats(published ?? []);

    // Step 3: 전주 발행 카테고리
    const { data: lastPub } = await supabase
      .from("contents")
      .select("category_id")
      .eq("status", "S4")
      .eq("is_deleted", false)
      .order("published_at", { ascending: false })
      .limit(1);

    const lastCategoryId = lastPub?.[0]?.category_id
      ? getPrimaryCategoryId(lastPub[0].category_id)
      : null;

    // Step 4: 필요 카테고리 결정
    const needed = determineNeededCategory(monthlyStats, lastCategoryId);

    // Step 5: 주제 결정
    if (needed.categoryId === "CAT-C") {
      // 다이어리: 자유 주제
      const sub = suggestDiarySub();
      recommendations.push({
        priority: "PRIMARY",
        category: needed.categoryName,
        categoryId: needed.categoryId,
        subCategory: sub.name,
        subCategoryId: sub.id,
        title: "(자유 주제)",
        reason: `이번 달 다이어리 ${monthlyStats.diary}/${1}편 — 자유 에세이를 작성하세요`,
      });
    } else {
      // HIGH 미커버 키워드 확인
      const topicRec = await getTopicForCategory(
        needed.categoryId,
        needed.categoryName,
        monthlyStats
      );
      if (topicRec) {
        recommendations.push(topicRec);
      }
    }

    // Step 6: 보조 추천 (다른 카테고리의 미커버 키워드)
    const secondaryCategories = ["CAT-A", "CAT-B", "CAT-C"].filter(
      (id) => id !== needed.categoryId
    );
    for (const catId of secondaryCategories) {
      const { data: uncovered } = await supabase
        .from("keyword_pool")
        .select("*")
        .eq("category_id", catId)
        .eq("priority", "HIGH")
        .is("covered_content_id", null)
        .limit(1);

      if (uncovered && uncovered.length > 0) {
        const kw = uncovered[0] as KeywordPool;
        const catName =
          catId === "CAT-A"
            ? "변리사의 현장 수첩"
            : catId === "CAT-B"
              ? "IP 라운지"
              : "디딤 다이어리";
        recommendations.push({
          priority: "SECONDARY",
          category: catName,
          categoryId: catId,
          subCategoryId: kw.sub_category_id ?? undefined,
          title: generateTitleSuggestion(kw.keyword),
          reason: `키워드 '${kw.keyword}' 미발행 (HIGH)`,
          keywords: [kw.keyword],
        });
        break; // 보조 추천 1개만
      }
    }
  } catch (err) {
    console.error("[추천엔진] 추천 생성 실패:", err);
  }

  return recommendations;
}

// ── 카테고리별 주제 결정 ──

async function getTopicForCategory(
  categoryId: string,
  categoryName: string,
  stats: MonthlyPublishStats
): Promise<Recommendation | null> {
  try {
    const supabase = await createClient();

    // 1. HIGH 미커버 키워드
    const { data: highUncovered } = await supabase
      .from("keyword_pool")
      .select("*")
      .eq("category_id", categoryId)
      .eq("priority", "HIGH")
      .is("covered_content_id", null)
      .limit(1);

    if (highUncovered && highUncovered.length > 0) {
      const kw = highUncovered[0] as KeywordPool;
      const target = categoryId === "CAT-A" ? 2 : 1;
      const current =
        categoryId === "CAT-A"
          ? stats.field
          : categoryId === "CAT-B"
            ? stats.lounge
            : stats.diary;
      return {
        priority: "PRIMARY",
        category: categoryName,
        categoryId,
        subCategoryId: kw.sub_category_id ?? undefined,
        title: generateTitleSuggestion(kw.keyword),
        reason: `키워드 '${kw.keyword}' 미발행 (매출 가중치 HIGH) | 이번 달 ${current}/${target}편`,
        keywords: [kw.keyword],
      };
    }

    // 2. MEDIUM 미커버 키워드
    const { data: medUncovered } = await supabase
      .from("keyword_pool")
      .select("*")
      .eq("category_id", categoryId)
      .eq("priority", "MEDIUM")
      .is("covered_content_id", null)
      .limit(1);

    if (medUncovered && medUncovered.length > 0) {
      const kw = medUncovered[0] as KeywordPool;
      return {
        priority: "PRIMARY",
        category: categoryName,
        categoryId,
        subCategoryId: kw.sub_category_id ?? undefined,
        title: generateTitleSuggestion(kw.keyword),
        reason: `키워드 '${kw.keyword}' 미발행 (MEDIUM)`,
        keywords: [kw.keyword],
      };
    }

    // 3. 성과 기반 후속편 (조회수 + 상담 건수 기반)
    const { data: topPosts } = await supabase
      .from("contents")
      .select("id, title, views_1m, category_id, target_keyword")
      .eq("status", "S4")
      .eq("is_deleted", false)
      .not("views_1m", "is", null)
      .order("views_1m", { ascending: false })
      .limit(10);

    // 상담 건수 집계
    const { data: leads } = await supabase
      .from("leads")
      .select("source_content_id")
      .not("source_content_id", "is", null);

    const leadCounts: Record<string, number> = {};
    for (const lead of leads ?? []) {
      if (lead.source_content_id) {
        leadCounts[lead.source_content_id] =
          (leadCounts[lead.source_content_id] ?? 0) + 1;
      }
    }

    // 종합 점수 = 조회수 × 1 + 상담건수 × 500
    const catPosts = (topPosts ?? [])
      .filter((p) => getPrimaryCategoryId(p.category_id ?? "") === categoryId)
      .map((p) => ({
        ...p,
        score: (p.views_1m ?? 0) + (leadCounts[p.id] ?? 0) * 500,
        consultations: leadCounts[p.id] ?? 0,
      }))
      .sort((a, b) => b.score - a.score);

    if (catPosts.length > 0) {
      const post = catPosts[0];
      const keyword = post.target_keyword ?? post.title ?? "";
      const consultText =
        post.consultations > 0
          ? `, 상담 ${post.consultations}건 유입`
          : "";
      return {
        priority: "SECONDARY",
        category: categoryName,
        categoryId,
        title: `"${post.title}" 후속편`,
        reason: `원글 조회수 ${(post.views_1m ?? 0).toLocaleString()}회${consultText} — 후속편 추천`,
        sourcePostId: post.id,
        keywords: keyword ? [keyword] : undefined,
      };
    }

    return null;
  } catch {
    return null;
  }
}

// ── 긴급 뉴스 추천 ──

async function getUrgentNewsRecommendations(): Promise<Recommendation[]> {
  // 캐시 확인
  if (newsCache && Date.now() - newsCache.timestamp < NEWS_CACHE_TTL) {
    return newsCache.data;
  }

  const results: Recommendation[] = [];

  // 1. 뉴스 기반 긴급 추천 시도
  const newsRec = await tryNewsBasedRecommendation();
  if (newsRec) {
    results.push(newsRec);
  } else {
    // 2. 뉴스 없거나 관련성 검증 실패 → 키워드 기반 긴급 추천 (뉴스 불필요)
    const keywordRec = await tryKeywordBasedUrgentRecommendation();
    if (keywordRec) {
      results.push(keywordRec);
    }
  }

  // 캐시 저장
  newsCache = { data: results, timestamp: Date.now() };
  return results;
}

/** 뉴스 기반 긴급 추천: 관련성 검증 + 다중 기사 후보 중 최적 선택 */
async function tryNewsBasedRecommendation(): Promise<Recommendation | null> {
  try {
    const { searchNews } = await import("@/actions/news-search");

    // 여러 키워드로 검색하여 최적 기사 찾기 (최대 3개 키워드)
    const shuffled = [...URGENT_NEWS_KEYWORDS].sort(() => Math.random() - 0.5);
    const keywordsToTry = shuffled.slice(0, 3);

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    interface ScoredArticle {
      title: string;
      link: string;
      keyword: string;
      score: number;
      positiveMatches: string[];
    }

    const candidates: ScoredArticle[] = [];

    for (const keyword of keywordsToTry) {
      const searchResult = await searchNews(keyword, 5, "date");
      if (!searchResult.success || !searchResult.articles) continue;

      for (const article of searchResult.articles) {
        // 날짜 필터
        try {
          const pubDate = new Date(article.pubDate);
          if (pubDate < threeDaysAgo) continue;
        } catch {
          continue;
        }

        // 관련성 검증
        const relevance = validateNewsRelevance(article.title, keyword);
        if (!relevance.isRelevant) {
          console.log(
            `[추천엔진] 뉴스 부적합 필터링: "${article.title.replace(/<[^>]*>/g, "").slice(0, 30)}..." — ${relevance.reason}`
          );
          continue;
        }

        candidates.push({
          title: article.title.replace(/<[^>]*>/g, ""),
          link: article.link,
          keyword,
          score: relevance.score,
          positiveMatches: relevance.positiveMatches,
        });
      }
    }

    // 관련성 점수 높은 순으로 정렬, 최적 기사 선택
    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      console.log("[추천엔진] 관련성 검증을 통과한 뉴스 기사 없음");
      return null;
    }

    const best = candidates[0];
    const matchedKeywords = [best.keyword];
    const reasonInfo = generateNewsRecommendationReason(matchedKeywords);
    const affectedPosts = await findAffectedExistingPosts(matchedKeywords);

    return {
      priority: "URGENT",
      category: "IP 라운지",
      categoryId: "CAT-B",
      subCategory: "IP 뉴스 한 입",
      subCategoryId: "CAT-B-03",
      title: best.title,
      reason: `시의성 뉴스: ${best.title.slice(0, 40)}...`,
      newsUrl: best.link,
      keywords: matchedKeywords,
      matchedWatchKeywords: matchedKeywords,
      relevanceReason: reasonInfo.relevanceReason,
      targetAudience: reasonInfo.targetAudience,
      suggestedAngle: reasonInfo.suggestedAngle,
      affectedExistingPosts: affectedPosts,
      verificationStatus: "pending",
    };
  } catch (err) {
    console.error("[추천엔진] 뉴스 API 실패:", err);
    return null;
  }
}

/** 뉴스 없이 키워드 기반 긴급 추천 (뉴스가 없거나 관련 뉴스가 없을 때) */
async function tryKeywordBasedUrgentRecommendation(): Promise<Recommendation | null> {
  try {
    const supabase = await createClient();

    // HIGH 우선순위 미커버 키워드 중 가장 오래된 것
    const { data: urgentKeywords } = await supabase
      .from("keyword_pool")
      .select("*")
      .eq("priority", "HIGH")
      .is("covered_content_id", null)
      .order("created_at", { ascending: true })
      .limit(3);

    if (!urgentKeywords || urgentKeywords.length === 0) return null;

    // 첫 번째 미커버 HIGH 키워드로 긴급 추천
    const kw = urgentKeywords[0] as KeywordPool;
    const matchedKeywords = [kw.keyword];
    const reasonInfo = generateNewsRecommendationReason(matchedKeywords);

    return {
      priority: "URGENT",
      category: "IP 라운지",
      categoryId: kw.category_id ?? "CAT-B",
      title: generateTitleSuggestion(kw.keyword),
      reason: `HIGH 우선순위 키워드 '${kw.keyword}' 미발행 — 긴급 작성 권장`,
      keywords: matchedKeywords,
      matchedWatchKeywords: matchedKeywords,
      relevanceReason: reasonInfo.relevanceReason,
      targetAudience: reasonInfo.targetAudience,
      suggestedAngle: reasonInfo.suggestedAngle,
      verificationStatus: "pending",
    };
  } catch (err) {
    console.error("[추천엔진] 키워드 기반 긴급 추천 실패:", err);
    return null;
  }
}

// ── 관련 기존 발행 글 검색 ──

async function findAffectedExistingPosts(
  matchedKeywords: string[]
): Promise<string[]> {
  try {
    const supabase = await createClient();

    // 키워드와 관련된 발행 글 검색 (제목/타겟키워드에 키워드 포함)
    const titles: string[] = [];

    for (const keyword of matchedKeywords) {
      // keyword_pool에서 covered_content_id 조회
      const { data: coveredKeywords } = await supabase
        .from("keyword_pool")
        .select("covered_content_id")
        .ilike("keyword", `%${keyword}%`)
        .not("covered_content_id", "is", null)
        .limit(3);

      if (coveredKeywords && coveredKeywords.length > 0) {
        const contentIds = coveredKeywords
          .map((k) => k.covered_content_id)
          .filter(Boolean);
        if (contentIds.length > 0) {
          const { data: contents } = await supabase
            .from("contents")
            .select("title")
            .in("id", contentIds)
            .eq("is_deleted", false);
          if (contents) {
            titles.push(...contents.map((c) => c.title ?? "제목 없음"));
          }
        }
      }

      // target_keyword에서 직접 매칭
      const { data: directMatch } = await supabase
        .from("contents")
        .select("title")
        .eq("status", "S4")
        .eq("is_deleted", false)
        .ilike("target_keyword", `%${keyword}%`)
        .limit(3);

      if (directMatch) {
        titles.push(...directMatch.map((c) => c.title ?? "제목 없음"));
      }
    }

    // 중복 제거
    return [...new Set(titles)].slice(0, 5);
  } catch {
    return [];
  }
}

// ── 월간 발행 현황 ──

export interface MonthlyPublishProgress {
  categoryId: string;
  categoryName: string;
  published: number;
  target: number;
}

export async function getMonthlyPublishProgress(): Promise<
  MonthlyPublishProgress[]
> {
  try {
    const supabase = await createClient();
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

    const { data: published } = await supabase
      .from("contents")
      .select("category_id")
      .eq("status", "S4")
      .gte("published_at", firstDay.toISOString())
      .eq("is_deleted", false);

    const stats = calcMonthlyStats(published ?? []);

    return [
      {
        categoryId: "CAT-A",
        categoryName: "변리사의 현장 수첩",
        published: stats.field,
        target: 2,
      },
      {
        categoryId: "CAT-B",
        categoryName: "IP 라운지",
        published: stats.lounge,
        target: 1,
      },
      {
        categoryId: "CAT-C",
        categoryName: "디딤 다이어리",
        published: stats.diary,
        target: 1,
      },
    ];
  } catch (err) {
    console.error("[getMonthlyPublishProgress] 에러:", err);
    return [
      {
        categoryId: "CAT-A",
        categoryName: "변리사의 현장 수첩",
        published: 0,
        target: 2,
      },
      {
        categoryId: "CAT-B",
        categoryName: "IP 라운지",
        published: 0,
        target: 1,
      },
      {
        categoryId: "CAT-C",
        categoryName: "디딤 다이어리",
        published: 0,
        target: 1,
      },
    ];
  }
}

// ── 월간 성과 요약 ──

export interface MonthlySummary {
  totalViews: number;
  consultations: number;
  contracts: number;
}

export async function getMonthlySummary(): Promise<MonthlySummary> {
  try {
    const supabase = await createClient();
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

    // 조회수 합계
    const { data: viewsData } = await supabase
      .from("contents")
      .select("views_1m")
      .eq("status", "S4")
      .eq("is_deleted", false)
      .not("views_1m", "is", null);

    const totalViews = (viewsData ?? []).reduce(
      (sum, c) => sum + (c.views_1m ?? 0),
      0
    );

    // 이번 달 상담 건수
    const { count: consultations } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .gte("contact_date", firstDay.toISOString().split("T")[0]);

    // 이번 달 계약 건수
    const { count: contracts } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("contract_yn", true)
      .gte("contact_date", firstDay.toISOString().split("T")[0]);

    return {
      totalViews,
      consultations: consultations ?? 0,
      contracts: contracts ?? 0,
    };
  } catch (err) {
    console.error("[getMonthlySummary] 에러:", err);
    return { totalViews: 0, consultations: 0, contracts: 0 };
  }
}

// ── 업데이트 필요 글 ──

export interface UpdateNeededPost {
  id: string;
  title: string;
  publishedAt: string;
  daysSincePublish: number;
  categoryId: string;
}

export async function getUpdateNeededPosts(): Promise<UpdateNeededPost[]> {
  try {
    const supabase = await createClient();
    const now = new Date();

    // 발행 완료 글 중 60/90일 경과 글
    const { data } = await supabase
      .from("contents")
      .select("id, title, published_at, category_id, health_status")
      .eq("status", "S4")
      .eq("is_deleted", false)
      .not("published_at", "is", null)
      .order("published_at", { ascending: true });

    if (!data || data.length === 0) return [];

    const results: UpdateNeededPost[] = [];

    for (const post of data) {
      if (!post.published_at) continue;

      const publishedDate = new Date(post.published_at);
      const daysSince = Math.floor(
        (now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const primaryCat = getPrimaryCategoryId(post.category_id ?? "");

      // 현장수첩: 60일, 나머지: 90일
      const threshold = primaryCat === "CAT-A" ? 60 : 90;

      if (
        daysSince >= threshold ||
        post.health_status === "CHECK_NEEDED" ||
        post.health_status === "UPDATE_NEEDED"
      ) {
        results.push({
          id: post.id,
          title: post.title ?? "제목 없음",
          publishedAt: post.published_at,
          daysSincePublish: daysSince,
          categoryId: post.category_id ?? "",
        });
      }
    }

    return results.slice(0, 5);
  } catch (err) {
    console.error("[getUpdateNeededPosts] 에러:", err);
    return [];
  }
}

// ── TOP 성과 글 ──

export interface TopPerformingPost {
  id: string;
  title: string;
  views: number;
  consultations: number;
}

export async function getTopPerformingPosts(): Promise<TopPerformingPost[]> {
  try {
    const supabase = await createClient();

    // 조회수 TOP 5
    const { data: posts } = await supabase
      .from("contents")
      .select("id, title, views_1m")
      .eq("status", "S4")
      .eq("is_deleted", false)
      .not("views_1m", "is", null)
      .order("views_1m", { ascending: false })
      .limit(5);

    if (!posts || posts.length === 0) return [];

    // 각 글별 상담 건수 집계
    const { data: leads } = await supabase
      .from("leads")
      .select("source_content_id")
      .not("source_content_id", "is", null);

    const leadCounts: Record<string, number> = {};
    for (const lead of leads ?? []) {
      if (lead.source_content_id) {
        leadCounts[lead.source_content_id] =
          (leadCounts[lead.source_content_id] ?? 0) + 1;
      }
    }

    return posts.map((p) => ({
      id: p.id,
      title: p.title ?? "제목 없음",
      views: p.views_1m ?? 0,
      consultations: leadCounts[p.id] ?? 0,
    }));
  } catch (err) {
    console.error("[getTopPerformingPosts] 에러:", err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// 멀티소스 추천 (키워드 풀 / 뉴스 / 스케줄) — 2~3개 동시 표시
// 010 migration: content_recommendations 테이블을 사용해 피드백 저장 & 블랙리스트
// ─────────────────────────────────────────────────────────────

const REJECT_LOOKBACK_DAYS = 30;
const BLACKLIST_REJECT_COUNT = 3;

/**
 * 최근 REJECT_LOOKBACK_DAYS 일 이내에 rejected 된 추천에서 rejection_keywords 를
 * 집계. BLACKLIST_REJECT_COUNT 회 이상 반복 rejected 된 키워드는 블랙리스트.
 *
 * 반환: { rejectedKeywords: 30일 내 한 번이라도 거부된 키워드 Set,
 *        blacklist: 3회 이상 거부된 키워드 Set }
 */
export async function getRejectedKeywordStats(): Promise<{
  rejectedKeywords: Set<string>;
  blacklist: Set<string>;
}> {
  try {
    const supabase = await createClient();
    const since = new Date(Date.now() - REJECT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const { data, error } = await supabase
      .from("content_recommendations")
      .select("rejection_keywords, recommended_topic")
      .eq("status", "rejected")
      .gte("created_at", since.toISOString());

    if (error) {
      console.warn("[getRejectedKeywordStats] 조회 실패 (table 없을 수도 있음):", error.message);
      return { rejectedKeywords: new Set(), blacklist: new Set() };
    }

    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      const kws = (row.rejection_keywords as string[] | null) ?? [];
      for (const k of kws) {
        const norm = k.trim().toLowerCase();
        if (!norm) continue;
        counts.set(norm, (counts.get(norm) ?? 0) + 1);
      }
    }

    const rejectedKeywords = new Set<string>(counts.keys());
    const blacklist = new Set<string>();
    for (const [k, cnt] of counts.entries()) {
      if (cnt >= BLACKLIST_REJECT_COUNT) blacklist.add(k);
    }
    return { rejectedKeywords, blacklist };
  } catch (err) {
    console.error("[getRejectedKeywordStats] 예외:", err);
    return { rejectedKeywords: new Set(), blacklist: new Set() };
  }
}

function isBlacklisted(text: string, blacklist: Set<string>): boolean {
  if (blacklist.size === 0) return false;
  const lower = text.toLowerCase();
  for (const k of blacklist) {
    if (k && lower.includes(k)) return true;
  }
  return false;
}

/**
 * 가중치 기반 키워드 샘플링
 * HIGH 50% / MEDIUM 30% / LOW 20% 확률로 한 카테고리에서 미커버 키워드를 선택.
 * 이번 달 이미 커버된 키워드와 블랙리스트는 제외.
 */
async function pickWeightedKeyword(
  categoryId: string,
  excludeKeywordIds: Set<string>,
  blacklist: Set<string>
): Promise<KeywordPool | null> {
  const supabase = await createClient();

  // 우선순위 랜덤 선택 (HIGH 50 / MED 30 / LOW 20)
  const roll = Math.random();
  const tryOrder: Array<"HIGH" | "MEDIUM" | "LOW"> =
    roll < 0.5 ? ["HIGH", "MEDIUM", "LOW"]
    : roll < 0.8 ? ["MEDIUM", "HIGH", "LOW"]
    : ["LOW", "MEDIUM", "HIGH"];

  for (const priority of tryOrder) {
    const { data } = await supabase
      .from("keyword_pool")
      .select("*")
      .eq("category_id", categoryId)
      .eq("priority", priority)
      .is("covered_content_id", null)
      .limit(30);

    const candidates = ((data ?? []) as KeywordPool[]).filter(
      (k) => !excludeKeywordIds.has(k.id) && !isBlacklisted(k.keyword, blacklist)
    );
    if (candidates.length > 0) {
      // 랜덤 1개
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
  }
  return null;
}

export type RecommendationCategoryId = "CAT-A" | "CAT-B" | "CAT-C";

export interface MultiSourceRecommendations {
  cards: Recommendation[];
  /** 현재 표시된 카드의 DB id 목록 — 새로고침 시 exclude 에 사용 */
  pendingIds: string[];
}

/** 카테고리별 구조화된 추천 결과 */
export type CategoryRecommendationMap = Record<RecommendationCategoryId, Recommendation[]>;

/**
 * 멀티소스 추천 — 3개 소스에서 각 1개씩 (최대 3개 카드).
 *
 * @param excludeRecIds 이미 표시 중인 content_recommendations.id 목록
 *                     (새로고침 시 중복 방지). 빈 배열이면 첫 로드.
 */
export async function getMultiSourceRecommendations(
  excludeRecIds: string[] = []
): Promise<MultiSourceRecommendations> {
  const cards: Recommendation[] = [];
  const { rejectedKeywords, blacklist } = await getRejectedKeywordStats();
  const excludeSet = new Set(excludeRecIds);

  // ── 1) 키워드 풀 기반 (가중치 샘플링) ──
  const keywordCard = await buildKeywordCard(blacklist);
  if (keywordCard && !excludeSet.has(keywordCard.recId ?? "")) {
    cards.push(keywordCard);
  }

  // ── 2) 뉴스 API 기반 ──
  const newsCard = await buildNewsCard(blacklist, rejectedKeywords);
  if (newsCard && !excludeSet.has(newsCard.recId ?? "")) {
    cards.push(newsCard);
  }

  // ── 3) 12주 스케줄 기반 ──
  const scheduleCard = await buildScheduleCard(blacklist);
  if (scheduleCard && !excludeSet.has(scheduleCard.recId ?? "")) {
    cards.push(scheduleCard);
  }

  return {
    cards,
    pendingIds: cards.map((c) => c.recId).filter((id): id is string => !!id),
  };
}

/**
 * content_recommendations row 를 생성하고 recId 를 Recommendation 에 박아 반환.
 * 이미 pending 상태의 같은 topic 이 있으면 그 id 를 재사용.
 */
async function persistRecommendation(
  rec: Recommendation,
  source: "keyword_pool" | "news_api" | "schedule",
  sourceDetail?: Record<string, unknown>
): Promise<Recommendation> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("content_recommendations")
      .insert({
        recommended_topic: rec.title,
        recommended_category: rec.category,
        recommended_subcategory: rec.subCategory ?? null,
        recommended_keywords: rec.keywords ?? null,
        source,
        source_detail: sourceDetail ?? null,
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !data) {
      console.warn("[persistRecommendation] insert 실패:", error?.message);
      return { ...rec, source };
    }
    return { ...rec, source, recId: data.id };
  } catch (err) {
    console.warn("[persistRecommendation] 예외:", err);
    return { ...rec, source };
  }
}

async function buildKeywordCard(
  blacklist: Set<string>,
  categoryId?: "CAT-A" | "CAT-B" | "CAT-C"
): Promise<Recommendation | null> {
  // categoryId 가 명시되면 해당 카테고리만, 아니면 CAT-A 우선 → CAT-B 폴백
  const tryOrder: string[] = categoryId ? [categoryId] : ["CAT-A", "CAT-B"];
  for (const catId of tryOrder) {
    const kw = await pickWeightedKeyword(catId, new Set(), blacklist);
    if (!kw) continue;
    const catName =
      catId === "CAT-A"
        ? "변리사의 현장 수첩"
        : catId === "CAT-B"
          ? "IP 라운지"
          : "디딤 다이어리";
    const rec: Recommendation = {
      priority: "PRIMARY",
      category: catName,
      categoryId: catId,
      subCategoryId: kw.sub_category_id ?? undefined,
      title: generateTitleSuggestion(kw.keyword),
      reason: `키워드 풀에서 자동 추출 — ${kw.priority} 가중치 / 미발행 / 랜덤 샘플링`,
      keywords: [kw.keyword],
    };
    return persistRecommendation(rec, "keyword_pool", {
      keyword_id: kw.id,
      priority: kw.priority,
    });
  }
  return null;
}

async function buildNewsCard(
  blacklist: Set<string>,
  rejectedKeywords: Set<string>
): Promise<Recommendation | null> {
  try {
    const supabase = await createClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const { data } = await supabase
      .from("news_items")
      .select("*")
      .eq("is_used", false)
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(15);

    const items = (data ?? []) as NewsItem[];
    for (const item of items) {
      const titleLower = item.title.toLowerCase();
      if (isBlacklisted(titleLower, blacklist)) continue;
      // 최근 30일 내 rejected 된 키워드와 60% 이상 겹치면 skip
      let hits = 0;
      for (const k of rejectedKeywords) {
        if (k && titleLower.includes(k)) hits++;
      }
      if (hits >= 2) continue;

      const cleanTitle = item.title.replace(/<\/?b>/g, "");
      const rec: Recommendation = {
        priority: "URGENT",
        category: "IP 라운지",
        categoryId: "CAT-B",
        subCategory: "IP 뉴스 한 입",
        subCategoryId: "CAT-B-03",
        title: cleanTitle,
        reason:
          item.blog_angle ??
          item.ai_summary ??
          `최근 7일 뉴스 — 검색 키워드: ${item.search_keyword}`,
        keywords: [item.search_keyword],
        newsUrl: item.link,
        relevanceReason: item.ai_summary ?? undefined,
        suggestedAngle: item.blog_angle ?? undefined,
      };
      return persistRecommendation(rec, "news_api", {
        news_id: item.id,
        link: item.link,
        search_keyword: item.search_keyword,
        source: item.source,
      });
    }
  } catch (err) {
    console.warn("[buildNewsCard] news_items 조회 실패:", err);
  }
  return null;
}

/** 스케줄 아이템의 category 문자열 → CAT-A/B/C 매핑 */
function scheduleCategoryToId(category: string): "CAT-A" | "CAT-B" | "CAT-C" {
  if (category === "변리사의 현장 수첩" || category === "현장 수첩") return "CAT-A";
  if (category === "IP 라운지") return "CAT-B";
  return "CAT-C";
}

async function buildScheduleCard(
  blacklist: Set<string>,
  categoryId?: "CAT-A" | "CAT-B" | "CAT-C",
  excludeTitles: Set<string> = new Set()
): Promise<Recommendation | null> {
  const currentWeek = getCurrentWeek();
  // 이번 주 기준 ±1 주의 스케줄 아이템 → 없으면 전체에서 폴백
  let candidates = SCHEDULE_DATA.filter(
    (it) => it.week >= currentWeek && it.week <= currentWeek + 1
  );
  if (categoryId) {
    candidates = candidates.filter((it) => scheduleCategoryToId(it.category) === categoryId);
  }
  if (candidates.length === 0) {
    // 해당 카테고리의 전체 스케줄 중 임의 선택 (블랙리스트/제외 통과하는 것)
    const pool = categoryId
      ? SCHEDULE_DATA.filter((it) => scheduleCategoryToId(it.category) === categoryId)
      : SCHEDULE_DATA;
    if (pool.length === 0) return null;
    candidates = [pool[Math.floor(Math.random() * pool.length)]];
  }

  for (const item of candidates) {
    if (excludeTitles.has(item.title)) continue;
    if (isBlacklisted(item.title, blacklist)) continue;
    if (item.keywords.some((k) => isBlacklisted(k, blacklist))) continue;

    const catId = scheduleCategoryToId(item.category);
    const rec: Recommendation = {
      priority: "PRIMARY",
      category: item.category,
      categoryId: catId,
      subCategory: item.subCategory,
      title: item.title,
      reason: `12주 발행 스케줄 W${item.week} — ${item.subCategory}`,
      keywords: item.keywords,
    };
    return persistRecommendation(rec, "schedule", {
      week: item.week,
      sub_category: item.subCategory,
      cta: item.cta,
    });
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// 추천 피드백 액션 (accept / reject)
// ─────────────────────────────────────────────────────────────

export interface AcceptRecommendationResult {
  success: boolean;
  error?: string;
}

/**
 * 사용자가 "적합 → 초안 생성" 클릭 시 호출.
 * status 를 'accepted' 로 변경하고 acted_at 을 기록.
 */
export async function acceptRecommendation(
  recId: string
): Promise<AcceptRecommendationResult> {
  if (!recId) return { success: false, error: "recId 누락" };
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("content_recommendations")
      .update({
        status: "accepted",
        acted_at: new Date().toISOString(),
      })
      .eq("id", recId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "적합 처리 실패" };
  }
}

export interface RejectRecommendationInput {
  recId: string;
  reason?: string;
}

/**
 * 사용자가 "부적합 — 건너뛰기" 클릭 시 호출.
 * status='rejected' + acted_at + rejection_reason + 자동 추출한 rejection_keywords 저장.
 * 재추천 필터에서 이 키워드를 블랙리스트/필터링에 사용.
 */
// ─────────────────────────────────────────────────────────────
// 카테고리별 추천 — 탭 구조 위젯에서 사용
// ─────────────────────────────────────────────────────────────

/** 카테고리별 카드 최대 개수 */
const CARDS_PER_CATEGORY: Record<RecommendationCategoryId, number> = {
  "CAT-A": 2, // 현장 수첩: 월 2편 목표 → 2개
  "CAT-B": 2, // IP 라운지: 월 1편 목표 → 2개까지 후보 제시
  "CAT-C": 1, // 디딤 다이어리: 월 1편 목표 → 1개
};

/**
 * 특정 카테고리의 추천 카드 생성.
 *
 * 카테고리별 소스 우선순위:
 *   - CAT-A (현장 수첩): 키워드 풀 → 12주 스케줄
 *   - CAT-B (IP 라운지): 뉴스 API → 키워드 풀 → 12주 스케줄
 *   - CAT-C (디딤 다이어리): 12주 스케줄
 *
 * @param categoryId 대상 카테고리
 * @param excludeRecIds 이미 표시 중/처리된 content_recommendations.id (새로고침용)
 */
export async function getCategoryRecommendations(
  categoryId: RecommendationCategoryId,
  excludeRecIds: string[] = []
): Promise<Recommendation[]> {
  const cards: Recommendation[] = [];
  const { rejectedKeywords, blacklist } = await getRejectedKeywordStats();
  const excludeSet = new Set(excludeRecIds);
  const maxCards = CARDS_PER_CATEGORY[categoryId];

  /** 중복 제목/id 방지 helper */
  const usedTitles = new Set<string>();
  const addIfNew = (rec: Recommendation | null): boolean => {
    if (!rec) return false;
    if (rec.recId && excludeSet.has(rec.recId)) return false;
    if (usedTitles.has(rec.title)) return false;
    cards.push(rec);
    usedTitles.add(rec.title);
    return true;
  };

  if (categoryId === "CAT-A") {
    // 현장 수첩: 키워드 풀 → 스케줄
    if (cards.length < maxCards) {
      const kw = await buildKeywordCard(blacklist, "CAT-A");
      addIfNew(kw);
    }
    if (cards.length < maxCards) {
      const sched = await buildScheduleCard(blacklist, "CAT-A", usedTitles);
      addIfNew(sched);
    }
    // 2개가 모두 키워드 풀에서 나올 수 있도록 한 번 더 시도
    if (cards.length < maxCards) {
      const kw2 = await buildKeywordCard(blacklist, "CAT-A");
      addIfNew(kw2);
    }
  } else if (categoryId === "CAT-B") {
    // IP 라운지: 뉴스 → 키워드 풀 → 스케줄
    if (cards.length < maxCards) {
      const news = await buildNewsCard(blacklist, rejectedKeywords);
      // 뉴스는 기본적으로 CAT-B 로 세팅되어 있음
      if (news && news.categoryId === "CAT-B") addIfNew(news);
    }
    if (cards.length < maxCards) {
      const kw = await buildKeywordCard(blacklist, "CAT-B");
      addIfNew(kw);
    }
    if (cards.length < maxCards) {
      const sched = await buildScheduleCard(blacklist, "CAT-B", usedTitles);
      addIfNew(sched);
    }
  } else if (categoryId === "CAT-C") {
    // 디딤 다이어리: 스케줄 전용
    if (cards.length < maxCards) {
      const sched = await buildScheduleCard(blacklist, "CAT-C", usedTitles);
      addIfNew(sched);
    }
  }

  return cards;
}

/**
 * 3개 카테고리의 추천을 병렬 생성해 map 으로 반환. 초기 페이지 로드용.
 */
export async function getAllCategoryRecommendations(): Promise<CategoryRecommendationMap> {
  const [a, b, c] = await Promise.all([
    getCategoryRecommendations("CAT-A"),
    getCategoryRecommendations("CAT-B"),
    getCategoryRecommendations("CAT-C"),
  ]);
  return {
    "CAT-A": a,
    "CAT-B": b,
    "CAT-C": c,
  };
}

export async function rejectRecommendation(
  input: RejectRecommendationInput
): Promise<AcceptRecommendationResult> {
  if (!input.recId) return { success: false, error: "recId 누락" };
  try {
    const supabase = await createClient();

    // 원본 추천 조회해서 rejection_keywords 추출
    const { data: original } = await supabase
      .from("content_recommendations")
      .select("recommended_topic, recommended_keywords, recommended_category")
      .eq("id", input.recId)
      .maybeSingle();

    let rejectionKeywords: string[] = [];
    if (original) {
      // 구조상 Recommendation 이 아니라 DB row → 간이 추출
      const kws = new Set<string>();
      for (const k of (original.recommended_keywords as string[] | null) ?? []) {
        if (k?.trim()) kws.add(k.trim());
      }
      for (const chunk of ((original.recommended_topic as string) ?? "").split(/\s+/)) {
        const cleaned = chunk.replace(/[^\w가-힣]/g, "");
        if (cleaned.length >= 3 && !/^[0-9]+$/.test(cleaned)) kws.add(cleaned);
      }
      rejectionKeywords = Array.from(kws).slice(0, 8);
    }

    const { error } = await supabase
      .from("content_recommendations")
      .update({
        status: "rejected",
        acted_at: new Date().toISOString(),
        rejection_reason: input.reason ?? null,
        rejection_keywords: rejectionKeywords,
      })
      .eq("id", input.recId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "부적합 처리 실패" };
  }
}
