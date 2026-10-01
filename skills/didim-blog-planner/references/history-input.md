# 입력 데이터 — 발행 이력·추천 피드백·공고·뉴스

`scripts/recommend.py plan` 의 입력 JSON 과, 그 데이터를 얻는 방법. 백오피스 Supabase 테이블(contents, keyword_pool, content_recommendations, news_items, leads)을 대신한다.
카테고리 정본은 네이버 categoryNo 다(skills/_DECISIONS.md §1).

## 1. plan 입력 JSON

```json
{
  "now": "2026-10-06T09:00:00+09:00",
  "notion_rows": [ { "제목": "...", "상태": "S4 발행완료", "카테고리": "출원·심판 실무", "categoryNo": 27, "...": "..." } ],
  "history": [
    {"date": "2026-09-22", "category_no": 11, "keyword": "이노비즈 조건", "title": "...", "url": "https://blog.naver.com/didimip/...",
     "views": 1520, "series": "특허활용", "series_no": 1}
  ],
  "rejected": [{"date": "2026-09-25", "title": "...", "keywords": ["연구노트 작성"], "reason": "이미 다룬 주제"}],
  "recently_shown": [{"date": "2026-09-30T10:00:00+09:00", "title": "...", "keywords": ["..."]}],
  "grant_items": [{"title": "...", "deadline": "2026-10-20", "url": "https://...", "eligibility": "...", "bonus": "..."}],
  "case_memos": [{"summary": "제조 중소기업 상표 거절이유 극복 후 등록", "keywords": ["상표 거절 대응"], "title": null}],
  "news_items": [{"title": "...", "link": "https://...", "search_keyword": "직무발명보상금",
                  "created_at": "2026-09-30T09:00:00+09:00", "ai_summary": "...", "blog_angle": "..."}],
  "manual_topics": [{"title": "...", "category": "지식재산 경영", "keywords": ["..."]}],
  "exclude": ["새로고침 시 지금 보이는 추천 제목"],
  "avoid_topic_axes": ["CAT-A-02"],
  "rotation_offset": 0
}
```

| 필드 | 필수 | 뜻 | 원본 대응 |
|---|---|---|---|
| now | 권장 | 기준 시각. 날짜만 주면 KST 00:00. 주차 = ISO 주차(KST) | 서버 `new Date()` |
| notion_rows[] | 선택 | Notion 콘텐츠 DB 행(속성 이름 그대로). history·rejected·recently_shown 으로 자동 분리 | contents + content_recommendations |
| history[] | 필수(또는 notion_rows) | 발행 글. 카테고리는 `category_no`(정본) → `sub_category`/`category`(네이버 이름) → `category_id`(레거시 CAT-*) 순으로 판별 | contents(S4) |
| history[].views / series / series_no | 선택 | 조회수(최근), 연재명·회차 → 지식재산 경영 연재 다음 회차 | contents.views_1m, series |
| rejected[] | 선택 | 부적합 추천. `rejection_keywords` 가 없으면 제목·키워드로 자동 추출(원본 규칙) | content_recommendations(rejected) |
| recently_shown[] | 선택 | 최근 48시간 안 노출 | content_recommendations(전체) |
| grant_items[] | 선택 | 지원매치 공고 → `grant-source-draft.md` | 없음(결정 사항) |
| case_memos[] | 선택 | 사례(26)용 사건 메모. 없으면 4주차는 출원·심판 실무 | 없음(결정 사항) |
| news_items[] | 선택 | 관련성 판단을 통과한 최근 7일 뉴스 | news_items |
| manual_topics[] | 선택 | 직접 주제 | source='manual' |
| exclude / avoid_topic_axes | 선택 | 새로고침용 제외 제목 / 피할 주제 축(레거시 2차 ID: CAT-A-01 절세 시뮬레이션, CAT-A-02 인증 가이드, CAT-A-03 연구소 운영 실무, CAT-A-04 특허·상표 출원 실무, CAT-B-01 특허 전략 노트, CAT-B-02 AI와 IP, CAT-B-03 IP 뉴스 한 입) | excludeRecIds, preferredSubId |
| rotation_offset | 선택 | 로테이션 칸을 사용자 사정에 맞게 밀 때(기본 0) | 없음 |

## 2. Notion (2026-10-01 생성 완료 — _DECISIONS.md §6)

위치: 비공개 페이지 "DIDIM 블로그 운영" https://app.notion.com/p/3ec65e0fc92681358983f701a4691b71
data source ID 를 우선 쓰고, 다른 워크스페이스면 DB 이름으로 찾는다. 없으면 아래 스키마로 생성을 제안만 한다.

### "디딤 블로그 콘텐츠" — `collection://463bc815-11ab-4290-9d86-22bd1aa9cfed`
https://app.notion.com/p/4f21a8b7e84d4c818de1c673ed9cbbcb

| 속성 | 유형 | 선택지 / 쓰임 | 원본 컬럼 |
|---|---|---|---|
| 제목 | 제목 | 글 제목 또는 추천 제목안 | contents.title, content_recommendations.recommended_topic |
| 상태 | 선택 | `S0 기획중` / `S1 초안완료` / `S2 검토완료` / `S3 발행예정` / `S4 발행완료` / `S5 성과측정` — 이력은 S4·S5 | contents.status |
| 카테고리 | 선택 | `지원사업·인증과 특허` / `출원·심판 실무` / `사례` / `지식재산 경영` / `디딤 소식` / `디딤 다이어리` / `레거시` | contents.category_id |
| categoryNo | 숫자 | 네이버 categoryNo(정본) | (신규) |
| 2차 분류 | 선택 | 카테고리=레거시일 때 원래 이름(절세 시뮬레이션, 인증 가이드, 연구소 운영 실무, 특허·상표 출원 실무, 특허 전략 노트, AI와 IP, IP 뉴스 한 입, 컨설팅 후기, 디딤 일상, 대표의 생각). 다이어리 하위(디딤 일상·대표의 생각)도 여기에 | contents.secondary_category |
| 타깃 키워드 | 텍스트 | 쉼표 구분 | contents.target_keyword |
| 발행일 | 날짜 | | contents.published_at |
| 발행 URL | URL | 네이버 글 주소 | (신규) |
| 추천 소스 | 선택 | `키워드 풀` / `뉴스` / `지원매치 리포트` / `로테이션` / `직접 입력` | content_recommendations.source |
| 추천 피드백 | 선택 | `대기` / `적합` / `부적합` | content_recommendations.status |
| 부적합 사유 | 텍스트 | 사유 프리셋 또는 직접 입력 | rejection_reason |
| 조회수(최근) | 숫자 | 후속편·성과 참고 | contents.views_1m |
| 유입 키워드 TOP3 / 댓글 수 / 성과 갱신일 | 텍스트/숫자/날짜 | performance 스킬 소관 | — |
| 시리즈 / 시리즈 회차 | 텍스트/숫자 | 연재 다음 회차 추천 | contents.series_id/series_order |
| 마지막 업데이트일 | 날짜 | health 스킬 소관 | — |
| 메모 | 텍스트 | `근거: URL`, `부적합 키워드: a, b`(자동 추출 대신 쓸 때) | source_detail, rejection_keywords |
| 상담 | 관계 | ↔ 상담 DB "경유 글" | leads.source_content_id |

추천 행의 날짜는 페이지 `createdTime` 을 쓴다(별도 추천일 열 없음).
카드 source → `추천 소스`: keyword_pool·diary_topic_pool → 키워드 풀, news_api → 뉴스, grant → 지원매치 리포트, series(연재 다음 회차) → 로테이션, manual → 직접 입력. 스크립트 결과의 `notion_rows_to_create` 가 이 매핑을 적용한 속성값이다.

### "디딤 블로그 상담" — `collection://e1272822-7efd-4850-b8c8-cfce02db7d00`
https://app.notion.com/p/aa32b78384b7415a9daf6282572960c1
회사명(제목), 상담일, 유입 경로(블로그/지원매치/특허인증센터/소개/기타), 경유 글(관계), 관심 서비스(다중: 출원·심판/지원사업 가점용 특허·인증/절세·연구소/기타), 상태(신규/진행 중/제안/계약/보류/종료), 계약 여부, 계약 금액(원), 메모.
플래너는 글별 상담 수(경유 글 관계 개수)를 참고로만 읽는다.

## 3. Notion 이 없을 때

### 네이버 블로그 RSS
```bash
python3 scripts/fetch_rss_history.py > history.json
python3 scripts/fetch_rss_history.py --map '{"새 카테고리":25}' > history.json   # 표에 없는 이름이 나올 때
```
- 주소: https://rss.blog.naver.com/didimip.xml (막히면 붙여넣기). RSS `<category>` = 카테고리 이름 → categoryNo, `<tag>` 첫 항목 = 타깃 키워드. U+00A0 공백은 일반 공백으로.
- RSS 는 최근 글 일부만 담는다(2026-10-01 확인 시 18건). 이번 주·최근 4주 판단에는 충분하다.

### 붙여넣기 (한 줄 = 한 글)
```
2026-09-22 | 인증 가이드 | 이노비즈 조건 | 이노비즈 조건 완벽 가이드
```
카테고리는 네이버 이름이나 categoryNo 아무거나 받는다. Notion 이 없으면 추천 표도 대화에 출력하고 사용자가 기록을 붙여넣게 한다.
