# didim-blog-infographic — 인포그래픽 설계·이미지 생성 (규칙 v2)

## 1. 기능 개요

완성된 블로그 본문(+카테고리·키워드)을 받아 네이버 검색결과용 썸네일(T) 1개와 본문 인포그래픽(A~H) 0~3개를 설계하고, 설계의 수치가 본문에 그대로 있는지 검사한 뒤, 블로그 이미지 전용 팔레트로 1080×1080(썸네일)·1080×1350(본문) 이미지를 코드로 렌더링한다. 디딤 다이어리는 설계를 건너뛰고 분위기 사진 프롬프트만 만든다. 백오피스에서는 Phase 2.5(LLM 설계 → 본문 마커 삽입)와 DALL·E 3 이미지 생성(글자 없는 일러스트)으로 나뉘어 있었고 규칙끼리 모순이 있어, 스킬은 사용자와 합의한 **"디딤 블로그 인포그래픽 규칙 v2"**(`skills/didim-blog-infographic/references/rules-v2.md`)를 기준으로 한다. 원본 코드 규칙은 `references/legacy-code-rules.md`에 원문 보존했다.

## 2. 원본 코드 위치

| 파일 | 함수/상수 | 줄 |
|---|---|---|
| src/lib/constants/prompts.ts | `VISUAL_RULES` (시각 자료 공통 규칙, 유형 A~H, 9요소, 예시 3개) | 316-391 |
| src/lib/constants/prompts.ts | `FIRST_IMAGE_RULES` (첫 이미지 = 썸네일 T 규칙, 카테고리 색) | 393-442 |
| src/lib/constants/prompts.ts | `VISUAL_RULES_FIELD` / `VISUAL_RULES_LOUNGE` / `VISUAL_RULES_DIARY` | 444-473 |
| src/lib/constants/prompts.ts | `ALT_TEXT_RULES` | 475-482 |
| src/lib/constants/prompts.ts | `PROMPT_FIELD` 등 시스템 프롬프트의 `${VISUAL_RULES_*}` 삽입 | 552, 645, 739, 821 |
| src/lib/constants/prompts.ts | `USER_PROMPTS`의 `${ALT_TEXT_RULES}` 삽입 | 1312, 1389, 1434 |
| src/lib/constants/prompts.ts | `PHASE25_INFOGRAPHIC_PROMPT` | 1020-1116 |
| src/lib/constants/prompts.ts | `PROMPT_IMAGE_INFOGRAPHIC` (DALL·E 프롬프트) | 1747-1758 |
| src/lib/client-generate.ts | `replaceTemplate` | 595-601 |
| src/lib/client-generate.ts | `InfographicDesign`, `Phase25Result` 타입 | 825-840 |
| src/lib/client-generate.ts | `clientRunPhase25` | 846-898 |
| src/lib/client-generate.ts | `parsePhase25Json` (JSON 3단계 복구) | 904-978 |
| src/lib/client-generate.ts | `insertInfographicMarkers` | 984-1086 |
| src/lib/utils/paragraph-ids.ts | `injectParagraphIds`, `stripParagraphIds` | 23-50 |
| src/actions/image-gen.ts | `buildImagePrompt`, `sanitizeForInsert`, `generateInfographic`, `generateAllInfographics`, `getGeneratedImages` | 72-334 |
| src/lib/llm/providers/image-gen.ts | `generateImage` (dall-e-3, 기본 1024x1024) | 8-33 |
| src/app/(dashboard)/contents/ai-editor/[id]/ai-editor-client.tsx | Phase 2.5 호출·마커 삽입, `extractImageMarkers` | 798-840, 501-535 |
| src/lib/constants/categories.ts | `CATEGORY_COLORS` (CAT-A #D4740A, CAT-B #1B3A5C) | 2-8 |
| supabase/migrations/005_briefing_and_images.sql | `generated_images` 테이블 | 8-23 |

## 3. 입력

| 입력 | 필수 | 원본 대응 |
|---|---|---|
| 완성 본문 (문단 ID `<!-- p:N -->` 포함 또는 주입) | 필수 | `phase2Body` (ai-editor-client.tsx:800-803에서 `injectParagraphIds` 후 전달) |
| 카테고리 (신규·레거시 이름 또는 네이버 categoryNo) | 필수 | `categoryName` (`getCategoryName(categoryId)`) |
| 핵심 키워드 | 권장 | `targetKeyword` |
| 글 제목 | 권장 | (원본은 본문 첫 `#` 줄) |
| 설계 JSON (렌더링·검사·마커 삽입 스크립트 입력) | 스크립트 입력 | 원본 `InfographicDesign` 대신 v2 8항목 |

## 4. 처리 규칙

1. **카테고리 판별**: 신규 구조(skills/_DECISIONS.md §1·§2)를 v2 카테고리 규칙에 매핑한다 — 지원사업·인증과 특허(25)·출원·심판 실무(27)·사례(26) → 현장 수첩 규칙(팔레트·개수 2~3), 지식재산 경영(24) → IP 라운지 규칙(1~2), 디딤 소식(28) → IP 뉴스 한 입 규칙(0~1, C만), 디딤 다이어리(17~20) → 분위기 사진. 레거시 이름도 받는다(`scripts/categories.py`). 원본은 카테고리명 문자열에 "다이어리" 포함 여부만 본다(client-generate.ts:857).
2. **다이어리**: 설계 단계를 실행하지 않고 분위기 사진 1~2장 프롬프트만(글자·로고·CTA·사람 얼굴 없음, 4:3 1080×810). 원본은 다이어리에도 Phase 2.5를 "정확히 3"개로 실행한다(client-generate.ts:857-860) — v2에서 폐지. 장면 예시 12개는 원본 `VISUAL_RULES_DIARY`(prompts.ts:462-473).
3. **후보 데이터 추출**: 비교 숫자 쌍 / 핵심 수치 3개+ / 3단계+ 절차 / 요건 5개+ / 제도·기관 구조 중 하나 이상 (v2 "개수와 배치"). 원본의 1단계 데이터 추출 목록은 prompts.ts:1032-1041.
4. **유형 매칭**: A~H 8유형(정의 v2 "본문 인포그래픽 유형" 표, 원본 prompts.ts:1043-1054). 같은 유형 1회, B와 F 동시 금지(원본 prompts.ts:1059-1064와 동일). 카테고리별 우선 유형(v2).
5. **개수**: 썸네일 1 + 카테고리별 범위(4.1). 원본은 "정확히 4"(비다이어리)/"정확히 3"(다이어리) 고정(client-generate.ts:860) — v2에서 범위로.
6. **위치**: 썸네일 "top", 본문은 데이터 문단 바로 뒤 "p:N"(원본 prompts.ts:1066-1068, 1114). 이미지 사이 문단 2개 이상(v2; 원본 VISUAL_RULES "연속 2개 금지" prompts.ts:324).
7. **설계 JSON 8항목**: type, position, headline(20자 이내), texts(이미지의 모든 글자), data_source(본문 원문 인용), emphasis(1~2개), footnote(출처·기준일·단위, 사례면 "개별 상황에 따라 다름"), alt(20~40자, 키워드 앞). 원본 항목(type_name, selection_reason, korean_prompt, english_prompt, emotion, data_source)은 prompts.ts:1081-1112, client-generate.ts:825-834.
8. **texts 배치 순서**(스킬이 정함, 렌더러 계약): T=[태그, 메인 2~3줄, (서브)], A=[라벨A, 값A, 라벨B, 값B, (차이)], B=["제목|설명"…], C·D·F·H=[라벨, 값…], E=[항목…], G=[중심, "주체|관계"…]. 확인 필요: v2 문서에는 texts의 순서 규칙이 없다.
9. **검사**(`scripts/check_sources.py`): data_source가 본문에 그대로 있는지(공백 정규화, 굵게 표시·문단 ID 제거 후 비교), headline·texts·footnote의 모든 숫자 표기가 본문에 있는지(띄어쓰기만 다르면 경고), texts 숫자가 data_source에 있는지, 글자 수(헤드라인 20·라벨 10·썸네일 한 줄 10), 강조 1~2개·texts 안, 수치 5개 이하, 결과 보장 표현, 사례 주석, 연락처·URL·전화, 다른 '디딤' 표기, '특허청', 이모지, ALT 길이·키워드 위치·반복(3회 초과), 썸네일 1개, 카테고리별 개수, 유형 중복, B+F, 이미지 간격. 원본에는 data_source 검증이 없다(v2 "코드에 반영할 위치"에서 요구).
10. **렌더링**(`scripts/render.py`): 유형별 SVG 템플릿에 texts·팔레트를 넣어 그린다. 팔레트 `BLOG_IMAGE_PALETTE`(v2 표): 현장 수첩 #D4740A/강조 #1B3A5C, IP 라운지 #1B3A5C/#C28B2E, IP 뉴스 한 입 #3A3A3A/#C5302B, 썸네일 글자 #FFFFFF, 본문 흰 배경·글자 #191F28·강조=대표색, 보조 회색 #8B95A1(확인 필요: v2에 hex 없음). 폰트 `'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`. 최소 글자 28px(폭 2.5%). 긴 글자는 크기 축소 → 줄바꿈(외톨이 단어 방지 균형 줄바꿈), 넘치면 warnings. 썸네일 레이아웃: 상단 태그(0~15%) / 메인 문구(폭 약 80%) / 하단 얇은 구분선 + "특허그룹 디딤"(메인의 약 20%) — 원본 FIRST_IMAGE_RULES(prompts.ts:404-433)와 v2 동일.
11. **PNG 변환**: cairosvg → Python playwright → Node playwright 순으로 시도, 없으면 SVG + preview.html. 원본은 DALL·E 3 b64 PNG(providers/image-gen.ts:15-22).
12. **마커 삽입**(`scripts/insert_markers.py`): 원본 `insertInfographicMarkers` 포팅(뒤에서부터, top→제목 다음, p:N→다음 문단 앞, ##소제목, 숫자, 균등 분배; client-generate.ts:984-1086). 레거시 모드는 원본과 바이트 단위로 같은 출력, v2 모드는 설명=alt·한국어=headline+texts·(2) 파일명.
13. **JSON 복구**(`scripts/design_json.py`): 원본 `parsePhase25Json` 3단계(펜스 제거·그대로 파싱 / 잘린 JSON 괄호 닫기 / 개별 객체 정규식 추출; client-generate.ts:904-978) 포팅.
14. **검수 체크리스트**: v2 "발행 전 검수 체크리스트" 8항목.

## 5. 출력

| 출력 | 형식 |
|---|---|
| 설계 요약 표 | 번호/유형/위치/헤드라인/ALT |
| 설계 JSON | v2 8항목 배열 |
| 검사 결과 | `{"ok","errors","warnings","images":[{"index","type","numbers","missing_sources"}]}` (오류 시 종료 코드 1) |
| 이미지 | `NN_<type>.svg`, 가능하면 `.png`, `preview.html`; 렌더 결과 JSON `{"outputs":[{index,type,position,alt,category,palette,svg,png,width,height,warnings}],"png_engine","preview","font_note"}` |
| 다이어리 | 분위기 사진 1~2장 프롬프트(위치·장면·ALT·영문 프롬프트) |
| 마커 삽입 본문 | 레거시 `━━ 📷 이미지 N ━━ / [IMAGE: …] / ━━━━` 형식 (`extractImageMarkers` 박스 정규식 호환, ai-editor-client.tsx:519) |
| 검수 체크리스트 | 8항목 ✓/✗ |

## 6. 예외·오류 처리

| 상황 | 원본 | 스킬 |
|---|---|---|
| LLM 스트리밍 실패 | `{success:false, error}` (client-generate.ts:880-882), toast로 건너뜀 (ai-editor-client.tsx:833-839) | 해당 없음(Claude가 직접 설계) |
| JSON 파싱 실패 | 3단계 복구 후 실패 시 "Phase 2.5 JSON 파싱 완전 실패" (client-generate.ts:886-889) | `design_json.py` 동일 복구 + 3단계 보정, 실패 시 종료 메시지 |
| 설계 결과 비어 있음 | "인포그래픽 설계 결과가 비어있습니다" (client-generate.ts:892-895) | 썸네일만 있는 것도 허용(본문 0개 가능 카테고리), 썸네일 0개면 검사 오류 |
| 위치를 못 찾음 | 소제목 → 숫자 → 균등 분배 → 본문 끝 폴백 (client-generate.ts:1031-1081) | 동일. 단 검사 단계에서 존재하지 않는 p:N은 오류로 먼저 잡음 |
| 숫자가 본문에 없음 | 검사 없음 | 오류 — 숫자를 지우거나 본문 표기로 수정. 본문 수정은 사용자에게 알림 |
| 글자가 넘침 | 해당 없음 | 크기 축소(최소 28px) → 줄바꿈 → warnings. 문구를 줄여 재렌더링 |
| 한글 폰트 없음 | 해당 없음 | `font_note`로 알림(설치 시도 안 함). SVG를 한글 폰트가 있는 PC에서 열도록 안내 |
| PNG 도구 없음 | 해당 없음 | SVG + preview.html 제공(`--png force`면 오류) |
| 이미지 생성 정책 위반 | content_policy 메시지 (image-gen.ts:208-228) | 다이어리 사진 프롬프트만 해당 — 사용자가 외부 도구에서 생성 |
| 다이어리에 render 요청 | 다이어리도 3개 설계 | render.py 종료 메시지, check_sources 오류 |

## 7. 데이터 저장

| 백오피스 테이블.컬럼 | 스킬에서의 대체 |
|---|---|
| ai_generations.phase2_output (마커가 삽입된 본문, `savePhase2Output`) | 사용자에게 마커 삽입 본문을 돌려줌. 저장은 didim-blog-writer/publish-prep 흐름 |
| generated_images.generation_id, marker_index | 설계 JSON의 배열 순서(index) |
| generated_images.description | 설계 JSON 전체(마커의 설명 = alt) |
| generated_images.prompt_used | 설계 JSON (렌더링 입력) |
| generated_images.image_provider / image_model | 렌더 결과 JSON의 `png_engine` ("playwright-node" 등) |
| generated_images.storage_path / public_url (Supabase Storage blog-images) | 로컬 출력 폴더 파일 경로. 업로드는 사용자가 네이버에 직접 |
| generated_images.alt_text | 설계 JSON `alt` (원본은 이 컬럼을 읽기만 하고 쓰는 코드가 없음 — 확인 필요) |
| generated_images.status / error_message / generation_time_ms | 렌더 결과 `warnings`, 검사 결과 `errors` |
| contents.image_alt_texts (007_contents_columns.sql:11) | 설계 JSON `alt` 목록 |
| Notion "디딤 블로그 콘텐츠" | 저장하지 않음. 필요 시 '메모'에 이미지 설계 요약(유형·위치·ALT)을 적을 수 있음 |

## 8. 원본 코드와 달라진 점

### 8.1 v2 규칙 적용에 따른 차이 (기준: rules-v2.md)

| 항목 | 원본 코드 (근거) | 스킬 (v2) |
|---|---|---|
| 이미지 속 글자 | 설계는 "ALL text in image must be Korean" (prompts.ts:335, 1072), 그림 단계는 "NO text in the image" (prompts.ts:1754) | 인포그래픽은 코드 렌더링으로 한국어 글자를 그림. "NO text"는 이미지 모델(다이어리 사진)에만 |
| 개수 | VISUAL_RULES "1~5개" (prompts.ts:323), PROMPT_FIELD "1~5개" (prompts.ts:550), Phase 2.5 "정확히 4/3" (client-generate.ts:860) | 썸네일 1 + 카테고리별 0~3 |
| 다이어리 | VISUAL_RULES_DIARY "사진 1~2장" (prompts.ts:462-473)인데 Phase 2.5는 다이어리에도 3개 설계 (client-generate.ts:856-860) | 설계 단계 건너뜀, 분위기 사진만 |
| 비율·크기 | 16:9 (prompts.ts:357), 1:1 1080 (prompts.ts:404), DALL·E 1024×1024 (prompts.ts:1756, providers/image-gen.ts:11) | 썸네일 1:1 1080×1080, 본문 4:5 1080×1350, 다이어리 4:3 1080×810 |
| 색상 | "특정 색상 고정 금지·감정 톤에 맞게 자유 선택" (prompts.ts:326, 352, 355), 썸네일 네이비 #1A2B4A 하드코딩 (prompts.ts:423-425), DALL·E 네이비 #1A1A2E (prompts.ts:1752) | `BLOG_IMAGE_PALETTE` 하나, 네이비 #1B3A5C로 통일, 감정 톤은 문구로만 |
| 헤드라인 표현 | 예시 "150만 원으로 법인세 6천만 원 절감한 방법" (prompts.ts:347), "4주 만에 연구소 설립 완료" (prompts.ts:387) | 광고 규정 적용: 사례·범위 표현 ("…줄인 사례") |
| 설계 출력 | korean_prompt·english_prompt·emotion·type_name·selection_reason (prompts.ts:1081-1112) | headline·texts·data_source·emphasis·footnote·alt |
| 이중 프롬프트 | 한국어+영문 필수 (prompts.ts:328-336, 1070-1072) | 없음 |
| ALT | 글 전체 "핵심 3개" (prompts.ts:480) | 이미지마다 1개, 같은 키워드 3회 초과 반복 금지 |
| 현장 수첩 A | "Before/After 비교(A) 필수 1개 이상" (prompts.ts:449) | "A 우선", 비교 숫자가 본문에 없으면 만들지 않음 |
| data_source | 출력만 하고 검증 없음 (client-generate.ts:846-898) | 본문 원문 존재 검사 (`check_sources.py`) |
| 이모지 | 예시에 📋💰📅 아이콘 (prompts.ts:363-365) | 금지 |
| 이미지 생성 경로 | 모든 마커를 DALL·E 3로 (image-gen.ts:120-285) | T·A~H는 SVG 템플릿, 이미지 모델은 다이어리 사진만 |

### 8.2 신규 카테고리 매핑 (skills/_DECISIONS.md 반영)

- 원본·v2는 레거시 카테고리(현장 수첩/IP 라운지/IP 뉴스 한 입/다이어리)만 다룬다. 스킬은 신규 구조를 매핑: 지원사업·인증과 특허·출원·심판 실무·사례 → 현장 수첩 팔레트·개수, 지식재산 경영 → IP 라운지, 디딤 소식 → IP 뉴스 한 입, 디딤 다이어리 → 분위기 사진(코디네이터 지시, _DECISIONS.md §1·§2).
- v2는 "출원 실무"를 IP 라운지(1~2개) 줄에 두었으나, 네이버 실제 구조에서 "특허·상표 출원 실무"(23)는 현장 수첩(9) 하위이고 신규 "출원·심판 실무"(27)는 현장 수첩 규칙으로 매핑했다. 우선 유형은 v2의 출원 실무 우선 유형(B·D·E)을 유지. 확인 필요.
- 디딤 소식의 "사무소 소식"은 수치가 없으면 본문 인포그래픽 0개(범위 하한).

### 8.3 원본 코드 결함·모순 (포팅 중 확인한 사실)

| 항목 | 원본 동작 (근거) | 스킬 처리 |
|---|---|---|
| JSON 복구 3단계 | 정규식 매치가 따옴표로 끝나는데 `'"}'`+`'}'`을 붙여 `…"값""}}`가 되어 JSON.parse가 항상 실패 (client-generate.ts:951-955). 깨진 따옴표 입력에서 TS는 `null`, 동일 입력 실행으로 확인 | 원본 시도 후 실패하면 값 뒤에서 바로 `}`로 닫는 보정 시도 (design_json.py) |
| 썸네일 이중 삽입 | T 삽입 뒤 p:N 분기에 `!inserted` 조건이 없어 T가 "p:N" position을 가지면 두 번 삽입 (client-generate.ts:1006-1034). 테스트에서 설계 6개 → 마커 7개로 확인 | v2 모드는 1회만. legacy 모드는 원본 그대로 |
| 썸네일 위치 | Phase 2.5 전에 문단 ID를 주입하면(ai-editor-client.tsx:800-803) 본문이 `<!-- p:1 -->\n# 제목`으로 시작해 `/^#[^\n]*\n/`(client-generate.ts:1009)이 실패 → 썸네일 마커가 제목 위(문서 맨 앞)에 들어감 | v2 모드는 문단 ID 주석 다음 제목 줄 뒤에 삽입 |
| ALT 저장 | `generated_images.alt_text`를 조회만 하고 쓰는 코드가 없음 (image-gen.ts:168-178, 320) | 설계 JSON의 alt로 대체. 확인 필요 |
| Phase 2 시각 규칙 | 3단계 파이프라인의 Phase 2는 `visualRules: ""`로 호출 (ai-editor-client.tsx:781) — 마커는 Phase 2.5만 만듦. 반면 시스템 프롬프트(PROMPT_FIELD 등, prompts.ts:552·645·739·821)에는 VISUAL_RULES가 들어 있어 단일 생성 경로에서는 본문 작성 중 마커를 만든다. 어느 경로가 운영 중인지는 확인 필요 | 스킬은 본문 완성 후 별도 설계 1가지 경로만 |
| `buildImagePrompt` | `String.replace`라 같은 placeholder가 두 번 있으면 첫 번째만 치환 (image-gen.ts:72-76). 현재 템플릿은 각 1회라 영향 없음 | 해당 없음 |

### 8.4 스킬 환경 때문에 바꾼 것

- LLM 호출(clientRunPhase25, streamLLM)은 Claude가 `references/design-prompt.md`를 직접 따르는 절차로 대체. 다른 LLM 사용 없음.
- DALL·E·Supabase Storage·generated_images 대신 로컬 SVG/PNG 파일. 업로드는 사용자가 네이버에 수동으로.
- 텍스트 폭 측정은 폰트 파일 없이 글자 종류별 근사치(한글 1.0em 등)로 계산 — 실제 폰트와 줄바꿈이 조금 다를 수 있어 렌더 후 PNG를 직접 보고 확인하는 단계를 절차에 넣음.
- 이 작업 컨테이너에는 'Noto Sans KR'이 없어 샘플 PNG는 대체 폰트(fontconfig 폴백, WenQuanYi Zen Hei 계열)로 렌더링됨. Python playwright·cairosvg는 없고 Node playwright(Chromium /opt/pw-browsers)로 변환함.

## 9. 다른 스킬과의 연결

| 방향 | 스킬 | 주고받는 것 |
|---|---|---|
| 받음 | didim-blog-writer | 완성 본문(문단 ID 포함), 제목, 카테고리, 키워드. (원본 파이프라인에서 Phase 2.5는 Phase 2 직후, Phase 3 전) |
| 받음 | didim-blog-core | 브랜드 표기, 카테고리 정본, 광고 규정, '지식재산처' 명칭, 다이어리 CTA 금지 |
| 받음 | didim-blog-factcheck | 검증된 수치 — 팩트체크로 본문 숫자가 바뀌면 설계·이미지를 다시 검사·렌더링 |
| 넘김 | didim-blog-publish-prep | 마커 삽입 본문, 이미지 파일, ALT 목록(네이버 ALT 입력·이미지 배치 가이드에 사용) |
| 넘김 | didim-blog-seo | 이미지 개수·ALT(SEO 항목의 이미지·ALT 점검 입력) — 확인 필요: SEO 항목 정의는 seo 스킬 기준 |
