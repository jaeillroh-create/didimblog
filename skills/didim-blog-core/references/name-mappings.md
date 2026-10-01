# 기관명 변경 사전 (name-mappings.ts 전체)

> 출처: src/lib/constants/name-mappings.ts (전체), 사용처 client-generate.ts cleanFinalText, prompts.ts PHASE2/교차검증 규칙.

## 1. 규칙 요약
| 옛 명칭 | 현행 명칭 | 시행일 | 비고 |
|---|---|---|---|
| 특허청 | 지식재산처 | 2025-10-01 | 국무총리실 소속 승격 |

치환하지 않는 보호 패턴(정규식, 순서대로 임시 토큰 처리):
1. `/특허청장이\s*정하는/g` — 법령 문구("특허청장이 정하는")
2. `/구\s*특허청/g` — "구 특허청"
3. `/당시\s*특허청/g` — 과거 맥락
4. `/특허청\s*\(현/g` — 이미 "특허청(현 지식재산처)" 로 주석 처리된 경우
5. `/「[^」]*특허청[^」]*」/g` — 낫표로 묶인 법령명

나머지 "특허청"은 모두 "지식재산처"로 바뀐다. 조사(은/는, 이/가 등)는 고치지 않으므로 치환 뒤 "지식재산처은" 같은 어색한 조사가 생길 수 있다 → 사람이 다듬는다.
계산: `python3 scripts/core_rules.py replace-names` (입력 {"body": ...}).

## 2. 사용처
- Phase 3 후처리 cleanFinalText 의 첫 단계(client-generate.ts:1367-1368) → appendCtaAndSignature 가 호출(다이어리 포함).
- PHASE2_PROMPT 작성 규칙(prompts.ts:985):
````text
- ⚠️ '특허청'이라는 명칭을 사용하지 마세요. 2025년 10월 1일부로 '지식재산처'로 승격되었습니다. 모든 현재 시점 서술에서 '지식재산처'를 사용하세요. 예외: 과거 시점 사실 서술 시 '당시 특허청(현 지식재산처)'로 표기 가능. 예외: 법령명에 '특허청'이 포함된 경우 법령명은 그대로 유지.
````
- PROMPT_CROSS_VALIDATION 검증 항목 7(prompts.ts:1700-1704):
````text
7. 기관명 현행화:
   - 본문에 '특허청'이 현재 시점으로 사용되고 있는가?
   - 2025년 10월 이후 맥락에서 '특허청'은 '지식재산처'로 수정 제안
   - 과거 맥락("당시 특허청")이나 법령명은 예외
   - severity="주의", category="기관명"
````

## 3. 원문: src/lib/constants/name-mappings.ts
````ts
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

## 4. 참고 원문: cleanFinalText (client-generate.ts:1351-1405)
````ts
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
