# didim-blog-performance — 성과 입력·상담(리드) 추적·키워드 순위·전환 분석·대시보드 KPI

## 1. 기능 개요 (한 문단)
발행한 글의 성과(조회수·유입 키워드 TOP3·댓글 수)를 기록하고, 블로그·지원매치 등으로 들어온 상담을 등록·갱신하며, 상담 전환율·계약 전환율·누적 계약금액과 글별 전환 기여(경유 글별 상담·계약)를 계산한다. 타깃 키워드의 네이버 순위를 기록해 변동을 보여주고, 대시보드 KPI(이번 주 발행·월간 조회수·평균 품질점수·활성 리드·총 콘텐츠), 월간 요약(조회수·상담·계약), 조회수 TOP 5, 월별 추이와 전월 대비 요약, 품질 랭킹·카테고리 비교를 원본과 같은 공식으로 산출한다. 저장소는 Notion "디딤 블로그 콘텐츠"(최근 성과 열)·"디딤 블로그 상담"·"디딤 블로그 키워드"이며 별도 성과 DB 는 두지 않는다.

## 2. 원본 코드 위치 (파일:함수/상수 목록)
| 파일 | 함수/상수 |
|---|---|
| src/actions/dashboard.ts:41-151 | getDashboardKPI (weeklyTarget 3) |
| src/actions/dashboard.ts:153-183, 256-273 | getDashboardTasks, getDashboardRecentLeads |
| src/components/dashboard/kpi-cards.tsx:1-74 | KPI 카드 5종 |
| src/actions/recommendations.ts:566-608 | getMonthlySummary |
| src/actions/recommendations.ts:680-725 | getTopPerformingPosts |
| src/actions/analytics.ts:56-90 | getMonthlyKPIFallback |
| src/actions/analytics.ts:94-134 | getMonthlyKPI |
| src/actions/analytics.ts:136-200 | getContentRankings, getCategoryMetrics |
| src/actions/analytics.ts:202-292 | getAnalyticsSummary |
| src/app/(dashboard)/analytics/page.tsx:17-95 | 성과 분석 카드 4종, formatDuration |
| src/components/analytics/quality-ranking.tsx:83-85 | TOP 10 / 하위 5 |
| src/components/analytics/category-comparison.tsx:35-38, 74-111 | normalizeValue, 레이더(최근 월) |
| src/components/analytics/keyword-ranking-tracker.tsx:26-33, 104-120 | 월 키, 변동 = 지난달 − 이번달 |
| src/lib/utils/quality-score.ts:19-46 | calculateQualityScore, getQualityGrade |
| src/actions/leads.ts:52-71, 86-210 | getLeadContents(S4·S5), createLead, updateLeadStatus, updateLead, deleteLead |
| src/app/(dashboard)/leads/page.tsx:19-40 | 리드 KPI 4종 |
| src/components/leads/pipeline-chart.tsx:23-81 | 파이프라인 전환율, 유입경로 분포 |
| src/components/leads/lead-table.tsx:37-62, lead-form.tsx:147-206 | 라벨·선택지 |
| src/actions/keywords.ts:27-145 | getHighKeywords, getKeywordRankings, saveKeywordRanking, saveContentPerformance |
| src/components/contents/performance-input.tsx | 성과 입력(주간·월간 조회수, 체류시간, 검색순위, CTA 클릭) |
| src/actions/contents.ts:395-492 | updateContentStatusWithMeta 성과 스냅샷(S5) |
| src/components/contents/status-transition-panel.tsx:177-201, 386-408 | S4→S5 D+7 조건, 성과 입력 모달 |
| supabase/migrations/001:110-162, 006:30-49 | content_metrics, category_metrics, leads, keyword_rankings |
| SPEC.md:420-426, 458-468, 517-529 | §4.1, §4.6, §4.7, §5.3 |
| docs/UPGRADE_SPEC.md:44-48, 82-98, 176-213, 251-262, 694-699 | §1.2, §2.2, §2.3, §4.2 post_metrics, §4.3 consultations, §4.5, Sprint 5 |
| skills/_DECISIONS.md §4·§6·§7 | Notion DB 구조·선택지, 측정 최소화 |

## 3. 입력
- 콘텐츠 행: contents 컬럼명 또는 Notion 한글 속성명(제목·상태·카테고리·발행일·발행 URL·조회수(최근)·댓글 수·유입 키워드 TOP3·성과 갱신일).
- 상담 행: leads 컬럼명 또는 Notion 상담 DB 속성명(회사명·상담일·유입 경로·경유 글·관심 서비스·상태·계약 여부·계약 금액·메모).
- 키워드 행: Notion 키워드 DB(키워드·우선순위·현재 순위·순위 확인일) + 새 순위 {키워드: 순위|null}, 또는 원본 keyword_rankings 월별 행.
- 성과 입력값: 조회수, 댓글 수, 유입 키워드 TOP3, (선택) 이웃 추가 수·상담 유입 여부 — 사용자가 네이버 통계에서 확인해 제공.
- 기준 시각(now), 선택 지표(content_metrics·category_metrics 행 — 원본 데이터가 있을 때).

## 4. 처리 규칙
1. 이번 주 발행 = status ∈ {S4,S5} 이고 published_at ∈ [weekStart, weekStart+7일). weekStart = now 에서 getDay()(일=0)일을 뺀 시각(시각은 now 그대로 유지) (dashboard.ts:46-57). 주간 목표 상수 3 (124).
2. 총 콘텐츠 = contents 전체 행 수(삭제 필터 없음) (60-62). 활성 리드 = visitor_status ∈ {S3,S4} (65-68).
3. 평균 품질점수 = Math.round(평균(quality_score_final, null 제외)) (71-80). 월간 조회수 = views_1m 합(기간·삭제 필터 없음) (83-91).
4. 월간 조회수 증감 = content_metrics 이번 달·지난달 views 합으로 round((이번−지난)/지난×100), 지난달 0 이면 null (94-117). 조회 범위는 `${YYYY-MM}-01` ≤ measured_at < `${YYYY-MM}-32` 문자열로 지정한다.
5. 월간 요약: totalViews = status='S4'·is_deleted=false·views_1m not null 의 views_1m 합(월 필터 없음); 상담 = contact_date ≥ 이번 달 1일인 leads 수; 계약 = 그중 contract_yn=true (recommendations.ts:566-603).
6. TOP 글 = status='S4'·미삭제·views_1m not null 을 views_1m 내림차순 5건, 각 글의 상담 수 = leads.source_content_id 일치 건수 (680-718).
7. 월별 KPI = content_metrics 를 measured_at 오름차순으로 월(YYYY-MM)별 views 합(totalViews), estimated_cta_clicks 합(conversions). avgDuration·publishedCount·leadCount·contractAmount 는 0 (analytics.ts:108-126). 데이터가 없으면 contents 의 published_at 월별로 views_1m 합·cta_clicks 합·발행 수(publishedCount) (56-86).
8. 성과 요약: 마지막 두 달(current, previous)로 각 증감 % = (cur−prev)/prev×100 (prev 0 이면 0), 전환율 = conversions/totalViews×100, 전환율 증감 = (cur율−prev율)/prev율×100. 한 달뿐이면 증감 0 (202-273). 카드: 이번 달 조회수, 평균 체류시간("m분 s초"), 발행 건수, 전환율(소수 2자리) (analytics/page.tsx:58-91).
9. 품질 랭킹 = quality_score_final not null 을 내림차순, TOP 10 과 하위 5(최저부터) (analytics.ts:136-161; quality-ranking.tsx:83-85).
10. 카테고리 비교 = category_metrics 의 최신 month 행만, 축(발행률·조회수·체류시간·전환수)마다 값/최댓값(최소 1)×100 반올림 (category-comparison.tsx:35-111).
11. 품질점수 = 조회수/월최대×100×0.4 + 체류시간/월최대×100×0.3 + CTA클릭/월최대×100×0.3, 등급 80+ excellent·60+ good·40+ average·20+ poor·그 외 critical (quality-score.ts:19-46; SPEC.md:517-529).
12. 성과 저장(원본): contents 의 views_1w·views_1m·avg_duration_sec·search_rank·cta_clicks 를 갱신하고, content_metrics 에 (content_id, 오늘) upsert — views=views_1m??0, estimated_cta_clicks=cta_clicks??0, source='manual' (keywords.ts:96-145).
13. S4→S5 는 발행 후 floor(경과일) ≥ 7 필요. 성과 스냅샷은 views_1w→views_1w, comments→cta_clicks, notes 에 `[성과 1주차] 조회수 n · 댓글 n · 이웃 +n · 상담 유입|없음` (status-transition-panel.tsx:177-201, 386-408; contents.ts:457-483).
14. 새 리드: 회사명 trim 필수, contact_date=오늘, source_content_id 는 source='blog' 일 때만, visitor_status='S3', contract_yn=false (leads.ts:86-111). 경유 글 후보 = status S4·S5 글 (52-62).
15. 리드 KPI: 총 리드, 상담 전환율 = round((S4+S5)/전체×100), 계약 전환율 = round(S5/(S4+S5)×100), 누적 계약금액 = contract_yn 이고 금액 있는 건의 합 (leads/page.tsx:20-37). 파이프라인 S3→S4 = round((S4+S5)/(S3+S4+S5)×100), S4→S5 = round(S5/(S4+S5)×100); 유입경로 분포는 0 건 제외 (pipeline-chart.tsx:43-81).
16. 라벨: 유입 blog 블로그·referral 소개·other 기타 / 서비스 tax_consulting 절세 컨설팅·lab_management 연구소 관리·venture_cert 벤처인증·invention_cert 발명인증·patent 특허·other 기타 / 상담결과 consulted 상담완료·proposal_sent 제안서발송·pending 대기중·lost 실패 / 단계 S3 리드·S4 상담·S5 계약 (lead-table.tsx:37-62).
17. 키워드 순위: 추적 대상은 priority='HIGH' (keywords.ts:27-42). 월 키 'YYYY-MM-01', (keyword_id, month) upsert (69-92). 변동 = 지난달 순위 − 이번 달 순위(양수 개선), 둘 다 있을 때만 (keyword-ranking-tracker.tsx:26-33, 104-108).

## 5. 출력
- snapshot: notion_content_update{조회수(최근), 댓글 수, 유입 키워드 TOP3, 성과 갱신일, (상태)}, report_only{이웃 추가, 상담 유입}, 원본 형식(contents_update_original, notes_append_original).
- metric-row: 원본 contents 갱신값 + content_metrics upsert 행.
- dashboard: kpi{weeklyPublished, weeklyTarget, monthlyViews, monthlyViewsChange, avgQualityScore, activeLeads, totalContents …}, cards.
- summary / top-posts / analytics / rankings / radar / quality: 원본 반환 구조와 같은 키.
- leads stats: kpi_cards 4, pipeline, pipeline_rates, stage_counts, source_distribution, interested_service_counts. attribution: by_post[]. new-lead: notion_row. keyword-rank: rows + notion_keyword_updates.
- 사용자 응답: 표·카드 형식, Notion 반영 내역.

## 6. 예외·오류 처리
- 원본: 조회 실패 시 0/빈 배열과 한국어 오류("KPI 데이터를 불러올 수 없습니다.", "리드 목록을 불러올 수 없습니다.", "성과 데이터 저장에 실패했습니다.", "순위 저장에 실패했습니다." 등) (각 catch). content_metrics upsert 실패는 경고만 (keywords.ts:135-138).
- 회사명 공백 → "회사명은 필수 입력 항목입니다." (leads.ts:91-93). 스킬은 선택지 밖 유입 경로·관심 서비스·상태도 거부하고 허용값을 보여준다.
- 성과 수치가 없으면 기록하지 않는다(원본 모달: "비워두면 저장하지 않습니다."). 데이터 부족 시 요약은 0, 증감 0/null.
- Notion 쓰기 실패 시 실패 속성과 오류를 보여주고 반영할 값 표를 준다.

## 7. 데이터 저장 (백오피스 테이블 → 스킬에서의 대체)
| 백오피스 | Notion (DB · 속성 · 타입) | 비고 |
|---|---|---|
| contents.views_1w / views_1m, content_metrics.views, post_metrics.views(명세) | 콘텐츠 · 조회수(최근) · number | 최근값 하나, 덮어씀 |
| post_metrics.top_keywords(명세) | 콘텐츠 · 유입 키워드 TOP3 · text | |
| post_metrics.comments(명세), 원본 S5 의 cta_clicks 오매핑 | 콘텐츠 · 댓글 수 · number | |
| content_metrics.measured_at, post_metrics.recorded_date | 콘텐츠 · 성과 갱신일 · date | |
| post_metrics.neighbor_adds, 스냅샷의 이웃 추가 | (저장 안 함) | 보고만 |
| contents.avg_duration_sec, search_rank, cta_clicks, quality_score_1st/final, quality_grade, content_metrics 시계열, category_metrics | (저장 안 함) | 측정 최소화 — 필요 시 계산·보고 |
| leads.company_name | 상담 · 회사명 · title | |
| leads.contact_date | 상담 · 상담일 · date | |
| leads.source | 상담 · 유입 경로 · select(블로그/지원매치/특허인증센터/소개/기타) | blog→블로그, referral→소개, other→기타 |
| leads.source_content_id | 상담 · 경유 글 · relation ↔ 콘텐츠 · 상담 | |
| leads.interested_service | 상담 · 관심 서비스 · multi_select(출원·심판/지원사업 가점용 특허·인증/절세·연구소/기타) | patent→출원·심판, venture_cert·invention_cert→지원사업 가점용 특허·인증, tax_consulting·lab_management→절세·연구소 |
| leads.visitor_status + consultation_result | 상담 · 상태 · select(신규/진행 중/제안/계약/보류/종료) | S3→신규, S4+consulted→진행 중, +proposal_sent→제안, +pending→보류, +lost→종료, S5→계약 |
| leads.contract_yn / contract_amount | 상담 · 계약 여부 (checkbox) / 계약 금액 (number, 원) | |
| leads.notes (+ contact_name, contact_info) | 상담 · 메모 · text | 담당자명·연락처는 열이 없어 메모에 |
| leads.assigned_to, created_at, updated_at | (없음) | |
| keyword_rankings.rank / month | 키워드 · 현재 순위 (number) / 순위 확인일 (date) | 이력 없음, 최근값 |
| keyword_pool.priority | 키워드 · 우선순위 (높음/보통/낮음) | |

DB 위치: 콘텐츠 `collection://463bc815-11ab-4290-9d86-22bd1aa9cfed`, 상담 `collection://e1272822-7efd-4850-b8c8-cfce02db7d00`, 키워드 `collection://4e0fae54-aeb3-48dd-b948-b78886a8e859` (상위 "DIDIM 블로그 운영").

## 8. 원본 코드와 달라진 점
1. **post_metrics·consultations 미구현 → Notion 열로 대체**: UPGRADE_SPEC §4.2·§4.3 의 post_metrics(유입 키워드 TOP3·댓글·이웃 추가)와 consultations 테이블은 레포 마이그레이션에 없고, 코드는 contents 성과 컬럼·content_metrics·leads 를 쓴다. 스킬은 _DECISIONS.md §4·§7 에 따라 콘텐츠 DB 의 최근 성과 열(조회수(최근)·유입 키워드 TOP3·댓글 수·성과 갱신일)과 상담 DB 로 대체하고 시계열 이력은 두지 않는다. 이웃 추가 수는 열이 없어 보고만 한다.
2. **댓글 수 오매핑 수정**: 원본 S5 스냅샷은 댓글 수를 cta_clicks 에 저장한다 (contents.ts:461-463). 스킬은 `댓글 수` 열에 쓴다. 원본 형식 값은 `contents_update_original` 로 함께 출력.
3. **상담 상태·유입 경로·관심 서비스 체계 변경**: 원본 visitor_status(S3/S4/S5)+consultation_result, source 3종, interested_service 6종 단일값 → Notion 상태 6종, 유입 경로 5종(지원매치·특허인증센터 추가), 관심 서비스 4종 다중선택. 7절 표로 매핑하고 전환율 공식은 매핑된 S3/S4/S5 로 원본과 같게 계산한다. 원본 데이터 입력 시 결과가 원본과 일치함을 확인했다.
4. **키워드 순위 이력 없음**: 원본은 keyword_rankings 월별 행으로 이번 달/지난달을 비교한다. Notion 키워드 DB 는 `현재 순위`·`순위 확인일` 하나뿐이라, 새 순위를 쓸 때 이전 값과의 변동을 계산해 보고에 남기고 덮어쓴다(`--new-ranks`). 원본 방식(`--rankings`)도 유지.
5. **주간 목표**: 원본 상수 3 → 결정 사항 '주 1편'에 맞춰 기본 1(`--weekly-target` 으로 변경 가능).
6. **발행 글 범위**: 월간 요약·TOP 글은 원본이 S4 만 센다. Notion 에서 성과 입력 후 S5 로 넘어간 글이 빠지지 않도록 기본 S4·S5, `--s4-only` 로 원본 동작.
7. **월간 조회수 증감**: 원본 쿼리의 상한 `${YYYY-MM}-32` 는 존재하지 않는 날짜라 Postgres 에서 오류가 나고, 결과가 빈 배열로 처리되어 증감이 항상 null 이었을 가능성이 높다(확인 필요). 스킬은 의도대로 월 접두어로 집계한다.
8. **월별 KPI 미계산 항목**: 원본 getMonthlyKPI 는 avgDuration·publishedCount·leadCount·contractAmount 를 0 으로 둔다(미구현). 스킬도 같은 값을 내고 그 사실을 출력에 표시한다.
9. **품질점수 저장 경로 없음**: quality-score.ts 를 호출해 quality_score_final 을 쓰는 코드가 없어 평균 품질점수·품질 랭킹·S4→S5 의 quality_measured 조건이 실제로는 비어 있다. 스킬은 `quality` 하위 명령으로 계산만 제공(발행·미삭제 글 대상)하고 저장하지 않는다. SPEC §4.7 은 'Bottom 10'이지만 코드는 하위 5.
10. **전환 기여 지표 추가**: 원본은 TOP 5 글의 상담 건수만 센다. UPGRADE_SPEC Sprint 5 '전환 기여 분석(글별 전환율)'을 위해 `attribution`(경유 글별 상담·진행·계약·금액, 조회수 대비 상담 %)을 추가했다.
11. **Notion 키 정규화·시간대**: 스크립트가 한글 속성명·관계 값(JSON 배열/제목)을 받는다. 서버 함수 재현은 UTC, 성과 갱신일은 KST 날짜.
12. **메모 비사용**: 원본은 성과·사유를 notes 에 누적한다. 스킬은 메모 열을 사람 전용으로 두고 쓰지 않는다(_DECISIONS.md §7).

## 9. 다른 스킬과의 연결
- 받는 입력: didim-blog-ops(S4 발행 글·발행일·D+7 판정, S5 전이, 이번 달 발행 현황), didim-blog-health(업데이트 필요 글 목록), didim-blog-planner(키워드 DB·추천 소스), didim-blog-core(브랜드·명칭 규칙).
- 넘기는 출력: didim-blog-planner(조회수 TOP 글 → 후속편 추천, 순위 하락 키워드), didim-blog-health(조회수(최근) → 내부 링크 인기글 가점), didim-blog-ops(성과 입력 완료 → S5).
