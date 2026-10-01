# SEO 자동 점수 (seo-calculator / seo-rubrics) 원문

원본: `src/lib/seo-calculator.ts`(전체), `src/lib/constants/seo-rubrics.ts`(전체), 표시: `src/components/contents/seo-score-panel.tsx`.
스크립트 포팅: `scripts/seo_score.py` (원본 TS 와 같은 입력 35건 대조 일치).

## 목차
1. 요약 규칙
2. seo-rubrics.ts 원문
3. seo-calculator.ts 원문
4. 표시 규칙 (seo-score-panel.tsx 발췌)
5. 호출 위치

## 1. 요약 규칙

**루브릭 선택 (getRubric)**: 입력 = `secondary_category || category_id`. 정확히 있으면 그 키, 없으면 앞 두 토막(`CAT-A-01`→`CAT-A`), 그래도 없거나 비어 있으면 `CAT-A`. 즉 `CAT-B-03`(IP 뉴스 한 입)만 2차 전용 루브릭이 있고, 나머지 2차는 1차 루브릭을 쓴다. `CAT-INTRO` 등 미정의 카테고리는 CAT-A.

| 루브릭 | 본문(공백 제외) | 키워드 | 소제목(## / ###) | CTA | 제목 | 태그 | 이미지 마커 |
|---|---|---|---|---|---|---|---|
| CAT-A 변리사의 현장 수첩 | 1500~2000 / 15 | 3~5 / 15 | 2~3 / 10 | 필수 10 | 25~30 / 10 | 10개↑ & 100자 미만 / 5 | 3~5 / 10 |
| CAT-B IP 라운지 | 1500~2000 / 15 | 3~5 / 15 | 2~3 / 10 | 필수 10 | 25~30 / 10 | 동일 / 5 | 3~5 / 10 |
| CAT-B-03 IP 뉴스 한 입 | 800~1200 / 15 | 2~3 / 15 | 0~1 / 5 | 필수 5 | 25~30 / 10 | 동일 / 5 | 1~3 / 10 |
| CAT-C 디딤 다이어리 | 800~1500 / 15 | 1~2 / 10 | 0~2 / **0(항목 제외)** | **없으면 +10 (있으면 0)** | 15~35 / 10 | 동일 / 5 | 1~5 / 5 |

(`범위 / 배점`. `structureRequired` 는 정의만 있고 점수 계산에 쓰이지 않는다.)

**상태별 검사 범위 (STATUS_CHECK_RANGES)**
- S0(기획): 제목 길이만
- S1(초안): + 본문 분량, 키워드 빈도, 소제목, CTA
- S2(검토) ~ S5: + 이미지 마커, 네이버 태그 (전체 7항목)

**부분 점수 (calcPartialScore)**: 범위 안 → 만점. `span = max(max-min, 1)`, `tol1 = max(ceil(span×1.6), 5)`, `tol2 = max(ceil(span×2.2), 10)`. `[min-tol1, max+tol1]` 안 → `round(배점×0.67)`, `[min-tol2, max+tol2]` 안 → `round(배점×0.33)`, 밖 → 0. 배점 0 이면 0.
- 예(코드로 실제 계산): 제목 25~30/10 → 27자 10, 36자 7, 15자 3, 42자 0. 본문 1500~2000/15 → 1800자 15, 2771자 10, **800자 10**(소스 주석의 "800자 → 5점"은 코드와 다름), 3500자 0. 태그 10/5 → 0~4개 2점, 5~9개 3점(태그는 통과 실패 시만 부분 점수).

**항목별 측정**
- 제목 길이: `title.length` (JS 문자열 길이 — 이모지는 2)
- 본문 분량: 모든 공백 제거 후 길이
- 키워드 빈도: 키워드 정규식 이스케이프 후 **대소문자 무시** 전체 출현 수. 키워드 없으면 0점·미통과("타겟 키워드를 설정하세요")
- 소제목: 줄 맨 앞 `##` 또는 `###` + 공백 + 내용 (`#` 1개·4개는 제외)
- 이미지: `/\[IMAGE:\s*.+?\]/g` — **`]` 가 같은 줄에 있어야** 센다. 여러 줄 박스형 마커(`[IMAGE: 설명 | 유형 |` 다음 줄에 `(1) 한국어…(2) English…]`)는 세지 않는다(확인 필요 — 원본 동작 그대로 포팅)
- CTA 존재: `━{3,}` / `admin@didimip.com` / `이웃\s*추가` / `02-571-6613` / `Tel:\s*[\d-]+` / `재무제표` / `시뮬레이션을?\s*만들어` / `무료\s*진단` 중 하나라도
- 태그: 개수 ≥ min(10) **그리고** 태그 문자열 합계 < 100자 → 만점, 아니면 개수로 부분 점수

**정규화·판정**: `normalizedScore = round(total / maxPossible × 100)`. 80↑ pass(통과), 80 미만 fix_required(수정 필요), **50 미만이면서 상태가 S3·S4·S5 일 때만 blocked(발행 불가)**. S0~S2 는 아무리 낮아도 blocked 가 아니다.

**색상 3단계 (getScoreColor / getScoreBgColor / 진행바)**: 80↑ `text-green-600`·`bg-green-50`·`bg-green-500`, 50~79 `text-orange-500`·`bg-orange-50`·`bg-orange-400`, 0~49 `text-red-500`·`bg-red-50`·`bg-red-500`.

**'발행 불가' 표시**: verdict === "blocked" 일 때 패널 하단에 "발행 불가 — SEO 점수가 50점 미만입니다" / "S3(발행예정) 이상에서는 50점 이상이어야 발행 가능합니다." 를 띄운다. 뱃지 라벨: pass "통과", fix_required "수정 필요", blocked "발행 불가".

**(스킬 추가) 네이버 카테고리 → 루브릭 매핑** — 원본 코드에 없음. `skills/_DECISIONS.md`(2026-10-01) 결정. 루브릭 수치는 위 4종을 그대로 쓴다.

| categoryNo | 이름 | 루브릭 |
|---|---|---|
| 25 / 27 / 26 | 지원사업·인증과 특허 / 출원·심판 실무 / 사례 | CAT-A |
| 24 | 지식재산 경영 | CAT-B |
| 28 | 디딤 소식 | CAT-B-03 |
| 28 + subtype "사무소 소식" | 디딤 소식 > 사무소 소식 | `DIDIM-NEWS-OFFICE` = CAT-B-03 수치, ctaRequired=false, ctaAbsenceBonus=10 |
| 17, 18, 19, 20 | 디딤 다이어리 / 컨설팅 후기 / 디딤 일상 / 대표의 생각 | CAT-C |
| 9, 10, 11, 12, 23 | (레거시) 변리사의 현장 수첩 / 절세 시뮬레이션 / 인증 가이드 / 연구소 운영 실무 / 특허·상표 출원 실무 | CAT-A |
| 13, 14, 15 | (레거시) IP 라운지 / 특허 전략 노트 / AI와 IP | CAT-B |
| 16 | (레거시) IP 뉴스 한 입 | CAT-B-03 |
| 7, 22 | 디딤 소개 / 상담 안내 (고정 페이지) | CAT-A + 경고 |
| `CAT-*` 문자열 | 레거시 ID | 원본 getRubric 그대로 |

이름 비교는 공백·가운뎃점(·ㆍ・)·`/`·`>` 를 무시하고 소문자로 한다. 알 수 없는 값은 CAT-A + 경고.

## 2. seo-rubrics.ts 원문

```ts
import type { ContentStatus } from "@/lib/types/database";

// ── 카테고리별 SEO 루브릭 ──

export interface RubricRange {
  min: number;
  max: number;
  weight: number;
}

export interface CategoryRubric {
  /** 본문 분량 (자) */
  bodyLength: RubricRange;
  /** 키워드 빈도 (회) */
  keywordFreq: RubricRange;
  /** 소제목 개수 */
  subHeadings: RubricRange;
  /** CTA 필수 여부 */
  ctaRequired: boolean;
  /** CTA 배점 */
  ctaWeight: number;
  /** CTA 미포함 시 보너스 (디딤 다이어리) */
  ctaAbsenceBonus?: number;
  /** 7단계 구조 필수 여부 */
  structureRequired: boolean;
  /** 제목 길이 (자) */
  titleLength: RubricRange;
  /** 태그 개수 */
  tagCount: RubricRange;
  /** 이미지 개수 */
  imageCount: RubricRange;
}

/**
 * 카테고리별 SEO 루브릭
 * 카테고리 ID 기반 매핑 (CAT-A, CAT-B, CAT-B-03, CAT-C)
 */
export const SEO_RUBRICS: Record<string, CategoryRubric> = {
  // 변리사의 현장 수첩
  "CAT-A": {
    bodyLength: { min: 1500, max: 2000, weight: 15 },
    keywordFreq: { min: 3, max: 5, weight: 15 },
    subHeadings: { min: 2, max: 3, weight: 10 },
    ctaRequired: true,
    ctaWeight: 10,
    structureRequired: true,
    titleLength: { min: 25, max: 30, weight: 10 },
    tagCount: { min: 10, max: 10, weight: 5 },
    imageCount: { min: 3, max: 5, weight: 10 },
  },

  // IP 라운지 (일반)
  "CAT-B": {
    bodyLength: { min: 1500, max: 2000, weight: 15 },
    keywordFreq: { min: 3, max: 5, weight: 15 },
    subHeadings: { min: 2, max: 3, weight: 10 },
    ctaRequired: true,
    ctaWeight: 10,
    structureRequired: true,
    titleLength: { min: 25, max: 30, weight: 10 },
    tagCount: { min: 10, max: 10, weight: 5 },
    imageCount: { min: 3, max: 5, weight: 10 },
  },

  // IP 뉴스 한 입 (경량)
  "CAT-B-03": {
    bodyLength: { min: 800, max: 1200, weight: 15 },
    keywordFreq: { min: 2, max: 3, weight: 15 },
    subHeadings: { min: 0, max: 1, weight: 5 },
    ctaRequired: true,
    ctaWeight: 5,
    structureRequired: false,
    titleLength: { min: 25, max: 30, weight: 10 },
    tagCount: { min: 10, max: 10, weight: 5 },
    imageCount: { min: 1, max: 3, weight: 10 },
  },

  // 디딤 다이어리
  "CAT-C": {
    bodyLength: { min: 800, max: 1500, weight: 15 },
    keywordFreq: { min: 1, max: 2, weight: 10 },
    subHeadings: { min: 0, max: 2, weight: 0 },
    ctaRequired: false,
    ctaWeight: 0,
    ctaAbsenceBonus: 10,
    structureRequired: false,
    titleLength: { min: 15, max: 35, weight: 10 },
    tagCount: { min: 10, max: 10, weight: 5 },
    imageCount: { min: 1, max: 5, weight: 5 },
  },
};

/**
 * 카테고리 ID로 루브릭 조회
 * secondary → primary 폴백
 */
export function getRubric(categoryId: string | null): CategoryRubric {
  if (!categoryId) return SEO_RUBRICS["CAT-A"]; // 기본값

  // 정확한 매칭
  if (SEO_RUBRICS[categoryId]) return SEO_RUBRICS[categoryId];

  // 상위 카테고리 폴백 (CAT-A-01 → CAT-A)
  const parentId = categoryId.split("-").slice(0, 2).join("-");
  if (SEO_RUBRICS[parentId]) return SEO_RUBRICS[parentId];

  return SEO_RUBRICS["CAT-A"];
}

// ── 상태별 체크 범위 ──

/** 상태별 활성 SEO 항목 ID 범위 */
export const STATUS_CHECK_RANGES: Record<ContentStatus, string[]> = {
  // S0(기획): 제목 관련만
  S0: ["titleLength"],
  // S1(초안): + 본문, 키워드, 소제목, CTA
  S1: ["titleLength", "bodyLength", "keywordFreq", "subHeadings", "ctaCheck"],
  // S2(검토): + 이미지, 태그
  S2: [
    "titleLength",
    "bodyLength",
    "keywordFreq",
    "subHeadings",
    "ctaCheck",
    "imageCount",
    "tagCount",
  ],
  // S3+(발행예정 이상): 전체
  S3: [
    "titleLength",
    "bodyLength",
    "keywordFreq",
    "subHeadings",
    "ctaCheck",
    "imageCount",
    "tagCount",
  ],
  S4: [
    "titleLength",
    "bodyLength",
    "keywordFreq",
    "subHeadings",
    "ctaCheck",
    "imageCount",
    "tagCount",
  ],
  S5: [
    "titleLength",
    "bodyLength",
    "keywordFreq",
    "subHeadings",
    "ctaCheck",
    "imageCount",
    "tagCount",
  ],
};

/**
 * 점수 색상 결정
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 50) return "text-orange-500";
  return "text-red-500";
}

/**
 * 점수 배경색 결정
 */
export function getScoreBgColor(score: number): string {
  if (score >= 80) return "bg-green-50";
  if (score >= 50) return "bg-orange-50";
  return "bg-red-50";
}
```

## 3. seo-calculator.ts 원문

```ts
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
 * 67%: ±tolerance1 (range × 1.6, 최소 5)
 * 33%: ±tolerance2 (range × 2.2, 최소 10)
 * 0%: 범위 완전 벗어남
 *
 * 예시 (제목 25~30자, weight=10):
 *   27자 → 10점, 36자 → 7점(67%), 15자 → 3점(33%), 42자 → 0점
 * 예시 (본문 1500~2000자, weight=15):
 *   1800자 → 15점, 2771자 → 10점(67%), 800자 → 5점(33%), 3500자 → 0점
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
  const tolerance1 = Math.max(Math.ceil(span * 1.6), 5);   // 67% 점수 범위
  const tolerance2 = Math.max(Math.ceil(span * 2.2), 10);   // 33% 점수 범위

  // tolerance1 이내 → 67%
  if (actual >= min - tolerance1 && actual <= max + tolerance1) {
    return Math.round(weight * 0.67);
  }

  // tolerance2 이내 → 33%
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
  // CTA 패턴: 구분선, 연락처, 상담 유도 문구 등
  const ctaPatterns = [
    /━{3,}/, // 구분선
    /admin@didimip\.com/, // 이메일
    /이웃\s*추가/, // 이웃 추가
    /02-571-6613/, // 전화번호
    /Tel:\s*[\d-]+/, // 전화번호 (일반)
    /재무제표/, // 절세 CTA
    /시뮬레이션을?\s*만들어/, // 절세 CTA
    /무료\s*진단/, // 인증/연구소 CTA
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

  // 7. 태그 (네이버 태그 100자 미만 + 개수 체크)
  if (activeChecks.includes("tagCount")) {
    const tagLen = tags.length;
    const tagChars = tags.join("").length;
    const passed = tagLen >= rubric.tagCount.min && tagChars < 100;
    const score = passed ? rubric.tagCount.weight : calcPartialScore(tagLen, rubric.tagCount);
    items.push({
      key: "tagCount",
      label: "네이버 태그",
      score,
      maxScore: rubric.tagCount.weight,
      actual: `${tagLen}개 / ${tagChars}자`,
      expected: `${rubric.tagCount.min}개 이상, 100자 미만`,
      passed,
      hint: tagChars >= 100
        ? `태그 총 글자수가 100자를 초과합니다 (${tagChars}자). 핵심 태그만 남기세요.`
        : tagLen < rubric.tagCount.min
          ? `태그를 ${rubric.tagCount.min}개로 채워주세요 (현재 ${tagLen}개)`
          : "",
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
```

## 4. 표시 규칙 (seo-score-panel.tsx L27-43, L64-138)

```tsx
const VERDICT_CONFIG = {
  pass: {
    label: "통과",
    icon: CheckCircle2,
    badgeClass: "bg-green-100 text-green-700",
  },
  fix_required: {
    label: "수정 필요",
    icon: AlertTriangle,
    badgeClass: "bg-orange-100 text-orange-700",
  },
  blocked: {
    label: "발행 불가",
    icon: XCircle,
    badgeClass: "bg-red-100 text-red-700",
  },
};
// ...
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            SEO 점수
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* 점수 */}
            <span
              className={cn(
                "text-2xl font-bold",
                getScoreColor(result.normalizedScore)
              )}
            >
              {result.normalizedScore}
            </span>
            <span className="text-sm text-muted-foreground">/100</span>
            {/* 판정 뱃지 */}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                verdictConfig.badgeClass
              )}
            >
              <VerdictIcon className="h-3.5 w-3.5" />
              {verdictConfig.label}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 프로그레스 바 */}
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className={cn(
              "h-2 rounded-full transition-all",
              result.normalizedScore >= 80
                ? "bg-green-500"
                : result.normalizedScore >= 50
                  ? "bg-orange-400"
                  : "bg-red-500"
            )}
            style={{ width: `${result.normalizedScore}%` }}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {result.activeItemCount}개 항목 검사 (
          {result.totalScore}/{result.maxPossibleScore}점)
        </p>

        {/* 개별 항목 */}
        <div className="space-y-1.5 mt-3">
          {result.items.map((item) => (
            <SeoItemRow key={item.key} item={item} />
          ))}
        </div>

        {/* S3+ 발행 불가 경고 */}
        {result.verdict === "blocked" && (
          <div className="mt-3 px-3 py-2 bg-red-50 rounded-lg border border-red-200">
            <p className="text-sm text-red-700 font-medium">
              발행 불가 — SEO 점수가 50점 미만입니다
            </p>
            <p className="text-xs text-red-600 mt-1">
              S3(발행예정) 이상에서는 50점 이상이어야 발행 가능합니다.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

## 5. 호출 위치

- 콘텐츠 상세(`app/(dashboard)/contents/[id]/content-detail-client.tsx`): 패널은 `categoryId = secondary_category || category_id` 로 계산(L702-705). 화면 상단 점수는 `content.seo_score ?? calculateSeoScore(...).normalizedScore`(L153-156) — 저장된 값이 우선. 저장 버튼을 누르면 편집 중 값으로 다시 계산해 `seo_score = normalizedScore` 로 저장(L203-227, 2차 카테고리 "none" 이면 1차 사용).
- 상태 전이 체크리스트(status-transition-panel.tsx L120-127): "SEO 점수 70점 이상 (권장)" — 필수 아님.
- AI 에디터 초안 확정 시 저장되는 seo_score 는 이 계산기가 아니라 에디터 간이 체크(editor-quick-check.md) 값이다.
