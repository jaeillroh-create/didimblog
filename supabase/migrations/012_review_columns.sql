-- 012: 대표 검수 컬럼 추가
-- review_status: pending(미검수) / approved(승인) / revision_requested(수정요청)
-- review_memo: 수정 요청 시 메모
--
-- ⚠️ 이 마이그레이션이 적용되지 않으면 검수 승인 시 42703 에러 발생:
--    "column review_status of relation contents does not exist"
--    Supabase SQL Editor 에서 이 파일 전체를 수동 실행하세요.

-- review_status (CHECK 제약 포함)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contents' AND column_name = 'review_status'
  ) THEN
    ALTER TABLE contents ADD COLUMN review_status text DEFAULT 'pending';
    ALTER TABLE contents ADD CONSTRAINT contents_review_status_check
      CHECK (review_status IN ('pending', 'approved', 'revision_requested'));
  END IF;
END $$;

-- review_memo
ALTER TABLE contents ADD COLUMN IF NOT EXISTS review_memo text;
