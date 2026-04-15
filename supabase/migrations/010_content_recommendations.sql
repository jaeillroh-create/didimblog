-- ============================================
-- 010_content_recommendations.sql
-- 대시보드 "이번 주 추천" 피드백 영구 저장 + 부적합 이력 기반 필터링
--
-- - id: UUID PK
-- - recommended_topic: 추천된 주제 (글 제목 수준)
-- - recommended_category: "변리사의 현장 수첩" / "IP 라운지" / "디딤 다이어리"
-- - source: 'keyword_pool' | 'news_api' | 'schedule' | 'manual'
-- - source_detail: jsonb — 뉴스 URL, 원본 키워드 ID, 스케줄 week 번호 등
-- - status: 'pending' | 'accepted' | 'rejected' | 'generated'
-- - rejection_reason: 사용자가 입력한 부적합 사유 (자유 입력 또는 preset)
-- - rejection_keywords: 이 추천에서 추출한 "피해야 할" 키워드 배열
--   (다음 추천 시 해당 키워드가 포함된 주제를 필터링 또는 순위 하향)
-- - acted_at: accepted / rejected 시점
-- ============================================

CREATE TABLE IF NOT EXISTS public.content_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommended_topic text NOT NULL,
  recommended_category text,
  recommended_subcategory text,
  recommended_keywords text[],
  source text NOT NULL CHECK (source IN ('keyword_pool', 'news_api', 'schedule', 'manual')),
  source_detail jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'generated')),
  rejection_reason text,
  rejection_keywords text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  acted_at timestamptz,
  created_by uuid REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_content_recs_status
  ON public.content_recommendations(status);

CREATE INDEX IF NOT EXISTS idx_content_recs_created
  ON public.content_recommendations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_recs_rejected_recent
  ON public.content_recommendations(created_at DESC)
  WHERE status = 'rejected';

-- rejection_keywords GIN 인덱스 — 블랙리스트 빠른 조회
CREATE INDEX IF NOT EXISTS idx_content_recs_rejection_keywords
  ON public.content_recommendations
  USING gin(rejection_keywords);

-- RLS: 인증 사용자 전체 접근 (대시보드 모든 팀원이 사용)
ALTER TABLE public.content_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_recommendations_all"
  ON public.content_recommendations
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
