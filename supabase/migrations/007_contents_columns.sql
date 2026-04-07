-- 007_contents_columns.sql
-- contents 테이블에 추가된 컬럼 15개를 기록한다.
-- 전부 이미 DB에 존재하므로 IF NOT EXISTS(ADD COLUMN IF NOT EXISTS) 사용.

ALTER TABLE contents ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS seo_keywords TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS seo_score INTEGER;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS image_alt_texts TEXT[];
ALTER TABLE contents ADD COLUMN IF NOT EXISTS health_status TEXT DEFAULT 'HEALTHY';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS health_checked_at TIMESTAMPTZ;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES series(id);
ALTER TABLE contents ADD COLUMN IF NOT EXISTS series_order INTEGER;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS ai_generation_id INTEGER REFERENCES ai_generations(id);
ALTER TABLE contents ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT FALSE;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS ai_edited_by UUID;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS ai_edit_ratio NUMERIC;

CREATE INDEX IF NOT EXISTS idx_contents_is_deleted ON contents(is_deleted);
CREATE INDEX IF NOT EXISTS idx_contents_health_status ON contents(health_status);
CREATE INDEX IF NOT EXISTS idx_contents_series_id ON contents(series_id);
