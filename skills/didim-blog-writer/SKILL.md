---
name: didim-blog-writer
description: 특허그룹 디딤 네이버 블로그(변리사의 현장 수첩·IP 라운지·IP 뉴스 한 입·디딤 다이어리) 초안을 백오피스와 같은 3-Phase 파이프라인(구조 설계 JSON → 본문 → SEO/다이어리 편집 → CTA·서명·면책·태그 자동 마무리·검증)으로 Claude가 직접 작성한다. 주제만 있거나 문서·PDF·이미지만 있을 때 브리핑(카테고리·키워드·타깃·에피소드)부터 만들어 초안으로 잇는다. "디딤 블로그 글 써줘", "현장수첩 초안", "IP 라운지 칼럼 작성", "IP 뉴스 한 입으로 정리", "다이어리 글 써줘", "이 자료로 블로그 초안", "브리핑 만들어서 초안까지", "Phase 1 아웃라인만", "Phase 3 SEO 다듬기", "초안 품질 체크", "CTA/서명/태그 붙여줘" 같은 요청에 쓴다. 인포그래픽 설계는 didim-blog-infographic, 팩트체크·교차검증은 didim-blog-factcheck, SEO 점수는 didim-blog-seo, 네이버 발행용 정리는 didim-blog-publish-prep로 넘긴다.
---

# 디딤 블로그 초안 작성 (didim-blog-writer)

백오피스 `ai-editor`의 초안 생성 파이프라인을 Claude가 직접 수행한다. LLM 호출 자리는 Claude 자신이 렌더링된 프롬프트를 따라 응답을 쓰는 것으로 바꾸고, 결정적 처리(프롬프트 조립·JSON 파싱·문단 ID·검증·마무리)는 원본 TS를 충실히 포팅한 `scripts/`로 한다. 그래야 백오피스와 같은 글이 나온다.

브랜드·카테고리·CTA·광고 규정 전반은 **didim-blog-core 스킬을 함께 읽는다.** 코어가 없을 때도 아래 절대원칙은 반드시 지킨다.

## 절대원칙 (코어 미설치 대비 요약)
- 이메일은 **admin@didimip.com** 하나만. 다른 주소가 나오면 버그다.
- **디딤 다이어리에는 CTA·서명·연락처를 한 글자도 넣지 않는다.** "상담·문의·연락·무료·진단·시뮬레이션·admin@" 금지.
- 현재 시점 기관명은 **'지식재산처'**('특허청' 금지). 예외: "당시 특허청(현 지식재산처)", 법령명 안의 '특허청', "특허청장이 정하는".
- 결과 보장·단정 표현 금지(변리사 광고규정): "반드시/무조건 절세", 조건 없는 금액. 사례 수치에는 전제 조건(매출 규모·업종 등)을 붙인다.
- 본문에 "(확인 필요)"·"(미확인)" 표기와 마크다운 표(`| |`)를 출력하지 않는다. 확신 없는 조항 번호는 "관련 규정" 같은 일반화 표현으로 우회한다.

## 언제 쓰나
- 주제·카테고리·키워드로 블로그 초안을 새로 쓸 때 (주력: 3-Phase).
- 주제 한 줄이나 자료 파일(TXT·DOCX·PDF·JPG·PNG)만 있고 브리핑부터 필요할 때.
- 이미 있는 초안에 Phase 3(SEO 다듬기)·자동 마무리·품질 검증만 돌릴 때.
- 사용자가 명시적으로 "한 번에/단일 프롬프트로" 요구할 때만 LEGACY 모드(5-B).

## 입력
| 항목 | 필수 | 비고 |
|---|---|---|
| 주제(topic) | ✓ | 한 줄, 상황+결과가 드러나게 |
| 카테고리 ID | ✓ | 1차 CAT-A/B/C 또는 2차 CAT-A-01~04, CAT-B-01~03, CAT-C-01~03. 2차가 있으면 2차를 쓴다 |
| 핵심 키워드 | ✓ | 네이버 검색 키워드 1~2개 (다이어리는 비어도 됨) |
| 참고 사항(additional_context) | 선택 | 에피소드·수치·법령·강조점. 브리핑 결과면 `[에피소드]…[참고사항]…` 형식 |
| 타깃 고객 | 선택 | 원본 3-Phase 경로는 쓰지 않음. 참고 사항에 합쳐 넣는다 |

누락된 필수 항목은 추측하지 말고 묻는다. 데이터 출처는 ① 사용자 붙여넣기 ② Notion 커넥터가 있으면 "디딤 블로그 콘텐츠" DB ③ 네이버 RSS(https://rss.blog.naver.com/didimip.xml, 막히면 사용자에게 요청).

## 작업 폴더와 스크립트
작업 파일은 현재 작업 폴더 아래 `didim-draft/<날짜-슬러그>/`에 둔다. 아래에서 `$W`는 이 스킬 폴더 경로다. 모든 스크립트는 Python 3 표준 라이브러리만 쓰고 JSON을 출력한다(`--help` 지원).
- `$W/scripts/pipeline_utils.py` — 프롬프트 키·CTA·프롬프트 조립(render)·Phase 1 JSON 파싱·이어쓰기 병합·펜스 제거·브리핑 파싱
- `$W/scripts/paragraph_ids.py` — 문단 ID `<!-- p:N -->` 주입/제거/조회
- `$W/scripts/draft_checks.py` — 품질 체크(validateDraft) + 생성 후 경고(validateGeneratedDraft)
- `$W/scripts/finalize_draft.py` — Phase 3 이후 자동 마무리(폴백·마커 복원·면책·CTA·서명·태그)

`render` 결과의 `system`은 역할 지시, `user`는 작업 지시다. Claude는 두 지시를 그대로 따르는 응답을 직접 작성해 파일로 저장한다. 프롬프트를 요약하거나 바꿔 읽지 않는다 — 원문 그대로가 백오피스 결과와 같아지는 조건이다.

## 절차

### 0단계. 입력 경로 고르기
- 주제·카테고리·키워드가 모두 있으면 → 2단계.
- 주제만 있으면 → 1-A. 파일만 있으면 → 1-B.

### 1-A. 주제 → 브리핑
1. `python3 $W/scripts/pipeline_utils.py render --phase briefing --topic "<주제>" [--force-category CAT-..]`
2. 응답을 **JSON 객체 하나만**으로 작성해 `briefing_raw.txt`에 저장.
3. `python3 $W/scripts/pipeline_utils.py parse-briefing --file briefing_raw.txt --source generate --topic "<주제>"`
4. `ok=false`면 "브리핑 생성에 실패했습니다. 직접 입력해주세요."라고 알리고 직접 입력을 받는다.
5. 결과(`briefing`)를 사용자에게 보여 주고 확인받는다. `draft_input`이 2단계 입력이다. 출원 실무 주제인데 2차 분류가 비었으면(원본의 CAT-A-04 누락 동작) 사용자에게 CAT-A-04 여부를 묻는다.

### 1-B. 파일 → 브리핑
1. 허용: PDF·DOCX·TXT·JPG·PNG, 10MB 이하. 그 외는 "PDF, DOCX, TXT, JPG, PNG만 지원합니다." 안내.
2. TXT·DOCX: 본문 텍스트를 추출해 `doc.txt`로 저장 → `render --phase briefing-file --doc-file doc.txt` (앞 8,000자만 들어가고 잘리면 `truncated=true`; 사용자에게 "앞 8,000자만 분석됨"을 알린다).
3. PDF·이미지: 파일을 직접 읽고 `render --phase briefing-vision`의 system/user를 따른다.
4. 응답 JSON을 `parse-briefing --source file`로 파싱 → 확인 → 2단계.

### 2단계. 카테고리 확정과 참고 사항 정리
1. `python3 $W/scripts/pipeline_utils.py prompt-key --category-id <ID>` → `prompt_key`, `category_name`.
   - CAT-A* → PROMPT_FIELD, CAT-B-03 → PROMPT_LOUNGE_BITE, 그 외 CAT-B* → PROMPT_LOUNGE_GENERAL, CAT-C* → PROMPT_DIARY, 미매칭 → PROMPT_LOUNGE_GENERAL.
2. 참고 사항이 있으면 `context.txt`로 저장한다. 원본 3-Phase는 이것을 버리지만, 사용자 제공 사례·수치 없이 쓰면 사례를 지어내게 되므로 스킬은 Phase 1·2에 덧붙인다(`--context-file`).

### 3단계. Phase 1 — 구조 설계 (JSON 아웃라인)
1. `render --phase phase1 --category-id <ID> --topic "<주제>" --keyword "<키워드>" [--context-file context.txt]`
2. 본문은 쓰지 말고 **JSON 객체 하나만** 작성해 `phase1_raw.txt`에 저장(코드펜스·설명 금지).
3. `parse-phase1 --file phase1_raw.txt` → 성공 시 `outline.json`으로 저장.
4. 실패하면 `render --phase phase1-retry …`로 1회만 다시 쓴다. 또 실패하면 멈추고 "Phase 1 JSON 파싱 실패 (1회 재시도까지 모두 실패)"와 원문을 보여 준다.
5. 아웃라인의 `title`이 최종 제목이다(25~30자, 키워드 앞 15자 이내, 숫자 포함 — 다이어리는 숫자 강제 아님). `legal_references`에는 확신 있는 법령만 둔다.

### 4단계. Phase 2 — 본문 작성
1. `render --phase phase2 --category-id <ID> --outline-file outline.json [--context-file context.txt]`
2. 아웃라인의 제목·소제목 구조·keyword_plan·legal_references를 그대로 따르는 마크다운 본문을 쓴다. 첫 줄은 `# 제목`. 메타 설명·코드펜스 금지.
3. 한 번에 다 못 쓰고 끊겼다면(출력 한도) 이어쓰기를 최대 2회 한다: `render --phase continuation --outline-file outline.json --body-file phase2.md` → 이어 쓴 부분만 `cont.md`에 저장 → `merge-continuation --accumulated-file phase2.md --continuation-file cont.md`의 결과로 `phase2.md`를 갱신.
4. 마지막에 `strip-fence --file phase2.md`로 펜스를 정리한다. 비어 있으면 "Phase 2 응답이 비어있습니다."로 중단.
5. 시각 규칙은 Phase 2에 들어가지 않는다(원본도 `visual_rules: ""`). 이미지 마커는 다음 단계에서 붙인다.

### 5단계. Phase 2.5 — 인포그래픽 (didim-blog-infographic 위임)
1. `python3 $W/scripts/paragraph_ids.py inject --body-file phase2.md` → `phase2_ids.md` 저장.
2. didim-blog-infographic 스킬이 있으면 `phase2_ids.md`, 카테고리명, 핵심 키워드, promptKey(다이어리 여부)를 넘겨 마커가 삽입된 본문을 받는다. writer는 인포그래픽 프롬프트를 직접 쓰지 않는다.
3. 스킬이 없거나 실패하면 "인포그래픽 설계 건너뜀"을 알리고 진행한다(원본도 실패 시 계속 진행).
4. 다이어리는 원본상 Phase 2.5가 인포그래픽 3개를 설계하지만 다이어리 시각 규칙은 분위기 사진 1~2장이다 — 인포그래픽 스킬에 다이어리임을 반드시 알린다.

### 5-B. (선택) LEGACY 단일 프롬프트 모드
사용자가 명시적으로 요구할 때만. `render --phase legacy --category-id <ID> --topic .. --keyword .. [--context-file ..]`의 system+user를 따라 한 번에 쓴다(출력 형식·태그 블록 포함). CTA가 이미 들어가므로 9단계 마무리는 하지 않고 7단계 검증만 한다. 현재 백오피스는 이 경로를 쓰지 않는다는 점을 사용자에게 알린다.

### 6단계. 팩트체크·교차검증 (didim-blog-factcheck 위임)
1. 원본은 Phase 2(+2.5) 직후 교차검증 모달을 자동으로 열고, Phase 3는 사용자가 버튼을 눌러야 실행된다. 같은 순서로, 문단 ID가 있는 본문을 didim-blog-factcheck에 넘긴다.
2. 반영할 이슈는 사용자가 고른다. 반영 후 본문을 `phase2_ids.md`에 다시 저장한다(문단 ID 유지).
3. 사용자가 건너뛰면 그대로 7단계로 간다.

### 7단계. 중간 품질 체크
1. `python3 $W/scripts/paragraph_ids.py strip --body-file phase2_ids.md` → `pre3.md`.
2. `python3 $W/scripts/draft_checks.py --title "<제목>" --body-file pre3.md --category-id <ID>`
3. 점수와 미통과 항목, `generated_draft_warnings`(BITE 1,200자 초과·다이어리 CTA 키워드·허용 외 이메일)를 사용자에게 짧게 보여 준다. 이 시점의 CTA·서명 미통과는 정상이다(9단계에서 붙는다).

### 8단계. Phase 3 — SEO 최적화 / 다이어리 편집
1. `render --phase phase3 --category-id <ID> --keyword "<키워드>" --body-file pre3.md` (다이어리는 자동으로 PHASE3_PROMPT_DIARY).
2. 지시된 항목만 고친 **전체 본문**을 쓴다. 고친 곳은 `<!-- 수정: 설명 -->` 주석으로 표시(원문 지시). `━━ 📷 이미지 ━━` 블록과 `[IMAGE: ]` 마커는 수정·삭제·이동 금지, 법률명·핵심 숫자 변경 금지.
3. 볼드는 최종 3개를 목표로 한다(카테고리 규칙 5개 이하·Phase 3 3개 이하·품질 체크 3개 이상을 동시에 만족).
4. IP 뉴스 한 입(BITE)은 Phase 3 프롬프트 8번(1,500~2,500자)을 늘리는 근거로 쓰지 않는다 — 1,200자 이내 유지(카테고리 톤 규칙 우선).
5. `strip-fence`로 정리해 `phase3.md`에 저장.

### 9단계. 자동 마무리
```
python3 $W/scripts/finalize_draft.py finalize --phase2-file phase2_ids.md --phase3-file phase3.md \
  --category-id <ID> --keyword "<키워드>" --title "<제목>" --outline-file outline.json
```
스크립트가 원본 순서대로 처리한다: Phase 3 결과 200자 미만이면 Phase 2로 폴백 → 사라진 이미지 마커 복원 → `<!-- 수정 -->` 주석을 `edit_notes`로 분리 → 면책 문구 레벨(A 절세 사례/B 법률 해설/C 뉴스/다이어리 없음) → CTA(2차 분류→키워드→1차→범용) → `(확인 필요)` 정리·'특허청' 치환 → 구분선·CTA·서명·태그 줄(최대 10개, 특허그룹디딤·디딤변리사 보장) → 에디터용 태그 10개 → 문단 ID 제거본 → 발행예정일(다음 화요일).
- 다이어리는 정리만 하고 CTA·서명·태그 줄을 붙이지 않는다.
- `warnings`는 그대로 사용자에게 전한다. "본문이 너무 짧습니다"가 있으면 저장하지 않는다.

### 10단계. 최종 검증
1. `body_for_save`를 `final.md`로 저장하고 `draft_checks.py --title .. --body-file final.md --category-id <ID>`를 다시 돌린다.
2. 미통과 3개 이상이면 원본처럼 "품질 체크 미통과 항목이 N개 있습니다. 그래도 저장하시겠습니까?"로 확인받는다.
3. 다이어리에 CTA 키워드 경고가 있으면 해당 문장을 고친 뒤 다시 검증한다(절대원칙).

### 11단계. 전달·저장·인계
- Notion 커넥터가 있으면 "디딤 블로그 콘텐츠" DB에 저장(제목, 본문, 카테고리, 2차 분류, 핵심 키워드, 태그, 상태 "S1 초안 완료", 초안 완료일, 발행예정일, AI 생성 여부 ✓, 면책 레벨). 없으면 아래 출력 형식으로 전달한다. DB를 새로 만들지 않는다.
- 다음 단계 제안: SEO 점수 → didim-blog-seo, 네이버 붙여넣기용 정리(마크다운 제거·태그·ALT) → didim-blog-publish-prep, 상태 전이·검수 → didim-blog-ops.

## 출력 형식
````
## 제목
{제목} ({글자수}자)

## 본문 (마크다운 원문)
{body_for_save}

## 태그 (에디터 태그 필드용)
#태그1 … #태그10

## 검증
- 품질 체크: {passedCount}/{total} ({score}점), 미통과: …
- 생성 경고: … (없으면 "없음")
- 면책 레벨: A/B/C/none · CTA: {cta} · 발행예정일: {publish_date}

## Phase 3 수정 내역
- {edit_notes}

## 다음 단계
- SEO 점수(didim-blog-seo) / 발행 준비(didim-blog-publish-prep)
````

## 금지·주의
- 프롬프트 원문을 요약·의역해서 따르지 않는다. 반드시 `render` 결과 전문을 읽는다.
- 사용자 자료에 없는 고객 사례·수치를 사실처럼 만들지 않는다. 가정 사례는 "한 사례에서는"+전제 조건, 추정치는 (E)/"약" 표기.
- 법령 조항·별지 서식 번호는 100% 확신할 때만 쓴다. 확인은 didim-blog-factcheck의 몫이다.
- 카테고리 간 톤·분량·구조를 섞지 않는다(현장수첩 1인칭 사례 ↔ IP 라운지 이슈 칼럼 ↔ BITE 경량 5단계 ↔ 다이어리 에세이).
- 네이버 자동 발행을 하지 않는다. 발행은 사용자가 복사·붙여넣기로 한다.
- 문단 ID 주석(`<!-- p:N -->`)이 최종 본문에 남지 않게 한다.

## 참조 파일
| 파일 | 내용 |
|---|---|
| `references/pipeline-runtime.md` | 실행 경로 판별(3-Phase 사용 / LEGACY 미사용 근거), 단계별 system 메시지·max tokens·temperature, 치환 규칙, 프롬프트 키·카테고리명, getFieldCta, 분량 규칙, 이어쓰기·runPhase3 원문 |
| `references/phase-prompts.md` | PHASE1/2/3·PHASE3_DIARY·PHASE3_PROMPT_BY_KEY·CATEGORY_TONE_RULES 원문, Phase 2.5 연결 지점 |
| `references/common-writing-rules.md` | COMMON_WRITING_RULES와 7개 하위 규칙 원문, 규칙 간 충돌표 |
| `references/category-system-prompts.md` | PROMPT_FIELD/LOUNGE_GENERAL/LOUNGE_BITE/DIARY 원문, VISUAL_RULES_* |
| `references/legacy-user-prompts.md` | USER_PROMPTS 4종·ALT_TEXT_RULES 원문, LEGACY 실행·추출 코드 |
| `references/briefing-inputs.md` | PROMPT_BRIEFING_GENERATE/FROM_FILE 원문, 파일 처리·검증·매핑 코드 |
| `references/finalization.md` | cleanFinalText·appendCtaAndSignature·면책·자동 태그·기관명 치환 원문 |
| `references/validators.md` | draft-validator.ts·validateGeneratedDraft·paragraph-ids.ts 원문 |
| `scripts/data/prompts.json` | prompts.ts 런타임 문자열 덤프(render가 사용, 수정 금지) |

포팅 검증: 원본 TS(node `--experimental-strip-types`, LLM 호출은 fetch 모킹으로 요청 본문 캡처)와 Python 포팅을 같은 입력으로 비교해 Phase 1/2/3·이어쓰기 프롬프트, Phase 1 파싱, 이어쓰기 병합, validateDraft·validateGeneratedDraft, 문단 ID 7종, cleanFinalText·기관명 치환·면책·CTA·마커 복원·appendCtaAndSignature·자동 태그·브리핑 파싱 43개 항목과 LEGACY 조립 3종이 모두 일치했다.
