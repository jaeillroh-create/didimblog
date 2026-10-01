# 시리즈·키워드 커버리지 원문

> 원본 그대로. 포팅: scripts/keyword_coverage.py.

## 목차
1. 테이블 — 006_missing_tables.sql (keyword_pool, keyword_rankings, series), UPGRADE_SPEC §4.4·§4.6
2. 시리즈 CRUD·집계 — manage.ts
3. 시리즈 화면 — series-tab.tsx
4. 키워드 커버리지 — manage.ts getKeywordCoverage, keywords.ts getKeywordPool
5. 커버리지 화면 — keyword-coverage-tab.tsx
6. '매출 가중치' — recommendations.ts (HIGH 미커버 우선, 가중 샘플링 50/30/20)

## 1. 테이블
supabase/migrations/006_missing_tables.sql:7-66

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
```

docs/UPGRADE_SPEC.md:215-273 (§4.4 keyword_pool 시드 19개, §4.5, §4.6). 레포 마이그레이션에는 이 시드 INSERT 가 없다 — 실DB 키워드 풀 내용은 확인 필요.

```sql
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

### 4.5 신규 테이블: keyword_rankings (키워드 순위 추적)

```sql
CREATE TABLE keyword_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id UUID NOT NULL REFERENCES keyword_pool(id) ON DELETE CASCADE,
  month DATE NOT NULL,  -- 매월 1일 기준
  rank INTEGER,  -- NULL이면 TOP 100 밖
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(keyword_id, month)
);
```

### 4.6 신규 테이블: series (시리즈물 관리)

```sql
CREATE TABLE series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,  -- "직무발명보상 절세 완전 가이드"
  total_planned INTEGER NOT NULL,  -- 계획 편수 (예: 5)
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
```

## 2. 시리즈 — src/actions/manage.ts:165-280

```ts
// ── 시리즈 CRUD ──

export async function getSeriesList(): Promise<{
  data: (Series & { contentCount: number; publishedCount: number })[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    const { data: seriesList, error } = await supabase
      .from("series")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!seriesList || seriesList.length === 0) {
      return { data: [], error: null };
    }

    // 각 시리즈의 콘텐츠 개수 집계
    const result = await Promise.all(
      (seriesList as Series[]).map(async (series) => {
        const { count: contentCount } = await supabase
          .from("contents")
          .select("*", { count: "exact", head: true })
          .eq("series_id", series.id)
          .eq("is_deleted", false);

        const { count: publishedCount } = await supabase
          .from("contents")
          .select("*", { count: "exact", head: true })
          .eq("series_id", series.id)
          .eq("status", "S4")
          .eq("is_deleted", false);

        return {
          ...series,
          contentCount: contentCount ?? 0,
          publishedCount: publishedCount ?? 0,
        };
      })
    );

    return { data: result, error: null };
  } catch (err) {
    console.error("[getSeriesList] 에러:", err);
    return { data: [], error: "시리즈 목록을 불러오지 못했습니다." };
  }
}

export async function createSeries(
  name: string,
  totalPlanned: number
): Promise<{ data: Series | null; error: string | null }> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("series")
      .insert({ name, total_planned: totalPlanned })
      .select()
      .single();

    if (error) throw error;
    return { data: data as Series, error: null };
  } catch (err) {
    console.error("[createSeries] 에러:", err);
    return { data: null, error: "시리즈 생성에 실패했습니다." };
  }
}

export async function deleteSeries(
  seriesId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();

    // 시리즈에 속한 콘텐츠의 series_id 해제
    await supabase
      .from("contents")
      .update({ series_id: null, series_order: null })
      .eq("series_id", seriesId);

    const { error } = await supabase
      .from("series")
      .delete()
      .eq("id", seriesId);

    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    console.error("[deleteSeries] 에러:", err);
    return { success: false, error: "시리즈 삭제에 실패했습니다." };
  }
}

export async function assignContentToSeries(
  contentId: string,
  seriesId: string | null,
  seriesOrder: number | null
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from("contents")
      .update({ series_id: seriesId, series_order: seriesOrder })
      .eq("id", contentId);

    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    console.error("[assignContentToSeries] 에러:", err);
    return { success: false, error: "시리즈 지정에 실패했습니다." };
  }
}
```

## 3. 시리즈 화면 — src/components/manage/series-tab.tsx:120-180

```tsx
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {seriesList.map((series) => {
            const progress =
              series.total_planned > 0
                ? Math.round(
                    (series.publishedCount / series.total_planned) * 100
                  )
                : 0;

            return (
              <Card key={series.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm font-medium">
                      {series.name}
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                      onClick={() => setDeleteTarget(series.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <BarChart3 className="h-3.5 w-3.5" />
                    <span>
                      발행 {series.publishedCount} / 계획{" "}
                      {series.total_planned}편
                    </span>
                    <span className="ml-auto font-medium">{progress}%</span>
                  </div>
                  {/* 프로그레스 바 */}
                  <div className="w-full h-2 rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(progress, 100)}%`,
                        background:
                          progress >= 100
                            ? "var(--success, #22c55e)"
                            : "var(--brand, #1B3A5C)",
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    전체 등록 {series.contentCount}편
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
```

## 4. 키워드 커버리지 — src/actions/manage.ts:282-355, src/actions/keywords.ts:6-42

```ts
// ── 키워드 커버리지 ──

export interface KeywordCoverageItem {
  keyword: KeywordPool;
  coveredContent: { id: string; title: string } | null;
}

export async function getKeywordCoverage(): Promise<{
  data: KeywordCoverageItem[];
  stats: { total: number; covered: number; uncovered: number };
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    const { data: keywords, error } = await supabase
      .from("keyword_pool")
      .select("*")
      .order("priority", { ascending: true })
      .order("category_id", { ascending: true });

    if (error) throw error;
    if (!keywords || keywords.length === 0) {
      return {
        data: [],
        stats: { total: 0, covered: 0, uncovered: 0 },
        error: null,
      };
    }

    // 커버된 콘텐츠 정보 가져오기
    const coveredIds = (keywords as KeywordPool[])
      .filter((k) => k.covered_content_id)
      .map((k) => k.covered_content_id!);

    const contentMap: Record<string, { id: string; title: string }> = {};
    if (coveredIds.length > 0) {
      const { data: contents } = await supabase
        .from("contents")
        .select("id, title")
        .in("id", coveredIds);

      for (const c of contents ?? []) {
        contentMap[c.id] = { id: c.id, title: c.title ?? "제목 없음" };
      }
    }

    const data: KeywordCoverageItem[] = (keywords as KeywordPool[]).map((kw) => ({
      keyword: kw,
      coveredContent: kw.covered_content_id
        ? contentMap[kw.covered_content_id] ?? null
        : null,
    }));

    const covered = data.filter((d) => d.coveredContent !== null).length;

    return {
      data,
      stats: {
        total: data.length,
        covered,
        uncovered: data.length - covered,
      },
      error: null,
    };
  } catch (err) {
    console.error("[getKeywordCoverage] 에러:", err);
    return {
      data: [],
      stats: { total: 0, covered: 0, uncovered: 0 },
      error: "키워드 커버리지 데이터를 불러올 수 없습니다.",
    };
  }
}
```

```ts
// ── 키워드 풀 조회 ──

export async function getKeywordPool(): Promise<KeywordPool[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("keyword_pool")
      .select("*")
      .order("priority", { ascending: true })
      .order("keyword", { ascending: true });

    if (error) throw error;
    return (data ?? []) as KeywordPool[];
  } catch (err) {
    console.error("[getKeywordPool] 에러:", err);
    return [];
  }
}

// ── HIGH 키워드 목록 (순위 추적용) ──

export async function getHighKeywords(): Promise<KeywordPool[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("keyword_pool")
      .select("*")
      .eq("priority", "HIGH")
      .order("keyword", { ascending: true });

    if (error) throw error;
    return (data ?? []) as KeywordPool[];
  } catch (err) {
    console.error("[getHighKeywords] 에러:", err);
    return [];
  }
}
```

## 5. 커버리지 화면 — src/components/manage/keyword-coverage-tab.tsx 전체

```tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import type { KeywordCoverageItem } from "@/actions/manage";
import { Map, CheckCircle, Circle, ExternalLink } from "lucide-react";
import Link from "next/link";

interface KeywordCoverageTabProps {
  coverage: KeywordCoverageItem[];
  stats: { total: number; covered: number; uncovered: number };
}

const CATEGORY_LABELS: Record<string, string> = {
  "CAT-A": "변리사의 현장 수첩",
  "CAT-B": "IP 라운지",
  "CAT-C": "디딤 다이어리",
};

const PRIORITY_BADGE: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  LOW: "bg-gray-100 text-gray-600",
};

export function KeywordCoverageTab({ coverage, stats }: KeywordCoverageTabProps) {
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const filtered = coverage.filter((item) => {
    if (filterCategory !== "all" && item.keyword.category_id !== filterCategory)
      return false;
    if (filterStatus === "covered" && !item.coveredContent) return false;
    if (filterStatus === "uncovered" && item.coveredContent) return false;
    return true;
  });

  // 카테고리별 그룹핑
  const grouped: Record<string, KeywordCoverageItem[]> = {};
  for (const item of filtered) {
    const cat = item.keyword.category_id;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  const coveragePercent =
    stats.total > 0 ? Math.round((stats.covered / stats.total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* 요약 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-muted-foreground">전체 키워드</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">커버됨</p>
                <p className="text-2xl font-bold text-green-600">
                  {stats.covered}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">미커버</p>
                <p className="text-2xl font-bold text-red-600">
                  {stats.uncovered}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold">{coveragePercent}%</p>
              <p className="text-xs text-muted-foreground">커버리지</p>
            </div>
          </div>
          {/* 프로그레스 바 */}
          <div className="mt-3 w-full h-3 rounded-full bg-gray-100">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${coveragePercent}%`,
                background:
                  coveragePercent >= 80
                    ? "var(--success, #22c55e)"
                    : coveragePercent >= 50
                      ? "var(--brand, #1B3A5C)"
                      : "#ef4444",
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* 필터 */}
      <div className="flex gap-2 flex-wrap">
        <select
          className="text-sm border rounded-md px-3 py-1.5"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="all">전체 카테고리</option>
          <option value="CAT-A">변리사의 현장 수첩</option>
          <option value="CAT-B">IP 라운지</option>
          <option value="CAT-C">디딤 다이어리</option>
        </select>
        <select
          className="text-sm border rounded-md px-3 py-1.5"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">전체 상태</option>
          <option value="covered">커버됨</option>
          <option value="uncovered">미커버</option>
        </select>
      </div>

      {/* 카테고리별 키워드 목록 */}
      {Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<Map className="h-8 w-8 text-muted-foreground" />}
              title="키워드가 없습니다"
              description="키워드 풀에 키워드를 등록하세요."
            />
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([catId, items]) => (
            <Card key={catId}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {CATEGORY_LABELS[catId] ?? catId}
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    ({items.filter((i) => i.coveredContent).length}/
                    {items.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.keyword.id}
                      className="flex items-center justify-between py-1.5 border-b last:border-0"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {item.coveredContent ? (
                          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                        ) : (
                          <Circle className="h-4 w-4 text-gray-300 shrink-0" />
                        )}
                        <span className="text-sm truncate">
                          {item.keyword.keyword}
                        </span>
                        <span
                          className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_BADGE[item.keyword.priority]}`}
                        >
                          {item.keyword.priority}
                        </span>
                      </div>
                      {item.coveredContent ? (
                        <Link
                          href={`/contents/${item.coveredContent.id}`}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0 ml-2"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {item.coveredContent.title.slice(0, 20)}
                          {item.coveredContent.title.length > 20 ? "..." : ""}
                        </Link>
                      ) : (
                        <span className="text-xs text-red-500 shrink-0 ml-2">
                          미커버
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
      )}
    </div>
  );
}
```

## 6. 매출 가중치 — src/actions/recommendations.ts:161-189, 899-937

```ts
  try {
    const supabase = await createClient();

    // 1. HIGH 미커버 키워드
    const { data: highUncovered } = await supabase
      .from("keyword_pool")
      .select("*")
      .eq("category_id", categoryId)
      .eq("priority", "HIGH")
      .is("covered_content_id", null)
      .limit(1);

    if (highUncovered && highUncovered.length > 0) {
      const kw = highUncovered[0] as KeywordPool;
      const target = categoryId === "CAT-A" ? 2 : 1;
      const current =
        categoryId === "CAT-A"
          ? stats.field
          : categoryId === "CAT-B"
            ? stats.lounge
            : stats.diary;
      return {
        priority: "PRIMARY",
        category: categoryName,
        categoryId,
        subCategoryId: kw.sub_category_id ?? undefined,
        title: generateTitleSuggestion(kw.keyword),
        reason: `키워드 '${kw.keyword}' 미발행 (매출 가중치 HIGH) | 이번 달 ${current}/${target}편`,
        keywords: [kw.keyword],
```

```ts

/**
 * 가중치 기반 키워드 샘플링
 * HIGH 50% / MEDIUM 30% / LOW 20% 확률로 한 카테고리에서 미커버 키워드를 선택.
 * 이번 달 이미 커버된 키워드와 블랙리스트는 제외.
 */
async function pickWeightedKeyword(
  categoryId: string,
  excludeKeywordIds: Set<string>,
  filters: RecoFilters
): Promise<KeywordPool | null> {
  const supabase = await createClient();

  // 우선순위 랜덤 선택 (HIGH 50 / MED 30 / LOW 20)
  const roll = Math.random();
  const tryOrder: Array<"HIGH" | "MEDIUM" | "LOW"> =
    roll < 0.5 ? ["HIGH", "MEDIUM", "LOW"]
    : roll < 0.8 ? ["MEDIUM", "HIGH", "LOW"]
    : ["LOW", "MEDIUM", "HIGH"];

  for (const priority of tryOrder) {
    const { data } = await supabase
      .from("keyword_pool")
      .select("*")
      .eq("category_id", categoryId)
      .eq("priority", priority)
      .is("covered_content_id", null)
      .limit(30);

    // hard 차단(블랙리스트/거부) 제외 → 그중 최근 노출(soft) 회피, 없으면 전체
    const hard = ((data ?? []) as KeywordPool[]).filter(
      (k) => !excludeKeywordIds.has(k.id) && !isHardBlocked(k.keyword, filters)
    );
    const soft = hard.filter((k) => !isSoftAvoided(k.keyword, filters));
    const pool = soft.length > 0 ? soft : hard;
    if (pool.length > 0) {
      return pool[Math.floor(Math.random() * pool.length)];
    }
  }
```
