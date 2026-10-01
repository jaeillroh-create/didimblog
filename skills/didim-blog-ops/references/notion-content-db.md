# Notion DB "디딤 블로그 콘텐츠" — 필드 정의와 상태 전이 절차

> 실제 DB 스키마(skills/_DECISIONS.md §4·§6·§7, 2026-10-01 확장본)를 그대로 옮겼다.
> - DB: https://app.notion.com/p/4f21a8b7e84d4c818de1c673ed9cbbcb — data source `collection://463bc815-11ab-4290-9d86-22bd1aa9cfed` (우선 사용)
> - 다른 워크스페이스면 이름 "디딤 블로그 콘텐츠"로 찾고, 없으면 아래 스키마로 생성을 **제안**만 한다. 상위 페이지 "DIDIM 블로그 운영"(비공개).
> - 커넥터가 없으면 바꿀 값을 표로 출력하고 사용자에게 붙여넣기를 요청한다.
> - **메모 열은 사람이 쓰는 자유 기록 전용**이다. 스킬은 메모에 쓰지 않는다.

## 1. 이 스킬이 읽고 쓰는 속성

| 속성 | 타입 | 선택지 / 규칙 | ops 사용 |
|---|---|---|---|
| 제목 | title | | 읽기 |
| 상태 | select | `S0 기획중` / `S1 초안완료` / `S2 검토완료` / `S3 발행예정` / `S4 발행완료` / `S5 성과측정` | 읽기·쓰기 |
| 카테고리 | select | 지원사업·인증과 특허 / 출원·심판 실무 / 사례 / 지식재산 경영 / 디딤 소식 / 디딤 다이어리 / 레거시 | 읽기(비율·로테이션·CTA 면제) |
| 2차 분류 | select | 절세 시뮬레이션 / 인증 가이드 / 연구소 운영 실무 / 특허·상표 출원 실무 / 특허 전략 노트 / AI와 IP / IP 뉴스 한 입 / 컨설팅 후기 / 디딤 일상 / 대표의 생각 (레거시 2차 + 다이어리 하위) | 읽기 |
| categoryNo | number | 네이버 categoryNo | 읽기 |
| 디딤 소식 종류 | select | IP 뉴스 / 사무소 소식 (사무소 소식 = CTA 면제) | 읽기 |
| 발행예정일 | date | 초안 단계부터 기입. SLA 역산·캘린더 기준 | 읽기·쓰기 |
| 발행일 | date | 실제 발행 후에만(S4) | 쓰기 |
| 발행 URL | url | S4 시 네이버 글 URL | 쓰기 |
| 태그 | text | 쉼표 구분 10개 (S1→S2 필수 조건) | 읽기 |
| CTA | select | 절세 시뮬레이션 / 인증 진단 / 연구소 진단 / 출원 상담 / 이웃 추가 / 없음 | 참고 |
| 검수 상태 | select | 미검수 / 승인 / 수정 요청 / 재검수 요청 (코드 pending/approved/revision_requested) | 읽기·쓰기 |
| 수정 횟수 | number | 수정 요청마다 +1 (코드 revision_count) | 읽기·쓰기 |
| 검수 메모 | text | 회차마다 `[n회차] …` 줄 추가 (코드 review_memo) | 쓰기 |
| SEO 점수 | number | 0~100, didim-blog-seo 가 씀 | 읽기(권장 70+) |
| SEO 판정 | select | 통과 / 수정 필요 / 발행 불가 (코드 pass/fix_required/blocked) | 읽기 |
| 교차검증 | select | 미실시 / 통과 / 심각 이슈 남음 | 읽기(권장: 통과) |
| 교차검증일 | date | didim-blog-factcheck 가 씀 | 참고 |
| 추천 소스·추천 피드백·부적합 사유·부적합 키워드·근거 URL | | didim-blog-planner 영역 | — |
| 조회수(최근)·유입 키워드 TOP3·댓글 수·성과 갱신일 | | didim-blog-performance 영역 (S4→S5 입력) | — |
| 건강 상태·마지막 업데이트일 | | didim-blog-health 영역 | — |
| 시리즈·시리즈 회차 | | didim-blog-health 영역 | — |
| 면책 레벨 | select | A / B / C / 없음 — writer·publish-prep | — |
| 상담 / 키워드 / 사례 메모 / 공고 | relation | 상담 DB·키워드 DB·사례 메모 DB·공고 후보 DB | — |
| 메모 | text | 사람 자유 기록 전용 | 읽기만 |

페이지 본문 구조(_DECISIONS.md §7): `## 브리핑` / `## 본문` / `## 인포그래픽` / `## 발행 블록` / `## 검수 기록`. ops 는 `## 본문` 을 읽어 글자수·CTA·이미지 마커를 세고, 전이 로그·역행 사유·강제 전환 기록을 **`## 검수 기록`** 에 줄로 추가한다.

## 2. 원본 contents 컬럼 → Notion 매핑

| contents 컬럼 (마이그레이션) | Notion | 비고 |
|---|---|---|
| id (001) | (없음) | 페이지가 식별자. W{주차}-{순번} 은 필요 시 계산만 |
| title (001) | 제목 | |
| category_id (001) | 카테고리 + categoryNo | CAT-* 는 레거시 별칭 |
| secondary_category (001) | 2차 분류 | |
| target_keyword (001) | 타깃 키워드 (+ 키워드 관계) | |
| target_audience (001) | (없음) | |
| status (001) | 상태 | `S{n} {라벨}` |
| publish_date (001) | 발행예정일 | |
| briefing_due…publish_due (001) | (저장 안 함) | 발행예정일에서 역산 (scripts/sla.py) |
| briefing_done_at…image_done_at (001) | (저장 안 함) | 상태로 추정 / 검수 기록 로그 |
| published_at (001) | 발행일 | |
| revision_count (001) | 수정 횟수 | |
| author_id·reviewer_id·designer_id (001) | (없음) | 1인 운영 |
| views_1w·views_1m (001) | 조회수(최근) | |
| avg_duration_sec·search_rank·cta_clicks (001) | (없음) | 측정 최소화. 키워드 순위는 키워드 DB |
| quality_score_1st/final·quality_grade (001) | (없음) | 필요 시 계산만 |
| notes (001) | 메모(사람용) / 페이지 `## 검수 기록`(스킬 로그) | |
| body (007) | 페이지 `## 본문` | |
| is_deleted (007) | (페이지 휴지통) | |
| tags (007) | 태그 | |
| seo_score (007) | SEO 점수 | |
| (seo_checks.verdict, 001) | SEO 판정 | |
| seo_keywords·image_alt_texts (007) | (없음) / 페이지 `## 인포그래픽`·`## 발행 블록` | |
| scheduled_at (007) | 발행예정일 | 화 09:00 |
| health_status·health_checked_at (007) | 건강 상태·마지막 업데이트일 | |
| series_id·series_order (007) | 시리즈·시리즈 회차 | |
| ai_generation_id 외 AI 컬럼 (002/007) | (없음) | |
| review_status (012/014) | 검수 상태 | |
| review_memo (012/014) | 검수 메모 | 덮어쓰지 않고 회차 줄 추가 |
| state_transitions_log (014) | 페이지 `## 검수 기록` | |
| (notes 의 [네이버 URL]) | 발행 URL | |
| (교차검증 결과, ai_generations.validation_results) | 교차검증·교차검증일 | |

## 3. `## 검수 기록` 줄 형식 (KST)
```
- 2026-10-03 10:00 검수 승인
- 2026-10-03 10:00 자동 전이 → S2
- 2026-10-03 10:00 S2→S3
- 2026-10-04 09:10 S2→S1 (역행: 팩트 오류 발견)
- 2026-10-04 09:30 S1→S2 (강제 전환: 관리자 강제 전환 (조건 미충족))
- 2026-10-06 09:05 S3→S4 발행 URL https://blog.naver.com/didimip/...
```
검수 메모 열: `[1회차] 3문단 숫자 근거 보강 (2026-10-02)` / `[2회차] 승인 — 체크: numbers, law, tone (2026-10-03)`

## 4. Notion 에서의 상태 전이 절차
1. data source 로 대상 행을 찾는다. `상태`·`카테고리`·`2차 분류`·`디딤 소식 종류`·`발행예정일`·`태그`·`검수 상태`·`수정 횟수`·`SEO 점수`·`SEO 판정`·`교차검증` 과 페이지 `## 본문` 을 읽는다.
2. 행을 JSON(한글 속성명 그대로)으로 만들고 본문은 `본문` 키로 넣어 `scripts/transition_check.py check --to <목표>` 실행.
3. `kind` 처리: `blocked` 중단 / `blocked_required` 필수 목록 제시 후 중단(사용자가 명시적으로 "강제"를 요청할 때만 진행) / `confirm_recommended` 확인 후 진행 / `needs_reason` 사유 받아 진행 / `ok` 진행.
4. 진행 시 `notion_update` 를 그대로 쓰고(`상태` = `S{n} {라벨}`, S4 는 `발행일`·`발행 URL`), `page_log_append` 줄을 `## 검수 기록` 끝에 추가한다(사유가 있으면 괄호에 넣는다).
5. 쓰기 실패 시 실패 속성과 오류를 보여주고 "반영할 값" 표를 준다.
