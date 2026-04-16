-- 014: 상태 전이 통합 수정 — RLS UPDATE 정책 + 전이 이력 테이블
--
-- ⚠️ contents 테이블에 UPDATE 정책이 없으면 모든 저장/전이/검수가 실패합니다.
-- 이 마이그레이션을 Supabase SQL Editor 에서 수동 실행하세요.

-- ── 1) contents UPDATE 정책 (없으면 추가) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contents' AND cmd = 'UPDATE'
  ) THEN
    CREATE POLICY "authenticated_can_update_contents"
      ON contents FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
    RAISE NOTICE 'contents UPDATE 정책 추가됨';
  ELSE
    RAISE NOTICE 'contents UPDATE 정책 이미 존재';
  END IF;
END $$;

-- ── 2) contents SELECT 정책 (없으면 추가) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contents' AND cmd = 'SELECT'
  ) THEN
    CREATE POLICY "authenticated_can_select_contents"
      ON contents FOR SELECT
      TO authenticated
      USING (true);
    RAISE NOTICE 'contents SELECT 정책 추가됨';
  END IF;
END $$;

-- ── 3) contents INSERT 정책 (없으면 추가) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contents' AND cmd = 'INSERT'
  ) THEN
    CREATE POLICY "authenticated_can_insert_contents"
      ON contents FOR INSERT
      TO authenticated
      WITH CHECK (true);
    RAISE NOTICE 'contents INSERT 정책 추가됨';
  END IF;
END $$;

-- ── 4) RLS 활성화 확인 ──
ALTER TABLE contents ENABLE ROW LEVEL SECURITY;

-- ── 5) 누락될 수 있는 컬럼 재확인 ──
ALTER TABLE contents ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'pending';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS review_memo text;

-- review_status CHECK 제약 (이미 있으면 무시)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'contents_review_status_check'
  ) THEN
    ALTER TABLE contents ADD CONSTRAINT contents_review_status_check
      CHECK (review_status IN ('pending', 'approved', 'revision_requested'));
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ── 6) 상태 전이 이력 테이블 ──
CREATE TABLE IF NOT EXISTS state_transitions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id text NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  transitioned_by uuid,
  transitioned_at timestamptz DEFAULT now(),
  is_forced boolean DEFAULT false,
  force_reason text,
  condition_snapshot jsonb
);

ALTER TABLE state_transitions_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'state_transitions_log' AND cmd = 'SELECT'
  ) THEN
    CREATE POLICY "authenticated_read_transitions_log"
      ON state_transitions_log FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'state_transitions_log' AND cmd = 'INSERT'
  ) THEN
    CREATE POLICY "authenticated_write_transitions_log"
      ON state_transitions_log FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transitions_log_content_id
  ON state_transitions_log(content_id);
