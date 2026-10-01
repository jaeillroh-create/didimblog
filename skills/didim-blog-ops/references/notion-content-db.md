# Notion DB "디딤 블로그 콘텐츠" 필드 정의

> 백오피스 `contents` 테이블 컬럼 전체를 Notion 속성으로 옮긴 표. 컬럼 출처: 001_initial_schema.sql(기본),
> 002_ai_engine.sql·007_contents_columns.sql(본문·태그·건강·시리즈·AI), 012_review_columns.sql·014(검수).
> 009_phase_pipeline.sql 은 `ai_generations` 테이블만 바꾸며 contents 컬럼은 추가하지 않는다.
> 스킬은 DB 를 **만들지 않는다**. 이미 있으면 이 이름으로 읽고 쓰고, 없으면 사용자에게 붙여넣기를 요청한다.

## 1. 필드 표

| # | contents 컬럼 (출처) | Notion 속성명 | Notion 타입 | 값/규칙 |
|---|---|---|---|---|
| 1 | id (001) | 콘텐츠 ID | 텍스트 | `W{주차2자리}-{순번2자리}` (scripts/sla.py content-id) |
| 2 | title (001) | 제목 | 제목(title) | |
| 3 | category_id (001) | 1차 카테고리 | 선택 | 변리사의 현장 수첩(CAT-A) / IP 라운지(CAT-B) / 디딤 다이어리(CAT-C) / 디딤 소개(CAT-INTRO) / 상담 안내(CAT-CONSULT) |
| 4 | secondary_category (001) | 2차 분류 | 선택 | 절세 시뮬레이션·인증 가이드·연구소 운영 실무·AI와 IP·특허 전략 노트·IP 뉴스 한 입·컨설팅 후기·디딤 일상·대표의 생각 (명칭은 didim-blog-core 기준) |
| 5 | target_keyword (001) | 타겟 키워드 | 텍스트 | |
| 6 | target_audience (001) | 타깃 고객군 | 선택 | startup(스타트업) / sme(중소기업) / cto |
| 7 | status (001) | 상태 | 선택 | S0 기획중 / S1 초안완료 / S2 검토완료 / S3 발행예정 / S4 발행완료 / S5 성과측정 |
| 8 | publish_date (001) | 발행예정일 | 날짜 | 화요일. 기본값 = 다음 화요일 |
| 9 | briefing_due (001) | SLA D-5 주제선정 마감 | 날짜 | 발행일 −5일(목) |
| 10 | draft_due (001) | SLA D-3 초안 마감 | 날짜 | 발행일 −3일(토) |
| 11 | review_due (001) | SLA D-2 검수 마감 | 날짜 | 발행일 −2일(일) |
| 12 | image_due (001) | SLA D-1 이미지 마감 | 날짜 | 발행일 −1일(월) |
| 13 | publish_due (001) | SLA D-0 발행 마감 | 날짜 | 발행일(화) |
| 14 | briefing_done_at (001) | 주제선정 완료일시 | 날짜(시간 포함) | 원본 코드는 기록하지 않음 → 스킬은 브리핑 완료 시 기록 |
| 15 | draft_done_at (001) | 초안 완료일시 | 날짜(시간) | S1 전이 시 자동 |
| 16 | review_done_at (001) | 검토 완료일시 | 날짜(시간) | 검수 승인 시 + S2 전이 시 갱신 |
| 17 | image_done_at (001) | 이미지 완료일시 | 날짜(시간) | 원본은 S3 전이 시각을 기록 |
| 18 | published_at (001) | 발행일시 | 날짜(시간) | S4 전이 시 입력값(기본 현재) |
| 19 | revision_count (001) | 수정 요청 횟수 | 숫자 | 수정 요청마다 +1. 3 이상이면 S2→S1 역행 경고 |
| 20 | author_id (001) | 작성자 | 사람 | |
| 21 | reviewer_id (001) | 검수자 | 사람 | 승인/수정요청한 사람 |
| 22 | designer_id (001) | 디자이너 | 사람 | |
| 23 | views_1w (001) | 1주 조회수 | 숫자 | 상세 성과는 "디딤 블로그 성과" DB |
| 24 | views_1m (001) | 1개월 조회수 | 숫자 | |
| 25 | avg_duration_sec (001) | 평균 체류시간(초) | 숫자 | |
| 26 | search_rank (001) | 검색 순위 | 숫자 | |
| 27 | cta_clicks (001) | CTA 클릭 | 숫자 | 원본 S5 모달은 '댓글 수'를 이 컬럼에 저장(오매핑) — Notion 에서는 댓글은 성과 DB 에 |
| 28 | quality_score_1st (001) | 품질점수 1차 | 숫자 | 발행 후 2주 |
| 29 | quality_score_final (001) | 품질점수 최종 | 숫자 | 발행 후 4주 |
| 30 | quality_grade (001) | 품질 등급 | 선택 | excellent 80+ / good 60~79 / average 40~59 / poor 20~39 / critical 0~19 |
| 31 | notes (001) | 메모 | 텍스트 | 원본은 네이버 URL·성과·역행 사유를 이곳에 `── YYYY-MM-DD HH:MM (S4) ──` 블록으로 누적 |
| 32 | created_at (001) | 생성일시 | 생성 일시(자동) | |
| 33 | updated_at (001) | 수정일시 | 최종 편집 일시(자동) | |
| 34 | body (007) | 본문 | 페이지 본문 | 속성이 아니라 페이지 내용으로 저장 |
| 35 | is_deleted (007) | 삭제됨 | 체크박스 | 소프트 삭제. 발행완료 글 삭제 시 "네이버 블로그에서도 별도로 삭제해야 합니다." 경고 |
| 36 | tags (007) | 태그 | 다중 선택 | 10개 (핵심3+연관3+브랜드2+롱테일2) |
| 37 | seo_keywords (007) | SEO 키워드 | 텍스트 | |
| 38 | scheduled_at (007) | 예약 발행 일시 | 날짜(시간) | 화요일 09:00 |
| 39 | seo_score (007) | SEO 점수 | 숫자 | didim-blog-seo 결과 |
| 40 | image_alt_texts (007) | 이미지 ALT | 텍스트 | 줄바꿈 구분 |
| 41 | health_status (007) | 건강 상태 | 선택 | HEALTHY 정상 / CHECK_NEEDED 점검 필요 / UPDATE_NEEDED 업데이트 필요 / UPDATED 업데이트 완료 (didim-blog-health) |
| 42 | health_checked_at (007) | 건강 점검일 | 날짜(시간) | |
| 43 | series_id (007) | 시리즈 | 선택 | 시리즈명 (series 테이블 대체) |
| 44 | series_order (007) | 시리즈 순번 | 숫자 | |
| 45 | ai_generation_id (002/007) | AI 생성 ID | 텍스트 | 스킬 환경에서는 "Claude 초안" 등 메모용 |
| 46 | is_ai_generated (002/007) | AI 생성 여부 | 체크박스 | |
| 47 | ai_edited_by (002/007) | AI 초안 편집자 | 사람 | |
| 48 | ai_edit_ratio (002/007) | AI 수정 비율 | 숫자 | |
| 49 | review_status (012/014) | 검수 상태 | 선택 | pending 미검수 / approved 승인 / revision_requested 수정 요청 |
| 50 | review_memo (012/014) | 검수 메모 | 텍스트 | 승인 시 `[검수 승인] 체크: …`, 수정요청 시 요청 내용 |
| 51 | (notes 의 `[네이버 URL]`) | 네이버 URL | URL | 스킬에서 별도 속성으로 분리(원본은 notes 접두어) |
| 52 | (series.total_planned) | 시리즈 계획 편수 | 숫자 | 같은 시리즈 행에 같은 값 |

## 2. Notion 에서의 상태 전이 절차

1. 대상 페이지를 "콘텐츠 ID" 또는 제목으로 찾는다. 현재 `상태` 값을 읽는다.
2. 페이지 속성을 contents 컬럼명 JSON 으로 바꿔 `scripts/transition_check.py check --to <목표>` 를 실행한다(본문은 `body`, 태그는 `tags` 배열).
3. 결과 `kind` 에 따라:
   - `blocked` → 허용되지 않은 전이. 변경하지 않고 이유를 알린다.
   - `blocked_required` → 필수 미충족 목록을 보여주고 중단. 사용자가 "강제 전환"을 명시하면 진행하고 메모에 `[전이 사유] 관리자 강제 전환 (조건 미충족)` 기록.
   - `confirm_recommended` → 권장 미충족 목록을 보여주고 "그대로 진행할까요?" 확인 후 진행.
   - `needs_reason` (역행) → 되돌리기 사유를 받아 메모에 `[역행 전이 사유] …` 기록 후 진행.
   - `ok` → 진행.
4. 진행 시 `updates_on_transition` 의 필드(상태·완료일시)를 Notion 속성에 쓰고, S4 는 네이버 URL·발행일시, S5 는 "디딤 블로그 성과" DB 에 1주차 성과 행을 추가한다.
5. 메모(notes)에 `── YYYY-MM-DD HH:MM (상태) ──` 블록으로 사유·URL·성과 요약을 덧붙인다(원본 notes 메타 형식).
6. Notion 커넥터가 없으면 위 변경 내용을 표로 출력해 사용자가 직접 반영하게 한다.
