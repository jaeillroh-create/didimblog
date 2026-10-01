# 건강 점검·내부 링크·시리즈가 쓰는 Notion 속성

> Notion "디딤 블로그 콘텐츠" — data source `collection://463bc815-11ab-4290-9d86-22bd1aa9cfed`
> (https://app.notion.com/p/4f21a8b7e84d4c818de1c673ed9cbbcb, 상위 "DIDIM 블로그 운영"). 다른 워크스페이스면 이름으로 찾고, 없으면 생성을 제안만 한다.
> 커넥터가 없으면 사용자가 표를 붙여넣게 하고, 바꿀 값은 표로 돌려준다.

| Notion 속성 | 타입 | 이 스킬에서의 쓰임 | 원본 컬럼 |
|---|---|---|---|
| 제목 | title | 식별·내부 링크 표시·제목 키워드 매칭 | title |
| 상태 | select (`S4 발행완료`, `S5 성과측정` …) | 점검 대상 = S4·S5 | status |
| 카테고리 | select (지원사업·인증과 특허 / 출원·심판 실무 / 사례 / 지식재산 경영 / 디딤 소식 / 디딤 다이어리 / 레거시) | 점검 주기·같은 카테고리 판정 | category_id |
| 2차 분류 | select | 카테고리=레거시일 때 원래 이름 → 신규 카테고리로 합산, 같은 2차 분류 판정 | secondary_category |
| categoryNo | number | 카테고리 정본 ID | (없음) |
| 타깃 키워드 | text | 키워드 커버리지·내부 링크 키워드 매칭 | target_keyword |
| 발행일 | date | 실제 발행일 = 경과일 기준 | published_at |
| 발행예정일 | date | (발행일 없을 때 대체) | publish_date |
| 마지막 업데이트일 | date | 글을 고친 날. 발행일보다 늦으면 경과일 기준 | health_checked_at / health_status=UPDATED |
| 조회수(최근) | number | 내부 링크 '인기글' 가점(>500) | views_1m |
| 발행 URL | url | 추천 링크 주소 | notes 의 [네이버 URL] |
| 시리즈 | text | 시리즈명 | series_id (series.name) |
| 시리즈 회차 | number | 편 번호 | series_order |
| 메모 | text | 점검 결과·확인 기록 | notes |

- 건강 상태(HEALTHY/CHECK_NEEDED/UPDATE_NEEDED/UPDATED)와 점검일은 저장하지 않는다. 매번 계산하고, 글을 고쳤으면 `마지막 업데이트일`을 오늘로 쓴다.
- 시리즈 계획 편수(series.total_planned)는 DB 열이 없다 → 사용자에게 받는다(필요하면 메모에 "계획 5편" 기록).
- 키워드 풀(keyword_pool)·순위(keyword_rankings)는 Notion 에 없다 → 사용자 목록 또는 `scripts/keyword_coverage.py seed`(UPGRADE_SPEC §4.4 시드).
- 본문은 DB 속성이 아니다(페이지 내용). 법률 키워드 검사에 본문이 필요하면 페이지를 읽거나 사용자에게 받는다.
