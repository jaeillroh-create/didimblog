# SEO 체크리스트 18항목 원문 + 본문 기반 판정 표

원본: `seed_data/seo_checklist.json`(전체), `src/lib/constants/seo-items.ts`(전체, LEGACY 표기), `src/actions/seo-checks.ts`(전체, LEGACY 표기),
`src/components/contents/seo-checklist.tsx`(getVerdict, LEGACY), `SPEC.md` §5.2, `docs/UPGRADE_SPEC.md` §6.
스크립트: `scripts/seo_checklist.py`.

현재 운영 화면은 18항목 수동 체크리스트 대신 자동 점수(seo-calculator.md)를 쓴다. 18항목은 "발행 전 사람이 보는 체크리스트"와 레거시 판정 규칙으로 남아 있다.

## 목차
1. 본문 텍스트만 있을 때의 판정 표 (스킬 기준)
2. 판정 규칙 (필수/권장/선택)
3. 원본 간 불일치
4. seed_data/seo_checklist.json 원문
5. seo-items.ts 원문
6. actions/seo-checks.ts 원문
7. seo-checklist.tsx getVerdict 발췌
8. UPGRADE_SPEC.md §6 원문

## 1. 본문 텍스트만 있을 때의 판정 표

입력이 제목·본문(·키워드·태그)뿐일 때 각 항목을 어떻게 판정하는지. "자동"은 코드에 있는 규칙을 그대로 적용, "반자동"은 관찰값을 내지만 최종 판단은 사람, "사람"은 텍스트로 판정 불가.

| ID | 등급(json) | 항목 | 판정 | 방법 / 근거 |
|---|---|---|---|---|
| 1 | 필수 | 제목 길이 | 자동 | `title.length` 가 루브릭 범위 안 (CAT-A/B/B-03 25~30자, 다이어리 15~35자) — seo-rubrics |
| 2 | 필수 | 제목 키워드 위치 | 자동(키워드 필요) | 제목 앞 15자에 키워드 문자열 포함 — ai-editor 간이 체크 L552-558. 키워드 미정이면 사람 |
| 3 | 선택 | 제목 숫자 포함 | 반자동 | 제목에 숫자가 있는지는 자동, 금액/비율/기간인지는 사람 (코드 규칙 없음) |
| 4 | 필수 | 도입부 톤 | 사람(정성) | 첫 문단이 사람의 상황·장면으로 시작하는지, 제도 설명으로 시작하지 않는지 Claude 가 읽고 판단해 근거와 함께 제시 (코드 규칙 없음) |
| 5 | 필수 | 본문 키워드 반복 | 자동(키워드 필요) | 대소문자 무시 출현 수가 루브릭 범위 안 (3~5 / 뉴스 2~3 / 다이어리 1~2) — seo-calculator |
| 6 | 권장 | 소제목 사용 | 자동 | 줄 맨 앞 `##`·`###` 개수가 루브릭 범위 안 (다이어리는 배점 0 → 통과) — seo-calculator |
| 7 | 권장 | 소제목 키워드 | 반자동 | 소제목 줄에 키워드가 그대로 있는지 관찰, "변형" 포함 여부는 사람 (코드 규칙 없음) |
| 8 | 필수 | 이미지 수 | 자동 | `[IMAGE: …]` 마커 수가 루브릭 범위 안. 스킬은 박스형(여러 줄) 마커까지 세는 ai-editor `extractImageMarkers` 기준으로 센다(seo-calculator 정규식은 박스형을 못 셈 — spec 8절) |
| 9 | 필수 | 첫 이미지 | 사람 | 실제 썸네일 이미지가 카테고리 통일 디자인인지 — 마커만으로 판정 불가 |
| 10 | 선택 | 이미지 ALT | 사람 | 네이버 에디터에서 입력. ALT 문구 생성은 didim-blog-publish-prep |
| 11 | 필수 | 본문 분량 | 자동 | 공백 제외 글자수가 루브릭 범위 안 (1500~2000 / 뉴스 800~1200 / 다이어리 800~1500) — seo-calculator |
| 12 | 권장 | 내부 링크 | 사람(관찰값 제공) | 본문의 `blog.naver.com/didimip` 링크 수를 보여주되, 발행 시 추가하는 경우가 많아 사람 확인 (코드 규칙 없음) |
| 13 | 선택 | 외부 링크 | 반자동 | 본문 http(s) 링크 중 디딤 블로그 외 링크 0개면 통과 (코드 규칙 없음, seo-items.ts 에는 항목 자체가 없음) |
| 14 | 필수 | 태그 수 | 자동(태그 목록 필요) | 태그 10개 이상 + 합계 100자 미만 — seo-calculator. 태그 목록이 없으면 사람 |
| 15 | 권장 | 태그 구성 | 사람 | 핵심3+연관3+브랜드2+롱테일2 분류는 의미 판단 |
| 16 | 필수 | CTA 배치 | 자동 | CTA 패턴(━━━, admin@didimip.com, 이웃 추가, 02-571-6613, Tel:, 재무제표, 시뮬레이션을 만들어, 무료 진단) 존재. **다이어리는 반대로 없어야 통과** — seo-calculator |
| 17 | 권장(json)/선택(ts) | 맞춤법 | 사람 | 네이버 맞춤법 검사기 통과 여부. Claude 가 오탈자를 지적할 수는 있으나 "통과" 판정은 사람 |
| 18 | 필수 | 예약 시간 | 입력 시 자동 | 예약 시각이 주어지면 화요일 09:00 인지 확인, 없으면 사람 |

## 2. 판정 규칙 (seo-checks.ts calculateVerdict, seo-checklist.tsx getVerdict)

1. 필수(required) 통과 수 < 10 → `blocked` "발행 불가"
2. 권장(recommended) 미충족 수 > 2 → `fix_required` "수정 필요"
3. 그 외 → `pass` "통과"
- 등급은 `SEO_ITEMS`(seo-items.ts) 기준: 필수 10개(1,2,4,5,8,9,11,14,16,18), 권장 4개(6,7,12,15), 선택 3개(3,10,17). 13번은 없다.
- 확인되지 않은 항목은 미통과로 센다(체크 안 된 상태와 같음). 그래서 사람 확인 항목(9 등)이 남아 있으면 판정은 항상 blocked 다 — 스크립트는 `pending_human` 으로 따로 알려 준다.
- 저장 형식(seo_checks.items): `{"<id>": {"passed": bool, "note": string}}`, 집계 필드 required/recommended/optional_pass_count, verdict.

## 3. 원본 간 불일치 (코드 수정 금지 — 스킬은 아래처럼 처리)

| 항목 | seed_data/seo_checklist.json | seo-items.ts / SPEC §5.2 | seo-rubrics.ts (현행 자동 점수) | 스킬 처리 |
|---|---|---|---|---|
| 13 외부 링크 | optional 으로 존재 | 없음 (17항목) | 없음 | 표시는 json 18항목, 판정 집계는 ts 등급 |
| 17 맞춤법 | recommended | optional | 없음 | 판정 집계는 ts(optional). 표에 둘 다 표기 |
| 권장 개수 | 5개 | 주석 "5개", 실제 4개 | — | 미충족 허용 2개 규칙은 4개 기준으로 계산(원본 그대로) |
| 8 이미지 수 | 최소 3, 최대 7 | 최소 3장 | 3~5 (뉴스 1~3, 다이어리 1~5) | 루브릭 범위 사용 |
| 11 본문 분량 | 1,500~2,500 (다이어리 800~1,500) | 1,500~2,500 | 1,500~2,000 (뉴스 800~1,200) | 루브릭 범위 사용 |
| 14 태그 수 | 정확히 10개 | 10개 | 10개 이상 + 100자 미만 | 루브릭 규칙 사용 |
| 1 제목 길이 | 25~30자 | 25~30자 | 다이어리 15~35자 | 루브릭 범위 사용 |

## 4. seed_data/seo_checklist.json 원문

```json
{
  "version": "2.0",
  "total_items": 18,
  "grades": {
    "required": {
      "label": "필수",
      "color": "#DC2626",
      "count": 10,
      "rule": "모두 통과해야 발행 가능"
    },
    "recommended": {
      "label": "권장",
      "color": "#EA580C",
      "count": 5,
      "rule": "2개까지 미충족 허용"
    },
    "optional": {
      "label": "선택",
      "color": "#6B7280",
      "count": 3,
      "rule": "미충족 허용"
    }
  },
  "items": [
    {
      "id": 1,
      "grade": "required",
      "category": "제목",
      "item": "제목 길이",
      "criteria": "25~30자 이내",
      "reason": "네이버 검색결과에서 잘리지 않는 최적 길이"
    },
    {
      "id": 2,
      "grade": "required",
      "category": "제목",
      "item": "제목 키워드 위치",
      "criteria": "핵심 키워드가 앞 15자 이내",
      "reason": "네이버 알고리즘은 제목 앞부분 키워드에 가중치 부여"
    },
    {
      "id": 3,
      "grade": "optional",
      "category": "제목",
      "item": "제목 숫자 포함",
      "criteria": "금액/비율/기간 1개 이상",
      "reason": "숫자 포함 제목의 클릭률이 2.5배 높음"
    },
    {
      "id": 4,
      "grade": "required",
      "category": "도입부",
      "item": "도입부 톤",
      "criteria": "사람의 상황으로 시작 (제도 설명 시작 금지)",
      "reason": "스토리텔링 도입부가 체류시간 2배 증가"
    },
    {
      "id": 5,
      "grade": "required",
      "category": "본문",
      "item": "본문 키워드 반복",
      "criteria": "핵심 키워드 3~5회 자연스럽게 등장",
      "reason": "너무 적으면 SEO 불리, 너무 많으면 어뷰징"
    },
    {
      "id": 6,
      "grade": "recommended",
      "category": "본문",
      "item": "소제목 사용",
      "criteria": "'제목2' 스타일 2개 이상",
      "reason": "H2 태그가 네이버 알고리즘의 구조 파악에 핵심"
    },
    {
      "id": 7,
      "grade": "recommended",
      "category": "본문",
      "item": "소제목 키워드",
      "criteria": "소제목에 키워드 변형 1개+",
      "reason": "네이버 스마트블록 노출에 유리"
    },
    {
      "id": 8,
      "grade": "required",
      "category": "이미지",
      "item": "이미지 수",
      "criteria": "최소 3장, 최대 7장",
      "reason": "이미지 없는 글은 네이버에서 노출 불리"
    },
    {
      "id": 9,
      "grade": "required",
      "category": "이미지",
      "item": "첫 이미지",
      "criteria": "브랜딩 썸네일 (카테고리별 통일 디자인)",
      "reason": "검색결과 썸네일로 자동 추출됨"
    },
    {
      "id": 10,
      "grade": "optional",
      "category": "이미지",
      "item": "이미지 ALT 텍스트",
      "criteria": "모든 이미지에 키워드 포함 대체텍스트 입력",
      "reason": "이미지 검색 노출 + 접근성 향상"
    },
    {
      "id": 11,
      "grade": "required",
      "category": "본문",
      "item": "본문 분량",
      "criteria": "1,500~2,500자 (다이어리: 800~1,500자)",
      "reason": "너무 짧으면 저품질, 너무 길면 이탈률 증가"
    },
    {
      "id": 12,
      "grade": "recommended",
      "category": "링크",
      "item": "내부 링크",
      "criteria": "관련 글 링크 2~3개",
      "reason": "체류시간 증가 + 크롤링 효율 + 글간 연결"
    },
    {
      "id": 13,
      "grade": "optional",
      "category": "링크",
      "item": "외부 링크",
      "criteria": "최소화 (가급적 0개)",
      "reason": "외부 URL은 네이버 노출에 불이익 가능"
    },
    {
      "id": 14,
      "grade": "required",
      "category": "태그",
      "item": "태그 수",
      "criteria": "정확히 10개",
      "reason": "부족하면 노출 기회 감소, 과다는 스팸 판정"
    },
    {
      "id": 15,
      "grade": "recommended",
      "category": "태그",
      "item": "태그 구성",
      "criteria": "핵심(3)+연관(3)+브랜드(2)+롱테일(2)",
      "reason": "다양한 검색어에 노출되도록 포트폴리오 구성"
    },
    {
      "id": 16,
      "grade": "required",
      "category": "CTA",
      "item": "CTA 배치",
      "criteria": "구분선 아래 + 연락처 포함",
      "reason": "CTA 누락은 전환 기회의 완전 상실"
    },
    {
      "id": 17,
      "grade": "recommended",
      "category": "품질",
      "item": "맞춤법",
      "criteria": "네이버 맞춤법 검사기 통과",
      "reason": "오탈자는 전문성 인식을 심각하게 훼손"
    },
    {
      "id": 18,
      "grade": "required",
      "category": "발행",
      "item": "예약 시간",
      "criteria": "화요일 09:00 설정",
      "reason": "일관된 발행 패턴이 알고리즘 신뢰 신호"
    }
  ]
}```

## 5. seo-items.ts 원문

```ts
// LEGACY: seo-rubrics.ts (카테고리별 루브릭)로 대체됨. 설정 페이지 호환용으로 보존.
// SEO 체크리스트 18항목 정의
export type SeoGrade = "required" | "recommended" | "optional";

export interface SeoItem {
  id: number;
  label: string;
  description: string;
  grade: SeoGrade;
}

export const SEO_ITEMS: SeoItem[] = [
  // 필수 (10개) — 모두 통과해야 발행 가능
  { id: 1, label: "제목 길이", description: "25~30자", grade: "required" },
  { id: 2, label: "제목 키워드 위치", description: "앞 15자 이내", grade: "required" },
  { id: 4, label: "도입부 톤", description: "사람의 상황으로 시작", grade: "required" },
  { id: 5, label: "본문 키워드 빈도", description: "3~5회", grade: "required" },
  { id: 8, label: "이미지 개수", description: "최소 3장", grade: "required" },
  { id: 9, label: "첫 이미지", description: "브랜딩 썸네일", grade: "required" },
  { id: 11, label: "본문 분량", description: "1,500~2,500자", grade: "required" },
  { id: 14, label: "태그 개수", description: "10개", grade: "required" },
  { id: 16, label: "CTA 배치", description: "구분선 + 연락처", grade: "required" },
  { id: 18, label: "예약 시간", description: "화요일 09:00", grade: "required" },

  // 권장 (5개) — 2개까지 미충족 허용
  { id: 6, label: "소제목 개수", description: "'제목2' 2개 이상", grade: "recommended" },
  { id: 7, label: "소제목 키워드", description: "키워드 변형 포함", grade: "recommended" },
  { id: 12, label: "내부 링크", description: "2~3개", grade: "recommended" },
  { id: 15, label: "태그 구성", description: "핵심3+연관3+브랜드2+롱테일2", grade: "recommended" },

  // 선택 (3개) — 미충족 허용
  { id: 3, label: "제목 숫자", description: "숫자 포함 여부", grade: "optional" },
  { id: 10, label: "이미지 ALT", description: "ALT 텍스트 설정", grade: "optional" },
  { id: 17, label: "맞춤법", description: "맞춤법 검사 통과", grade: "optional" },
];

export const REQUIRED_PASS_COUNT = 10;
export const RECOMMENDED_MAX_FAIL = 2;
```

## 6. actions/seo-checks.ts 원문

```ts
// LEGACY: seo-calculator.ts 기반 자동 채점으로 대체됨. seo_checks 테이블은 레거시.
"use server";

import { createClient } from "@/lib/supabase/server";
import type { SeoCheck, SeoVerdict } from "@/lib/types/database";
import {
  SEO_ITEMS,
  REQUIRED_PASS_COUNT,
  RECOMMENDED_MAX_FAIL,
} from "@/lib/constants/seo-items";

function calculateVerdict(
  requiredPass: number,
  recommendedPass: number
): SeoVerdict {
  if (requiredPass < REQUIRED_PASS_COUNT) return "blocked";
  const recommendedTotal = SEO_ITEMS.filter(
    (i) => i.grade === "recommended"
  ).length;
  const recommendedFail = recommendedTotal - recommendedPass;
  if (recommendedFail > RECOMMENDED_MAX_FAIL) return "fix_required";
  return "pass";
}

/**
 * 콘텐츠의 최신 SEO 체크 데이터를 가져옵니다.
 */
export async function getSeoCheck(
  contentId: string
): Promise<SeoCheck | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("seo_checks")
      .select("*")
      .eq("content_id", contentId)
      .order("checked_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return data as SeoCheck;
  } catch (err) {
    console.error("[getSeoCheck] 에러:", err);
    return null;
  }
}

/**
 * SEO 체크 항목을 저장/업데이트합니다.
 */
export async function saveSeoCheck(
  contentId: string,
  items: Record<string, { passed: boolean; note: string }>
): Promise<{ success: boolean; error?: string; data?: SeoCheck }> {
  try {
    const requiredPassCount = SEO_ITEMS.filter(
      (i) => i.grade === "required" && items[String(i.id)]?.passed
    ).length;
    const recommendedPassCount = SEO_ITEMS.filter(
      (i) => i.grade === "recommended" && items[String(i.id)]?.passed
    ).length;
    const optionalPassCount = SEO_ITEMS.filter(
      (i) => i.grade === "optional" && items[String(i.id)]?.passed
    ).length;

    const verdict = calculateVerdict(requiredPassCount, recommendedPassCount);

    const seoCheckData = {
      content_id: contentId,
      checked_at: new Date().toISOString(),
      checked_by: "current-user",
      items,
      required_pass_count: requiredPassCount,
      recommended_pass_count: recommendedPassCount,
      optional_pass_count: optionalPassCount,
      verdict,
    };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("seo_checks")
      .upsert(seoCheckData, { onConflict: "content_id" })
      .select()
      .single();

    if (error) throw error;

    return { success: true, data: data as SeoCheck };
  } catch (err) {
    console.error("[saveSeoCheck] 에러:", err);
    return { success: false, error: "SEO 체크 저장에 실패했습니다." };
  }
}
```

## 7. seo-checklist.tsx getVerdict 발췌 (L24-90)

```tsx

const GRADE_CONFIG: Record<
  SeoGrade,
  { label: string; total: number; badgeClass: string }
> = {
  required: {
    label: "필수",
    total: 10,
    badgeClass: "badge-danger",
  },
  recommended: {
    label: "권장",
    total: 5,
    badgeClass: "badge-warning",
  },
  optional: {
    label: "선택",
    total: 3,
    badgeClass: "badge-info",
  },
};

const VERDICT_CONFIG: Record<
  SeoVerdict,
  { label: string; icon: React.ElementType; badgeClass: string; color: string }
> = {
  pass: {
    label: "통과",
    icon: CheckCircle2,
    badgeClass: "badge-success",
    color: "var(--success)",
  },
  fix_required: {
    label: "수정 필요",
    icon: AlertTriangle,
    badgeClass: "badge-warning",
    color: "var(--warning)",
  },
  blocked: {
    label: "발행 불가",
    icon: XCircle,
    badgeClass: "badge-danger",
    color: "var(--danger)",
  },
};

function getVerdict(items: SeoItemState): SeoVerdict {
  const requiredItems = SEO_ITEMS.filter((i) => i.grade === "required");
  const recommendedItems = SEO_ITEMS.filter((i) => i.grade === "recommended");

  const requiredPass = requiredItems.filter(
    (i) => items[String(i.id)]?.passed
  ).length;
  const recommendedPass = recommendedItems.filter(
    (i) => items[String(i.id)]?.passed
  ).length;

  if (requiredPass < 10) return "blocked";
  const recommendedFail = recommendedItems.length - recommendedPass;
  if (recommendedFail > 2) return "fix_required";
  return "pass";
}

function getGradePassCount(grade: SeoGrade, items: SeoItemState): number {
  return SEO_ITEMS.filter(
    (i) => i.grade === grade && items[String(i.id)]?.passed
  ).length;
```

## 8. docs/UPGRADE_SPEC.md §6 원문 (기획 문서 — 코드와 다른 부분은 spec 8절 참조)

## 6. SEO 체크리스트 루브릭

### 6.1 상태별 체크 범위

| 상태 | 체크 항목 ID |
|---|---|
| PLANNING | 1, 2, 3 (제목 관련 3항목) |
| DRAFTED | 1~7 (+ 분량, 키워드, 소제목, CTA) |
| REVIEWED | 1~9 (+ 이미지 안내, 내부 링크 안내) |
| SCHEDULED / PUBLISHED | 1~18 (전체) |

### 6.2 카테고리별 루브릭 차이

```typescript
export const SEO_RUBRICS = {
  '변리사의 현장 수첩': {
    bodyLength: { min: 1500, max: 2000, weight: 15 },
    keywordFreq: { min: 3, max: 5, weight: 15 },
    subHeadings: { min: 2, max: 3, weight: 10 },
    ctaRequired: true,
    ctaWeight: 10,
    structureRequired: true,  // 7단계 구조
  },
  'IP 라운지': {  // 일반 (특허 전략 노트, AI와 IP)
    bodyLength: { min: 1500, max: 2000, weight: 15 },
    keywordFreq: { min: 3, max: 5, weight: 15 },
    subHeadings: { min: 2, max: 3, weight: 10 },
    ctaRequired: true,
    ctaWeight: 10,
    structureRequired: true,
  },
  'IP 뉴스 한 입': {  // IP 라운지 하위 특수
    bodyLength: { min: 800, max: 1200, weight: 15 },
    keywordFreq: { min: 2, max: 3, weight: 15 },
    subHeadings: { min: 0, max: 1, weight: 5 },
    ctaRequired: true,
    ctaWeight: 5,
    structureRequired: false,  // 경량 포맷
  },
  '디딤 다이어리': {
    bodyLength: { min: 800, max: 1500, weight: 15 },
    keywordFreq: { min: 1, max: 2, weight: 10 },
    subHeadings: { min: 0, max: 2, weight: 0 },  // 없어도 OK
    ctaRequired: false,  // CTA 없어야 가점
    ctaAbsenceBonus: 10,  // CTA 없으면 +10점
    structureRequired: false,  // 자유 에세이
  },
} as const;
```

### 6.3 부분 점수 계산 공식

```typescript
function calcPartialScore(actual: number, min: number, max: number, weight: number): number {
  if (actual >= min && actual <= max) return weight;  // 만점
  
  const tolerance1 = Math.round((max - min) * 0.5);  // ±50% 범위
  const tolerance2 = Math.round((max - min) * 1.0);  // ±100% 범위
  
  if (actual >= min - tolerance1 && actual <= max + tolerance1) return Math.round(weight * 0.67);
  if (actual >= min - tolerance2 && actual <= max + tolerance2) return Math.round(weight * 0.33);
  return 0;
}
```

점수 색상: 80+ → `text-green-600`, 50~79 → `text-orange-500`, 0~49 → `text-red-500`

