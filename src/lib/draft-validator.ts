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
    passed: body.includes("📌") || body.includes("바쁜 대표님") || body.includes("3줄 요약"),
    detail: (body.includes("📌") || body.includes("바쁜 대표님") || body.includes("3줄 요약")) ? "포함됨" : "요약 박스 없음",
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

  // ── 이미지 ──
  const imageMarkers = body.match(/\[IMAGE:/g) || [];
  checks.push({
    id: "image-count",
    category: "이미지",
    rule: "이미지 마커 4개",
    passed: imageMarkers.length === 4,
    detail: `현재 ${imageMarkers.length}개`,
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
      passed: body.includes("admin@didimip.com") || body.includes("02-571-6613"),
      detail: body.includes("admin@didimip.com") ? "이메일 포함됨" : "CTA 없음",
    });

    checks.push({
      id: "signature-block",
      category: "서명",
      rule: "디딤 서명 블록 포함",
      passed: body.includes("특허그룹 디딤") && body.includes("기업을 아는 변리사"),
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
