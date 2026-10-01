# 기록 저장소 — Notion DB 5개 (모든 didim-blog-* 스킬 공통)

> 결정 근거: skills/_DECISIONS.md 4·6·7절. 아래 열 이름·타입·선택지는 **2026-10-01 notion-fetch 로 5개 data source 를 직접 조회해** 옮긴 것이다(콘텐츠 DB 의 "레거시 2차 분류" → **"2차 분류"** 이름 변경 반영).
> 측정은 최소화한다. 성과 DB 를 따로 두지 않고 콘텐츠 DB 에 최근 성과 열을 둔다.
> **메모 열은 사람이 쓰는 자유 기록 전용이다. 스킬은 어느 DB 의 '메모'에도 쓰지 않는다.** 기능별 기록은 전용 열과 글 페이지의 섹션에 둔다.

## 1. 위치와 찾는 법
| 대상 | 이름 | URL | data source ID (우선 사용) |
|---|---|---|---|
| 상위 페이지(비공개) | DIDIM 블로그 운영 | https://app.notion.com/p/3ec65e0fc92681358983f701a4691b71 | - |
| 콘텐츠 DB | 디딤 블로그 콘텐츠 | https://app.notion.com/p/4f21a8b7e84d4c818de1c673ed9cbbcb | `collection://463bc815-11ab-4290-9d86-22bd1aa9cfed` |
| 상담 DB | 디딤 블로그 상담 | https://app.notion.com/p/aa32b78384b7415a9daf6282572960c1 | `collection://e1272822-7efd-4850-b8c8-cfce02db7d00` |
| 사례 메모 DB | 디딤 블로그 사례 메모 | https://app.notion.com/p/10587b48b475419b9fc57661f9788d06 | `collection://d0dc583f-9a93-482c-af24-fede97f446a0` |
| 공고 후보 DB | 디딤 블로그 공고 후보 | https://app.notion.com/p/569416169c6e4b71a7630d6b586cf44e | `collection://22228030-8382-4930-926e-fd46dc2f0bac` |
| 키워드 DB | 디딤 블로그 키워드 | https://app.notion.com/p/00c4a691437b485bb7bdd28c3d95952f | `collection://4e0fae54-aeb3-48dd-b948-b78886a8e859` |

1. Notion 커넥터가 있으면 위 data source ID 로 먼저 조회한다(notion-fetch → 열·선택지 확인 → notion-query-data-sources 또는 notion-search).
2. 실패하거나 다른 워크스페이스면 DB 이름으로 검색한다.
3. 그래도 없으면 아래 스키마로 생성을 **제안**만 한다(사용자 승인 없이 만들지 않는다).
4. Notion 커넥터가 없으면 기록할 값을 아래 열 순서의 표로 대화에 출력하고, 사용자에게 붙여넣기를 요청한다.
5. 쓰기(생성·수정)는 항상 바꿀 값을 보여 주고 사용자 확인을 받은 뒤 한다. 선택지는 아래 문자열만 쓰고 새 선택지를 만들지 않는다.

### 쓰기 형식 (Notion SQLite 값)
- select / text / title / url: 문자열. number: 숫자. checkbox: `"__YES__"` / `"__NO__"`.
- date: `"date:<열>:start": "YYYY-MM-DD"`, `"date:<열>:is_datetime": 0` (예: `date:발행예정일:start`).
- relation: 관련 페이지 URL 배열 (예: `"사례 메모": ["https://app.notion.com/p/…"]`). 콘텐츠 DB 쪽 관계와 상대 DB 의 짝 열(사용 글·발행 글·경유 글)은 양방향이다 — 한쪽을 쓴 뒤 상대 페이지를 fetch 해 반영됐는지 확인하고, 비어 있으면 상대 쪽도 쓴다.
- 값 변환은 `scripts/notion_page.py` 가 한다(같은 파일이 writer·publish-prep·infographic 에도 있다 — 4벌 동일 유지).

## 2. "디딤 블로그 콘텐츠" 열 (38개)
| 열 | 타입 | 선택지 / 형식 | 쓰는 스킬 | 백오피스 대응 |
|---|---|---|---|---|
| 제목 | title | | writer(생성), planner(S0) | contents.title |
| 상태 | select | `S0 기획중` / `S1 초안완료` / `S2 검토완료` / `S3 발행예정` / `S4 발행완료` / `S5 성과측정` | writer(S1), ops, publish-prep(S4), performance(S5) | contents.status |
| 카테고리 | select | `지원사업·인증과 특허` / `출원·심판 실무` / `사례` / `지식재산 경영` / `디딤 소식` / `디딤 다이어리` / `레거시` | 전 스킬 | contents.category_id |
| 2차 분류 | select | `절세 시뮬레이션` / `인증 가이드` / `연구소 운영 실무` / `특허·상표 출원 실무` / `특허 전략 노트` / `AI와 IP` / `IP 뉴스 한 입` / `컨설팅 후기` / `디딤 일상` / `대표의 생각` (레거시 2차 + 다이어리 하위. 옛 이름 "레거시 2차 분류") | 전 스킬 | contents.secondary_category |
| categoryNo | number | 네이버 categoryNo (categories.md A-1) | 전 스킬 | (없음) |
| 디딤 소식 종류 | select | `IP 뉴스` / `사무소 소식` (디딤 소식(28)일 때만. 사무소 소식은 CTA·면책 없음) | writer, publish-prep, seo | (없음) |
| 타깃 키워드 | text | | planner, writer | contents.target_keyword |
| 키워드 | relation | ↔ 키워드 DB "발행 글" | writer, planner, health, performance | (keyword_pool 연결) |
| 태그 | text | 네이버 태그 10개, **쉼표+공백 구분, `#` 없이** (핵심3+연관3+브랜드2+롱테일2) | writer, publish-prep, seo | contents.tags |
| CTA | select | `절세 시뮬레이션` / `인증 진단` / `연구소 진단` / `출원 상담` / `이웃 추가` / `없음` | writer, publish-prep | (본문 CTA 블록) |
| 면책 레벨 | select | `A` / `B` / `C` / `없음` (코드 `none` → `없음`) | writer, publish-prep | (determineDisclaimerLevel 결과) |
| 발행예정일 | date | SLA 역산 기준일. 초안 단계부터 기입 | writer, ops, planner | contents.publish_date |
| 발행일 | date | 실제 발행 후에만(S4) | publish-prep, ops | contents.published_at |
| 발행 URL | url | 네이버 글 주소 | publish-prep, ops | (notes 의 [네이버 URL]) |
| 검수 상태 | select | `미검수` / `승인` / `수정 요청` / `재검수 요청` (코드 pending/approved/revision_requested) | ops | contents.review_status |
| 수정 횟수 | number | | ops | contents.revision_count |
| 검수 메모 | text | 회차마다 `[n회차] …` 줄 추가 | ops | contents.review_memo |
| SEO 점수 | number | 0~100 | seo | contents.seo_score |
| SEO 판정 | select | `통과` / `수정 필요` / `발행 불가` (코드 pass/fix_required/blocked) | seo, ops(전이 조건) | seo_checks.verdict |
| 교차검증 | select | `미실시` / `통과` / `심각 이슈 남음` | factcheck, ops(전이 조건) | ai_generations.validation_results |
| 교차검증일 | date | | factcheck | (없음) |
| 건강 상태 | select | `정상` / `업데이트 필요` / `법률 변경 확인` | health | contents.health_status |
| 마지막 업데이트일 | date | 글을 고친 날 | writer, health | contents.updated_at |
| 추천 소스 | select | `키워드 풀` / `뉴스` / `지원매치 리포트` / `로테이션` / `직접 입력` | planner (writer 는 새로 만들 때만, 기본 `직접 입력`) | content_recommendations.source |
| 추천 피드백 | select | `대기` / `적합` / `부적합` | planner | content_recommendations.status |
| 부적합 사유 | text | | planner | content_recommendations.rejection_reason |
| 부적합 키워드 | text | 다음 추천에서 제외할 키워드 | planner | (없음) |
| 근거 URL | url | 추천 근거(뉴스·공고) 링크 | planner | (없음) |
| 사례 메모 | relation | ↔ 사례 메모 DB "사용 글" | writer(사례 26), planner | (없음) |
| 공고 | relation | ↔ 공고 후보 DB "사용 글" | planner, writer | (없음) |
| 상담 | relation | ↔ 상담 DB "경유 글" | performance | 리드 테이블의 경유 글 |
| 조회수(최근) | number | | performance | contents.views_1w / views_1m |
| 유입 키워드 TOP3 | text | | performance | (성과 입력) |
| 댓글 수 | number | | performance | (성과 입력) |
| 성과 갱신일 | date | | performance | (없음) |
| 시리즈 / 시리즈 회차 | text / number | | planner, writer, health | contents.series_id / series_order |
| 메모 | text | **사람 자유 기록 전용 — 스킬은 쓰지 않는다** | (사람) | contents.notes |

카테고리 기록 규칙 (`notion_page.py` `category_props`):
- 신규 구조(25·27·26·24·28)·다이어리(17): `카테고리` = 이름, `categoryNo` = 번호, `2차 분류` 비움. 디딤 소식(28)은 `디딤 소식 종류` 도 쓴다.
- 다이어리 하위(18~20): `카테고리` = `디딤 다이어리`, `categoryNo` = 18/19/20, `2차 분류` = 컨설팅 후기/디딤 일상/대표의 생각.
- 레거시 글: `카테고리` = `레거시`, `2차 분류` = 원래 이름, `categoryNo` = 레거시 번호(10~12, 14~16, 23). 상위 9·13 은 2차 분류 선택지가 없으므로 비우고 categoryNo 만.
- 읽을 때(`notion_to_category`): 레거시면 2차 분류(없으면 categoryNo), 다이어리면 2차 분류(있으면), 그 외 categoryNo(없으면 카테고리 이름).

값 변환 (`notion_page.py`):
| 계산 값 | Notion 열 값 |
|---|---|
| CTA 템플릿 key `현장수첩_절세` / `현장수첩_인증` / `현장수첩_연구소` / `현장수첩_출원` | `절세 시뮬레이션` / `인증 진단` / `연구소 진단` / `출원 상담` |
| `이웃추가`(24) / `디딤소식_이웃추가`(28), FIELD_CTA 의 이웃 추가 문구 | `이웃 추가` |
| writer FIELD_CTA emailSubject `절세 시뮬레이션` / `인증 진단` / `연구소 관리` / `출원 상담` | `절세 시뮬레이션` / `인증 진단` / `연구소 진단` / `출원 상담` |
| CTA 없음(다이어리·사무소 소식·사용자 제외) | `없음` |
| `IP라운지` 템플릿, FIELD_CTA "상담 문의" 계열(CAT-B-01/02·DEFAULT) | 맞는 선택지 없음 → 열을 비우고 사용자에게 알림 |
| 면책 `A`/`B`/`C`/`none` | `A`/`B`/`C`/`없음` |
| 태그 배열 | `"태그1, 태그2, …"` (`#`·공백 제거) |
| 읽을 때 CTA 열 → publish-prep | 절세 시뮬레이션→`현장수첩_절세`, 인증 진단→`현장수첩_인증`, 연구소 진단→`현장수첩_연구소`, 출원 상담→`현장수첩_출원`, 이웃 추가→`이웃추가`(28 이면 `디딤소식_이웃추가`), 없음→CTA 블록 없음, 빈 값→자동 매칭 |

## 3. 글 페이지 본문 구조 (콘텐츠 DB 각 행의 페이지)
페이지 본문은 아래 5개 섹션을 이 순서로 둔다. 섹션 제목은 정확히 `## 이름` 한 줄이다. 아직 내용이 없으면 `(작성 전)` 한 줄.

| 섹션 | 내용 | 쓰는 스킬 | 읽는 스킬 |
|---|---|---|---|
| `## 브리핑` | planner→writer 입력: 주제·카테고리·타깃 키워드·타깃 독자·에피소드·참고 사항·근거(뉴스·공고·사례 메모 이름). 출처 사건번호는 쓰지 않는다 | planner (비어 있으면 writer 가 쓴 브리핑) | writer |
| `## 본문` | 최종 원고 마크다운(writer `body_for_save`). **` ```markdown ` 코드 블록 하나에 원문 그대로** 넣는다 — Notion 마크다운 변환(빈 줄 삭제·`[ ] < > |` 이스케이프·이미지 마커 해석)을 피해 글자수·마커·CTA 를 그대로 보존하기 위해서다 | writer (사람이 고치면 코드 블록 안에서 고친다) | factcheck, seo, ops, publish-prep, health, infographic |
| `## 인포그래픽` | 설계 요약 표(Notion `<table>`): 번호·유형·위치·헤드라인·ALT. 다이어리는 분위기 사진(장면·위치·ALT) | infographic | seo(이미지·ALT), publish-prep |
| `## 발행 블록` | publish-prep `build --format notion` 출력 그대로(### 블록 제목 + ` ```text ` 코드 블록, 붙여넣기 순서) | publish-prep | 사람(복사·붙여넣기) 또는 브라우저 에이전트(browser-publish.md) |
| `## 검수 기록` | 한 줄씩 덧붙이는 로그(KST): 초안 작성 요약(품질 체크·경고·Phase 3 수정), 교차검증 요약, SEO 미충족 항목, 상태 전이 로그. 형식 `- YYYY-MM-DD HH:MM 내용` | writer, factcheck, seo, ops, publish-prep | ops, 사람 |

읽기·쓰기 규칙 (`scripts/notion_page.py`):
1. **읽기**: notion-fetch 결과를 파일로 두고 `split --page-file` → 섹션별 텍스트. 섹션 내용이 코드 블록 하나면 그 안을 원문 그대로, 아니면 Notion 이스케이프(`\[`, `<empty-block/>` 등)를 풀어 돌려준다. `## 소제목`처럼 본문 안에 있는 제목은 코드 블록 안이므로 섹션으로 보지 않는다.
2. **새 글 페이지**: `page --briefing-file … --body-file …` 로 5개 섹션을 모두 만든 본문을 notion-create-pages `content` 에 넣는다(제목은 속성으로, 본문 첫머리에 넣지 않는다).
3. **한 섹션만 바꾸기**: `section --page-file <fetch 결과> --name <섹션> --content-file <새 내용> [--append] [--code markdown|text]` → 결과(`update_content` 의 old_str/new_str, 또는 섹션이 없을 때 끼워 넣기)를 notion-update-page 에 그대로 넘긴다. 다른 섹션은 건드리지 않는다. `replace_content`(페이지 전체 교체)는 쓰지 않는다.
4. `## 검수 기록` 은 항상 `--append`(덧붙이기). `(작성 전)` 자리표시는 첫 줄을 쓸 때 사라진다.
5. 섹션이 없는 옛 페이지(구조 도입 전)는 그 섹션을 순서에 맞는 자리에 새로 만든다(`section` 이 처리). 옛 페이지 본문에 섹션 없이 원고만 있으면 사용자에게 `## 본문` 으로 옮길지 묻는다.

## 4. "디딤 블로그 상담" 열
| 열 | 타입 | 선택지 / 형식 |
|---|---|---|
| 회사명 | title | |
| 상담일 | date | |
| 유입 경로 | select | `블로그` / `지원매치` / `특허인증센터` / `소개` / `기타` |
| 경유 글 | relation | ↔ 콘텐츠 DB "상담" |
| 관심 서비스 | multi_select | `출원·심판` / `지원사업 가점용 특허·인증` / `절세·연구소` / `기타` |
| 상태 | select | `신규` / `진행 중` / `제안` / `계약` / `보류` / `종료` |
| 계약 여부 | checkbox | |
| 계약 금액 | number (원, won 형식) | |
| 메모 | text | 사람 자유 기록 전용 |

## 5. "디딤 블로그 사례 메모" 열 (사례(26) 글의 재료)
| 열 | 타입 | 선택지 / 형식 |
|---|---|---|
| 사례명 | title | 익명화한 짧은 이름 (예: 제조업 A사 상표 거절 극복) |
| 유형 | multi_select | `상표` / `특허` / `디자인` / `심판·분쟁` / `벤처·이노비즈 인증` / `연구소` / `절세·직무발명` / `지원사업` |
| 고객 업종·규모 | text | |
| 상황 | text | 고객이 처음 겪은 문제 |
| 대응 | text | 디딤이 한 일 |
| 결과 | text | 수치는 사실만. 결과 보장 표현 금지 |
| 핵심 수치 | text | |
| 익명화 확인 | checkbox | |
| 고객 공개 동의 | select | `불필요(완전 익명)` / `받음` / `미확인` |
| 사용 상태 | select | `미사용` / `사용함` / `사용 불가` |
| 메모 일자 | date | |
| 출처 사건번호 | text | DIDIM 사건 관리의 사건번호. **내부용 — 글(본문·제목·태그·이미지·ALT·브리핑 섹션)에 절대 노출 금지** |
| 사용 글 | relation | ↔ 콘텐츠 DB "사례 메모" |

사용 규칙: **사례 글은 `익명화 확인` = 체크 이고 `고객 공개 동의` ≠ `미확인` 인 메모만 쓴다**(`사용 상태` = 사용 불가 도 제외). 쓴 뒤 콘텐츠 페이지 `사례 메모` 관계를 연결하고, 메모의 `사용 상태` = `사용함`. `notion_page.py case-memo` 가 조건 검사와 작성용 참고 사항(출처 사건번호 제외)을, `leak-check` 가 본문의 사건번호 노출 검사를 한다.

## 6. "디딤 블로그 공고 후보" 열 (지원매치 일일 리포트 → planner)
| 열 | 타입 | 선택지 / 형식 |
|---|---|---|
| 공고명 | title | |
| 기관 | text | |
| 마감일 | date | |
| 특허·인증 역할 | select | `요건` / `가점` / `우대` |
| 관련 권리·인증 | multi_select | `특허` / `상표` / `디자인` / `벤처기업 인증` / `이노비즈` / `기업부설연구소` / `기타 인증` |
| 근거 원문 | text | 공고문에서 특허·인증이 언급된 문장 그대로 |
| 공고 URL | url | |
| 리포트 일자 | date | |
| 우선순위 | select | `URGENT` / `PRIMARY` / `SECONDARY` |
| 상태 | select | `후보` / `채택` / `제외` / `마감` |
| 제외 사유 | text | |
| 사용 글 | relation | ↔ 콘텐츠 DB "공고" |

## 7. "디딤 블로그 키워드" 열 (planner 키워드 풀의 정본)
| 열 | 타입 | 선택지 / 형식 |
|---|---|---|
| 키워드 | title | |
| 카테고리 | select | `지원사업·인증과 특허` / `출원·심판 실무` / `사례` / `지식재산 경영` / `디딤 소식` (신규 5개) |
| 주제 축 | text | 레거시 2차 분류 또는 주제 묶음 |
| 매출 가중치 | number | 1~5. 수임 연결도 |
| 우선순위 | select | `높음` / `보통` / `낮음` |
| 커버리지 | select | `미작성` / `작성됨` / `재작성 필요` |
| 현재 순위 | number | 네이버 통합검색 블로그 탭 순위, 없으면 비움 |
| 순위 확인일 | date | |
| 메모 | text | 사람 자유 기록 전용 |
| 발행 글 | relation | ↔ 콘텐츠 DB "키워드" |

연결 규칙: 글의 타깃 키워드와 같은 `키워드`(공백 무시 일치) 행이 있으면 콘텐츠 페이지 `키워드` 관계에 연결한다. 없으면 새 행을 만들지 않고 planner 에 추가를 제안한다(키워드 풀 정본 관리는 planner).

## 8. 상태 값 대응 (S0~S5)
| 코드 | Notion 선택지 | 의미 |
|---|---|---|
| S0 | S0 기획중 | 기획 |
| S1 | S1 초안완료 | 초안 작성됨 |
| S2 | S2 검토완료 | 검수(팩트·SEO) 통과 |
| S3 | S3 발행예정 | 이미지·최종 편집 완료, 발행 준비 |
| S4 | S4 발행완료 | 네이버 발행됨(발행일·발행 URL 기록) |
| S5 | S5 성과측정 | 성과 입력됨 |
상태 전이 조건은 didim-blog-ops 스킬이 판단한다.
