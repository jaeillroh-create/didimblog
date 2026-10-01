# 뉴스 검색·요약·긴급 감지·브리핑 프롬프트 원문 (verbatim)

> 원본은 네이버 뉴스 API·Google Custom Search API·외부 LLM 을 호출한다. 스킬에서는 Claude 가 웹 검색 도구로 검색하고 아래 프롬프트를 **스스로 따른다**(절차는 SKILL.md §4).

## 목차
1. 사용 API (원본)
2. AI 키워드 확장 프롬프트
3. 검색 결과 AI 요약 프롬프트
4. 뉴스 자동 수집: 고정 키워드·비뉴스 제외·관련성 판단 프롬프트
5. 뉴스 1건 요약 + 블로그 각도 프롬프트
6. 브리핑 자동 생성 프롬프트 + 유효 카테고리 검증
7. placeholder 설명

## 1. 사용 API (원본 코드)

| 기능 | 원본 | 호출 | 근거 |
|---|---|---|---|
| 네이버 뉴스 | `searchNaver` | `GET https://openapi.naver.com/v1/search/news.json?query=&display=(최대10)&sort=date|sim`, 헤더 X-Naver-Client-Id/Secret | news-search.ts:258-268 |
| 구글 | `searchGoogle` | `GET https://www.googleapis.com/customsearch/v1?key=&cx=&q={검색어} 뉴스&num=(최대10)&sort=date` | news-search.ts:349-360 |
| 통합 | `searchNews` | 네이버+구글 병렬, 미설정 API 는 조용히 건너뜀 | news-search.ts:403-438 |
| 키워드 확장·요약·관련성·각도 | `generateFull` (활성 LLM 설정) | 아래 프롬프트 | news-search.ts:444-839 |

## 2. AI 키워드 확장

원문: `src/actions/news-search.ts:441-483`

```typescript
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
```

## 3. 검색 결과 AI 요약

원문: `src/actions/news-search.ts:485-538`

```typescript
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
```

## 4. 뉴스 자동 수집

원문: `src/actions/news-search.ts:540-747`

```typescript
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

/** 칼럼/인터뷰/광고 등 비뉴스 콘텐츠 제외 */
const EXCLUDE_PATTERNS = [
  "[칼럼]", "[기고]", "[시론]", "[사설]", "[논단]", "[기자수첩]",
  "[특별기고]", "[전문가칼럼]", "[CEO칼럼]", "[변호사칼럼]",
  "[인터뷰]", "[Who Is", "[피플]", "[人사이드]", "[만나보니]",
  "Q&A", "인터뷰", "를 만나다", "에게 듣다", "에게 묻다",
  "[광고]", "[후원]", "[브랜디드]", "[스폰서]", "[협찬]",
  "[독자투고]", "[서평]", "[리뷰]", "[체험기]",
];

function isExcludedContent(title: string): boolean {
  const t = title.toLowerCase();
  return EXCLUDE_PATTERNS.some((p) => t.includes(p.toLowerCase()));
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
        // 디코딩 후 칼럼/인터뷰 제외
        const decodedTitle = decodeHtmlEntities(a.title);
        if (isExcludedContent(decodedTitle)) continue;

        // 후보에 추가
        candidates.push({
          title: decodedTitle,
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
```

## 5. 뉴스 1건 요약 + 블로그 각도

원문: `src/actions/news-search.ts:766-839`

```typescript
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
```

## 6. 브리핑 자동 생성

원문: `src/lib/constants/prompts.ts:1470-1499`

```typescript
// ── 브리핑 자동생성 프롬프트 ──

export const PROMPT_BRIEFING_GENERATE = `당신은 특허그룹 디딤의 블로그 콘텐츠 기획자입니다.
주어진 주제를 분석하여 블로그 브리핑 양식을 작성합니다.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 일체 포함하지 마세요.

{
  "categoryId": "CAT-A | CAT-B | CAT-B-03 | CAT-C 중 하나",
  "secondaryCategoryId": "CAT-A-01 | CAT-A-02 | CAT-A-03 | CAT-A-04 | CAT-B-01 | CAT-B-02 | CAT-B-03 | CAT-C-01 | CAT-C-02 | CAT-C-03 중 적합한 것",
  "topic": "구체적인 글 주제 (한 줄, 상황+결과 포함)",
  "keyword": "네이버 검색용 핵심 키워드 1~2개",
  "targetAudience": "타깃 고객 (업종, 규모, 상황 구체적으로)",
  "episode": "실제 사례/에피소드 (업종, 상황, before/after 숫자 포함)",
  "additionalContext": "참고 사항 (관련 법 조항, 주의점, 강조 포인트)"
}

카테고리 판단 기준 (categoryId는 상위, secondaryCategoryId는 세부):
- 절세/보상금/법인세 관련 고객 사례 → CAT-A / CAT-A-01 (절세 시뮬레이션)
- 벤처인증/기업부설연구소 인증 관련 → CAT-A / CAT-A-02 (인증 가이드)
- 연구소 운영/사후관리/세무조사 대응 → CAT-A / CAT-A-03 (연구소 운영 실무)
- 특허출원/상표출원/디자인출원/해외출원 → CAT-A / CAT-A-04 (특허·상표 출원 실무)
- AI와 지식재산/기술 트렌드 → CAT-B / CAT-B-01 (AI와 IP)
- 특허 전략/IP 포트폴리오/분쟁 → CAT-B / CAT-B-02 (특허 전략 노트)
- 최신 뉴스 경량 요약 → CAT-B / CAT-B-03 (IP 뉴스 한 입)
- 컨설팅 후기/고객 감사 → CAT-C / CAT-C-01 (컨설팅 후기)
- 일상/사무실/행사 → CAT-C / CAT-C-02 (디딤 일상)
- 대표 개인 생각/에세이 → CAT-C / CAT-C-03 (대표의 생각)

디딤의 핵심 서비스: 직무발명보상 절세 컨설팅, 기업부설연구소 설립, 벤처기업인증, 특허출원`;
```

원문: `src/actions/briefing.ts:16-24`

```typescript
export interface BriefingData {
  categoryId: string;
  secondaryCategoryId: string;
  topic: string;
  keyword: string;
  targetAudience: string;
  episode: string;
  additionalContext: string;
}
```

원문: `src/actions/briefing.ts:88-93`

```typescript
const VALID_PRIMARY_CATEGORIES = ["CAT-A", "CAT-B", "CAT-B-03", "CAT-C"];
const VALID_SECONDARY_CATEGORIES = [
  "CAT-A-01", "CAT-A-02", "CAT-A-03",
  "CAT-B-01", "CAT-B-02", "CAT-B-03",
  "CAT-C-01", "CAT-C-02", "CAT-C-03",
];
```

원문: `src/actions/briefing.ts:114-123`

```typescript
    let systemPrompt = PROMPT_BRIEFING_GENERATE;
    if (input.categoryId) {
      systemPrompt += `\n\n카테고리는 반드시 ${input.categoryId}를 사용하세요.`;
    }

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: `주제: ${input.topic}` },
    ];

```

원문: `src/actions/briefing.ts:140-160`

```typescript
    const briefing: BriefingData = {
      categoryId: String(parsed.categoryId || "CAT-A"),
      secondaryCategoryId: String(parsed.secondaryCategoryId || ""),
      topic: String(parsed.topic || input.topic),
      keyword: String(parsed.keyword || ""),
      targetAudience: String(parsed.targetAudience || ""),
      episode: String(parsed.episode || ""),
      additionalContext: String(parsed.additionalContext || ""),
    };

    // 카테고리 유효성 검증
    if (!VALID_PRIMARY_CATEGORIES.includes(briefing.categoryId)) {
      briefing.categoryId = "CAT-A";
    }
    if (
      briefing.secondaryCategoryId &&
      !VALID_SECONDARY_CATEGORIES.includes(briefing.secondaryCategoryId)
    ) {
      briefing.secondaryCategoryId = "";
    }

```

## 7. placeholder 설명

원본 프롬프트는 `{{...}}` 대신 템플릿 리터럴(`${...}`)로 값을 넣는다. 스킬에서 Claude 가 채울 값:

| 위치 | placeholder | 넣을 값 |
|---|---|---|
| 키워드 확장 user | `${keyword.trim()}` | 사용자가 준 검색어 또는 추천 카드의 타깃 키워드 |
| 검색 요약 user | `${keyword}` | 검색에 쓴 키워드 |
| 검색 요약 user | `${articles.length}` | 선택한 기사 수 |
| 검색 요약 user | `${articleTexts}` | `[번호] 제목\n설명` 을 빈 줄로 이은 목록 |
| 관련성 판단 user | `${articleList}` | `[번호] 제목 — 설명` 한 줄씩 |
| 뉴스 각도 user | `${news.title}` / `${news.description}` / `${news.search_keyword}` | 기사 제목 / 요약문 / 검색 키워드 |
| 브리핑 system 추가 | `${input.categoryId}` | 카테고리를 고정할 때만: `카테고리는 반드시 CAT-…를 사용하세요.` 를 덧붙인다 |
| 브리핑 user | `${input.topic}` | `주제: <추천 표의 제목안>` |
