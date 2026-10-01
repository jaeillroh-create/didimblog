# 원본 코드 규칙 (레거시, verbatim 보존)

> 이 파일은 백오피스 코드(커밋 `d0ca747`)의 인포그래픽 관련 규칙·프롬프트·로직을 **원문 그대로** 옮긴 것입니다. 요약·수정하지 않았습니다.
> **현재 기준은 `rules-v2.md`입니다.** 이 파일은 v2가 무엇을 바꿨는지 확인하거나, 백오피스와 결과를 대조할 때만 참고합니다. 여기의 "이미지 1~5개", "정확히 N개", "색상 자유 선택", 16:9, 1024×1024, #1A2B4A, "NO text in the image" 등은 v2에서 폐지·변경되었습니다(차이는 `docs/skills-spec/didim-blog-infographic.md` 8절).

## 목차

1. prompts.ts — 시각 자료 규칙 (VISUAL_RULES, FIRST_IMAGE_RULES, VISUAL_RULES_FIELD/LOUNGE/DIARY, ALT_TEXT_RULES)
2. prompts.ts — PHASE25_INFOGRAPHIC_PROMPT
3. prompts.ts — PROMPT_IMAGE_INFOGRAPHIC
4. placeholder 표
5. client-generate.ts — replaceTemplate, clientRunPhase25, parsePhase25Json(JSON 3단계 복구), insertInfographicMarkers
6. actions/image-gen.ts (전체) + lib/llm/providers/image-gen.ts (전체)
7. 호출 위치 — ai-editor-client.tsx Phase 2.5 단계

---

## 1. prompts.ts — 시각 자료 규칙

원본: `src/lib/constants/prompts.ts:314-483`

```ts
// ── 시각 자료 규칙 ──

export const VISUAL_RULES = `
## 시각 자료 규칙 (공통)

당신은 블로그 콘텐츠 인포그래픽 설계 전문가입니다.
본문의 정량 데이터를 기반으로, 이미지 생성 AI에 바로 입력할 수 있는 상세한 인포그래픽 프롬프트를 작성합니다.

### 핵심 원칙
- 이미지 개수는 콘텐츠 유형에 맞게 1~5개. 고정하지 마세요.
- 연속으로 이미지 2개 배치 금지. 반드시 본문 단락 사이에 배치.
- 각 이미지는 본문과 같은 정보를 반복하지 말고, 다른 관점으로 재해석.
- 색상/스타일은 글의 맥락과 감정 톤에 맞게 유연하게 설계 (특정 색상 고정 금지)

### 이미지 마커 형식 — 2개 버전 필수 생성

━━ 📷 이미지 N ━━
[IMAGE: 한국어 설명 | 유형(A~H) | 상세 프롬프트]
━━━━━━━━━━━━━━

(1) 한국어 버전: 삽입 위치 + 차트 설명 (사용자 확인용)
(2) 영문 프롬프트: 이미지 생성 AI 입력용 — "ALL text in image must be Korean. No English text anywhere." 필수 포함

### 이미지 퍼널 역할
- 첫 이미지 (도입부 직후): "이 글을 읽으면 이런 결과를 얻는다" — 기대감+호기심. 감정 톤: 성취감.
- 중간 이미지: 해당 섹션의 핵심 데이터를 다른 관점으로 재해석 — 신뢰 강화. 감정 톤: 위기감 또는 자신감.
- 마지막 이미지 (CTA 직전): 전체 요약 또는 Before/After — 행동 촉구. 감정 톤: 긴급함.

### 인포그래픽 유형 (8가지 — 본문 내용에 따라 선택)
A. 비교 차트: Before/After, A안 vs B안, 적용 전/후 비교
B. 프로세스 플로우: 좌→우 N단계 박스+화살표+산출물
C. 숫자 카드: N×M 그리드 + 아이콘+수치 강조
D. 타임라인 로드맵: 수평 화살표, 기간별 변화·일정
E. 체크리스트: 요건, 조건, 점검 항목 나열
F. 퍼널/파이프라인: 단계별 전환, 흐름
G. 구조도: 제도 구조, 관계도, 블록 다이어그램
H. 수평 막대: 항목별 금액/비율 비교

### 프롬프트 필수 9요소 (한국어·영문 모두 포함)
① 언어: 한국어 버전 — "한국어 인포그래픽" / 영문 버전 — "ALL text in image must be Korean."
② 차트 유형: A~H 중 선택
③ 임팩트 헤드라인: 이미지 최상단 큰 글씨(24pt 볼드). 데이터가 아니라 메시지.
   ❌ "출원 비용 비교표"
   ✅ "150만 원으로 법인세 6천만 원 절감한 방법"
④ 감정 톤: 성취감 / 위기감 / 자신감 / 긴급함 중 선택. 톤에 어울리는 색상을 자유롭게 선택.
⑤ 레이아웃: 구체적 배치 (축, 방향, 칸 수, 그리드 크기)
⑥ 데이터: 본문에서 추출한 구체적 숫자·라벨·연도 (추정치는 (E) 표기)
⑦ 강조점: 핵심 데이터 1~2개만 색상/크기/볼드로 강조. 글의 톤에 맞는 색상을 자유 선택하되 hex 코드 명시.
⑧ 스타일: "Clean modern flat design, white background, high resolution, 16:9"
⑨ 하단 주석: 출처(법률 근거/기관명) + 단위, 기준일, 범례, 참고사항

### 예시 1 — 숫자 카드 (C):

━━ 📷 이미지 1 ━━
[IMAGE: 절세 효과 핵심 요약 | 숫자 카드 (C) |
(1) 한국어: 가로 3칸 카드 배치. 임팩트 헤드라인(최상단 24pt 볼드): "연구소 하나로 법인세 6천만 원 절감". 감정 톤: 성취감. 카드1: 📋 "25%" / "R&D 세액공제율". 카드2: 💰 "6,000만 원" / "연간 절감액" — 이 카드만 강조색 배경. 카드3: 📅 "4주" / "설립 소요 기간". 하단: "기준: 조세특례제한법 제10조 / 중소기업 기준".
(2) English: Create a Korean infographic number card. Impact headline (top, 24pt bold): "연구소 하나로 법인세 6천만 원 절감". 3 horizontal cards. Card1: 📋 "25%" / "R&D 세액공제율". Card2: 💰 "6,000만 원" / "연간 절감액" — highlight this card with accent background. Card3: 📅 "4주" / "설립 소요 기간". ALL text in image must be Korean. No English text anywhere. Clean modern flat design, white background, 16:9.]
━━━━━━━━━━━━━━

### 예시 2 — 비교 차트 (A):

━━ 📷 이미지 2 ━━
[IMAGE: 직무발명보상금 적용 전후 법인세 비교 | 비교 차트 (A) |
(1) 한국어: 좌우 2분할. 임팩트 헤드라인: "같은 매출, 법인세만 75% 줄어든 비결". 감정 톤: 성취감. 왼쪽 "적용 전" 회색 톤: 법인세 2억 원. 오른쪽 "적용 후" 밝은 톤: 법인세 5,000만 원 강조. 중앙 화살표 + "75% 절감". 하단: "매출 80억 제조업 / 조특법 제10조".
(2) English: Create a Korean infographic comparison chart. Split layout. Left "적용 전" gray: 법인세 2억 원. Right "적용 후" bright accent: 법인세 5,000만 원 highlighted. Center arrow "75% 절감". Headline: "같은 매출, 법인세만 75% 줄어든 비결". ALL text in image must be Korean. No English text anywhere. Clean modern flat design, white background, 16:9.]
━━━━━━━━━━━━━━

### 예시 3 — 프로세스 플로우 (B):

━━ 📷 이미지 3 ━━
[IMAGE: 기업부설연구소 설립 3단계 | 프로세스 플로우 (B) |
(1) 한국어: 가로 3단계 화살표. 임팩트 헤드라인: "4주 만에 연구소 설립 완료하는 과정". 감정 톤: 자신감. Step1: "요건 진단" — 연구전담요원 확인, 연구공간 확보. Step2: "서류 준비" — 신청서, 연구시설 현황, 조직도. Step3: "온라인 신청" — KOITA 접수, 심사 4~6주. 마지막 단계만 강조색. 하단: "출처: 한국산업기술진흥협회".
(2) English: Create a Korean infographic process flow. 3 steps left-to-right with arrows. Headline: "4주 만에 연구소 설립 완료하는 과정". Step1: "요건 진단" (clipboard icon). Step2: "서류 준비" (document icon). Step3: "온라인 신청" (target icon) — accent color for this step. ALL text in image must be Korean. No English text anywhere. Clean modern flat design, white background, 16:9.]
━━━━━━━━━━━━━━
`;

// ── 첫 이미지(네이버 썸네일) 전용 규칙 ──
// TODO: 카테고리별 색상은 추후 컨텍스트 적응형(design-tokens 연동)으로 전환 예정

export const FIRST_IMAGE_RULES = `
## 첫 번째 이미지 — 네이버 검색결과 썸네일용 타이포그래피 브랜딩 이미지

⚠️ 이 규칙은 infographics 배열의 첫 번째 항목(index 0)에만 적용됩니다.
나머지 이미지는 기존 인포그래픽 유형(A~H)을 따르세요.

### 유형
type: "T" (타이포그래피 브랜딩)

### 레이아웃
- 비율: 1:1 (1080×1080px) 기본
- 3단 수직 분할:
  · 상단 10~15%: 여백 또는 작은 카테고리 태그
  · 중앙 60~70%: 주제 타이포그래피 (메인)
  · 하단 15~20%: "특허그룹 디딤" 브랜드 라인 (필수 고정)

### 메인 타이포그래피
- 글 제목의 핵심 메시지를 2~3줄로 분할, 한 줄당 6~9자 이내
- 의미 단위로 끊어서 한 줄만 읽어도 맥락 전달
- 메인 글자는 이미지 폭의 80% 이상 차지 (모바일 축소시 가독성)
- 가장 중요한 키워드/숫자 1개는 색상·크기로 강조
- 서브카피(선택): 메인 아래 1줄, 12~18자 이내

줄 나누기 예시:
  · "벤처기업 / 인증 요건 / 자세히 알기"
  · "법인세 2억 → / 5천만원으로 / 줄인 비결"
  · "특허 없는 / IT기업도 / 벤처인증?"

### 색상 테마 (카테고리별)
- 변리사의 현장 수첩: 배경 오렌지(#D4740A) + 텍스트 화이트 + 강조 네이비(#1A2B4A)
- IP 라운지: 배경 네이비(#1A2B4A) + 텍스트 화이트 + 강조 골드(#C28B2E)
- IP 뉴스 한 입: 배경 그레이(#3A3A3A) + 텍스트 화이트 + 강조 레드(#C5302B)
- 규칙: 배경 1색 + 텍스트 1색 + 강조 1색 = 최대 3색

### 브랜드 라인 (필수)
- 위치: 이미지 최하단 15~20% 영역
- 텍스트: 정확히 "특허그룹 디딤"
- 폰트 크기: 메인 타이포의 15~25%
- 스타일: 얇은 구분선 위 가운데 정렬

### 배경
- 단색 또는 은은한 그라데이션 (타이포 가독성 우선)
- 일러스트/사진 사용시 하단·측면에만, 텍스트 영역 침범 금지

### 절대 금지
- 세부 수치 비교표/체크리스트/프로세스 도식 (본문 이미지로 분리)
- "특허그룹 디딤" 외 브랜드명/전화번호/이메일/URL
- 결과 확정적 표현 (변리사 광고 규정 위반)
- 한 줄 10자 이상 긴 문장
`;

const VISUAL_RULES_FIELD = `
${VISUAL_RULES}
현장수첩 추가 시각 규칙

Before/After 비교(A) 필수 1개 이상 — 절세 금액 임팩트 시각화
숫자 카드(C) 권장 — 핵심 절세 금액 강조
프로세스 플로우(B) 권장 — 신청 절차
`;

const VISUAL_RULES_LOUNGE = `
${VISUAL_RULES}
IP 라운지 추가 시각 규칙

구조도(G) 우선 — 제도 구조, IP 생태계
타임라인(D) 활용 — 법 개정 연혁, 트렌드 변화
수평 막대(H) 활용 — 트렌드 데이터, 연도별 비교
`;

const VISUAL_RULES_DIARY = `
다이어리 시각 자료 규칙

인포그래픽 불필요. 분위기 사진 위주
[IMAGE: ] 안에 분위기 묘사로 작성
예시 12가지:
"사무실 창밖 석양", "커피와 노트북", "회의실 화이트보드",
"비 오는 날 카페 창가", "책상 위 특허 서류 더미", "팀 회식 풍경",
"출장길 KTX 차창", "주말 공원 산책", "새벽 사무실 불빛",
"고객사 방문 후 귀갓길", "세미나장 풍경", "연말 정리하는 책상"
1~2장이면 충분. 과도한 이미지 배치 금지
`;

const ALT_TEXT_RULES = `
ALT 텍스트 작성 규칙

형식: "[핵심 키워드] + 이미지 내용 설명" (20~40자)
예시: "직무발명보상 절세 효과 Before After 비교 인포그래픽"
핵심 키워드를 ALT 텍스트 앞부분에 배치
3개 ALT 텍스트 생성 (본문 이미지 3~5개 중 핵심 3개)
동일 키워드 ALT 3회 반복 금지 — 변형 표현 사용
`;
```

## 2. prompts.ts — PHASE25_INFOGRAPHIC_PROMPT

원본: `src/lib/constants/prompts.ts:1020-1116`

```ts
/**
 * Phase 2.5 — 인포그래픽 설계 (본문 완성 후 별도 분석)
 * 입력: phase2_output (본문), category_name, sub_category, target_keyword
 * 출력: JSON (data_analysis + infographics + diversity_check)
 * max_tokens: 3000
 */
export const PHASE25_INFOGRAPHIC_PROMPT = `당신은 블로그 콘텐츠 인포그래픽 설계 전문가입니다.
아래 완성된 블로그 본문을 읽고, 인포그래픽을 설계하세요.

## 설계 원칙

### 1단계: 본문에서 시각화 가능한 데이터 추출
본문을 처음부터 끝까지 읽으면서 다음 유형의 데이터를 모두 찾으세요:
- 비교 데이터: A vs B, 적용 전/후, 두 가지 옵션
- 정량 수치: 금액, 비율, 기간, 건수 (3개 이상 모이면 카드 후보)
- 순서/단계: 절차, 프로세스, 로드맵
- 요건/조건: 자격 요건, 필요 서류, 체크리스트
- 구조/관계: 제도 구조, 법률 체계, 기관 관계
- 순위/비율: 항목별 크기 비교, 점유율
- 시간 흐름: 연도별 변화, 일정, 마일스톤

### 2단계: 데이터 유형에 따라 인포그래픽 유형 매칭
| 추출된 데이터 유형 | 최적 인포그래픽 유형 |
|---|---|
| A vs B 비교 숫자 | A. 비교 차트 |
| 3단계 이상 절차 | B. 프로세스 플로우 |
| 핵심 수치 3~5개 | C. 숫자 카드 |
| 기간/일정/연도별 변화 | D. 타임라인 |
| 요건/조건 목록 5개+ | E. 체크리스트 |
| 단계별 축소/전환 흐름 | F. 퍼널 |
| 제도/법률 구조 | G. 구조도 |
| 항목별 금액/비율 순위 | H. 수평 막대 |

{{first_image_rules}}

### 3단계: 다양성 검증
⚠️ 필수 규칙:
- 인포그래픽은 {{total_image_count}}개만 설계하세요.
- 같은 글에서 동일 유형 2번 사용 금지
- B(프로세스)와 F(퍼널) 동시 사용 금지
- 모두 다른 유형이어야 함
- 데이터가 가장 풍부한 유형을 우선 선택

### 4단계: 삽입 위치 결정
각 인포그래픽의 삽입 위치를 문단 ID(<!-- p:N -->)로 지정.
본문에 문단 ID가 없으면 소제목(##) 기준으로 "## 소제목 뒤" 형식으로 지정.

### 5단계: 상세 프롬프트 작성
각 인포그래픽에 대해 한국어 + 영문 이중 프롬프트 작성.
영문 프롬프트에는 반드시 "ALL text in image must be Korean" 포함.

## 카테고리: {{category_name}}
## 키워드: {{target_keyword}}

--- 본문 ---
{{phase2_output}}
--- 본문 끝 ---

## JSON 안전 규칙
- JSON 문자열 안에 큰따옴표(")를 쓸 때는 반드시 \\"로 이스케이프
- korean_prompt와 english_prompt 값은 줄바꿈 없이 한 줄로 작성
- JSON 외에 설명이나 마크다운을 출력하지 마세요
- \`\`\`json 코드 블록으로 감싸지 마세요

## 응답 형식 (JSON만 출력, 다른 텍스트 없이)
{
  "infographics": [
    {
      "position": "top",
      "type": "T",
      "type_name": "타이포그래피 썸네일",
      "selection_reason": "네이버 검색결과 썸네일용 브랜딩 이미지",
      "korean_prompt": "글 제목을 2~3줄로 분할한 타이포그래피 + 하단 특허그룹 디딤",
      "english_prompt": "Create a Korean typography branding image... ALL text in image must be Korean.",
      "emotion": "자신감",
      "data_source": []
    },
    {
      "position": "p:3",
      "type": "A",
      "type_name": "비교 차트",
      "selection_reason": "본문 데이터 기반 인포그래픽",
      "korean_prompt": "한국어 인포그래픽 상세 설명 (300자 이상)",
      "english_prompt": "Create a Korean infographic... ALL text in image must be Korean.",
      "emotion": "성취감",
      "data_source": ["25%", "6,000만 원"]
    }
  ],
  "diversity_check": {
    "types_used": ["T", "A", "E"],
    "all_different": true,
    "bf_conflict": false
  }
}

⚠️ position 필드: 첫 이미지(T타입)는 "top"으로 고정. 나머지는 <!-- p:N --> 문단 ID 번호.
⚠️ 첫 이미지 규칙(위 "첫 번째 이미지" 섹션)이 있으면 반드시 infographics[0]에 type="T" 배치.`;
```

## 3. prompts.ts — PROMPT_IMAGE_INFOGRAPHIC

원본: `src/lib/constants/prompts.ts:1745-1758`

```ts
// ── 이미지 생성 프롬프트 ──

export const PROMPT_IMAGE_INFOGRAPHIC = `Create a clean, professional infographic illustration for a Korean patent law firm's blog post.

Style requirements:
- Flat design, minimal, professional
- Color palette: warm gold (#C28B2E) as accent, dark navy (#1A1A2E), white background
- NO text in the image (text will be added separately in the blog)
- NO photorealistic elements — illustration/diagram style only
- Suitable for a business/legal blog targeting Korean SME executives
- 1024x1024 pixels

Subject: {{description}}
Context: {{blog_topic}}`;
```

## 4. placeholder 표

| 프롬프트 | placeholder | 넣는 값 (원본 코드 기준) |
|---|---|---|
| PHASE25_INFOGRAPHIC_PROMPT | `{{phase2_output}}` | 문단 ID(`<!-- p:N -->`)가 주입된 Phase 2 본문 (`ai-editor-client.tsx:800-803`에서 `injectParagraphIds` 후 전달) |
| PHASE25_INFOGRAPHIC_PROMPT | `{{category_name}}` | 1차 카테고리명 (`getCategoryName(categoryId)` 결과, 예: "변리사의 현장 수첩", "IP 라운지", "디딤 다이어리") |
| PHASE25_INFOGRAPHIC_PROMPT | `{{target_keyword}}` | 핵심 키워드 |
| PHASE25_INFOGRAPHIC_PROMPT | `{{first_image_rules}}` | 다이어리가 아니면 `FIRST_IMAGE_RULES` 전문, 다이어리면 빈 문자열 (`client-generate.ts:858-866`) |
| PHASE25_INFOGRAPHIC_PROMPT | `{{total_image_count}}` | 다이어리가 아니면 "정확히 4", 다이어리면 "정확히 3" (`client-generate.ts:860`) |
| PROMPT_IMAGE_INFOGRAPHIC | `{{description}}` | 이미지 마커에서 추출한 설명 (`actions/image-gen.ts:72-76`) |
| PROMPT_IMAGE_INFOGRAPHIC | `{{blog_topic}}` | 글 주제 |
| PHASE2_PROMPT (참고) | `{{visual_rules}}` | VISUAL_RULES 또는 VISUAL_RULES_FIELD/_LOUNGE/_DIARY (`prompts.ts:973` 주석). 본문 작성 단계에서 이미지 마커 규칙으로 쓰임 |

치환은 `replaceTemplate` (`client-generate.ts:595-601`)로, 같은 placeholder가 여러 번 나와도 모두 치환합니다. `actions/image-gen.ts`의 `buildImagePrompt`는 `String.replace`라 첫 번째 것만 치환합니다.

## 5. client-generate.ts

원본: `src/lib/client-generate.ts:595-601` (replaceTemplate)

```ts
function replaceTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}
```

원본: `src/lib/client-generate.ts:823-1086` (InfographicDesign, Phase25Result, clientRunPhase25, parsePhase25Json, insertInfographicMarkers)

```ts
// ── Phase 2.5 인포그래픽 설계 결과 타입 ──

export interface InfographicDesign {
  position: string;
  type: string;
  type_name: string;
  selection_reason: string;
  korean_prompt: string;
  english_prompt: string;
  emotion: string;
  data_source: string[];
}

export interface Phase25Result {
  success: boolean;
  infographics?: InfographicDesign[];
  error?: string;
}

/**
 * Phase 2.5 — 인포그래픽 설계 (본문 완성 후 별도 LLM 호출).
 * 완성된 본문 전체를 분석해서 데이터 기반 인포그래픽을 설계.
 */
export async function clientRunPhase25(params: {
  llm: ClientPhaseLLMConfig;
  phase25Prompt: string;
  phase2Body: string;
  categoryName: string;
  targetKeyword: string;
  /** 첫 이미지 타이포 규칙 (디딤 다이어리는 빈 문자열) */
  firstImageRules?: string;
  onProgress?: (text: string) => void;
}): Promise<Phase25Result> {
  // 디딤 다이어리는 첫 이미지 T타입 제외 → 인포그래픽 3개만
  const isDiary = params.categoryName.includes("다이어리");
  const hasFirstImageRule = !isDiary && (params.firstImageRules ?? "").length > 0;
  const totalCount = hasFirstImageRule ? "정확히 4" : "정확히 3";

  const userMessage = replaceTemplate(params.phase25Prompt, {
    phase2_output: params.phase2Body,
    category_name: params.categoryName,
    target_keyword: params.targetKeyword,
    first_image_rules: hasFirstImageRule ? params.firstImageRules! : "",
    total_image_count: totalCount,
  });

  let body = "";
  try {
    body = await streamLLM({
      ...params.llm,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 6000,
      temperature: 0.5,
      onProgress: (text) => {
        params.onProgress?.(text);
      },
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Phase 2.5 스트리밍 실패" };
  }

  // JSON 파싱 (3단계 복구)
  console.log("[clientRunPhase25] LLM 응답 길이:", body.length, "자");
  const parsed = parsePhase25Json(body);
  if (!parsed) {
    return { success: false, error: `Phase 2.5 JSON 파싱 완전 실패 (${body.length}자)` };
  }
  const infographics = parsed.infographics as InfographicDesign[] | undefined;
  console.log("[clientRunPhase25] 파싱 성공, infographics:", infographics?.length ?? "없음");
  if (!infographics || !Array.isArray(infographics) || infographics.length === 0) {
    console.error("[clientRunPhase25] infographics 비어있음. keys:", Object.keys(parsed));
    return { success: false, error: "인포그래픽 설계 결과가 비어있습니다" };
  }

  return { success: true, infographics };
}

/**
 * Phase 2.5 LLM 응답에서 JSON 파싱 — 3단계 복구.
 * LLM 이 max_tokens 에 걸려 JSON 이 잘리거나 따옴표가 깨지는 경우 대비.
 */
function parsePhase25Json(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  // 1차: 그대로 파싱
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.warn("[Phase 2.5] 1차 파싱 실패:", (e as Error).message);
    }
  }

  // 2차: 잘린 JSON 복구 — 마지막 완전한 } 까지 잘라내고 배열/객체 닫기
  try {
    let text = cleaned;
    const firstBrace = text.indexOf("{");
    if (firstBrace === -1) throw new Error("{ 없음");
    text = text.slice(firstBrace);

    // 마지막 완전한 } 찾기
    const lastBrace = text.lastIndexOf("}");
    if (lastBrace > 0) {
      text = text.slice(0, lastBrace + 1);
    }
    // 열린 [ ] 개수 맞추기
    const openBrackets = (text.match(/\[/g) || []).length - (text.match(/\]/g) || []).length;
    for (let i = 0; i < openBrackets; i++) text += "]";
    const openBraces = (text.match(/\{/g) || []).length - (text.match(/\}/g) || []).length;
    for (let i = 0; i < openBraces; i++) text += "}";

    return JSON.parse(text);
  } catch (e) {
    console.warn("[Phase 2.5] 2차 복구 파싱 실패:", (e as Error).message);
  }

  // 3차: 개별 인포그래픽 객체 추출
  try {
    const objectRe = /\{\s*"position"\s*:\s*"[^"]*"[\s\S]*?"type"\s*:\s*"[^"]*"[\s\S]*?"korean_prompt"\s*:\s*"[^"]*"/g;
    const matches = cleaned.match(objectRe);
    if (matches && matches.length > 0) {
      const infographics: InfographicDesign[] = [];
      for (const m of matches) {
        // 이 부분 문자열에서 완전한 {} 추출 시도
        let obj = m;
        const braceStart = obj.indexOf("{");
        obj = obj.slice(braceStart);
        // 닫기
        if (!obj.endsWith("}")) obj += '"}';
        // 필드 채우기
        try {
          const partial = JSON.parse(obj + "}");
          infographics.push({
            position: partial.position ?? "p:3",
            type: partial.type ?? "C",
            type_name: partial.type_name ?? "숫자 카드",
            selection_reason: partial.selection_reason ?? "",
            korean_prompt: partial.korean_prompt ?? "",
            english_prompt: partial.english_prompt ?? "",
            emotion: partial.emotion ?? "",
            data_source: partial.data_source ?? [],
          });
        } catch { /* 건너뜀 */ }
      }
      if (infographics.length > 0) {
        console.log("[Phase 2.5] 3차 개별 추출 성공:", infographics.length, "개");
        return { infographics };
      }
    }
  } catch (e) {
    console.warn("[Phase 2.5] 3차 추출 실패:", (e as Error).message);
  }

  return null;
}

/**
 * Phase 2.5 결과를 본문에 마커로 삽입.
 * position 이 "p:N 뒤" 형태면 해당 문단 뒤에, 아니면 소제목 기준으로 삽입.
 */
export function insertInfographicMarkers(
  body: string,
  infographics: InfographicDesign[]
): string {
  let result = body;

  for (let idx = infographics.length - 1; idx >= 0; idx--) {
    const info = infographics[idx];
    const num = idx + 1;
    // extractImageMarkers regex: /\[IMAGE:\s*([\s\S]*?)\]\s*\n\s*━━/
    // → [IMAGE: 내용 (줄바꿈 포함)] 다음 줄에 ━━ 가 있어야 매칭됨
    const marker = [
      "",
      `━━ 📷 이미지 ${num} ━━`,
      `[IMAGE: ${info.korean_prompt} | ${info.type}(${info.type_name})`,
      `(1) 한국어: ${info.korean_prompt}`,
      `(2) English: ${info.english_prompt}]`,
      `━━━━━━━━━━━━━━`,
      "",
    ].join("\n");

    let inserted = false;

    // 0) T타입(타이포그래피 썸네일) — 본문 최상단에 삽입
    if (info.type === "T" || info.position === "top") {
      // 제목(# ...) 다음 빈 줄 위치에 삽입, 없으면 맨 앞
      const titleEnd = result.match(/^#[^\n]*\n/);
      if (titleEnd && titleEnd.index !== undefined) {
        const insertAt = titleEnd.index + titleEnd[0].length;
        result = result.slice(0, insertAt) + marker + "\n" + result.slice(insertAt);
      } else {
        result = marker + "\n" + result;
      }
      inserted = true;
      console.log(`[insertMarker] #${num} → T타입(썸네일) 본문 최상단 삽입`);
    }

    // 1) p:N 기반 삽입 — "p:3", "p:3 뒤", "p:3 뒤에" 등에서 숫자 추출
    const pMatch = info.position.match(/p:(\d+)/);
    if (pMatch) {
      const pId = parseInt(pMatch[1], 10);
      const pTag = `<!-- p:${pId} -->`;
      const pIdx = result.indexOf(pTag);
      if (pIdx !== -1) {
        // 해당 문단 태그 다음의 다음 빈 줄(\n\n) 또는 다음 문단 ID 찾기
        const afterTag = pIdx + pTag.length;
        const nextP = result.indexOf("\n\n<!-- p:", afterTag);
        const insertAt = nextP !== -1 ? nextP : result.length;
        result = result.slice(0, insertAt) + "\n" + marker + result.slice(insertAt);
        inserted = true;
        console.log(`[insertMarker] #${num} → p:${pId} 뒤 삽입 (위치 ${insertAt})`);
      }
    }

    // 2) ## 소제목 기반 삽입
    if (!inserted) {
      const headingMatch = info.position.match(/##\s*(.+)/);
      if (headingMatch) {
        const heading = headingMatch[1].trim();
        const hIdx = result.indexOf(heading);
        if (hIdx !== -1) {
          const nextBreak = result.indexOf("\n\n", hIdx);
          if (nextBreak !== -1) {
            result = result.slice(0, nextBreak) + "\n" + marker + result.slice(nextBreak);
            inserted = true;
            console.log(`[insertMarker] #${num} → "##${heading}" 뒤 삽입`);
          }
        }
      }
    }

    // 3) position_after_paragraph 숫자 직접 (프롬프트가 숫자만 반환한 경우)
    if (!inserted && /^\d+$/.test(info.position.trim())) {
      const pId = parseInt(info.position.trim(), 10);
      const pTag = `<!-- p:${pId} -->`;
      const pIdx = result.indexOf(pTag);
      if (pIdx !== -1) {
        const afterTag = pIdx + pTag.length;
        const nextP = result.indexOf("\n\n<!-- p:", afterTag);
        const insertAt = nextP !== -1 ? nextP : result.length;
        result = result.slice(0, insertAt) + "\n" + marker + result.slice(insertAt);
        inserted = true;
        console.log(`[insertMarker] #${num} → p:${pId} (숫자) 뒤 삽입`);
      }
    }

    // 4) 폴백: 균등 분배
    if (!inserted) {
      const fraction = (idx + 1) / (infographics.length + 1);
      const approxPos = Math.floor(result.length * fraction);
      const nearBreak = result.indexOf("\n\n", approxPos);
      if (nearBreak !== -1 && nearBreak < result.length - 100) {
        result = result.slice(0, nearBreak) + "\n" + marker + result.slice(nearBreak);
        console.log(`[insertMarker] #${num} → 균등 분배 위치 (${Math.round(fraction * 100)}%)`);
      } else {
        result += "\n" + marker;
        console.log(`[insertMarker] #${num} → 본문 끝 (폴백)`);
      }
    }
  }

  return result;
}
```

## 6. actions/image-gen.ts (전체)

원본: `src/actions/image-gen.ts:1-334`

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateImage } from "@/lib/llm/providers/image-gen";
import { PROMPT_IMAGE_INFOGRAPHIC } from "@/lib/constants/prompts";
import type { LLMConfig } from "@/lib/types/database";

// ── 타입 정의 ──

interface GenerateImageInput {
  description: string;
  blogTopic: string;
  categoryId?: string;
  generationId: number;
  markerIndex: number;
}

interface GenerateImageResult {
  success: boolean;
  imageUrl?: string;
  imageId?: string;
  error?: string;
}

interface GenerateAllImagesInput {
  generationId: number;
  blogTopic: string;
  categoryId?: string;
  markers: { index: number; description: string }[];
}

interface GenerateAllImagesResult {
  success: boolean;
  images: { markerIndex: number; imageUrl?: string; error?: string }[];
}

interface GetGeneratedImagesResult {
  success: boolean;
  images?: Array<{
    marker_index: number;
    public_url: string | null;
    status: string;
    alt_text: string | null;
  }>;
  error?: string;
}

// ── 헬퍼 ──

async function getOpenAIConfig(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<LLMConfig | null> {
  const { data } = await supabase
    .from("llm_configs")
    .select("*")
    .eq("provider", "openai")
    .eq("is_active", true)
    .limit(1)
    .single();
  return data as LLMConfig | null;
}

async function decryptApiKey(encryptedKey: string): Promise<string> {
  try {
    return Buffer.from(encryptedKey, "base64").toString("utf-8");
  } catch {
    return encryptedKey;
  }
}

function buildImagePrompt(description: string, blogTopic: string): string {
  return PROMPT_IMAGE_INFOGRAPHIC
    .replace("{{description}}", description)
    .replace("{{blog_topic}}", blogTopic);
}

/**
 * 문자열에서 unpaired UTF-16 surrogate 를 제거.
 *
 * 배경: ai-editor 의 extractImageMarkers 가 description 을 codeunit 단위로
 * slice 했을 때 surrogate pair 가운데에서 잘려 unpaired surrogate (\uD800-\uDFFF)
 * 가 남는 경우가 있었음. 이 상태로 supabase-js .insert() 에 전달하면
 * JSON.stringify 가 invalid UTF-8 을 만들고 PostgREST 가
 * "PGRST102: Empty or invalid json" 으로 INSERT 를 거부함.
 *
 * 슬라이스 자체는 제거했지만, 다른 경로(예: LLM 출력 자체에 깨진 surrogate)
 * 에서도 동일 증상이 날 수 있으므로 INSERT 직전에 sanitize 안전망을 둔다.
 * 추가로 너무 긴 텍스트는 12,000 character 로 제한 (PG TEXT 컬럼은 무제한이지만
 * 안정적인 fetch body 크기 유지).
 */
function sanitizeForInsert(s: string, maxChars = 12_000): string {
  if (!s) return "";
  // 1) unpaired surrogate 제거
  let cleaned = s.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    ""
  );
  // 2) NULL byte 제거 (Postgres TEXT 컬럼이 거부)
  cleaned = cleaned.replace(/\u0000/g, "");
  // 3) 길이 제한 — character-safe (Array.from 으로 codepoint 단위)
  if (cleaned.length > maxChars) {
    cleaned = Array.from(cleaned).slice(0, maxChars).join("");
  }
  return cleaned;
}

// ── Server Actions ──

export async function checkImageGenAvailable(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const config = await getOpenAIConfig(supabase);
    return !!config?.api_key_encrypted;
  } catch {
    return false;
  }
}

export async function generateInfographic(
  input: GenerateImageInput
): Promise<GenerateImageResult> {
  try {
    const supabase = await createClient();

    const openaiConfig = await getOpenAIConfig(supabase);
    if (!openaiConfig?.api_key_encrypted) {
      return {
        success: false,
        error: "이미지 생성을 위해 설정 > AI 설정에서 OpenAI API를 등록해주세요.",
      };
    }

    const apiKey = await decryptApiKey(openaiConfig.api_key_encrypted);
    const prompt = buildImagePrompt(input.description, input.blogTopic);

    // 사전 검증: ai_generations row 존재 확인 (FK 위반 방지)
    const { data: parentGen, error: parentError } = await supabase
      .from("ai_generations")
      .select("id, status")
      .eq("id", input.generationId)
      .maybeSingle();

    if (parentError) {
      console.error("[generateInfographic] ai_generations 조회 실패:", parentError);
      return {
        success: false,
        error: `상위 생성 레코드 조회 실패: ${parentError.message} (code=${parentError.code})`,
      };
    }
    if (!parentGen) {
      return {
        success: false,
        error: `상위 생성 레코드(id=${input.generationId})를 찾을 수 없습니다. 초안을 먼저 저장한 뒤 이미지를 생성해주세요.`,
      };
    }

    // generated_images 레코드 생성 (generating)
    // RLS(authenticated) 가 끊긴 세션에서 거부할 수 있으므로 service-role 우선
    const dbClient = createAdminClient() ?? supabase;
    const usingServiceRole = dbClient !== supabase;

    // PGRST102 방지: description / prompt 의 unpaired surrogate / NULL byte 제거
    // + character-safe 길이 제한
    const safeDescription = sanitizeForInsert(input.description, 12_000);
    const safePrompt = sanitizeForInsert(prompt, 12_000);

    const { data: imageRecord, error: insertError } = await dbClient
      .from("generated_images")
      .insert({
        generation_id: input.generationId,
        marker_index: input.markerIndex,
        description: safeDescription,
        prompt_used: safePrompt,
        image_provider: "openai",
        image_model: "dall-e-3",
        status: "generating",
      })
      .select("id")
      .single();

    if (insertError || !imageRecord) {
      console.error("[generateInfographic] 이미지 레코드 INSERT 실패:", {
        error: insertError,
        usingServiceRole,
        generationId: input.generationId,
        markerIndex: input.markerIndex,
      });
      const detail = insertError?.message ?? "(no message)";
      const code = insertError?.code ? ` code=${insertError.code}` : "";
      const hint = !usingServiceRole
        ? " — SUPABASE_SERVICE_ROLE_KEY 가 환경변수에 설정되어 있지 않으면 RLS 정책으로 거부되었을 수 있습니다."
        : "";
      return {
        success: false,
        error: `이미지 레코드 저장 실패${code}: ${detail}${hint}`,
      };
    }

    const startTime = Date.now();

    let imageResult;
    try {
      imageResult = await generateImage(apiKey, prompt);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : "이미지 생성 실패";

      // content policy 위반 체크
      const isPolicyViolation =
        errMsg.includes("content_policy") || errMsg.includes("safety");

      await dbClient
        .from("generated_images")
        .update({
          status: "failed",
          error_message: isPolicyViolation
            ? "이미지 생성 정책에 맞지 않는 요청입니다."
            : errMsg,
          generation_time_ms: Date.now() - startTime,
        })
        .eq("id", imageRecord.id);

      return {
        success: false,
        error: isPolicyViolation
          ? "이미지 생성 정책에 맞지 않는 요청입니다. 설명을 수정해주세요."
          : "이미지 생성에 실패했습니다. 다시 시도해주세요.",
      };
    }

    const genTimeMs = Date.now() - startTime;

    // Supabase Storage에 업로드
    const fileName = `gen-${input.generationId}/marker-${input.markerIndex}-${Date.now()}.png`;
    const imageBuffer = Buffer.from(imageResult.url, "base64");

    const { error: uploadError } = await supabase.storage
      .from("blog-images")
      .upload(fileName, imageBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("[generateInfographic] Storage 업로드 실패:", uploadError);
      await dbClient
        .from("generated_images")
        .update({
          status: "failed",
          error_message: `Storage 업로드 실패: ${uploadError.message}`,
          generation_time_ms: genTimeMs,
        })
        .eq("id", imageRecord.id);

      return { success: false, error: `이미지 Storage 업로드 실패: ${uploadError.message}` };
    }

    // Public URL 생성
    const { data: publicUrlData } = supabase.storage
      .from("blog-images")
      .getPublicUrl(fileName);

    const publicUrl = publicUrlData.publicUrl;

    // DB 업데이트 (completed)
    await dbClient
      .from("generated_images")
      .update({
        status: "completed",
        storage_path: fileName,
        public_url: publicUrl,
        generation_time_ms: genTimeMs,
      })
      .eq("id", imageRecord.id);

    return {
      success: true,
      imageUrl: publicUrl,
      imageId: imageRecord.id,
    };
  } catch (error) {
    console.error("인포그래픽 생성 오류:", error);
    return { success: false, error: "이미지 생성 중 오류가 발생했습니다." };
  }
}

export async function generateAllInfographics(
  input: GenerateAllImagesInput
): Promise<GenerateAllImagesResult> {
  const results: GenerateAllImagesResult["images"] = [];

  // 순차 실행 (DALL-E rate limit 방지)
  for (const marker of input.markers) {
    const result = await generateInfographic({
      description: marker.description,
      blogTopic: input.blogTopic,
      categoryId: input.categoryId,
      generationId: input.generationId,
      markerIndex: marker.index,
    });

    results.push({
      markerIndex: marker.index,
      imageUrl: result.imageUrl,
      error: result.error,
    });
  }

  return { success: true, images: results };
}

export async function getGeneratedImages(
  generationId: number
): Promise<GetGeneratedImagesResult> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("generated_images")
      .select("marker_index, public_url, status, alt_text")
      .eq("generation_id", generationId)
      .eq("status", "completed")
      .order("marker_index", { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, images: data || [] };
  } catch (error) {
    console.error("이미지 목록 조회 오류:", error);
    return { success: false, error: "이미지 목록 조회에 실패했습니다." };
  }
}
```

원본: `src/lib/llm/providers/image-gen.ts:1-33`

```ts
import OpenAI from "openai";

interface GenerateImageResult {
  url: string;
  revisedPrompt: string;
}

export async function generateImage(
  apiKey: string,
  prompt: string,
  size: "1024x1024" | "1024x1792" | "1792x1024" = "1024x1024"
): Promise<GenerateImageResult> {
  const client = new OpenAI({ apiKey });

  const response = await client.images.generate({
    model: "dall-e-3",
    prompt,
    n: 1,
    size,
    quality: "standard",
    response_format: "b64_json",
  });

  const imageData = response.data?.[0];
  if (!imageData?.b64_json) {
    throw new Error("이미지 생성 결과를 받지 못했습니다.");
  }

  return {
    url: imageData.b64_json,
    revisedPrompt: imageData.revised_prompt || prompt,
  };
}
```

## 7. 호출 위치 — ai-editor-client.tsx

원본: `src/app/(dashboard)/contents/ai-editor/[id]/ai-editor-client.tsx:798-840`

```tsx

      // ── Phase 2.5: 인포그래픽 설계 (본문 완성 후 별도 LLM 분석) ──
      // Phase 2.5 에 문단 ID 가 필요하므로 먼저 주입
      if (!hasParagraphIds(phase2Body)) {
        phase2Body = injectParagraphIds(phase2Body);
      }
      const pIdCount = (phase2Body.match(/<!-- p:\d+ -->/g) || []).length;
      console.log("[Phase 2.5] 시작, 본문:", phase2Body.length, "자, 문단 ID:", pIdCount, "개");
      if (isMounted.current) {
        setPipelinePhase("phase25");
        setStreamingText("📊 인포그래픽 설계 중...");
      }

      try {
        const phase25Result = await clientRunPhase25({
          llm,
          phase25Prompt: PHASE25_INFOGRAPHIC_PROMPT,
          phase2Body,
          categoryName,
          targetKeyword,
          firstImageRules: FIRST_IMAGE_RULES,
          onProgress: (text) => {
            if (isMounted.current) setStreamingText(text);
          },
        });

        if (phase25Result.success && phase25Result.infographics && phase25Result.infographics.length > 0) {
          const count = phase25Result.infographics.length;
          console.log("[Phase 2.5] 완료, 인포그래픽:", count, "개, 유형:", phase25Result.infographics.map((i) => i.type).join(","));
          const beforeLen = phase2Body.length;
          phase2Body = insertInfographicMarkers(phase2Body, phase25Result.infographics);
          const markerCount = (phase2Body.match(/\[IMAGE:/g) || []).length;
          console.log("[Phase 2.5] 마커 삽입 후:", phase2Body.length, "자 (삽입 전:", beforeLen, "), 마커 수:", markerCount);
          await savePhase2Output(genId, phase2Body);
          if (isMounted.current) toast.success(`📊 인포그래픽 ${markerCount}개 삽입 완료`);
        } else {
          console.warn("[Phase 2.5] 설계 실패:", phase25Result.error);
          if (isMounted.current) toast.info(`인포그래픽 설계 건너뜀: ${phase25Result.error ?? "결과 없음"}`);
        }
      } catch (err) {
        console.error("[Phase 2.5] 예외:", err);
        if (isMounted.current) toast.error(`인포그래픽 설계 오류: ${err instanceof Error ? err.message : "알 수 없는 오류"}`);
      }
```
