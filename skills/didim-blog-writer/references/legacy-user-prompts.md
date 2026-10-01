# USER_PROMPTS 원문 + LEGACY 단일 프롬프트 실행 규칙

LEGACY 경로(현재 미사용)의 user 메시지 템플릿 4종과, 그 경로의 변수·후처리 규칙. `${ALT_TEXT_RULES}`는 6절 상수를 그 자리에 넣는다.

## 목차
1. placeholder 표
2. USER_PROMPTS.PROMPT_FIELD
3. USER_PROMPTS.PROMPT_LOUNGE_GENERAL
4. USER_PROMPTS.PROMPT_LOUNGE_BITE
5. USER_PROMPTS.PROMPT_DIARY
6. ALT_TEXT_RULES
7. LEGACY 실행 코드 (메시지 조립 · 제목/태그/ALT/마커 추출)
8. 재생성(regenerateDraft) 시 additional_context 구성

## 1. placeholder 표

| placeholder | 넣는 값 (generation-runner.ts:187-195) | 있는 템플릿 |
|---|---|---|
| `{{topic}}` | 생성 레코드 topic | 4종 모두 |
| `{{keyword}}` | target_keyword (없으면 "") | DIARY 제외 |
| `{{target_audience}}` | 항상 "" | FIELD |
| `{{additional_context}}` | additional_context (사용자 입력 그대로) | 4종 모두 |
| `{{cta_text}}` | PROMPT_FIELD면 `getFieldCta(categoryId).cta`, 아니면 "" | FIELD |
| `{{email_subject}}` | PROMPT_FIELD면 `getFieldCta(categoryId).emailSubject`, 아니면 "" | FIELD |
| `{{subcategory}}` | 항상 "" | (어느 템플릿에도 없음) |

## 2. USER_PROMPTS.PROMPT_FIELD
````text
다음 주제로 블로그 글을 작성하세요.

주제: {{topic}}
핵심 키워드: {{keyword}}
타깃 고객: {{target_audience}}
참고 사항: {{additional_context}}

아래 출력 형식을 정확히 따르세요. 섹션을 건너뛰지 마세요.

━━━━━━━━━━ 출력 형식 ━━━━━━━━━━

[제목 — 반드시 25~30자. 숫자 1개 이상. 키워드를 앞 15자 안에 배치]

태그: #태그1 #태그2 ... #태그10
(핵심3 + 연관3 + 브랜드2(특허그룹디딤, 디딤변리사) + 롱테일2. 띄어쓰기 없이.)

[도입부 — 훅 패턴 A~F 중 선택. 결과/숫자로 시작. 3~5줄.]
[두 번째 문장: "어떻게 가능했을까요?" 식의 연결]
[독자 특정 1문장: "매출 ○○억 ○○업 대표님에게 특히 도움이 되는 내용입니다."]

━━ 📷 이미지 1 ━━
[IMAGE: 한국어 설명 | 유형(A~H) |
(1) 한국어: 삽입 위치 안내 + 임팩트 헤드라인(24pt 볼드, 데이터가 아닌 메시지) + 감정 톤(성취감/위기감/자신감/긴급함) + 레이아웃 + 데이터(본문 추출 숫자) + 강조점(색상 hex) + 출처
(2) English: Create a Korean infographic [type]. Impact headline (top, 24pt bold): "...". [Layout details]. [Data values]. ALL text in image must be Korean. No English text anywhere. Clean modern flat design, white background, 16:9.]
━━━━━━━━━━━━━━

[소제목1 — 호기심 유발형]
[본문 2~3문단. 키워드 자연 배치. 신뢰 장치 1회.]

━━ 📷 이미지 2 ━━
[IMAGE: 한국어 설명 | 유형(A~H) |
(1) 한국어: 삽입 위치 + 임팩트 헤드라인 + 감정 톤 + 레이아웃 + 데이터 + 강조점 + 출처
(2) English: Create a Korean infographic [type]. Impact headline: "...". [Details]. ALL text in image must be Korean. No English text anywhere. Clean modern flat design, white background, 16:9.]
━━━━━━━━━━━━━━

[소제목2]
[본문 2~3문단]

━━ 📷 이미지 3 ━━
[IMAGE: 한국어 설명 | 유형(A~H) |
(1) 한국어: 삽입 위치 + 임팩트 헤드라인 + 감정 톤 + 레이아웃 + 데이터 + 강조점 + 출처
(2) English: Create a Korean infographic [type]. Impact headline: "...". [Details]. ALL text in image must be Korean. No English text anywhere. Clean modern flat design, white background, 16:9.]
━━━━━━━━━━━━━━

📌 바쁜 대표님을 위한 3줄 요약
1. [핵심1]
2. [핵심2]
3. [핵심3]

━━━━━━━━━━━━━━━━━━
{{cta_text}}

특허그룹 디딤 | 기업을 아는 변리사
📞 02-571-6613
📧 admin@didimip.com (메일 제목에 '{{email_subject}}' 기재)

━━━━━━━━━━ /출력 형식 ━━━━━━━━━━

■ 필수 체크:
- 제목 25~30자인가? (30자 초과 시 반드시 잘라내세요)
- 본문에 "{{keyword}}" 키워드가 3~5회 등장하는가?
- 볼드(**) 5개 이하인가?
- 인용(>) 1개 이상 있는가?
- 마크다운 표(| |) 없는가?

[BODY_HASHTAGS]
본문 말미(CTA/서명 블록 아래)에 삽입할 해시태그 약 20개.
띄어쓰기로 구분. 예: #직무발명보상금절세 #법인세줄이는방법 #중소기업세액공제 ...
핵심 키워드, 연관 키워드, 롱테일 키워드, 브랜드 태그를 폭넓게 포함.
[/BODY_HASHTAGS]

[NAVER_TAGS]
네이버 블로그 "태그" 입력 필드용. 반드시 총 100자 미만.
가장 검색량이 높은 핵심 태그만 선별. 띄어쓰기 없이 붙여쓰기.
브랜드 태그(특허그룹디딤, 디딤변리사) 반드시 포함.
예: 직무발명보상금절세, 법인세절감, 특허그룹디딤, 디딤변리사, 중소기업절세
[/NAVER_TAGS]

${ALT_TEXT_RULES}
````
<sub>원본: src/lib/constants/prompts.ts:1234-1312 (런타임 문자열, `${...}` 는 TS 보간 — 해당 상수 전체를 그 자리에 삽입)</sub>

## 3. USER_PROMPTS.PROMPT_LOUNGE_GENERAL
````text
다음 주제로 IP 라운지 칼럼을 작성하세요.

주제: {{topic}}
핵심 키워드: {{keyword}}
참고 사항: {{additional_context}}

아래 출력 형식을 정확히 따르세요. 섹션을 건너뛰지 마세요.

━━━━━━━━━━ 출력 형식 ━━━━━━━━━━

[제목 — 반드시 25~30자. 숫자 1개 이상. 키워드를 앞 15자 안에 배치]

태그: #태그1 #태그2 ... #태그10
(핵심3 + 연관3 + 브랜드2(특허그룹디딤, 디딤변리사) + 롱테일2. 띄어쓰기 없이.)

[도입부 — 훅 패턴 A~F 중 선택. 이슈/트렌드로 시작. 3~5줄.]
[독자 특정 1문장]

━━ 📷 이미지 1 ━━
[IMAGE: 한국어 설명 | 유형(A~H) |
(1) 한국어: 삽입 위치 + 임팩트 헤드라인(24pt 볼드, 데이터가 아닌 메시지) + 감정 톤 + 레이아웃 + 데이터(본문 추출 숫자) + 강조점(색상 hex) + 출처
(2) English: Create a Korean infographic [type]. Impact headline (top, 24pt bold): "...". [Layout]. [Data]. ALL text in image must be Korean. No English text anywhere. Clean modern flat design, white background, 16:9.]
━━━━━━━━━━━━━━

[소제목1 — 호기심 유발형]
[본문 2~3문단]

━━ 📷 이미지 2 ━━
[IMAGE: 한국어 설명 | 유형(A~H) |
(1) 한국어: 삽입 위치 + 임팩트 헤드라인 + 감정 톤 + 레이아웃 + 데이터 + 강조점 + 출처
(2) English: Create a Korean infographic [type]. Impact headline: "...". [Details]. ALL text in image must be Korean. No English text anywhere. Clean modern flat design, white background, 16:9.]
━━━━━━━━━━━━━━

[소제목2]
[본문 2~3문단]

━━ 📷 이미지 3 ━━
[IMAGE: 한국어 설명 | 유형(A~H) |
(1) 한국어: 삽입 위치 + 임팩트 헤드라인 + 감정 톤 + 레이아웃 + 데이터 + 강조점 + 출처
(2) English: Create a Korean infographic [type]. Impact headline: "...". [Details]. ALL text in image must be Korean. No English text anywhere. Clean modern flat design, white background, 16:9.]
━━━━━━━━━━━━━━

📌 바쁜 대표님을 위한 3줄 요약
1. [핵심1]
2. [핵심2]
3. [핵심3]

━━━━━━━━━━━━━━━━━━
이웃 추가 해두시면 매주 대표님의 IP 리스크를 줄여주는 실전 칼럼을 받아보실 수 있습니다.

특허그룹 디딤 | 기업을 아는 변리사
📞 02-571-6613
📧 admin@didimip.com

━━━━━━━━━━ /출력 형식 ━━━━━━━━━━

■ 필수 체크:
- 제목 25~30자인가?
- 본문에 "{{keyword}}" 키워드가 3~5회 등장하는가?
- 볼드(**) 5개 이하인가?
- 마크다운 표(| |) 없는가?

[BODY_HASHTAGS]
본문 말미(CTA/서명 블록 아래)에 삽입할 해시태그 약 20개.
띄어쓰기로 구분. 예: #직무발명보상금절세 #법인세줄이는방법 #중소기업세액공제 ...
핵심 키워드, 연관 키워드, 롱테일 키워드, 브랜드 태그를 폭넓게 포함.
[/BODY_HASHTAGS]

[NAVER_TAGS]
네이버 블로그 "태그" 입력 필드용. 반드시 총 100자 미만.
가장 검색량이 높은 핵심 태그만 선별. 띄어쓰기 없이 붙여쓰기.
브랜드 태그(특허그룹디딤, 디딤변리사) 반드시 포함.
예: 직무발명보상금절세, 법인세절감, 특허그룹디딤, 디딤변리사, 중소기업절세
[/NAVER_TAGS]

${ALT_TEXT_RULES}
````
<sub>원본: src/lib/constants/prompts.ts:1314-1389 (런타임 문자열, `${...}` 는 TS 보간 — 해당 상수 전체를 그 자리에 삽입)</sub>

## 4. USER_PROMPTS.PROMPT_LOUNGE_BITE
````text
다음 주제로 IP 뉴스 한 입 글을 작성하세요.

주제: {{topic}}
핵심 키워드: {{keyword}}
참고 사항: {{additional_context}}

아래 출력 형식을 정확히 따르세요. 1,200자 이내.

━━━━━━━━━━ 출력 형식 ━━━━━━━━━━

[제목 — 25~30자. 숫자 포함.]

태그: #태그1 ... #태그10

[이슈 소개 — 무슨 일이 있었는지. 300~400자]

━━ 📷 이미지 1 ━━
[IMAGE: 한국어 설명 | 유형(A~H) |
(1) 한국어: 삽입 위치 + 임팩트 헤드라인(24pt 볼드, 데이터가 아닌 메시지) + 감정 톤 + 레이아웃 + 데이터 + 강조점(색상 hex) + 출처
(2) English: Create a Korean infographic [type]. Impact headline (top, 24pt bold): "...". [Layout]. [Data]. ALL text in image must be Korean. No English text anywhere. Clean modern flat design, white background, 16:9.]
━━━━━━━━━━━━━━

[시사점 — 대표님에게 의미하는 바 + 한 줄 결론. 500~800자]

━━━━━━━━━━━━━━━━━━
이웃 추가 해두시면 매주 실전 IP 정보를 받아보실 수 있습니다.
📧 admin@didimip.com

━━━━━━━━━━ /출력 형식 ━━━━━━━━━━

[BODY_HASHTAGS]
본문 말미(CTA/서명 블록 아래)에 삽입할 해시태그 약 20개.
띄어쓰기로 구분. 예: #직무발명보상금절세 #법인세줄이는방법 #중소기업세액공제 ...
핵심 키워드, 연관 키워드, 롱테일 키워드, 브랜드 태그를 폭넓게 포함.
[/BODY_HASHTAGS]

[NAVER_TAGS]
네이버 블로그 "태그" 입력 필드용. 반드시 총 100자 미만.
가장 검색량이 높은 핵심 태그만 선별. 띄어쓰기 없이 붙여쓰기.
브랜드 태그(특허그룹디딤, 디딤변리사) 반드시 포함.
예: 직무발명보상금절세, 법인세절감, 특허그룹디딤, 디딤변리사, 중소기업절세
[/NAVER_TAGS]

${ALT_TEXT_RULES}
````
<sub>원본: src/lib/constants/prompts.ts:1391-1434 (런타임 문자열, `${...}` 는 TS 보간 — 해당 상수 전체를 그 자리에 삽입)</sub>

## 5. USER_PROMPTS.PROMPT_DIARY
````text
다음 주제로 디딤 다이어리 글을 작성하세요.

주제: {{topic}}
참고 사항: {{additional_context}}

아래 출력 형식을 따르세요. CTA/서명/연락처 절대 금지.

━━━━━━━━━━ 출력 형식 ━━━━━━━━━━

[제목 — 자유롭게. 숫자 없어도 됨.]

태그: #태그1 ... #태그10

[오늘 있었던 일 — 1인칭, 감정+생각 포함. 자유 에세이.]

[IMAGE: 분위기 묘사 — 사무실/미팅/출장 등 자연스러운 장면. 1~2개만.]

[느낀 점/배운 점]

[독자에게 한마디]

━━━━━━━━━━ /출력 형식 ━━━━━━━━━━

[BODY_HASHTAGS]
본문 말미에 삽입할 해시태그 약 20개.
띄어쓰기로 구분. 브랜드 태그 포함.
[/BODY_HASHTAGS]

[NAVER_TAGS]
네이버 블로그 "태그" 입력 필드용. 총 100자 미만.
브랜드 태그(특허그룹디딤, 디딤변리사) 포함.
[/NAVER_TAGS]
````
<sub>원본: src/lib/constants/prompts.ts:1436-1467 (런타임 문자열, `${...}` 는 TS 보간 — 해당 상수 전체를 그 자리에 삽입)</sub>

## 6. ALT_TEXT_RULES
````text

ALT 텍스트 작성 규칙

형식: "[핵심 키워드] + 이미지 내용 설명" (20~40자)
예시: "직무발명보상 절세 효과 Before After 비교 인포그래픽"
핵심 키워드를 ALT 텍스트 앞부분에 배치
3개 ALT 텍스트 생성 (본문 이미지 3~5개 중 핵심 3개)
동일 키워드 ALT 3회 반복 금지 — 변형 표현 사용

````
<sub>원본: src/lib/constants/prompts.ts:475-483 (런타임 문자열, `${...}` 는 TS 보간 — 해당 상수 전체를 그 자리에 삽입)</sub>

## 7. LEGACY 실행 코드

DB `prompt_templates`(template_type `draft_generation`)가 있으면 상수 대신 그것을 쓴다(정확 카테고리 → 상위 카테고리 → category_id NULL 순, `version` 내림차순). 마이그레이션 002가 CAT-A-01/02/03, CAT-B-03 등의 템플릿을 시드한다. 스킬 환경에는 DB가 없으므로 상수만 쓴다.

````ts
// src/lib/generation-runner.ts:166-275
    const apiKey = await decryptApiKey(llmConfig.api_key_encrypted);

    // 프롬프트 키 결정
    const effectiveCategoryId = gen.category_id || "";
    const promptKey = getPromptKey(effectiveCategoryId);

    // DB 프롬프트 템플릿 조회
    const template = effectiveCategoryId
      ? await getPromptTemplate(supabase, effectiveCategoryId, "draft_generation")
      : null;

    // 컨텍스트: 사용자 입력만 사용 (외부 API 호출 제거로 시간 단축)
    const enrichedContext = gen.additional_context || "";

    // 메시지 구성
    const messages: LLMMessage[] = [];

    const fieldCta = promptKey === "PROMPT_FIELD"
      ? getFieldCta(effectiveCategoryId)
      : { cta: "", emailSubject: "" };

    const templateVariables: Record<string, string> = {
      topic: gen.topic,
      keyword: gen.target_keyword || "",
      target_audience: "",
      additional_context: enrichedContext,
      subcategory: "",
      cta_text: fieldCta.cta,
      email_subject: fieldCta.emailSubject,
    };

    if (template) {
      messages.push({ role: "system", content: template.system_prompt });
      messages.push({
        role: "user",
        content: replaceTemplateVariables(template.user_prompt_template, templateVariables),
      });
    } else {
      messages.push({
        role: "system",
        content: replaceTemplateVariables(SYSTEM_PROMPTS[promptKey], templateVariables),
      });
      messages.push({
        role: "user",
        content: replaceTemplateVariables(USER_PROMPTS[promptKey], templateVariables),
      });
    }

    const streamConfig: LLMStreamConfig = {
      provider: llmConfig.provider as LLMProvider,
      model: llmConfig.model_id,
      apiKey,
      maxTokens: 3000,
      temperature: 0.5,
    };

    // 스트리밍으로 생성
    let fullText = "";
    for await (const chunk of generateStream(streamConfig, messages)) {
      fullText += chunk;
    }

    const generationTimeMs = Date.now() - startTime;

    // 제목 추출
    const lines = fullText.split("\n").filter((l) => l.trim());
    let title = lines[0]?.replace(/^#+\s*/, "").trim() || gen.topic;
    if (title.length > 50) title = title.substring(0, 50);

    // 태그 추출 (이미지 마커 내부 텍스트 제외)
    let tags: string[] | null = null;
    const tagsMatch = fullText.match(/\[TAGS\]\s*([\s\S]*?)\s*\[\/TAGS\]/);
    if (tagsMatch) {
      tags = tagsMatch[1]
        .split(/[,\n]/)
        .map((t) => t.replace(/^\d+\.\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 10);
    } else {
      const textForTags = fullText.replace(/\[IMAGE:[\s\S]*?\]/g, "");
      const tagMatches = textForTags.match(/#([^\s#]+)/g);
      tags = tagMatches ? tagMatches.map((t) => t.replace("#", "")).slice(0, 10) : null;
    }

    // ALT 텍스트 추출
    let imageAltTexts: string[] | null = null;
    const altMatch = fullText.match(/\[ALT_TEXTS\]\s*([\s\S]*?)\s*\[\/ALT_TEXTS\]/);
    if (altMatch) {
      imageAltTexts = altMatch[1]
        .split("\n")
        .map((line) => line.replace(/^\d+\.\s*/, "").trim())
        .filter(Boolean);
    }

    // 이미지 마커 추출
    const imageMarkerRegex = /\[IMAGE:\s*(.+?)\]/g;
    const imageMarkers: { position: number; description: string }[] = [];
    let match;
    while ((match = imageMarkerRegex.exec(fullText)) !== null) {
      imageMarkers.push({ position: match.index, description: match[1] });
    }

    // 이미지 마커에 ALT 텍스트 매핑
    if (imageAltTexts && imageAltTexts.length > 0) {
      imageMarkers.forEach((marker, i) => {
        if (imageAltTexts[i]) {
          (marker as Record<string, unknown>).alt_text = imageAltTexts[i];
        }
      });
    }
````

참고: 추출 코드는 `[TAGS]…[/TAGS]`, `[ALT_TEXTS]…[/ALT_TEXTS]` 블록을 찾지만 USER_PROMPTS는 `태그:` 줄, `[BODY_HASHTAGS]`, `[NAVER_TAGS]` 블록을 요구한다(형식 불일치 — 확인 필요). `[TAGS]`가 없으면 이미지 마커를 뺀 본문의 `#태그`를 최대 10개 수집한다.

## 8. 재생성 시 additional_context 구성

````ts
// src/actions/ai.ts:1115-1135
    // 재생성은 generateDraft와 동일하지만, 피드백을 추가 컨텍스트로 포함
    const additionalContext = [
      original.additional_context || "",
      input.feedback
        ? `\n\n[이전 초안 피드백]\n${input.feedback}`
        : "",
      original.generated_text
        ? `\n\n[이전 초안 참고]\n${original.generated_text.substring(0, 1000)}`
        : "",
    ]
      .filter(Boolean)
      .join("");

    const result = await generateDraft({
      topic: original.topic,
      categoryId: original.category_id || "",
      keyword: original.target_keyword || "",
      additionalContext,
      contentId: original.content_id || undefined,
    });

````
