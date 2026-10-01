# didim-blog-publish-prep — 네이버 발행 준비 뷰

## 1. 기능 개요
작성·검토가 끝난 디딤 블로그 글(마크다운 본문)을 네이버 블로그 에디터에 수동으로 붙여넣을 수 있도록, 제목·순수 텍스트 본문·표 데이터(TSV)·면책조항·CTA·네이버 태그·이미지 ALT·카테고리별 포맷 가이드·발행 전 체크리스트 7개를 "붙여넣기 블록"으로 만든다. CTA 는 네이버 카테고리(categoryNo) 별 규칙(_DECISIONS.md 2절 신규 구조) 또는 레거시 글이면 원본의 타깃 키워드 1순위 정규식 매칭으로 고르고, 이메일을 admin@didimip.com 으로 강제하며, 디딤 다이어리·사무소 소식은 CTA 를 만들지 않는다. 체크리스트 완료 후 S3→S4(발행완료) 기록까지 안내한다. 자동 발행은 하지 않는다.

## 2. 원본 코드 위치
| 파일 | 함수/상수 |
|---|---|
| src/lib/utils/publish-helpers.ts:6-91 | markdownToHtml |
| 〃:97-121 | extractTablesAsTabSeparated |
| 〃:126-136 | formatTagsForNaver |
| 〃:142-191 | stripMarkdown |
| 〃:197-268 | generateFormatGuide |
| 〃:273-277 | enforceEmail |
| 〃:282-297 | generateImageGuide |
| src/app/(dashboard)/contents/[id]/publish/page.tsx:11-52 | PublishPrepPage (contents·categories·cta_templates 조회) |
| src/app/(dashboard)/contents/[id]/publish/publish-prep-client.tsx:53-126 | FALLBACK_CTA |
| 〃:129-137 | CTA_KEYWORD_MAP |
| 〃:140-210 | matchCtaForContent |
| 〃:213-221 | PUBLISH_CHECKLIST |
| 〃:233-379 | 상태·면책·CTA·본문·태그·ALT 계산, handlePublishComplete |
| 〃:381-828 | 화면(카드·버튼 라벨·안내 문구) |
| src/actions/settings.ts:11-18, 156-182 | CtaTemplate, getCtaTemplates (key 오름차순) |
| src/lib/client-generate.ts:1585-1697 | determineDisclaimerLevel, getDisclaimerText, DISCLAIMER_LEVEL_LABELS |
| src/lib/client-generate.ts:1320-1349, 1699-1790 | DEFAULT_TAGS_BY_CATEGORY, generateAutoTags, getCategorySuffixes (태그 보조) |
| src/components/common/copy-button.tsx | writeText 복사, "복사됨" 2초 |
| src/actions/contents.ts:308-382 | updateContentStatus (S4 시 published_at 기록) |
| docs/UPGRADE_SPEC.md:557-623 | §8 네이버 발행 준비 뷰 기획 |

## 3. 입력
| 필드 | 원본 출처 | 비고 |
|---|---|---|
| title, body, tags, category_id, secondary_category, target_keyword, status, publish_date, is_ai_generated | contents 행 | 스킬: 사용자 붙여넣기 또는 Notion "디딤 블로그 콘텐츠" — `from-notion`: 제목, 페이지 `## 본문`(코드 블록 원문), 태그(쉼표 구분), categoryNo·카테고리·2차 분류, 타깃 키워드, 상태, 발행예정일 |
| cta_override_key / cta_none, disclaimer_override, office_news | 화면 드롭다운 | Notion "CTA"(없음 → cta_none), "면책 레벨"(없음 → none), "디딤 소식 종류"(사무소 소식 → true) |
| category (네이버 이름) / category_no, office_news | (없음 — 스킬 추가) | 정본 카테고리 입력. 있으면 category_id/secondary_category 대신 사용. CAT-* 만 오면 원본과 같은 경로 |
| categories | categories 테이블 | 스킬: seed.sql 이름 내장(DEFAULT_CATEGORIES) |
| cta_templates | cta_templates 테이블 | 스킬: migration 011 4건 내장(key 오름차순), 사용자가 최신 문구를 주면 대체 |
| cta_override_key, disclaimer_override | 화면 드롭다운 | 선택 입력 |

## 4. 처리 규칙
1. 대상 글이 없거나 is_deleted 면 "콘텐츠 없음"(page.tsx:25-40).
2. effectiveCategoryId = secondary_category ‖ category_id ‖ ""(publish-prep-client.tsx:234-235). 면책·포맷 가이드에 사용.
3. 면책: determineDisclaimerLevel(effectiveCategoryId, body, is_ai_generated) 자동, 사용자가 레벨을 바꾸면 getDisclaimerText(레벨, is_ai_generated). level≠none 이고 문구가 있을 때만 카드 표시(237-252, 485).
4. CTA 후보: DB 템플릿 + FALLBACK_CTA, 같은 key 는 DB 우선(153-157). DB 순서는 key 오름차순(settings.ts:165).
5. CTA 매칭(140-210): ① category_id 가 CAT-C/CAT-C-* → null ② target_keyword 소문자에 CTA_KEYWORD_MAP 7개 정규식을 순서대로 → 첫 일치 key ③ secondary_category: A-01 절세, A-02 인증, A-03 연구소, A-04 출원, CAT-B* IP라운지(없으면 null 로 종료) ④ 1차 카테고리 이름에서 "변리사의" 제거·소문자·앞 4글자가 categoryName 에 포함된 첫 템플릿 ⑤ CAT-A*→"출원" 포함, CAT-B*→"IP라운지" 포함(없으면 첫 템플릿) ⑥ 첫 템플릿.
6. 수동 선택 key 가 있으면 그 템플릿(없으면 자동)(273-278). CTA 텍스트는 enforceEmail 적용(281-284).
7. 본문: 복사용 = stripMarkdown(body), 서식 포함 = markdownToHtml(body)(287-294). 서식 포함 복사 실패 시 텍스트만(297-312).
8. 표: extractTablesAsTabSeparated(body) → 빈 줄로 연결해 한 번에 복사(315-318, 468-480).
9. 포맷 가이드: generateFormatGuide(effectiveCategoryId)(321-324). 판정 순서 CAT-A → CAT-B-03 → CAT-B → CAT-C → 기본(publish-helpers.ts:199-267).
10. 이미지: generateImageGuide(body) → 순번·설명, ALT = 설명(327-341).
11. 태그: formatTagsForNaver(tags), 칩 상태 excluded/overflow/ok(333-336, 635-651). 표시 "N/100자 · M개".
12. stripMarkdown 규칙 순서(publish-helpers.ts:148-190): 제목 기호 → ***/**/*/___/__/_ → ~~ → ` → ``` 블록 → 링크 → 수평선→━×18 → 글머리→"• " → "N." → "N " → ">" 제거 → 빈 줄 3+→2 → trim.
13. 체크리스트 7개(213-221) 모두 체크 + status ∈ {S3,S4,S5} 일 때만 "발행 완료 (S3→S4)" 활성(348-375, 774-789). S3 미만은 미리보기 배너(402-410).
14. 발행 완료 = updateContentStatus(id, "S4"): status 갱신 + published_at 기록 + state_transitions_log 기록(contents.ts:338-375). state_transitions 규칙 검증은 이 함수에 없다.
15. [스킬 추가] 붙여넣기 전 점검(extra.warnings): CTA 중복, 남은 표 줄, 코드 잔재, 여러 줄 이미지 블록, 제외 태그, '특허청', 비허용 이메일, 다이어리 CTA 표현.
16. [스킬 추가] 서식 행 가이드(UPGRADE_SPEC §8.1): 복사용 본문 기준 "N행 소제목 → 제목2", "━━━ → 구분선", "이미지 블록/마커 → 이미지 N 삽입".
17. [스킬 추가] 태그가 없으면 generateAutoTags 포팅으로 10개 생성(다이어리는 브랜드 2개).
18. [스킬 추가] 카테고리 라우팅(_route): category/category_no 를 네이버 정본 행으로 해석 → 신규 구조(25/27/26/24/28)는 신규 CTA 규칙(코어 cta-templates.md 0절, publish-screen.md 3-1절)과 면책·포맷 가이드용 CAT 별칭(25: CTA 매칭에 따라 A-01/02/03 또는 CAT-A, 27: A-04, 26: CAT-A, 24: CAT-B, 28: B-03)을 쓰고, 레거시(9·13 하위)·다이어리는 CAT 별칭(1차+2차)을 원본 matchCtaForContent 에 그대로 넘기며, 고정 페이지(7·22)는 CTA 없음. category 가 없고 CAT-* 만 있으면 원본과 완전히 같은 경로.
19. [스킬 추가] 레거시 카테고리를 쓰면 "신규 구조 대응: …" 경고, CAT-B-01/02 단독 입력이면 이름 확인 경고를 낸다.

## 5. 출력
"네이버 에디터에 그대로 붙여넣을 블록"(scripts `build --format text`): 미리보기 배너 → ⚠️ 확인 필요 → [1] 제목 → [2] 본문 → [2-1] 표 데이터 → [3] 면책조항 → [4] CTA(또는 다이어리 안내) → [5] 태그 → [6] 이미지 가이드/ALT → [7] 포맷 가이드 → [7-1] 서식 행 가이드 → [8] 발행 체크리스트 7개 → 콘텐츠 정보. 각 복사 대상은 ````text 코드 블록 하나. JSON 출력(`--format json`)에는 body_html, 칩 상태, 매칭 근거(_matched_by), extra(image_blocks, line_format_guide, warnings, body_has_cta), notion_values(CTA·면책 레벨·태그 Notion 열 값)가 추가로 있다. `--format notion` 은 같은 블록을 Notion 글 페이지 `## 발행 블록` 섹션용(### 제목 + ```text 코드 블록)으로 낸다.

## 6. 예외·오류 처리
- 제목 없음 → "제목 없음", 본문 없음 → "본문이 없습니다", 태그 없음 → "태그가 없습니다. 콘텐츠 상세에서 추가해주세요.", 마커 없음 → "본문에 [IMAGE: 설명] 마커가 없습니다.", CTA 없음 → "이 카테고리에 매칭되는 CTA 템플릿이 없습니다."(원문 문구).
- 체크리스트 미완료로 발행 완료 시도 → "모든 체크리스트를 완료해주세요".
- 상태 변경 실패 → 오류 메시지 표시(원본 toast 8초). 스킬: Notion 갱신 실패 시 사용자에게 수동 갱신 안내.
- Python 실행 불가 → references/publish-helpers.md 1절 순서대로 수동 적용.
- 입력 JSON 오류 → 스크립트가 예외로 종료하므로 입력을 다시 받는다.

## 7. 데이터 저장
저장소: Notion "디딤 블로그 콘텐츠"(data source collection://463bc815-11ab-4290-9d86-22bd1aa9cfed, 상위 "DIDIM 블로그 운영"). 열·선택지·값 변환·글 페이지 5개 섹션 규칙 전체는 skills/didim-blog-core/references/notion-storage.md. 섹션 처리·발행 후 속성은 scripts/notion_page.py(코어 정본 사본). **'메모' 열은 읽지도 쓰지도 않는다(사람 전용).**
| 백오피스 | 스킬 대체 (Notion) | 읽기/쓰기 |
|---|---|---|
| contents.title | 제목 (title) | 읽기 |
| contents.body | 페이지 `## 본문` (```markdown 코드 블록 원문) | 읽기 |
| contents.tags | 태그 (text, 쉼표 구분 10개) | 읽기 / 비어 있으면 사용자 확인 후 쓰기 |
| (화면 CTA 드롭다운) | CTA (select: 절세 시뮬레이션 / 인증 진단 / 연구소 진단 / 출원 상담 / 이웃 추가 / 없음) | 읽기(→ cta_override_key / cta_none) / 비어 있거나 사용자가 바꾸면 쓰기 |
| (화면 면책 드롭다운) | 면책 레벨 (select: A / B / C / 없음) | 읽기(→ disclaimer_override, 없음 → none) / 비어 있거나 바뀌면 쓰기 |
| contents.category_id / secondary_category | 카테고리 + categoryNo + 2차 분류 + 디딤 소식 종류 | 읽기 |
| contents.target_keyword | 타깃 키워드 (text) | 읽기 |
| contents.status | 상태 (select: S0 기획중 … S5 성과측정) | 읽기(S3 미만 미리보기) / 발행 후 `S4 발행완료` 쓰기(사용자 확인) |
| contents.publish_date | 발행예정일 (date) | 읽기(바꾸지 않음) |
| contents.published_at | 발행일 (date) | 발행 후 쓰기(사용자 확인) |
| (없음) | 발행 URL (url) | 발행 후 쓰기(사용자 확인) |
| (발행 준비 화면 자체) | 페이지 `## 발행 블록` | `build --format notion` 출력 그대로 쓰기(다른 섹션 불변) |
| state_transitions_log | 페이지 `## 검수 기록` | `- YYYY-MM-DD HH:MM S3→S4 발행 URL …` 한 줄 덧붙임 |
| contents.image_alt_texts | (없음) | 원본 화면처럼 본문 마커에서 계산. 설계 ALT 는 `## 인포그래픽` 섹션(infographic) |
| contents.is_ai_generated | (없음) | 기본 true, 페이지에 "AI 도움: 아니오" 줄이 있으면 false |
| contents.is_deleted | 해당 없음(Notion 휴지통) | |
| cta_templates | 쓰기 없음. 최신 문구는 사용자 입력 | |
커넥터가 없으면 값 표와 발행 블록을 출력해 붙여넣기를 요청한다.

## 8. 원본 코드와 달라진 점
1. **서식 행 가이드 추가**: UPGRADE_SPEC §8.1 의 "N행 → 네이버 제목2 / 구분선 / 이미지 삽입 위치" 는 코드에 미구현(generateFormatGuide 는 카테고리 고정 문구). 스킬은 `line-guide` 로 복사용 본문 기준 행 번호를 계산해 참고용으로 덧붙인다.
2. **여러 줄 이미지 블록 감지 추가**: Phase 2.5 가 넣는 마커(client-generate.ts:994-1001)는 `[IMAGE: …` 가 여러 줄이라 generateImageGuide(`.`이 줄바꿈 불가)에 잡히지 않는다(코드 한계). 스킬은 `━━ 📷 이미지 N ━━` 블록 번호와 ALT 후보(첫 `|` 앞 설명)를 따로 보여 준다. 원본 함수 결과는 그대로 유지.
3. **붙여넣기 전 경고 추가**(extra.warnings): 원본 화면에는 없다. 특히 AI 초안 본문에는 appendCtaAndSignature 가 이미 FIELD_CTA 블록을 붙이므로 발행 화면 CTA(DB/FALLBACK)와 중복될 수 있다(코드 내부 중복 가능성) → 하나만 쓰도록 경고.
4. **태그 자동 생성 보조**: 원본 화면은 태그가 없으면 안내만 한다. 스킬은 generateAutoTags 포팅으로 제안(사용자 확인 후 사용).
5. **복사 방식**: §8.2 는 순수 텍스트만 복사하라고 하나 코드는 "서식 포함 복사"(HTML)를 제공한다. 스킬 기본 출력은 순수 텍스트 블록이고 HTML 은 요청 시 body_html 로 제공(클립보드 API 없음).
6. **체크리스트**: 코드 7개를 그대로 쓰고, §8.1 의 "제목2 서식", "화요일 09:00 예약 발행", "PC + 모바일 미리보기"는 확인 포인트로만 덧붙일 수 있게 했다. 다이어리의 'CTA 복사 & 배치'는 "해당 없음" 표시를 허용(코드는 다이어리에서도 체크 요구).
7. **CTA 템플릿 데이터**: 실제 DB 대신 migration 011 시드 4건을 내장했다. 설정 화면에서 수정된 현재 DB 문구는 **확인 필요**. DB 정렬은 key 오름차순(IP라운지, 현장수첩_연구소, 현장수첩_인증, 현장수첩_절세)으로 가정 — Postgres collation 에 따라 달라질 수 있으나 Latin < 한글, 한글 음절 코드 순서라 동일할 것으로 판단(**확인 필요**).
8. **상태 전이**: 원본 updateContentStatus 는 state_transitions 조건을 검증하지 않고 S4 로 갱신한다. 스킬은 S3 이상일 때만 진행하고 조건 검증은 didim-blog-ops 로 넘긴다.
9. 원본 특이 동작은 포팅에서 그대로 재현(publish-helpers.md 2절): 인라인 코드 치환이 코드 블록 삭제보다 먼저라 코드 블록 잔재가 남음, 줄 전체 `***` 가 글머리 "• "로 바뀌고 다음 문단과 합쳐짐, 표 빈 셀 제거로 열 밀림, 100자 초과 태그 무음 제외. CRLF·유니코드 공백도 JS 정규식 의미대로 처리.
10. 썸네일 규격: §8.1(1200×630, 오렌지 계열)과 FIRST_IMAGE_RULES(1:1 1080×1080, 카테고리별 색) 불일치 — 스킬은 판단하지 않고 infographic 스킬 기준을 따르도록 안내(**확인 필요**).
11. **카테고리 체계**: 원본은 CAT-* 1·2차 ID 로 CTA·면책·포맷 가이드를 정한다. 스킬은 네이버 categoryNo 정본(_DECISIONS.md 1절)을 받아 신규 구조는 스킬 규칙으로 CTA 를 고르고(25 키워드 불일치 시 '인증 진단', 26 불일치 시 '출원'은 스킬 기본값 — 확인 필요), 면책·포맷 가이드는 CAT 별칭으로 원본 함수를 그대로 호출한다. 그래서 신규 카테고리의 포맷 가이드 머리글은 레거시 이름("변리사의 현장 수첩" 등)이 그대로 나온다(원문 유지). 디딤 소식 사무소 소식은 CTA 없음, 면책은 별칭상 C(필요 시 사용자가 none 선택).
12. **CTA 하나 원칙**: 신규 구조에서는 카테고리별 CTA 하나만 쓰도록 하고 본문에 이미 CTA 가 있으면 경고한다(백오피스는 생성 단계 FIELD_CTA 블록 + 발행 화면 CTA 카드로 중복 가능).
13. **[결정 사항 7절 반영] Notion 에서 읽고 '## 발행 블록' 에 쓰기** (skills/_DECISIONS.md 7절, 2026-10-01): `from-notion` 이 글 페이지(fetch 결과)의 제목·`## 본문` 섹션과 태그·CTA·면책 레벨·카테고리/categoryNo/2차 분류·디딤 소식 종류·타깃 키워드·상태·발행예정일 열을 build 입력으로 바꾼다. Notion CTA 열이 원본 화면의 수동 선택 드롭다운 역할을 하며(`cta_override_key`, 매칭 근거 "Notion 'CTA' 열"), CTA = 없음은 새 입력 `cta_none` 으로 CTA 블록을 생략한다(원본 화면에는 "CTA 없음" 선택이 없음). `build --format notion` 은 text 출력과 같은 블록·순서·문구를 Notion 용(### 블록 제목, ```text 코드 블록, 안내문 이스케이프)으로 내고, 이것을 `## 발행 블록` 섹션에 그대로 쓴다. build JSON 에 `notion_values`(CTA·면책 레벨·태그 열 값)를 덧붙였다. 발행 후 `상태` = S4 발행완료·`발행일`·`발행 URL` 갱신과 `## 검수 기록` 줄 추가는 사용자 확인 후에만 한다. '메모' 열은 쓰지 않는다. 원본 경로의 계산은 바꾸지 않았다 — 포팅 검증 13케이스 134항목 재실행 일치, 10개 입력의 build JSON·text 출력이 변경 전과 동일(추가 키 `notion_values` 제외).

검증: publish_prep.py 를 원본 TS(sucrase 로 트랜스파일해 node 22 실행; publish-helpers.ts 전체, client-generate.ts:1585-1697, publish-prep-client.tsx:49-221 원문 발췌)와 12개 입력(제목·볼드·홀수 **·목록·번호·인용·수평선·표·이미지 블록·코드 블록·링크·$ 치환 패턴·CRLF·유니코드 공백·이모지 태그·100자 초과 태그·카테고리/키워드 조합별 CTA·DB 유무)으로 대조 — stripMarkdown, markdownToHtml, 표 TSV, 태그, 포맷 가이드, enforceEmail, 이미지 가이드, 면책 레벨·문구, CTA 매칭(DB 有/無), FALLBACK_CTA, 체크리스트 전부 일치. generateAutoTags 는 11개 입력으로 일치.

## 9. 다른 스킬과의 연결
| 스킬 | 관계 |
|---|---|
| didim-blog-core | 카테고리 정본(categoryNo)·CTA·면책·이메일 규칙 원문, Notion 속성(이 스킬 스크립트에도 동일 표·문구 내장) |
| didim-blog-writer | 입력(완성 본문, 태그, 타깃 키워드)을 받음 — Notion 에서는 writer 가 쓴 `## 본문` 섹션과 태그·CTA·면책 레벨 열. 본문 끝 FIELD_CTA 블록 중복 점검 |
| didim-blog-infographic | 이미지 블록·첫 이미지 규격, 이미지 파일 준비 |
| didim-blog-seo / factcheck | 발행 전 품질·사실 검증 완료(S2→S3)를 전제로 함 |
| didim-blog-ops | S3→S4 전이 조건 검증·기록, 발행 캘린더 |
| didim-blog-performance | 발행 후(S4) 성과 입력의 시작점(네이버 URL·발행일) |
| Notion "디딤 블로그 콘텐츠" (core notion-storage.md) | 읽기: 제목·태그·CTA·면책 레벨·카테고리·categoryNo·2차 분류·디딤 소식 종류·타깃 키워드·상태·발행예정일 열 + 페이지 `## 본문` / 쓰기: `## 발행 블록`, 발행 후 상태·발행일·발행 URL·`## 검수 기록`(사용자 확인 후), 비어 있던 CTA·면책 레벨·태그 |
