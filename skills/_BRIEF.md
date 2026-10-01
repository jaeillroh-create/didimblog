# 디딤 블로그 스킬 작성 공통 지침 (작업자용, 패키징 제외)

## 목표
didimblog 백오피스(Next.js + Supabase)의 기능을 **코드에 정의된 기능 단위**로 나눠 Claude 스킬로 옮긴다.
스킬은 claude.ai 프로필에 설치되어 **레포·DB 없이 어떤 세션에서도** 동작해야 한다.

## 스킬 목록 (이름 고정)
| 스킬 | 기능 | 주 원본 코드 |
|---|---|---|
| didim-blog-core | 브랜드·카테고리(1차/2차)·CTA·절대원칙·명칭 매핑·디스클레이머·광고 규정 (다른 스킬의 공통 기반) | src/lib/constants/categories.ts, prompts.ts의 FIELD_CTA·COMMON_WRITING_RULES·CATEGORY_TONE_RULES, name-mappings.ts, supabase/migrations/011,013, seed_data/cta_templates.json, docs/UPGRADE_SPEC.md §0·§5 |
| didim-blog-planner | 주제 추천·주간 기획·브리핑·뉴스 검색 | src/lib/recommendation-engine.ts, src/actions/recommendations.ts, briefing.ts, news-search.ts, keywords.ts, sub-category-pool.ts, schedule-data.ts, seed_data/schedule_12weeks.json, docs/UPGRADE_SPEC.md §7 |
| didim-blog-writer | 초안 생성 Phase 1→2→3, 카테고리별 프롬프트 4종, 초안 자동 검증, 파일 기반 브리핑 | prompts.ts(PROMPT_FIELD/LOUNGE_GENERAL/LOUNGE_BITE/DIARY, PHASE1/2/3, USER_PROMPTS), client-generate.ts, generation-runner.ts, draft-validator.ts, paragraph-ids.ts, actions/ai.ts, file-upload.ts |
| didim-blog-infographic | 인포그래픽 설계·이미지 생성 (v2 규칙) | prompts.ts VISUAL_RULES·FIRST_IMAGE_RULES·PHASE25·PROMPT_IMAGE_INFOGRAPHIC, client-generate.ts Phase25, actions/image-gen.ts + v2 규칙 문서 |
| didim-blog-factcheck | 팩트체크·교차검증·숫자 검증·Known Facts | prompts.ts PROMPT_FACT_CHECK(_QUICK)·PROMPT_CROSS_VALIDATION, legal-facts.ts, client-generate.ts 교차검증부, cross-validation 패널 |
| didim-blog-seo | SEO 18항목·카테고리별 루브릭·부분 점수·품질 점수 | seo-calculator.ts, seo-rubrics.ts, seo-items.ts, quality-score.ts, seed_data/seo_checklist.json, actions/seo-checks.ts, docs/UPGRADE_SPEC.md §6 |
| didim-blog-publish-prep | 네이버 발행 준비 뷰: 복사용 텍스트, 마크다운 제거, 태그 10개, ALT, 서식·이미지 가이드, 발행 전 체크리스트 | publish-helpers.ts, app/(dashboard)/contents/[id]/publish/*, docs/UPGRADE_SPEC.md §8 |
| didim-blog-ops | 콘텐츠 상태 S0~S5 전이 규칙·조건, SLA, 발행 캘린더, 12주 스케줄, 리뷰(승인/수정요청) | content-states.ts, sla-checker.ts, date-helpers.ts, actions/contents.ts, calendar.ts, migrations의 state_transitions 시드, SPEC.md §5.1·5.4 |
| didim-blog-health | 글 관리: 건강 점검(업데이트 필요), 내부 링크 추천, 시리즈, 키워드 커버리지 | content-health.ts, internal-link-recommender.ts, actions/manage.ts, keywords.ts, components/manage/* |
| didim-blog-performance | 성과 입력·KPI·리드(상담) 추적·키워드 순위·전환 분석·대시보드 요약 | actions/leads.ts, analytics.ts, dashboard.ts, components/analytics/*, components/leads/*, docs/UPGRADE_SPEC.md §4.2~4.5 |

## 산출물 (스킬마다)
1. `skills/<name>/SKILL.md`
   - YAML frontmatter: `name`, `description`(한국어, 언제 쓰는지 구체적으로·적극적으로. 트리거 표현 예시 포함. 1024자 이내).
   - 본문 한국어, 명령형, 300줄 이내. 왜 그런 규칙인지 짧게 설명.
   - 구성: 언제 쓰나 / 입력 / 절차(단계별) / 출력 형식 / 금지·주의 / 참조 파일 안내.
   - 공통 브랜드 규칙은 "didim-blog-core 스킬을 함께 읽는다"로 위임하되, 해당 스킬에 결정적인 절대원칙(이메일 admin@didimip.com, 다이어리 CTA 금지, '특허청'→'지식재산처', 결과 보장 표현 금지 등 관련 있는 것)은 3~5줄로 본문에 직접 적는다(코어 미설치 대비).
2. `skills/<name>/references/*.md` — **코드의 규칙·프롬프트·상수를 원문 그대로(verbatim) 옮긴다.** 요약·창작 금지. 프롬프트 템플릿의 `{{placeholder}}`는 유지하고, 각 placeholder에 무엇을 넣는지 표로 설명. 300줄 넘으면 목차.
3. `skills/<name>/scripts/*.py` — 계산·변환이 결정적인 로직(점수 계산, 날짜·SLA, 마크다운 제거, 문단 ID 등)은 TS를 Python 3 표준 라이브러리만으로 **충실히 포팅**. 각 스크립트는 `python3 script.py --help`가 되고, JSON 입출력. 원본 TS와 같은 입력에 같은 결과가 나오는지 최소 1개 예제로 직접 실행해 확인.
4. `docs/skills-spec/<name>.md` — 기능 명세서 섹션. 형식:
   ```
   # <스킬명> — <기능명>
   ## 1. 기능 개요 (한 문단)
   ## 2. 원본 코드 위치 (파일:함수/상수 목록)
   ## 3. 입력
   ## 4. 처리 규칙 (번호 매긴 규칙, 코드 근거 file:line 표기)
   ## 5. 출력
   ## 6. 예외·오류 처리
   ## 7. 데이터 저장 (백오피스 테이블 → 스킬에서의 대체: Notion DB 필드 또는 사용자 입력)
   ## 8. 원본 코드와 달라진 점 (없으면 "없음") — 코드 내부 모순·미구현·스킬 환경 때문에 바꾼 것을 근거와 함께
   ## 9. 다른 스킬과의 연결 (입력을 받는/넘기는 스킬)
   ```
   명세는 **코드에서 확인한 사실만**. 추측은 "확인 필요"로 표시.

## 환경 전제 (스킬 본문에 반영)
- Supabase/백오피스 없음. 데이터는 ① 사용자가 붙여넣은 텍스트 ② Notion 커넥터가 있으면 Notion DB ③ 네이버 블로그 RSS(https://rss.blog.naver.com/didimip.xml — 환경에 따라 막힐 수 있음, 실패 시 사용자에게 요청).
- 상태·발행 기록을 담는 Notion DB 이름은 **"디딤 블로그 콘텐츠"**(콘텐츠), **"디딤 블로그 성과"**(글별 성과), **"디딤 블로그 상담"**(리드)로 통일. 필드는 원본 테이블 컬럼을 한국어로 매핑하고 spec 7절에 표로 적는다. (실제 DB 생성은 하지 않는다.)
- LLM 호출 코드는 Claude가 직접 수행하는 절차로 바꾼다(Phase별 프롬프트를 Claude 자신이 따른다). 다른 LLM(GPT/Gemini) 교차검증은 "가능하면 서브에이전트/별도 패스로 독립 검토"로 대체하고 spec 8절에 적는다.
- 네이버 발행은 사람의 붙여넣기 또는 브라우저 에이전트의 직접 입력(발행 게이트 + 사람 확인). _DECISIONS.md 9절.

## 작업 규칙
- 레포 경로: /home/user/didimblog. 코드 수정 금지(skills/, docs/skills-spec/ 에만 쓴다).
- 다른 작업자의 스킬 폴더는 건드리지 않는다.
- 끝나면 만든 파일 목록, 포팅 스크립트 검증 결과, spec 8절에 적은 차이점 요약, 확인 필요 사항을 보고.
