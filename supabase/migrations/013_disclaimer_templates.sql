-- 013: 면책조항(Disclaimer) 템플릿 테이블 + 시드 데이터
-- Level A/B/C/none 4단계 면책조항 자동 삽입 시스템

CREATE TABLE IF NOT EXISTS disclaimer_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL CHECK (level IN ('A', 'B', 'C', 'none')),
  name text NOT NULL,
  content text NOT NULL,
  applicable_categories text[],
  applicable_keywords text[],
  position text DEFAULT 'before_cta' CHECK (position IN ('before_cta', 'after_cta', 'top')),
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE disclaimer_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "disclaimer_templates_authenticated_read"
  ON disclaimer_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "disclaimer_templates_authenticated_write"
  ON disclaimer_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 시드 데이터

-- Level A: 구체 수치/절세 사례 포함 글 (강한 수위)
INSERT INTO disclaimer_templates (level, name, content, applicable_categories, applicable_keywords, position, is_default)
VALUES (
  'A',
  '구체 수치/절세 사례 — 강한 면책',
  '※ 본 글에 제시된 사례와 수치는 특정 조건의 개별 기업 상황을 기반으로 하며, 모든 기업에 동일하게 적용되지 않습니다. 직무발명보상 제도의 세제 혜택은 기업의 매출, 비용 구조, 연구개발 실태, 직무발명 규정의 정비 수준 등에 따라 달라집니다.

실제 세무 신고는 귀사의 세무사와 협의하여 진행하시기 바라며, 본 글은 제도 이해를 위한 일반적인 정보 제공 목적입니다. 구체적인 절세 설계는 개별 상담을 통해 확인 가능합니다.',
  ARRAY['CAT-A', 'CAT-A-01'],
  ARRAY['절세', '세액공제', '법인세', '직무발명보상금', '보상금', '절감', '환급'],
  'before_cta',
  true
);

-- Level B: 제도/법률 해설 글 (기본 수위)
INSERT INTO disclaimer_templates (level, name, content, applicable_categories, applicable_keywords, position, is_default)
VALUES (
  'B',
  '제도/법률 해설 — 기본 면책',
  '※ 본 내용은 작성 시점의 법령 및 제도를 기준으로 합니다. 법령 개정이나 제도 운영 변경에 따라 내용이 달라질 수 있으며, 개별 기업의 상황에 따라 적용 결과가 다를 수 있습니다. 실제 적용 전 전문가 상담을 권장합니다.',
  ARRAY['CAT-A', 'CAT-A-02', 'CAT-A-03', 'CAT-B', 'CAT-B-01', 'CAT-B-02'],
  ARRAY['인증', '벤처', '연구소', '특허법', '법률', '제도', '규정', '시행령'],
  'before_cta',
  true
);

-- Level C: 뉴스 분석/트렌드 글 (약한 수위)
INSERT INTO disclaimer_templates (level, name, content, applicable_categories, applicable_keywords, position, is_default)
VALUES (
  'C',
  '뉴스/트렌드 — 약한 면책',
  '※ 본 글은 공개 보도자료 및 공식 통계를 참고하여 작성되었으며, 개별 해석과 전망은 필자의 견해입니다.',
  ARRAY['CAT-B-03'],
  ARRAY['뉴스', '보도', '기사', '트렌드', '전망', '분석'],
  'before_cta',
  true
);

-- Level None: 디딤 다이어리 (삽입 안 함)
INSERT INTO disclaimer_templates (level, name, content, applicable_categories, applicable_keywords, position, is_default)
VALUES (
  'none',
  '다이어리 — 면책 없음',
  '',
  ARRAY['CAT-C', 'CAT-C-01', 'CAT-C-02', 'CAT-C-03'],
  ARRAY[]::text[],
  'before_cta',
  true
);
