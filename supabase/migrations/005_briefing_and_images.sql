-- 1. ai_generations 테이블에 브리핑 소스 컬럼 추가
ALTER TABLE ai_generations
  ADD COLUMN IF NOT EXISTS briefing_source TEXT CHECK (briefing_source IN ('topic', 'file', 'manual')),
  ADD COLUMN IF NOT EXISTS source_file_name TEXT,
  ADD COLUMN IF NOT EXISTS source_file_type TEXT;

-- 2. generated_images 테이블 (이미지 생성 이력)
CREATE TABLE IF NOT EXISTS generated_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id INTEGER REFERENCES ai_generations(id) ON DELETE CASCADE,
  marker_index INTEGER NOT NULL,
  description TEXT NOT NULL,
  prompt_used TEXT,
  image_provider TEXT NOT NULL DEFAULT 'openai',
  image_model TEXT NOT NULL DEFAULT 'dall-e-3',
  storage_path TEXT,
  public_url TEXT,
  alt_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
  error_message TEXT,
  generation_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_generated_images_generation_id ON generated_images(generation_id);

-- RLS
ALTER TABLE generated_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage generated_images"
  ON generated_images FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
