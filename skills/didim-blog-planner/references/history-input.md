# 입력 데이터 — 발행 이력·추천 피드백·뉴스·선택 소스

`scripts/recommend.py plan` 의 입력 JSON 형식과, 그 데이터를 얻는 세 가지 방법을 정의한다.
백오피스의 Supabase 테이블(contents, keyword_pool, content_recommendations, news_items, leads)을 대신한다.

## 1. plan 입력 JSON

```json
{
  "now": "2026-10-01T09:00:00+09:00",
  "blog_start_date": "2026-01-06",
  "history": [
    {"date": "2026-09-22", "category": "변리사의 현장 수첩", "sub_category": "인증 가이드",
     "keyword": "이노비즈 조건", "title": "이노비즈 조건 완벽 가이드 ...", "url": "https://blog.naver.com/didimip/...",
     "views": 1520, "leads": 1}
  ],
  "rejected": [
    {"date": "2026-09-25", "title": "연구노트 작성 — 실무에서 꼭 알아야 할 핵심 정리",
     "keywords": ["연구노트 작성"], "reason": "이미 다룬 주제"}
  ],
  "recently_shown": [
    {"date": "2026-09-30T10:00:00+09:00", "title": "...", "keywords": ["..."]}
  ],
  "exclude": ["지금 화면에 보이는 추천 제목(새로고침 시)"],
  "preferred_sub": {"CAT-A": "CAT-A-01"},
  "news_items": [
    {"title": "...", "link": "https://...", "search_keyword": "직무발명보상금",
     "created_at": "2026-09-30T09:00:00+09:00", "ai_summary": "...", "blog_angle": "...", "is_used": false}
  ],
  "keyword_pool": [
    {"keyword": "직무발명보상금 절세", "category_id": "CAT-A", "sub_category_id": "CAT-A-01", "priority": "HIGH", "covered": false}
  ],
  "manual_topics": [
    {"title": "...", "category": "IP 라운지", "sub_category": "특허 전략 노트", "keywords": ["..."]}
  ],
  "grant_items": [],
  "rotate_from_history": true,
  "use_history_coverage": true
}
```

| 필드 | 필수 | 뜻 | 원본 대응 |
|---|---|---|---|
| now | 권장 | 기준 시각. 날짜만 주면 KST 00:00 | 서버 `new Date()` |
| blog_start_date | 선택 | 12주 스케줄 1주차 시작일(기본 2026-01-06) | site_settings.blog_start_date |
| history[] | **필수** | 발행 완료 글. `date`, `category`(1차) 또는 `sub_category`(2차) 중 하나 이상, `title`, `keyword`(타깃 키워드, 문자열·배열·쉼표 구분 모두 허용). `category_id`·`sub_category_id` 는 이름에서 자동 보완 | contents(status=S4, is_deleted=false) |
| history[].views / leads | 선택 | 발행 1개월 조회수 / 이 글로 들어온 상담 수 → 후속편 추천 | contents.views_1m, leads.source_content_id |
| rejected[] | 선택 | 부적합 처리한 추천. `rejection_keywords` 를 주면 그대로, 없으면 제목·키워드에서 자동 추출 | content_recommendations(status=rejected) |
| recently_shown[] | 선택 | 최근 48시간 안에 보여준 추천 | content_recommendations(전체 status) |
| exclude[] | 선택 | 새로고침 때 지금 보이는 추천 제목 | 클라이언트 excludeRecIds(UUID 아닌 값) |
| preferred_sub | 선택 | 카테고리별로 이번에 피할 2차 분류 ID | preferredSubId |
| news_items[] | 선택 | 관련성 판단을 통과한 최근 7일 뉴스 | news_items |
| keyword_pool[] | 선택 | 우선순위(HIGH/MEDIUM/LOW)가 붙은 키워드 목록 | keyword_pool |
| manual_topics[] | 선택 | 사용자가 직접 넣은 주제(source=manual) | content_recommendations.source='manual' |
| grant_items[] | 선택·**신규** | 지원매치 일일 리포트의 공고. 스크립트는 판정하지 않고 건수만 알림 → `grant-source-draft.md` | 없음 |

`history` 만 있는 배열(`[...]`)을 넘겨도 된다.

## 2. 발행 이력을 얻는 방법 (우선순위 순)

### ① Notion DB "디딤 블로그 콘텐츠" (Notion 커넥터가 있을 때)
상태가 `S4`(발행 완료)이고 삭제되지 않은 행을 발행일 내림차순으로 읽어 history 로 바꾼다.
DB 가 아직 없으면 만들지 말고 ②·③ 으로 진행한 뒤, 사용자에게 아래 필드 구성을 제안만 한다.

| Notion 필드(한국어) | 유형 | 원본 컬럼 | history 키 |
|---|---|---|---|
| 제목 | 제목 | contents.title | title |
| 카테고리 | 선택(변리사의 현장 수첩/IP 라운지/디딤 다이어리) | contents.category_id | category |
| 2차 분류 | 선택(네이버 2차 분류 문자열) | contents.secondary_category | sub_category |
| 타깃 키워드 | 텍스트 | contents.target_keyword | keyword |
| 상태 | 선택(S0~S5) | contents.status | (S4 만 사용) |
| 발행일 | 날짜 | contents.published_at | date |
| 네이버 URL | URL | (없음 — 스킬 추가) | url |
| 조회수(1개월) | 숫자 | contents.views_1m | views |
| 추천 상태 | 선택(대기/적합/부적합) | content_recommendations.status | rejected / recently_shown 구분 |
| 추천 소스 | 선택(keyword_pool/news_api/schedule/manual) | content_recommendations.source | — |
| 부적합 사유 | 텍스트 | content_recommendations.rejection_reason | rejected[].reason |
| 부적합 키워드 | 다중 선택 | content_recommendations.rejection_keywords | rejected[].rejection_keywords |
| 추천일 | 날짜 | content_recommendations.created_at | rejected[].date / recently_shown[].date |

상담 수(leads)는 "디딤 블로그 상담" DB 의 `유입 글`(원본 leads.source_content_id) 관계를 세어 채운다.

### ② 네이버 블로그 RSS
```bash
python3 scripts/fetch_rss_history.py > history.json
# 모르는 2차 분류가 나오면 unknown_sub_categories 를 사용자에게 보여 주고 매핑을 받는다
python3 scripts/fetch_rss_history.py --map '{"지식재산 경영":"CAT-B","출원·심판 실무":"CAT-A"}' > history.json
```
- 주소: https://rss.blog.naver.com/didimip.xml (환경에 따라 막힐 수 있음 → 실패 시 ③).
- RSS `<category>` 는 2차 분류 이름, `<tag>` 첫 항목을 타깃 키워드로 쓴다. 이름 속 줄바꿈 없는 공백(U+00A0)은 일반 공백으로 바꾼다.
- RSS 는 최근 글 일부만 준다. 이번 달 통계·직전 카테고리에는 충분하지만 오래된 글의 커버리지는 빠질 수 있다.
- 2026-10-01 확인 시 코드에 없는 2차 분류 `지식재산 경영`, `출원·심판 실무` 가 RSS 에 있었다 → 어느 1차 카테고리인지 사용자 확인 필요.

### ③ 사용자 붙여넣기
다음 형식 중 아무거나 받아 history 로 옮긴다(한 줄 = 한 글).
```
2026-09-22 | 변리사의 현장 수첩 | 인증 가이드 | 이노비즈 조건 | 이노비즈 조건 완벽 가이드
```
카테고리를 모르는 줄은 2차 분류만 받아도 된다(이름으로 1차를 찾는다).

## 3. 부적합·노출 기록을 남기는 법

백오피스는 추천을 보여 줄 때마다 content_recommendations 에 행을 쌓는다. 스킬에서는:
- 추천 표를 보여 준 뒤 Notion 이 있으면 "디딤 블로그 콘텐츠"에 `추천 상태=대기` 로 기록하고, 없으면 대화 안에서 기억한다.
- 사용자가 "부적합"이라고 하면 `python3 scripts/recommend.py reject-keywords --title "<제목>" --keywords <키워드...>` 결과를 `부적합 키워드` 로 저장한다.
- 다음 실행 때 30일 안 부적합 기록은 `rejected`, 48시간 안 노출 기록은 `recently_shown` 으로 넘긴다.
