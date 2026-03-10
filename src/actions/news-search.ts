"use server";

import { createClient } from "@/lib/supabase/server";
import type { SearchApiConfig, SearchApiProvider, NewsArticle } from "@/lib/types/database";

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
export async function searchNews(
  query: string,
  count: number = 10
): Promise<SearchNewsResult> {
  try {
    if (!query.trim()) {
      return { success: false, error: "검색어를 입력해주세요." };
    }

    const supabase = await createClient();

    // 네이버 API 설정 조회
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
          error: "search_api_configs 테이블이 없습니다. Supabase SQL Editor에서 003_news_search.sql 마이그레이션을 실행해주세요.",
        };
      }
      return { success: false, error: `설정 조회 실패: ${configError.message}` };
    }

    if (!config) {
      return {
        success: false,
        error: "네이버 검색 API가 설정되지 않았습니다. 설정 > AI 설정에서 네이버 검색 API를 등록해주세요.",
      };
    }

    if (!config.client_id || !config.client_secret_encrypted) {
      return {
        success: false,
        error: "네이버 검색 API Client ID 또는 Secret이 비어 있습니다. 설정을 확인해주세요.",
      };
    }

    const clientSecret = await decryptSecret(config.client_secret_encrypted);

    // 네이버 뉴스 검색 API 호출
    const url = new URL("https://openapi.naver.com/v1/search/news.json");
    url.searchParams.set("query", query.trim());
    url.searchParams.set("display", String(Math.min(count, 10)));
    url.searchParams.set("sort", "date");

    const response = await fetch(url.toString(), {
      headers: {
        "X-Naver-Client-Id": config.client_id,
        "X-Naver-Client-Secret": clientSecret,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: "네이버 API 인증에 실패했습니다. Client ID / Secret을 확인해주세요." };
      }
      if (response.status === 429) {
        return { success: false, error: "네이버 API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요." };
      }
      return { success: false, error: `네이버 API 오류 (${response.status})` };
    }

    const data = await response.json();

    const articles: NewsArticle[] = (data.items || []).map(
      (item: { title: string; description: string; link: string; pubDate: string }) => ({
        title: item.title.replace(/<[^>]*>/g, ""), // HTML 태그 제거
        description: item.description.replace(/<[^>]*>/g, ""),
        link: item.link,
        pubDate: item.pubDate,
      })
    );

    return { success: true, articles };
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("fetch failed") || err.message.includes("ENOTFOUND")) {
        return { success: false, error: "네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요." };
      }
      return { success: false, error: err.message };
    }
    return { success: false, error: "뉴스 검색 중 오류가 발생했습니다." };
  }
}
