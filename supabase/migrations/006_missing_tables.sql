-- 006_missing_tables.sql
-- 코드에서 참조하지만 초기 마이그레이션(001~005)에 없던 테이블 5개를 기록한다.
-- keyword_pool, keyword_rankings, series는 이미 DB에 존재.
-- cta_templates, seo_settings는 수동 생성 완료.
-- 모두 CREATE TABLE IF NOT EXISTS로 작성하여 멱등성 보장.

-- ── keyword_pool ──
CREATE TABLE IF NOT EXISTS keyword_pool (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  keyword text NOT NULL,
  category_id text NOT NULL REFERENCES categories(id),
  sub_category_id text REFERENCES categories(id),
  priority text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
  covered_content_id text REFERENCES contents(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE keyword_pool ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'keyword_pool' AND policyname = 'keyword_pool_all'
  ) THEN
    CREATE POLICY keyword_pool_all ON keyword_pool FOR ALL USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_keyword_pool_category_id ON keyword_pool(category_id);
CREATE INDEX IF NOT EXISTS idx_keyword_pool_priority ON keyword_pool(priority);

-- ── keyword_rankings ──
CREATE TABLE IF NOT EXISTS keyword_rankings (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  keyword_id text NOT NULL REFERENCES keyword_pool(id) ON DELETE CASCADE,
  month text NOT NULL,
  rank int,
  created_at timestamptz DEFAULT now(),
  UNIQUE(keyword_id, month)
);

ALTER TABLE keyword_rankings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'keyword_rankings' AND policyname = 'keyword_rankings_all'
  ) THEN
    CREATE POLICY keyword_rankings_all ON keyword_rankings FOR ALL USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_keyword_rankings_keyword_id ON keyword_rankings(keyword_id);

-- ── series ──
CREATE TABLE IF NOT EXISTS series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  total_planned int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE series ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'series' AND policyname = 'series_all'
  ) THEN
    CREATE POLICY series_all ON series FOR ALL USING (true);
  END IF;
END $$;

-- ── cta_templates ──
CREATE TABLE IF NOT EXISTS cta_templates (
  key text PRIMARY KEY,
  category_name text NOT NULL,
  text text,
  note text,
  conversion_method text NOT NULL DEFAULT '',
  email_subject_tag text
);

ALTER TABLE cta_templates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cta_templates' AND policyname = 'cta_templates_all'
  ) THEN
    CREATE POLICY cta_templates_all ON cta_templates FOR ALL USING (true);
  END IF;
END $$;

-- ── seo_settings ──
CREATE TABLE IF NOT EXISTS seo_settings (
  item_id int PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true
);

ALTER TABLE seo_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'seo_settings' AND policyname = 'seo_settings_all'
  ) THEN
    CREATE POLICY seo_settings_all ON seo_settings FOR ALL USING (true);
  END IF;
END $$;
