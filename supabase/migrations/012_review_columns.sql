-- 012: 대표 검수 컬럼 추가
-- review_status: pending(미검수) / approved(승인) / revision_requested(수정요청)
-- review_memo: 수정 요청 시 메모

ALTER TABLE contents
ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'pending'
  CHECK (review_status IN ('pending', 'approved', 'revision_requested'));

ALTER TABLE contents
ADD COLUMN IF NOT EXISTS review_memo text;
