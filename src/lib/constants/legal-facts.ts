/**
 * 법령·제도 고정 사실 테이블 — 교차검증 LLM 이 본문 수치를 대조할 때 사용.
 *
 * 세법·시행령 개정 시 매년 업데이트 필요. 변경 시 last_updated 갱신.
 * 교차검증 시 본문 키워드와 LegalFact.keywords 를 매칭해 관련 팩트만 주입(토큰 절약).
 */

export interface LegalFact {
  /** 정확한 값 ("25%", "2억원", "3인") */
  value: string;
  /** 이 값이 무엇인지 설명 */
  description: string;
  /** 출처 (법률/시행령/매뉴얼) */
  source: string;
  /** 시행일 */
  effectiveDate: string;
  /** 본문 매칭용 키워드 — 본문에 이 중 하나라도 있으면 팩트 주입 */
  keywords: string[];
}

export const LEGAL_FACTS: LegalFact[] = [
  // ── 직무발명보상금 세액공제 ──
  {
    value: "25%",
    description: "직무발명보상금 세액공제율 (기본공제)",
    source: "조세특례제한법 제10조",
    effectiveDate: "2024-01-01",
    keywords: ["직무발명보상금", "직무발명", "보상금 세액공제"],
  },
  {
    value: "50%",
    description: "직무발명보상금 증가분 가산공제율 (직전연도 보상액 없거나 직전연도보다 증가분)",
    source: "조세특례제한법 제10조",
    effectiveDate: "2024-01-01",
    keywords: ["직무발명보상금", "증가분", "가산공제"],
  },

  // ── 기업부설연구소 세액공제 ──
  {
    value: "25%",
    description: "기업부설연구소 연구개발비 세액공제 (중소기업)",
    source: "조세특례제한법 제10조",
    effectiveDate: "2024-01-01",
    keywords: ["기업부설연구소", "연구개발비", "R&D 세액공제"],
  },
  {
    value: "60%",
    description: "기업부설연구소 취득세 감면율",
    source: "지방세특례제한법 제46조",
    effectiveDate: "2024-01-01",
    keywords: ["기업부설연구소", "취득세", "지방세"],
  },
  {
    value: "50%",
    description: "기업부설연구소 재산세 감면율",
    source: "지방세특례제한법 제46조",
    effectiveDate: "2024-01-01",
    keywords: ["기업부설연구소", "재산세", "지방세"],
  },

  // ── 법인세 구간 ──
  {
    value: "9%",
    description: "법인세율 — 과세표준 2억원 이하",
    source: "법인세법 제55조",
    effectiveDate: "2023-01-01",
    keywords: ["법인세", "법인세율", "과세표준"],
  },
  {
    value: "19%",
    description: "법인세율 — 과세표준 2억원 초과 200억원 이하",
    source: "법인세법 제55조",
    effectiveDate: "2023-01-01",
    keywords: ["법인세", "법인세율", "과세표준"],
  },
  {
    value: "21%",
    description: "법인세율 — 과세표준 200억원 초과 3,000억원 이하",
    source: "법인세법 제55조",
    effectiveDate: "2023-01-01",
    keywords: ["법인세", "법인세율", "과세표준"],
  },
  {
    value: "24%",
    description: "법인세율 — 과세표준 3,000억원 초과",
    source: "법인세법 제55조",
    effectiveDate: "2023-01-01",
    keywords: ["법인세", "법인세율", "대기업"],
  },

  // ── 벤처기업 연구개발유형 요건 ──
  {
    value: "5천만원",
    description: "벤처기업 연구개발유형 — 연간 연구개발비 최소 기준",
    source: "벤처기업법 제25조",
    effectiveDate: "2024-01-01",
    keywords: ["벤처기업", "연구개발유형", "연구개발비"],
  },
  {
    value: "5%",
    description: "벤처기업 연구개발유형 — 매출 대비 연구개발비 비율 최소 기준",
    source: "벤처기업법 제25조",
    effectiveDate: "2024-01-01",
    keywords: ["벤처기업", "연구개발유형", "매출"],
  },

  // ── 기업부설연구소 연구전담요원 요건 ──
  {
    value: "10인",
    description: "기업부설연구소 연구전담요원 최소 인원 (대기업)",
    source: "한국산업기술진흥협회 인정 기준",
    effectiveDate: "2024-01-01",
    keywords: ["연구전담요원", "기업부설연구소", "대기업"],
  },
  {
    value: "7인",
    description: "기업부설연구소 연구전담요원 최소 인원 (중견기업)",
    source: "한국산업기술진흥협회 인정 기준",
    effectiveDate: "2024-01-01",
    keywords: ["연구전담요원", "기업부설연구소", "중견기업"],
  },
  {
    value: "3인",
    description: "기업부설연구소 연구전담요원 최소 인원 (중소기업, 예외 有)",
    source: "한국산업기술진흥협회 인정 기준",
    effectiveDate: "2024-01-01",
    keywords: ["연구전담요원", "기업부설연구소", "중소기업"],
  },
  {
    value: "1인",
    description: "연구개발전담부서 연구전담요원 최소 인원 (기업규모 불문)",
    source: "한국산업기술진흥협회 인정 기준",
    effectiveDate: "2024-01-01",
    keywords: ["연구개발전담부서", "연구전담요원"],
  },
];

export const LEGAL_FACTS_META = {
  last_updated: "2026-01-15",
  note: "2026년 기준. 법 개정 시 즉시 업데이트 필요.",
};

/**
 * 본문과 관련된 팩트만 필터링 (토큰 절약).
 * 본문에 팩트의 keywords 중 하나라도 포함되면 해당 팩트 반환.
 */
export function filterRelevantFacts(body: string): LegalFact[] {
  if (!body) return [];
  const bodyLower = body.toLowerCase();
  return LEGAL_FACTS.filter((fact) =>
    fact.keywords.some((kw) => bodyLower.includes(kw.toLowerCase()))
  );
}

/**
 * 팩트 배열을 LLM 프롬프트에 주입할 텍스트 블록으로 변환.
 */
export function formatFactsForPrompt(facts: LegalFact[]): string {
  if (facts.length === 0) return "(관련 고정 사실 없음)";
  return facts
    .map(
      (f) =>
        `- ${f.description}: **${f.value}** (${f.source}, ${f.effectiveDate})`
    )
    .join("\n");
}
