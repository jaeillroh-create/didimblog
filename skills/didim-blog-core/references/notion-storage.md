# 기록 저장소 — Notion DB 2개 (모든 didim-blog-* 스킬 공통)

> 결정 근거: skills/_DECISIONS.md 4·6절(2026-10-01 생성 완료). 아래 속성 이름·선택지는 2026-10-01 Notion 데이터 소스 스키마를 직접 조회해 옮긴 것이다(이후 추가된 '발행예정일' 포함).
> 측정은 최소화한다. 성과 DB 를 따로 두지 않고 콘텐츠 DB 에 최근 성과 열을 둔다("디딤 블로그 성과" DB 는 만들지 않는다).

## 1. 위치와 찾는 법
| 대상 | 이름 | URL | data source ID (우선 사용) |
|---|---|---|---|
| 상위 페이지(비공개) | DIDIM 블로그 운영 | https://app.notion.com/p/3ec65e0fc92681358983f701a4691b71 | - |
| 콘텐츠 DB | 디딤 블로그 콘텐츠 | https://app.notion.com/p/4f21a8b7e84d4c818de1c673ed9cbbcb | `collection://463bc815-11ab-4290-9d86-22bd1aa9cfed` |
| 상담 DB | 디딤 블로그 상담 | https://app.notion.com/p/aa32b78384b7415a9daf6282572960c1 | `collection://e1272822-7efd-4850-b8c8-cfce02db7d00` |

1. Notion 커넥터가 있으면 위 data source ID 로 먼저 조회한다.
2. 실패하거나 다른 워크스페이스면 DB 이름으로 검색한다.
3. 그래도 없으면 아래 스키마로 생성을 **제안**만 한다(사용자 승인 없이 만들지 않는다).
4. Notion 커넥터가 없으면 기록할 내용을 아래 열 순서의 표로 대화에 출력하고, 사용자에게 붙여넣기를 요청한다.
5. 쓰기(생성·수정)는 항상 사용자에게 바꿀 값을 보여 주고 확인을 받은 뒤 한다.

## 2. "디딤 블로그 콘텐츠" 속성
| 속성 | 유형 | 선택지 / 형식 | 백오피스 대응 컬럼 |
|---|---|---|---|
| 제목 | title | | contents.title |
| 상태 | select | `S0 기획중` / `S1 초안완료` / `S2 검토완료` / `S3 발행예정` / `S4 발행완료` / `S5 성과측정` | contents.status (+ content-states.ts 라벨) |
| 카테고리 | select | `지원사업·인증과 특허` / `출원·심판 실무` / `사례` / `지식재산 경영` / `디딤 소식` / `디딤 다이어리` / `레거시` | contents.category_id |
| 레거시 2차 분류 | select | `절세 시뮬레이션` / `인증 가이드` / `연구소 운영 실무` / `특허·상표 출원 실무` / `특허 전략 노트` / `AI와 IP` / `IP 뉴스 한 입` / `컨설팅 후기` / `디딤 일상` / `대표의 생각` | contents.secondary_category |
| categoryNo | number | 네이버 categoryNo (categories.md A-1) | (없음) |
| 타깃 키워드 | text | | contents.target_keyword |
| 발행예정일 | date | SLA 역산 기준일(실제 발행일은 '발행일') | contents.publish_date |
| 발행일 | date | 실제 발행일(S4 전환 시) | contents.published_at |
| 발행 URL | url | 네이버 글 주소 | (없음) |
| 추천 소스 | select | `키워드 풀` / `뉴스` / `지원매치 리포트` / `로테이션` / `직접 입력` | content_recommendations.source (keyword_pool/news_api/schedule/manual) |
| 추천 피드백 | select | `대기` / `적합` / `부적합` | content_recommendations.status (pending/accepted/rejected) |
| 부적합 사유 | text | | content_recommendations.rejection_reason |
| 조회수(최근) | number | | contents.views_1w / views_1m |
| 유입 키워드 TOP3 | text | | 성과 입력(didim-blog-performance) |
| 댓글 수 | number | | 성과 입력(didim-blog-performance) |
| 성과 갱신일 | date | | (없음) |
| 시리즈 | text | | contents.series_id(이름) |
| 시리즈 회차 | number | | contents.series_order |
| 마지막 업데이트일 | date | | contents.updated_at (글 건강 점검 기준) |
| 메모 | text | | contents.notes |
| 상담 | relation | ↔ 상담 DB "경유 글" | 상담(리드) 테이블의 경유 글 (didim-blog-performance 참고) |

카테고리 기록 규칙:
- 신규 구조·다이어리 글: `카테고리` = 이름, `categoryNo` = 번호(다이어리 하위면 18/19/20), `레거시 2차 분류` 비움(다이어리 하위 이름을 남기려면 `레거시 2차 분류`에 컨설팅 후기/디딤 일상/대표의 생각).
- 레거시 글: `카테고리` = `레거시`, `레거시 2차 분류` = 원래 이름, `categoryNo` = 레거시 번호(10~16, 23).

DB 에 없는 값(본문, 태그, AI 생성 여부 등)은 **페이지 본문**에 둔다: 초안·발행본 마크다운, 태그 줄(`#태그 …`), "AI 도움: 예/아니오" 한 줄. 페이지 본문에도 없으면 사용자에게 묻는다.

## 3. "디딤 블로그 상담" 속성
| 속성 | 유형 | 선택지 / 형식 |
|---|---|---|
| 회사명 | title | |
| 상담일 | date | |
| 유입 경로 | select | `블로그` / `지원매치` / `특허인증센터` / `소개` / `기타` |
| 경유 글 | relation | ↔ 콘텐츠 DB "상담" |
| 관심 서비스 | multi_select | `출원·심판` / `지원사업 가점용 특허·인증` / `절세·연구소` / `기타` |
| 상태 | select | `신규` / `진행 중` / `제안` / `계약` / `보류` / `종료` |
| 계약 여부 | checkbox | |
| 계약 금액 | number (원) | |
| 메모 | text | |

## 4. 상태 값 대응 (S0~S5)
| 코드 | Notion 선택지 | 의미 |
|---|---|---|
| S0 | S0 기획중 | 기획 |
| S1 | S1 초안완료 | 초안 작성됨 |
| S2 | S2 검토완료 | 검수(팩트·SEO) 통과 |
| S3 | S3 발행예정 | 이미지·최종 편집 완료, 발행 준비 |
| S4 | S4 발행완료 | 네이버 발행됨(발행일·발행 URL 기록) |
| S5 | S5 성과측정 | 성과 입력됨 |
상태 전이 조건은 didim-blog-ops 스킬이 판단한다.
