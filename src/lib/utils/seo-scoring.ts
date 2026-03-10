import { getPromptKey, type PromptKey } from "@/lib/constants/prompts";

// ── 카테고리별 SEO 채점 기준 ──

export interface SeoCheckItem {
  label: string;
  passed: boolean;
  detail: string;
  score: number;
  maxScore: number;
}

export interface SeoScoringResult {
  checks: SeoCheckItem[];
  score: number;
  totalMax: number;
  promptKey: PromptKey;
}

const DIARY_CTA_KEYWORDS = ["상담", "문의", "연락", "무료", "진단", "시뮬레이션", "admin@"];

// ── 공통 헬퍼 ──

function countKeyword(text: string, keyword: string): number {
  if (!keyword) return 0;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (text.match(new RegExp(escaped, "g")) || []).length;
}

function countHeadings(text: string): number {
  return (text.match(/^##\s/gm) || []).length;
}

function countImageMarkers(text: string): number {
  return (text.match(/\[IMAGE:\s*.+?\]/g) || []).length;
}

function countTags(text: string): number {
  return (text.match(/#[^\s#]+/g) || []).length;
}

function charCount(text: string): number {
  return text.replace(/\s/g, "").length;
}

// ── 현장수첩 (CAT-A) / IP 라운지 일반 (CAT-B) ──

function scoreFieldOrLounge(
  title: string,
  text: string,
  keyword: string,
  isLounge: boolean
): SeoCheckItem[] {
  const titleLen = title.length;
  const kwCount = countKeyword(text, keyword);
  const headings = countHeadings(text);
  const images = countImageMarkers(text);
  const chars = charCount(text);
  const tags = countTags(text);
  const hasCta = isLounge
    ? text.includes("이웃") || text.includes("추가")
    : text.includes("절세 시뮬레이션") ||
      text.includes("인증 진단") ||
      text.includes("연구소 진단") ||
      text.includes("admin@didimip.com");

  const keywordInFirst15 =
    keyword.length > 0 && title.substring(0, 15).includes(keyword);

  return [
    {
      label: "제목 길이 25~30자",
      passed: titleLen >= 25 && titleLen <= 30,
      detail: `${titleLen}자`,
      score: titleLen >= 25 && titleLen <= 30 ? 15 : 0,
      maxScore: 15,
    },
    {
      label: "키워드 앞 15자",
      passed: keywordInFirst15 || keyword.length === 0,
      detail: keywordInFirst15 ? "포함됨" : "미포함",
      score: keywordInFirst15 || keyword.length === 0 ? 10 : 0,
      maxScore: 10,
    },
    {
      label: "본문 키워드 3~5회",
      passed: kwCount >= 3 && kwCount <= 5,
      detail: `${kwCount}회`,
      score: kwCount >= 3 && kwCount <= 5 ? 15 : kwCount >= 1 ? 7 : 0,
      maxScore: 15,
    },
    {
      label: "소제목(##) 2개 이상",
      passed: headings >= 2,
      detail: `${headings}개`,
      score: headings >= 2 ? 10 : headings >= 1 ? 5 : 0,
      maxScore: 10,
    },
    {
      label: "이미지 마커 3개 이상",
      passed: images >= 3,
      detail: `${images}개`,
      score: images >= 3 ? 10 : images >= 1 ? 5 : 0,
      maxScore: 10,
    },
    {
      label: "본문 1,500~2,000자",
      passed: chars >= 1500 && chars <= 2000,
      detail: `${chars.toLocaleString()}자`,
      score:
        chars >= 1500 && chars <= 2000
          ? 15
          : chars >= 1200 && chars <= 2500
            ? 8
            : 0,
      maxScore: 15,
    },
    {
      label: "태그 10개",
      passed: tags >= 8,
      detail: `${tags}개`,
      score: tags >= 10 ? 10 : tags >= 8 ? 7 : tags >= 5 ? 4 : 0,
      maxScore: 10,
    },
    {
      label: isLounge ? "CTA 이웃 추가 유도" : "CTA 배치",
      passed: hasCta,
      detail: hasCta ? "있음" : "없음",
      score: hasCta ? 15 : 0,
      maxScore: 15,
    },
  ];
}

// ── IP 뉴스 한 입 (CAT-B-03) ──

function scoreBite(
  title: string,
  text: string,
  keyword: string
): SeoCheckItem[] {
  const titleLen = title.length;
  const kwCount = countKeyword(text, keyword);
  const headings = countHeadings(text);
  const images = countImageMarkers(text);
  const chars = charCount(text);
  const tags = countTags(text);
  const hasCta = text.includes("이웃") || text.includes("추가");

  const keywordInFirst15 =
    keyword.length > 0 && title.substring(0, 15).includes(keyword);

  return [
    {
      label: "제목 길이 25~30자",
      passed: titleLen >= 25 && titleLen <= 30,
      detail: `${titleLen}자`,
      score: titleLen >= 25 && titleLen <= 30 ? 20 : 0,
      maxScore: 20,
    },
    {
      label: "키워드 앞 15자",
      passed: keywordInFirst15 || keyword.length === 0,
      detail: keywordInFirst15 ? "포함됨" : "미포함",
      score: keywordInFirst15 || keyword.length === 0 ? 10 : 0,
      maxScore: 10,
    },
    {
      label: "본문 키워드 2~3회",
      passed: kwCount >= 2 && kwCount <= 3,
      detail: `${kwCount}회`,
      score: kwCount >= 2 && kwCount <= 3 ? 15 : kwCount >= 1 ? 7 : 0,
      maxScore: 15,
    },
    {
      label: "소제목 0~1개",
      passed: headings <= 1,
      detail: `${headings}개`,
      score: headings <= 1 ? 10 : 0,
      maxScore: 10,
    },
    {
      label: "이미지 마커 1개 이상",
      passed: images >= 1,
      detail: `${images}개`,
      score: images >= 1 ? 10 : 0,
      maxScore: 10,
    },
    {
      label: "본문 800~1,200자",
      passed: chars >= 800 && chars <= 1200,
      detail: `${chars.toLocaleString()}자`,
      score:
        chars >= 800 && chars <= 1200
          ? 20
          : chars >= 600 && chars <= 1500
            ? 10
            : 0,
      maxScore: 20,
    },
    {
      label: "태그 10개",
      passed: tags >= 8,
      detail: `${tags}개`,
      score: tags >= 10 ? 10 : tags >= 8 ? 7 : tags >= 5 ? 4 : 0,
      maxScore: 10,
    },
    {
      label: "CTA 이웃 추가",
      passed: hasCta,
      detail: hasCta ? "있음" : "없음",
      score: hasCta ? 5 : 0,
      maxScore: 5,
    },
  ];
}

// ── 디딤 다이어리 (CAT-C) ──

function scoreDiary(
  title: string,
  text: string,
  keyword: string
): SeoCheckItem[] {
  const titleLen = title.length;
  const kwCount = countKeyword(text, keyword);
  const headings = countHeadings(text);
  const images = countImageMarkers(text);
  const chars = charCount(text);
  const tags = countTags(text);

  // CTA 없음 확인 (CTA 키워드 감지되면 실패)
  const ctaFound = DIARY_CTA_KEYWORDS.filter((kw) => text.includes(kw));
  const noCta = ctaFound.length === 0;

  return [
    {
      label: "제목 길이 15~30자",
      passed: titleLen >= 15 && titleLen <= 30,
      detail: `${titleLen}자`,
      score: titleLen >= 15 && titleLen <= 30 ? 15 : 0,
      maxScore: 15,
    },
    {
      label: "본문 키워드 1~3회",
      passed: kwCount >= 1 && kwCount <= 3,
      detail: `${kwCount}회`,
      score: kwCount >= 1 && kwCount <= 3 ? 10 : kwCount === 0 ? 5 : 0,
      maxScore: 10,
    },
    {
      label: "소제목 0~2개",
      passed: headings <= 2,
      detail: `${headings}개`,
      score: headings <= 2 ? 5 : 0,
      maxScore: 5,
    },
    {
      label: "이미지 마커 1개 이상",
      passed: images >= 1,
      detail: `${images}개`,
      score: images >= 1 ? 15 : 0,
      maxScore: 15,
    },
    {
      label: "본문 800~1,500자",
      passed: chars >= 800 && chars <= 1500,
      detail: `${chars.toLocaleString()}자`,
      score:
        chars >= 800 && chars <= 1500
          ? 25
          : chars >= 500 && chars <= 2000
            ? 12
            : 0,
      maxScore: 25,
    },
    {
      label: "태그 5~10개",
      passed: tags >= 5 && tags <= 10,
      detail: `${tags}개`,
      score: tags >= 5 && tags <= 10 ? 10 : tags >= 3 ? 5 : 0,
      maxScore: 10,
    },
    {
      label: "CTA 없음 확인",
      passed: noCta,
      detail: noCta ? "CTA 없음 (정상)" : `감지됨: ${ctaFound.join(", ")}`,
      score: noCta ? 20 : 0,
      maxScore: 20,
    },
  ];
}

// ── 메인 함수 ──

export function calculateCategorySeoScore(
  title: string,
  text: string,
  keyword: string,
  categoryId?: string | null
): SeoScoringResult {
  const promptKey = categoryId ? getPromptKey(categoryId) : "PROMPT_FIELD";

  let checks: SeoCheckItem[];
  switch (promptKey) {
    case "PROMPT_FIELD":
      checks = scoreFieldOrLounge(title, text, keyword, false);
      break;
    case "PROMPT_LOUNGE_GENERAL":
      checks = scoreFieldOrLounge(title, text, keyword, true);
      break;
    case "PROMPT_LOUNGE_BITE":
      checks = scoreBite(title, text, keyword);
      break;
    case "PROMPT_DIARY":
      checks = scoreDiary(title, text, keyword);
      break;
    default:
      checks = scoreFieldOrLounge(title, text, keyword, false);
  }

  const score = checks.reduce((sum, c) => sum + c.score, 0);
  const totalMax = checks.reduce((sum, c) => sum + c.maxScore, 0);

  return { checks, score, totalMax, promptKey };
}
