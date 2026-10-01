# Notion DB "디딤 블로그 콘텐츠" — 필드 정의와 상태 전이 절차

> 2026-10-01 생성된 실제 DB 스키마(skills/_DECISIONS.md §4·§6)를 그대로 옮겼다.
> - DB: https://app.notion.com/p/4f21a8b7e84d4c818de1c673ed9cbbcb
> - data source: `collection://463bc815-11ab-4290-9d86-22bd1aa9cfed` (우선 사용). 다른 워크스페이스면 이름 "디딤 블로그 콘텐츠"로 찾고, 없으면 아래 스키마로 생성을 **제안**만 한다.
> - 상위 페이지: "DIDIM 블로그 운영"(비공개). 관계 열 "상담" ↔ "디딤 블로그 상담".경유 글
> - 커넥터가 없으면 바꿀 값을 표로 출력하고 사용자에게 붙여넣기를 요청한다.

## 1. 속성 (이름·타입·선택지 그대로)

| 속성 | 타입 | 선택지 / 규칙 |
|---|---|---|
| 제목 | title | |
| 상태 | select | `S0 기획중` / `S1 초안완료` / `S2 검토완료` / `S3 발행예정` / `S4 발행완료` / `S5 성과측정` (쓸 때 이 문자열 그대로) |
| 카테고리 | select | `지원사업·인증과 특허` / `출원·심판 실무` / `사례` / `지식재산 경영` / `디딤 소식` / `디딤 다이어리` / `레거시` |
| 레거시 2차 분류 | select | 카테고리=레거시일 때 원래 이름: 절세 시뮬레이션 / 인증 가이드 / 연구소 운영 실무 / 특허·상표 출원 실무 / 특허 전략 노트 / AI와 IP / IP 뉴스 한 입 / 컨설팅 후기 / 디딤 일상 / 대표의 생각 |
| categoryNo | number | 네이버 categoryNo (25·27·26·24·28·17, 레거시는 9~16·18~20·23) |
| 타깃 키워드 | text | |
| 발행예정일 | date | 초안 단계부터 기입하는 화요일 발행 예정일. SLA 마감일 역산·캘린더 기준(마감일 자체는 저장 안 함) |
| 발행일 | date | **실제 발행 후에만** 기입(S4 전이 시) |
| 발행 URL | url | S4 전이 시 네이버 글 URL |
| 추천 소스 | select | `키워드 풀` / `뉴스` / `지원매치 리포트` / `로테이션` / `직접 입력` (didim-blog-planner) |
| 추천 피드백 | select | `대기` / `적합` / `부적합` |
| 부적합 사유 | text | |
| 조회수(최근) | number | 최근 측정 조회수 (didim-blog-performance) |
| 유입 키워드 TOP3 | text | 쉼표 구분 |
| 댓글 수 | number | |
| 성과 갱신일 | date | 조회수·댓글·유입 키워드를 갱신한 날 |
| 시리즈 | text | 시리즈명 (didim-blog-health) |
| 시리즈 회차 | number | |
| 마지막 업데이트일 | date | 발행 후 내용을 갱신한 날 (건강 점검 기준일) |
| 메모 | text | 검수·전이 사유·이웃 추가 등 이력. 형식은 §3 |
| 상담 | relation | "디딤 블로그 상담" DB 의 경유 글과 양방향 |

본문·태그는 DB 속성이 아니다. 본문은 페이지 내용(또는 대화로 받은 초안)이고 태그는 발행 준비 결과(didim-blog-publish-prep)에서 받는다. 스크립트 입력 JSON 에서는 `본문`/`body`, `태그`/`tags` 키로 넣는다.

## 2. 원본 contents 컬럼 → Notion 매핑

| contents 컬럼 (마이그레이션) | Notion | 비고 |
|---|---|---|
| id (001) | (없음) | 페이지 자체가 식별자. 필요하면 `W{주차}-{순번}` 을 메모에 |
| title (001) | 제목 | |
| category_id, secondary_category (001) | 카테고리 + categoryNo (+ 레거시 2차 분류) | CAT-* 는 레거시 별칭(CAT-A-01→10 절세 시뮬레이션 …) |
| target_keyword (001) | 타깃 키워드 | |
| target_audience (001) | (없음) | 메모 |
| status (001) | 상태 | 값 `S{n} {라벨}` |
| publish_date (001) | 발행예정일 | |
| briefing_due·draft_due·review_due·image_due·publish_due (001) | (없음) | 발행예정일에서 계산 (scripts/sla.py) |
| briefing_done_at·draft_done_at·review_done_at·image_done_at (001) | (없음) | 상태로 추정(S1↑·S2↑·S3↑) |
| published_at (001) | 발행일 | 실제 발행일 |
| revision_count (001) | (없음) | 메모의 `[수정 요청]` 개수 |
| author_id·reviewer_id·designer_id (001) | (없음) | 1인 운영 |
| views_1w·views_1m (001) | 조회수(최근) | 최근값 하나만 |
| avg_duration_sec·search_rank·cta_clicks (001) | (없음) | 측정 최소화 |
| quality_score_1st·quality_score_final·quality_grade (001) | (없음) | 필요 시 계산만 (didim-blog-performance) |
| notes (001) | 메모 | |
| created_at·updated_at (001) | (Notion 생성·편집 일시) | |
| body (007) | 페이지 본문 | |
| is_deleted (007) | (페이지 휴지통) | |
| tags·seo_keywords·image_alt_texts·seo_score (007) | (없음) | 발행 준비·SEO 스킬 결과로 대체 |
| scheduled_at (007) | 발행예정일 | 화 09:00 고정 |
| health_status·health_checked_at (007) | 마지막 업데이트일 | 건강 상태는 저장하지 않고 매번 계산 |
| series_id·series_order (007) | 시리즈·시리즈 회차 | |
| ai_generation_id·is_ai_generated·ai_edited_by·ai_edit_ratio (002/007) | (없음) | |
| review_status·review_memo (012/014) | 메모 | `[검수 승인]`/`[수정 요청]`/`[재검수 요청]` 기록으로 복원 |
| (notes 의 [네이버 URL]) | 발행 URL | |
| (content_recommendations 010) | 추천 소스·추천 피드백·부적합 사유 | |
| (post_metrics 명세: top_keywords·comments) | 유입 키워드 TOP3·댓글 수·성과 갱신일 | |

## 3. 메모 기록 형식 (원본 notes 메타 형식 유지)
```
── 2026-10-03 10:00 (S2) ──
[검수 승인] 체크: numbers, law, tone (2026-10-03)
[수정 요청] 3문단 숫자 근거 보강 (1회차, 2026-10-02)
[재검수 요청] (2026-10-02)
[전이 사유] 관리자 강제 전환 (조건 미충족)
[역행 전이 사유] 팩트 오류 발견
[성과 1주차] 조회수 320 · 댓글 4 · 이웃 +2 · 상담 유입
```

## 4. Notion 에서의 상태 전이 절차
1. data source 로 대상 행을 찾는다(제목 검색). 현재 `상태`, `카테고리`/`categoryNo`, `발행예정일`, `발행일`, `메모` 를 읽고, 본문·태그는 페이지 내용/대화에서 받는다.
2. 행을 JSON(한글 속성명 그대로 가능)으로 만들어 `scripts/transition_check.py check --to <목표>` 실행.
3. `kind` 처리: `blocked` 중단 / `blocked_required` 필수 목록 제시 후 중단(명시적 "강제" 요청 시만 진행·메모 기록) / `confirm_recommended` 확인 후 진행 / `needs_reason` 사유 받아 진행 / `ok` 진행.
4. 진행 시 결과의 `notion_update` 를 그대로 쓴다: `상태` = `S{n} {라벨}`. S4 는 `발행일`(실제 발행일, `발행예정일`은 그대로 둔다)·`발행 URL`. S5 는 `조회수(최근)`·`댓글 수`·`유입 키워드 TOP3`·`성과 갱신일` (didim-blog-performance).
5. 메모에 §3 형식으로 한 블록 덧붙인다(기존 메모를 지우지 않는다).
6. 쓰기 실패 시 실패 속성과 오류를 보여주고 "반영할 값" 표를 준다.
