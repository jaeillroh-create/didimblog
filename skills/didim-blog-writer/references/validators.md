# 초안 검증 · 문단 ID 원문

Python 포팅: `scripts/draft_checks.py`(validateDraft·calcDraftScore·validateGeneratedDraft), `scripts/paragraph_ids.py`(문단 ID). 원본 TS와 같은 입력에 같은 결과가 나오는지 확인했다(SKILL.md 참조 파일 절).

## 목차
1. validateDraft · calcDraftScore (draft-validator.ts 전체)
2. validateGeneratedDraft (prompts.ts)
3. 문단 ID 유틸 (paragraph-ids.ts 전체)
4. 이미지 마커 추출 (에디터 — 저장되는 image_markers)

## 1. validateDraft · calcDraftScore

````ts
// src/lib/draft-validator.ts:1-189
// AI 초안 품질 검증

export interface DraftCheckItem {
  id: string;
  category: "제목" | "도입부" | "본문구조" | "서식" | "이미지" | "CTA" | "서명";
  rule: string;
  passed: boolean;
  detail: string;
}

export function validateDraft(
  title: string,
  body: string,
  categoryId: string
): DraftCheckItem[] {
  const checks: DraftCheckItem[] = [];

  // ── 제목 ──
  checks.push({
    id: "title-length",
    category: "제목",
    rule: "25~30자 이내",
    passed: title.length >= 25 && title.length <= 30,
    detail: `현재 ${title.length}자`,
  });

  checks.push({
    id: "title-number",
    category: "제목",
    rule: "숫자(금액/비율/기간) 1개 이상 포함",
    passed: /\d/.test(title),
    detail: /\d/.test(title) ? "포함됨" : "숫자 없음",
  });

  checks.push({
    id: "title-keyword-front",
    category: "제목",
    rule: "핵심 키워드가 앞 15자 안에 배치",
    passed: true,
    detail: "AI 검증 필요",
  });

  // ── 도입부 ──
  const firstSentence = body.split(/[.!?]\s/)[0] || "";
  const firstTwoSentences = body.split(/[.!?]\s/).slice(0, 2).join(". ");

  checks.push({
    id: "hook-result-first",
    category: "도입부",
    rule: "첫 문장이 결과/숫자로 시작 (훅 패턴)",
    passed: /\d/.test(firstSentence),
    detail: /\d/.test(firstSentence) ? "숫자 포함됨" : "첫 문장에 숫자/결과 없음",
  });

  checks.push({
    id: "first-2-sentences-keyword",
    category: "도입부",
    rule: "첫 2문장에 핵심 키워드 + 숫자 포함",
    passed: /\d/.test(firstTwoSentences),
    detail: "검색결과 요약문으로 활용됨",
  });

  // ── 본문 구조 ──
  const headingCount = (body.match(/^##\s/gm) || []).length;
  checks.push({
    id: "subheadings",
    category: "본문구조",
    rule: "소제목(##) 2~3개",
    passed: headingCount >= 2 && headingCount <= 4,
    detail: `현재 ${headingCount}개`,
  });

  const bodyChars = body.replace(/\s/g, "").length;
  checks.push({
    id: "body-length",
    category: "본문구조",
    rule: "본문 1,500~2,500자 (공백 제외)",
    passed: bodyChars >= 1500 && bodyChars <= 2500,
    detail: `현재 ${bodyChars.toLocaleString()}자`,
  });

  checks.push({
    id: "summary-box",
    category: "본문구조",
    rule: "3줄 요약 포함",
    passed: body.includes("📌") || body.includes("바쁜 대표님") || body.includes("3줄 요약") || body.includes("핵심 요약") || (body.includes("1.") && body.includes("2.") && body.includes("3.")),
    detail: (body.includes("📌") || body.includes("바쁜 대표님") || body.includes("3줄 요약") || body.includes("핵심 요약") || (body.includes("1.") && body.includes("2.") && body.includes("3."))) ? "포함됨" : "요약 박스 없음",
  });

  const legalDirectRef = /(?:^|\s)(?:Lanham Act|Patent Act|35 U\.S\.C|§\d+)\s/m.test(body);
  const legalInParens = /\(.*?(?:Lanham|Act|§).*?\)/.test(body);
  checks.push({
    id: "legal-terms",
    category: "본문구조",
    rule: "법조문은 괄호 안에 표기",
    passed: !legalDirectRef || legalInParens,
    detail: legalDirectRef && !legalInParens ? "본문에 법조문 직접 인용됨" : "정상",
  });

  // ── 서식 ──
  const boldCount = (body.match(/\*\*[^*]+\*\*/g) || []).length;
  checks.push({
    id: "bold-emphasis",
    category: "서식",
    rule: "볼드(**) 강조 3개 이상",
    passed: boldCount >= 3,
    detail: `현재 ${boldCount}개`,
  });

  const quoteCount = (body.match(/^>\s/gm) || []).length;
  checks.push({
    id: "quote-block",
    category: "서식",
    rule: "인용 블록(>) 1개 이상",
    passed: quoteCount >= 1,
    detail: `현재 ${quoteCount}개`,
  });

  const dividerCount = (body.match(/^[━─]{3,}$/gm) || []).length;
  checks.push({
    id: "dividers",
    category: "서식",
    rule: "구분선(━━━) 사용",
    passed: dividerCount >= 1,
    detail: `현재 ${dividerCount}개`,
  });

  // ── 본문구조: 마크다운 표 금지 ──
  const hasMarkdownTable = /\|.+\|.*\n\|[-:\s|]+\|/.test(body);
  checks.push({
    id: "no-markdown-table",
    category: "본문구조",
    rule: "마크다운 표 미사용 (인포그래픽으로 대체)",
    passed: !hasMarkdownTable,
    detail: hasMarkdownTable ? "마크다운 표 감지됨 — 인포그래픽으로 대체 필요" : "정상",
  });

  // ── 이미지 ──
  const imageMarkers = body.match(/\[IMAGE:/g) || [];
  checks.push({
    id: "image-count",
    category: "이미지",
    rule: "이미지 마커 1~5개",
    passed: imageMarkers.length >= 1 && imageMarkers.length <= 5,
    detail: `현재 ${imageMarkers.length}개 (1~5개 권장)`,
  });

  checks.push({
    id: "image-headline",
    category: "이미지",
    rule: "이미지 마커에 임팩트 헤드라인 포함",
    passed: imageMarkers.length > 0,
    detail: "AI 검증에서 상세 확인",
  });

  // ── CTA + 서명 (디딤 다이어리 제외) ──
  if (!categoryId.startsWith("CAT-C")) {
    checks.push({
      id: "cta-present",
      category: "CTA",
      rule: "CTA 영역 포함",
      passed: body.includes("roh@didimip.com") || body.includes("02-571-6613"),
      detail: body.includes("roh@didimip.com") ? "이메일 포함됨" : "CTA 없음",
    });

    checks.push({
      id: "signature-block",
      category: "서명",
      rule: "디딤 서명 블록 포함",
      passed: body.includes("노재일 변리사") && body.includes("특허그룹 디딤"),
      detail: body.includes("특허그룹 디딤") ? "포함됨" : "서명 블록 없음",
    });
  }

  return checks;
}

export function calcDraftScore(checks: DraftCheckItem[]): {
  score: number;
  total: number;
  passedCount: number;
  failedItems: DraftCheckItem[];
} {
  const total = checks.length;
  const passedCount = checks.filter((c) => c.passed).length;
  const score = total > 0 ? Math.round((passedCount / total) * 100) : 0;
  const failedItems = checks.filter((c) => !c.passed);
  return { score, total, passedCount, failedItems };
}
````

호출 방식(코드 그대로): 에디터는 `validateDraft(editTitle, editText, "")` — categoryId를 빈 문자열로 넘겨 CTA·서명 검사가 다이어리에도 적용되고, 본문에 문단 ID 주석이 있는 상태로 검사한다. 저장 시 미통과 3개 이상이면 확인 다이얼로그("품질 체크 미통과 항목이 N개 있습니다. 그래도 저장하시겠습니까?").

## 2. validateGeneratedDraft

````ts
// src/lib/constants/prompts.ts:1760-1807
// ── 생성 후 자동 검증 ──

export interface DraftValidationWarning {
  type: "char_count" | "cta_keyword" | "email_mismatch";
  message: string;
}

const DIARY_CTA_KEYWORDS = ["상담", "문의", "연락", "무료", "진단", "시뮬레이션", "@didimip"];

export function validateGeneratedDraft(
  text: string,
  promptKey: PromptKey
): DraftValidationWarning[] {
  const warnings: DraftValidationWarning[] = [];
  const charCount = text.replace(/\s/g, "").length;

  // PROMPT_LOUNGE_BITE: 1,200자 초과 체크
  if (promptKey === "PROMPT_LOUNGE_BITE" && charCount > 1200) {
    warnings.push({
      type: "char_count",
      message: `IP 뉴스 한 입은 1,200자 이내여야 합니다. 현재 ${charCount}자입니다.`,
    });
  }

  // PROMPT_DIARY: CTA 키워드 감지
  if (promptKey === "PROMPT_DIARY") {
    const found = DIARY_CTA_KEYWORDS.filter((kw) => text.includes(kw));
    if (found.length > 0) {
      warnings.push({
        type: "cta_keyword",
        message: `디딤 다이어리에 CTA 관련 키워드가 감지되었습니다: ${found.join(", ")}`,
      });
    }
  }

  // 공통: 이메일 주소가 roh@didimip.com인지 확인
  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
  const emails = text.match(emailRegex) || [];
  const invalidEmails = emails.filter((e) => e !== "roh@didimip.com");
  if (invalidEmails.length > 0) {
    warnings.push({
      type: "email_mismatch",
      message: `허용되지 않은 이메일 주소가 감지되었습니다: ${invalidEmails.join(", ")} (roh@didimip.com만 사용 가능)`,
    });
  }

  return warnings;
}
````

UPGRADE_SPEC §3.2: "생성 결과 검증 실패 → 경고 배너: '생성된 초안에 문제가 있습니다: [분량 초과/CTA 누락/이메일 불일치]' — 초안은 보여주되 경고 표시". 현재 코드에서는 호출되지 않는다(`getGenerationStatus` 호출처 없음).

## 3. 문단 ID 유틸

````ts
// src/lib/utils/paragraph-ids.ts:1-153
/**
 * 문단 ID 유틸리티 — 본문의 각 문단에 <!-- p:N --> 주석을 삽입/추출/제거.
 *
 * 교차검증 시 LLM 이 original_text 를 정확히 복사하지 못하는 문제를 해결하기 위해
 * 문단 단위로 ID 를 부여해서 매칭 정확도를 높인다.
 *
 * 구조: 본문을 \n\n 으로 분할해 각 문단 앞에 `<!-- p:1 -->\n` 주석을 삽입.
 * 네이버 블로그 에디터에서는 HTML 주석이 보이지 않으므로 발행에 영향 없음.
 */

const PARAGRAPH_ID_RE = /<!-- p:(\d+) -->\n?/g;
const PARAGRAPH_ID_LINE_RE = /^<!-- p:\d+ -->$/;

/** 본문에 문단 ID 가 하나라도 있는지 확인 */
export function hasParagraphIds(body: string): boolean {
  return PARAGRAPH_ID_RE.test(body);
}

/**
 * 본문에 문단 ID 를 주입. 이미 있으면 재번호(1부터).
 * 빈 줄(\n\n)로 분할된 각 비어있지 않은 문단에 <!-- p:N --> 삽입.
 */
export function injectParagraphIds(body: string): string {
  // 기존 ID 제거 후 재삽입 (일관성 보장)
  const stripped = stripParagraphIds(body);
  const paragraphs = stripped.split(/\n\n+/);
  let id = 1;
  const result: string[] = [];

  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    // 이미지 마커나 구분선은 ID 부여 건너뛰기
    if (trimmed.startsWith("━━") || trimmed.startsWith("---")) {
      result.push(trimmed);
      continue;
    }
    result.push(`<!-- p:${id} -->\n${trimmed}`);
    id++;
  }

  return result.join("\n\n");
}

/** 본문에서 모든 문단 ID 주석을 제거 — 발행 전 정리용 */
export function stripParagraphIds(body: string): string {
  return body
    .replace(PARAGRAPH_ID_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 문단 ID → 해당 문단 텍스트 매핑 추출 */
export function extractParagraphMap(body: string): Map<number, string> {
  const map = new Map<number, string>();
  const lines = body.split("\n");
  let currentId: number | null = null;
  let currentLines: string[] = [];

  function flush() {
    if (currentId !== null && currentLines.length > 0) {
      map.set(currentId, currentLines.join("\n").trim());
    }
    currentLines = [];
    currentId = null;
  }

  for (const line of lines) {
    const idMatch = line.match(/^<!-- p:(\d+) -->$/);
    if (idMatch) {
      flush();
      currentId = parseInt(idMatch[1], 10);
      continue;
    }
    // 빈 줄이 두 번 이상 → 문단 경계
    if (line.trim() === "" && currentLines.length > 0 && currentLines[currentLines.length - 1]?.trim() === "") {
      flush();
      continue;
    }
    if (currentId !== null) {
      currentLines.push(line);
    } else {
      // ID 없는 문단 — flush 안하고 무시 (ID 부여 전 텍스트)
      currentLines.push(line);
    }
  }
  flush();

  return map;
}

/**
 * 텍스트가 속한 문단 ID 를 찾기.
 * body 에 paragraph ID 가 있을 때, text 가 어느 문단에 포함되는지 탐색.
 * 정확 매칭 → 정규화 매칭 → 첫 문장 매칭 순서로 시도.
 */
export function findParagraphIdForText(body: string, text: string): number | null {
  const map = extractParagraphMap(body);
  if (map.size === 0) return null;

  // LLM 이 응답에 <!-- p:N --> 주석을 포함시키는 경우 (종종 가짜 ID) 제거
  const cleanedText = text.replace(/<!--\s*p:\d+\s*-->\n?/g, "").trim();
  const trimmedText = cleanedText;
  if (!trimmedText) return null;

  // 1) 정확 포함
  for (const [id, content] of map) {
    if (content.includes(trimmedText)) return id;
  }

  // 2) 정규화 포함 (공백/마크다운 무시)
  const normalize = (s: string) =>
    s.replace(/[#*>_`~]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const normText = normalize(trimmedText);
  if (normText.length >= 5) {
    for (const [id, content] of map) {
      if (normalize(content).includes(normText)) return id;
    }
  }

  // 3) 첫 문장(15자 이상) 포함
  const firstSentence = trimmedText.split(/[.!?。]\s/)[0]?.trim();
  if (firstSentence && firstSentence.length >= 15) {
    for (const [id, content] of map) {
      if (content.includes(firstSentence)) return id;
    }
  }

  return null;
}

/**
 * paragraph_id 기반으로 해당 문단의 텍스트를 반환.
 * 문단 ID 가 없거나 매칭되지 않으면 null.
 */
export function getParagraphById(body: string, paragraphId: number): string | null {
  const map = extractParagraphMap(body);
  return map.get(paragraphId) ?? null;
}

/**
 * 특정 문단을 교체. paragraph_id 기반.
 * 성공 시 교체된 본문 반환, 실패 시 null.
 */
export function replaceParagraphById(
  body: string,
  paragraphId: number,
  newContent: string
): string | null {
  const pText = getParagraphById(body, paragraphId);
  if (!pText) return null;
  return body.replace(pText, newContent);
}
````

사용 시점(에디터): Phase 2 직후 주입(Phase 2.5 위치 지정용) → 교차검증 모달 전 재확인 주입 → Phase 3 입력 전 제거 → 저장 전 제거.
주의: `hasParagraphIds`는 전역 정규식 `.test()`라 호출 사이 `lastIndex`가 남아 연속 호출 시 오판할 수 있다(포팅본은 상태 없음).

## 4. 이미지 마커 추출

````ts
// src/app/(dashboard)/contents/ai-editor/[id]/ai-editor-client.tsx:485-538
/**
 * 본문에서 이미지 마커를 추출 — 박스 형식과 단순 형식 모두 지원.
 *
 * 박스 형식 (PHASE2/VISUAL_RULES 표준):
 *   ━━ 📷 이미지 N ━━
 *   [IMAGE: 한국어 설명 | 유형(A~H) |
 *   (1) 한국어: ...
 *   (2) English: ...]
 *   ━━━━━━━━━━━━━━
 *
 * 단순 형식 (다이어리 등):
 *   [IMAGE: 분위기 묘사]
 *
 * 기존 정규식 /\[IMAGE:\s*(.+?)\]/g 은 single-line 매칭이라 박스 형식에서
 * description 안에 줄바꿈이 들어가면 매칭 실패 → 마커 0개로 인식되는 버그.
 */
function extractImageMarkers(text: string): ExtractedImageMarker[] {
  const markers: ExtractedImageMarker[] = [];

  // 1) 박스 형식: [IMAGE: ...] 다음에 ━━ 가 오는 multi-line 매칭
  // ([\s\S]*?) 로 줄바꿈 포함 + 닫는 ] 직후 ━━ 구분선이 와야 함
  // (description 안의 임의의 [type] 같은 nested ] 와 충돌하지 않음)
  // ⚠️ description 은 절대 slice 하지 말 것 — 한국어 + 영문 풀 프롬프트가 들어 있고,
  // slice 가 한글/이모지 character boundary 를 깨면 unpaired surrogate 가 생겨
  // PostgREST 가 PGRST102 (Empty or invalid json) 로 INSERT 를 거부함.
  const boxRe = /\[IMAGE:\s*([\s\S]*?)\]\s*\n\s*━━/g;
  let m: RegExpExecArray | null;
  while ((m = boxRe.exec(text)) !== null) {
    markers.push({
      position: m.index,
      description: m[1].trim(),
      // rawText 는 [IMAGE:..] 까지만 (구분선 제외) — 이후 본문에서 indexOf 로 찾기 위함
      rawText: text.slice(m.index, m.index + m[0].length).replace(/\s*\n\s*━━$/, ""),
    });
  }

  // 2) 단순 형식: 한 줄짜리 [IMAGE: ...] (박스 형식과 위치 겹치지 않는 것만)
  const simpleRe = /\[IMAGE:\s*([^\]\n]+?)\]/g;
  while ((m = simpleRe.exec(text)) !== null) {
    const idx = m.index;
    const overlap = markers.some(
      (mk) => idx >= mk.position && idx < mk.position + mk.rawText.length
    );
    if (overlap) continue;
    markers.push({
      position: idx,
      description: m[1].trim(),
      rawText: m[0],
    });
  }

  markers.sort((a, b) => a.position - b.position);
  return markers;
}
````
