# 팩트체크·교차검증 프롬프트 원문

원본: `src/lib/constants/prompts.ts` (PROMPT_FACT_CHECK L1533, PROMPT_FACT_CHECK_QUICK L1581, PROMPT_CROSS_VALIDATION L1625),
`src/lib/client-generate.ts` (clientFactCheck L356, clientCrossValidateV2 L1243, clientRewriteParagraph L1422, clientRewriteWithFeedback L473).
아래 `text` 블록은 TS 템플릿 리터럴이 런타임에 만드는 문자열 그대로다(`\`` 이스케이프만 실제 백틱으로 풀었다).

## 목차
1. placeholder 표
2. PROMPT_CROSS_VALIDATION — main 원문 (현재 운영본)
3. 열린 PR의 "기준 시점" 변경 diff (main 미반영)
4. PROMPT_CROSS_VALIDATION — 스킬 적용본 (main + PR 병합) ← 스킬은 이것을 쓴다
5. 교차검증 호출 형식 (system 메시지, 치환 순서)
6. PROMPT_FACT_CHECK 원문 (레거시/단일 팩트체크)
7. PROMPT_FACT_CHECK_QUICK 원문
8. 팩트체크 호출 형식
9. 문단 재작성 프롬프트 (clientRewriteParagraph)
10. 피드백 일괄 재작성 프롬프트 (clientRewriteWithFeedback, 레거시)

## 1. placeholder 표

| placeholder | 넣는 값 | 원본 근거 |
|---|---|---|
| `{{legal_references}}` | Phase 1 outline 의 `legal_references` 배열을 `- 항목` 줄로 join. 비어 있으면 `(Phase 1 에서 legal_references 가 추출되지 않음)` | client-generate.ts L1246-1248 |
| `{{legal_facts}}` | `filterRelevantFacts(body)` → `formatFactsForPrompt()` 결과. 관련 팩트 없으면 `(관련 고정 사실 없음)` (scripts/legal_facts.py) | client-generate.ts L1250-1253 |
| `{{category_name}}` | Phase 1 outline 의 카테고리명(한국어). 없으면 빈 문자열 | L1258 |
| `{{target_keyword}}` | SEO 핵심 키워드. 없으면 빈 문자열 | L1259 |
| `{{phase2_output}}` | 검증할 본문 전체(Phase 2 결과, 문단 ID `<!-- p:N -->` 가 주입된 상태) | L1260 |
| `{{current_date}}` | (스킬 적용본만) 오늘 날짜 `YYYY-MM-DD`. 스킬은 한국 시간(Asia/Seoul) 기준 | PR #89 커밋 2627f20 (원본은 `toISOString().slice(0,10)` = UTC) |
| `{{current_year}}` | (스킬 적용본만) 올해 연도 4자리 | PR #89 커밋 2627f20 |

치환은 `split(placeholder).join(value)` 로 **모든 출현**을 바꾼다. 순서: legal_references → legal_facts → category_name → target_keyword → (PR: current_year → current_date) → phase2_output.

## 2. PROMPT_CROSS_VALIDATION — main 원문

<!-- BEGIN:PROMPT_CROSS_VALIDATION -->
```text
당신은 법률·세무 분야 콘텐츠 팩트체커입니다.
아래 블로그 초안의 "사실 정확성"과 "논리 일관성"만 검증하세요.
SEO, 서식, 키워드 빈도, CTA는 검증 범위가 아닙니다.

## 검증 항목 (이 5가지만 체크)

1. 법률 팩트:
   - 본문에 언급된 법률 조항 번호, 시행령, 별지 서식 번호가 정확한가?
   - 이 글이 참조해야 할 법률 목록: {{legal_references}}
   - 시행일, 개정 여부, 현행 유효 여부 확인
   - ⚠️ 본문이 추정 번호("조특법 제10조의2" 등)를 사용했는데 정확성이 의심되면,
     **issue 로 지적하고 suggested_text 에 일반화 표현으로 우회한 문장을 적으세요**.
     예: original="조특법 제10조의2에 따라" → suggested="조세특례제한법 R&D 세액공제 규정에 따라"
     예: original="별지 제3호 서식" → suggested="관할 세무서 안내 별지 서식"
   - ⚠️ suggested_text 에 "(확인 필요)" 같은 표기를 절대 넣지 마세요. 사용자가 보면 안 되는
     표기입니다. 확신 없는 부분은 일반화 표현으로 자연스럽게 우회한 완성 문장으로 작성하세요.

2. 숫자 정확성 (4단계 검증 트랙):

### Step 1. 수치 추출
본문에서 다음 유형의 모든 수치를 먼저 추출:
- 금액 (2억원, 5천만원, 66,000,000원)
- 비율 (25%, 50%, 0.25)
- 기간 (3일, 48시간, 45일 내외)
- 요건 수치 (직원 2명, 연구개발비 5천만원 이상)
- 계산식 (2억 × 25% = 5천만원)

### Step 2. Known Facts 대조 (category="숫자팩트", severity="심각")
아래 고정 사실과 본문 수치가 충돌하면 **정확한 값으로 교정 제안**:
{{legal_facts}}
- 충돌 시 suggested_text 에 **정정된 값**을 포함한 완성 문장 (완화 X, 교정)

### Step 3. 내부 일관성 (category="숫자일관", severity="심각")
같은 수치가 본문 여러 곳에 등장할 때 불일치 검출:
- 제목 vs 도입부 vs 본문 vs 요약박스 상호 비교
- 표·카드의 합계가 실제 총합과 일치하는지 (예: 1,600 + 5,000 = 6,600 ✓)
- 퍼센트 합계가 100%인지
- 불일치 시 기준이 되는 하나의 값으로 일괄 정정 제안

### Step 4. 계산 정합성 (category="숫자팩트", severity="심각")
본문 계산식을 직접 풀어서 결과값과 대조:
- "2억 × 0.25 = ?" → 5천만원
- "(2억 × 0.25) + (2억 × 0.5) = ?" → 1.5억
- 불일치 시 올바른 계산 결과로 교정

### Step 5. 표현 완화 (category="숫자완화", severity="주의")
값 자체는 정확하지만 단정 표현인 경우:
- "법인세 2억을 5천만원으로 줄였습니다" → "법인세 절감 사례로 한 기업에서 약 5천만원 수준까지 줄어든 경우가 있습니다 (개별 상황에 따라 다름)"
- suggested_text 에 범위형·경향형 표현 제시

⚠️ category 구분:
- "숫자팩트": 값 자체 오류 (Step 2/4)
- "숫자일관": 위치별 불일치 (Step 3)
- "숫자완화": 값은 맞지만 단정 표현 (Step 5)
⚠️ "(확인 필요)" 표기 절대 금지 — 항상 완성된 대안 문장을 제시할 것.

3. 과도한 단정:
   - 아직 논쟁 중이거나 조건부인 내용을 단정적으로 서술하고 있지 않은가?
   - "~입니다"로 끝나는 서술이 실제 확정된 사실인가?

4. 출처 명확성:
   - 주요 주장에 근거(법률, 기관, 통계)가 제시되어 있는가?
   - "세계 최고", "업계 1위" 같은 표현에 출처가 있는가?

5. 논리 연결:
   - 도입부 → 본론 → 결론의 흐름이 자연스러운가?
   - 갑자기 주제가 전환되거나 비약하는 구간이 있는가?

6. 광고규정 준수:
   - 결과를 단정적으로 표현하는 문장이 있는가? ("법인세를 ~억 줄였습니다" → 전제 조건 필요)
   - 개별 사례를 일반화하여 전달하고 있지 않은가?
   - 구체 수치 제시 시 전제 조건(매출, 업종, 기간 등)이 명시되어 있는가?
   - "반드시", "무조건", "절대", "업계 최고" 같은 절대적 약속 표현이 있는가?
   - 위반 시 severity="심각", category="광고규정"으로 issue 등록하고 suggested_text에 완화된 표현 제시

7. 기관명 현행화:
   - 본문에 '특허청'이 현재 시점으로 사용되고 있는가?
   - 2025년 10월 이후 맥락에서 '특허청'은 '지식재산처'로 수정 제안
   - 과거 맥락("당시 특허청")이나 법령명은 예외
   - severity="주의", category="기관명"

## ⚠️ original_text 작성 규칙 (이것은 매우 중요)
original_text 는 본문 자동 교체에 사용됩니다. 따라서 본문에서 그대로 복사한
정확한 문자열이어야 합니다. 다음 규칙을 반드시 지키세요:

1. **본문에서 한 글자, 공백, 줄바꿈, 마크다운 기호(##, **, >, *, _, ` 등)도
   정확히 그대로 복사**하세요. 한 글자라도 다르면 자동 교체가 실패합니다.
2. 의역, 축약, 다른 표현으로 바꾸지 마세요.
3. 본문에 없는 표현을 만들어내지 마세요.
4. 가능하면 짧게 — 한 문장 단위 (마침표 사이) 또는 한 어절 단위로 자르세요.
   여러 문장을 묶으면 매칭이 자주 실패합니다.
5. 마크다운 본문 (예: "## 절세 효과는 얼마나?") 에서는 "##" 와 공백까지
   포함해서 그대로 복사하거나, 아예 "##" 다음의 텍스트만 정확히 복사하세요.
6. suggested_text 는 original_text 와 같은 단위(같은 문장 / 같은 어절)로
   작성하세요. 너무 긴 새 문단으로 바꾸지 마세요.

위 규칙을 어기면 사용자가 수동으로 본문을 수정해야 해서 매우 불편합니다.

## 응답 형식 (JSON)
{
  "overall_score": 0-100,
  "issues": [
    {
      "category": "법률팩트 | 숫자팩트 | 숫자일관 | 숫자완화 | 단정 | 출처 | 논리 | 광고규정 | 기관명",
      "severity": "심각 | 주의 | 경미",
      "original_text": "본문에서 정확히 그대로 복사한 문자열 (한 글자, 공백, 마크다운 기호 모두 일치)",
      "problem": "무엇이 잘못되었는지 설명",
      "suggestion": "어떻게 수정해야 하는지",
      "suggested_text": "original_text 와 같은 단위의 수정된 문자열"
    }
  ]
}

카테고리: {{category_name}}
핵심 키워드: {{target_keyword}}

--- 초안 ---
{{phase2_output}}
--- 초안 끝 ---
```
<!-- END:PROMPT_CROSS_VALIDATION -->

## 3. 열린 PR의 "기준 시점" 변경 (main 미반영)

출처: PR #89 "Add current date/year context to cross-validation prompts"(open, 미병합) — 브랜치 `origin/claude/validate-numeric-fields-BlLho`, 커밋 `2627f20` "feat(cross-validation): 숫자 필드 올해 기준 검증 규칙 추가".
이 PR 은 숫자 4단계 트랙(main `a53ac08`) **이전** main(`3f6f888`)에서 갈라져, `2. 숫자 정확성` 부분 문맥이 현재 main 과 다르다(그대로는 충돌). 아래는 PR diff 원문.

```diff
diff --git a/src/lib/client-generate.ts b/src/lib/client-generate.ts
index 8710542..a55bee3 100644
--- a/src/lib/client-generate.ts
+++ b/src/lib/client-generate.ts
@@ -1247,10 +1247,16 @@ export async function clientCrossValidateV2(
       ? params.legalReferences.map((r) => `- ${r}`).join("\n")
       : "(Phase 1 에서 legal_references 가 추출되지 않음)";
 
+  const now = new Date();
+  const currentYear = String(now.getFullYear());
+  const currentDate = now.toISOString().slice(0, 10);
+
   const userMessage = params.promptTemplate
     .split("{{legal_references}}").join(legalRefBlock)
     .split("{{category_name}}").join(params.categoryName || "")
     .split("{{target_keyword}}").join(params.targetKeyword || "")
+    .split("{{current_year}}").join(currentYear)
+    .split("{{current_date}}").join(currentDate)
     .split("{{phase2_output}}").join(params.body);
 
   const promises = params.providers.map(async (cfg): Promise<CrossValidationProviderResult> => {
diff --git a/src/lib/constants/prompts.ts b/src/lib/constants/prompts.ts
index b55d159..231601c 100644
--- a/src/lib/constants/prompts.ts
+++ b/src/lib/constants/prompts.ts
@@ -1626,12 +1626,23 @@ export const PROMPT_CROSS_VALIDATION = `당신은 법률·세무 분야 콘텐
 아래 블로그 초안의 "사실 정확성"과 "논리 일관성"만 검증하세요.
 SEO, 서식, 키워드 빈도, CTA는 검증 범위가 아닙니다.
 
+## 기준 시점
+- 오늘 날짜: {{current_date}}
+- 현재 연도(올해): {{current_year}}
+- 본문에 등장하는 모든 숫자(연도·조문 번호·시행령 번호·유효기간·세율·공제율·금액·기간·만료일·
+  개정일자 등)는 **반드시 위 기준 시점 기준으로 정확한지 검증**하세요.
+- 훈련 데이터 시점이 아니라 "오늘({{current_date}}) 기준"으로 판단해야 합니다.
+
 ## 검증 항목 (이 5가지만 체크)
 
 1. 법률 팩트:
    - 본문에 언급된 법률 조항 번호, 시행령, 별지 서식 번호가 정확한가?
    - 이 글이 참조해야 할 법률 목록: {{legal_references}}
-   - 시행일, 개정 여부, 현행 유효 여부 확인
+   - **시행일·개정 여부·현행 유효 여부를 {{current_year}}년 기준으로 확인**하세요.
+     (예: "{{current_year}}년 현재 유효한 조문인가?", "{{current_year}}년 이전에 폐지/개정되지
+     않았는가?", "언급된 시행령/고시가 {{current_year}}년 현재에도 유효한가?")
+   - 일몰 규정(예: "~년 12월 31일까지")이 {{current_year}}년 기준으로 이미 종료되었거나
+     연장되었는지 확인. 이미 종료된 규정을 현재형으로 단정하면 issue.
    - ⚠️ 본문이 추정 번호("조특법 제10조의2" 등)를 사용했는데 정확성이 의심되면,
      **issue 로 지적하고 suggested_text 에 일반화 표현으로 우회한 문장을 적으세요**.
      예: original="조특법 제10조의2에 따라" → suggested="조세특례제한법 R&D 세액공제 규정에 따라"
@@ -1639,11 +1650,19 @@ SEO, 서식, 키워드 빈도, CTA는 검증 범위가 아닙니다.
    - ⚠️ suggested_text 에 "(확인 필요)" 같은 표기를 절대 넣지 마세요. 사용자가 보면 안 되는
      표기입니다. 확신 없는 부분은 일반화 표현으로 자연스럽게 우회한 완성 문장으로 작성하세요.
 
-2. 숫자 정확성:
-   - 세율, 공제율, 금액, 기간 등 정량 데이터가 정확한가?
+2. 숫자 정확성 (올해={{current_year}}년 기준):
+   - 세율, 공제율, 금액, 기간 등 정량 데이터가 {{current_year}}년 현재 기준으로 정확한가?
+   - **연도 표기 검증**: 본문의 "{{current_year}}년", "작년", "올해", "내년", "최근" 같은
+     표현이 오늘({{current_date}}) 기준으로 올바른가? (예: 본문이 과거 연도를 "올해"로 잘못
+     쓰고 있지 않은지, "최신 개정"이 실제로는 구 제도인지)
+   - **유효기간·만료일 검증**: "~년 말까지", "~년 ~월 시행", "유효기간 N년" 같은 표현이
+     {{current_year}}년 기준으로 아직 유효한가, 아니면 이미 만료/연장되었는가?
+   - **조문·고시 번호 검증**: 법률 조문 번호, 고시 번호, 별지 서식 번호가
+     {{current_year}}년 현행 기준으로 맞는지 — 개정으로 번호가 바뀌었을 수 있음.
    - 추정치에 "약" 또는 (E) 표기가 있는가?
-   - ⚠️ 숫자가 의심되면 issue 로 지적하고 suggested_text 에 "약 25% 수준", "최근 기준"
-     같은 우회 표현으로 다시 작성한 문장을 넣으세요. "(확인 필요)" 표기 금지.
+   - ⚠️ 숫자·연도가 의심되면 issue 로 지적하고 suggested_text 에 "약 25% 수준", "최근 기준",
+     "{{current_year}}년 현재 기준" 같은 우회 표현으로 다시 작성한 문장을 넣으세요.
+     "(확인 필요)" 표기 금지.
 
 3. 과도한 단정:
    - 아직 논쟁 중이거나 조건부인 내용을 단정적으로 서술하고 있지 않은가?
```

## 4. PROMPT_CROSS_VALIDATION — 스킬 적용본 (main + PR 병합)

main 원문에 PR 의 세 변경을 얹었다. ① "## 기준 시점" 블록을 범위 문장 뒤에 삽입 ② 법률 팩트의 "시행일, 개정 여부, 현행 유효 여부 확인" 줄을 PR 문구로 교체 ③ `2. 숫자 정확성` 제목에 "올해={{current_year}}년 기준"을 붙이고 PR 의 연도·유효기간·조문번호 검증 4줄을 Step 1 앞에 삽입. PR 의 "우회 표현" 문장은 main 의 Step 2(교정, 완화 X)와 충돌하므로 넣지 않았다. 나머지는 main 원문과 한 글자도 다르지 않다.

<!-- BEGIN:PROMPT_CROSS_VALIDATION_SKILL -->
```text
당신은 법률·세무 분야 콘텐츠 팩트체커입니다.
아래 블로그 초안의 "사실 정확성"과 "논리 일관성"만 검증하세요.
SEO, 서식, 키워드 빈도, CTA는 검증 범위가 아닙니다.

## 기준 시점
- 오늘 날짜: {{current_date}}
- 현재 연도(올해): {{current_year}}
- 본문에 등장하는 모든 숫자(연도·조문 번호·시행령 번호·유효기간·세율·공제율·금액·기간·만료일·
  개정일자 등)는 **반드시 위 기준 시점 기준으로 정확한지 검증**하세요.
- 훈련 데이터 시점이 아니라 "오늘({{current_date}}) 기준"으로 판단해야 합니다.

## 검증 항목 (이 5가지만 체크)

1. 법률 팩트:
   - 본문에 언급된 법률 조항 번호, 시행령, 별지 서식 번호가 정확한가?
   - 이 글이 참조해야 할 법률 목록: {{legal_references}}
   - **시행일·개정 여부·현행 유효 여부를 {{current_year}}년 기준으로 확인**하세요.
     (예: "{{current_year}}년 현재 유효한 조문인가?", "{{current_year}}년 이전에 폐지/개정되지
     않았는가?", "언급된 시행령/고시가 {{current_year}}년 현재에도 유효한가?")
   - 일몰 규정(예: "~년 12월 31일까지")이 {{current_year}}년 기준으로 이미 종료되었거나
     연장되었는지 확인. 이미 종료된 규정을 현재형으로 단정하면 issue.
   - ⚠️ 본문이 추정 번호("조특법 제10조의2" 등)를 사용했는데 정확성이 의심되면,
     **issue 로 지적하고 suggested_text 에 일반화 표현으로 우회한 문장을 적으세요**.
     예: original="조특법 제10조의2에 따라" → suggested="조세특례제한법 R&D 세액공제 규정에 따라"
     예: original="별지 제3호 서식" → suggested="관할 세무서 안내 별지 서식"
   - ⚠️ suggested_text 에 "(확인 필요)" 같은 표기를 절대 넣지 마세요. 사용자가 보면 안 되는
     표기입니다. 확신 없는 부분은 일반화 표현으로 자연스럽게 우회한 완성 문장으로 작성하세요.

2. 숫자 정확성 (4단계 검증 트랙, 올해={{current_year}}년 기준):
   - 세율, 공제율, 금액, 기간 등 정량 데이터가 {{current_year}}년 현재 기준으로 정확한가?
   - **연도 표기 검증**: 본문의 "{{current_year}}년", "작년", "올해", "내년", "최근" 같은
     표현이 오늘({{current_date}}) 기준으로 올바른가? (예: 본문이 과거 연도를 "올해"로 잘못
     쓰고 있지 않은지, "최신 개정"이 실제로는 구 제도인지)
   - **유효기간·만료일 검증**: "~년 말까지", "~년 ~월 시행", "유효기간 N년" 같은 표현이
     {{current_year}}년 기준으로 아직 유효한가, 아니면 이미 만료/연장되었는가?
   - **조문·고시 번호 검증**: 법률 조문 번호, 고시 번호, 별지 서식 번호가
     {{current_year}}년 현행 기준으로 맞는지 — 개정으로 번호가 바뀌었을 수 있음.

### Step 1. 수치 추출
본문에서 다음 유형의 모든 수치를 먼저 추출:
- 금액 (2억원, 5천만원, 66,000,000원)
- 비율 (25%, 50%, 0.25)
- 기간 (3일, 48시간, 45일 내외)
- 요건 수치 (직원 2명, 연구개발비 5천만원 이상)
- 계산식 (2억 × 25% = 5천만원)

### Step 2. Known Facts 대조 (category="숫자팩트", severity="심각")
아래 고정 사실과 본문 수치가 충돌하면 **정확한 값으로 교정 제안**:
{{legal_facts}}
- 충돌 시 suggested_text 에 **정정된 값**을 포함한 완성 문장 (완화 X, 교정)

### Step 3. 내부 일관성 (category="숫자일관", severity="심각")
같은 수치가 본문 여러 곳에 등장할 때 불일치 검출:
- 제목 vs 도입부 vs 본문 vs 요약박스 상호 비교
- 표·카드의 합계가 실제 총합과 일치하는지 (예: 1,600 + 5,000 = 6,600 ✓)
- 퍼센트 합계가 100%인지
- 불일치 시 기준이 되는 하나의 값으로 일괄 정정 제안

### Step 4. 계산 정합성 (category="숫자팩트", severity="심각")
본문 계산식을 직접 풀어서 결과값과 대조:
- "2억 × 0.25 = ?" → 5천만원
- "(2억 × 0.25) + (2억 × 0.5) = ?" → 1.5억
- 불일치 시 올바른 계산 결과로 교정

### Step 5. 표현 완화 (category="숫자완화", severity="주의")
값 자체는 정확하지만 단정 표현인 경우:
- "법인세 2억을 5천만원으로 줄였습니다" → "법인세 절감 사례로 한 기업에서 약 5천만원 수준까지 줄어든 경우가 있습니다 (개별 상황에 따라 다름)"
- suggested_text 에 범위형·경향형 표현 제시

⚠️ category 구분:
- "숫자팩트": 값 자체 오류 (Step 2/4)
- "숫자일관": 위치별 불일치 (Step 3)
- "숫자완화": 값은 맞지만 단정 표현 (Step 5)
⚠️ "(확인 필요)" 표기 절대 금지 — 항상 완성된 대안 문장을 제시할 것.

3. 과도한 단정:
   - 아직 논쟁 중이거나 조건부인 내용을 단정적으로 서술하고 있지 않은가?
   - "~입니다"로 끝나는 서술이 실제 확정된 사실인가?

4. 출처 명확성:
   - 주요 주장에 근거(법률, 기관, 통계)가 제시되어 있는가?
   - "세계 최고", "업계 1위" 같은 표현에 출처가 있는가?

5. 논리 연결:
   - 도입부 → 본론 → 결론의 흐름이 자연스러운가?
   - 갑자기 주제가 전환되거나 비약하는 구간이 있는가?

6. 광고규정 준수:
   - 결과를 단정적으로 표현하는 문장이 있는가? ("법인세를 ~억 줄였습니다" → 전제 조건 필요)
   - 개별 사례를 일반화하여 전달하고 있지 않은가?
   - 구체 수치 제시 시 전제 조건(매출, 업종, 기간 등)이 명시되어 있는가?
   - "반드시", "무조건", "절대", "업계 최고" 같은 절대적 약속 표현이 있는가?
   - 위반 시 severity="심각", category="광고규정"으로 issue 등록하고 suggested_text에 완화된 표현 제시

7. 기관명 현행화:
   - 본문에 '특허청'이 현재 시점으로 사용되고 있는가?
   - 2025년 10월 이후 맥락에서 '특허청'은 '지식재산처'로 수정 제안
   - 과거 맥락("당시 특허청")이나 법령명은 예외
   - severity="주의", category="기관명"

## ⚠️ original_text 작성 규칙 (이것은 매우 중요)
original_text 는 본문 자동 교체에 사용됩니다. 따라서 본문에서 그대로 복사한
정확한 문자열이어야 합니다. 다음 규칙을 반드시 지키세요:

1. **본문에서 한 글자, 공백, 줄바꿈, 마크다운 기호(##, **, >, *, _, ` 등)도
   정확히 그대로 복사**하세요. 한 글자라도 다르면 자동 교체가 실패합니다.
2. 의역, 축약, 다른 표현으로 바꾸지 마세요.
3. 본문에 없는 표현을 만들어내지 마세요.
4. 가능하면 짧게 — 한 문장 단위 (마침표 사이) 또는 한 어절 단위로 자르세요.
   여러 문장을 묶으면 매칭이 자주 실패합니다.
5. 마크다운 본문 (예: "## 절세 효과는 얼마나?") 에서는 "##" 와 공백까지
   포함해서 그대로 복사하거나, 아예 "##" 다음의 텍스트만 정확히 복사하세요.
6. suggested_text 는 original_text 와 같은 단위(같은 문장 / 같은 어절)로
   작성하세요. 너무 긴 새 문단으로 바꾸지 마세요.

위 규칙을 어기면 사용자가 수동으로 본문을 수정해야 해서 매우 불편합니다.

## 응답 형식 (JSON)
{
  "overall_score": 0-100,
  "issues": [
    {
      "category": "법률팩트 | 숫자팩트 | 숫자일관 | 숫자완화 | 단정 | 출처 | 논리 | 광고규정 | 기관명",
      "severity": "심각 | 주의 | 경미",
      "original_text": "본문에서 정확히 그대로 복사한 문자열 (한 글자, 공백, 마크다운 기호 모두 일치)",
      "problem": "무엇이 잘못되었는지 설명",
      "suggestion": "어떻게 수정해야 하는지",
      "suggested_text": "original_text 와 같은 단위의 수정된 문자열"
    }
  ]
}

카테고리: {{category_name}}
핵심 키워드: {{target_keyword}}

--- 초안 ---
{{phase2_output}}
--- 초안 끝 ---
```
<!-- END:PROMPT_CROSS_VALIDATION_SKILL -->

## 5. 교차검증 호출 형식 (clientCrossValidateV2)

- system 메시지(원문): `당신은 JSON 출력 전용 팩트체커입니다. 마크다운/설명/코드펜스 없이 오직 JSON 객체 한 개만 출력합니다.`
- user 메시지: 위 템플릿을 치환한 전체 문자열.
- maxTokens 4096, temperature 0.3. 베이스(초안 생성) LLM 을 **제외한** 등록 LLM 마다 provider 당 1개(기본 모델 우선)로 동시 호출.
- 응답 파싱: `parseCrossValidationJson` → 한국어 severity(심각/주의/경미)를 high/medium/low 로, `problem`→`description`, `suggested_text`→`replacement_text` 로 정규화. verdict 는 점수로 추론(80↑ pass, 60↑ fix_required, 그 외 major_issues). (scripts/parse_result.py --mode cross)

원문 코드:

````ts
export interface CrossValidateV2Params {
  title: string;
  body: string;
  promptTemplate: string; // PROMPT_CROSS_VALIDATION 원문
  legalReferences: string[]; // Phase 1 outline 의 legal_references
  categoryName: string;
  targetKeyword: string;
  providers: CrossValidationProviderConfig[]; // base 제외된 외부 LLM 목록
  onProviderDone?: (result: CrossValidationProviderResult) => void;
}

/**
 * 새 교차검증 — PROMPT_CROSS_VALIDATION 을 사용해 등록된 외부 LLM 전부에
 * 동시 호출. 각 결과를 기존 FactCheckResult 형태로 정규화.
 */
export async function clientCrossValidateV2(
  params: CrossValidateV2Params
): Promise<CrossValidationProviderResult[]> {
  const legalRefBlock =
    params.legalReferences.length > 0
      ? params.legalReferences.map((r) => `- ${r}`).join("\n")
      : "(Phase 1 에서 legal_references 가 추출되지 않음)";

  // Known Facts Table — 본문과 관련된 팩트만 필터링해서 주입 (토큰 절약)
  const relevantFacts = filterRelevantFacts(params.body);
  const legalFactsBlock = formatFactsForPrompt(relevantFacts);

  const userMessage = params.promptTemplate
    .split("{{legal_references}}").join(legalRefBlock)
    .split("{{legal_facts}}").join(legalFactsBlock)
    .split("{{category_name}}").join(params.categoryName || "")
    .split("{{target_keyword}}").join(params.targetKeyword || "")
    .split("{{phase2_output}}").join(params.body);

  const promises = params.providers.map(async (cfg): Promise<CrossValidationProviderResult> => {
    try {
      const raw = await streamLLM({
        messages: [
          {
            role: "system",
            content:
              "당신은 JSON 출력 전용 팩트체커입니다. 마크다운/설명/코드펜스 없이 오직 JSON 객체 한 개만 출력합니다.",
          },
          { role: "user", content: userMessage },
        ],
        model: cfg.model,
        apiKey: cfg.apiKey,
        provider: cfg.provider,
        maxTokens: 4096,
        temperature: 0.3,
      });

      const result = parseCrossValidationJson(raw);
      if (!result) {
        const out: CrossValidationProviderResult = {
          provider: cfg.provider,
          displayName: cfg.displayName,
          success: false,
          error: "응답 JSON 파싱 실패",
        };
        params.onProviderDone?.(out);
        return out;
      }

      const out: CrossValidationProviderResult = {
        provider: cfg.provider,
        displayName: cfg.displayName,
        success: true,
        result,
      };
      params.onProviderDone?.(out);
      return out;
    } catch (err) {
      const out: CrossValidationProviderResult = {
        provider: cfg.provider,
        displayName: cfg.displayName,
        success: false,
        error: err instanceof Error ? err.message : "검증 실패",
      };
      params.onProviderDone?.(out);
      return out;
    }
  });

  return Promise.all(promises);
}

/**
 * 카테고리(promptKey)별 기본 태그 — 본문 키워드만으로는 SEO 기준(8개 이상)에
 * 미달이라, 카테고리 정체성에 맞는 일반 태그로 채워서 항상 10개 이상 보장.
 * 사용자가 본문 편집기에서 태그를 자유롭게 추가/삭제할 수 있도록 너무 길지 않게.
````

## 6. PROMPT_FACT_CHECK 원문

레거시 단일 팩트체크(제목+본문을 user 로, 이 프롬프트를 system 으로). 현재 UI 에서 호출하는 곳은 없다(정의만 존재, `clientFactCheck`/`clientCrossValidate` 미사용). 빠른 1차 점검이 필요할 때 참고용으로 쓴다.

<!-- BEGIN:PROMPT_FACT_CHECK -->
```text
당신은 특허·IP 분야 전문 팩트체커입니다.
아래 블로그 초안을 검토하고, 각 항목을 평가해주세요.

평가 항목:
1. 팩트체크: 다음 요소들이 정확한지 철저히 검증합니다.
   - **법률 조항 번호**(예: 조특법 제10조, 제10조의2): 조문 번호·호·항 번호가 맞는지
   - **시행령·시행규칙 조항 번호**: 법률과 구분하여 시행령/시행규칙 번호가 정확한지
   - **별지 서식 번호**(예: 별지 제○호 서식): 서식 번호는 자주 바뀌므로 가장 엄격하게 검증. 번호가 추정된 것으로 의심되면 "오류"로 판정
   - **세율·공제율·한도 금액** 등 숫자: 최신 개정 기준인지, 단위(원/%)가 정확한지
   - **제도 정식 명칭**: 직무발명보상, 기업부설연구소, 벤처기업인증 등 정식 명칭 사용 여부
   - 잘못된 법조문 인용, 폐지된 제도 언급, 부정확한 수치가 없는지
   - 확신이 없는 번호에 "(확인 필요)" 표기가 누락된 경우도 지적 대상
   - 각 주장에 대해 "정확/확인필요/오류" 판정
2. 논리 흐름: 글의 논리가 자연스럽고 비약이 없는지
3. 독자 적합성: 중소기업 대표가 이해할 수 있는 수준인지, 전문용어가 설명 없이 사용되지 않았는지
4. 톤 일관성: 전체가 1인칭 스토리텔링을 유지하는지, 중간에 논문체로 바뀌지 않는지
5. CTA 적절성: CTA가 글 내용과 자연스럽게 연결되는지

각 지적 사항마다 반드시 original_text(본문에서 문제가 있는 정확한 문장이나 구절을 그대로 복사)와 replacement_text(수정된 문장)를 포함하세요.
original_text는 본문에서 정확히 매칭되어야 자동 교체가 가능합니다. 한 글자도 다르면 안 됩니다.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "overall_score": 0~100,
  "verdict": "pass | fix_required | major_issues",
  "issues": [
    {
      "category": "팩트체크 | 논리 | 톤 | 독자 | CTA",
      "severity": "high | medium | low",
      "location": "문제가 있는 문장 첫 10자",
      "description": "무엇이 문제인지",
      "suggestion": "어떻게 수정해야 하는지",
      "original_text": "본문에서 문제가 있는 정확한 문장이나 구절을 그대로 복사",
      "replacement_text": "수정된 문장 (이것으로 교체하면 됨)"
    }
  ],
  "strengths": ["잘된 점 1", "잘된 점 2"],
  "fact_check_items": [
    {
      "claim": "검증한 주장",
      "verdict": "정확 | 확인필요 | 오류",
      "reason": "판정 이유"
    }
  ]
}
```
<!-- END:PROMPT_FACT_CHECK -->

## 7. PROMPT_FACT_CHECK_QUICK 원문

<!-- BEGIN:PROMPT_FACT_CHECK_QUICK -->
```text
당신은 특허·IP 분야 전문 팩트체커입니다.
아래 블로그 초안의 가장 중요한 3가지만 빠르게 검토합니다 (비용 절감용 1단계 빠른 검증).

평가 항목 (이 3개만):
1. 팩트체크: 법령 조항 번호, 시행령/시행규칙 번호, 별지 서식 번호, 세율·공제율 등
   숫자, 제도 정식 명칭이 정확한지. 추정으로 기재된 번호에 "(확인 필요)" 표기가
   없는 경우도 지적. 각 주장에 "정확/확인필요/오류" 판정.
2. 논리 흐름: 글의 논리가 자연스럽고 비약이 없는지.
3. 톤 일관성: 1인칭 스토리텔링 유지, 중간에 논문체로 바뀌지 않는지.

각 지적 사항마다 반드시 original_text(본문에서 문제가 있는 정확한 문장 그대로 복사)와
replacement_text(수정된 문장)를 포함하세요. 한 글자도 다르면 안 됩니다.

응답은 짧고 명확하게. 사소한 지적은 생략하고 핵심 이슈만. 최대 5건까지만 issues 에 포함.

반드시 아래 JSON 형식으로만 응답하세요 (PROMPT_FACT_CHECK 와 동일 스키마):
{
  "overall_score": 0~100,
  "verdict": "pass | fix_required | major_issues",
  "issues": [
    {
      "category": "팩트체크 | 논리 | 톤",
      "severity": "high | medium | low",
      "location": "문제가 있는 문장 첫 10자",
      "description": "무엇이 문제인지",
      "suggestion": "어떻게 수정해야 하는지",
      "original_text": "본문에서 문제가 있는 정확한 문장",
      "replacement_text": "수정된 문장"
    }
  ],
  "strengths": ["잘된 점 1~2개"],
  "fact_check_items": []
}
```
<!-- END:PROMPT_FACT_CHECK_QUICK -->

## 8. 팩트체크 호출 형식 (clientFactCheck)

- system: PROMPT_FACT_CHECK 또는 _QUICK. user: `제목: {제목}\n\n본문:\n{본문}`. maxTokens 4096, temperature 0.3.
- 파싱 후: issues/strengths/fact_check_items 기본값 `[]`. `original_text` 가 없고 `location` 이 있으면 본문에서 location 을 포함한 첫 줄을 trim 해 original_text 로, `replacement_text` 가 없으면 `suggestion` 을 그대로 쓴다. (scripts/parse_result.py --mode factcheck)

````ts
export interface FactCheckIssue {
  category: string;
  severity: "high" | "medium" | "low";
  location: string;
  description: string;
  suggestion: string;
  original_text?: string;
  replacement_text?: string;
}

export interface FactCheckItem {
  claim: string;
  verdict: "정확" | "확인필요" | "오류";
  reason: string;
}

export interface FactCheckResult {
  overall_score: number;
  verdict: "pass" | "fix_required" | "major_issues";
  issues: FactCheckIssue[];
  strengths: string[];
  fact_check_items: FactCheckItem[];
}

function parseFactCheckJson(text: string): object | null {
  let cleaned = text.trim();

  // 1. ```json ... ``` 블록 추출
  if (cleaned.includes("```")) {
    const match = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (match) cleaned = match[1].trim();
  }

  // 2. JSON 객체 부분만 추출
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // 3. 잘린 JSON 복구 시도
      let partial = jsonMatch[0];
      const lastComplete = Math.max(partial.lastIndexOf("}"), partial.lastIndexOf("]"));
      if (lastComplete > 0) {
        partial = partial.substring(0, lastComplete + 1);
      }
      const openBraces = (partial.match(/\{/g) || []).length;
      const closeBraces = (partial.match(/\}/g) || []).length;
      const openBrackets = (partial.match(/\[/g) || []).length;
      const closeBrackets = (partial.match(/\]/g) || []).length;
      for (let i = 0; i < openBrackets - closeBrackets; i++) partial += "]";
      for (let i = 0; i < openBraces - closeBraces; i++) partial += "}";
      try {
        return JSON.parse(partial);
      } catch {
        // 복구 실패
      }
    }
  }

  // 전체를 시도
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export interface ClientFactCheckParams {
  title: string;
  body: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  provider?: ClientLLMProvider; // 기본 claude
  onProgress?: (text: string) => void;
}

export async function clientFactCheck(
  params: ClientFactCheckParams
): Promise<{ success: boolean; result?: FactCheckResult; error?: string }> {
  try {
    const userMessage = `제목: ${params.title}\n\n본문:\n${params.body}`;

    const fullText = await streamLLM({
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: userMessage },
      ],
      model: params.model,
      apiKey: params.apiKey,
      provider: params.provider ?? "claude",
      maxTokens: 4096,
      temperature: 0.3,
      onProgress: params.onProgress,
    });

    // JSON 파싱 (3단계 + 잘린 JSON 복구)
    const parsed = parseFactCheckJson(fullText);
    if (!parsed) {
      return { success: false, error: "팩트체크 결과를 파싱할 수 없습니다. 수동으로 검토해주세요." };
    }

    // original_text/replacement_text 폴백 생성
    const result = parsed as FactCheckResult;
    result.issues = result.issues ?? [];
    result.strengths = result.strengths ?? [];
    result.fact_check_items = result.fact_check_items ?? [];
    if (result.issues.length > 0) {
      const bodyLines = params.body.split("\n");
      for (const issue of result.issues) {
        if (!issue.original_text && issue.location) {
          const matchLine = bodyLines.find((line) => line.includes(issue.location));
          if (matchLine) {
            issue.original_text = matchLine.trim();
          }
        }
        if (!issue.replacement_text && issue.suggestion) {
          issue.replacement_text = issue.suggestion;
        }
      }
    }

    return { success: true, result };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "팩트체크 실패" };
  }
}

// ── 교차검증 (Cross-Validation) ──
````

## 9. 문단 재작성 프롬프트 (clientRewriteParagraph)

`needsParagraphRewrite` 가 true 인 이슈의 [반영 + 다듬기] 경로. 원본은 교차검증 LLM 이 아니라 **베이스(초안 생성) LLM** 에게 보낸다. `${...}` 자리에 넣는 값: `categoryTone` = CATEGORY_TONE_RULES[promptKey](didim-blog-core/writer 참조), `originalParagraph` = `findParagraphContaining` 결과 문단, `originalText`/`suggestedText`/`problem` = 이슈의 original_text / (replacement_text ?? suggestion ?? "") / (description ?? "").

````ts
/**
 * Phase 2 ↔ Phase 3 사이 — 교차검증 이슈 [반영 + 다듬기] 전용.
 *
 * 교차검증에서 severity 가 심각/주의 이거나 category 가 논리/단정/출처 인 경우,
 * original_text → suggested_text 단순 치환은 앞뒤 문맥이 어색해진다. 이럴 때
 * 해당 문단 전체를 베이스 LLM 에게 보내서 "수정 사항을 반영하고 문단 전체를
 * 자연스럽게 다듬어라" 라고 요청.
 *
 * 입력:
 *   - categoryTone: CATEGORY_TONE_RULES[promptKey] (1인칭/구어체 등)
 *   - originalParagraph: 본문에서 original_text 를 포함하는 문단 전체
 *   - originalText / suggestedText / problem: 교차검증 issue 3개 필드
 *
 * 출력: 다듬어진 문단 전체 (이 문단으로 본문의 originalParagraph 를 교체)
 */
export async function clientRewriteParagraph(params: {
  llm: ClientPhaseLLMConfig;
  categoryTone: string;
  originalParagraph: string;
  originalText: string;
  suggestedText: string;
  problem: string;
}): Promise<{ success: boolean; rewrittenParagraph?: string; error?: string }> {
  const userMessage = `아래 블로그 본문의 특정 문단에서 수정이 발생했습니다.
수정된 문장이 앞뒤 문맥과 자연스럽게 이어지도록 해당 문단 전체를 다듬어주세요.

규칙:
- 수정된 내용(suggested_text)의 의미는 반드시 유지
- 해당 문단의 다른 문장들도 수정 내용에 맞게 자연스럽게 조정
- 글의 전체 톤(1인칭, 구어체)을 유지
- 문단 외의 다른 부분은 절대 건드리지 마세요
- 문단 길이는 원본과 비슷하게 유지 (과도하게 늘리거나 줄이지 말 것)

카테고리 톤:
${params.categoryTone}

--- 수정 전 문단 ---
${params.originalParagraph}

--- 수정 사항 ---
원문: ${params.originalText}
수정: ${params.suggestedText}
수정 이유: ${params.problem}

--- 출력 ---
다듬어진 문단 전체를 출력하세요. 문단만 출력, 다른 텍스트(설명/코드펜스/헤더) 없이.`;

  try {
    const body = await streamLLM({
      messages: [
        {
          role: "system",
          content:
            "당신은 한국어 블로그 편집자입니다. 사용자가 제공한 문단을 지시에 따라 정확히 다듬어 출력합니다. 문단 외 설명/코드펜스/헤더 절대 출력 금지.",
        },
        { role: "user", content: userMessage },
      ],
      model: params.llm.model,
      apiKey: params.llm.apiKey,
      provider: params.llm.provider,
      // 한 문단은 보통 300~800자. 안전 마진 포함 1500.
      maxTokens: 1500,
      temperature: 0.5,
    });

    let cleaned = body.trim();
    const fence = cleaned.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
    if (fence) cleaned = fence[1].trim();
    if (!cleaned) {
      return { success: false, error: "재작성 결과가 비어있습니다." };
    }
    return { success: true, rewrittenParagraph: cleaned };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "문단 재작성 실패" };
  }
}
````

## 10. 피드백 일괄 재작성 (clientRewriteWithFeedback, 레거시)

선택한 지적 사항 여러 개를 본문 전체 재작성으로 반영하는 이전 방식. 현재 패널은 사용하지 않는다(정의만 존재). 참고용.

````ts
// ── 피드백 반영 재작성 ──

export interface SelectedIssue {
  category: string;
  description: string;
  suggestion: string;
  original_text?: string;
  replacement_text?: string;
  provider: string; // 어느 LLM이 지적했는지
}

/**
 * 사용자가 선택한 교차검증 이슈들을 반영하여 본문을 재작성
 * 원본 LLM(=초안 생성 LLM)을 사용
 */
export async function clientRewriteWithFeedback(params: {
  title: string;
  body: string;
  selectedIssues: SelectedIssue[];
  model: string;
  apiKey: string;
  provider: ClientLLMProvider;
  onProgress?: (text: string) => void;
}): Promise<{ success: boolean; rewrittenBody?: string; error?: string }> {
  try {
    if (params.selectedIssues.length === 0) {
      return { success: false, error: "반영할 항목이 선택되지 않았습니다." };
    }

    const feedbackBlock = params.selectedIssues
      .map((it, i) => {
        const lines = [
          `${i + 1}. [${it.category}] (${it.provider})`,
          `   - 지적: ${it.description}`,
          `   - 제안: ${it.suggestion}`,
        ];
        if (it.original_text) lines.push(`   - 원문: "${it.original_text}"`);
        if (it.replacement_text) lines.push(`   - 수정안: "${it.replacement_text}"`);
        return lines.join("\n");
      })
      .join("\n\n");

    const systemPrompt = `당신은 한국어 블로그 글 편집 전문가입니다.
사용자가 제공한 원본 본문을, 아래 지적 사항들을 모두 반영하여 다시 작성합니다.

작성 지침:
- 원본의 카테고리·톤·구조·이미지 마커([IMAGE: ...])·CTA·태그를 그대로 유지하세요.
- 지적 사항만 정확히 반영하고, 그 외 부분은 가능한 한 원문 그대로 두세요.
- 마크다운 형식, 줄바꿈, 단락 구분을 원본과 동일하게 유지하세요.
- 응답에는 어떠한 설명·서문·코드펜스도 붙이지 말고, 오직 수정된 전체 본문만 출력하세요.`;

    const userPrompt = `[원본 제목]
${params.title}

[원본 본문]
${params.body}

[반영해야 할 지적 사항]
${feedbackBlock}

위 지적 사항을 모두 반영한 새 본문을 출력해주세요. 본문 외 다른 텍스트는 출력하지 마세요.`;

    const rewritten = await streamLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: params.model,
      apiKey: params.apiKey,
      provider: params.provider,
      maxTokens: 8000,
      temperature: 0.5,
      onProgress: params.onProgress,
    });

    // 코드펜스가 섞여 들어오면 제거
    let cleaned = rewritten.trim();
    const fenceMatch = cleaned.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();

    if (!cleaned) {
      return { success: false, error: "재작성 결과가 비어있습니다." };
    }

    return { success: true, rewrittenBody: cleaned };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "재작성 실패" };
  }
}

// ─────────────────────────────────────────────────────────────
// 3-Phase 파이프라인 — Phase 1 (구조) / Phase 2 (본문) / Phase 3 (SEO)
// ─────────────────────────────────────────────────────────────

/**
 * 코드펜스 / 앞뒤 텍스트 / 부분 잘림에 모두 견디는 JSON 추출 파서.
````
