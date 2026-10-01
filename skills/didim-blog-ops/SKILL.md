---
name: didim-blog-ops
description: 특허그룹 디딤 네이버 블로그의 콘텐츠 제작 운영(상태 S0 기획중~S5 성과측정 전이, 대표 검수 승인·수정요청, SLA 마감 D-5~D-0, 화요일 주 1편 발행 캘린더, 4주 카테고리 로테이션과 발행 비율, 이번 달 발행 현황)을 관리하고 Notion "디딤 블로그 콘텐츠" DB의 상태·발행일·발행 URL·메모를 갱신한다. "이 글 검토완료로 넘겨줘", "발행예정으로 바꿔도 돼?", "대표 검수 승인했어", "수정 요청 넣어줘", "되돌려줘", "발행 완료 처리", "이번 주 SLA 어때", "마감 지난 글 있어?", "다음 화요일 발행일 잡아줘", "이번 주는 어느 카테고리 차례야", "발행 캘린더 보여줘", "카테고리 비율 맞아?", "이번 달 발행 현황", "칸반 상태 정리" 같은 요청에 적극적으로 사용한다. 초안 작성은 didim-blog-writer, SEO 점수는 didim-blog-seo, 성과 입력은 didim-blog-performance 와 함께 쓴다.
---

# 디딤 블로그 운영(상태 전이·검수·SLA·캘린더)

백오피스(Next.js+Supabase)의 콘텐츠 운영 규칙을 레포·DB 없이 재현한다. 상태 전이·SLA·로테이션·비율은 `scripts/` 의 Python 포팅으로 **반드시 계산**하고 눈대중으로 판정하지 않는다(원본 코드와 같은 결과를 내기 위해서). `skills/_DECISIONS.md` 확정 사항(카테고리 정본=네이버 categoryNo, 12주 스케줄 폐기·4주 로테이션, Notion DB 2개)을 따른다.

브랜드·카테고리·CTA 문구는 **didim-blog-core 스킬을 함께 읽는다.** 코어가 없을 때를 위한 최소 원칙:
- 연락처 이메일은 `admin@didimip.com` 하나뿐이다. CTA 블록 판정도 `━━` 구분선 또는 `admin@didimip` 포함 여부로 한다.
- 디딤 다이어리(17~20)와 디딤 소식의 '사무소 소식'에는 CTA 를 넣지 않는다. 그래서 이 글들은 CTA 조건이 '면제'다(`--no-cta`).
- 본문·메모에 '특허청'이 아니라 '지식재산처'로 쓴다. 절세액·인증·등록 결과를 보장하는 표현을 쓰지 않는다.
- 네이버 발행은 사람이 복사·붙여넣기로 한다. 자동 발행을 약속하거나 시도하지 않는다.

## 언제 쓰나
- 글의 상태를 바꾸거나(S0~S5), 바꿔도 되는지 물을 때
- 대표 검수(체크리스트 승인 / 수정 요청 / 재검수 요청)를 기록할 때
- 발행일을 정하고 SLA 마감일(D-5 목, D-3 토, D-2 일, D-1 월, D-0 화)을 계산하거나 지연을 점검할 때
- 이번 주 로테이션 카테고리, 발행 캘린더, 카테고리 비율, 이번 달 발행 현황을 볼 때

## 입력
- Notion "디딤 블로그 콘텐츠"(data source `collection://463bc815-11ab-4290-9d86-22bd1aa9cfed` 우선, 없으면 이름 검색) 행, 또는 사용자가 붙여넣은 표/JSON. 스크립트는 한글 속성명(제목·상태·카테고리·categoryNo·레거시 2차 분류·발행일·메모 …)을 그대로 받는다. 본문·태그는 DB 속성이 아니므로 페이지 내용/대화에서 받아 `본문`·`태그` 키로 넣는다.
- 전이 목표 상태, (S1→S2 판정 시) SEO 점수(didim-blog-seo)·교차검증 수행 여부와 심각 이슈 수(didim-blog-factcheck).
- 오늘 날짜(KST). 시각이 중요하면 `--now` 를 명시한다.
- 필드·선택지 전체: `references/notion-content-db.md`.

## 상태 정의 (content-states.ts, Notion 선택지 값)
| 코드 | Notion 값 | 다음(정방향) | 역행 |
|---|---|---|---|
| S0 | S0 기획중 | S1 | — |
| S1 | S1 초안완료 | S2 | S0 (전면 변경) |
| S2 | S2 검토완료 | S3 | S1 (수정 필요, 최대 2회) |
| S3 | S3 발행예정 | S4 | — |
| S4 | S4 발행완료 | S5 | — |
| S5 | S5 성과측정 | — | — |

허용 전이는 `state_transitions` 시드 7행뿐이다(하드코딩 금지 원칙: 규칙은 데이터에서 읽는다). 사용자가 바꾼 규칙 JSON 을 주면 `--transitions` 로 넘긴다. 표에 없는 전이(예: S0→S3, S1→S4, S4→S2)는 거부한다.

## 절차

### A. 상태 전이
1. 대상 글을 찾아 현재 상태를 확인한다.
2. 실행: `python3 scripts/transition_check.py check --content c.json --to S2 --seo-score 72 [--cross-validation-run --cross-validation-critical 0] [--no-cta] --now <ISO>`
   이미지 마커 수와 공백 제외 글자수는 본문에서 자동 계산된다. 검수 상태는 메모의 `[검수 승인]`/`[수정 요청]`/`[재검수 요청]` 중 마지막 기록으로 복원된다.
3. `kind` 로 처리한다.
   - `blocked`: 허용되지 않은 전이. 메시지 그대로 안내하고 중단.
   - `blocked_required`: 필수 조건 미충족. 실패 항목과 detail 을 보여주고 중단. 사용자가 "강제로"라고 명시하면 진행하되 메모에 `[전이 사유] 관리자 강제 전환 (조건 미충족)` 를 남긴다.
   - `confirm_recommended`: 권장 미충족. "필수 조건은 충족되었지만, 다음 권장 항목이 완료되지 않았습니다. 그래도 전이를 진행하시겠습니까?" 로 묻고 승낙 시 진행.
   - `needs_reason`: 역행. 되돌리기 사유를 반드시 받는다(빈 사유 거부).
   - `ok`: 진행.
4. 필수/권장 조건(상세 패널 기준, 커밋 abe96ec 이후):
   - S1→S2 필수: 본문 공백 제외 500자 이상, 태그 10개, CTA 블록(면제 글 제외), 대표 검수 승인 / 권장: SEO 70점+, 교차검증 완료(심각 0건), 이미지 마커 3개+
   - S2→S3 필수: 발행일 / 권장: 이미지 마커 1개+
   - S3→S4: 조건 없음. 네이버 발행 URL 과 실제 발행일을 받는다.
   - S4→S5 필수: 발행 후 7일 경과(D+7). 성과(조회수·댓글·유입 키워드 TOP3) 입력은 didim-blog-performance.
   - S0→S1: 조건 없음. 초안이 저장되면 S1 이 된다.
5. `kanban_db_condition_warnings` 는 원본 칸반 드래그의 DB 조건 경고(차단 아님)다. 참고로만 알린다.
6. 진행하면 결과의 `notion_update` 를 쓴다(`상태` = "S2 검토완료" 형식, S4 는 `발행일`·`발행 URL`). 메모에 `── YYYY-MM-DD HH:MM (상태) ──` 블록으로 사유·URL 을 덧붙인다(references/notion-content-db.md §3).

### B. 대표 검수 (S1 에서만)
1. 체크리스트 5개 중 **최소 3개**를 확인받는다: 숫자/금액이 정확한가? · 법률 조항 번호가 맞는가? · 고객 사례가 사실에 기반하는가? · 톤이 카테고리에 적합한가? · 공개해도 되는 내용인가?
2. 승인: `transition_check.py review approve --content c.json --checked numbers,law,tone`
   → 메모 `[검수 승인] 체크: …`. 이어서 **연쇄 자동 전이**: 본문 500자+·태그 10개·CTA(면제 글 제외) 충족 시 S2, 그 뒤 발행일이 있으면 S3 까지 간다(커밋 47cc218). 결과 `chain` 과 `notion_status_after` 를 그대로 반영·보고한다.
3. 수정 요청: `review revision --memo "…"` (메모 필수) → 메모 `[수정 요청] … (n회차)`. 3회째부터 S2→S1 역행 시 "수정 횟수가 최대치(2회)를 초과" 경고.
4. 수정 완료 후 재검수: `review reset` → 메모 `[재검수 요청]`.

### C. 발행일·SLA
1. 새 글: 발행일 미지정이면 `python3 scripts/sla.py next-tuesday` (KST 기준, 오늘이 화요일이면 다음 주 화요일). 이미 정해진 발행일은 초안 저장 뒤에도 덮어쓰지 않는다.
2. 마감일: `sla.py dates --publish-date YYYY-MM-DD` → D-5(목)·D-3(토)·D-2(일)·D-1(월)·D-0(화). 화요일이 아니면 경고한다. 마감일은 Notion 에 저장하지 않고 필요할 때 계산한다.
3. 글 1건 점검: `sla.py check --content c.json` → 단계별 완료/정상/오늘 마감/기한 초과(Notion 행이면 완료 여부를 상태로 추정).
4. 전체 알림: `sla.py alerts --contents list.json` → S0~S3 글의 현재 단계 마감(S0 주제선정·S1 초안·S2 검토·S3 발행) 기준 초과/주의(오늘·내일)/정상, 초과 우선 5건.

### D. 로테이션·캘린더·비율
1. 이번 주 차례: `python3 scripts/calendar_ratio.py rotation --date YYYY-MM-DD [--has-case-memo] --contents list.json`
   주 1편, ISO 주차(KST) 4주 로테이션: 지원사업·인증과 특허(25) → 출원·심판 실무(27) → 지식재산 경영(24) → 사례(26). 사례는 사용자가 준 사건 메모가 없으면 출원·심판 실무로 대체한다. 지난주와 같은 카테고리면 경고(연속 2주 방지). 디딤 소식·디딤 다이어리는 로테이션 밖 추가 발행.
2. 캘린더: `calendar_ratio.py items --contents list.json [--month YYYY-MM]` (S4·S5=발행 완료, S1~S3=진행 중, S0=예정). 레거시 카테고리 글은 신규 카테고리로 합산해 보여준다(예: 절세 시뮬레이션→지원사업·인증과 특허, 특허 전략 노트→지식재산 경영).
3. 비율: `calendar_ratio.py ratio --contents list.json [--month YYYY-MM]` → "현재 a:b:c:d / 목표 1:1:1:1" + 로테이션 외 발행 수 + 연속 주 경고. 원본은 기간 필터 없이 전체를 센다. 월 단위면 `--month` 를 쓰고 그렇게 했다고 밝힌다.
4. 이번 달 현황: `calendar_ratio.py progress [--no-case-memo]` → 카테고리별 발행/목표(목표 = 이번 달 화요일들의 로테이션 슬롯 수).
5. 옛 12주 스케줄은 폐기됐다(2026-03-31 종료). 물어보면 `calendar_ratio.py legacy-schedule` 로 기록만 보여주고, 주제 선정은 didim-blog-planner 로 넘긴다.

## 출력 형식
- 전이 판정: `현재 S1 초안완료 → 목표 S2 검토완료 | 판정: 권장 확인 필요` + 필수 n/n·권장 n/n 체크리스트(✅/❌/⚠️, detail) + Notion 에 쓸 값 + 다음 할 일.
- 검수: 결과(승인/수정 요청/초기화), 연쇄 전이 결과(S2·S3 도달 여부와 멈춘 이유), 메모에 덧붙일 줄.
- SLA: 표(단계 | 마감일(요일) | 상태). 초과는 맨 위.
- 캘린더: 날짜순 표(발행일 | 카테고리 | 제목 | 상태) + 비율 한 줄 + 이번 주 로테이션 카테고리.
- Notion 에 반영했으면 바꾼 속성 목록을, 못 했으면 "반영할 값" 표를 준다.

## 금지·주의
- 계산 없이 상태를 바꾸지 않는다. 스크립트 결과의 `kind` 를 무시하지 않는다.
- 시드의 S1→S2 행은 `is_reversible=true` 로 들어 있어 원본 상세 화면에서는 '되돌리기'로 보인다. 스킬은 상태 순서로 정방향을 판단한다(결과 `warnings`). 이 차이를 숨기지 않는다.
- 사례(26) 슬롯이라도 사건 메모 없이 사례 글을 기획하지 않는다.
- 발행완료 글 삭제 요청에는 "네이버 블로그에서도 별도로 삭제해야 합니다." 를 함께 알린다.
- S5 이후 상태는 바꾸지 않는다(정의된 전이 없음). 자동 발행·자동 전이를 걸지 않는다.
- Notion 에 새 DB·새 속성을 마음대로 만들지 않는다(없으면 생성을 제안만).

## 참조 파일
- `references/state-transitions.md` — 상태 정의·시드 7행·SPEC §5.1·validateTransition·buildChecks·칸반·배너·전이 로그 원문, conditions 키 해석표
- `references/review-and-auto-transition.md` — 검수 패널·서버 액션·AI 저장 시 S1 자동 전이·Phase 3 자동 마무리 원문
- `references/sla-calendar.md` — SLA 계산·알림·인디케이터·콘텐츠 ID·캘린더·비율 게이지·월간 발행 현황·주간 루틴 원문
- `references/schedule-12weeks.md` — 폐기된 12주 스케줄 원문 3종과 차이표(기록용)
- `references/notion-content-db.md` — 실제 Notion 스키마·선택지, 원본 컬럼 매핑, 메모 형식, 전이 절차
- `scripts/transition_check.py` (check/review/rules/markers), `scripts/sla.py` (dates/next-tuesday/content-id/check/alerts/indicator), `scripts/calendar_ratio.py` (items/ratio/progress/rotation/legacy-schedule) — 모두 `--help`, JSON 출력
