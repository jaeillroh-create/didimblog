# 추천 엔진 규칙 원문 (verbatim)

> 이 파일은 코드 원문을 그대로 옮긴 것이다. 요약·수정하지 않는다. 판단 규칙은 SKILL.md, 계산은 `scripts/recommend.py`.

## 목차
1. 추천 결과 타입·월간 목표·카테고리 결정 (recommendation-engine.ts)
2. 다이어리 2차 분류·제목 템플릿·긴급 뉴스 키워드
3. 뉴스 관련성 검증 (포지티브/네거티브 키워드)
4. 뉴스 추천 이유 맵
5. 기획서 원문: docs/UPGRADE_SPEC.md §7 추천 엔진 로직
6. 주의: 2차 분류 ID 불일치

## 1. 추천 결과 타입·월간 목표·카테고리 결정

원문: `src/lib/recommendation-engine.ts:3-116`

```typescript
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
  /** 뉴스 추천 전용: 매칭된 감시 키워드 */
  matchedWatchKeywords?: string[];
  /** 뉴스 추천 전용: 디딤과의 관련성 설명 */
  relevanceReason?: string;
  /** 뉴스 추천 전용: 타깃 독자 */
  targetAudience?: string;
  /** 뉴스 추천 전용: 블로그 글 관점 제안 */
  suggestedAngle?: string;
  /** 관련 기존 발행 글 제목 */
  affectedExistingPosts?: string[];
  /** 재검증 상태 (뉴스 추천 전용, 클라이언트 관리) */
  verificationStatus?: "pending" | "verified" | "rejected";
  /** 추천 소스 (카드 배지 표시용) */
  source?: "keyword_pool" | "news_api" | "schedule" | "manual";
  /** DB 에 저장된 content_recommendations.id — accept/reject 시 사용 */
  recId?: string;
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

```

## 2. 다이어리 2차 분류·제목 템플릿·긴급 뉴스 키워드

원문: `src/lib/recommendation-engine.ts:117-148`

```typescript
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
```

## 3. 뉴스 관련성 검증

원문: `src/lib/recommendation-engine.ts:149-243`

```typescript

// ── 뉴스 기사 관련성 검증 (false positive 방지) ──

/** 디딤 블로그 도메인과 관련된 포지티브 키워드 (제목에 1개 이상 포함 필요) */
const DOMAIN_POSITIVE_KEYWORDS = [
  // 핵심 서비스
  "특허", "발명", "IP", "지식재산", "지재권",
  "세액공제", "절세", "조세", "세금",
  "벤처", "벤처인증", "벤처기업",
  "연구소", "기업부설", "R&D", "연구개발",
  // IP 라운지 주제
  "AI 특허", "인공지능", "AI 기본법", "AI 규제",
  "영업비밀", "직무발명", "보상금",
  "기술이전", "라이선싱",
  // 대상 고객
  "중소기업", "스타트업", "창업",
];

/** 완전 무관 분야 네거티브 키워드 (제목에 포함되면 제외) */
const DOMAIN_NEGATIVE_KEYWORDS = [
  // 방산/군사
  "방산", "방위", "군사", "국방", "무기", "미사일", "전투기", "잠수함", "K-방산",
  // 연예/스포츠
  "아이돌", "드라마", "영화", "축구", "야구", "농구", "올림픽",
  // 부동산
  "아파트", "분양", "재건축", "부동산",
  // 정치
  "대선", "총선", "여당", "야당", "탄핵",
  // 기타 무관
  "주가", "증시", "코스피", "코스닥", "환율",
];

export interface NewsRelevanceResult {
  isRelevant: boolean;
  score: number;
  positiveMatches: string[];
  negativeMatches: string[];
  reason: string;
}

/**
 * 뉴스 기사 제목의 디딤 블로그 관련성을 규칙 기반으로 검증
 * - 네거티브 키워드 포함 → 즉시 부적합
 * - 포지티브 키워드 매칭 수로 점수 산정
 * - 검색 키워드가 제목에 직접 포함되어야 가산점
 */
export function validateNewsRelevance(
  articleTitle: string,
  searchKeyword: string
): NewsRelevanceResult {
  const title = articleTitle.replace(/<[^>]*>/g, "").toLowerCase();
  const searchKw = searchKeyword.toLowerCase();

  // 1. 네거티브 키워드 체크 (하나라도 있으면 부적합)
  const negativeMatches = DOMAIN_NEGATIVE_KEYWORDS.filter((kw) =>
    title.includes(kw.toLowerCase())
  );
  if (negativeMatches.length > 0) {
    return {
      isRelevant: false,
      score: -1,
      positiveMatches: [],
      negativeMatches,
      reason: `무관 분야 키워드 감지: ${negativeMatches.join(", ")}`,
    };
  }

  // 2. 포지티브 키워드 매칭
  const positiveMatches = DOMAIN_POSITIVE_KEYWORDS.filter((kw) =>
    title.includes(kw.toLowerCase())
  );

  // 3. 검색 키워드가 제목에 직접 포함 여부 (가산점)
  const searchKeywordInTitle = title.includes(searchKw);

  // 4. 점수 계산
  let score = positiveMatches.length * 10;
  if (searchKeywordInTitle) score += 20;

  // 포지티브 매칭 0개 + 검색 키워드도 제목에 없으면 부적합
  const isRelevant = score >= 10;

  let reason: string;
  if (!isRelevant) {
    reason = "제목에 디딤 도메인 관련 키워드가 없습니다";
  } else if (searchKeywordInTitle) {
    reason = `검색 키워드 '${searchKeyword}' 제목 포함, 관련 키워드: ${positiveMatches.join(", ") || "없음"}`;
  } else {
    reason = `관련 키워드 감지: ${positiveMatches.join(", ")}`;
  }

  return { isRelevant, score, positiveMatches, negativeMatches, reason };
}

// ── 뉴스 추천 이유 생성 (규칙 기반, API 호출 없음) ──
```

## 4. 뉴스 추천 이유 맵 (규칙 기반)

원문: `src/lib/recommendation-engine.ts:244-324`

```typescript

interface NewsReasonInfo {
  reason: string;
  audience: string;
  angle: string;
}

const KEYWORD_REASON_MAP: Record<string, NewsReasonInfo> = {
  "조세특례제한법": {
    reason: "디딤의 핵심 서비스인 직무발명보상 절세 컨설팅에 직접 영향",
    audience: "법인세 부담이 큰 중소기업 대표",
    angle: "법 개정이 우리 회사 절세에 어떤 영향을 미치는지 실제 시뮬레이션으로 보여주기",
  },
  "세액공제": {
    reason: "기업부설연구소 세액공제 및 R&D 비용 처리에 직접 관련",
    audience: "기업부설연구소를 운영 중인 기업의 경영지원팀",
    angle: "세액공제 기준 변경 시 우리 연구소는 어떻게 대응해야 하는지",
  },
  "벤처기업인증": {
    reason: "디딤의 벤처인증 컨설팅 서비스와 직접 연결",
    audience: "벤처인증을 준비 중인 스타트업 대표",
    angle: "변경된 요건이 우리 회사 인증에 유리한지 불리한지 분석",
  },
  "벤처인증": {
    reason: "디딤의 벤처인증 컨설팅 서비스와 직접 연결",
    audience: "벤처인증을 준비 중이거나 갱신 예정인 기업 대표",
    angle: "인증 요건 변화가 우리 회사에 미치는 영향과 대응 전략",
  },
  "직무발명": {
    reason: "디딤 최고 마진 서비스(직무발명보상 절세)의 핵심 주제",
    audience: "연구개발 인력이 있는 기업의 대표 또는 CTO",
    angle: "판례/제도 변화가 보상금 설계에 미치는 실무 영향",
  },
  "특허법": {
    reason: "특허 출원 전략 및 IP 보호 서비스와 관련",
    audience: "기술 기반 기업의 CTO, 경영지원팀",
    angle: "법 개정이 우리 회사 특허 포트폴리오에 미치는 영향",
  },
  "AI 기본법": {
    reason: "2026년 시행 예정인 핵심 법안, IP 라운지 5대 이슈축",
    audience: "AI 기술 활용 기업 전체",
    angle: "기본법 시행 전 AI 특허/저작권 대비 체크리스트",
  },
  "AI": {
    reason: "AI 특허 전략 서비스 및 IP 라운지 콘텐츠 축과 관련",
    audience: "AI/기술 스타트업 대표",
    angle: "AI 규제 변화가 기술기업의 IP 전략에 미치는 영향",
  },
  "인공지능": {
    reason: "AI 특허 전략 서비스 및 IP 라운지 콘텐츠 축과 관련",
    audience: "AI/기술 스타트업 대표",
    angle: "AI 규제 변화가 기술기업의 IP 전략에 미치는 영향",
  },
  "연구소": {
    reason: "기업부설연구소 설립/사후관리 서비스와 직접 연결",
    audience: "연구소를 운영 중이거나 설립 예정인 기업",
    angle: "제도 변화에 따른 연구소 운영 실무 대응 방법",
  },
};

export function generateNewsRecommendationReason(
  matchedKeywords: string[]
): { relevanceReason: string; targetAudience: string; suggestedAngle: string } {
  for (const keyword of matchedKeywords) {
    for (const [watchKey, info] of Object.entries(KEYWORD_REASON_MAP)) {
      if (keyword.includes(watchKey) || watchKey.includes(keyword)) {
        return {
          relevanceReason: info.reason,
          targetAudience: info.audience,
          suggestedAngle: info.angle,
        };
      }
    }
  }

  return {
    relevanceReason: "IP 업계 동향으로, 디딤 블로그 독자에게 유용한 정보",
    targetAudience: "중소기업 대표 및 경영지원 담당자",
    suggestedAngle: "이 이슈가 중소기업에 미치는 실질적 영향 분석",
  };
}
```

## 5. 기획서 원문 — docs/UPGRADE_SPEC.md §7

원문: `docs/UPGRADE_SPEC.md:475-555`

```markdown
## 7. 추천 엔진 로직

```typescript
async function getWeeklyRecommendation(): Promise<Recommendation[]> {
  const recommendations: Recommendation[] = [];
  
  // Step 1: 긴급 발행 체크 (최근 3일 뉴스)
  const urgentNews = await checkUrgentIPNews();
  if (urgentNews) {
    recommendations.push({
      priority: 'URGENT',
      category: 'IP 라운지',
      subCategory: 'IP 뉴스 한 입',
      title: urgentNews.suggestedTitle,
      reason: `${urgentNews.daysAgo}일 전 뉴스: ${urgentNews.headline}`,
      newsUrl: urgentNews.url,
    });
  }
  
  // Step 2: 카테고리 균형 (이번 달 2:1:1)
  const monthlyStats = await getMonthlyPublishStats();
  const lastWeekCategory = await getLastWeekCategory();
  const neededCategory = determineNeededCategory(monthlyStats, lastWeekCategory);
  
  // Step 3: 주제 결정
  if (neededCategory === '디딤 다이어리') {
    recommendations.push({
      priority: 'PRIMARY',
      category: '디딤 다이어리',
      subCategory: suggestDiarySub(),
      title: '(자유 주제)',
      reason: `이번 달 다이어리 ${monthlyStats.diary}/${CATEGORIES.DIARY.monthlyTarget}편`,
    });
  } else {
    // HIGH 가중치 미커버 키워드 우선
    const uncoveredHigh = await getUncoveredKeywords(neededCategory, 'HIGH');
    if (uncoveredHigh.length > 0) {
      recommendations.push({
        priority: 'PRIMARY',
        category: neededCategory,
        subCategory: uncoveredHigh[0].sub_category,
        title: generateTitleFromKeyword(uncoveredHigh[0].keyword),
        reason: `키워드 '${uncoveredHigh[0].keyword}' 미발행 (매출 가중치 HIGH)`,
        keywords: [uncoveredHigh[0].keyword],
      });
    }
    
    // 성과 기반 후속편
    const topPosts = await getTopPerformingPosts(neededCategory, 3);
    const withoutSequel = topPosts.filter(p => !p.hasSequel);
    if (withoutSequel.length > 0) {
      recommendations.push({
        priority: 'SECONDARY',
        category: neededCategory,
        subCategory: withoutSequel[0].sub_category,
        title: `"${withoutSequel[0].title}" 후속편`,
        reason: `원글 조회수 ${withoutSequel[0].totalViews}회, 후속편 없음`,
      });
    }
  }
  
  return recommendations;
}

function determineNeededCategory(stats: MonthlyStats, lastWeek: string): string {
  // 2:1:1 미달 카테고리 중 가장 부족한 것
  const gaps = [
    { cat: '변리사의 현장 수첩', gap: 2 - stats.field, target: 2 },
    { cat: 'IP 라운지', gap: 1 - stats.lounge, target: 1 },
    { cat: '디딤 다이어리', gap: 1 - stats.diary, target: 1 },
  ].filter(g => g.gap > 0).sort((a, b) => b.gap - a.gap);
  
  if (gaps.length === 0) return '변리사의 현장 수첩';  // 모두 충족 시 기본
  
  // 전주와 같은 카테고리면 차순위로
  if (gaps[0].cat === lastWeek && gaps.length > 1) return gaps[1].cat;
  return gaps[0].cat;
}
```

---
```

## 6. 주의: 2차 분류 ID 불일치 (코드 내부 모순)

| ID | sub-category-pool.ts · prompts.ts FIELD_CTA (추천 엔진·CTA가 쓰는 쪽) | supabase/seed.sql · SPEC.md · PROMPT_BRIEFING_GENERATE |
|---|---|---|
| CAT-B-01 | 특허 전략 노트 | AI와 IP |
| CAT-B-02 | AI와 IP | 특허 전략 노트 |
| CAT-A-04 | 특허·상표 출원 실무 (있음) | seed.sql·CATEGORY_HIERARCHY 에 없음, briefing.ts VALID_SECONDARY_CATEGORIES 에도 없음 |

스킬은 **2차 분류 이름(네이버 문자열)을 정본**으로 넘기고, ID 는 sub-category-pool.ts 기준을 참고로만 붙인다.
