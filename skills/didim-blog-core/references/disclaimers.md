# 면책조항(Disclaimer) — Level A/B/C/none

> 출처: supabase/migrations/013_disclaimer_templates.sql, src/lib/client-generate.ts:1585-1697.

## 목차
1. 런타임 동작 요약
2. 레벨 판정 규칙 (코드)
3. 사용처
4. 013 마이그레이션과 코드의 차이
5. 원문: client-generate.ts:1585-1697
6. 원문: migration 013

## 1. 런타임 동작 요약
- 실제로 쓰이는 문구는 **코드의 DISCLAIMER_TEMPLATES**(하드코딩)다. `disclaimer_templates` 테이블은 생성·시드만 되고 코드 어디에서도 조회하지 않는다(`grep disclaimer_templates src` 결과 없음).
- 코드 문구 = 013 문구 앞에 AI 고지 1줄 + 빈 줄: `* 본 글은 AI 도구의 도움을 받아 작성되었으며, 변리사가 검수하였습니다.`
- AI 생성이 아닌 글(is_ai_generated=false)은 AI 고지 줄과 뒤 빈 줄을 뺀다.
- 위치: CTA 구분선 바로 앞(before_cta).

## 2. 레벨 판정 규칙 (determineDisclaimerLevel, 위에서부터 첫 일치)
입력 categoryId 는 `secondary_category || category_id`.
1. categoryId 가 `CAT-C` 로 시작 → **none** (다이어리, 문구 없음)
2. categoryId == `CAT-A-01` **또는** (본문 소문자에 LEVEL_A_KEYWORDS 중 하나 포함 **그리고** 본문이 정규식 `/\d+[만백천]?\s*[억만원]/` 에 일치) → **A**
   - LEVEL_A_KEYWORDS: 절세, 세액공제, 법인세, 직무발명보상금, 보상금, 절감, 환급, 만원, 억원, 천만원, 백만원
   - 카테고리와 무관(IP 라운지 글도 A 가능)
3. categoryId == `CAT-B-03` → **C**
4. categoryId 가 `CAT-A` 또는 `CAT-B` 로 시작 → **B**
5. 그 외 → **B** (안전 기본값)
- LEVEL_B_KEYWORDS(인증, 벤처, 연구소, 특허법, 법률, 제도, 규정, 시행령, 조항, 조세특례, 소득세법, 법인세법)는 선언만 되고 판정에 쓰이지 않는다.
- 레이블: A=강한 면책 (절세 사례), B=기본 면책 (법률 해설), C=약한 면책 (뉴스 분석), none=면책 없음 (다이어리).
- 계산: `python3 scripts/core_rules.py disclaimer` (입력 {category_id, body, is_ai_generated}).

## 3. 사용처
| 위치 | 동작 | 근거 |
|---|---|---|
| AI 초안 Phase 3 후처리 | determineDisclaimerLevel(categoryId, 본문, isAiGenerated=true) 결과 text 를 appendCtaAndSignature 에 넘겨 `━━━` 구분선 앞에 삽입 | ai-editor-client.tsx:971-986, client-generate.ts:1560-1572 |
| 발행 준비 화면 면책조항 카드 | 자동 레벨 표시 + 드롭다운으로 A/B/C/none 수동 변경, 복사 버튼. level 이 none 이거나 문구가 비면 카드 숨김 | publish-prep-client.tsx:237-252, 484-537 |
| 다이어리 | appendCtaAndSignature 가 PROMPT_DIARY 면 면책·CTA·태그 모두 붙이지 않음 | client-generate.ts:1504-1507 |

## 4. 013 마이그레이션과 코드의 차이
| 항목 | migration 013 | 코드 |
|---|---|---|
| AI 고지 줄 | 없음 | A/B/C 모두 맨 앞에 있음 |
| 적용 카테고리 | A: CAT-A, CAT-A-01 / B: CAT-A, CAT-A-02, CAT-A-03, CAT-B, CAT-B-01, CAT-B-02 / C: CAT-B-03 / none: CAT-C* | CAT-A-01 만 무조건 A, CAT-A(1차)는 키워드·금액 없으면 B |
| 키워드 | A: 절세, 세액공제, 법인세, 직무발명보상금, 보상금, 절감, 환급 / B: 인증, 벤처, 연구소, 특허법, 법률, 제도, 규정, 시행령 / C: 뉴스, 보도, 기사, 트렌드, 전망, 분석 | A 키워드에 만원·억원·천만원·백만원 추가 + 금액 정규식 동시 충족 필요, B 키워드 미사용, C 키워드 없음 |
| CAT-A-04 | 목록에 없음 | CAT-A 로 시작하므로 B (금액+절세 키워드 시 A) |

## 5. 원문: src/lib/client-generate.ts:1585-1697
````ts
// ── Disclaimer 자동 매칭 (하드코딩 4단계) ──

export type DisclaimerLevel = "A" | "B" | "C" | "none";

const AI_NOTICE = "* 본 글은 AI 도구의 도움을 받아 작성되었으며, 변리사가 검수하였습니다.";

const DISCLAIMER_TEMPLATES: Record<DisclaimerLevel, string> = {
  A: `${AI_NOTICE}

※ 본 글에 제시된 사례와 수치는 특정 조건의 개별 기업 상황을 기반으로 하며, 모든 기업에 동일하게 적용되지 않습니다. 직무발명보상 제도의 세제 혜택은 기업의 매출, 비용 구조, 연구개발 실태, 직무발명 규정의 정비 수준 등에 따라 달라집니다.

실제 세무 신고는 귀사의 세무사와 협의하여 진행하시기 바라며, 본 글은 제도 이해를 위한 일반적인 정보 제공 목적입니다. 구체적인 절세 설계는 개별 상담을 통해 확인 가능합니다.`,

  B: `${AI_NOTICE}

※ 본 내용은 작성 시점의 법령 및 제도를 기준으로 합니다. 법령 개정이나 제도 운영 변경에 따라 내용이 달라질 수 있으며, 개별 기업의 상황에 따라 적용 결과가 다를 수 있습니다. 실제 적용 전 전문가 상담을 권장합니다.`,

  C: `${AI_NOTICE}

※ 본 글은 공개 보도자료 및 공식 통계를 참고하여 작성되었으며, 개별 해석과 전망은 필자의 견해입니다.`,

  none: "",
};

/** Level A 트리거 키워드 — 구체 절세 수치/금액 포함 글 */
const LEVEL_A_KEYWORDS = [
  "절세", "세액공제", "법인세", "직무발명보상금", "보상금", "절감", "환급",
  "만원", "억원", "천만원", "백만원",
];

/** Level B 트리거 키워드 — 법률/제도 해설 글 */
const LEVEL_B_KEYWORDS = [
  "인증", "벤처", "연구소", "특허법", "법률", "제도", "규정", "시행령",
  "조항", "조세특례", "소득세법", "법인세법",
];

/**
 * 콘텐츠의 카테고리 + 본문 키워드를 분석해 적절한 disclaimer 레벨을 결정.
 *
 * 우선순위: A > B > C > none
 *   - CAT-C (다이어리) → none
 *   - CAT-A + Level A 키워드 매칭 → A
 *   - CAT-A(인증/연구소) 또는 CAT-B → B
 *   - CAT-B-03 (뉴스) → C
 *   - 그 외 fallback → B
 */
export function determineDisclaimerLevel(params: {
  categoryId: string;
  body: string;
  isAiGenerated?: boolean;
}): { level: DisclaimerLevel; text: string } {
  const { categoryId, body, isAiGenerated = true } = params;

  // 디딤 다이어리 → none
  if (categoryId.startsWith("CAT-C")) {
    return { level: "none", text: "" };
  }

  // AI 생성이 아닌 경우에도 법적 면책은 필요하지만 AI 고지 문구 제거
  const bodyLower = body.toLowerCase();

  // Level A 체크: 절세/세액공제 관련 콘텐츠 (카테고리 무관, 본문 키워드로 판단)
  // CAT-A-01(절세) 이거나, 본문에 절세 핵심 키워드 + 금액 패턴이 동시 존재
  const hasLevelAKeyword = LEVEL_A_KEYWORDS.some((kw) => bodyLower.includes(kw));
  const hasAmountPattern = /\d+[만백천]?\s*[억만원]/.test(body);
  if (categoryId === "CAT-A-01" || (hasLevelAKeyword && hasAmountPattern)) {
    const text = isAiGenerated
      ? DISCLAIMER_TEMPLATES.A
      : DISCLAIMER_TEMPLATES.A.replace(AI_NOTICE + "\n\n", "");
    return { level: "A", text };
  }

  // Level C 체크: CAT-B-03 (IP 뉴스 한 입)
  if (categoryId === "CAT-B-03") {
    const text = isAiGenerated
      ? DISCLAIMER_TEMPLATES.C
      : DISCLAIMER_TEMPLATES.C.replace(AI_NOTICE + "\n\n", "");
    return { level: "C", text };
  }

  // Level B 체크: CAT-A(비절세) 또는 CAT-B
  if (categoryId.startsWith("CAT-A") || categoryId.startsWith("CAT-B")) {
    const text = isAiGenerated
      ? DISCLAIMER_TEMPLATES.B
      : DISCLAIMER_TEMPLATES.B.replace(AI_NOTICE + "\n\n", "");
    return { level: "B", text };
  }

  // 기타 → B (안전 기본값)
  const text = isAiGenerated
    ? DISCLAIMER_TEMPLATES.B
    : DISCLAIMER_TEMPLATES.B.replace(AI_NOTICE + "\n\n", "");
  return { level: "B", text };
}

/** 레벨별 라벨 (UI 표시용) */
export const DISCLAIMER_LEVEL_LABELS: Record<DisclaimerLevel, string> = {
  A: "강한 면책 (절세 사례)",
  B: "기본 면책 (법률 해설)",
  C: "약한 면책 (뉴스 분석)",
  none: "면책 없음 (다이어리)",
};

/** 특정 레벨의 면책 텍스트 반환 */
export function getDisclaimerText(
  level: DisclaimerLevel,
  isAiGenerated = true
): string {
  const template = DISCLAIMER_TEMPLATES[level];
  if (!template) return "";
  if (!isAiGenerated) return template.replace(AI_NOTICE + "\n\n", "");
  return template;
}
````

## 6. 원문: supabase/migrations/013_disclaimer_templates.sql
````sql
-- 013: 면책조항(Disclaimer) 템플릿 테이블 + 시드 데이터
-- Level A/B/C/none 4단계 면책조항 자동 삽입 시스템

CREATE TABLE IF NOT EXISTS disclaimer_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL CHECK (level IN ('A', 'B', 'C', 'none')),
  name text NOT NULL,
  content text NOT NULL,
  applicable_categories text[],
  applicable_keywords text[],
  position text DEFAULT 'before_cta' CHECK (position IN ('before_cta', 'after_cta', 'top')),
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE disclaimer_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "disclaimer_templates_authenticated_read"
  ON disclaimer_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "disclaimer_templates_authenticated_write"
  ON disclaimer_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 시드 데이터

-- Level A: 구체 수치/절세 사례 포함 글 (강한 수위)
INSERT INTO disclaimer_templates (level, name, content, applicable_categories, applicable_keywords, position, is_default)
VALUES (
  'A',
  '구체 수치/절세 사례 — 강한 면책',
  '※ 본 글에 제시된 사례와 수치는 특정 조건의 개별 기업 상황을 기반으로 하며, 모든 기업에 동일하게 적용되지 않습니다. 직무발명보상 제도의 세제 혜택은 기업의 매출, 비용 구조, 연구개발 실태, 직무발명 규정의 정비 수준 등에 따라 달라집니다.

실제 세무 신고는 귀사의 세무사와 협의하여 진행하시기 바라며, 본 글은 제도 이해를 위한 일반적인 정보 제공 목적입니다. 구체적인 절세 설계는 개별 상담을 통해 확인 가능합니다.',
  ARRAY['CAT-A', 'CAT-A-01'],
  ARRAY['절세', '세액공제', '법인세', '직무발명보상금', '보상금', '절감', '환급'],
  'before_cta',
  true
);

-- Level B: 제도/법률 해설 글 (기본 수위)
INSERT INTO disclaimer_templates (level, name, content, applicable_categories, applicable_keywords, position, is_default)
VALUES (
  'B',
  '제도/법률 해설 — 기본 면책',
  '※ 본 내용은 작성 시점의 법령 및 제도를 기준으로 합니다. 법령 개정이나 제도 운영 변경에 따라 내용이 달라질 수 있으며, 개별 기업의 상황에 따라 적용 결과가 다를 수 있습니다. 실제 적용 전 전문가 상담을 권장합니다.',
  ARRAY['CAT-A', 'CAT-A-02', 'CAT-A-03', 'CAT-B', 'CAT-B-01', 'CAT-B-02'],
  ARRAY['인증', '벤처', '연구소', '특허법', '법률', '제도', '규정', '시행령'],
  'before_cta',
  true
);

-- Level C: 뉴스 분석/트렌드 글 (약한 수위)
INSERT INTO disclaimer_templates (level, name, content, applicable_categories, applicable_keywords, position, is_default)
VALUES (
  'C',
  '뉴스/트렌드 — 약한 면책',
  '※ 본 글은 공개 보도자료 및 공식 통계를 참고하여 작성되었으며, 개별 해석과 전망은 필자의 견해입니다.',
  ARRAY['CAT-B-03'],
  ARRAY['뉴스', '보도', '기사', '트렌드', '전망', '분석'],
  'before_cta',
  true
);

-- Level None: 디딤 다이어리 (삽입 안 함)
INSERT INTO disclaimer_templates (level, name, content, applicable_categories, applicable_keywords, position, is_default)
VALUES (
  'none',
  '다이어리 — 면책 없음',
  '',
  ARRAY['CAT-C', 'CAT-C-01', 'CAT-C-02', 'CAT-C-03'],
  ARRAY[]::text[],
  'before_cta',
  true
);
````
