# didim-blog-ops — 콘텐츠 운영(상태 전이·대표 검수·SLA·발행 캘린더·12주 스케줄)

## 1. 기능 개요 (한 문단)
디딤 블로그 글 한 편이 기획(S0)에서 성과측정(S5)까지 가는 운영 흐름을 관리한다. 허용된 상태 전이만 수행하고, 전이별 필수/권장 조건(본문 500자·태그 10개·CTA·대표 검수·SEO 70·교차검증·이미지·발행일·D+7)을 판정하며, 대표 검수(체크리스트 3개 이상 승인 → S2·S3 연쇄 자동 전이 / 수정 요청 / 재검수)를 기록한다. 발행일(화요일)로부터 SLA 마감일 5개(D-5·D-3·D-2·D-1·D-0)를 역산하고 지연을 알리며, 발행 캘린더·주 1편 4주 카테고리 로테이션(skills/_DECISIONS.md §3)·발행 비율·이번 달 발행 현황을 계산한다. 백오피스 DB 대신 Notion "디딤 블로그 콘텐츠" DB(`collection://463bc815-11ab-4290-9d86-22bd1aa9cfed`) 또는 사용자 입력을 쓴다.

## 2. 원본 코드 위치 (파일:함수/상수 목록)
| 파일 | 함수/상수 |
|---|---|
| src/lib/constants/content-states.ts:4-22 | CONTENT_STATES, CONTENT_STATUS_OPTIONS |
| supabase/seed.sql:18-26 (= SPEC.md:405-414) | state_transitions 시드 7행 |
| supabase/migrations/001_initial_schema.sql:46-80, 182-192 | contents, state_transitions DDL |
| supabase/migrations/002·007·012·014 | contents 추가 컬럼, review_status/review_memo, state_transitions_log |
| src/actions/contents.ts:111-129 | getStateTransitions (entity_type='content') |
| src/actions/contents.ts:143-234 | createContent (W{주차}-{순번} ID, SLA 기록, status S0) |
| src/actions/contents.ts:238-304 | validateTransition |
| src/actions/contents.ts:308-382 | updateContentStatus (칸반 드래그용) |
| src/actions/contents.ts:411-527 | updateContentStatusWithMeta (URL·성과·사유·강제 플래그) |
| src/actions/contents.ts:604-625 | deleteContent (소프트 삭제) |
| src/actions/contents.ts:678-799 | approveReview, requestRevision, resetReviewStatus |
| src/components/contents/status-transition-panel.tsx:65-226 | buildChecks, findForwardTransition, findReverseTransitions |
| src/components/contents/status-transition-panel.tsx:309-430 | handleForwardClick, handleConfirmRecommendedUnmet, handleConfirmForced, handleSubmitPublish, handleSubmitPerformance, handleSubmitReverse |
| src/components/contents/review-panel.tsx:39-173 | REVIEW_CHECKLIST, handleApprove(연쇄 전이), handleRevisionRequest, handleResetReview |
| src/components/contents/kanban-board.tsx:149-254 | onDragEnd, handleProceedAnyway |
| src/app/(dashboard)/contents/[id]/content-detail-client.tsx:72-92, 361-417 | countImageMarkers, 발행 전 미완료 항목 배너 |
| src/actions/ai.ts:710-809 | saveAiDraftToContent (status S1 자동) |
| src/app/(dashboard)/contents/ai-editor/[id]/ai-editor-client.tsx:1014-1062 | Phase 3 Finalization (publish_date 다음 화요일) |
| src/lib/utils/date-helpers.ts:16-29 | calculateSlaDates, getNextTuesday |
| src/lib/utils/sla-checker.ts:20-71 | checkSla, getSlaStatus |
| src/actions/dashboard.ts:185-254 | getDashboardSlaAlerts |
| src/components/common/sla-indicator.tsx:41-52 | calculateSLAStatus |
| src/actions/calendar.ts:14-91 | getCalendarSchedules |
| src/components/calendar/ratio-gauge.tsx:5-85 | CATEGORY_CONFIG, GCD 비율, 목표 2:1:1 |
| src/components/calendar/monthly-calendar.tsx:21-58 | CATEGORY_COLORS, 시작 월, getScheduleForDay |
| src/actions/recommendations.ts:496-557 | getMonthlyPublishProgress |
| src/lib/recommendation-engine.ts:92-115 | getPrimaryCategoryId, calcMonthlyStats |
| src/lib/constants/schedule-data.ts:12-25, 95-116 | SCHEDULE_DATA, DEFAULT_BLOG_START_DATE, getCurrentWeek, getMonthWeeks (폐기, 기록용) |
| seed_data/schedule_12weeks.json | 12주 스케줄 (폐기, 기록용) |
| skills/_DECISIONS.md §1~§4, §6 | 카테고리 정본(categoryNo), 4주 로테이션, Notion DB 스키마 |
| SPEC.md:480-490, 531-539, 446-450 | §5.1 전이 규칙, §5.4 SLA, §4.4 캘린더 |
| docs/UPGRADE_SPEC.md:24-42 | §1.1 콘텐츠 상태 |

## 3. 입력
- 콘텐츠 레코드(JSON): contents 컬럼명 또는 Notion 한글 속성명(제목·상태·카테고리·2차 분류·categoryNo·디딤 소식 종류·발행예정일·발행일·태그·검수 상태·수정 횟수·SEO 점수·SEO 판정·교차검증, 본문은 페이지 `## 본문`). 원본 필드: status, body, tags, category_id, review_status, revision_count, publish_date, publish_due 외 *_due, *_done_at, published_at, quality_score_final, ai_generation_id.
- 전이 목표 상태, 전이 규칙 목록(기본: 시드 7행), SEO 정규화 점수(0~100), 교차검증 수행 여부·심각 이슈 수, 이미지 마커 수(생략 시 본문에서 계산).
- 검수: 체크한 항목 id 목록 / 수정 요청 메모.
- 날짜: 발행일(YYYY-MM-DD), 기준 시각(now, ISO), 기존 콘텐츠 ID 목록.

## 4. 처리 규칙
1. 상태는 S0 기획중·S1 초안완료·S2 검토완료·S3 발행예정·S4 발행완료·S5 성과측정 6개다 (content-states.ts:4-11).
2. 허용 전이는 state_transitions 행으로만 정한다: S0→S1, S1→S2, S2→S3, S3→S4, S4→S5, S1→S0, S2→S1 (seed.sql:20-26). 행이 없으면 "{from}에서 {to}로의 전이는 허용되지 않습니다." 로 거부한다 (contents.ts:255-261, kanban-board.tsx:184-196).
3. DB conditions 중 코드가 평가하는 키는 ai_generation_done·review_done·image_done·revision_count_lt_3·quality_measured 5개다 (contents.ts:274-288). briefing_done·seo_required_pass·final_edit_done·scheduled_time_reached·major_revision·minor_revision 은 평가하지 않는다.
4. 칸반 드래그는 validateTransition 실패 조건을 모두 '권장 항목 미완료' 경고로 보여주고 "그대로 진행"을 허용한다 (kanban-board.tsx:198-212, 232-254). 커밋 abe96ec 에서 차단 → 경고로 완화되었다.
5. 상세 패널의 정방향 전이는 buildChecks 의 필수(required)·권장 조건으로 판정한다 (status-transition-panel.tsx:65-204):
   - S1→S2 필수: 공백 제외 본문 ≥ 500자, 태그 ≥ 10, CTA(`━━` 또는 `admin@didimip` 포함, CAT-C 면제), review_status='approved' / 권장: SEO ≥ 70, 교차검증 수행 && 심각 0건, 이미지 마커 ≥ 3 (78-145).
   - S2→S3 필수: publish_date 또는 publish_due 존재 / 권장: 이미지 마커 ≥ 1 (147-170).
   - S3→S4: 조건 없음, 네이버 URL(선택)·발행일시(기본 현재) 입력 (172-175, 372-384).
   - S4→S5 필수: published_at 존재 및 발행 후 floor(경과일) ≥ 7 (177-201).
6. 필수 미충족이면 전이 버튼이 비활성되고, admin 은 '강제 전환'으로 진행할 수 있다(이력에 is_forced=true, force_reason '관리자 강제 전환 (조건 미충족)') (status-transition-panel.tsx:354-370, 533-544; contents.ts:514-515).
7. 권장만 미충족이면 확인 모달("필수 조건은 충족되었지만…") 후 진행한다 (status-transition-panel.tsx:329-333, 735-774).
8. 역행 전이는 사유 입력이 필수이며 notes 에 `[역행 전이 사유] …` 로 기록한다 (status-transition-panel.tsx:415-430; contents.ts:484-487).
9. 전이 시 자동 기록: S1→draft_done_at, S2→review_done_at, S3→image_done_at, S4→published_at(입력값 우선), 항상 updated_at (contents.ts:343-352, 445-454). 역행 전이도 같은 규칙으로 해당 타임스탬프를 덮어쓴다.
10. 메타는 notes 끝에 `\n\n── {YYYY-MM-DD HH:MM} ({새상태}) ──\n` + `[네이버 URL] …` / `[성과 1주차] 조회수 n · 댓글 n · 이웃 +n · 상담 유입|없음` / `[전이 사유]|[역행 전이 사유] …` 로 덧붙인다 (contents.ts:466-492). 이력은 state_transitions_log 에 from/to/사용자/강제 여부를 남긴다 (contents.ts:506-517, 014:76-86).
11. 대표 검수 패널은 status=S1 일 때만 보인다 (review-panel.tsx:173). 체크리스트 5개 중 3개 이상이어야 승인할 수 있다 (39-45, 70).
12. 승인 시 review_status='approved', reviewer_id, review_done_at=now, review_memo='[검수 승인] 체크: {id 목록}' (contents.ts:695-703). 이어서 본문 500자·태그 10·CTA(다이어리 면제) 충족 시 S2 로, 그 후 publish_date/publish_due 가 있으면 S3 로 연쇄 전이한다(SEO·교차검증·이미지 권장 조건은 보지 않음) (review-panel.tsx:99-132).
13. 수정 요청은 메모 필수, review_status='revision_requested', revision_count+1 (review-panel.tsx:138-142; contents.ts:749-757). 재검수 요청(리셋)은 review_status='pending', review_memo=null (contents.ts:779-786).
14. AI 초안을 저장하면 status='S1', draft_done_at=now 로 자동 전이한다 (ai.ts:744-753, 775-785). Phase 3 완료 시 본문·태그 10개·publish_date=다음 화요일·seo_score 를 자동 저장한다 (ai-editor-client.tsx:1014-1062).
15. 새 콘텐츠 ID = `W{ceil((발행일 − 2026-01-05)/7일) 2자리}-{같은 접두어 기존 수+1 2자리}`, 발행일 미지정 시 다음 화요일, status S0, review_status pending, health_status HEALTHY (contents.ts:148-219).
16. SLA 마감일 = 발행일 −5(목, AI 주제선정)·−3(토, 초안)·−2(일, 검수)·−1(월, 이미지)·0(화, 발행) (date-helpers.ts:16-24; SPEC.md:531-539). 다음 화요일은 기준일 이후의 화요일(기준일이 화요일이면 +7일) (date-helpers.ts:27-29, date-fns nextTuesday).
17. SLA 단계 상태: 완료일시가 있으면 completed, 마감일 없으면 on_track, 마감일이 오늘이면 due_today, 지났으면 overdue, 그 외 on_track (sla-checker.ts:59-71). 단계별 완료 필드는 briefing_done_at·draft_done_at·review_done_at·image_done_at·published_at (sla-checker.ts:20-57).
18. 대시보드 SLA 알림: S0~S3 글을 publish_date 오름차순 10건 조회, 상태별 마감 필드(S0 briefing_due·S1 draft_due·S2 review_due·S3 publish_due)로 diffDays=ceil((마감−now)/1일); <0 초과, ≤1 주의(0 오늘·1 내일 마감), 그 외 정상; 초과→주의→정상 순 5건 (dashboard.ts:193-249).
19. SLA 인디케이터: 남은 일수 <0 초과, ≤1 주의, >30 미래, 그 외 정상 (sla-indicator.tsx:41-52).
20. 캘린더 항목은 schedules 테이블이 비어 있으면 contents 의 publish_date 가 있는 글로 만들고, S4·S5=published, S1~S3=in_progress, S0=planned 로 표시한다 (calendar.ts:53-83). 하루 칸에는 첫 1건만 표시하며 시작 월은 2026년 1월이다 (monthly-calendar.tsx:43, 56-58).
21. 비율 게이지: categoryId 가 정확히 CAT-A/CAT-B/CAT-C 인 항목 수를 세고, 첫 값(0이면 1)부터 GCD 로 나눠 "a:b:c" 로 표시, 목표 "2:1:1". 막대 폭 = 개수/전체 항목 수×100, 10% 이상만 "n건" 라벨 (ratio-gauge.tsx:16-27, 41-54, 84). 기간 필터는 없다.
22. 이번 달 발행 현황: status='S4'·미삭제·published_at ≥ 이번 달 1일 글을 1차 카테고리(getPrimaryCategoryId)로 세어 현장수첩 /2, IP 라운지 /1, 다이어리 /1 (recommendations.ts:500-532; recommendation-engine.ts:92-115).
23. (원본) 12주 스케줄은 seed_data/schedule_12weeks.json, 주차 = ceil((now − 2026-01-06)/7일), 4주 묶음 = [(ceil(w/4)−1)×4+1 … +3] 중 ≤12 (schedule-data.ts:95-116). 스킬은 이를 폐기하고 아래 24로 대체한다.
24. (결정 사항) 주 1편 + 4주 로테이션: ISO 주차(KST) w 의 슬롯 = (w−1) mod 4 → 지원사업·인증과 특허(25) / 출원·심판 실무(27) / 지식재산 경영(24) / 사례(26, 사용 가능한 사례 메모 없으면 27). 같은 카테고리 연속 2주면 경고. 디딤 소식(28)·디딤 다이어리(17)는 로테이션 밖. 비율 목표 1:1:1:1, 월 목표 = 그 달 화요일들의 슬롯 수 (_DECISIONS.md §3; scripts/calendar_ratio.py).
25. (결정 사항) 레거시 카테고리는 통계에서 신규로 합산: 9·10·11·12→25, 23→27, 18→26, 13·14·15→24, 16→28, 19·20→17. CAT-* 별칭은 seed.sql 기준(CAT-B-01=AI와 IP(15), CAT-B-02=특허 전략 노트(14)).

## 5. 출력
- 전이 판정 JSON(scripts/transition_check.py check): rule, direction, kind(blocked/blocked_required/confirm_recommended/needs_reason/ok), required_checks·recommended_checks(id·label·passed·detail), 칸반 DB 조건 경고, 미평가 조건 키, 입력 필요 항목, 전이 시 기록할 필드, 경고.
- 검수 결과 JSON(review approve/revision/reset): 변경 후 레코드, 연쇄 전이 단계.
- SLA: 마감일 5개(요일 포함), 단계 상태, 대시보드 알림 5건, 콘텐츠 ID.
- 캘린더 항목 목록, 비율(현재/목표), 월간 발행 현황, 현재 주차·스케줄 항목.
- 사용자 응답: 판정 요약 + 체크리스트 표 + Notion 반영 내역(또는 반영할 값 표).

## 6. 예외·오류 처리
- 규칙 없는 전이 → kind=blocked, 원본 문구 그대로 안내 (contents.ts:258).
- 검수 승인 체크 3개 미만 → "최소 3개 항목을 체크해야 승인할 수 있습니다." (review-panel.tsx:82-85). 수정 요청 메모 공백 → "수정 사항을 입력해주세요." (138-142). 역행 사유 공백 → "되돌리기 사유를 입력해주세요" (status-transition-panel.tsx:416-418).
- 원본 서버 액션은 인증 실패·Supabase 오류를 `{fallback}: ({code}) {message} [details] 힌트: …` 형식으로 반환한다 (contents.ts:24-36). 스킬에서는 Notion 쓰기 실패 시 실패 속성과 오류 메시지를 그대로 보여주고, 반영할 값 표를 대신 준다.
- 검수 컬럼이 없으면 42703 오류(012 마이그레이션 필요) — Notion 에서는 "검수 상태" 속성이 없으면 사용자에게 추가를 요청한다.
- 발행일이 화요일이 아니면 계산은 하되 경고한다(스킬 추가).
- 스크립트 입력 JSON 오류 → Python 예외 메시지 출력, 사용자에게 필드명을 확인시킨다.

## 7. 데이터 저장 (백오피스 테이블 → 스킬에서의 대체)
Notion "디딤 블로그 콘텐츠" (https://app.notion.com/p/4f21a8b7e84d4c818de1c673ed9cbbcb, data source `collection://463bc815-11ab-4290-9d86-22bd1aa9cfed`, 상위 "DIDIM 블로그 운영"). 속성·선택지는 _DECISIONS.md §4·§6·§7 과 실제 스키마 그대로. 레거시 카테고리 원래 이름은 "2차 분류" 열.

| 백오피스 | Notion 속성 (타입) | 비고 |
|---|---|---|
| contents.title | 제목 (title) | |
| contents.status | 상태 (select: S0 기획중 / S1 초안완료 / S2 검토완료 / S3 발행예정 / S4 발행완료 / S5 성과측정) | |
| contents.category_id, secondary_category | 카테고리 (select: 지원사업·인증과 특허 / 출원·심판 실무 / 사례 / 지식재산 경영 / 디딤 소식 / 디딤 다이어리 / 레거시), categoryNo (number), 2차 분류 (select) | CAT-* → categoryNo 별칭 |
| contents.target_keyword | 타깃 키워드 (text) | |
| contents.publish_date, scheduled_at | 발행예정일 (date) | 초안 단계부터 기입, SLA 역산·캘린더 기준 |
| contents.published_at | 발행일 (date) | 실제 발행 후에만 기입(S4) |
| contents.notes 의 [네이버 URL] | 발행 URL (url) | |
| content_recommendations (010) | 추천 소스 (키워드 풀/뉴스/지원매치 리포트/로테이션/직접 입력), 추천 피드백 (대기/적합/부적합), 부적합 사유 | didim-blog-planner |
| contents.views_1w/views_1m | 조회수(최근) (number) | didim-blog-performance |
| (post_metrics 명세) top_keywords, comments | 유입 키워드 TOP3 (text), 댓글 수 (number), 성과 갱신일 (date) | |
| contents.series_id, series_order | 시리즈 (text), 시리즈 회차 (number) | |
| contents.health_checked_at | 마지막 업데이트일 (date) | didim-blog-health |
| contents.review_status | 검수 상태 (select: 미검수 / 승인 / 수정 요청 / 재검수 요청) | pending/approved/revision_requested |
| contents.revision_count | 수정 횟수 (number) | |
| contents.review_memo | 검수 메모 (text) | 회차마다 `[n회차] …` 줄 추가 |
| contents.seo_score / seo_checks.verdict | SEO 점수 (number) / SEO 판정 (select: 통과 / 수정 필요 / 발행 불가) | didim-blog-seo 가 씀, ops 는 전이 조건으로 읽음 |
| (교차검증 결과) | 교차검증 (select: 미실시 / 통과 / 심각 이슈 남음), 교차검증일 | didim-blog-factcheck 가 씀, ops 는 전이 조건으로 읽음 |
| contents.tags | 태그 (text, 쉼표 10개) | S1→S2 필수 조건 |
| (디딤 소식 사무소 소식) | 디딤 소식 종류 (select: IP 뉴스 / 사무소 소식) | 사무소 소식 = CTA 면제 |
| state_transitions_log, notes 의 [전이 사유]·[역행 전이 사유] | 페이지 본문 `## 검수 기록` | KST 시각 + from→to + 사유 |
| contents.notes | 메모 (text) | 사람 자유 기록 전용 — 스킬은 쓰지 않음 |
| leads.source_content_id | 상담 (relation ↔ 상담 DB 경유 글) | |
| contents.body | 페이지 본문 `## 본문` 섹션 | |
| *_due 5개, *_done_at 4개 | (저장 안 함) | 발행일에서 역산 / 상태로 추정 |
| id, target_audience, author/reviewer/designer_id, avg_duration_sec, search_rank, cta_clicks, quality_*, seo_keywords, image_alt_texts, ai_*, is_deleted | (저장 안 함) | 측정 최소화(_DECISIONS.md §4) |
| health_status, health_checked_at | 건강 상태, 마지막 업데이트일 | didim-blog-health |
| state_transitions | 스크립트 내장 시드 7행 / `--transitions` JSON | |
| schedules | (폐기) 4주 로테이션 계산 | |

전체 컬럼별 표: skills/didim-blog-ops/references/notion-content-db.md §2.

## 8. 원본 코드와 달라진 점
1. **정방향 판단 기준**: 원본 상세 패널은 `is_reversible=false` 행을 '다음 단계'로 고른다 (status-transition-panel.tsx:210-219). 시드의 S1→S2 행이 `is_reversible=true` (seed.sql:21)라서 원본 화면에서는 S1 에 '다음 단계' 버튼이 없고 S1→S2 가 '되돌리기' 목록에 나타나는 모순이 있다. 스킬은 상태 순서(S0<…<S5)로 방향을 판단하고, 시드 값과 다르면 경고를 출력한다. 실DB 행이 설정 화면에서 수정되었는지는 확인 필요.
2. **조건 이원화 정리**: 원본은 칸반(DB conditions, 경고만)과 상세 패널(코드 상수 buildChecks, 필수 차단)이 다른 기준을 쓴다. CLAUDE.md 의 "상태 전이 규칙은 state_transitions 테이블에서 읽어올 것(하드코딩 금지)"과 달리 필수/권장 조건은 코드에 하드코딩되어 있다. 스킬은 허용 전이 = 규칙 데이터, 판정 = 상세 패널 기준(커밋 47cc218·abe96ec 최종 동작)으로 하고, DB 조건 결과는 참고 경고로 함께 보여준다.
3. **SLA 재계산**: 원본은 발행일을 바꿔도(Phase 3 자동 마무리 포함) briefing_due 등 마감일을 다시 계산하지 않는다 (ai-editor-client.tsx:1046-1049). 스킬은 마감일을 저장하지 않고 항상 현재 발행예정일에서 역산하므로 어긋나지 않는다.
4. **Phase 3 발행일 덮어쓰기**: 원본 주석은 "기존에 없으면 다음 화요일"이지만 코드는 항상 덮어쓰고, 브라우저(KST)에서 `toISOString().slice(0,10)` 을 써서 오전 9시 이전에는 월요일 날짜가 될 수 있다 (ai-editor-client.tsx:1026-1028). 스킬은 기존 발행일이 있으면 유지하고, 없을 때만 KST 날짜 기준 다음 화요일을 쓴다.
5. **briefing_done_at 미기록**: 원본에 이 값을 쓰는 코드가 없어 D-5 단계가 마감 후 항상 기한 초과가 된다. 스킬은 주제선정/브리핑 완료 시 기록하도록 안내한다(계산 규칙은 동일).
6. **네이버 URL·성과·사유·검수 저장 위치**: 원본은 네이버 URL·성과·전이 사유를 notes 문자열 접두어로 (contents.ts:466-492), 검수는 review_status/review_memo(마지막 1건 덮어쓰기)로 저장한다. 스킬은 _DECISIONS.md §7 에 따라 `발행 URL`, 성과 열(조회수(최근)·댓글 수·유입 키워드 TOP3·성과 갱신일), `검수 상태`·`수정 횟수`·`검수 메모`(회차 줄 누적, 리셋 시에도 이력 유지) 열로 나누고, 전이 로그·역행 사유·강제 전환은 페이지 본문 `## 검수 기록`에 쓴다. 메모 열은 사람 전용이라 쓰지 않는다. 별도 성과 DB 는 없다.
7. **강제 전환 권한**: 원본은 admin 역할만 가능하다. 스킬 환경에는 역할이 없으므로 사용자가 명시적으로 "강제"를 요청할 때만 진행하고 사유를 기록한다.
8. **카테고리·비율·스케줄 (결정 사항)**: 원본 게이지는 categoryId 가 정확히 CAT-A/B/C 인 것만 세고 목표 2:1:1, 월간 현황 목표 2/1/1, 12주 스케줄을 쓴다. 스킬은 _DECISIONS.md 에 따라 네이버 categoryNo 정본·레거시 합산으로 세고, 목표를 4주 로테이션 1:1:1:1(월 목표=화요일 슬롯 수)로 바꿨으며 12주 스케줄은 기록용으로만 남겼다. GCD 표기 알고리즘(첫 값 0이면 1부터)은 유지. 월간 현황은 원본(S4만)과 달리 S4·S5 를 발행으로 센다(Notion 에서 S5 로 넘어간 글도 이번 달 발행이므로). 로테이션 기준 (w−1) mod 4(ISO 주차, KST)는 didim-blog-planner(recommend.py rotation_slot)와 같은 식이다. 단 ops 는 '발행 화요일이 속한 주'로, planner 는 '오늘이 속한 주'로 슬롯을 정하므로 수~일요일에 기획하면 두 스킬의 카테고리가 한 칸 어긋날 수 있다 — 확인 필요.
9. **날짜 해석**: 'YYYY-MM-DD' 는 JS 와 같이 UTC 자정으로, 화면 판정(checkSla)은 KST 오늘 날짜 비교로 포팅했다. 서버 함수(알림·월간 현황)는 UTC 기준.
10. **자동 발행 없음**: 시드의 S3→S4 "예약 시간 도래 (자동)"은 원본에도 구현이 없다. 스킬도 자동 전이를 하지 않고, 사용자가 네이버 발행을 확인한 뒤 S4 로 바꾼다.
11. **Notion 필드로 판정**: 마감일 5개·완료일시는 저장하지 않는다. 마감일은 발행예정일에서 매번 역산하고, 완료 여부는 상태로 추정(S1↑ 주제선정·초안, S2↑ 검수, S3↑ 이미지, S4↑ 발행)한다. S1→S2 판정의 SEO 점수·교차검증·검수 승인은 원본 화면 상태값 대신 `SEO 점수`·`교차검증`·`검수 상태` 열로 읽고, `SEO 판정`이 있으면 '발행 불가 아님'을 권장 항목으로 추가했다(원본에 없음). 열이 없는 옛 데이터만 메모 기록 줄로 검수 상태를 복원한다. 상태 값은 'S4 발행완료' 형식으로 쓴다.
12. **CTA 면제 확대**: 원본은 CAT-C(다이어리)만 면제. 스킬은 디딤 다이어리(17~20)와 디딤 소식의 사무소 소식(`--no-cta`, _DECISIONS.md §5)을 면제한다.

## 9. 다른 스킬과의 연결
- 받는 입력: didim-blog-planner(추천 소스·로테이션 카테고리 → 새 행), didim-blog-writer(초안 저장 → S1, 본문·태그), didim-blog-seo(SEO 점수 → S1→S2 권장 조건), didim-blog-factcheck(교차검증 수행·심각 이슈 수 → 권장 조건), didim-blog-infographic(이미지 마커), didim-blog-planner(주제·12주 이후 주차 주제), didim-blog-core(카테고리·CTA·명칭 규칙).
- 넘기는 출력: didim-blog-publish-prep(S3 발행예정 글의 발행 준비), didim-blog-performance(S4→S5 1주차 성과 입력, 발행 글 목록), didim-blog-health(S4 발행 글·published_at → 건강 점검).
