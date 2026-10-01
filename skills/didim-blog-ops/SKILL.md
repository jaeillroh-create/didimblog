---
name: didim-blog-ops
description: 특허그룹 디딤 네이버 블로그의 콘텐츠 제작 운영(상태 S0 기획중~S5 성과측정 전이, 대표 검수 승인·수정요청, SLA 마감 D-5~D-0, 화요일 발행 캘린더, 카테고리 발행 비율 2:1:1, 12주 스케줄)을 관리한다. "이 글 검토완료로 넘겨줘", "발행예정으로 바꿔도 돼?", "대표 검수 승인했어", "수정 요청 넣어줘", "되돌려줘", "이번 주 SLA 어때", "마감 지난 글 있어?", "다음 화요일 발행일 잡아줘", "발행 캘린더 보여줘", "카테고리 비율 맞아?", "이번 달 발행 현황", "12주 스케줄 몇 주차야", "콘텐츠 ID 만들어줘", "칸반 상태 정리" 같은 요청이나 Notion "디딤 블로그 콘텐츠" DB의 상태·마감일을 바꾸거나 점검할 때 적극적으로 사용한다. 초안 작성은 didim-blog-writer, SEO 점수는 didim-blog-seo, 성과 입력은 didim-blog-performance 와 함께 쓴다.
---

# 디딤 블로그 운영(상태 전이·검수·SLA·캘린더)

백오피스(Next.js+Supabase)의 콘텐츠 운영 규칙을 레포·DB 없이 재현한다. 상태 전이·SLA·비율 계산은 `scripts/` 의 Python 포팅으로 **반드시 계산**하고, 눈대중으로 판정하지 않는다(원본 코드와 같은 결과를 내기 위해서).

브랜드·카테고리 명칭·CTA 문구는 **didim-blog-core 스킬을 함께 읽는다.** 코어가 없을 때를 위한 최소 원칙:
- 연락처 이메일은 `admin@didimip.com` 하나뿐이다. CTA 블록 판정도 `━━` 구분선 또는 `admin@didimip` 포함 여부로 한다.
- 디딤 다이어리(CAT-C) 글에는 CTA 를 넣지 않는다. 그래서 다이어리는 CTA 조건이 '면제'다.
- 본문·메모에 '특허청'이 아니라 '지식재산처'로 쓴다. 절세액·인증 결과를 보장하는 표현을 쓰지 않는다.
- 네이버 발행은 사람이 복사·붙여넣기로 한다. 자동 발행을 약속하거나 시도하지 않는다.

## 언제 쓰나
- 글의 상태를 바꾸거나(S0~S5), 바꿔도 되는지 물을 때
- 대표 검수(체크리스트 승인 / 수정 요청 / 재검수 요청)를 기록할 때
- 발행일을 정하고 SLA 마감일(D-5 목, D-3 토, D-2 일, D-1 월, D-0 화)을 계산하거나 지연을 점검할 때
- 발행 캘린더, 카테고리 비율(현장수첩:IP라운지:다이어리 = 2:1:1), 이번 달 발행 현황, 12주 스케줄 주차를 볼 때
- 새 글의 콘텐츠 ID(`W{주차}-{순번}`)를 만들 때

## 입력
- 콘텐츠 1건 또는 목록: Notion "디딤 블로그 콘텐츠" DB(커넥터가 있으면 직접 조회) 또는 사용자가 붙여넣은 표/JSON.
  필드명은 `references/notion-content-db.md` 의 contents 컬럼명(status, body, tags, category_id, review_status, publish_date, *_due, *_done_at, published_at, revision_count …)으로 JSON 을 만든다.
- 전이 목표 상태, (S1→S2 판정 시) SEO 점수(didim-blog-seo 결과)·교차검증 수행 여부와 심각 이슈 수(didim-blog-factcheck 결과).
- 날짜 판단에는 오늘 날짜가 필요하다. 시각이 중요하면 `--now` 를 명시한다(서버 함수는 UTC, 화면 판정은 KST).

## 상태 정의 (content-states.ts)
| 코드 | 이름 | 다음(정방향) | 역행 |
|---|---|---|---|
| S0 | 기획중 | S1 | — |
| S1 | 초안완료 | S2 | S0 (전면 변경) |
| S2 | 검토완료 | S3 | S1 (수정 필요, 최대 2회) |
| S3 | 발행예정 | S4 | — |
| S4 | 발행완료 | S5 | — |
| S5 | 성과측정 | — | — |

허용 전이는 `state_transitions` 시드 7행뿐이다(하드코딩 금지 원칙: 규칙은 데이터에서 읽는다). 사용자가 Notion 이나 설정에서 바꾼 규칙 JSON 을 주면 `--transitions` 로 넘긴다. 표에 없는 전이(예: S0→S3, S1→S4, S4→S2)는 거부한다.

## 절차

### A. 상태 전이
1. 대상 글을 찾아 현재 상태를 확인한다.
2. 실행: `python3 scripts/transition_check.py check --content c.json --to S2 --seo-score 72 [--cross-validation-run --cross-validation-critical 0] --now <ISO>`
   이미지 마커 수와 공백 제외 글자수는 본문에서 자동 계산된다.
3. `kind` 로 처리한다.
   - `blocked`: 허용되지 않은 전이. 메시지 그대로 안내하고 중단.
   - `blocked_required`: 필수 조건 미충족. `required_checks` 의 실패 항목과 detail 을 보여주고 중단. 사용자가 "강제로"라고 명시하면 진행하되 메모에 `[전이 사유] 관리자 강제 전환 (조건 미충족)` 를 남긴다(원본은 admin 만 가능).
   - `confirm_recommended`: 권장 미충족. "필수 조건은 충족되었지만, 다음 권장 항목이 완료되지 않았습니다. 그래도 전이를 진행하시겠습니까?" 로 묻고, 승낙 시 진행. 미완료 항목은 이후에도 보완 대상으로 알려준다.
   - `needs_reason`: 역행. 되돌리기 사유를 반드시 받는다(빈 사유 거부).
   - `ok`: 진행.
4. 필수/권장 조건(상세 패널 기준, abe96ec 이후):
   - S1→S2 필수: 본문 공백 제외 500자 이상, 태그 10개, CTA 블록(다이어리 면제), 대표 검수 승인 / 권장: SEO 70점+, 교차검증 완료(심각 0건), 이미지 마커 3개+
   - S2→S3 필수: 발행예정일(publish_date 또는 publish_due) / 권장: 이미지 마커 1개+
   - S3→S4: 조건 없음. 네이버 URL(선택)과 발행일시(기본 현재) 입력
   - S4→S5 필수: 발행 후 7일 경과(D+7). 1주차 성과(조회수·댓글·이웃 추가·상담 여부) 입력 → didim-blog-performance
   - S0→S1: 상세 패널 조건 없음. 보통 AI 초안 저장 시 자동으로 S1 이 된다.
5. `kanban_db_condition_warnings` 는 칸반 드래그에서 뜨는 DB 조건 경고다(차단 아님). 함께 알려주되 판정은 3단계 기준을 따른다.
6. 진행하면 `updates_on_transition` 대로 기록한다: S1→draft_done_at, S2→review_done_at, S3→image_done_at, S4→published_at, 모두 updated_at. 메모에는 `── YYYY-MM-DD HH:MM (상태) ──` 블록으로 사유·네이버 URL·성과 요약을 덧붙인다. Notion 반영 절차는 `references/notion-content-db.md` §2.

### B. 대표 검수 (S1 에서만)
1. 체크리스트 5개 중 **최소 3개**를 확인받는다: 숫자/금액이 정확한가? · 법률 조항 번호가 맞는가? · 고객 사례가 사실에 기반하는가? · 톤이 카테고리에 적합한가? · 공개해도 되는 내용인가?
2. 승인: `transition_check.py review approve --content c.json --checked numbers,law,tone`
   → review_status=approved, review_done_at, review_memo `[검수 승인] 체크: …`. 이어서 **연쇄 자동 전이**: 본문 500자+·태그 10개·CTA(다이어리 면제) 충족 시 S2, 그 뒤 발행일이 있으면 S3 까지 간다(커밋 47cc218). 결과의 `chain` 을 그대로 보고한다.
3. 수정 요청: `review revision --memo "…"` (메모 필수) → review_status=revision_requested, revision_count +1.
4. 수정 완료 후 재검수: `review reset` → review_status=pending, 메모 비움.

### C. 발행일·SLA
1. 새 글: 발행일 미지정이면 `python3 scripts/sla.py next-tuesday` (오늘이 화요일이면 다음 주 화요일, KST 날짜 기준). ID 는 `sla.py content-id --publish-date … --existing <기존 ID들>`. 초안 저장 뒤에도 이미 정해진 발행일은 덮어쓰지 않는다(원본 Phase 3 는 항상 덮어씀 — 스킬은 유지).
2. 마감일: `sla.py dates --publish-date YYYY-MM-DD` → briefing_due(D-5 목)·draft_due(D-3 토)·review_due(D-2 일)·image_due(D-1 월)·publish_due(D-0 화). 화요일이 아니면 경고한다.
3. 발행일을 바꾸면 마감일 5개도 다시 계산해 함께 저장한다(원본은 재계산하지 않음 — 스킬은 일관성을 위해 재계산).
4. 글 1건 점검: `sla.py check --content c.json` → 단계별 완료/정상/오늘 마감/기한 초과.
5. 전체 알림: `sla.py alerts --contents list.json` → S0~S3 글의 현재 단계 마감(S0 주제선정·S1 초안·S2 검토·S3 발행) 기준 초과/주의(오늘·내일)/정상, 초과 우선 5건.

### D. 캘린더·비율·스케줄
1. 캘린더: `python3 scripts/calendar_ratio.py items --contents list.json [--month YYYY-MM]` (S4·S5=발행 완료, S1~S3=진행 중, S0=예정).
2. 비율: `calendar_ratio.py ratio --contents list.json [--month YYYY-MM]` → "현재 a:b:c / 목표 2:1:1". 원본은 기간 필터 없이 전체를 센다. 월 단위 판단이 필요하면 `--month` 를 쓰고 그렇게 했다고 밝힌다.
3. 이번 달 발행 현황: `calendar_ratio.py progress` → 현장수첩 x/2, IP 라운지 x/1, 다이어리 x/1 (원본은 S4 만 집계).
4. 12주 스케줄: `calendar_ratio.py week` (시작일 2026-01-06) / `schedule --week N`. 12주를 넘으면 주제 선정은 didim-blog-planner 로 넘긴다. 스케줄 원본 3종 차이는 `references/schedule-12weeks.md` §4.

## 출력 형식
- 전이 판정: `현재 S1 초안완료 → 목표 S2 검토완료 | 판정: 권장 확인 필요` + 필수 n/n·권장 n/n 체크리스트(✅/❌/⚠️, detail) + 기록할 필드 + 다음 할 일.
- 검수: 결과 상태(승인/수정 요청/초기화), 연쇄 전이 결과(S2·S3 도달 여부와 멈춘 이유).
- SLA: 표(단계 | 마감일(요일) | 상태). 초과는 맨 위.
- 캘린더: 날짜순 표(발행일 | 카테고리 | 제목 | 상태) + 비율 한 줄.
- Notion 에 반영했으면 바꾼 속성 목록을, 못 했으면 "반영할 값" 표를 준다.

## 금지·주의
- 계산 없이 상태를 바꾸지 않는다. 스크립트 결과의 `kind` 를 무시하지 않는다.
- 시드의 S1→S2 행은 `is_reversible=true` 로 들어 있어 원본 상세 화면에서는 '되돌리기' 버튼으로 보인다. 스킬은 상태 순서로 정방향을 판단한다(결과 `warnings` 에 표시됨). 사용자에게 이 차이를 숨기지 않는다.
- `briefing_done_at` 은 원본에서 기록되지 않아 D-5 가 늘 '기한 초과'로 보일 수 있다. 주제선정·브리핑을 끝냈으면 기록하라고 안내한다.
- 발행완료(S4) 글 삭제 요청에는 "네이버 블로그에서도 별도로 삭제해야 합니다." 를 함께 알린다. 삭제는 소프트 삭제(삭제됨 체크).
- 성과측정(S5) 이후 상태는 바꾸지 않는다(정의된 전이 없음).
- 다른 LLM·외부 시스템에 자동 발행·자동 전이를 걸지 않는다.

## 참조 파일
- `references/state-transitions.md` — 상태 정의·시드 7행·SPEC §5.1·validateTransition·buildChecks·칸반·배너·전이 로그 원문, conditions 키 해석표
- `references/review-and-auto-transition.md` — 검수 패널·서버 액션·AI 저장 시 S1 자동 전이·Phase 3 자동 마무리 원문
- `references/sla-calendar.md` — SLA 계산·알림·인디케이터·콘텐츠 ID·캘린더·비율 게이지·월간 발행 현황·주간 루틴 원문
- `references/schedule-12weeks.md` — 12주 스케줄 원문 3종과 차이표
- `references/notion-content-db.md` — Notion "디딤 블로그 콘텐츠" 필드 표, Notion 상태 전이 절차
- `scripts/transition_check.py` (check/review/rules/markers), `scripts/sla.py` (dates/next-tuesday/content-id/check/alerts/indicator), `scripts/calendar_ratio.py` (items/ratio/progress/week/schedule) — 모두 `--help` 지원, JSON 출력
