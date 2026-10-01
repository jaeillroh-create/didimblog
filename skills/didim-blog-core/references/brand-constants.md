# 디딤 브랜드 상수

> 출처: src/lib/constants/categories.ts:34-40, client-generate.ts:1534·1563-1580·1720, prompts.ts COMMON_LEGAL_RULES·FIRST_IMAGE_RULES.

| 상수 | 값 (원문) | 근거 |
|---|---|---|
| DIDIM_EMAIL | `roh@didimip.com` | categories.ts:36 |
| DIDIM_PHONE | `02-571-6613` | categories.ts:37 |
| DIDIM_SIGNATURE | `노재일 변리사 | 특허그룹 디딤` | categories.ts:38 |
| DIDIM_PROFILE_NOH (노재일 변리사) | `KAIST 출신 | 前 NHN에듀 최고지식재산책임자(CIPO) | 기업기술가치평가사` | categories.ts:39 |
| DIDIM_PROFILE_LEE (이용환 변리사) | `경희대 겸임교수 | 서울대 AI 최고위과정 | 반도체·디스플레이 IP 전문` | categories.ts:40 |
| 브랜드 태그(항상 포함) | `특허그룹디딤`, `디딤변리사` | client-generate.ts:1534, 1720 |
| 첫 이미지 브랜드 라인 | 정확히 `특허그룹 디딤` | prompts.ts:427-431 (FIRST_IMAGE_RULES) |

- 글쓴이: 현장 수첩 = 노재일 변리사(PROMPT_FIELD), 다이어리 = 노재일 또는 이용환 변리사(PROMPT_DIARY), IP 라운지 = "특허그룹 디딤의 IP 전문가".
- 신뢰 장치 예시(COMMON_LEGAL_RULES, prompts.ts:144-147): 법령 근거 "(근거: 조특법 제10조, 2024년 개정)", 실적 수치 "디딤에서 지난 1년간 처리한 절세 컨설팅 건수: 40건+", 자격 명시 "KAIST 출신, 기업기술가치평가사 자격". 실적 수치는 예시 문구이므로 실제 수치는 **확인 필요**.
- 핵심 서비스(브리핑 프롬프트, prompts.ts:1499): 직무발명보상 절세 컨설팅, 기업부설연구소 설립, 벤처기업인증, 특허출원.
- 블로그 RSS: https://rss.blog.naver.com/didimip.xml (작업 지침 기준).

## AI 초안 본문 끝에 붙는 서명 블록 (client-generate.ts:1571-1580 원문)
````ts
  const block = `
${disclaimerBlock}
━━━━━━━━━━━━━━━━━━
${cta}

노재일 변리사 | 특허그룹 디딤
📞 02-571-6613
📧 roh@didimip.com (메일 제목: '${subject}')

${tagLine}`;
````
- `${cta}` = getFieldCta 1문장(없으면 "관련해서 궁금하신 점이 있다면 roh@didimip.com 으로 편하게 연락주세요."), `${subject}` = 메일 제목(없으면 "상담 문의"), `${tagLine}` = `#태그 #태그 …` 10개.
