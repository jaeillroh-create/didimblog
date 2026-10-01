# 성과·상담·키워드 순위 Notion 속성과 원본 컬럼 매핑

> skills/_DECISIONS.md §4·§6·§7 기준 실제 스키마. 별도 "성과" DB 는 없다 — 성과는 콘텐츠 DB 의 최근 성과 열에 둔다.
> 다른 워크스페이스면 이름으로 찾고, 없으면 생성을 제안만 한다. 커넥터가 없으면 표로 출력하고 붙여넣기를 요청한다.
> **메모 열은 사람 자유 기록 전용 — 스킬은 쓰지 않는다.**

## 1. "디딤 블로그 콘텐츠" 성과 열 — `collection://463bc815-11ab-4290-9d86-22bd1aa9cfed`

| Notion 속성 | 타입 | 원본 | 규칙 |
|---|---|---|---|
| 조회수(최근) | number | contents.views_1w·views_1m, content_metrics.views, post_metrics.views(명세) | 가장 최근 측정값 하나. 덮어쓴다 |
| 유입 키워드 TOP3 | text | post_metrics.top_keywords(명세, 미구현) | 쉼표 구분 최대 3개 |
| 댓글 수 | number | post_metrics.comments(명세). 원본 S5 모달은 이 값을 contents.cta_clicks 에 저장(오매핑) | |
| 성과 갱신일 | date | content_metrics.measured_at, post_metrics.recorded_date | 측정한 날(KST) |
| 상태 | select | contents.status | 성과 첫 입력과 함께 `S5 성과측정` (발행 후 7일 이상일 때, didim-blog-ops 판정) |
| 상담 | relation ↔ 상담 DB "경유 글" | leads.source_content_id | 전환 기여 집계 |
| 키워드 | relation ↔ 키워드 DB "발행 글" | — | |
| 발행일·발행 URL·카테고리·제목 | | | 집계·표시용 |

저장하지 않는 원본 지표: avg_duration_sec(평균 체류시간), search_rank, cta_clicks, quality_score_*, quality_grade, post_metrics.neighbor_adds(이웃 추가), category_metrics 전체. 필요하면 대화에서 계산·보고만 한다(_DECISIONS.md §4 '측정 최소화').

## 2. "디딤 블로그 상담" — `collection://e1272822-7efd-4850-b8c8-cfce02db7d00`

| Notion 속성 | 타입 / 선택지 | 원본 leads 컬럼 | 매핑 |
|---|---|---|---|
| 회사명 | title | company_name | 필수(공백 금지) |
| 상담일 | date | contact_date | 기본 오늘 |
| 유입 경로 | select: 블로그 / 지원매치 / 특허인증센터 / 소개 / 기타 | source (blog/referral/other) | blog→블로그, referral→소개, other→기타. 지원매치·특허인증센터는 신규 |
| 경유 글 | relation ↔ 콘텐츠 DB "상담" | source_content_id | 유입 경로=블로그일 때만 (원본 규칙) |
| 관심 서비스 | multi_select: 출원·심판 / 지원사업 가점용 특허·인증 / 절세·연구소 / 기타 | interested_service (단일) | patent→출원·심판, venture_cert·invention_cert→지원사업 가점용 특허·인증, tax_consulting·lab_management→절세·연구소, other→기타 |
| 상태 | select: 신규 / 진행 중 / 제안 / 계약 / 보류 / 종료 | visitor_status S3/S4/S5 + consultation_result | 신규=S3 / 진행 중(consulted)·제안(proposal_sent)·보류(pending)·종료(lost)=S4 / 계약=S5 |
| 계약 여부 | checkbox | contract_yn | |
| 계약 금액 | number (원) | contract_amount | |
| 메모 | text | notes | 사람 기록. 담당자명·연락처(contact_name·contact_info)는 열이 없어 입력 시 메모에 함께 적는다 |
| (없음) | | assigned_to, created_at, updated_at | 1인 운영 / Notion 자동 |

## 3. "디딤 블로그 키워드" 순위 열 — `collection://4e0fae54-aeb3-48dd-b948-b78886a8e859`

| Notion 속성 | 타입 | 원본 | 규칙 |
|---|---|---|---|
| 키워드 | title | keyword_pool.keyword | |
| 현재 순위 | number | keyword_rankings.rank | 네이버 통합검색 블로그 탭 순위, 없으면 비움(null) |
| 순위 확인일 | date | keyword_rankings.month(YYYY-MM-01) | 실제 확인한 날 |
| 우선순위 | select: 높음 / 보통 / 낮음 | keyword_pool.priority HIGH/MEDIUM/LOW | 원본 추적 대상은 HIGH 만 |
| 매출 가중치 | number 1~5 | — | 정렬 참고 |

월별 이력 행은 없다. 순위를 갱신하면 이전 `현재 순위`는 덮어쓰므로, 변동(이전 − 새 순위)은 그때 보고에 남긴다.
