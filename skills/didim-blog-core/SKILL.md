---
name: didim-blog-core
description: 특허그룹 디딤 네이버 블로그(didimip)의 공통 기반 규칙집. 네이버 실제 카테고리(categoryNo 25 지원사업·인증과 특허, 27 출원·심판 실무, 26 사례, 24 지식재산 경영, 28 디딤 소식, 17 디딤 다이어리, 레거시 9·13 하위)와 레거시 CAT-* 별칭 매핑, 카테고리별 역할·퍼널·프롬프트 키·톤 규칙, CTA 문구 원문과 선택 규칙, 면책조항 A/B/C, '특허청'→'지식재산처' 치환, 전화·이메일·서명·변리사 프로필, 절대원칙(이메일은 admin@didimip.com만, 디딤 다이어리 CTA 금지), 변리사 광고 규정 표현 규칙, Notion 기록 DB(디딤 블로그 콘텐츠/상담) 위치와 선택지를 담는다. 디딤 블로그 글을 기획·작성·검수·발행 준비·기록할 때 다른 didim-blog-* 스킬보다 먼저 함께 읽는다. "디딤 블로그 카테고리 뭐 있어?", "이 글 어느 카테고리야?", "CTA 뭐 넣어?", "면책 문구 줘", "다이어리에 상담 안내 넣어도 돼?", "특허청 표기 고쳐줘", "광고 규정 위반 표현 봐줘", "디딤 연락처·서명", "CAT-B-02가 뭐야?" 같은 요청에 사용한다.
---

# 디딤 블로그 공통 규칙 (didim-blog-core)

특허그룹 디딤 네이버 블로그의 카테고리·CTA·면책·명칭·광고 규정·기록 저장소를 한곳에 모은 기반 스킬이다.
백오피스(Next.js + Supabase) 코드의 상수·규칙을 원문 그대로 옮기고, 2026-10-01 확정 결정(skills/_DECISIONS.md: 네이버 categoryNo 정본, 신규 카테고리 구조, Notion DB)을 반영했다. 다른 didim-blog-* 스킬은 이 스킬의 references 를 근거로 쓴다.

## 언제 쓰나
- 글의 카테고리·프롬프트 키·톤을 정해야 할 때
- CTA·서명·연락처·면책조항 문구가 필요할 때
- 초안·발행본이 절대원칙과 광고 규정을 지키는지 검수할 때
- '특허청' 같은 옛 기관명을 현행 명칭으로 바꿀 때
- 레거시 카테고리(변리사의 현장 수첩, IP 라운지)나 코드의 CAT-* ID 를 신규 구조로 옮겨 읽을 때
- Notion "디딤 블로그 콘텐츠"/"디딤 블로그 상담" 에 무엇을 어떤 값으로 적을지 정할 때

## 절대원칙 (반드시 지킨다 — docs/UPGRADE_SPEC.md §0 + _DECISIONS.md)
1. 이메일은 **admin@didimip.com** 만. 다른 주소가 보이면 버그다. 전화 02-571-6613, 서명 "특허그룹 디딤 | 기업을 아는 변리사".
2. **디딤 다이어리(17, 하위 18~20)에는 CTA를 절대 넣지 않는다.** "상담", "문의", "연락", "무료", "진단", "시뮬레이션", "admin@" 도 쓰지 않는다. 디딤 소식의 '사무소 소식'도 CTA 없음. 인간적 신뢰가 목적이라 상업 문구가 진정성을 깬다.
3. 카테고리 이름은 네이버 표기와 100% 같게 쓴다. 정본 ID 는 네이버 categoryNo 이고 코드의 CAT-* 는 별칭일 뿐이다.
4. 카테고리별 글쓰기 공식(톤·분량·구조)은 섞지 않는다. 프롬프트 4종은 서로 독립이다.
5. 현재 시점 서술에서 '특허청' 대신 **'지식재산처'**(2025-10-01 승격). 과거 맥락("당시 특허청")·법령명·"특허청(현 지식재산처)"는 그대로 둔다.
6. 결과 보장·단정 표현 금지("반드시 절세됩니다", "법인세를 5천만원으로 줄였습니다"). 사례·수치에는 전제 조건(매출 규모·업종·기간)을 붙인다.
7. 사례(26) 글은 사용자가 준 사건 메모 없이는 쓰지 않는다.

## 입력
- 판단 대상: 카테고리(네이버 이름, categoryNo, 또는 CAT-*), 주제·타깃 키워드·제목, 검수할 본문, AI 도움 여부, (디딤 소식이면) 사무소 소식 여부.
- 데이터 출처: 사용자가 붙여넣은 텍스트 → Notion 커넥터가 있으면 "디딤 블로그 콘텐츠" DB(`references/notion-storage.md`) → 없으면 사용자에게 묻는다.

## 절차

### 1. 카테고리 확정 (`references/categories.md` A절)
1. 사용자가 카테고리를 지정하면(레거시 포함) 그대로 따른다. 지정이 없으면 신규 구조에서 고른다: 지원사업 가점·인증·연구소·직무발명 절세 → 25, 출원·우선심사·거절 대응·심판·분쟁 → 27, 실제 사건 메모가 있는 사례 → 26(없으면 27), IP 경영 관점·특허 전략·AI와 IP 연재 → 24, IP 뉴스·사무소 소식 → 28, 일상·소회 → 17.
2. CAT-* 나 레거시 이름이 오면 A-3 매핑표로 categoryNo 와 신규 대응을 함께 알려 준다. CAT-B-01/02 는 소스마다 이름이 뒤바뀌어 있으므로 이름으로 다시 확인한다.
3. `python3 scripts/core_rules.py category` ({"key": 이름|categoryNo|CAT-*})로 구분·별칭·신규 대응·프롬프트 키·CTA 정책·면책 기본값을 한 번에 얻는다.
4. 프롬프트 키: 25·27·26 → PROMPT_FIELD, 24 → PROMPT_LOUNGE_GENERAL, 28 → PROMPT_LOUNGE_BITE, 17 → PROMPT_DIARY (레거시는 CAT 별칭 규칙: 현장 수첩 → FIELD, IP 뉴스 한 입 → BITE, 나머지 IP 라운지 → LOUNGE_GENERAL).

### 2. 톤·글쓰기 규칙 (`references/writing-tone-rules.md`)
- 프롬프트 키에 맞는 CATEGORY_TONE_RULES 블록과 COMMON_WRITING_RULES 전문을 그대로 쓴다. 블록 안의 레거시 카테고리 이름("변리사의 현장 수첩" 등)은 원문이므로 고치지 않고, 실제 글의 카테고리는 1단계 결과를 쓴다.
- 독자 호칭: PROMPT_FIELD 글은 "대표님", "여러분"은 LOUNGE 계열에서만.

### 3. CTA 고르기 (`references/cta-templates.md` 0절)
- 한 글에 CTA 는 하나. `core_rules.py cta` ({category, target_keyword, title, office_news})로 고른다.
  - 25: 키워드(→제목)로 절세/인증/연구소 템플릿, 불일치 시 인증 진단 · 27: 출원 CTA · 26: 키워드 전체 매칭, 불일치 시 출원 · 24: 이웃 추가 CTA · 28: 가벼운 이웃 추가(사무소 소식은 없음) · 17: 없음.
  - 레거시 카테고리는 백오피스 원본 규칙(생성 getFieldCta / 발행 matchCtaForContent)을 CAT 별칭으로 적용한다.
- 문구는 원문 그대로. 이웃 추가 CTA 의 "매주 화요일"은 현재 발행 요일과 맞는지 사용자에게 확인한다.

### 4. 면책조항 (`references/disclaimers.md`)
- `core_rules.py disclaimer` ({category, body, is_ai_generated}): 다이어리 → none, 절세 매칭(25) 또는 절세 키워드+금액 → A, 디딤 소식(28) → C, 그 외 → B.
- AI 도움을 받은 글이면 첫 줄에 AI 고지 문구. 위치는 CTA 구분선(━━━) 바로 앞.

### 5. 명칭 치환 (`references/name-mappings.md`)
- `core_rules.py replace-names` 후 "지식재산처은"처럼 어색해진 조사를 직접 고친다(코드는 조사를 고치지 않는다).

### 6. 검수
1. `core_rules.py check` ({text, category}) — admin@didimip.com 외 이메일, 다이어리 CTA 키워드, 디딤 소식(BITE) 1,200자(공백 제외) 초과.
2. `references/ad-regulations.md` 1절로 결과 단정·절대적 약속·전제 없는 수치·"업계 최고"를 찾는다.
3. 다른 이메일은 `core_rules.py enforce-email` 로 바꾼다.

### 7. 기록 (`references/notion-storage.md`)
- "디딤 블로그 콘텐츠"의 `카테고리`·`categoryNo`·`2차 분류`·`상태` 값은 그 파일의 선택지 문자열 그대로 쓴다. 쓰기 전에 사용자 확인을 받는다. 커넥터가 없으면 표로 출력해 붙여넣기를 요청한다.

## 출력 형식
- 조회: 표 하나(예: | categoryNo | 이름 | 구분 | 프롬프트 키 | CTA | 신규 대응 |).
- 문구(CTA·면책·서명): 붙여넣을 문구만 코드 블록에 원문 그대로. 줄바꿈과 ━ 개수를 바꾸지 않는다. 어느 소스(FALLBACK=011 / seed JSON / FIELD_CTA)인지 한 줄로 밝힌다.
- 검수: | 위치 | 원문 | 위반 규칙 | 수정안 | 표 + "절대원칙 위반 N건 / 광고 규정 N건".

## 금지·주의
- references 의 문구를 요약·각색해서 "원문"이라고 내놓지 않는다.
- 다이어리·사무소 소식에 CTA·연락처·이메일·상담 유도 문구를 넣지 않는다.
- 확인되지 않은 실적 수치(예: "절세 컨설팅 40건+")를 사실처럼 쓰지 않는다 — 코드에 예시로만 있다.
- 백오피스 DB 에서 수정됐을 수 있는 CTA 문구는 확인 필요 사항이다. 사용자가 최신 문구를 주면 그것을 우선한다.
- 디딤 소개(7)·상담 안내(22)는 고정 페이지라 글을 생성하지 않는다. 네이버 자동 발행은 하지 않는다.

## 스크립트
`scripts/core_rules.py` (Python 3 표준 라이브러리, JSON 입출력, `--help`). 원본 TS 함수(replaceDeprecatedNames, getPromptKey, getFieldCta, validateGeneratedDraft, determineDisclaimerLevel)와 11개 입력에서 결과가 같음을 node 로 대조했다.
- `category {key}` · `cta {category, target_keyword, title, office_news}` · `prompt-key` · `field-cta`(레거시 생성용)
- `disclaimer {category|category_id, body, is_ai_generated}` · `replace-names {body}` · `enforce-email {text}` · `check {text, category}` · `constants`
예: `echo '{"category":"지원사업·인증과 특허","target_keyword":"벤처인증"}' | python3 scripts/core_rules.py cta`
실행할 수 없으면 references 의 규칙을 같은 순서로 손으로 적용한다.

## 참조 파일
| 파일 | 내용 |
|---|---|
| references/categories.md | A: 네이버 categoryNo 정본, 신규 구조 규칙, 레거시→신규·CAT 별칭 매핑 / B: 코드의 CAT-* 정의·불일치·원문 |
| references/cta-templates.md | 0: 스킬 CTA 결정표 / 1~8: FIELD_CTA·DB 011·FALLBACK·seed JSON·UPGRADE_SPEC 전문과 백오피스 런타임 사용처 |
| references/writing-tone-rules.md | COMMON_WRITING_RULES, CATEGORY_TONE_RULES 4종 원문 |
| references/disclaimers.md | 면책 A/B/C 원문, 판정 규칙, 신규 카테고리 적용표, migration 013 과의 차이 |
| references/name-mappings.md | name-mappings.ts 전체, 보호 패턴, 사용처 |
| references/brand-constants.md | 전화·이메일·서명·변리사 프로필·브랜드 태그·서명 블록 |
| references/absolute-principles.md | UPGRADE_SPEC §0·§11 원문, 코드상 강제 지점 |
| references/ad-regulations.md | 변리사 광고 규정 관련 프롬프트·검증 규칙 원문 |
| references/notion-storage.md | Notion DB 2개 위치·ID·속성·선택지, 기록 규칙 |
