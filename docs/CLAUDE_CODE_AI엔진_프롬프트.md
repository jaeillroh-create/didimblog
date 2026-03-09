# Claude Code 프롬프트 — AI 콘텐츠 생성 엔진

## 프롬프트 1: DB 마이그레이션 + 기본 구조

```
AI 콘텐츠 생성 엔진을 추가해. docs/AI_콘텐츠_생성엔진_상세기획서.md를 참고해.

먼저 Phase 1 — DB + 기본 구조:

1. Supabase 마이그레이션 SQL 생성 (supabase/migrations/002_ai_engine.sql)
   - llm_configs 테이블 (LLM 설정, API 키 암호화)
   - prompt_templates 테이블 (카테고리별 프롬프트)
   - ai_generations 테이블 (AI 생성 이력)
   - contents 테이블에 ai_generation_id, is_ai_generated, ai_edited_by, ai_edit_ratio 컬럼 추가
   - briefings 관련 필드(briefing_due, briefing_done_at) 제거는 하지 말고 nullable로 유지
   - RLS 정책 추가
   - 프롬프트 템플릿 시드 데이터 (현장수첩_절세, IP라운지_일반, 디딤다이어리_일반, 교차검증_공통)

2. TypeScript 타입 업데이트 (src/lib/types/database.ts)
   - LLMConfig, PromptTemplate, AIGeneration 타입 추가
   - LLMProvider = 'claude' | 'openai' | 'gemini'
   - GenerationStatus = 'pending' | 'generating' | 'completed' | 'failed' | 'cancelled'

3. LLM 프록시 유틸리티 (src/lib/llm/)
   - src/lib/llm/providers/claude.ts — Anthropic API 호출 (스트리밍)
   - src/lib/llm/providers/openai.ts — OpenAI API 호출 (스트리밍)
   - src/lib/llm/providers/gemini.ts — Google AI API 호출 (스트리밍)
   - src/lib/llm/index.ts — 통합 인터페이스 (provider에 따라 라우팅)
   - 각 provider는 동일한 인터페이스: generateStream(config, messages) => AsyncGenerator<string>

4. Server Actions (src/actions/ai.ts)
   - generateDraft: 초안 생성 (프롬프트 템플릿 + LLM 호출)
   - getGenerationStatus: 생성 상태 조회
   - requestCrossValidation: 교차검증 (멀티 LLM 병렬 호출)
   - getValidationResults: 검증 결과 조회
   - regenerateDraft: 피드백 반영 재생성
   - saveLLMConfig: LLM 설정 저장 (API 키는 서버사이드에서만 처리)
   - testLLMConnection: 연결 테스트
   - getTopicRecommendations: 스케줄 기반 주제 추천

npm run build 확인 후 커밋/푸시.
```

## 프롬프트 2: UI 구현

```
AI 콘텐츠 생성 엔진 UI를 구현해. docs/AI_콘텐츠_생성엔진_상세기획서.md의 UI/UX 명세 참고.

1. AI 초안 생성 Dialog (src/components/contents/ai-draft-dialog.tsx)
   - "추천 주제" / "직접 입력" 탭 전환
   - 주제, 카테고리, 2차분류, 핵심키워드, 타깃고객, 참고사항 입력
   - 카테고리 선택 시 프롬프트 템플릿 자동 매핑
   - LLM 모델 선택 드롭다운 (llm_configs에서 활성화된 모델만)
   - "AI 초안 생성 시작" 버튼

2. AI 에디터 페이지 (src/app/(dashboard)/contents/ai-editor/[id]/page.tsx)
   - 좌측: 리치 텍스트 에디터 (생성된 초안 표시, 편집 가능)
   - 우측: 사이드 패널
     - SEO 점수 실시간 표시 (18항목 기반)
     - 생성 정보 (LLM, 토큰, 소요시간)
     - 태그 목록 (편집 가능)
     - [IMAGE: 설명] 마커를 시각적으로 하이라이트
   - 상단 액션: "교차검증 요청", "저장" (S1로 전이), "재생성"
   - 스트리밍 생성 시 실시간으로 텍스트가 타이핑되는 효과

3. 교차검증 결과 패널 (src/components/contents/cross-validation-panel.tsx)
   - 각 LLM의 검증 결과를 카드로 표시
   - 점수, verdict(pass/fix_required/major_issues), 이슈 목록
   - 이슈 항목별 심각도 색상 (high=빨강, medium=주황, low=회색)
   - "피드백 반영 재생성" / "현재 초안으로 진행" 버튼

4. 설정 > AI 설정 탭 (src/components/settings/ai-settings.tsx)
   - LLM 연결 관리 (3개 provider: Claude, GPT, Gemini)
   - API 키 입력 (비밀번호 마스킹, 수정 시만 표시)
   - 모델 선택 드롭다운 (각 provider별)
   - 연결 테스트 버튼 (성공/실패 표시)
   - 기본 LLM 선택
   - 월간 토큰 상한 설정
   - 현재 토큰 사용량 표시 (프로그레스바)
   - 프롬프트 템플릿 관리 (목록 + 편집 Dialog)

5. 콘텐츠 관리 페이지 수정
   - "새 글 만들기" 버튼 → "수동 작성" / "AI 생성" 선택지
   - 이번 주 추천 주제 배너 (상단)
   - 칸반보드 S0 카드에 "AI 생성중" 배지

6. 콘텐츠 상세 페이지 수정
   - is_ai_generated인 경우 "AI 생성" 배지 표시
   - AI 생성 이력 보기 (ai_generations 조회)

npm run build 확인 후 커밋/푸시.
```

## 프롬프트 3: 통합 테스트 + 마무리

```
AI 콘텐츠 생성 엔진 통합 테스트 및 마무리:

1. 기존 기능과의 충돌 확인
   - 콘텐츠 칸반보드에서 AI 생성 콘텐츠가 정상 표시되는지
   - 상태 전이 (S0→S1→S2→...S5) 기존 로직과 호환되는지
   - SEO 체크리스트가 AI 에디터와 기존 상세 페이지 양쪽에서 동작하는지

2. 에러 핸들링 보강
   - API 키 미설정 시 안내 메시지
   - API 호출 실패 시 재시도 + 에러 메시지
   - 토큰 상한 초과 시 경고
   - 스트리밍 중 네트워크 에러 대응

3. 음성 브리핑 관련 잔재 정리
   - UI에서 "브리핑" 관련 텍스트가 남아있으면 제거 또는 "AI 생성"으로 교체
   - SLA 타임라인에서 D-5를 "AI 주제선정+초안생성"으로 변경
   - briefings 테이블 관련 Server Action/컴포넌트가 있으면 제거

4. 빌드 확인 + 커밋/푸시
```
