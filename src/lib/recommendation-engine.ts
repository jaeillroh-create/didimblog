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
