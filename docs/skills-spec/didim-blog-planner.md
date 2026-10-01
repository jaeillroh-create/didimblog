# didim-blog-planner — 주제 추천·주간 기획·뉴스 검색·브리핑

## 1. 기능 개요

발행 이력을 네이버 categoryNo(정본)로 분류하고 레거시 카테고리는 신규 구조로 합산한 뒤, ISO 주차(KST) 기준 주 1편 4주 로테이션(지원사업·인증과 특허 → 출원·심판 실무 → 지식재산 경영 → 사례)으로 이번 주 메인 카테고리를 정한다(같은 카테고리 연속 방지, 사건 메모가 없으면 사례→출원·심판 실무). 메인 후보는 지원매치 공고(1주차 우선)·연재 다음 회차·주제 축 키워드 풀에서, 대안은 나머지 로테이션 카테고리에서, 로테이션 외로 디딤 소식(뉴스, URGENT)과 디딤 다이어리를 만든다. 부적합 이력(30일, 3회 이상 블랙리스트)은 절대 노출하지 않고 최근 48시간 노출·화면의 추천·이미 발행한 키워드는 대안이 있을 때 회피한다(원본 필터 그대로). IP·세제 뉴스를 웹 검색·요약해 긴급 글감을 감지하고, 선택한 주제를 브리핑으로 만들어 didim-blog-writer 로 넘긴다. 원본 대시보드 경로(CAT-*·2:1:1·12주 스케줄)는 `--legacy`/`--verify` 로 그대로 재현할 수 있다.

> **결정 사항 반영(skills/_DECISIONS.md, 2026-10-01):** 카테고리 정본=네이버 categoryNo·신규 구조 우선(§1·§2), 12주 스케줄 폐기→주 1편 4주 로테이션(§3), 기록=Notion 2개 DB(§4·§6), 지원매치 공고=1주차 우선 소스(§3). 원본 코드와 다른 부분은 8절에 "결정 사항 반영"으로 표기한다.

## 2. 원본 코드 위치

| 파일 | 함수/상수 |
|---|---|
| src/lib/recommendation-engine.ts | `Recommendation`(5), `MonthlyPublishStats`(36), `MONTHLY_TARGETS`(44), `CATEGORY_NAMES`(50), `determineNeededCategory`(58), `getPrimaryCategoryId`(92), `calcMonthlyStats`(102), `DIARY_SUBS`/`suggestDiarySub`(119-127), `generateTitleSuggestion`(131), `URGENT_NEWS_KEYWORDS`(142), `DOMAIN_POSITIVE_KEYWORDS`(153), `DOMAIN_NEGATIVE_KEYWORDS`(168), `validateNewsRelevance`(195), `KEYWORD_REASON_MAP`(251), `generateNewsRecommendationReason`(304) |
| src/actions/recommendations.ts | `getWeeklyRecommendations`(45), `getTopicForCategory`(156), `getUrgentNewsRecommendations`(275), `tryNewsBasedRecommendation`(301), `tryKeywordBasedUrgentRecommendation`(391), `findAffectedExistingPosts`(432), `getMonthlyPublishProgress`(496), `REJECT_LOOKBACK_DAYS`/`BLACKLIST_REJECT_COUNT`/`TITLE_STOPWORDS`(727-747), `getRejectedKeywordStats`(756), `RecoFilters`(809), `RECENT_SHOWN_WINDOW_HOURS`(818), `containsAny`/`isHardBlocked`/`isSoftAvoided`(823-840), `shuffle`(843), `getRecentlyShownTopics`(858), `loadRecoFilters`(889), `pickWeightedKeyword`(905), `getMultiSourceRecommendations`(958), `persistRecommendation`(993), `buildKeywordCard`(1024), `buildNewsCard`(1056), `scheduleCategoryToId`(1118), `buildScheduleCard`(1124), `acceptRecommendation`(1191), `CARDS_PER_CATEGORY`(1226), `pickSubCategoryKeyword`(1236), `buildSubCategoryKeywordCard`(1265), `buildDiaryTopicCard`(1301), `getCategoryRecommendations`(1349), `getAllCategoryRecommendations`(1431), `rejectRecommendation`(1444) |
| src/lib/constants/sub-category-pool.ts | `SUB_CATEGORY_POOL`(23), `DIARY_TOPIC_POOL`(153), `getSubCategoriesFor`(214), `getSubCategoryMeta`(221) |
| src/lib/constants/schedule-data.ts | `SCHEDULE_DATA`(12), `DEFAULT_BLOG_START_DATE`(95), `getCurrentWeek`(100), `getMonthWeeks`(112) |
| seed_data/schedule_12weeks.json | 12주 스케줄 원본(target, legal_basis 포함) |
| src/actions/keywords.ts | `getKeywordPool`(8), `getHighKeywords`(27) — keyword_pool 조회 |
| supabase/migrations/006_missing_tables.sql:7-28 | keyword_pool 테이블 |
| supabase/migrations/008_news_items.sql | news_items 테이블 |
| supabase/migrations/010_content_recommendations.sql | content_recommendations 테이블(피드백·블랙리스트) |
| src/actions/news-search.ts | `searchNaver`(213), `searchGoogle`(307), `searchNews`(403), `expandKeywords`(444), `summarizeSearchResults`(488), `FIXED_KEYWORDS`(542), `decodeHtmlEntities`(556), `EXCLUDE_PATTERNS`/`isExcludedContent`(567-579), `isRelevantNewsFallback`(582), `filterRelevantNews`(597), `collectNews`(665), `summarizeNewsForBlog`(769), `markNewsAsUsed`(841) |
| src/actions/briefing.ts | `BriefingData`(16), `parseJsonResponse`(75), `VALID_PRIMARY_CATEGORIES`/`VALID_SECONDARY_CATEGORIES`(88-93), `generateBriefing`(97) |
| src/lib/constants/prompts.ts:1472 | `PROMPT_BRIEFING_GENERATE` |
| src/components/dashboard/weekly-recommendation.tsx | `REJECT_PRESETS`(72), `handleCreateDraft`(109), 카테고리 새로고침(170-200), 전체 새로고침(205-240) |
| src/actions/ai.ts | `getPublishedWeeks`(1480) — 스케줄 주차 발행 여부(제목 앞 10자 매칭, 1516) |
| docs/UPGRADE_SPEC.md | §7 추천 엔진 로직(475-555), §4.4 keyword_pool(215-249), §4.7 schedule_templates(275-306), §3.4 뉴스 검색 에러(142-150), Sprint 4·7 체크리스트(684-717) |

## 3. 입력

| 입력 | 필수 | 원본 출처 | 스킬에서 |
|---|---|---|---|
| 발행 이력(날짜, 카테고리/categoryNo, 타깃 키워드, 제목) | 필수 | contents(status=S4, is_deleted=false) | Notion "디딤 블로그 콘텐츠"(`notion_rows`, 상태 S4 발행완료·S5 성과측정) → RSS(`fetch_rss_history.py`) → 붙여넣기 |
| 조회수·연재 | 선택 | contents.views_1m, series_id/series_order | 콘텐츠 DB `조회수(최근)`, `시리즈`, `시리즈 회차` |
| 부적합 이력(30일) | 선택 | content_recommendations(status=rejected) | 콘텐츠 DB `추천 피드백=부적합`(날짜=createdTime), 키워드는 제목·타깃 키워드에서 자동 추출 또는 `메모`의 `부적합 키워드:` |
| 최근 노출(48시간) | 선택 | content_recommendations(전체) | 콘텐츠 DB `추천 피드백=대기/적합` |
| 제외 목록·회피 주제 축 | 선택 | excludeRecIds, preferredSubId | `exclude`, `avoid_topic_axes` |
| 지원매치 공고 | 선택 | 없음 | `grant_items` (결정 사항 §3) |
| 사건 메모 | 선택 | 없음 | `case_memos` (사례 26 전용, 결정 사항 §2) |
| 뉴스 | 선택 | news_items(collectNews) | 웹 검색 도구 + `news-check` |
| 직접 주제 | 선택 | source='manual'(타입만 존재) | `manual_topics` |
| 키워드 풀(우선순위)·블로그 시작일 | 선택 | keyword_pool, site_settings.blog_start_date | `--legacy` 모드에서만 사용 |
| 현재 시각 | 권장 | `new Date()` | `now` (ISO 주차 KST) |

## 4. 처리 규칙

1. 월간 목표는 CAT-A 2, CAT-B 1, CAT-C 1편이다(recommendation-engine.ts:44-48, recommendations.ts:513-531).
2. 이번 달 통계는 S4·미삭제·`published_at >= 이번 달 1일` 글을 2차 ID 에서 1차 ID(`CAT-A-01`→`CAT-A`)로 접어 센다(recommendations.ts:60-71, recommendation-engine.ts:92-115).
3. 필요 카테고리 = 부족분(목표−발행)>0 인 카테고리를 부족분 내림차순으로 정렬한 1순위. 모두 충족이면 CAT-A(매출 직결). 1순위가 직전 발행 글(발행일 최신 1건)의 1차 카테고리와 같고 후보가 2개 이상이면 2순위(recommendation-engine.ts:58-89, recommendations.ts:73-87). — "같은 카테고리 연속 2주 방지"(UPGRADE_SPEC.md:691)의 코드 구현은 이 규칙뿐이며 별도 경고 UI 는 없다.
4. 부적합 처리 시 `rejection_keywords` = 추천 키워드(공백 제거) + 제목을 공백으로 나눈 토큰 중 `[^\w가-힣]` 제거 후 4자 이상·숫자만 아님·`TITLE_STOPWORDS` 아님, 최대 8개(recommendations.ts:1458-1477). 사유 프리셋 4종(weekly-recommendation.tsx:72-77).
5. 최근 30일 부적합 행의 `rejection_keywords` 를 소문자로 세어 1회 이상 = rejected, 3회 이상 = blacklist(recommendations.ts:756-794). 둘 다 hard 차단(833-835).
6. 최근 48시간 content_recommendations 행(상태 무관)의 주제·키워드 소문자 + 클라이언트 제외값 중 UUID 가 아닌 것 = avoid(soft)(858-898). 회피 후보가 0이면 회피 전 후보를 쓴다(928-933, 1146-1157 등).
7. 매칭은 "집합의 항목이 대상 문자열(소문자)에 부분 문자열로 포함"이다(823-830).
8. 카테고리별 카드 수 A 2 / B 2 / C 1(1226-1230). 소스 순서: A = 2차 분류 키워드 반복 → 스케줄, B = 뉴스 → 2차 분류 키워드 → 스케줄, C = 다이어리 주제 풀 → 스케줄(1337-1426).
9. 2차 분류 로테이션: 2차 분류 목록(키워드 있는 것)을 셔플하되 이미 쓴 2차 분류(같은 호출의 앞 카드, preferredSubId)는 빼고, 다 쓰면 전체에서 다시 고른다. 선택한 2차 분류에서 hard 통과 → soft 통과 키워드 중 무작위 1개(1236-1260). 새로고침 시 현재 첫 카드의 2차 분류를 preferredSubId 로 넘긴다(weekly-recommendation.tsx:179-180).
10. 같은 호출 안 중복 방지: 제목이 이미 있으면 추가하지 않고, 추가한 카드의 제목·키워드를 avoid 에 넣는다(1366-1377).
11. 제목안 = 키워드 + 템플릿 3종 중 무작위(recommendation-engine.ts:131-138).
12. 뉴스 카드: news_items 중 is_used=false, 최근 7일, 생성일 내림차순 15건 → 제목·검색키워드 hard 차단 제외 → soft 회피 → 셔플 첫 건. 우선순위 URGENT, IP 라운지 / IP 뉴스 한 입, 사유 = blog_angle ?? ai_summary ?? "최근 7일 뉴스 — 검색 키워드: …"(1056-1115).
13. 스케줄 카드: 현재 주차 W, W+1 항목 → 카테고리 필터 → 없으면 해당 카테고리 전체 → hard/soft/제외 제목 필터 → 무작위(1124-1176). 주차 = ceil((오늘 − 시작일 UTC 자정)/7일)(schedule-data.ts:100-106). 스케줄은 W1~W12 뿐이다.
14. 다이어리 카드: DIARY_TOPIC_POOL 10개에서 동일 필터 후 무작위, source 는 'schedule' 로 저장(1301-1335).
15. 키워드 풀 가중 샘플링(멀티소스 경로): HIGH 50% / MEDIUM 30% / LOW 20% 순서로 미커버 키워드 30건 조회, CAT-A 우선 → CAT-B(905-939, 1024-1054).
16. 레거시 주간 추천(getWeeklyRecommendations): 필요 카테고리가 다이어리면 "(자유 주제)" PRIMARY, 아니면 HIGH 미커버 → MEDIUM 미커버 → 성과 후속편(조회수 상위 10건 중 해당 카테고리, 점수 = 조회수 + 상담×500, SECONDARY). 다른 카테고리 HIGH 미커버 1건을 SECONDARY 로 추가(45-271).
17. 긴급 뉴스(레거시): 긴급 키워드 5개 중 무작위 3개로 최신 5건씩 검색 → 3일 이내 → 관련성 점수(포지티브 키워드×10 + 검색어 제목 포함 20, 네거티브 키워드 있으면 −1·제외, 10 이상 통과) 최고점 1건 URGENT. 없으면 가장 오래된 HIGH 미커버 키워드로 URGENT. 결과 1시간 캐시, 새로고침 시 캐시 초기화(25-41, 275-428, recommendation-engine.ts:195-243). 관련 기존 글 = keyword_pool 커버 글 + target_keyword 매칭 S4 글, 최대 5개(432-485).
18. 뉴스 이유·타깃·각도는 KEYWORD_REASON_MAP 의 첫 매칭(양방향 부분 문자열), 없으면 기본 문구(recommendation-engine.ts:304-324).
19. 뉴스 자동 수집: 고정 키워드 10개로 네이버 최신 5건씩 → 기존 링크 중복·7일 초과·비뉴스 패턴 제외 → LLM 관련성 판단(실패 시 검색어 2자 이상 토큰 포함 여부 폴백) → 저장(news-search.ts:542-747).
20. 뉴스 요약·각도: 3줄 요약 + 블로그 각도 1~2개 JSON(769-839). 검색 결과 요약: 트렌드/활용 포인트/인용 수치(488-540). 키워드 확장: 3~5개(444-486).
21. 검색 API: 네이버 뉴스(최대 10건, sort date|sim), Google Custom Search(`{검색어} 뉴스`, 최대 10건), 병렬 실행·미설정 API 무시(213-438). API 오류 문구는 news-search.ts:270-278, 366-373.
22. 브리핑: PROMPT_BRIEFING_GENERATE + `주제: …`, JSON 7필드, categoryId 가 `CAT-A|CAT-B|CAT-B-03|CAT-C` 밖이면 CAT-A, secondaryCategoryId 가 목록 밖이면 빈 값(briefing.ts:97-165). 초안 다이얼로그는 에피소드·참고사항을 `[에피소드]`/`[참고사항]` 머리로 합친다(ai-draft-dialog.tsx:340-344). 추천 카드에서 초안으로 갈 때 뉴스 URL 을 `참고 자료(뉴스 원문): URL` 로 넣는다(weekly-recommendation.tsx:116-124).

### 4-B. 결정 사항 반영 규칙 (원본 코드에 없음 — skills/_DECISIONS.md)

23. 카테고리 판별: categoryNo → 네이버 카테고리 이름 → 레거시 CAT-* 별칭 순. 레거시는 흡수 매핑으로 통계용 신규 번호를 붙인다: 10·11·12→25, 23→27, 18→26, 14·15→24, 16→28, 19·20→17, 2차 없는 9→25·13→24(추정 경고). 7·22 는 추천 대상 아님(_DECISIONS.md §1·§2, recommend.py `classify_category`).
24. 현황: 이번 ISO 주·최근 4주(이번 주 월요일 기준 3주 전부터)·이번 달 발행 수를 신규 카테고리별로 센다. 이번 주에 이미 발행했으면 "주 1편 기본 충족" 경고.
25. 로테이션: 칸 = (ISO 주차 − 1 + rotation_offset) mod 4 → 25, 27, 24, 26. 26 은 `case_memos` 가 없으면 27. 결정된 카테고리가 직전 발행 글의 신규 카테고리와 같으면 다음 칸으로(연속 2주 방지)(_DECISIONS.md §3).
26. 메인 후보 2건: 25 = 지원매치 공고 필터 통과분(마감 가까운 순) → 주제 축 키워드, 27 = 주제 축 키워드, 24 = 최근 24 글의 연재 다음 회차 → 주제 축 키워드, 26 = 사건 메모만. 주제 축 키워드는 원본 `pickSubCategoryKeyword` 와 같은 셔플·hard/soft 필터(`pick_from_subs`)로 신규 카테고리별 레거시 2차 키워드 묶음(25: A-01·A-02·A-03, 27: A-04, 24: B-01·B-02, 28: B-03)에서 고르며, 메인 카테고리 직전 글의 주제 축은 회피한다.
27. 대안: 나머지 로테이션 카테고리 1건씩(26 은 메모 있을 때만, 25 는 공고가 있으면 공고 1건). 로테이션 외: 원본 `buildNewsCard` 결과를 디딤 소식(28)으로, 다이어리 주제 풀(컨설팅 후기 주제 제외)에서 디딤 다이어리 1건.
28. 지원매치 공고 필터: 자격·가점 원문에 특허·인증 용어(16개) 포함 → 자격이면 요건, 가점만이면 가점. 마감 지남 제외, 7일 이내 URGENT(_DECISIONS.md §3, references/grant-source-draft.md).
29. 우선순위: 뉴스·마감 7일 이내 공고 = URGENT, 메인·직접 주제 = PRIMARY, 나머지 = SECONDARY.
30. 기록: 표의 각 카드를 콘텐츠 DB 행 속성(`notion_rows_to_create`: 제목, 카테고리, categoryNo, 타깃 키워드, 추천 소스, 추천 피드백=대기, 다이어리 하위는 레거시 2차 분류, 근거 URL 은 메모)으로 변환한다(_DECISIONS.md §6).

## 5. 출력

- `recommend.py plan`(기본): ISO 주차, 로테이션(칸·메인 categoryNo), 직전 발행, 현황(이번 주·4주·이번 달), 경고, 필터 요약, 공고 판정, 표(우선순위·카테고리·categoryNo·주제 축·제목안·키워드·소스·사유·근거 URL·프롬프트 키·CTA 힌트), `notion_rows_to_create`, 뉴스 검색 계획. `--legacy`/`--verify`: 원본 대시보드 경로 결과.
- 사용자에게: 이번 주 추천 표(카테고리(No), 주제 축, 제목안, 타깃 키워드, 근거 소스, 우선순위) + 선택 주제별 writer 브리핑 블록(SKILL.md "출력 형식").
- `grant-check`: 공고 통과·제외 목록. `news-check`: 긴급 후보·후보·제외. `reject-keywords`: rejection_keywords. `week`: ISO 주차·로테이션 칸(+폐기된 12주 주차 참고값).

## 6. 예외·오류 처리

| 상황 | 원본 | 스킬 |
|---|---|---|
| 뉴스 검색 실패 | 로그만 남기고 나머지 추천 진행(recommendations.ts:52-55) | 웹 검색 실패 시 뉴스 없이 진행하고 알린다 |
| 네이버/구글 API 미설정·인증 실패·한도 초과 | 오류 문구 반환, 미설정은 조용히 건너뜀(news-search.ts:238-278, 403-438) | 해당 없음(웹 검색 도구) |
| 검색 결과 0건 | "검색 결과가 없습니다. 다른 키워드로 시도해보세요."(UPGRADE_SPEC.md:150) | 같은 문구로 안내 후 키워드 확장 제안 |
| 추천 저장 실패 | recId 없이 카드 반환(recommendations.ts:1013-1021, weekly-recommendation.tsx:138-143) | Notion 기록 실패 시 표를 대화에 남기고 붙여넣기 요청 |
| 추천 0건 | "추천 가능한 주제가 없습니다."(weekly-recommendation.tsx:184, 225) | 같은 문구 + 부적합 키워드를 보여 주고 완화할지 묻는다 |
| 브리핑 JSON 파싱 실패 | "브리핑 생성에 실패했습니다. 직접 입력해주세요."(briefing.ts:137) | Claude 가 직접 작성 — 필드 누락 시 사용자에게 질문 |
| RSS 차단·파싱 실패 | 없음 | `fetch_rss_history.py` 종료코드 2 + 안내 JSON → 붙여넣기 요청 |
| 표에 없는 카테고리 이름 | 없음 | `unknown_categories`/경고로 표시, 통계 제외 → categoryNo 를 물어 `--map` |
| 사례 주간인데 사건 메모 없음 | 없음 | 출원·심판 실무로 대체하고 경고 |
| 공고 자격·가점 원문 없음 | 없음 | 제외 목록에 "요건 없음"으로 표시 → 원문 확인 후 재판정 |

## 7. 데이터 저장

Notion(결정 사항 §4·§6, 2026-10-01 생성 완료). 상위 페이지 "DIDIM 블로그 운영"(비공개). data source ID 를 우선 사용하고, 다른 워크스페이스는 이름으로 찾되 없으면 생성을 제안만 한다.

**"디딤 블로그 콘텐츠"** `collection://463bc815-11ab-4290-9d86-22bd1aa9cfed`

| 백오피스 테이블.컬럼 | Notion 속성 (선택지) |
|---|---|
| contents.title / content_recommendations.recommended_topic | 제목 |
| contents.status | 상태 (S0 기획중 / S1 초안완료 / S2 검토완료 / S3 발행예정 / S4 발행완료 / S5 성과측정) |
| contents.category_id | 카테고리 (지원사업·인증과 특허 / 출원·심판 실무 / 사례 / 지식재산 경영 / 디딤 소식 / 디딤 다이어리 / 레거시) + categoryNo(숫자) |
| contents.secondary_category | 레거시 2차 분류 (절세 시뮬레이션 … 대표의 생각 10종; 다이어리 하위도 여기) |
| contents.target_keyword / recommended_keywords | 타깃 키워드 |
| contents.published_at | 발행일 |
| (없음) | 발행 URL |
| content_recommendations.source | 추천 소스 (키워드 풀 / 뉴스 / 지원매치 리포트 / 로테이션 / 직접 입력) |
| content_recommendations.status | 추천 피드백 (대기 / 적합 / 부적합) — 원본 generated 는 상태 S1 이상으로 대체 |
| content_recommendations.rejection_reason | 부적합 사유 |
| content_recommendations.rejection_keywords | 저장 열 없음 → 다음 실행에서 제목·타깃 키워드로 자동 추출(원본 규칙), 수동 지정 시 메모 `부적합 키워드: …` |
| content_recommendations.created_at | 페이지 createdTime |
| content_recommendations.source_detail | 메모 `근거: URL` |
| contents.views_1m | 조회수(최근) |
| contents.series_id / series_order | 시리즈 / 시리즈 회차 |
| leads.source_content_id | 상담(관계) ↔ 상담 DB 경유 글 |
| keyword_pool.*, news_items.*, site_settings | 저장하지 않음(키워드 풀은 스킬 상수, 뉴스는 매 실행 검색, 12주 시작일은 폐기) |

**"디딤 블로그 상담"** `collection://e1272822-7efd-4850-b8c8-cfce02db7d00` — 플래너는 경유 글 관계 수만 참고로 읽는다.

## 8. 원본 코드와 달라진 점

| # | 구분 | 내용 | 근거 |
|---|---|---|---|
| 1 | 스킬 환경 | 뉴스 검색: 네이버/구글 API 대신 웹 검색 도구. 키워드 확장·요약·관련성 판단·각도는 Claude 가 원문 프롬프트를 직접 따른다. 1시간 캐시 없음 | news-search.ts:213-438, 444-839; recommendations.ts:25-41 |
| 2 | 스킬 환경 | 긴급 키워드 3개 선택: 원본 `sort(() => Math.random() - 0.5)` 는 엔진 의존이라 재현 불가 → Fisher-Yates 셔플 후 3개 | recommendations.ts:306-307 |
| 3 | 스킬 환경 | 난수: Math.random 대신 mulberry32(`--seed`). JS 쪽 Math.random 을 같은 mulberry32 로 바꿔 원본 경로(`--verify`) 3개 시나리오×200 시드 = 1,800 카테고리 카드 세트가 원본과 완전히 일치(결정 사항 반영 후 재실행에서도 동일). 결정적 함수(관련성 점수, 카테고리 결정, 월간 통계, 이유 맵, 주차, 부적합 키워드 추출)도 일치 | scripts/recommend.py |
| 4 | 결정 사항 반영 | 저장소: content_recommendations/news_items 대신 Notion 콘텐츠 DB 의 추천 소스·추천 피드백·부적합 사유 열. rejection_keywords 열이 없어 실행 때마다 제목·타깃 키워드로 재추출(원본 추출 규칙과 같은 결과) | _DECISIONS.md §4·§6 |
| 5 | 스킬 추가 | 발행 이력 커버리지(soft): 후보 키워드·제목(공백 제거)이 발행 글 제목·키워드에 포함되면 회피. 원본 대시보드 경로는 커버 여부를 보지 않음 | recommendations.ts:1236-1260 vs 164-171 |
| 6 | 결정 사항 반영 | 카테고리 정본 = 네이버 categoryNo, CAT-* 는 레거시 별칭. 통계·추천은 신규 구조(25·27·26·24·28·17)로 합산. 레거시 1차만 있는 글(9·13)은 추정 매핑 | _DECISIONS.md §1·§2 |
| 7 | 결정 사항 반영 | 원본의 월간 2:1:1 균형(`determineNeededCategory`, UI 미사용)과 12주 스케줄 카드 대신 주 1편 4주 로테이션(ISO 주차 KST, 사례→출원 대체, 연속 2주 방지 유지). 원본 경로는 `--legacy` 로 남김 | _DECISIONS.md §3; recommendations.ts:45-152, 1124-1176 |
| 8 | 결정 사항 반영 | 카드 구성: 원본 카테고리별 A2/B2/C1 대신 메인 2 + 대안 로테이션 카테고리 각 1 + 디딤 소식(뉴스)·디딤 다이어리 각 1. 키워드 선택은 원본 `pickSubCategoryKeyword` 로직을 신규 카테고리별 레거시 2차 묶음에 적용 | recommendations.ts:1226-1426 |
| 9 | 결정 사항 반영 | 지원매치 공고 소스(코드에 없음): 자격·가점에 특허·인증 용어가 있는 공고만, 1주차 메인 우선, 마감 7일 이내 URGENT. 스크립트(`filter_grants`, `grant-check`)로 판정 | _DECISIONS.md §3 |
| 10 | 결정 사항 반영 | 사례(26)는 사용자 사건 메모가 있을 때만 추천. 다이어리 주제 풀 중 '컨설팅 후기' 주제는 자동 추천에서 제외(사례로 흡수) | _DECISIONS.md §2; sub-category-pool.ts:158-178 |
| 11 | 결정 사항 반영 | 지식재산 경영(24) 주간에는 최근 연재(시리즈·회차)의 다음 회차를 먼저 추천(원본 series 테이블은 추천에 쓰이지 않음) | _DECISIONS.md §2·§4 |
| 12 | 결정 사항 반영 | 12주 스케줄 폐기: references/schedule-12weeks.md 는 기록용, 기본 모드에서 쓰지 않음. 블로그 시작일 기반 주차 대신 ISO 주차 | _DECISIONS.md §3; schedule-data.ts:95-106 |
| 13 | 코드 모순(해소) | CAT-B-01/02 정의 충돌(sub-category-pool.ts·FIELD_CTA vs seed.sql·SPEC.md·PROMPT_BRIEFING_GENERATE), CAT-A-04 누락(seed.sql·CATEGORY_HIERARCHY·briefing.ts 검증 목록). 결정 사항에 따라 categoryNo 를 정본으로 써서 해소. 레거시 별칭은 sub-category-pool.ts 정의(14=특허 전략 노트, 15=AI와 IP)를 따름. 브리핑 프롬프트의 CAT-* 목록은 쓰지 않고 카테고리를 표에서 고정 | sub-category-pool.ts:83-125; supabase/seed.sql:9-10; prompts.ts:1479-1494; briefing.ts:89-93 |
| 14 | 코드 모순(기록) | 12주 스케줄 두 벌(schedule-data.ts vs seed_data JSON)의 W3·W5~W12 차이를 references 에 기록 | references/schedule-12weeks.md §4 |
| 15 | 코드 특성(유지) | 블랙리스트(3회↑)는 rejected(30일 1회↑)와 같은 30일 창 → 항상 부분집합이라 추가 효과 없음 | recommendations.ts:762-789 |
| 16 | 코드 특성(유지·주의 안내) | rejection_keywords 추출이 `2026년` 같은 연도 토큰을 거르지 않아 이후 그 연도가 든 뉴스·다이어리 제목이 hard 차단됨. 스킬은 메모 `부적합 키워드:` 로 덮어쓸 수 있게 함 | recommendations.ts:1466-1476 |
| 17 | 코드 특성(유지) | preferredSubId 를 avoid 에 넣는 코드(1359)는 키워드·제목 비교라 실효 없음, 실효는 usedSubIds 쪽 | recommendations.ts:1359, 1364 |
| 18 | 스킬 환경 | RSS 이력 입력(코드에 없음). 카테고리 이름 → categoryNo 표로 변환, 표에 없는 이름만 사용자 매핑 | scripts/fetch_rss_history.py |
| 19 | 스킬 환경 | 원본 월간 통계 기준은 서버 로컬 시간(확인 필요), 스킬은 KST | recommendations.ts:61-62 |
| 20 | 결정 사항 반영 | Notion 행 변환: 콘텐츠 DB 행을 그대로 받아(`notion_rows`) 이력·부적합·노출로 나누고, 추천 카드를 새 행 속성(`notion_rows_to_create`)으로 돌려줌 | _DECISIONS.md §6 |

## 9. 다른 스킬과의 연결

| 방향 | 스킬 | 주고받는 것 |
|---|---|---|
| 받음 | didim-blog-core | 카테고리 정본(categoryNo)·이름, CTA 규칙(다이어리·사무소 소식 금지), 이메일·명칭 매핑 |
| 받음 | didim-blog-ops | 콘텐츠 상태(S4 발행완료)·발행일 → 이력. 추천 적합 시 상태 S0 기획중 |
| 받음 | didim-blog-performance | 콘텐츠 DB 조회수(최근), 상담 DB 경유 글 → 참고 |
| 받음 | didim-blog-health | 마지막 업데이트일·업데이트 필요 글(재작성 주제 후보로 사용자 판단) |
| 넘김 | didim-blog-writer | 브리핑(카테고리 이름+categoryNo, 프롬프트 키, CTA 힌트, 주제 축, 주제, 키워드, 타깃, 에피소드, 참고사항, 근거 URL) |
| 넘김 | didim-blog-factcheck | 뉴스·공고 기반 주제의 원문 링크·숫자(확인 필요 표시분) |
