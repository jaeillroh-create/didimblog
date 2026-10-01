# 건강 점검·내부 링크·시리즈·키워드 커버리지가 쓰는 Notion 속성

> skills/_DECISIONS.md §6·§7 (2026-10-01 확장본) 기준 실제 스키마. 커넥터가 없으면 사용자가 표를 붙여넣게 하고, 바꿀 값은 표로 돌려준다.
> 다른 워크스페이스면 이름으로 찾고, 없으면 생성을 제안만 한다. **메모 열은 사람 자유 기록 전용 — 스킬은 쓰지 않는다.**

## 1. "디딤 블로그 콘텐츠" — `collection://463bc815-11ab-4290-9d86-22bd1aa9cfed`

| Notion 속성 | 타입 / 선택지 | 이 스킬에서의 쓰임 | 원본 컬럼 |
|---|---|---|---|
| 제목 | title | 식별·링크 표시·제목 키워드 매칭 | title |
| 상태 | select (`S4 발행완료`, `S5 성과측정` …) | 점검 대상 = S4·S5 | status |
| 카테고리 | select (지원사업·인증과 특허 / 출원·심판 실무 / 사례 / 지식재산 경영 / 디딤 소식 / 디딤 다이어리 / 레거시) | 점검 주기·같은 카테고리 판정 | category_id |
| 2차 분류 | select (레거시 2차 + 다이어리 하위) | 레거시 글 합산, 같은 2차 분류 판정 | secondary_category |
| categoryNo | number | 카테고리 정본 ID | (없음) |
| 타깃 키워드 | text | 커버리지 자동 매칭·링크 키워드 매칭 | target_keyword |
| 태그 | text (쉼표 10개) | 링크 공통 태그 가점·커버리지 태그 매칭 | tags |
| 발행일 | date | 실제 발행일 = 경과일 기준 | published_at |
| 발행예정일 | date | (발행일 없을 때 대체) | publish_date |
| 마지막 업데이트일 | date | 글을 고친 날. 발행일보다 늦으면 경과일 기준 | health_checked_at / UPDATED |
| **건강 상태** | select: 정상 / 업데이트 필요 / 법률 변경 확인 | 점검 결과 기록 | health_status |
| 조회수(최근) | number | 링크 '인기글' 가점(>500) | views_1m |
| 발행 URL | url | 추천 링크 주소 | notes 의 [네이버 URL] |
| 시리즈 | text | 시리즈명 | series_id → series.name |
| 시리즈 회차 | number | 편 번호 | series_order |
| 키워드 | relation ↔ 키워드 DB "발행 글" | 글-키워드 연결 | keyword_pool.covered_content_id |
| (페이지 `## 본문`) | 본문 | 법률 키워드 검사·링크 본문 매칭 | body |

건강 상태 값 매핑(스킬 정의): UPDATE_NEEDED → 업데이트 필요 / 경과일 기준 CHECK_NEEDED → 업데이트 필요 / 법률 키워드만으로 CHECK_NEEDED·법률 변경 뉴스 영향 → 법률 변경 확인 / HEALTHY·UPDATED → 정상.

## 2. "디딤 블로그 키워드" — `collection://4e0fae54-aeb3-48dd-b948-b78886a8e859` (키워드 풀 정본)

| Notion 속성 | 타입 / 선택지 | 쓰임 | 원본 컬럼 |
|---|---|---|---|
| 키워드 | title | | keyword |
| 카테고리 | select (신규 5개: 지원사업·인증과 특허 / 출원·심판 실무 / 사례 / 지식재산 경영 / 디딤 소식) | 카테고리별 커버리지 | category_id |
| 주제 축 | text (레거시 2차 분류 또는 주제 묶음) | 그룹 보조 | sub_category_id |
| 매출 가중치 | number 1~5 (수임 연결도) | 미커버 다음 작성 순서(높은 순) | (priority 의 의미) |
| 우선순위 | select: 높음 / 보통 / 낮음 | HIGH/MEDIUM/LOW | priority |
| 커버리지 | select: 미작성 / 작성됨 / 재작성 필요 | 커버 판정·갱신 | covered_content_id 유무 |
| 현재 순위·순위 확인일 | number·date | didim-blog-performance 영역 | keyword_rankings |
| 발행 글 | relation ↔ 콘텐츠 DB "키워드" | 커버한 글 | covered_content_id |
| 메모 | text | 사람 전용 | — |

## 3. 저장하지 않는 것
- 시리즈 계획 편수(series.total_planned): 열이 없다 → 사용자에게 받는다.
- 점검일(health_checked_at): 건강 상태를 쓴 날은 따로 두지 않는다. 글을 고친 날만 `마지막 업데이트일`.
