# didim-blog-health — 글 관리(건강 점검·법률 변경 감지·내부 링크·시리즈·키워드 커버리지)

## 1. 기능 개요 (한 문단)
이미 발행한 디딤 블로그 글을 관리한다. 발행(또는 마지막 업데이트) 후 경과일과 카테고리별 기준(전환형 60/90일 등), 법률·세무 키워드 포함 여부로 '점검 필요/업데이트 필요'를 판정하고, 법 개정 뉴스와 같은 법률 키워드를 가진 기존 글을 찾는다. 작성 중인 글에는 카테고리·2차 분류·타깃 키워드·태그·인기도 점수로 내부 링크 상위 5개를 추천하고, 시리즈물의 진행률·다음 회차와 키워드 풀 대비 발행 커버리지(우선순위별)를 계산한다. 백오피스 DB 대신 Notion "디딤 블로그 콘텐츠" DB 또는 사용자 입력을 쓴다.

## 2. 원본 코드 위치 (파일:함수/상수 목록)
| 파일 | 함수/상수 |
|---|---|
| src/lib/content-health.ts:6-12 | THRESHOLDS (CAT-A 60/90, CAT-B 90/120, CAT-C 120/180), DEFAULT_THRESHOLD 90/120 |
| src/lib/content-health.ts:16-29 | LEGAL_KEYWORDS (12개) |
| src/lib/content-health.ts:46-111 | checkContentHealth |
| src/lib/content-health.ts:115-127 | HEALTH_STATUS_LABELS, HEALTH_STATUS_COLORS |
| src/lib/internal-link-recommender.ts:15-72 | calculateRelevance |
| src/lib/internal-link-recommender.ts:76-106 | recommendInternalLinks |
| src/lib/recommendation-engine.ts:92-98 | getPrimaryCategoryId |
| src/actions/manage.ts:10-49 | runHealthCheck |
| src/actions/manage.ts:53-74 | updateHealthStatus |
| src/actions/manage.ts:78-122 | getHealthCheckContents |
| src/actions/manage.ts:126-163 | getInternalLinkSuggestions |
| src/actions/manage.ts:167-280 | getSeriesList, createSeries, deleteSeries, assignContentToSeries |
| src/actions/manage.ts:284-355 | KeywordCoverageItem, getKeywordCoverage |
| src/actions/keywords.ts:8-42 | getKeywordPool, getHighKeywords |
| src/actions/recommendations.ts:619-671 | getUpdateNeededPosts (대시보드) |
| src/actions/recommendations.ts:161-189, 899-937 | HIGH 미커버 우선('매출 가중치 HIGH'), pickWeightedKeyword(50/30/20) |
| src/components/manage/health-check-tab.tsx, series-tab.tsx, keyword-coverage-tab.tsx | 요약 문구, 진행률, 커버리지 %·색상 |
| src/components/contents/health-banner.tsx, internal-links-panel.tsx | 상세 배너, 링크 패널(제목 복사) |
| supabase/migrations/006_missing_tables.sql:7-66, 007:12-15 | keyword_pool, keyword_rankings, series, health_status·health_checked_at·series_id·series_order |
| docs/UPGRADE_SPEC.md:50-58, 100-110, 215-273, 701-707 | §1.3 글 건강 상태, §2.4 점검 플로우, §4.4~4.6, Sprint 6 |
| skills/_DECISIONS.md §1·§2·§4·§6 | 카테고리 정본, 업데이트 주기 매핑(전환형 3개=60일), Notion 스키마 |

## 3. 입력
- 콘텐츠 목록(JSON): contents 컬럼명 또는 Notion 한글 속성명(제목·상태·카테고리·2차 분류·categoryNo·타깃 키워드·발행일·발행예정일·마지막 업데이트일·조회수(최근)·발행 URL·시리즈·시리즈 회차), 본문(페이지 내용), 태그(선택).
- 기준 시각(now).
- 법률 변경: 뉴스 제목/요약 텍스트 또는 [{title, description}] 배열.
- 내부 링크: 기준 글(ID/제목 또는 JSON), 최대 개수(기본 5).
- 시리즈: [{name 또는 id, total_planned, created_at}].
- 키워드 풀: Notion 키워드 DB 행(키워드·카테고리·주제 축·매출 가중치·우선순위·커버리지·발행 글) 또는 [{id, keyword, category_id, sub_category_id, priority, covered_content_id}] (없으면 UPGRADE_SPEC §4.4 시드 19개).

## 4. 처리 규칙
1. 건강 점검 대상은 status='S4'·is_deleted=false·published_at 있음 (manage.ts:17-22, 85-91).
2. 경과일 = floor((now − published_at)/1일), 마지막 점검 경과일 = floor((now − health_checked_at)/1일) (content-health.ts:52-65).
3. 1차 카테고리(getPrimaryCategoryId: CAT-A-01→CAT-A)의 임계값으로, 경과일 ≥ update 이면 UPDATE_NEEDED("발행 후 N일 경과 (업데이트 권장 U일)"), 아니면 ≥ check 이면 CHECK_NEEDED("… (점검 권장 C일)") (content-health.ts:68-78).
4. 제목+본문+타깃 키워드에 LEGAL_KEYWORDS 가 하나라도 있고 경과일 ≥ 30 이면, HEALTHY 를 CHECK_NEEDED 로 올리고 "법률/세무 키워드 포함: …" 이유를 추가한다 (81-92).
5. 현재 health_status 가 UPDATED 이면 권장 상태를 HEALTHY 로, 이유를 "최근 업데이트 완료" 하나로 바꾼다 (95-99).
6. 목록은 UPDATE_NEEDED → CHECK_NEEDED → HEALTHY → UPDATED 순 정렬 (manage.ts:104-115). '전체 헬스체크'는 권장≠현재인 글의 health_status 와 health_checked_at=now 를 갱신한다 (manage.ts:32-42). '업데이트 완료' 버튼은 health_status=UPDATED, health_checked_at=now (manage.ts:53-74; health-banner.tsx:30-38).
7. 화면 요약: "발행 글 {전체}개 중 {CHECK_NEEDED+UPDATE_NEEDED}개 점검 필요" (health-check-tab.tsx:76-86). 배너: UPDATE_NEEDED "이 글은 업데이트가 필요합니다. 내용을 검토하고 최신 정보로 수정해주세요.", CHECK_NEEDED "이 글은 점검이 필요합니다. 내용이 최신 상태인지 확인해주세요." (health-banner.tsx:61-63).
8. 대시보드 '업데이트 필요 글': S4·미삭제·발행일 있음, 발행일 오름차순, 경과일 ≥ (CAT-A 60, 그 외 90) 또는 health_status ∈ {CHECK_NEEDED, UPDATE_NEEDED}, 최대 5건 (recommendations.ts:619-664).
9. 내부 링크 후보: 자기 자신 제외, 미삭제, status S4/S5 (internal-link-recommender.ts:80-88). 점수: 같은 1차 카테고리 +20 (27), 같은 2차 분류 +15 (36), 소문자 비교로 타깃 키워드 동일 +30 / 아니면 상대 제목에 포함 +25 / 아니면 상대 본문에 포함 +15 (40-54), 공통 태그 수×10 (57-63), 상대 views_1m > 500 이면 +10 (66-69). 0점 제외, 내림차순, 상위 5개 (101-103). 이유는 쉼표로 연결.
10. 시리즈: 등록 수 = series_id 일치·미삭제 글 수, 발행 수 = 그중 status='S4' (manage.ts:185-205). 진행률 = round(발행/계획×100), 계획 0 이면 0, 막대 폭 최대 100% (series-tab.tsx:126-166). 시리즈 삭제 시 소속 글의 series_id·series_order 를 비운다 (manage.ts:242-246).
11. 키워드 커버리지: keyword_pool 을 priority 오름차순(텍스트 정렬: HIGH, LOW, MEDIUM) → category_id 오름차순으로 읽고, covered_content_id 가 가리키는 글이 있으면 커버 (manage.ts:297-334). 통계 total/covered/uncovered (336-345). 커버리지 % = round(covered/total×100), 막대 색 80% 이상 success·50% 이상 brand·그 외 빨강 (keyword-coverage-tab.tsx:47-91). 카테고리별 그룹 "(커버/전체)" 표시.
12. '매출 가중치'는 keyword_pool.priority 이다. 추천은 HIGH 미커버를 먼저 쓰고("키워드 '…' 미발행 (매출 가중치 HIGH)") (recommendations.ts:161-189), 가중 샘플링 확률은 HIGH 50%·MEDIUM 30%·LOW 20% (899-937).

## 5. 출력
- check: results[{contentId, title, currentStatus, recommendedStatus, recommendedLabel, daysSincePublish, daysSinceLastCheck, reasons, hasLegalKeywords, legalKeywordsFound, threshold, elapsed_from, category}], summary, auto_updates_runHealthCheck.
- update-needed: posts[≤5]{id, title, publishedAt, daysSincePublish, categoryId, threshold}.
- legal-news: news_legal_keywords, affected_posts[{title, matched, recommended_health_status}].
- internal_links: suggestions[{contentId, url, title, relevanceScore, reason, categoryId}].
- series: [{name, total_planned, contentCount, publishedCount, progress_percent, label, episodes, next_episode_order, unpublished_registered}].
- coverage: stats, coverage_percent, color_band, by_category, by_priority, auto_match_updates.
- 사용자 응답: 표 + 요약 + 다음 행동, Notion 반영 내역(마지막 업데이트일·메모).

## 6. 예외·오류 처리
- 원본 서버 액션은 실패 시 빈 결과와 한국어 오류("헬스체크 실행에 실패했습니다.", "내부 링크 추천에 실패했습니다.", "시리즈 목록을 불러오지 못했습니다.", "키워드 커버리지 데이터를 불러올 수 없습니다.")를 돌려준다 (manage.ts 각 catch). 스킬은 Notion 조회 실패 시 같은 취지로 알리고 붙여넣기를 요청한다.
- 시리즈 이름 공백 → "시리즈 이름을 입력해주세요." (series-tab.tsx:28-30).
- 발행일 없는 글은 점검 대상에서 빠진다. 키워드 풀이 비면 coverage 는 0/0, 0%.
- 기준 글을 못 찾으면 internal_links.py 가 오류 JSON 과 종료 코드 1.
- 계획 편수 미입력 시리즈는 planned_missing=true, 진행률 0 → 사용자에게 계획 편수를 묻는다.

## 7. 데이터 저장 (백오피스 테이블 → 스킬에서의 대체)
Notion "디딤 블로그 콘텐츠" (`collection://463bc815-11ab-4290-9d86-22bd1aa9cfed`)와 "디딤 블로그 키워드" (`collection://4e0fae54-aeb3-48dd-b948-b78886a8e859`, 키워드 풀 정본). 실제 스키마·선택지는 _DECISIONS.md §6·§7. 메모 열은 사람 전용이라 스킬은 쓰지 않는다.

| 백오피스 | Notion 속성 / 대체 | 비고 |
|---|---|---|
| contents.health_status | 콘텐츠 DB 건강 상태 (select: 정상 / 업데이트 필요 / 법률 변경 확인) | UPDATE_NEEDED·경과일 CHECK_NEEDED→업데이트 필요, 법률 키워드만의 CHECK_NEEDED·뉴스 영향→법률 변경 확인, HEALTHY·UPDATED→정상 |
| contents.health_checked_at, health_status=UPDATED | 마지막 업데이트일 (date) | 글을 고친 날. 경과일 기준 |
| contents.published_at / publish_date | 발행일 / 발행예정일 (date) | |
| contents.category_id / secondary_category | 카테고리 + categoryNo / 2차 분류 (select) | 레거시는 신규 카테고리로 합산 |
| contents.target_keyword, tags | 타깃 키워드, 태그 (text) | |
| contents.views_1m | 조회수(최근) (number) | 인기글 가점 |
| contents.notes 의 [네이버 URL] | 발행 URL (url) | |
| contents.series_id → series.name / series_order | 시리즈 (text) / 시리즈 회차 (number) | |
| series.total_planned, created_at | (열 없음) 사용자 입력 | |
| keyword_pool.keyword | 키워드 DB 키워드 (title) | |
| keyword_pool.category_id / sub_category_id | 키워드 DB 카테고리 (신규 5개) / 주제 축 (text) | |
| keyword_pool.priority | 키워드 DB 우선순위 (높음/보통/낮음) + 매출 가중치 (1~5) | |
| keyword_pool.covered_content_id | 키워드 DB 커버리지 (미작성/작성됨/재작성 필요) + 발행 글 (relation ↔ 콘텐츠 DB 키워드) | |
| keyword_rankings | 키워드 DB 현재 순위·순위 확인일 | didim-blog-performance |
| contents.body | 페이지 `## 본문` | 법률 키워드 검사 |

## 8. 원본 코드와 달라진 점
1. **카테고리·기준일 매핑 (결정 사항)**: 원본 임계값은 CAT-A/B/C 키. _DECISIONS.md 에 따라 네이버 categoryNo 로 판정하고 레거시는 합산 카테고리로 바꾼 뒤, 전환형 3개(25·27·26)=CAT-A 값(60/90), 지식재산 경영(24)·디딤 소식(28)=CAT-B 값(90/120), 디딤 다이어리(17)=CAT-C 값(120/180)을 쓴다. 대시보드 단일 기준도 '현장수첩 60·그 외 90' → '전환형 3개 60·그 외 90'. 24·28 을 CAT-B 값에 매핑한 것은 원본 카테고리(IP 라운지)의 흡수 관계에 따른 스킬의 판단이다(확인 필요). 컨설팅 후기(18)는 결정표에 따라 사례(26)로 합산되어 60일 기준을 받는다.
2. **경과일 기준일·상태 값**: 원본은 항상 published_at 기준이라, '업데이트 완료'(UPDATED)를 눌러도 다음 전체 헬스체크에서 HEALTHY 로 바뀐 뒤 또다시 같은 경과일로 플래그가 서는 순환이 생긴다 (manage.ts:32-42 + content-health.ts:95-99). 스킬은 Notion `마지막 업데이트일`이 발행일보다 늦으면 그 날부터 센다. 원본 4단계(HEALTHY/CHECK_NEEDED/UPDATE_NEEDED/UPDATED)는 Notion `건강 상태` 3개 값(정상/업데이트 필요/법률 변경 확인)으로 위 7절 표처럼 매핑해 기록한다(UPDATED 는 마지막 업데이트일로 대체). 점검일(health_checked_at)은 저장하지 않는다.
3. **점검 대상 상태**: 원본은 S4 만 점검한다. Notion 에서 성과 입력 후 S5 로 넘어간 글도 발행 글이므로 스킬 기본은 S4·S5 (`--s4-only` 로 원본 동작). 시리즈 발행 수도 같은 이유로 S4·S5 (`--s4-only`).
4. **법률 변경 감지 추가**: UPGRADE_SPEC §1.3·Sprint 6 의 '법률 변경 뉴스 감지 → 관련 글 CHECK_NEEDED'는 코드에 구현이 없다(content-health.ts 는 본문 키워드+30일만 봄). 스킬은 같은 LEGAL_KEYWORDS 사전으로 뉴스와 글을 매칭하는 `legal-news` 를 추가했고, 영향 확정은 Claude 가 글을 읽고 판단한다.
5. **키워드 커버리지 정본·자동 매칭**: 원본에는 keyword_pool.covered_content_id 를 채우는 코드가 없어 커버리지가 갱신되지 않는다. 스킬은 Notion 키워드 DB(커버리지 열·발행 글 관계)를 정본으로 읽고, `--auto-match`(타깃 키워드 일치 → 제목 포함 → 태그 일치)로 '커버리지=작성됨 + 발행 글 관계' 갱신을 제안하며, 연결 글이 '업데이트 필요'면 '재작성 필요'를 제안한다(원본에 없음). '재작성 필요'도 커버로 센다. 다음 작성 순서는 매출 가중치(1~5, 원본에 없는 열) 내림차순 → 우선순위. 우선순위별 집계도 추가. 키워드 DB 가 없을 때의 기본값은 UPGRADE_SPEC §4.4 시드 19개.
6. **시리즈 보완**: 원본 assignContentToSeries 는 UI 에서 호출되지 않아(미구현) 글을 시리즈에 넣는 화면이 없다. 스킬은 Notion 콘텐츠 DB `시리즈`·`시리즈 회차`로 소속을 읽고(키워드 DB 에는 시리즈 열이 없다), UPGRADE_SPEC Sprint 6 '다음 편 발행 상태'를 위해 회차 목록·미발행 회차·다음 회차 번호를 추가 출력한다. 계획 편수는 Notion 열이 없어 사용자 입력.
7. **내부 링크 비교 키**: '같은 카테고리'는 합산 categoryNo, '같은 2차 분류'는 secondary_category 또는 2차 분류/다이어리 하위 카테고리 이름으로 비교한다. Notion 행에는 ID 가 없어 제목으로 자기 자신을 제외한다. 결과에 발행 URL 을 함께 준다(원본 패널은 제목 복사만).
8. **Notion 키 정규화**: 스크립트가 한글 속성명·'S4 발행완료' 형식 상태를 내부 키로 바꿔 읽는다. 날짜만 있는 값은 UTC 자정으로 해석(JS new Date 와 동일).

## 9. 다른 스킬과의 연결
- 받는 입력: didim-blog-ops(발행 글 목록·상태·발행일), didim-blog-performance(조회수(최근) → 인기글 가점), didim-blog-planner(뉴스 검색 결과 → 법률 변경 감지), didim-blog-core(카테고리·명칭 규칙).
- 넘기는 출력: didim-blog-writer(업데이트할 글·수정 지시, 내부 링크 삽입 제안), didim-blog-factcheck(법률 키워드 글의 수치·조문 재검증), didim-blog-planner(미커버 HIGH 키워드, 시리즈 다음 회차), didim-blog-seo(내부 링크 2~3개 권장 항목 충족).
