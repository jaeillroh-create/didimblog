# 자동 마무리 원문 (Phase 3 이후)

`runPhase3`(에디터)가 Phase 3 응답을 받은 뒤 수행하는 결정적 후처리. `scripts/finalize_draft.py finalize`가 같은 순서로 재현한다.

## 목차
1. 순서 요약
2. 기관명 치환 replaceDeprecatedNames
3. 불확실성 표기 정리 cleanFinalText
4. CTA · 서명 · 태그 한 줄 appendCtaAndSignature (+ DEFAULT_TAGS_BY_CATEGORY)
5. 면책 문구 determineDisclaimerLevel
6. 태그 자동 생성 generateAutoTags
7. 저장값 (status S1, 발행예정일)

## 1. 순서 요약

1. Phase 3 입력 직전 본문에서 문단 ID 제거(`cleanBody`), 이미지 마커 블록 목록 확보.
2. Phase 3 결과가 공백 제외 200자 미만이면 `cleanBody`로 폴백("Phase 3 결과가 너무 짧아 Phase 2 원본을 사용합니다").
3. Phase 3 결과의 마커 블록 수가 줄었으면 사라진 블록을 균등 위치에 재삽입("Phase 3에서 손실된 인포그래픽 마커 N개를 복원했습니다").
4. `determineDisclaimerLevel({categoryId, body, isAiGenerated: true})`.
5. `getFieldCta(categoryId, targetKeyword)`.
6. `appendCtaAndSignature(...)` — 내부에서 `cleanFinalText` → `replaceDeprecatedNames` 실행. 다이어리는 정리만 하고 CTA·태그 생략.
7. `generateAutoTags(...)` → 에디터 태그 필드(본문 끝 태그 줄과 별개 목록).
8. 문단 ID 제거본을 콘텐츠 본문으로 저장, 상태 S1, SEO 점수 저장, 발행예정일 = 다음 화요일.

원문 코드는 `pipeline-runtime.md` 10절.

## 2. replaceDeprecatedNames

````ts
// src/lib/constants/name-mappings.ts:1-62
/**
 * 기관명 변경 사전 — 폐지/승격된 기관명을 현행 명칭으로 치환.
 *
 * Phase 3 후처리 + 교차검증에서 공통 참조.
 * 향후 다른 기관명 변경 시 이 배열에 추가.
 */

export interface DeprecatedName {
  old: string;
  current: string;
  effectiveDate: string;
  note: string;
  /** 치환하면 안 되는 패턴 (법령명, 과거 맥락 등) */
  protectedPatterns: RegExp[];
}

export const DEPRECATED_NAMES: DeprecatedName[] = [
  {
    old: "특허청",
    current: "지식재산처",
    effectiveDate: "2025-10-01",
    note: "국무총리실 소속 승격",
    protectedPatterns: [
      /특허청장이\s*정하는/g,
      /구\s*특허청/g,
      /당시\s*특허청/g,
      /특허청\s*\(현/g,
      /「[^」]*특허청[^」]*」/g,
    ],
  },
];

/**
 * 본문에서 폐지된 기관명을 현행 명칭으로 치환.
 * 법령명, 과거 맥락, 이미 주석 처리된 경우는 보호.
 */
export function replaceDeprecatedNames(body: string): string {
  let result = body;

  for (const entry of DEPRECATED_NAMES) {
    // 보호 패턴을 임시 토큰으로 교체
    const tokens: string[] = [];
    for (const pattern of entry.protectedPatterns) {
      // RegExp 의 g 플래그를 새로 생성 (lastIndex 초기화)
      const re = new RegExp(pattern.source, pattern.flags);
      result = result.replace(re, (match) => {
        tokens.push(match);
        return `__PROTECTED_NAME_${tokens.length - 1}__`;
      });
    }

    // 나머지 old → current 치환
    result = result.replace(new RegExp(entry.old, "g"), entry.current);

    // 보호 토큰 복원
    for (let i = 0; i < tokens.length; i++) {
      result = result.replace(`__PROTECTED_NAME_${i}__`, tokens[i]);
    }
  }

  return result;
}
````

## 3. cleanFinalText

````ts
// src/lib/client-generate.ts:1351-1405
/**
 * 최종 본문에서 "(확인 필요)" / "(미확인)" 같은 불확실성 마커를 제거하는 안전망.
 *
 * Phase 3 LLM 이 PHASE3_PROMPT 의 9번 항목(우회 표현으로 바꾸기) 을 대체로
 * 잘 따르지만, 가끔 본문에 그대로 남는 경우가 있어서 후처리에서 마지막으로 정리.
 *
 * 전략:
 * - "조특법 제○조 (확인 필요)" 같은 패턴 → "조세특례제한법 관련 규정"
 * - "별지 제○호 서식 (확인 필요)" → "관련 별지 서식"
 * - "시행령 제○조 (확인 필요)" → "관련 시행령 규정"
 * - 단독 "(확인 필요)" / "(확인필요)" / "(미확인)" → 빈 문자열로 제거
 * - 연속된 공백 정리
 *
 * 이 함수는 비파괴적이지 않다 — 호출 측이 의도해서 부르는 경우에만 사용한다
 * (Phase 3 후처리에서 appendCtaAndSignature 직전에 호출).
 */
export function cleanFinalText(body: string): string {
  let t = replaceDeprecatedNames(body);

  // 1) 구체적 법령 번호 + (확인 필요) → 일반화
  t = t.replace(
    /조\s*특\s*법\s*제\s*\d+\s*조(?:\s*의\s*\d+)?\s*\(\s*확인\s*필요[^)]*\)/g,
    "조세특례제한법 관련 규정"
  );
  t = t.replace(
    /조세\s*특례\s*제한\s*법\s*제\s*\d+\s*조(?:\s*의\s*\d+)?\s*\(\s*확인\s*필요[^)]*\)/g,
    "조세특례제한법 관련 규정"
  );
  t = t.replace(
    /시행령\s*제\s*\d+\s*조(?:\s*의\s*\d+)?\s*\(\s*확인\s*필요[^)]*\)/g,
    "관련 시행령 규정"
  );
  t = t.replace(
    /시행규칙\s*제\s*\d+\s*조(?:\s*의\s*\d+)?\s*\(\s*확인\s*필요[^)]*\)/g,
    "관련 시행규칙"
  );
  t = t.replace(
    /별지\s*제\s*[0-9]+\s*호\s*서식\s*\(\s*확인\s*필요[^)]*\)/g,
    "관련 별지 서식 (관할 세무서/홈택스에서 최신본 확인 권장)"
  );

  // 2) 단독 "(확인 필요)" / "(확인필요)" / "(미확인)" / "(확정 아님)" 제거
  t = t.replace(/\s*\(\s*확인\s*필요[^)]*\)\s*/g, " ");
  t = t.replace(/\s*\(\s*미확인[^)]*\)\s*/g, " ");
  t = t.replace(/\s*\(\s*확정\s*아님[^)]*\)\s*/g, " ");

  // 3) 연속 공백/탭 정리 (줄바꿈은 보존)
  t = t.replace(/[ \t]{2,}/g, " ");
  // 줄 끝의 trailing space 제거
  t = t.replace(/[ \t]+\n/g, "\n");
  // 3+ 연속 줄바꿈은 2개로 정리
  t = t.replace(/\n{3,}/g, "\n\n");

  return t;
}
````

## 4. appendCtaAndSignature

````ts
// src/lib/client-generate.ts:1314-1349

/**
 * 카테고리(promptKey)별 기본 태그 — 본문 키워드만으로는 SEO 기준(8개 이상)에
 * 미달이라, 카테고리 정체성에 맞는 일반 태그로 채워서 항상 10개 이상 보장.
 * 사용자가 본문 편집기에서 태그를 자유롭게 추가/삭제할 수 있도록 너무 길지 않게.
 */
const DEFAULT_TAGS_BY_CATEGORY: Record<PromptKey, string[]> = {
  PROMPT_FIELD: [
    "직무발명보상",
    "법인세절감",
    "중소기업절세",
    "변리사",
    "특허출원",
    "기업부설연구소",
    "벤처기업인증",
  ],
  PROMPT_LOUNGE_GENERAL: [
    "지식재산",
    "특허전략",
    "IP라운지",
    "AI특허",
    "스타트업특허",
    "기업IP",
    "변리사칼럼",
  ],
  PROMPT_LOUNGE_BITE: [
    "IP뉴스",
    "특허이슈",
    "지식재산트렌드",
    "특허개정",
    "한입IP",
    "변리사칼럼",
    "IP라운지",
  ],
  PROMPT_DIARY: [],
};
````

````ts
// src/lib/client-generate.ts:1484-1583
/**
 * Phase 3 종료 후 후처리 — CTA / 서명 / 태그 한 줄을 본문 끝에 append.
 * 다이어리 카테고리는 그대로 반환 (CTA 금지).
 *
 * 태그 구성 (다이어리 제외, 최소 10개):
 *   1. target_keyword (있으면)
 *   2. LLM 이 [TAGS]...[/TAGS] 로 출력했으면 그 태그들
 *   3. 카테고리별 DEFAULT_TAGS (부족분 채움)
 *   4. 브랜드 태그 (특허그룹디딤, 디딤변리사) — 항상 마지막에 보장
 *
 * 본문은 cleanFinalText 로 한 번 더 정리 후 CTA 블록을 append.
 */
export function appendCtaAndSignature(params: {
  body: string;
  promptKey: PromptKey;
  ctaText?: string;
  emailSubject?: string;
  targetKeyword?: string;
  disclaimerText?: string;
}): string {
  if (params.promptKey === "PROMPT_DIARY") {
    // 다이어리도 (확인 필요) 표기 안전망은 적용 (CTA / 태그는 건너뜀)
    return cleanFinalText(params.body);
  }

  // ⚠️ 본문 비어있음 방어 — body 가 비었는데 CTA/태그만 반환하면 안 됨
  if (!params.body || params.body.replace(/\s/g, "").length < 50) {
    console.error("[appendCtaAndSignature] body 가 비어있거나 너무 짧음:", params.body?.length ?? 0);
    return params.body ?? "";
  }

  // 안전망: PHASE3 가 우회 처리하지 못한 (확인 필요) 마커를 정리
  const cleaned = cleanFinalText(params.body);

  // [TAGS] ... [/TAGS] 가 있으면 추출
  let llmTags: string[] = [];
  const tagsMatch = cleaned.match(/\[TAGS\]([\s\S]*?)\[\/TAGS\]/);
  let bodyWithoutTagsBlock = cleaned;
  if (tagsMatch) {
    llmTags = tagsMatch[1]
      .split(/[,\n#]/)
      .map((t) => t.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean);
    bodyWithoutTagsBlock = cleaned.replace(tagsMatch[0], "").trimEnd();
  }

  const normalize = (t: string) => t.replace(/\s+/g, "").replace(/^#/, "");

  const keyword = normalize(params.targetKeyword ?? "");
  const categoryDefaults = DEFAULT_TAGS_BY_CATEGORY[params.promptKey] ?? [];
  const fixedBrand = ["특허그룹디딤", "디딤변리사"];

  // 우선순위: keyword → LLM 태그 → 카테고리 기본 → 브랜드
  const ordered: string[] = [];
  const seen = new Set<string>();
  function push(t: string) {
    const n = normalize(t);
    if (!n || seen.has(n)) return;
    seen.add(n);
    ordered.push(n);
  }

  if (keyword) push(keyword);
  for (const t of llmTags) push(t);
  for (const t of categoryDefaults) push(t);
  for (const t of fixedBrand) push(t);

  // 최소 10개 보장이 안 되면 (LLM 태그 + 카테고리 기본 다 합쳐도 부족) — 브랜드는 항상 포함
  // 최대 12개로 자르되, 브랜드 2개는 반드시 살림
  let merged = ordered.slice(0, 10);
  for (const b of fixedBrand) {
    if (!merged.includes(normalize(b))) merged = [...merged.slice(0, 9), normalize(b)];
  }

  const tagLine = merged.map((t) => `#${t}`).join(" ");

  // Disclaimer 자동 삽입 (before_cta 위치)
  const disclaimerText = params.disclaimerText?.trim() || "";

  const cta = params.ctaText?.trim() ||
    "관련해서 궁금하신 점이 있다면 admin@didimip.com 으로 편하게 연락주세요.";
  const subject = params.emailSubject?.trim() || "상담 문의";

  const disclaimerBlock = disclaimerText
    ? `\n\n${disclaimerText}\n`
    : "";

  const block = `
${disclaimerBlock}
━━━━━━━━━━━━━━━━━━
${cta}

특허그룹 디딤 | 기업을 아는 변리사
📞 02-571-6613
📧 admin@didimip.com (메일 제목: '${subject}')

${tagLine}`;

  return bodyWithoutTagsBlock.trimEnd() + block;
}
````

결과 블록 형태(다이어리 제외):

````text
{본문}

{면책 문구 — 있으면}

━━━━━━━━━━━━━━━━━━
{CTA 문구}

특허그룹 디딤 | 기업을 아는 변리사
📞 02-571-6613
📧 admin@didimip.com (메일 제목: '{emailSubject}')

#태그1 #태그2 … (최대 10개, 브랜드 2개 보장)
````

## 5. determineDisclaimerLevel

````ts
// src/lib/client-generate.ts:1585-1697
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

DB 마이그레이션 013(`disclaimer_templates`)에도 면책 템플릿이 있지만, 이 경로는 위 하드코딩 템플릿만 쓴다.

## 6. generateAutoTags

````ts
// src/lib/client-generate.ts:1699-1790
/**
 * 코드 기반 태그 자동 생성 — LLM 호출 없이 규칙으로 10개 태그 생성.
 *
 * 구성 (우선순위):
 *   1. 브랜드 태그 2개: 특허그룹디딤, 디딤변리사 (하드코딩)
 *   2. 핵심 태그 ~3개: target_keyword 에서 공백 제거 + 접미사 조합
 *   3. 연관 태그 ~3개: Phase 1 outline 의 keyword_plan 에서 추출
 *   4. 롱테일 ~2개: 핵심키워드 + 카테고리 관련 수식어 조합
 *   5. 카테고리 기본 태그로 10개 채움
 *
 * 다이어리 카테고리는 브랜드 태그만 반환.
 */
export function generateAutoTags(params: {
  promptKey: PromptKey;
  targetKeyword?: string;
  phase1Outline?: Phase1Outline | null;
  categoryId?: string;
}): string[] {
  const { promptKey, targetKeyword, phase1Outline, categoryId } = params;
  const normalize = (t: string) => t.replace(/\s+/g, "").replace(/^#/, "");

  const BRAND_TAGS = ["특허그룹디딤", "디딤변리사"];

  if (promptKey === "PROMPT_DIARY") {
    return [...BRAND_TAGS];
  }

  const tags: string[] = [];
  const seen = new Set<string>();
  function push(raw: string) {
    const t = normalize(raw);
    if (!t || t.length < 2 || seen.has(t)) return;
    seen.add(t);
    tags.push(t);
  }

  // 1. 핵심 태그: target_keyword 변형
  const kw = (targetKeyword ?? "").trim();
  if (kw) {
    // 공백 제거 버전
    push(kw);
    // 공백 제거 + 각 단어
    const words = kw.split(/\s+/).filter((w) => w.length >= 2);
    if (words.length >= 2) {
      // 마지막 2단어 결합
      push(words.slice(-2).join(""));
      // 전체 결합
      push(words.join(""));
    }
    // 키워드 + 접미사
    const suffixes = getCategorySuffixes(categoryId ?? "");
    for (const suffix of suffixes) {
      push(normalize(kw) + suffix);
      if (tags.length >= 5) break;
    }
  }

  // 2. Phase 1 keyword_plan 에서 추출
  if (phase1Outline?.keyword_plan) {
    const positions = phase1Outline.keyword_plan.positions ?? [];
    for (const pos of positions) {
      // "도입부: 직무발명보상금 절세" → "직무발명보상금절세"
      const afterColon = pos.includes(":") ? pos.split(":").slice(1).join(":") : pos;
      const cleaned = afterColon.replace(/[,()]/g, "").trim();
      if (cleaned.length >= 2) push(cleaned);
      if (tags.length >= 8) break;
    }
  }

  // 3. 카테고리 기본 태그로 채움
  const defaults = DEFAULT_TAGS_BY_CATEGORY[promptKey] ?? [];
  for (const d of defaults) {
    push(d);
    if (tags.length >= 8) break;
  }

  // 4. 브랜드 태그 (항상 마지막)
  for (const b of BRAND_TAGS) push(b);

  return tags.slice(0, 10);
}

/** 카테고리별 롱테일 접미사 */
function getCategorySuffixes(categoryId: string): string[] {
  if (categoryId.startsWith("CAT-A")) {
    return ["절세", "세액공제", "중소기업", "방법"];
  }
  if (categoryId.startsWith("CAT-B")) {
    return ["전략", "트렌드", "가이드", "분석"];
  }
  return ["후기", "이야기"];
}
````

동작 특성(코드 그대로): 키워드 + 카테고리 접미사를 단순 결합하므로 "직무발명보상금절세절세" 같은 태그가 나올 수 있다. Phase 1 `keyword_plan.positions`는 위치 설명("섹션2 본문", "CTA 직전")이라 "CTA직전" 같은 태그가 섞일 수 있다.

## 7. 저장값

- `contents.body` = `stripParagraphIds(finalBody)`, `tags` = generateAutoTags 결과, `status` = `S1`, `draft_done_at` = 현재 시각, `is_ai_generated` = true (`saveAiDraftToContent`, actions/ai.ts:710-810).
- `seo_score` = 에디터 간이 SEO 점수(didim-blog-seo 담당), `publish_date` = `getNextTuesday().toISOString().slice(0, 10)` (date-fns `nextTuesday` — 오늘이 화요일이면 다음 주 화요일).
- 저장 버튼 경로: 공백 제외 200자 미만이면 저장 중단, `validateDraft` 미통과 3개 이상이면 확인 다이얼로그.
