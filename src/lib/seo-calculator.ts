import {
  getRubric,
  STATUS_CHECK_RANGES,
  type RubricRange,
} from "@/lib/constants/seo-rubrics";
import type { Content } from "@/lib/types/database";

// ── 부분 점수 계산 ──

/**
 * 범위 기반 부분 점수 계산
 * 만점: min~max 범위 내
 * 67%: ±50% tolerance
 * 33%: ±100% tolerance
 * 0%: 범위 완전 벗어남
 */
export function calcPartialScore(
  actual: number,
  range: RubricRange
): number {
  const { min, max, weight } = range;
  if (weight === 0) return 0;

  // 범위 내 → 만점
  if (actual >= min && actual <= max) return weight;

  const span = Math.max(max - min, 1);
  const tolerance1 = span;           // ±100% of span
  const tolerance2 = span * 2;       // ±200% of span

  // ±50% → 67%
  if (actual >= min - tolerance1 && actual <= max + tolerance1) {
    return Math.round(weight * 0.67);
  }

  // ±100% → 33%
  if (actual >= min - tolerance2 && actual <= max + tolerance2) {
    return Math.round(weight * 0.33);
  }

  return 0;
}

// ── 개별 항목 계산 ──

export interface SeoCheckResult {
  /** 항목 키 */
  key: string;
  /** 항목 라벨 */
  label: string;
  /** 획득 점수 */
  score: number;
  /** 최대 점수 */
  maxScore: number;
  /** 실측값 (수치) */
  actual: number | string;
  /** 기준값 (범위) */
  expected: string;
  /** 통과 여부 */
  passed: boolean;
  /** 힌트 (미통과 시) */
  hint: string;
}

/**
 * 본문에서 키워드 빈도 계산
 */
function countKeyword(body: string, keyword: string): number {
  if (!keyword || !body) return 0;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "gi");
  return (body.match(regex) || []).length;
}

/**
 * 본문에서 소제목 개수 계산 (## 마크다운 또는 줄바꿈 후 제목 패턴)
 */
function countSubHeadings(body: string): number {
  if (!body) return 0;
  const matches = body.match(/^#{2,3}\s+.+/gm);
  return matches?.length ?? 0;
}

/**
 * 본문에서 이미지 마커 개수 계산
 */
function countImages(body: string): number {
  if (!body) return 0;
  const matches = body.match(/\[IMAGE:\s*.+?\]/g);
  return matches?.length ?? 0;
}

/**
 * CTA 포함 여부 확인
 */
function hasCta(body: string): boolean {
  if (!body) return false;
  // CTA 패턴: 구분선 + 연락처 또는 이웃 추가
  const ctaPatterns = [
    /━{3,}/, // 구분선
    /admin@didimip\.com/, // 이메일
    /이웃\s*추가/, // 이웃 추가
    /Tel:\s*\d{3}-\d{4}-\d{4}/, // 전화번호
  ];
  return ctaPatterns.some((p) => p.test(body));
}

// ── 메인 계산 함수 ──

export interface SeoScoreResult {
  /** 총점 (0~100) */
  totalScore: number;
  /** 최대 가능 점수 */
  maxPossibleScore: number;
  /** 정규화 점수 (0~100) */
  normalizedScore: number;
  /** 개별 항목 결과 */
  items: SeoCheckResult[];
  /** 판정 */
  verdict: "pass" | "fix_required" | "blocked";
  /** 활성 항목 수 */
  activeItemCount: number;
}

/**
 * SEO 점수 자동 계산
 * 콘텐츠 데이터 기반, 카테고리별 루브릭 적용, 상태별 검사 범위 적용
 */
export function calculateSeoScore(
  content: Content,
  categoryId: string | null
): SeoScoreResult {
  const rubric = getRubric(categoryId);
  const status = content.status;
  const activeChecks = STATUS_CHECK_RANGES[status];

  const items: SeoCheckResult[] = [];
  let totalScore = 0;
  let maxPossibleScore = 0;

  const body = content.body ?? "";
  const title = content.title ?? "";
  const keyword = content.target_keyword ?? "";
  const tags = content.tags ?? [];

  // 1. 제목 길이
  if (activeChecks.includes("titleLength")) {
    const titleLen = title.length;
    const score = calcPartialScore(titleLen, rubric.titleLength);
    const passed = titleLen >= rubric.titleLength.min && titleLen <= rubric.titleLength.max;
    items.push({
      key: "titleLength",
      label: "제목 길이",
      score,
      maxScore: rubric.titleLength.weight,
      actual: titleLen,
      expected: `${rubric.titleLength.min}~${rubric.titleLength.max}자`,
      passed,
      hint: passed ? "" : `제목을 ${rubric.titleLength.min}~${rubric.titleLength.max}자로 조정하세요 (현재 ${titleLen}자)`,
    });
    totalScore += score;
    maxPossibleScore += rubric.titleLength.weight;
  }

  // 2. 본문 분량
  if (activeChecks.includes("bodyLength")) {
    const bodyLen = body.replace(/\s/g, "").length;
    const score = calcPartialScore(bodyLen, rubric.bodyLength);
    const passed = bodyLen >= rubric.bodyLength.min && bodyLen <= rubric.bodyLength.max;
    items.push({
      key: "bodyLength",
      label: "본문 분량",
      score,
      maxScore: rubric.bodyLength.weight,
      actual: bodyLen,
      expected: `${rubric.bodyLength.min.toLocaleString()}~${rubric.bodyLength.max.toLocaleString()}자`,
      passed,
      hint: passed ? "" : `본문을 ${rubric.bodyLength.min.toLocaleString()}~${rubric.bodyLength.max.toLocaleString()}자로 조정하세요 (현재 ${bodyLen.toLocaleString()}자)`,
    });
    totalScore += score;
    maxPossibleScore += rubric.bodyLength.weight;
  }

  // 3. 키워드 빈도
  if (activeChecks.includes("keywordFreq")) {
    const freq = countKeyword(body, keyword);
    const score = keyword ? calcPartialScore(freq, rubric.keywordFreq) : 0;
    const passed = freq >= rubric.keywordFreq.min && freq <= rubric.keywordFreq.max;
    items.push({
      key: "keywordFreq",
      label: "키워드 빈도",
      score,
      maxScore: rubric.keywordFreq.weight,
      actual: keyword ? `${freq}회` : "키워드 미설정",
      expected: `${rubric.keywordFreq.min}~${rubric.keywordFreq.max}회`,
      passed: keyword ? passed : false,
      hint: !keyword
        ? "타겟 키워드를 설정하세요"
        : passed
          ? ""
          : freq < rubric.keywordFreq.min
            ? `키워드를 ${rubric.keywordFreq.min}회 이상 사용하세요 (현재 ${freq}회)`
            : `키워드 과다 사용 — ${rubric.keywordFreq.max}회 이하로 줄이세요 (현재 ${freq}회)`,
    });
    totalScore += score;
    maxPossibleScore += rubric.keywordFreq.weight;
  }

  // 4. 소제목 개수
  if (activeChecks.includes("subHeadings")) {
    const headings = countSubHeadings(body);
    const score = rubric.subHeadings.weight > 0
      ? calcPartialScore(headings, rubric.subHeadings)
      : 0;
    const passed = rubric.subHeadings.weight === 0 || (headings >= rubric.subHeadings.min && headings <= rubric.subHeadings.max);
    if (rubric.subHeadings.weight > 0) {
      items.push({
        key: "subHeadings",
        label: "소제목 개수",
        score,
        maxScore: rubric.subHeadings.weight,
        actual: `${headings}개`,
        expected: `${rubric.subHeadings.min}~${rubric.subHeadings.max}개`,
        passed,
        hint: passed ? "" : `소제목(##)을 ${rubric.subHeadings.min}~${rubric.subHeadings.max}개 사용하세요`,
      });
      totalScore += score;
      maxPossibleScore += rubric.subHeadings.weight;
    }
  }

  // 5. CTA 체크
  if (activeChecks.includes("ctaCheck")) {
    const hasCtaInBody = hasCta(body);

    if (rubric.ctaRequired) {
      // CTA 필수 카테고리
      const score = hasCtaInBody ? rubric.ctaWeight : 0;
      items.push({
        key: "ctaCheck",
        label: "CTA 배치",
        score,
        maxScore: rubric.ctaWeight,
        actual: hasCtaInBody ? "있음" : "없음",
        expected: "CTA 필수",
        passed: hasCtaInBody,
        hint: hasCtaInBody ? "" : "구분선(━━━) 아래에 CTA를 배치하세요",
      });
      totalScore += score;
      maxPossibleScore += rubric.ctaWeight;
    } else if (rubric.ctaAbsenceBonus) {
      // 디딤 다이어리: CTA 없으면 보너스
      const score = hasCtaInBody ? 0 : rubric.ctaAbsenceBonus;
      items.push({
        key: "ctaCheck",
        label: "CTA 미포함",
        score,
        maxScore: rubric.ctaAbsenceBonus,
        actual: hasCtaInBody ? "있음 (부적절)" : "없음 (적절)",
        expected: "CTA 없어야 함",
        passed: !hasCtaInBody,
        hint: hasCtaInBody ? "디딤 다이어리에는 CTA를 넣지 마세요" : "",
      });
      totalScore += score;
      maxPossibleScore += rubric.ctaAbsenceBonus;
    }
  }

  // 6. 이미지 개수
  if (activeChecks.includes("imageCount")) {
    const imgCount = countImages(body);
    const score = calcPartialScore(imgCount, rubric.imageCount);
    const passed = imgCount >= rubric.imageCount.min && imgCount <= rubric.imageCount.max;
    items.push({
      key: "imageCount",
      label: "이미지 마커",
      score,
      maxScore: rubric.imageCount.weight,
      actual: `${imgCount}개`,
      expected: `${rubric.imageCount.min}~${rubric.imageCount.max}개`,
      passed,
      hint: passed ? "" : `[IMAGE: 설명] 마커를 ${rubric.imageCount.min}개 이상 배치하세요`,
    });
    totalScore += score;
    maxPossibleScore += rubric.imageCount.weight;
  }

  // 7. 태그 개수
  if (activeChecks.includes("tagCount")) {
    const tagLen = tags.length;
    const score = calcPartialScore(tagLen, rubric.tagCount);
    const passed = tagLen >= rubric.tagCount.min;
    items.push({
      key: "tagCount",
      label: "태그 개수",
      score,
      maxScore: rubric.tagCount.weight,
      actual: `${tagLen}개`,
      expected: `${rubric.tagCount.min}개`,
      passed,
      hint: passed ? "" : `태그를 ${rubric.tagCount.min}개로 채워주세요 (현재 ${tagLen}개)`,
    });
    totalScore += score;
    maxPossibleScore += rubric.tagCount.weight;
  }

  // 정규화: 최대 가능 점수 기준 100점 만점
  const normalizedScore = maxPossibleScore > 0
    ? Math.round((totalScore / maxPossibleScore) * 100)
    : 0;

  // 판정 (S3+ 에서만 "blocked" 가능)
  let verdict: "pass" | "fix_required" | "blocked" = "pass";
  if (normalizedScore < 80) verdict = "fix_required";
  if (normalizedScore < 50 && ["S3", "S4", "S5"].includes(status)) {
    verdict = "blocked";
  }

  return {
    totalScore,
    maxPossibleScore,
    normalizedScore,
    items,
    verdict,
    activeItemCount: items.length,
  };
}
