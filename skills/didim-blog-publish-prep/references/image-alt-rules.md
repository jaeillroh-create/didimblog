# 이미지 마커 형식과 ALT 텍스트 규칙 (원문)

> 발행 준비 화면의 ALT 는 [IMAGE: 설명] 의 설명을 그대로 쓴다(publish-prep-client.tsx:339-341). ALT 를 새로 써야 할 때는 아래 ALT_TEXT_RULES 를 따른다.

## 1. ALT_TEXT_RULES (prompts.ts:475-483)
````text
const ALT_TEXT_RULES = `
ALT 텍스트 작성 규칙

형식: "[핵심 키워드] + 이미지 내용 설명" (20~40자)
예시: "직무발명보상 절세 효과 Before After 비교 인포그래픽"
핵심 키워드를 ALT 텍스트 앞부분에 배치
3개 ALT 텍스트 생성 (본문 이미지 3~5개 중 핵심 3개)
동일 키워드 ALT 3회 반복 금지 — 변형 표현 사용
`;
````

## 2. 이미지 마커 형식 (VISUAL_RULES, prompts.ts:328-335)
````text
### 이미지 마커 형식 — 2개 버전 필수 생성

━━ 📷 이미지 N ━━
[IMAGE: 한국어 설명 | 유형(A~H) | 상세 프롬프트]
━━━━━━━━━━━━━━

(1) 한국어 버전: 삽입 위치 + 차트 설명 (사용자 확인용)
(2) 영문 프롬프트: 이미지 생성 AI 입력용 — "ALL text in image must be Korean. No English text anywhere." 필수 포함
````

## 3. Phase 2.5 가 본문에 넣는 실제 마커 모양 (client-generate.ts:983-1000)
````ts
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
````
→ `[IMAGE: …` 가 여러 줄에 걸치므로 generateImageGuide(한 줄 정규식)에는 잡히지 않는다. 스킬은 `━━ 📷 이미지 N ━━` 블록을 따로 감지해 "블록 전체를 지우고 이미지 N 삽입"으로 안내하고, ALT 후보로 `[IMAGE:` 다음 첫 `|` 앞 한국어 설명을 쓴다(스킬 추가).

## 4. 다이어리 시각 자료 규칙 (prompts.ts:462-473)
````text
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
````
