# didim-blog-planner — 주제 추천·주간 기획·뉴스 검색·브리핑

## 1. 기능 개요

발행 이력을 바탕으로 이번 달 카테고리 균형(현장 수첩 2 : IP 라운지 1 : 다이어리 1)과 직전 발행 카테고리를 따져 이번 주 필요 카테고리를 정하고, 2차 분류 키워드 풀·다이어리 주제 풀·12주 스케줄·최근 뉴스에서 카테고리별 추천 카드(현장 수첩 2, IP 라운지 2, 다이어리 1)를 만든다. 부적합 이력(30일, 3회 이상은 블랙리스트)은 절대 노출하지 않고, 최근 48시간 노출·화면에 보이는 추천은 대안이 있을 때 회피한다. IP·세제 뉴스를 검색·요약해 긴급(URGENT) 글감을 감지하고, 선택한 주제를 카테고리·키워드·타깃·에피소드·참고사항으로 된 브리핑으로 만들어 초안 작성(didim-blog-writer)으로 넘긴다.

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
| 발행 이력(날짜, 1차·2차 카테고리, 타깃 키워드, 제목) | 필수 | contents(status=S4, is_deleted=false) | Notion "디딤 블로그 콘텐츠" → RSS(`fetch_rss_history.py`) → 붙여넣기 |
| 글별 조회수·상담 수 | 선택 | contents.views_1m, leads.source_content_id | Notion "디딤 블로그 성과"/"디딤 블로그 상담" 또는 사용자 |
| 부적합 이력(30일) | 선택 | content_recommendations(status=rejected) | Notion `추천 상태=부적합` 또는 대화 기록 |
| 최근 노출(48시간) | 선택 | content_recommendations(전체) | Notion `추천 상태` 또는 대화 기록 |
| 제외 목록·회피 2차 분류 | 선택 | 클라이언트 excludeRecIds, preferredSubId | 새로고침 시 지금 보이는 제목·첫 카드 2차 분류 |
| 뉴스 | 선택 | news_items(collectNews 로 수집) | 웹 검색 도구 + `news-check` |
| 키워드 풀(우선순위) | 선택 | keyword_pool | 사용자 제공 JSON |
| 직접 주제 | 선택 | source='manual' (타입만 존재) | `manual_topics` |
| 지원사업 공고 | 선택 | 없음 | `grant_items` (신규) |
| 현재 시각·블로그 시작일 | 권장 | `new Date()`, site_settings.blog_start_date(기본 2026-01-06) | `now`, `blog_start_date` |

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

## 5. 출력

- `recommend.py plan`: 월간 현황, 필요 카테고리, 경고, 필터 요약, 카테고리별 카드(원본 Recommendation 필드), 선택 소스 카드, 표(우선순위·카테고리·2차분류·제목안·키워드·소스·사유·뉴스 URL), 뉴스 검색 계획.
- 사용자에게: 이번 주 추천 N건 표(카테고리, 2차분류, 제목안, 타깃 키워드, 근거 소스, 우선순위) + 선택 주제별 writer 브리핑 블록(SKILL.md "출력 형식").
- `reject-keywords`: rejection_keywords 배열. `news-check`: 긴급 후보·후보·제외 목록. `week`: 현재 주차·4주 묶음.

## 6. 예외·오류 처리

| 상황 | 원본 | 스킬 |
|---|---|---|
| 뉴스 검색 실패 | 로그만 남기고 나머지 추천 진행(recommendations.ts:52-55) | 웹 검색 실패 시 뉴스 없이 진행하고 알린다 |
| 네이버/구글 API 미설정·인증 실패·한도 초과 | 오류 문구 반환, 미설정은 조용히 건너뜀(news-search.ts:238-277, 403-438) | 해당 없음(웹 검색 도구) |
| 검색 결과 0건 | "검색 결과가 없습니다. 다른 키워드로 시도해보세요."(UPGRADE_SPEC.md:150) | 같은 문구로 안내 후 키워드 확장 제안 |
| 추천 저장 실패 | recId 없이 카드 반환, 부적합은 클라이언트에서만 처리(recommendations.ts:1013-1021, weekly-recommendation.tsx:138-143) | Notion 기록 실패 시 대화 안에서만 기억한다고 알린다 |
| 추천 0건 | "추천 가능한 주제가 없습니다." 토스트(weekly-recommendation.tsx:184, 225) | 같은 문구 + 필터(부적합 키워드)를 보여 주고 완화할지 묻는다 |
| 브리핑 JSON 파싱 실패 | "브리핑 생성에 실패했습니다. 직접 입력해주세요."(briefing.ts:137-139) | Claude 가 직접 작성하므로 해당 없음, 필드 누락 시 사용자에게 질문 |
| LLM 미설정 | 관련성 판단은 키워드 폴백(news-search.ts:603-608) | 해당 없음 |
| RSS 차단·파싱 실패 | 없음 | `fetch_rss_history.py` 가 종료코드 2와 안내 JSON → 붙여넣기 요청 |
| 코드에 없는 2차 분류 | 없음 | `unknown_sub_categories` 로 표시, 통계 제외 경고 후 사용자 매핑 |

## 7. 데이터 저장

| 백오피스 테이블.컬럼 | 스킬 대체 (Notion "디딤 블로그 콘텐츠" 필드 또는 사용자 입력) |
|---|---|
| contents.title | 제목 |
| contents.category_id | 카테고리(선택: 변리사의 현장 수첩/IP 라운지/디딤 다이어리) |
| contents.secondary_category | 2차 분류(선택, 네이버 문자열) |
| contents.target_keyword | 타깃 키워드 |
| contents.status | 상태(S0~S5) — 추천 수락 시 S0 |
| contents.published_at | 발행일 |
| (없음) | 네이버 URL (스킬 추가) |
| contents.views_1m | 조회수(1개월) — 원래 "디딤 블로그 성과" 소관, 추천에는 읽기만 |
| leads.source_content_id | "디딤 블로그 상담"의 유입 글 관계 → 상담 수 |
| content_recommendations.recommended_topic / recommended_category / recommended_subcategory / recommended_keywords | 제목 / 카테고리 / 2차 분류 / 타깃 키워드 (추천 행) |
| content_recommendations.source | 추천 소스(keyword_pool/news_api/schedule/manual) |
| content_recommendations.source_detail | 근거(뉴스 URL, 스케줄 주차, 2차 분류 ID) — 본문 또는 텍스트 필드 |
| content_recommendations.status | 추천 상태(대기/적합/부적합; 원본 generated 는 상태 S1 이상으로 대체) |
| content_recommendations.rejection_reason / rejection_keywords | 부적합 사유 / 부적합 키워드(다중 선택) |
| content_recommendations.created_at / acted_at | 추천일 / 처리일 |
| keyword_pool.* | 사용자 제공 JSON(`keyword_pool`) — 커버 여부는 발행 이력에서 계산 |
| news_items.* | 저장하지 않음(매 실행 웹 검색). 사용한 뉴스는 콘텐츠 행 본문에 URL 로 남김 |
| site_settings.blog_start_date | 사용자 입력(기본 2026-01-06) |

DB 는 만들지 않는다. 2026-10-01 Notion 검색에서 "디딤 블로그 콘텐츠" DB 는 발견되지 않았다(확인 필요).

## 8. 원본 코드와 달라진 점

| # | 구분 | 내용 | 근거 |
|---|---|---|---|
| 1 | 스킬 환경 | 뉴스 검색: 네이버/구글 API 대신 Claude 의 웹 검색 도구. 키워드 확장·요약·관련성 판단·각도는 외부 LLM 대신 Claude 가 원문 프롬프트를 직접 따른다. 1시간 캐시 없음 | news-search.ts:213-438, 444-839; recommendations.ts:25-41 |
| 2 | 스킬 환경 | 긴급 키워드 3개 선택: 원본 `sort(() => Math.random() - 0.5)` 는 엔진 의존 정렬이라 재현 불가 → Fisher-Yates 셔플 후 3개 | recommendations.ts:306-307 |
| 3 | 스킬 환경 | 난수: Math.random 대신 mulberry32(`--seed`). JS 쪽 Math.random 을 같은 mulberry32 로 바꿔 3개 시나리오×200 시드(1,800 카테고리 카드 세트)가 원본과 완전히 일치함을 확인 | scripts/recommend.py |
| 4 | 스킬 환경 | 저장: content_recommendations/news_items 대신 Notion 필드 또는 대화 기록. 부적합 키워드 추출은 `reject-keywords` 하위 명령 | §7 |
| 5 | 스킬 추가 | 발행 이력 커버리지(soft): 후보 키워드·제목(공백 제거·소문자)이 발행 글 제목·키워드에 포함되면 회피. 원본 대시보드 경로는 keyword_pool 커버 여부를 보지 않고(레거시 경로만 covered_content_id 사용) 2차 분류 풀은 정적이라 이미 쓴 키워드가 반복 추천될 수 있음. `use_history_coverage:false` 로 끌 수 있다 | recommendations.ts:1236-1260 vs 164-171 |
| 6 | 스킬 추가 | 첫 실행의 2차 분류 로테이션 기준: preferredSubId 가 없으면 해당 카테고리의 최근 발행 2차 분류를 사용(원본은 새로고침 때만 화면 첫 카드 기준). `rotate_from_history:false` 로 끌 수 있다 | weekly-recommendation.tsx:179 |
| 7 | 결합 | 대시보드(getAllCategoryRecommendations)는 카테고리 균형(determineNeededCategory)을 쓰지 않고, 균형 로직은 UI 에서 호출되지 않는 getWeeklyRecommendations 에만 있다. 스킬은 둘을 합쳐 카드는 대시보드 경로로 만들고, 표 우선순위는 레거시 규칙(필요 카테고리 PRIMARY, 나머지 SECONDARY, 뉴스 URGENT)으로 표시한다 | dashboard/page.tsx:35; recommendations.ts:45-152 |
| 8 | 스킬 추가 | 연속 카테고리 경고 문구(직전 글과 메인 카테고리가 같을 때, 최근 2건이 같을 때). 원본엔 경고 UI 없음(Sprint 4 체크리스트 항목만) | UPGRADE_SPEC.md:691 |
| 9 | 표기 정규화 | 스케줄 카드의 카테고리 `현장 수첩`→`변리사의 현장 수첩`, 2차 `연구소 운영`→`연구소 운영 실무` 로 출력(절대원칙 3). 내부 카드 값은 원본 그대로 | schedule-data.ts:13-24; recommendations.ts:1162-1170 |
| 10 | 코드 모순 | CAT-B-01/02 정의 충돌: sub-category-pool.ts·FIELD_CTA 는 01=특허 전략 노트/02=AI와 IP, seed.sql·SPEC.md·PROMPT_BRIEFING_GENERATE 는 반대. CAT-A-04 는 seed.sql·CATEGORY_HIERARCHY·briefing.ts 검증 목록에 없음(브리핑에서 CAT-A-04 를 고르면 빈 값으로 지워짐). 스킬은 이름을 정본으로 넘기고 ID 는 추천 엔진 기준을 참고로 표기 | sub-category-pool.ts:83-125; supabase/seed.sql:9-10; prompts.ts:1479-1494; briefing.ts:89-93; categories.ts:43-47 |
| 11 | 코드 모순 | 12주 스케줄이 두 벌: 엔진은 schedule-data.ts, seed_data JSON 과 W3·W5·W6·W7·W8·W9·W10·W11·W12 의 2차분류·제목·키워드·CTA 가 다름(W10 CTA: 이웃 추가 vs 보상규정 컨설팅 안내). 스킬 계산은 엔진 쪽을 따르고 차이표를 references 에 둠 | references/schedule-12weeks.md §4 |
| 12 | 코드 특성(유지) | 블랙리스트(3회↑)는 rejected(30일 1회↑)와 같은 30일 창에서 계산돼 항상 그 부분집합 → 추가 효과 없음 | recommendations.ts:762-789 |
| 13 | 코드 특성(유지·주의 안내) | rejection_keywords 추출이 `2026년` 같은 연도 토큰을 걸러내지 않아(4자 이상·숫자만 아님) 이후 그 연도가 들어간 뉴스·스케줄·다이어리 제목이 hard 차단됨. 생성 제목 자체는 검사 대상이 아님. 스킬은 저장 전 사용자 확인을 안내 | recommendations.ts:1466-1476, 734-747 |
| 14 | 코드 특성(유지) | preferredSubId 를 소문자로 avoid 에 넣지만(1359) avoid 는 키워드·제목과 비교되므로 실효는 usedSubIds 쪽뿐 | recommendations.ts:1359, 1364 |
| 15 | 코드 특성 | 12주 스케줄은 W12 까지만 있어 2026-03-31 이후(W13+)에는 ±1주 후보가 없고 카테고리 전체 스케줄로 폴백. 출력에 `schedule_in_range` 로 알림 | recommendations.ts:1131-1141 |
| 16 | 스킬 환경 | 월간 통계 기준 시각: 원본은 서버 로컬 시간(배포 환경 UTC 로 추정 — 확인 필요)의 이번 달 1일, 스킬은 KST 1일 | recommendations.ts:61-62 |
| 17 | 신규 | 지원사업 공고(지원매치 일일 리포트) 선택 입력 슬롯 `grant_items` 와 "특허·인증이 요건/가점인 공고만 주제화" 규칙 초안. 코드에 없음, 스크립트는 판정하지 않음 | references/grant-source-draft.md |
| 18 | 스킬 환경 | RSS 이력 입력(코드에 없음). RSS 2차 분류 중 코드에 없는 이름(`지식재산 경영`, `출원·심판 실무`)은 사용자 매핑 필요 | scripts/fetch_rss_history.py |
| 19 | 스킬 환경 | 레거시 "(자유 주제)" 다이어리 추천과 `suggestDiarySub` 는 쓰지 않고 다이어리 주제 풀 경로(대시보드)를 따름 | recommendations.ts:90-101 |

## 9. 다른 스킬과의 연결

| 방향 | 스킬 | 주고받는 것 |
|---|---|---|
| 받음 | didim-blog-core | 카테고리·2차 분류 정식 명칭, CTA 금지 규칙(다이어리), 이메일·명칭 매핑 |
| 받음 | didim-blog-ops | 콘텐츠 상태(S4=발행 완료)·발행 캘린더 → 발행 이력. 추천 수락 시 S0 생성 |
| 받음 | didim-blog-performance | 글별 조회수(views_1m)·상담 유입 수 → 성과 후속편 |
| 받음 | didim-blog-health | 키워드 커버리지(참고), 업데이트 필요 글(재작성 주제 후보로 사용자 판단) |
| 넘김 | didim-blog-writer | 브리핑(카테고리·2차 분류 이름+ID·주제·키워드·타깃·에피소드·참고사항·뉴스 URL) — 원본 BriefingData / AiDraftInitialValues 형식 |
| 넘김 | didim-blog-factcheck | 뉴스 기반 주제의 원문 링크·숫자(확인 필요 표시분) |
