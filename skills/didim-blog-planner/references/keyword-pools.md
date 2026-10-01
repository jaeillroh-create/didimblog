# 키워드 풀·다이어리 주제 풀·keyword_pool 스키마 (verbatim)

## 목차
1. 2차 분류별 키워드 풀 + 다이어리 주제 풀 (sub-category-pool.ts 전체)
2. keyword_pool 테이블 (실제 마이그레이션)
3. keyword_pool 기획서 스키마·초기 시드 (UPGRADE_SPEC §4.4)
4. keyword_pool 가중치 (요약표 — 원문은 filters-and-rotation.md §2)
5. 뉴스 자동 수집 고정 키워드 (news-search.ts)

## 1. sub-category-pool.ts 전체

원문: `src/lib/constants/sub-category-pool.ts:1-223`

```typescript
/**
 * 2차 카테고리별 추천 키워드 풀 + 다이어리 주제 풀.
 *
 * 네이버 블로그 카테고리 구조:
 *   변리사의 현장 수첩: CAT-A-01(절세), CAT-A-02(인증), CAT-A-03(연구소), CAT-A-04(출원)
 *   IP 라운지: CAT-B-01(전략노트), CAT-B-02(AI와IP), CAT-B-03(뉴스)
 *   디딤 다이어리: CAT-C-01(후기), CAT-C-02(일상), CAT-C-03(대표생각)
 *
 * 추천 엔진이 2차 카테고리를 로테이션하면서 키워드를 샘플링한다.
 */

export interface SubCategoryMeta {
  id: string;
  name: string;
  parentId: "CAT-A" | "CAT-B" | "CAT-C";
  keywords: string[];
  /** 뉴스 검색 시 사용할 키워드 (IP 라운지 전용) */
  newsKeywords?: string[];
  /** true: 키워드 풀 대신 topic pool 에서 샘플링 (다이어리) */
  useTopicPool?: boolean;
}

export const SUB_CATEGORY_POOL: SubCategoryMeta[] = [
  // 변리사의 현장 수첩
  {
    id: "CAT-A-01",
    name: "절세 시뮬레이션",
    parentId: "CAT-A",
    keywords: [
      "직무발명보상금",
      "법인세 절세",
      "연구인력개발비 세액공제",
      "대표이사 직무발명보상금",
      "중소기업 세액공제",
      "R&D 세액공제",
      "조세특례 절세",
    ],
  },
  {
    id: "CAT-A-02",
    name: "인증 가이드",
    parentId: "CAT-A",
    keywords: [
      "벤처기업인증",
      "이노비즈인증",
      "기업부설연구소 설립",
      "연구전담부서",
      "메인비즈인증",
      "이노비즈 조건",
      "벤처인증 혁신성장",
    ],
  },
  {
    id: "CAT-A-03",
    name: "연구소 운영 실무",
    parentId: "CAT-A",
    keywords: [
      "연구활동조사표",
      "연구과제관리",
      "연구노트 작성",
      "연구개발활동 기록",
      "연구소 사후관리",
      "기업부설연구소 세무조사",
      "R&D 환수",
    ],
  },
  {
    id: "CAT-A-04",
    name: "특허·상표 출원 실무",
    parentId: "CAT-A",
    keywords: [
      "특허출원 절차",
      "상표등록 방법",
      "디자인출원",
      "해외특허출원",
      "PCT 출원",
      "우선심사 청구",
      "특허 명세서",
    ],
  },
  // IP 라운지
  {
    id: "CAT-B-01",
    name: "특허 전략 노트",
    parentId: "CAT-B",
    keywords: [
      "특허 포트폴리오",
      "IP 전략",
      "특허 분석",
      "기술 가치평가",
      "특허맵",
      "스타트업 특허 전략",
      "벤처인증 특허",
    ],
    newsKeywords: ["특허 포트폴리오", "IP 전략", "특허 분쟁"],
  },
  {
    id: "CAT-B-02",
    name: "AI와 IP",
    parentId: "CAT-B",
    keywords: [
      "AI 특허",
      "AI 저작권",
      "AI 기본법",
      "생성형 AI 특허",
      "AI 발명자",
      "ChatGPT 특허",
      "AI 상표등록",
    ],
    newsKeywords: ["AI 특허", "AI 저작권", "AI 기본법", "생성형 AI"],
  },
  {
    id: "CAT-B-03",
    name: "IP 뉴스 한 입",
    parentId: "CAT-B",
    keywords: [
      "직무발명 소송",
      "특허 분쟁",
      "IP 정책 변화",
      "지식재산 동향",
      "특허법 개정",
      "상표 분쟁",
    ],
    newsKeywords: ["직무발명 판례", "특허법 개정", "지식재산 정책"],
  },
  // 디딤 다이어리 — 키워드 풀 대신 주제 풀
  {
    id: "CAT-C-01",
    name: "컨설팅 후기",
    parentId: "CAT-C",
    keywords: [],
    useTopicPool: true,
  },
  {
    id: "CAT-C-02",
    name: "디딤 일상",
    parentId: "CAT-C",
    keywords: [],
    useTopicPool: true,
  },
  {
    id: "CAT-C-03",
    name: "대표의 생각",
    parentId: "CAT-C",
    keywords: [],
    useTopicPool: true,
  },
];

/**
 * 디딤 다이어리 주제 풀 — 키워드 기반이 아닌 전체 주제 단위로 샘플링.
 */
export const DIARY_TOPIC_POOL: Array<{
  subCategoryId: "CAT-C-01" | "CAT-C-02" | "CAT-C-03";
  title: string;
  keywords: string[];
}> = [
  // CAT-C-01: 컨설팅 후기
  {
    subCategoryId: "CAT-C-01",
    title: "이번 달 벤처인증 N건 완료 — 각 회사 다른 전략",
    keywords: ["벤처인증 컨설팅"],
  },
  {
    subCategoryId: "CAT-C-01",
    title: "연구소 설립 컨설팅 후기 — 2명 직원으로 인증받은 회사",
    keywords: ["연구소 설립 컨설팅"],
  },
  {
    subCategoryId: "CAT-C-01",
    title: "직무발명 절세 컨설팅 사례 — 법인세 절감 실화",
    keywords: ["절세 컨설팅 사례"],
  },
  {
    subCategoryId: "CAT-C-01",
    title: "이번 분기 가장 기억에 남는 컨설팅 현장",
    keywords: ["컨설팅 후기"],
  },
  // CAT-C-02: 디딤 일상
  {
    subCategoryId: "CAT-C-02",
    title: "변리사가 서울대 AI 과정을 듣는 이유",
    keywords: ["변리사 AI"],
  },
  {
    subCategoryId: "CAT-C-02",
    title: "디딤 사무실 이야기 — 작은 팀이 만드는 변화",
    keywords: ["디딤 일상"],
  },
  {
    subCategoryId: "CAT-C-02",
    title: "변리사의 하루 — 오전 상담부터 저녁 세미나까지",
    keywords: ["변리사 일상"],
  },
  // CAT-C-03: 대표의 생각
  {
    subCategoryId: "CAT-C-03",
    title: "KAIST 석사 → 기업 CIPO → 변리사, 디딤을 만든 이유",
    keywords: ["특허그룹디딤"],
  },
  {
    subCategoryId: "CAT-C-03",
    title: "AI 시대 변리사의 역할이 바뀌고 있다",
    keywords: ["변리사 AI 시대"],
  },
  {
    subCategoryId: "CAT-C-03",
    title: "중소기업이 특허를 대하는 3가지 오해",
    keywords: ["중소기업 특허"],
  },
];

/** 카테고리별 2차 분류 목록 */
export function getSubCategoriesFor(
  parentId: "CAT-A" | "CAT-B" | "CAT-C"
): SubCategoryMeta[] {
  return SUB_CATEGORY_POOL.filter((s) => s.parentId === parentId);
}

/** 2차 분류 id 로 메타 조회 */
export function getSubCategoryMeta(subCategoryId: string): SubCategoryMeta | null {
  return SUB_CATEGORY_POOL.find((s) => s.id === subCategoryId) ?? null;
}
```

## 2. keyword_pool 테이블 (supabase/migrations/006_missing_tables.sql)

원문: `supabase/migrations/006_missing_tables.sql:7-28`

```sql
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
```

## 3. 기획서 스키마·초기 시드 (docs/UPGRADE_SPEC.md §4.4)

원문: `docs/UPGRADE_SPEC.md:215-249`

```markdown
### 4.4 신규 테이블: keyword_pool (키워드 커버리지)

```sql
CREATE TABLE keyword_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,  -- '변리사의 현장 수첩', 'IP 라운지', '디딤 다이어리'
  sub_category TEXT,
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
  covered_post_id UUID REFERENCES posts(id),  -- NULL이면 미커버
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 초기 시드 데이터 (매뉴얼 기반)
INSERT INTO keyword_pool (keyword, category, sub_category, priority) VALUES
  ('직무발명보상금 절세', '변리사의 현장 수첩', '절세 시뮬레이션', 'HIGH'),
  ('법인세 줄이는 방법', '변리사의 현장 수첩', '절세 시뮬레이션', 'HIGH'),
  ('대표이사 직무발명보상금', '변리사의 현장 수첩', '절세 시뮬레이션', 'HIGH'),
  ('기업부설연구소 세액공제', '변리사의 현장 수첩', '연구소 운영 실무', 'HIGH'),
  ('연구소 세무조사', '변리사의 현장 수첩', '연구소 운영 실무', 'HIGH'),
  ('R&D 세액공제 환수', '변리사의 현장 수첩', '연구소 운영 실무', 'HIGH'),
  ('벤처기업인증 혜택', '변리사의 현장 수첩', '인증 가이드', 'MEDIUM'),
  ('벤처인증 방법', '변리사의 현장 수첩', '인증 가이드', 'MEDIUM'),
  ('기업부설연구소 설립 방법', '변리사의 현장 수첩', '인증 가이드', 'MEDIUM'),
  ('미처분이익잉여금 정리', '변리사의 현장 수첩', '절세 시뮬레이션', 'MEDIUM'),
  ('직무발명보상금 vs 상여금', '변리사의 현장 수첩', '절세 시뮬레이션', 'MEDIUM'),
  ('AI 특허 출원', 'IP 라운지', 'AI와 IP', 'MEDIUM'),
  ('생성형 AI 저작권', 'IP 라운지', 'AI와 IP', 'MEDIUM'),
  ('인공지능 기본법', 'IP 라운지', 'AI와 IP', 'MEDIUM'),
  ('스타트업 특허 전략', 'IP 라운지', '특허 전략 노트', 'MEDIUM'),
  ('기술유출 방지', 'IP 라운지', '특허 전략 노트', 'LOW'),
  ('특허 가치평가', 'IP 라운지', '특허 전략 노트', 'LOW'),
  ('직무발명 소송 사례', 'IP 라운지', 'IP 뉴스 한 입', 'MEDIUM'),
  ('중국 상표 선점', 'IP 라운지', 'IP 뉴스 한 입', 'LOW');
```
```

## 4. 가중치 (원문: recommendations.ts:912-917, 239)

| 항목 | 값 | 근거 |
|---|---|---|
| 우선순위 샘플링 | roll<0.5 → HIGH→MEDIUM→LOW, roll<0.8 → MEDIUM→HIGH→LOW, 그 외 LOW→MEDIUM→HIGH (HIGH 50 / MEDIUM 30 / LOW 20) | recommendations.ts:912-917 |
| 우선순위별 조회 한도 | 미커버(covered_content_id IS NULL) 30건 | recommendations.ts:920-926 |
| 레거시 주 추천 | HIGH 미커버 → MEDIUM 미커버 → 성과 후속편 | recommendations.ts:164-265 |
| 후속편 점수 | 조회수(views_1m) × 1 + 상담건수 × 500 | recommendations.ts:239-247 |

## 5. 뉴스 자동 수집 고정 키워드

원문: `src/actions/news-search.ts:540-553`

```typescript
// ── 뉴스 자동 수집 ──

const FIXED_KEYWORDS = [
  "직무발명보상금",
  "직무발명보상 세액공제",
  "기업부설연구소",
  "연구개발비 세액공제",
  "벤처기업인증",
  "벤처기업 혜택",
  "중소기업 특허",
  "중소기업 법인세 감면",
  "지식재산 중소기업",
  "조세특례제한법 연구개발",
];
```
