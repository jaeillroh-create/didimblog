-- 사이트 설정 테이블 (블로그 시작일 등 키-값 저장)
CREATE TABLE IF NOT EXISTS public.site_settings (
  id serial PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- RLS 활성화
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- 읽기: 모든 인증된 사용자
CREATE POLICY "site_settings_select" ON public.site_settings
  FOR SELECT TO authenticated USING (true);

-- 쓰기: admin만
CREATE POLICY "site_settings_insert" ON public.site_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "site_settings_update" ON public.site_settings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 기본 블로그 시작일 삽입
INSERT INTO public.site_settings (key, value)
VALUES ('blog_start_date', '2026-01-06')
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
