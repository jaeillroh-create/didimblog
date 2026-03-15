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
  URGENT_NEWS_KEYWORDS,
} from "@/lib/recommendation-engine";
import type { KeywordPool } from "@/lib/types/database";

// ── 뉴스 캐시 (1시간) ──

interface NewsCache {
  data: Recommendation[];
  timestamp: number;
}

let newsCache: NewsCache | null = null;
const NEWS_CACHE_TTL = 60 * 60 * 1000; // 1시간

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

  try {
    // 동적 import — 뉴스 검색 모듈
    const { searchNews } = await import("@/actions/news-search");

    // 최근 3일 뉴스 검색 (키워드 1개만 — 속도/비용 최적화)
    const keyword =
      URGENT_NEWS_KEYWORDS[
        Math.floor(Math.random() * URGENT_NEWS_KEYWORDS.length)
      ];
    const searchResult = await searchNews(keyword, 3, "date");

    if (searchResult.success && searchResult.articles) {
      // 3일 이내 뉴스만 필터
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const recentNews = searchResult.articles.filter((article) => {
        try {
          const pubDate = new Date(article.pubDate);
          return pubDate >= threeDaysAgo;
        } catch {
          return false;
        }
      });

      if (recentNews.length > 0) {
        const article = recentNews[0];
        const matchedKeywords = [keyword];

        // 규칙 기반 추천 이유 생성
        const reasonInfo = generateNewsRecommendationReason(matchedKeywords);

        // 관련 기존 발행 글 검색
        const affectedPosts = await findAffectedExistingPosts(matchedKeywords);

        results.push({
          priority: "URGENT",
          category: "IP 라운지",
          categoryId: "CAT-B",
          subCategory: "IP 뉴스 한 입",
          subCategoryId: "CAT-B-03",
          title: article.title.replace(/<[^>]*>/g, ""),
          reason: `시의성 뉴스: ${article.title.replace(/<[^>]*>/g, "").slice(0, 40)}...`,
          newsUrl: article.link,
          keywords: matchedKeywords,
          matchedWatchKeywords: matchedKeywords,
          relevanceReason: reasonInfo.relevanceReason,
          targetAudience: reasonInfo.targetAudience,
          suggestedAngle: reasonInfo.suggestedAngle,
          affectedExistingPosts: affectedPosts,
          verificationStatus: "pending",
        });
      }
    }
  } catch (err) {
    console.error("[추천엔진] 뉴스 API 실패:", err);
  }

  // 캐시 저장
  newsCache = { data: results, timestamp: Date.now() };
  return results;
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
