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
