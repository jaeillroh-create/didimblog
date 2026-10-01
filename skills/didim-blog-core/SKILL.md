---
name: didim-blog-core
description: 특허그룹 디딤 네이버 블로그(didimip)의 공통 기반 규칙집. 카테고리 1차/2차 전체 목록과 ID(CAT-A-01 절세 시뮬레이션, CAT-A-04 특허·상표 출원 실무 등), 카테고리별 역할(전환/트래픽·브랜딩/신뢰)·퍼널·톤 규칙, CTA 문구 원문과 선택 규칙, 면책조항 A/B/C, '특허청'→'지식재산처' 명칭 치환, 전화·이메일·서명·변리사 프로필, 절대원칙(이메일은 admin@didimip.com만, 디딤 다이어리 CTA 금지), 변리사 광고 규정 표현 규칙을 담는다. 디딤 블로그 글을 기획·작성·검수·발행 준비할 때 다른 didim-blog-* 스킬보다 먼저 함께 읽는다. "디딤 블로그 카테고리 뭐 있어?", "이 글 CTA 뭐 넣어?", "면책 문구 줘", "다이어리에 상담 안내 넣어도 돼?", "특허청 표기 고쳐줘", "광고 규정 위반 표현 있는지 봐줘", "디딤 연락처·서명 알려줘", "CAT-B-02가 뭐야?" 같은 요청에 사용한다.
---

# 디딤 블로그 공통 규칙 (didim-blog-core)

특허그룹 디딤 네이버 블로그의 브랜드·카테고리·CTA·면책·명칭·광고 규정을 한곳에 모은 기반 스킬이다.
백오피스(Next.js + Supabase) 코드의 상수·규칙을 원문 그대로 옮겼다. 다른 didim-blog-* 스킬은 이 스킬의 references 를 근거로 쓴다.

## 언제 쓰나
- 글의 카테고리(1차/2차)·프롬프트 키·톤을 정해야 할 때
- CTA·서명·연락처·면책조항 문구가 필요할 때
- 초안·발행본이 절대원칙과 광고 규정을 지키는지 검수할 때
- '특허청' 같은 옛 기관명을 현행 명칭으로 바꿀 때
- 카테고리 ID·이름이 소스마다 달라 헷갈릴 때

## 절대원칙 (반드시 지킨다 — docs/UPGRADE_SPEC.md §0)
1. 이메일은 **admin@didimip.com** 만. 다른 주소가 보이면 버그다. 전화는 02-571-6613, 서명은 "특허그룹 디딤 | 기업을 아는 변리사".
2. **디딤 다이어리(CAT-C, CAT-C-01~03)에는 CTA를 절대 넣지 않는다.** "상담", "문의", "연락", "무료", "진단", "시뮬레이션", "admin@" 도 쓰지 않는다. 인간적 신뢰가 목적이라 상업 문구가 진정성을 깬다.
3. 카테고리·2차 분류 문자열은 네이버 블로그 표기와 100% 같게 쓴다.
4. 카테고리별 글쓰기 공식(톤·분량·구조)은 섞지 않는다. 프롬프트 4종은 서로 독립이다.
5. 현재 시점 서술에서 '특허청' 대신 **'지식재산처'**(2025-10-01 승격). 과거 맥락("당시 특허청")·법령명·"특허청(현 지식재산처)"는 그대로 둔다.
6. 결과 보장·단정 표현 금지("반드시 절세됩니다", "법인세를 5천만원으로 줄였습니다"). 사례·수치에는 전제 조건(매출 규모·업종·기간)을 붙인다.

## 입력
- 판단 대상: 카테고리 이름 또는 ID, 주제·타깃 키워드, 검수할 본문(마크다운 또는 텍스트), AI 생성 여부.
- 데이터 출처: 사용자가 붙여넣은 텍스트 → Notion 커넥터가 있으면 "디딤 블로그 콘텐츠" DB → 그래도 없으면 사용자에게 묻는다.

## 절차

### 1. 카테고리 확정
1. `references/categories.md` 1절 정본 표에서 1차/2차를 고른다. 이름(네이버 문자열)을 먼저 확정하고 ID는 그다음에 붙인다.
2. CAT-B-01/CAT-B-02 는 소스마다 이름이 뒤바뀌어 있다(코드 런타임: B-01=특허 전략 노트, B-02=AI와 IP / DB 시드: 반대). 반드시 이름으로 말하고, ID만 주어지면 어느 기준인지 사용자에게 확인한다.
3. CAT-A-04 "특허·상표 출원 실무"는 네이버에 실제로 있는 2차 카테고리다. DB 시드에는 없지만 정식으로 취급한다.
4. 프롬프트 키: CAT-A* → PROMPT_FIELD, CAT-B-03 → PROMPT_LOUNGE_BITE, 나머지 CAT-B* → PROMPT_LOUNGE_GENERAL, CAT-C* → PROMPT_DIARY. `python3 scripts/core_rules.py category` 로 역할·퍼널·CTA 유형까지 한 번에 조회할 수 있다.

### 2. 톤·글쓰기 규칙 적용
- `references/writing-tone-rules.md` 에서 해당 프롬프트 키의 CATEGORY_TONE_RULES 블록과 COMMON_WRITING_RULES 전문을 그대로 쓴다.
- 독자 호칭: 현장 수첩은 "대표님", "여러분"은 IP 라운지에서만.

### 3. CTA 고르기 (`references/cta-templates.md`)
- 다이어리면 여기서 멈춘다: CTA 없음.
- **초안 작성 단계**(본문 끝 서명 블록): `core_rules.py field-cta` 로 FIELD_CTA 1문장과 메일 제목을 고른다. 순서는 2차 분류 정확 일치 → 키워드(절세·세액공제·법인세·보상금 / 인증·벤처·이노비즈 / 연구소·연구활동·사후관리 / 출원·상표·특허출원·pct / ai·인공지능·생성형) → 1차 폴백(CAT-A→CAT-A-04, CAT-B→CAT-B-01) → 범용. 블록 모양은 `references/brand-constants.md` 끝 절.
- **발행 준비 단계**(복사용 CTA 카드): didim-blog-publish-prep 의 키워드 1순위 매칭(DB/FALLBACK 템플릿)을 쓴다.
- 두 단계의 문구가 달라 한 글에 CTA가 두 번 들어갈 수 있다. 발행본에는 하나만 남긴다.
- seed_data/cta_templates.json 과 UPGRADE_SPEC §5.2 문구는 런타임에 쓰이지 않는다(참고용).

### 4. 면책조항 (`references/disclaimers.md`)
- `core_rules.py disclaimer` 로 레벨을 정한다: CAT-C* → none, CAT-A-01 또는 (절세 키워드 + 금액 표현) → A, CAT-B-03 → C, 그 외 → B.
- AI 도움을 받은 글이면 첫 줄에 AI 고지 문구를 둔다. 위치는 CTA 구분선(━━━) 바로 앞.

### 5. 명칭 치환 (`references/name-mappings.md`)
- `core_rules.py replace-names` 로 '특허청'→'지식재산처'를 적용한 뒤, "지식재산처은"처럼 조사가 어색해진 곳을 직접 고친다(코드는 조사를 고치지 않는다).

### 6. 검수
1. `core_rules.py check` (입력 {text, category_id}) — 이메일 불일치, 다이어리 CTA 키워드, IP 뉴스 한 입 1,200자(공백 제외) 초과를 잡는다.
2. `references/ad-regulations.md` 1절 체크 항목으로 결과 단정·절대적 약속·전제 없는 수치·"업계 최고"를 찾는다.
3. 이메일이 admin@didimip.com 이 아니면 `core_rules.py enforce-email` 로 바꾼다.

## 출력 형식
- 조회 요청: 표 하나로 답한다(예: | ID | 이름 | 역할 | 퍼널 | CTA 유형 | 프롬프트 키 |).
- 문구 요청(CTA·면책·서명): 붙여넣을 문구만 코드 블록에 원문 그대로. 줄바꿈과 ━ 구분선 개수를 바꾸지 않는다.
- 검수 요청: | 위치(문단/문장) | 원문 | 위반 규칙 | 수정안 | 표 + 마지막 줄에 "절대원칙 위반 N건 / 광고 규정 N건".
- 소스끼리 문구가 다르면 어느 소스를 썼는지(FIELD_CTA / DB 011 / FALLBACK) 한 줄로 밝힌다.

## 금지·주의
- references 의 문구를 요약·각색해서 "원문"이라고 내놓지 않는다.
- 다이어리 글에 CTA, 연락처, 이메일, 상담 유도 문구를 넣지 않는다(서명 블록도 넣지 않는다).
- 확인되지 않은 실적 수치(예: "절세 컨설팅 40건+")를 사실처럼 쓰지 않는다 — 코드에 예시로만 있다.
- 실제 DB의 현재 CTA 문구(설정 화면에서 수정됐을 수 있음)는 확인 필요 사항이다. 사용자가 최신 문구를 주면 그것을 우선한다.
- 네이버 자동 발행은 하지 않는다.

## 스크립트
`scripts/core_rules.py` (Python 3 표준 라이브러리, JSON 입출력, `--help` 지원). 원본 TS 와 같은 입력에 같은 결과임을 node 로 대조 검증했다.
- `replace-names {body}` · `prompt-key {category_id}` · `field-cta {category_id, target_keyword}`
- `disclaimer {category_id, body, is_ai_generated}` · `enforce-email {text}` · `check {text, category_id}`
- `category {key}` · `constants`
예: `echo '{"category_id":"CAT-A-02","target_keyword":"벤처인증"}' | python3 scripts/core_rules.py field-cta`
스크립트를 실행할 수 없으면 references 의 규칙을 손으로 같은 순서로 적용한다.

## 참조 파일
| 파일 | 내용 |
|---|---|
| references/categories.md | 1차/2차 정본 표, 라벨 사전, 소스별 불일치(CAT-A-04, B-01/B-02), seed.sql·categories.ts 원문 |
| references/cta-templates.md | FIELD_CTA·DB 011·FALLBACK·seed JSON·UPGRADE_SPEC CTA 전문과 런타임 사용처 |
| references/writing-tone-rules.md | COMMON_WRITING_RULES, CATEGORY_TONE_RULES 4종 원문 |
| references/disclaimers.md | 면책 A/B/C 원문, 판정 규칙, migration 013 과의 차이 |
| references/name-mappings.md | name-mappings.ts 전체, 보호 패턴, 사용처 |
| references/brand-constants.md | 전화·이메일·서명·변리사 프로필·브랜드 태그·서명 블록 |
| references/absolute-principles.md | UPGRADE_SPEC §0·§11 원문, 코드상 강제 지점, validateGeneratedDraft 원문 |
| references/ad-regulations.md | 변리사 광고 규정 관련 프롬프트·검증 규칙 원문 |
