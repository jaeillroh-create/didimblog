"use server";

import { createClient } from "@/lib/supabase/server";
import { generateFull } from "@/lib/llm";
import type { SearchApiConfig, SearchApiProvider, NewsArticle, NewsItem, LLMStreamConfig, LLMMessage } from "@/lib/types/database";

// ── 타입 정의 ──

interface SaveSearchApiConfigInput {
  provider: SearchApiProvider;
  displayName: string;
  clientId: string;
  clientSecret: string;
}

interface SaveSearchApiConfigResult {
  success: boolean;
  configId?: number;
  error?: string;
}

interface SearchNewsResult {
  success: boolean;
  articles?: NewsArticle[];
  error?: string;
}

export type SearchSortOption = "date" | "relevance";

interface ExpandKeywordsResult {
  success: boolean;
  keywords?: string[];
  error?: string;
}

interface SummarizeSearchResult {
  success: boolean;
  summary?: string;
  error?: string;
}

// ── 헬퍼 ──

function encryptSecret(secret: string): string {
  return Buffer.from(secret, "utf-8").toString("base64");
}

async function decryptSecret(encrypted: string): Promise<string> {
  try {
    return Buffer.from(encrypted, "base64").toString("utf-8");
  } catch {
    return encrypted;
  }
}

/** schema cache 미스 에러인지 판별 */
function isTableNotFoundError(msg: string): boolean {
  return msg.includes("schema cache") && msg.includes("search_api_configs");
}

/** 활성 LLM 설정 조회 (키워드 확장 / AI 요약용) */
async function getActiveLLMConfig(): Promise<LLMStreamConfig | null> {
  try {
    const supabase = await createClient();

    // 기본 LLM 우선, 없으면 아무 활성 LLM
    const { data: config } = await supabase
      .from("llm_configs")
      .select("*")
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!config || !config.api_key_encrypted) return null;

    const apiKey = await decryptSecret(config.api_key_encrypted);
    return {
      provider: config.provider,
      model: config.model_id,
      apiKey,
      maxTokens: 1024,
      temperature: 0.7,
    };
  } catch {
    return null;
  }
}

// ── Server Actions ──

/**
 * 검색 API 설정 목록 조회
 */
export async function getSearchApiConfigs(): Promise<{
  data: SearchApiConfig[];
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("search_api_configs")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      if (isTableNotFoundError(error.message)) {
        return { data: [] };
      }
      return { data: [], error: error.message };
    }
    return { data: (data as SearchApiConfig[]) || [] };
  } catch {
    return { data: [] };
  }
}

/**
 * 검색 API 설정 저장
 */
export async function saveSearchApiConfig(
  input: SaveSearchApiConfigInput
): Promise<SaveSearchApiConfigResult> {
  try {
    const supabase = await createClient();

    // admin 권한 확인
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "로그인이 필요합니다." };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return { success: false, error: "관리자 권한이 필요합니다." };
    }

    const encryptedSecret = encryptSecret(input.clientSecret);

    // 기존 설정 존재 여부 확인
    const { data: existing, error: selectError } = await supabase
      .from("search_api_configs")
      .select("id")
      .eq("provider", input.provider)
      .maybeSingle();

    if (selectError) {
      if (isTableNotFoundError(selectError.message)) {
        return {
          success: false,
          error: "search_api_configs 테이블이 없습니다. Supabase SQL Editor에서 003_news_search.sql 마이그레이션을 실행하고, Supabase Dashboard에서 API 스키마를 Reload해주세요.",
        };
      }
      return { success: false, error: `조회 실패: ${selectError.message}` };
    }

    let resultId: number;

    if (existing) {
      // 업데이트
      const { data, error } = await supabase
        .from("search_api_configs")
        .update({
          display_name: input.displayName,
          client_id: input.clientId,
          client_secret_encrypted: encryptedSecret,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("id")
        .single();

      if (error || !data) {
        return { success: false, error: `업데이트 실패: ${error?.message || "알 수 없는 오류"}` };
      }
      resultId = data.id;
    } else {
      // 신규 생성
      const { data, error } = await supabase
        .from("search_api_configs")
        .insert({
          provider: input.provider,
          display_name: input.displayName,
          client_id: input.clientId,
          client_secret_encrypted: encryptedSecret,
          is_active: true,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (error || !data) {
        return { success: false, error: `저장 실패: ${error?.message || "알 수 없는 오류"}` };
      }
      resultId = data.id;
    }

    return { success: true, configId: resultId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "알 수 없는 오류";
    return { success: false, error: errorMessage };
  }
}

/**
 * 네이버 뉴스 검색
 */
export async function searchNaver(
  query: string,
  count: number = 10,
  sort: SearchSortOption = "date"
): Promise<SearchNewsResult> {
  try {
    if (!query.trim()) {
      return { success: false, error: "검색어를 입력해주세요." };
    }

    const supabase = await createClient();

    const { data: config, error: configError } = await supabase
      .from("search_api_configs")
      .select("*")
      .eq("provider", "naver")
      .eq("is_active", true)
      .maybeSingle();

    if (configError) {
      if (isTableNotFoundError(configError.message)) {
        return {
          success: false,
          error: "search_api_configs 테이블이 없습니다. 마이그레이션을 실행해주세요.",
        };
      }
      return { success: false, error: `설정 조회 실패: ${configError.message}` };
    }

    if (!config) {
      return {
        success: false,
        error: "네이버 검색 API가 설정되지 않았습니다. 설정 > AI 설정에서 등록해주세요.",
      };
    }

    if (!config.client_id || !config.client_secret_encrypted) {
      return {
        success: false,
        error: "네이버 검색 API Client ID 또는 Secret이 비어 있습니다.",
      };
    }

    const clientSecret = await decryptSecret(config.client_secret_encrypted);

    const url = new URL("https://openapi.naver.com/v1/search/news.json");
    url.searchParams.set("query", query.trim());
    url.searchParams.set("display", String(Math.min(count, 10)));
    url.searchParams.set("sort", sort === "relevance" ? "sim" : "date");

    const response = await fetch(url.toString(), {
      headers: {
        "X-Naver-Client-Id": config.client_id,
        "X-Naver-Client-Secret": clientSecret,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: "네이버 API 인증 실패. Client ID / Secret을 확인해주세요." };
      }
      if (response.status === 429) {
        return { success: false, error: "네이버 API 호출 한도 초과. 잠시 후 다시 시도해주세요." };
      }
      return { success: false, error: `네이버 API 오류 (${response.status})` };
    }

    const data = await response.json();

    const articles: NewsArticle[] = (data.items || []).map(
      (item: { title: string; description: string; link: string; pubDate: string }) => ({
        title: item.title.replace(/<[^>]*>/g, ""),
        description: item.description.replace(/<[^>]*>/g, ""),
        link: item.link,
        pubDate: item.pubDate,
        source: "naver" as const,
      })
    );

    return { success: true, articles };
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("fetch failed") || err.message.includes("ENOTFOUND")) {
        return { success: false, error: "네트워크 오류가 발생했습니다." };
      }
      return { success: false, error: err.message };
    }
    return { success: false, error: "뉴스 검색 중 오류가 발생했습니다." };
  }
}

/**
 * 구글 뉴스 검색 (Custom Search API)
 */
export async function searchGoogle(
  query: string,
  count: number = 10,
  sort: SearchSortOption = "date"
): Promise<SearchNewsResult> {
  try {
    if (!query.trim()) {
      return { success: false, error: "검색어를 입력해주세요." };
    }

    const supabase = await createClient();

    const { data: config, error: configError } = await supabase
      .from("search_api_configs")
      .select("*")
      .eq("provider", "google")
      .eq("is_active", true)
      .maybeSingle();

    if (configError) {
      if (isTableNotFoundError(configError.message)) {
        return {
          success: false,
          error: "search_api_configs 테이블이 없습니다. 마이그레이션을 실행해주세요.",
        };
      }
      return { success: false, error: `설정 조회 실패: ${configError.message}` };
    }

    if (!config) {
      return {
        success: false,
        error: "구글 검색 API가 설정되지 않았습니다. 설정 > AI 설정에서 등록해주세요.",
      };
    }

    if (!config.client_id || !config.client_secret_encrypted) {
      return {
        success: false,
        error: "구글 검색 API Key 또는 Search Engine ID가 비어 있습니다.",
      };
    }

    const apiKey = await decryptSecret(config.client_secret_encrypted);
    const searchEngineId = config.client_id;

    // Google Custom Search API
    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("cx", searchEngineId);
    url.searchParams.set("q", `${query.trim()} 뉴스`);
    url.searchParams.set("num", String(Math.min(count, 10)));

    if (sort === "date") {
      url.searchParams.set("sort", "date");
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { success: false, error: "구글 API 인증 실패. API Key를 확인해주세요." };
      }
      if (response.status === 429) {
        return { success: false, error: "구글 API 호출 한도 초과. 잠시 후 다시 시도해주세요." };
      }
      return { success: false, error: `구글 API 오류 (${response.status})` };
    }

    const data = await response.json();

    const articles: NewsArticle[] = (data.items || []).map(
      (item: { title: string; snippet: string; link: string; pagemap?: { metatags?: Array<{ "article:published_time"?: string }> } }) => ({
        title: item.title,
        description: item.snippet || "",
        link: item.link,
        pubDate: item.pagemap?.metatags?.[0]?.["article:published_time"] || "",
        source: "google" as const,
      })
    );

    return { success: true, articles };
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("fetch failed") || err.message.includes("ENOTFOUND")) {
        return { success: false, error: "네트워크 오류가 발생했습니다." };
      }
      return { success: false, error: err.message };
    }
    return { success: false, error: "구글 뉴스 검색 중 오류가 발생했습니다." };
  }
}

/**
 * 통합 뉴스 검색 (네이버+구글 병행)
 */
export async function searchNews(
  query: string,
  count: number = 10,
  sort: SearchSortOption = "date",
  providers?: SearchApiProvider[]
): Promise<SearchNewsResult> {
  const targetProviders = providers || ["naver", "google"];
  const results: NewsArticle[] = [];
  const errors: string[] = [];

  const searches = targetProviders.map(async (provider) => {
    if (provider === "naver") {
      return searchNaver(query, count, sort);
    } else {
      return searchGoogle(query, count, sort);
    }
  });

  const searchResults = await Promise.allSettled(searches);

  searchResults.forEach((result, i) => {
    if (result.status === "fulfilled" && result.value.success && result.value.articles) {
      results.push(...result.value.articles);
    } else if (result.status === "fulfilled" && !result.value.success) {
      // API 미설정은 조용히 스킵
      if (!result.value.error?.includes("설정되지 않았습니다")) {
        errors.push(result.value.error || `${targetProviders[i]} 검색 실패`);
      }
    }
  });

  if (results.length === 0 && errors.length > 0) {
    return { success: false, error: errors.join("; ") };
  }

  return { success: true, articles: results };
}

/**
 * AI 키워드 확장 — 사용자 키워드에서 연관 키워드 3~5개 생성
 */
export async function expandKeywords(keyword: string): Promise<ExpandKeywordsResult> {
  try {
    if (!keyword.trim()) {
      return { success: false, error: "키워드를 입력해주세요." };
    }

    const llmConfig = await getActiveLLMConfig();
    if (!llmConfig) {
      return { success: false, error: "활성 LLM이 없습니다. 설정 > AI 설정에서 LLM을 등록해주세요." };
    }

    const messages: LLMMessage[] = [
      {
        role: "system",
        content: "당신은 블로그 SEO와 뉴스 검색 전문가입니다. 사용자가 입력한 키워드와 관련된 검색 키워드를 3~5개 생성합니다. 각 키워드는 뉴스 검색에 적합해야 합니다. JSON 배열 형태로만 응답하세요. 예: [\"키워드1\", \"키워드2\", \"키워드3\"]",
      },
      {
        role: "user",
        content: `다음 키워드와 관련된 뉴스 검색용 연관 키워드 3~5개를 생성해주세요.\n\n키워드: ${keyword.trim()}\n\nJSON 배열로만 응답:`,
      },
    ];

    const result = await generateFull(
      { ...llmConfig, maxTokens: 256, temperature: 0.8 },
      messages
    );

    // JSON 파싱
    const jsonMatch = result.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      return { success: false, error: "키워드 생성 결과를 파싱할 수 없습니다." };
    }

    const keywords = JSON.parse(jsonMatch[0]) as string[];
    return { success: true, keywords: keywords.slice(0, 5) };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "키워드 확장 중 오류가 발생했습니다.";
    return { success: false, error: errorMessage };
  }
}

/**
 * 검색 결과 AI 요약 — 선택된 뉴스 기사들을 분석하여 트렌드 요약 생성
 */
export async function summarizeSearchResults(
  articles: NewsArticle[],
  keyword: string
): Promise<SummarizeSearchResult> {
  try {
    if (articles.length === 0) {
      return { success: false, error: "요약할 기사가 없습니다." };
    }

    const llmConfig = await getActiveLLMConfig();
    if (!llmConfig) {
      return { success: false, error: "활성 LLM이 없습니다. 설정 > AI 설정에서 LLM을 등록해주세요." };
    }

    const articleTexts = articles
      .map((a, i) => `[${i + 1}] ${a.title}\n${a.description}`)
      .join("\n\n");

    const messages: LLMMessage[] = [
      {
        role: "system",
        content: `당신은 뉴스 트렌드 분석 전문가입니다. 블로그 글 작성에 활용할 수 있도록 뉴스 기사들을 분석하고 요약합니다.

다음 형식으로 응답하세요:

📊 트렌드 요약 (3줄 이내)
- 현재 이 주제의 주요 트렌드를 간결하게 정리

💡 블로그 활용 포인트 (3~5개)
- 블로그 글에 인용하거나 활용할 수 있는 핵심 포인트

📈 인용 가능한 통계/수치
- 기사에서 발견된 구체적 숫자, 통계, 사례`,
      },
      {
        role: "user",
        content: `키워드 "${keyword}"에 대한 다음 뉴스 기사 ${articles.length}건을 분석해주세요.\n\n${articleTexts}`,
      },
    ];

    const result = await generateFull(
      { ...llmConfig, maxTokens: 1024, temperature: 0.5 },
      messages
    );

    return { success: true, summary: result };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "요약 생성 중 오류가 발생했습니다.";
    return { success: false, error: errorMessage };
  }
}

// ── 뉴스 자동 수집 ──

const FIXED_KEYWORDS = [
  "직무발명보상금",
  "직무발명보상 세액공제",
  "기업부설연구소",
  "연구개발비 세액공제",
  "벤처기업인증",
  "벤처기업 혜택",
  "중소기업 특허",
  "중소기업 법인세 감면",
  "지식재산 중소기업",
  "조세특례제한법 연구개발",
];

/** HTML 엔티티 디코딩 + 태그 제거 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/<\/?b>/g, "");
}

/** 키워드 기반 폴백 관련성 필터 (AI 호출 실패 시 사용) */
function isRelevantNewsFallback(title: string, description: string, searchKeyword: string): boolean {
  const text = (title + " " + (description || "")).replace(/<\/?b>/g, "");
  const keywordParts = searchKeyword.split(/\s+/).filter((w) => w.length >= 2);
  return keywordParts.some((part) => text.includes(part));
}

interface ArticleCandidate {
  title: string;
  description: string;
  link: string;
  keyword: string;
  pubDate?: string;
}

/** AI 관련성 필터: LLM에게 뉴스 목록을 보내 디딤 블로그 글감 여부 판단 */
async function filterRelevantNews(
  articles: ArticleCandidate[]
): Promise<ArticleCandidate[]> {
  if (articles.length === 0) return [];

  const llmConfig = await getActiveLLMConfig();
  if (!llmConfig) {
    // LLM 미설정 → 폴백
    console.warn("[뉴스수집] LLM 미설정, 키워드 폴백 필터 사용");
    return articles.filter((a) => isRelevantNewsFallback(a.title, a.description, a.keyword));
  }

  const articleList = articles
    .map((a, i) => `[${i + 1}] ${a.title} — ${a.description}`)
    .join("\n");

  const messages: LLMMessage[] = [
    {
      role: "system",
      content: `당신은 특허법인 "특허그룹 디딤"의 블로그 편집자입니다.
디딤의 서비스: 직무발명보상 절세 컨설팅, 기업부설연구소 설립/사후관리, 벤처기업인증, 특허출원, IP전략 컨설팅.
타깃 독자: 중소·중견기업 대표, 경영지원 담당자.

아래 뉴스 목록에서 디딤 블로그의 글감으로 활용할 수 있는 뉴스만 골라주세요.
"글감으로 활용 가능"의 기준:
- 디딤 서비스와 직접 관련된 제도·세법·정책 변경
- 타깃 독자(중소기업 대표)가 관심 가질 산업 동향
- 디딤이 전문 코멘트를 달 수 있는 IP·세제 이슈

다음은 제외:
- 대기업 실적/주가/인사 뉴스
- 일반 행사·축제·시상식
- 디딤 서비스와 무관한 부동산·금융·정치 뉴스
- 특정 법무법인·회계법인 홍보성 기사

관련 있는 뉴스의 번호만 JSON 배열로 답해주세요. 예: [1, 3, 7]
관련 있는 뉴스가 없으면 빈 배열 []을 반환하세요.`,
    },
    {
      role: "user",
      content: `뉴스 목록:\n${articleList}`,
    },
  ];

  try {
    const result = await generateFull(
      { ...llmConfig, maxTokens: 256, temperature: 0.2 },
      messages
    );

    const jsonMatch = result.match(/\[[\d\s,]*\]/);
    if (!jsonMatch) {
      console.warn("[뉴스수집] AI 응답 파싱 실패, 폴백 사용");
      return articles.filter((a) => isRelevantNewsFallback(a.title, a.description, a.keyword));
    }

    const indices = JSON.parse(jsonMatch[0]) as number[];
    return articles.filter((_, i) => indices.includes(i + 1));
  } catch (err) {
    console.warn("[뉴스수집] AI 필터 호출 실패, 폴백 사용:", err);
    return articles.filter((a) => isRelevantNewsFallback(a.title, a.description, a.keyword));
  }
}

/**
 * 고정 키워드로 네이버 뉴스 수집 → AI 관련성 판단 → news_items 저장
 * 최근 7일 이내, 같은 link 중복 제거
 */
export async function collectNews(): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const supabase = await createClient();

    const uniqueKeywords = [...new Set(FIXED_KEYWORDS)];

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // 기존 link 목록 (중복 방지)
    const { data: existingLinks } = await supabase
      .from("news_items")
      .select("link");
    const linkSet = new Set((existingLinks ?? []).map((r: { link: string }) => r.link));

    // 1단계: 키워드 검색 → HTML 디코딩 → 중복/날짜 제거
    const candidates: ArticleCandidate[] = [];

    for (const keyword of uniqueKeywords) {
      const result = await searchNaver(keyword, 5, "date");
      if (!result.success || !result.articles) continue;

      for (const a of result.articles) {
        if (linkSet.has(a.link)) continue;
        if (a.pubDate) {
          const pubDate = new Date(a.pubDate);
          if (pubDate < sevenDaysAgo) continue;
        }
        // 디코딩 후 후보에 추가
        candidates.push({
          title: decodeHtmlEntities(a.title),
          description: decodeHtmlEntities(a.description ?? ""),
          link: a.link,
          keyword,
          pubDate: a.pubDate,
        });
        linkSet.add(a.link); // 같은 링크 중복 방지
      }
    }

    if (candidates.length === 0) {
      console.log("[뉴스수집] 후보 뉴스 0건");
      return { success: true, count: 0 };
    }

    // 2단계: AI 관련성 판단
    const relevant = await filterRelevantNews(candidates);
    const excluded = candidates.length - relevant.length;
    console.log(`[뉴스수집] ${candidates.length}건 중 ${relevant.length}건 관련, ${excluded}건 제외`);

    if (relevant.length === 0) {
      return { success: true, count: 0 };
    }

    // 3단계: 저장
    const rows = relevant.map((a) => ({
      title: a.title,
      description: a.description || null,
      link: a.link,
      pub_date: a.pubDate ? new Date(a.pubDate).toISOString() : null,
      search_keyword: a.keyword,
      source: "naver",
    }));

    const { error } = await supabase.from("news_items").insert(rows);
    if (error) {
      console.error("[뉴스수집] 저장 에러:", error);
      return { success: false, count: 0, error: "뉴스 저장에 실패했습니다." };
    }

    return { success: true, count: relevant.length };
  } catch (err) {
    console.error("[collectNews] 에러:", err);
    return { success: false, count: 0, error: "뉴스 수집 중 오류가 발생했습니다." };
  }
}

/**
 * 최근 뉴스 조회
 */
export async function getRecentNews(limit: number = 10): Promise<NewsItem[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("news_items")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as NewsItem[];
  } catch (err) {
    console.error("[getRecentNews] 에러:", err);
    return [];
  }
}

/**
 * 특정 뉴스를 AI로 요약 + 블로그 각도 제안
 */
export async function summarizeNewsForBlog(
  newsId: number
): Promise<{ success: boolean; summary?: string; angle?: string; error?: string }> {
  try {
    const supabase = await createClient();

    const { data: news, error: fetchError } = await supabase
      .from("news_items")
      .select("*")
      .eq("id", newsId)
      .single();

    if (fetchError || !news) {
      return { success: false, error: "뉴스를 찾을 수 없습니다." };
    }

    const llmConfig = await getActiveLLMConfig();
    if (!llmConfig) {
      return { success: false, error: "활성 LLM이 없습니다. 설정 > AI 설정에서 LLM을 등록해주세요." };
    }

    const messages: LLMMessage[] = [
      {
        role: "system",
        content: `당신은 B2B 블로그 콘텐츠 전략가입니다. 뉴스 기사를 분석하고:
1) 핵심 내용을 3줄로 요약
2) 이 뉴스를 활용한 블로그 글 각도(angle)를 1~2개 제안

JSON 형식으로 응답하세요:
{"summary": "요약 내용", "angle": "블로그 각도 제안"}`,
      },
      {
        role: "user",
        content: `제목: ${news.title}\n설명: ${news.description ?? ""}\n키워드: ${news.search_keyword}`,
      },
    ];

    const result = await generateFull(
      { ...llmConfig, maxTokens: 512, temperature: 0.5 },
      messages
    );

    let summary = result;
    let angle = "";

    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        summary = parsed.summary ?? result;
        angle = parsed.angle ?? "";
      }
    } catch {
      // JSON 파싱 실패 시 원본 텍스트 사용
    }

    // news_items 업데이트
    await supabase
      .from("news_items")
      .update({ ai_summary: summary, blog_angle: angle })
      .eq("id", newsId);

    return { success: true, summary, angle };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "뉴스 분석 중 오류가 발생했습니다.";
    return { success: false, error: errorMessage };
  }
}

/**
 * 뉴스를 콘텐츠에 사용됨으로 표시
 */
export async function markNewsAsUsed(
  newsId: number,
  contentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from("news_items")
      .update({ is_used: true, used_content_id: contentId })
      .eq("id", newsId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error("[markNewsAsUsed] 에러:", err);
    return { success: false, error: "뉴스 사용 표시에 실패했습니다." };
  }
}
