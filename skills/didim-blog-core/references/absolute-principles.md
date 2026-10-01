# 절대 원칙 (UPGRADE_SPEC §0) 과 코드상의 강제 지점

## 1. 원문: docs/UPGRADE_SPEC.md §0 (13-20행)
````md
## 0. 절대 원칙 (모든 Sprint에서 위반 불가)

1. **이메일은 admin@didimip.com만.** AI 생성, CTA 템플릿, 어디서든 이 주소 외 다른 주소가 나오면 버그.
2. **디딤 다이어리에 CTA 넣으면 버그.** SEO 점수에서도 CTA 없어야 가점. AI 프롬프트에서도 CTA 생성 금지.
3. **카테고리·2차 분류 문자열은 네이버와 100% 일치.** 아래 상수 사용.
4. **모든 카테고리의 글쓰기 공식은 독립.** 프롬프트 4종은 완전 격리. 톤·분량·구조가 카테고리 간 오염 금지.
5. **Vercel Framework Preset은 반드시 "Next.js".** "Other" 설정 시 미들웨어/라우팅 전부 깨짐.
6. **LLM 기본값은 Claude Sonnet 4.6** (model id: `claude-sonnet-4-6`).
````

스킬 환경에서의 적용: 1~4는 그대로 적용한다. 5(Vercel 프리셋)·6(LLM 기본값)은 백오피스 배포/모델 설정이므로 스킬 동작과 무관하다(Claude 가 직접 수행).

## 2. 코드에서 원칙을 강제하는 지점
| 원칙 | 강제 지점 | 근거 |
|---|---|---|
| 이메일은 admin@didimip.com 만 | 발행 화면 CTA 를 복사하기 전 모든 이메일 패턴 `/[\w.-]+@[\w.-]+\.\w+/g` 을 admin@didimip.com 으로 치환(enforceEmail) | publish-helpers.ts:273-277, publish-prep-client.tsx:281-284 |
| 〃 | 초안 자동 검증: 본문 이메일 중 admin@didimip.com 이 아닌 것 → email_mismatch 경고 | prompts.ts:1795-1804 |
| 다이어리 CTA 금지 | 초안 검증: "상담", "문의", "연락", "무료", "진단", "시뮬레이션", "admin@" 포함 시 cta_keyword 경고 | prompts.ts:1767, 1784-1793 |
| 〃 | appendCtaAndSignature: PROMPT_DIARY 면 CTA·면책·태그 블록 미부착 | client-generate.ts:1504-1507 |
| 〃 | 발행 화면: category_id 가 CAT-C/CAT-C-* 이면 CTA 카드 대신 안내문 "디딤 다이어리는 CTA를 넣지 않습니다. 상업적 CTA가 진정성을 훼손할 수 있습니다." | publish-prep-client.tsx:146-151, 605-614 |
| 〃 | SEO: 다이어리는 CTA 없으면 보너스, 있으면 힌트 "디딤 다이어리에는 CTA를 넣지 마세요" | seo-calculator.ts:261-271 |
| 〃 | 포맷 가이드(다이어리): "CTA: ❌ 절대 넣지 않는다", "상담 문의, 연락처, 이메일 일체 금지" | publish-helpers.ts:247-257 |
| 〃 | CATEGORY_TONE_RULES.PROMPT_DIARY "## ⚠️ CTA 절대 금지" | prompts.ts:922-924 |
| IP 뉴스 한 입 분량 | 공백 제외 1,200자 초과 시 char_count 경고 | prompts.ts:1776-1782 |
| 카테고리 문자열 일치 | (자동 강제 없음) 상수·시드가 서로 어긋나 있음 → categories.md 3절 | - |

계산: `python3 scripts/core_rules.py check` (입력 {text, category_id}) = validateGeneratedDraft 포팅.

## 3. 원문: validateGeneratedDraft (prompts.ts:1760-1807)
````ts
// ── 생성 후 자동 검증 ──

export interface DraftValidationWarning {
  type: "char_count" | "cta_keyword" | "email_mismatch";
  message: string;
}

const DIARY_CTA_KEYWORDS = ["상담", "문의", "연락", "무료", "진단", "시뮬레이션", "admin@"];

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

  // 공통: 이메일 주소가 admin@didimip.com인지 확인
  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
  const emails = text.match(emailRegex) || [];
  const invalidEmails = emails.filter((e) => e !== "admin@didimip.com");
  if (invalidEmails.length > 0) {
    warnings.push({
      type: "email_mismatch",
      message: `허용되지 않은 이메일 주소가 감지되었습니다: ${invalidEmails.join(", ")} (admin@didimip.com만 사용 가능)`,
    });
  }

  return warnings;
}
````

## 4. 원문: CTA 감지 패턴 hasCta (seo-calculator.ts:98-115)
````ts
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
````

## 5. 원문: docs/UPGRADE_SPEC.md §11 통합 검토 체크리스트 (719-728행)
````md
## 11. 통합 검토 체크리스트

- [ ] posts 테이블의 status 값이 UI 상태명, API 응답, 칸반 칼럼명에서 동일한가
- [ ] 카테고리 문자열이 DB 시드, UI 드롭다운, AI 프롬프트, CTA 매핑에서 완전 동일한가
- [ ] SEO 루브릭의 카테고리명이 DB category 컬럼 값과 정확히 일치하는가
- [ ] CTA 템플릿의 이메일이 admin@didimip.com인가 (다른 주소 없는가)
- [ ] 다이어리 글 생성 시 CTA가 절대 포함되지 않는가
- [ ] 발행 준비 뷰의 복사 버튼이 순수 텍스트만 복사하는가 (HTML 없는가)
- [ ] 추천 엔진의 카테고리 균형 계산이 실제 발행 이력 기반인가
- [ ] 상태 전이 시 SEO 체크 범위가 정확히 분기되는가
````
