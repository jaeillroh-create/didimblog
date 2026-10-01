# didim-blog-seo — SEO 점수·18항목 체크리스트·품질 점수

## 1. 기능 개요
글의 제목·본문·키워드·태그를 카테고리별 루브릭과 콘텐츠 상태(S0~S5)별 검사 범위로 자동 채점한다. 항목마다 범위 안 만점, 근접 시 67%·33% 부분 점수를 주고, 획득/최대 점수를 100점으로 환산해 통과(80↑)·수정 필요·발행 불가(S3 이상에서 50 미만)를 판정하며 점수 색을 3단계로 표시한다. 디딤 다이어리는 소제목 항목을 빼고 CTA 가 없을 때 가점을 준다. 별도로 레거시 SEO 18항목 체크리스트(필수 10 전부 통과, 권장 미충족 2개 이하)와 AI 에디터의 8항목 간이 점수, 발행 후 조회·체류·전환 기반 품질 점수(상대 점수, 5등급)가 있다. 스킬은 이 계산을 Python 으로 포팅하고, 본문 텍스트만으로 판정할 수 없는 항목을 사람 확인으로 분리한다.

## 2. 원본 코드 위치
| 파일 | 함수/상수 |
|---|---|
| src/lib/seo-calculator.ts | calcPartialScore (L22), countKeyword (L73), countSubHeadings (L83), countImages (L92), hasCta (L101), calculateSeoScore (L138), 판정 (L326-331) |
| src/lib/constants/seo-rubrics.ts | RubricRange/CategoryRubric, SEO_RUBRICS (L38-91), getRubric (L97), STATUS_CHECK_RANGES (L113-156), getScoreColor (L161), getScoreBgColor (L170) |
| src/components/contents/seo-score-panel.tsx | VERDICT_CONFIG (L27-43), 진행바 색 (L98-110), '발행 불가' 경고 (L124-134) |
| src/app/(dashboard)/contents/[id]/content-detail-client.tsx | 표시 점수 = seo_score ?? 계산값 (L153-156), 저장 시 재계산·seo_score 저장 (L203-227), 패널 categoryId (L702-705) |
| src/components/contents/status-transition-panel.tsx | "SEO 점수 70점 이상 (권장)" (L120-127) |
| src/app/(dashboard)/contents/ai-editor/[id]/ai-editor-client.tsx | extractImageMarkers (L501-538), 로컬 calculateSeoScore 8항목 (L541-614), Phase 3 전 점수 (L867-868), 확정 시 seo_score 저장 (L1022-1048) |
| seed_data/seo_checklist.json | 18항목(id, grade, category, item, criteria, reason), 등급 규칙 |
| src/lib/constants/seo-items.ts | SEO_ITEMS(17개, LEGACY), REQUIRED_PASS_COUNT=10, RECOMMENDED_MAX_FAIL=2 |
| src/actions/seo-checks.ts | calculateVerdict (L12), getSeoCheck, saveSeoCheck (LEGACY, seo_checks 테이블) |
| src/components/contents/seo-checklist.tsx | getVerdict (L70-84, LEGACY) |
| src/lib/utils/quality-score.ts | calculateQualityScore (L19), getQualityGrade (L41) |
| src/components/common/quality-badge.tsx, src/components/contents/quality-score.tsx | 등급 라벨·색, S4 미만 "발행 후 측정됩니다" |
| SPEC.md §5.2, §5.3 / docs/UPGRADE_SPEC.md §6 | 기획 문서(일부 코드와 다름 — 8절) |

## 3. 입력
- title, body(마크다운), target_keyword, tags[], status(S0~S5)
- 카테고리: 원본은 `secondary_category || category_id`(CAT-*). 스킬은 네이버 categoryNo·카테고리 이름(신규/레거시)·CAT-* 모두, 디딤 소식은 subtype("사무소 소식")
- (18항목) 사람 판정 값, 예약 발행 시각
- (품질 점수) 글의 views, avgDurationSec, ctaClicks 와 같은 달 전체 글의 최댓값(또는 월 글 목록)

## 4. 처리 규칙
1. 루브릭 선택: 카테고리 ID 가 없으면 CAT-A, 정확히 있으면 그 키, 아니면 앞 두 토막(`CAT-A-01`→`CAT-A`), 그래도 없으면 CAT-A (seo-rubrics.ts:97-108).
2. 루브릭 4종 (seo-rubrics.ts:38-91): CAT-A·CAT-B 본문 1500~2000/15, 키워드 3~5/15, 소제목 2~3/10, CTA 필수 10, 제목 25~30/10, 태그 10/5, 이미지 3~5/10. CAT-B-03 본문 800~1200/15, 키워드 2~3/15, 소제목 0~1/5, CTA 필수 5, 이미지 1~3/10. CAT-C 본문 800~1500/15, 키워드 1~2/10, 소제목 배점 0, CTA 부재 가점 10, 제목 15~35/10, 이미지 1~5/5. `structureRequired` 는 계산에 쓰이지 않는다.
3. 상태별 검사 범위: S0 제목 길이; S1 + 본문·키워드·소제목·CTA; S2~S5 + 이미지·태그 (seo-rubrics.ts:113-156).
4. 부분 점수: 범위 안 → 배점. span=max(max−min,1), tol1=max(ceil(span×1.6),5), tol2=max(ceil(span×2.2),10). [min−tol1, max+tol1] → round(배점×0.67), [min−tol2, max+tol2] → round(배점×0.33), 그 외 0, 배점 0 → 0 (seo-calculator.ts:22-47).
5. 제목 길이 = title.length (L157). 본문 분량 = 모든 공백 제거 후 길이 (L176).
6. 키워드 빈도 = 이스케이프한 키워드의 대소문자 무시(gi) 출현 수. 키워드가 없으면 0점·미통과·"타겟 키워드를 설정하세요" (L73-78, 194-216).
7. 소제목 = `/^#{2,3}\s+.+/gm` 개수. 배점 0(다이어리)이면 항목 자체를 넣지 않는다 (L83-87, 219-239).
8. CTA: 패턴 8개(━{3,}, admin@didimip.com, 이웃\s*추가, 02-571-6613, Tel:\s*[\d-]+, 재무제표, 시뮬레이션을?\s*만들어, 무료\s*진단) 중 하나. ctaRequired 면 있으면 ctaWeight, 없으면 0 + "구분선(━━━) 아래에 CTA를 배치하세요". ctaAbsenceBonus 면 없을 때 가점, 있으면 0 + "디딤 다이어리에는 CTA를 넣지 마세요" (L101-115, 242-276).
9. 이미지 = `/\[IMAGE:\s*.+?\]/g` 개수 (L92-96, 279-295). 스킬 기본은 박스형 포함 카운트(8절 3번).
10. 태그: 개수 ≥ min 이고 태그 문자열 합계 < 100자면 만점, 아니면 개수로 부분 점수. 힌트: 100자 이상이면 초과 안내, 개수 부족이면 채우라는 안내 (L298-319).
11. normalizedScore = round(total/max×100), max 0 이면 0. verdict: 80 미만 fix_required, 50 미만이면서 S3/S4/S5 면 blocked, 그 외 pass (L322-331).
12. 색상: ≥80 text-green-600/bg-green-50/진행바 bg-green-500, ≥50 text-orange-500/bg-orange-50/bg-orange-400, 그 외 text-red-500/bg-red-50/bg-red-500 (seo-rubrics.ts:161-174; seo-score-panel.tsx:98-110).
13. '발행 불가' 표시: verdict==="blocked" 일 때만 "발행 불가 — SEO 점수가 50점 미만입니다" / "S3(발행예정) 이상에서는 50점 이상이어야 발행 가능합니다." (seo-score-panel.tsx:124-134). 뱃지: 통과/수정 필요/발행 불가 (L27-43).
14. 상세 화면 표시 점수는 저장된 seo_score 우선, 없으면 즉시 계산. 저장 시 편집값으로 재계산해 normalizedScore 저장(2차 "none" 이면 1차) (content-detail-client.tsx:153-156, 203-227).
15. AI 에디터 간이 점수: 8항목 동일 비중 — 제목 25~30자, 제목 앞 15자 키워드(키워드 없으면 통과), 대소문자 구분 키워드 3~5회, `^##\s` 2개↑, extractImageMarkers(박스형+한 줄형) 3개↑, 공백 제외 1500~2500자, `#[^\s#]+` 8개↑, "절세 시뮬레이션/연락/상담/이웃" 포함. score=round(통과/8×100). 초안 확정 시 이 값이 seo_score 로 저장된다 (ai-editor-client.tsx:541-614, 1022-1048).
16. 18항목 판정(레거시): 필수 통과 < 10 → blocked, 권장 미충족(권장 총수 − 통과) > 2 → fix_required, 그 외 pass. 등급은 SEO_ITEMS 기준(필수 1,2,4,5,8,9,11,14,16,18 / 권장 6,7,12,15 / 선택 3,10,17). 저장: seo_checks(items, 각 등급 통과 수, verdict) upsert (seo-checks.ts:12-97; seo-checklist.tsx:70-84).
17. 품질 점수 = (views/maxViews×100)×0.4 + (avgDuration/maxDuration×100)×0.3 + (ctaClicks/maxCtaClicks×100)×0.3, 최댓값 0 이면 그 항 0. 등급 ≥80 excellent, ≥60 good, ≥40 average, ≥20 poor, 그 외 critical. 뱃지 라벨 우수/양호/보통/부진/위험, 원형 색 success/info/warning/danger. S4 미만은 "발행 후 측정됩니다", 표시값 = final ?? 1st ?? 0 (quality-score.ts; quality-badge.tsx; contents/quality-score.tsx:98-140).
18. (스킬 추가, _DECISIONS.md) 네이버 categoryNo → 루브릭: 25·27·26 → CAT-A, 24 → CAT-B, 28 → CAT-B-03, 28+사무소 소식 → CAT-B-03 수치 + CTA 부재 가점 10, 17~20 → CAT-C, 레거시 9~12·23 → CAT-A, 13~15 → CAT-B, 16 → CAT-B-03, 7·22(고정 페이지) → CAT-A + 경고.

### 본문 텍스트만 주어졌을 때 18항목 판정
| ID | 항목 | 판정 | 방법 |
|---|---|---|---|
| 1 | 제목 길이 | 자동 | 루브릭 titleLength 범위 |
| 2 | 제목 키워드 위치 | 자동(키워드 필요) | 제목 앞 15자 포함 (에디터 규칙) |
| 3 | 제목 숫자 | 반자동 | 숫자 유무 자동, 의미는 사람 |
| 4 | 도입부 톤 | 사람(정성) | Claude 가 근거와 함께 의견, 확정은 사람 |
| 5 | 키워드 반복 | 자동(키워드 필요) | 루브릭 keywordFreq |
| 6 | 소제목 사용 | 자동 | 루브릭 subHeadings |
| 7 | 소제목 키워드 | 반자동 | 키워드 포함 소제목 수 관찰, 변형 여부 사람 |
| 8 | 이미지 수 | 자동 | 마커 수(박스형 포함) vs 루브릭 imageCount |
| 9 | 첫 이미지 | 사람 | 실제 이미지 필요 |
| 10 | 이미지 ALT | 사람 | 에디터 입력 확인 |
| 11 | 본문 분량 | 자동 | 루브릭 bodyLength |
| 12 | 내부 링크 | 사람(관찰값) | 본문 내 디딤 블로그 링크 수 표시 |
| 13 | 외부 링크 | 반자동 | 외부 http(s) 링크 0개면 통과 |
| 14 | 태그 수 | 자동(태그 필요) | ≥10개 + 100자 미만 |
| 15 | 태그 구성 | 사람 | 핵심3+연관3+브랜드2+롱테일2 |
| 16 | CTA 배치 | 자동 | CTA 패턴 (다이어리·사무소 소식은 없어야 통과) |
| 17 | 맞춤법 | 사람 | 네이버 검사기 |
| 18 | 예약 시간 | 입력 시 자동 | 화요일 09:00 |

## 5. 출력
- SeoScoreResult: totalScore, maxPossibleScore, normalizedScore, items[{key, label, score, maxScore, actual, expected, passed, hint}], verdict, activeItemCount (+스킬: verdictLabel, 색상 클래스, blockedMessage, rubricKey, categoryInfo)
- 18항목: 항목별 passed/observed/basis/note, pending_human, 등급별 통과 수와 verdict
- 간이 점수: checks[{label, passed, detail}], score, passedCount, totalCount
- 품질 점수: score, grade, gradeLabel, badgeText, circleColor

## 6. 예외·오류 처리
- 키워드 미설정: 키워드 항목 0점, actual "키워드 미설정", hint "타겟 키워드를 설정하세요".
- 본문/제목/태그 null → 빈 값으로 계산.
- 알 수 없는 카테고리 → CAT-A (원본). 스킬은 경고를 함께 출력.
- 원본은 status 가 S0~S5 가 아니면 `STATUS_CHECK_RANGES[status].includes` 에서 예외. 스킬은 "알 수 없는 상태값" 오류를 낸다(Notion 값 "S1 초안완료"는 앞 두 글자로 해석).
- 품질 점수 최댓값 0 → 그 지표 0.
- saveSeoCheck 실패 → "SEO 체크 저장에 실패했습니다." (레거시).

## 7. 데이터 저장
| 백오피스 | 스킬에서의 대체 |
|---|---|
| contents.title / body / target_keyword / tags | 사용자 입력, 또는 Notion "디딤 블로그 콘텐츠" 의 제목·타깃 키워드 + 해당 글 페이지 본문(본문·태그 열 없음 → 태그는 사용자 입력) |
| contents.status | "디딤 블로그 콘텐츠".상태 ("S0 기획중"~"S5 성과측정") |
| contents.category_id / secondary_category | "디딤 블로그 콘텐츠".카테고리(신규 이름 또는 "레거시" + 레거시 2차 분류), categoryNo |
| contents.seo_score | 전용 열 없음 — 요청 시 메모에 "SEO 72 (YYYY-MM-DD, 수정 필요)" 한 줄, 커넥터 없으면 대화 출력 |
| seo_checks (items, pass counts, verdict) | 저장하지 않음(대화 출력). 필요하면 메모 |
| contents.quality_score_1st / quality_score_final / quality_grade | 전용 열 없음 — 계산해 대화로 보고. 입력값 조회수는 "조회수(최근)" 열, 체류시간·CTA 클릭은 사용자 입력 |

(_DECISIONS.md §4·§6: Notion DB 는 "디딤 블로그 콘텐츠", "디딤 블로그 상담" 두 개만.)

## 8. 원본 코드와 달라진 점
1. **카테고리 매핑 추가** — _DECISIONS.md(2026-10-01)에 따라 네이버 categoryNo/이름을 받아 기존 루브릭 4종에 매핑한다. 루브릭 수치는 바꾸지 않았다. 디딤 소식의 사무소 소식은 CAT-B-03 수치에 다이어리식 CTA 부재 가점(10점)을 쓰는 스킬 전용 루브릭 `DIDIM-NEWS-OFFICE` 를 추가했다(가점 10은 다이어리 값으로, 사용자 결정에 따라 유지). CAT-* 입력은 원본 getRubric 과 같게 처리한다.
2. **상태 기본값** — 원본은 상태가 항상 있다. 스킬은 상태를 모르면 S2 로 계산하고 그 사실을 밝힌다. Notion 상태 문자열도 받는다.
3. **이미지 마커 카운트 버그 수정(사용자 결정)** — 원본 seo-calculator 의 `/\[IMAGE:\s*.+?\]/g`(seo-calculator.ts:92-96)는 `]` 가 같은 줄에 있어야 해서 PHASE2/VISUAL_RULES 표준인 여러 줄 박스형 마커를 세지 못한다(같은 본문으로 TS 실행 확인: 박스형 2개 + 한 줄형 1개 → 1개, 이미지 7/10점·총점 69 / 수정 시 3개·10/10점·총점 73). 결정에 따라 seo_score.py 기본은 ai-editor `extractImageMarkers`(ai-editor-client.tsx:501-538) 규칙으로 박스형+한 줄형을 모두 세고, 원본 재현은 `--legacy-image-count` 옵션으로만 남겼다. 18항목 8번 자동 판정도 같은 카운트를 쓴다.
4. **18항목 자동 판정** — 원본 18항목은 사람이 체크박스로 입력한다. 스킬은 코드에 규칙이 있는 항목(1,2,5,6,8,11,14,16)을 자동 판정하고, 3·13·18 은 스킬 보조 규칙(basis="skill-heuristic"), 나머지는 사람 확인으로 둔다. 판정 집계(calculateVerdict)는 원본 그대로이며 미확인 = 미통과다.
5. **원본 간 불일치(코드 수정 없이 기록)** — seed json 은 18항목(13 외부 링크 optional, 17 맞춤법 recommended, 권장 5개)인데 seo-items.ts 는 17항목(13 없음, 17 optional, 권장 4개 — 주석은 "5개"). 기준값도 json(본문 1,500~2,500자·이미지 3~7장·태그 정확히 10개)과 루브릭(1,500~2,000자·3~5장·10개 이상+100자 미만)이 다르다. 스킬은 판정 등급은 seo-items.ts, 수치는 루브릭을 따른다.
6. **UPGRADE_SPEC §6 과 코드 차이** — 문서의 부분 점수는 tol1=round(폭×0.5), tol2=round(폭×1.0) 이지만 코드는 max(ceil(폭×1.6),5)/max(ceil(폭×2.2),10). 문서의 상태별 범위(PLANNING 1~3 … SCHEDULED 1~18)도 코드(7개 키)와 다르다. 스킬은 코드를 따른다.
7. **소스 주석 예시 오류** — seo-calculator.ts:20 주석 "800자 → 5점(33%)" 은 코드상 10점(67%)이다(1500−800=700 ≥ 1500−tol1(800)). 포팅·실행 결과 모두 10점.
8. **저장되는 seo_score 의 출처가 둘** — AI 에디터 확정 시 8항목 간이 점수가 저장되고, 상세 화면 저장 시 루브릭 점수로 덮어써진다. 두 점수는 기준이 다르다(대소문자, ###, 태그 8개, 카테고리 무시, CTA 패턴). 스킬은 정식 점수로 루브릭 점수를 쓰고 간이 점수는 선택 기능으로 둔다.
9. **품질 점수** — SPEC §5.3 은 `×40/×30/×30` 이지만 코드는 `×0.4/×0.3/×0.3`(0~100 유지). calculateQualityScore/getQualityGrade 는 코드에서 호출되지 않는다(정의만 존재, 값은 수동 입력 표시 — 확인 필요). 스킬은 월 글 목록을 주면 최댓값을 직접 구하는 편의 기능을 추가했다.
10. **문자열 길이** — 제목·본문·태그 길이는 JS 와 같은 UTF-16 기준으로 계산한다(이모지 2). 정규식의 공백(`\s`)·줄 시작(`^`)·`.` 은 JS 규칙에 맞춘 문자 클래스로 포팅했다.
11. **검증** — seo_score.py(`--legacy-image-count` 모드)·seo_editor_check.py·quality_score.py 를 원본 TS(node 타입 제거 실행)와 같은 입력 35건으로 대조해 모두 일치(정수/실수 표기 차이 100 vs 100.0 은 출력에서 정수로 맞춤). 기본 모드는 3번의 이미지 카운트만 다르다.

## 9. 다른 스킬과의 연결
- 받는 쪽: **didim-blog-writer**(Phase 3 결과 본문·제목·태그·키워드), **didim-blog-factcheck**(교정된 본문), **didim-blog-core**(카테고리·CTA 규칙), **didim-blog-publish-prep**(최종 태그 10개·ALT).
- 넘기는 쪽: **didim-blog-ops**(상태 전이 체크 "SEO 점수 70점 이상(권장)", S3 이상 발행 불가 판단), **didim-blog-writer**(힌트 기반 수정), **didim-blog-performance**(품질 점수·등급 — 성과 수치 입력은 performance 담당), **didim-blog-health**(오래된 글 재점검).
