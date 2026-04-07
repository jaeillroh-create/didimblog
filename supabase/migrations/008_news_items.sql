-- 008_news_items.sql
-- 뉴스 자동 수집 + 대시보드 피드를 위한 news_items 테이블

CREATE TABLE IF NOT EXISTS public.news_items (
  id serial PRIMARY KEY,
  title text NOT NULL,
  description text,
  link text NOT NULL,
  pub_date timestamptz,
  search_keyword text NOT NULL,
  source text DEFAULT 'naver',
  is_used boolean DEFAULT false,
  used_content_id text REFERENCES contents(id),
  ai_summary text,
  blog_angle text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_items_keyword ON news_items(search_keyword);
CREATE INDEX IF NOT EXISTS idx_news_items_created ON news_items(created_at DESC);

ALTER TABLE news_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'news_items' AND policyname = 'news_items_all'
  ) THEN
    CREATE POLICY "news_items_all" ON news_items FOR ALL USING (true);
  END IF;
END $$;
