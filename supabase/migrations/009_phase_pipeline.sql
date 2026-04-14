-- ============================================
-- 009_phase_pipeline.sql
-- AI 초안 생성 흐름을 단일 호출에서 3-Phase 순차 파이프라인으로 변경하면서
-- 각 Phase 의 중간 산출물을 ai_generations 테이블에 보존한다.
--
-- - phase1_output (jsonb): Phase 1 구조 설계 결과 (제목/섹션/keyword_plan/
--   legal_references/infographic_plan)
-- - phase2_output (text): Phase 2 본문 (스트리밍 결과 그대로)
-- - phase (text): 현재 진행 단계 ('phase1' | 'phase2' | 'phase3' | 'completed')
--
-- 기존 generated_text 컬럼은 Phase 3 (또는 Phase 3 를 건너뛴 경우 Phase 2)
-- 의 최종 출력 (final_output) 으로 그대로 사용한다.
-- ============================================

ALTER TABLE public.ai_generations
  ADD COLUMN IF NOT EXISTS phase1_output jsonb,
  ADD COLUMN IF NOT EXISTS phase2_output text,
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'phase1'
    CHECK (phase IN ('phase1', 'phase2', 'phase3', 'completed', 'failed'));

-- 기존 row 는 phase = 'completed' 로 마크 (이미 generated_text 가 있으면)
UPDATE public.ai_generations
SET phase = 'completed'
WHERE generated_text IS NOT NULL
  AND phase = 'phase1';

-- PostgREST 캐시 리로드
NOTIFY pgrst, 'reload schema';
