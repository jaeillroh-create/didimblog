# 글별 성과 입력·키워드 순위 원문

> 원본 그대로. 포팅: scripts/dashboard_kpi.py (metric-row, snapshot), scripts/leads_kpi.py (keyword-rank).

## 목차
1. 명세 — UPGRADE_SPEC §2.2 금요일 성과 입력, §4.2 post_metrics, §4.5 keyword_rankings, Sprint 5 / 주간 루틴(금)
2. 성과 입력 패널 — performance-input.tsx
3. 저장 — keywords.ts saveContentPerformance, saveKeywordRanking, getHighKeywords, getKeywordRankings
4. S4→S5 성과 스냅샷 — contents.ts updateContentStatusWithMeta, status-transition-panel.tsx
5. 키워드 순위 추적 화면 — keyword-ranking-tracker.tsx
6. 테이블 — 006 keyword_rankings

## 1. 명세
docs/UPGRADE_SPEC.md:82-88, 176-193, 251-262, 694-699

```markdown
### 2.2 금요일 성과 입력 플로우

```
[대시보드] → [이번 주 발행 글 클릭]
    ↓
[글 상세 > 성과 탭] — 조회수, 유입 키워드 TOP 3, 댓글 수 입력 → 저장
```
```

```sql
### 4.2 신규 테이블: post_metrics (글별 성과)

```sql
CREATE TABLE post_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  recorded_date DATE NOT NULL,
  views INTEGER DEFAULT 0,
  top_keywords TEXT[] DEFAULT '{}',  -- 유입 키워드 TOP 3
  comments INTEGER DEFAULT 0,
  neighbor_adds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, recorded_date)
);

CREATE INDEX idx_post_metrics_post_id ON post_metrics(post_id);
CREATE INDEX idx_post_metrics_date ON post_metrics(recorded_date);
```
```

```sql
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
```

```markdown
### Sprint 5: 성과 추적
- [ ] 글별 성과 입력 탭 (조회수, 유입 키워드 TOP 3, 댓글 수, 이웃 추가 수)
- [ ] 상담 로그 페이지 (CRUD)
- [ ] 키워드 순위 추적 (타깃 키워드 등록 + 월별 순위 입력)
- [ ] 전환 기여 분석 (상담 로그의 경유 글 집계 → 글별 전환율)
- [ ] DB 마이그레이션: post_metrics + consultations + keyword_rankings
```

주간 운영 루틴 — 금요일 주간 통계 (docs/08_주간_루틴.md:52-56)

```text

  금         콘텐츠 담당  주간 통계 체크: ① 이번 주 글 조회수 15분          주간 통계
                          ② 유입 키워드 TOP 5 ③ 이웃 추가 수                메모
                          ④ 댓글 수 → 이상치 있으면 원인 파악               
                          메모                                              
```

## 2. src/components/contents/performance-input.tsx 전체

```tsx
"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveContentPerformance } from "@/actions/keywords";
import type { Content } from "@/lib/types/database";
import { BarChart3, Save } from "lucide-react";
import { toast } from "sonner";

interface PerformanceInputProps {
  content: Content;
}

export function PerformanceInput({ content }: PerformanceInputProps) {
  const [isPending, startTransition] = useTransition();
  const [views1w, setViews1w] = useState(
    content.views_1w?.toString() ?? ""
  );
  const [views1m, setViews1m] = useState(
    content.views_1m?.toString() ?? ""
  );
  const [avgDuration, setAvgDuration] = useState(
    content.avg_duration_sec?.toString() ?? ""
  );
  const [searchRank, setSearchRank] = useState(
    content.search_rank?.toString() ?? ""
  );
  const [ctaClicks, setCtaClicks] = useState(
    content.cta_clicks?.toString() ?? ""
  );

  function handleSave() {
    startTransition(async () => {
      const data = {
        views_1w: views1w ? parseInt(views1w) : null,
        views_1m: views1m ? parseInt(views1m) : null,
        avg_duration_sec: avgDuration ? parseInt(avgDuration) : null,
        search_rank: searchRank ? parseInt(searchRank) : null,
        cta_clicks: ctaClicks ? parseInt(ctaClicks) : null,
      };

      const result = await saveContentPerformance(content.id, data);
      if (result.success) {
        toast.success("성과 데이터가 저장되었습니다.");
      } else {
        toast.error(result.error ?? "저장에 실패했습니다.");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          성과 데이터
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="views_1w" className="text-xs">
              주간 조회수
            </Label>
            <Input
              id="views_1w"
              type="number"
              value={views1w}
              onChange={(e) => setViews1w(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label htmlFor="views_1m" className="text-xs">
              월간 조회수
            </Label>
            <Input
              id="views_1m"
              type="number"
              value={views1m}
              onChange={(e) => setViews1m(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="avg_duration" className="text-xs">
              평균 체류시간 (초)
            </Label>
            <Input
              id="avg_duration"
              type="number"
              value={avgDuration}
              onChange={(e) => setAvgDuration(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label htmlFor="search_rank" className="text-xs">
              검색 순위
            </Label>
            <Input
              id="search_rank"
              type="number"
              value={searchRank}
              onChange={(e) => setSearchRank(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="cta_clicks" className="text-xs">
            CTA 클릭수
          </Label>
          <Input
            id="cta_clicks"
            type="number"
            value={ctaClicks}
            onChange={(e) => setCtaClicks(e.target.value)}
            placeholder="0"
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={isPending}
          size="sm"
          className="w-full"
        >
          <Save className="h-4 w-4 mr-1" />
          {isPending ? "저장 중..." : "성과 저장"}
        </Button>
      </CardContent>
    </Card>
  );
}
```

## 3. src/actions/keywords.ts:25-145

```ts
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

// ── 키워드 순위 조회 ──

export async function getKeywordRankings(
  keywordIds: string[]
): Promise<KeywordRanking[]> {
  if (keywordIds.length === 0) return [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("keyword_rankings")
      .select("*")
      .in("keyword_id", keywordIds)
      .order("month", { ascending: false });

    if (error) throw error;
    return (data ?? []) as KeywordRanking[];
  } catch (err) {
    console.error("[getKeywordRankings] 에러:", err);
    return [];
  }
}

// ── 키워드 순위 저장/업데이트 ──

export async function saveKeywordRanking(
  keywordId: string,
  month: string,
  rank: number | null
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();

    const { error } = await supabase.from("keyword_rankings").upsert(
      {
        keyword_id: keywordId,
        month,
        rank,
      },
      { onConflict: "keyword_id,month" }
    );

    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    console.error("[saveKeywordRanking] 에러:", err);
    return { success: false, error: "순위 저장에 실패했습니다." };
  }
}

// ── 성과 데이터 저장 ──

export async function saveContentPerformance(
  contentId: string,
  data: {
    views_1w?: number | null;
    views_1m?: number | null;
    avg_duration_sec?: number | null;
    search_rank?: number | null;
    cta_clicks?: number | null;
  }
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();

    // 1) contents 테이블 업데이트 (기존 동작 유지)
    const { error } = await supabase
      .from("contents")
      .update(data)
      .eq("id", contentId);

    if (error) throw error;

    // 2) content_metrics 테이블에도 동일 데이터 upsert
    //    같은 content_id + 같은 월이면 UPDATE, 아니면 INSERT
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const { error: metricsError } = await supabase
      .from("content_metrics")
      .upsert(
        {
          content_id: contentId,
          measured_at: today,
          views: data.views_1m ?? 0,
          avg_duration_sec: data.avg_duration_sec ?? null,
          search_rank: data.search_rank ?? null,
          estimated_cta_clicks: data.cta_clicks ?? 0,
          source: "manual",
        },
        { onConflict: "content_id,measured_at" }
      );

    if (metricsError) {
      // content_metrics 저장 실패는 경고만 (contents 저장은 이미 성공)
      console.warn("[saveContentPerformance] content_metrics upsert 실패:", metricsError);
    }

    return { success: true, error: null };
  } catch (err) {
    console.error("[saveContentPerformance] 에러:", err);
    return { success: false, error: "성과 데이터 저장에 실패했습니다." };
  }
}
```

## 4. S4→S5 성과 스냅샷 — src/actions/contents.ts:395-409, 456-483 / status-transition-panel.tsx:177-201, 386-408

```ts
export interface UpdateContentStatusWithMetaInput {
  contentId: string;
  newStatus: ContentStatus;
  naverBlogUrl?: string;
  publishedAtOverride?: string;
  performanceSnapshot?: {
    views_1w?: number;
    comments?: number;
    neighbor_added?: number;
    consultation_yn?: boolean;
  };
  transitionReason?: string;
  isReversal?: boolean;
  force?: boolean; // admin 강제 전환 플래그 (서버측 별도 검증 없음 — UI 에서 이미 판단)
}
```

```ts
    // 성과 스냅샷 — contents 테이블의 기존 컬럼(views_1w, cta_clicks)에 매핑
    if (input.performanceSnapshot) {
      if (typeof input.performanceSnapshot.views_1w === "number") {
        updateData.views_1w = input.performanceSnapshot.views_1w;
      }
      if (typeof input.performanceSnapshot.comments === "number") {
        updateData.cta_clicks = input.performanceSnapshot.comments;
      }
    }

    // notes 에 메타 정보 append (마이그레이션 없이 작동)
    const existingNotes = (existing?.notes as string | null) ?? "";
    const metaLines: string[] = [];
    if (input.naverBlogUrl) {
      metaLines.push(`[네이버 URL] ${input.naverBlogUrl}`);
    }
    if (input.performanceSnapshot) {
      const s = input.performanceSnapshot;
      const parts: string[] = [];
      if (typeof s.views_1w === "number") parts.push(`조회수 ${s.views_1w}`);
      if (typeof s.comments === "number") parts.push(`댓글 ${s.comments}`);
      if (typeof s.neighbor_added === "number") parts.push(`이웃 +${s.neighbor_added}`);
      if (typeof s.consultation_yn === "boolean")
        parts.push(`상담 ${s.consultation_yn ? "유입" : "없음"}`);
      if (parts.length > 0) {
        metaLines.push(`[성과 1주차] ${parts.join(" · ")}`);
      }
    }
```

```ts
  if (status === "S4") {
    // S4 → S5: 발행 후 7일 경과
    if (!content.published_at) {
      return [
        {
          id: "published-at",
          label: "발행일시 필요",
          passed: false,
          detail: "발행일시가 기록되지 않음",
          required: true,
        },
      ];
    }
    const publishedAt = new Date(content.published_at).getTime();
    const daysSince = Math.floor((Date.now() - publishedAt) / (24 * 60 * 60 * 1000));
    return [
      {
        id: "d-plus-7",
        label: "발행 후 7일 경과",
        passed: daysSince >= 7,
        detail: `D+${daysSince}일`,
        required: true,
      },
    ];
  }
```

```ts
  function handleSubmitPerformance() {
    if (!forwardTransition) return;
    setPerformanceModalOpen(false);
    const snapshot = {
      views_1w: views1w ? parseInt(views1w, 10) : undefined,
      comments: comments ? parseInt(comments, 10) : undefined,
      neighbor_added: neighborAdded ? parseInt(neighborAdded, 10) : undefined,
      consultation_yn: consultation === "yes",
    };
    startTransition(async () => {
      const ok = await runStatusUpdate({
        contentId: content.id,
        newStatus: "S5",
        performanceSnapshot: snapshot,
      });
      if (ok) {
        setViews1w("");
        setComments("");
        setNeighborAdded("");
        setConsultation("no");
      }
    });
  }
```

## 5. src/components/analytics/keyword-ranking-tracker.tsx 전체

```tsx
"use client";

import { useState, useMemo, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { saveKeywordRanking } from "@/actions/keywords";
import type { KeywordPool, KeywordRanking } from "@/lib/types/database";
import { Search, TrendingUp, TrendingDown, Minus, Save } from "lucide-react";
import { toast } from "sonner";

interface KeywordRankingTrackerProps {
  keywords: KeywordPool[];
  rankings: KeywordRanking[];
}

export function KeywordRankingTracker({
  keywords,
  rankings,
}: KeywordRankingTrackerProps) {
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // 현재 월 (1일 기준)
  const { currentMonth, lastMonthStr } = useMemo(() => {
    const now = new Date();
    const cm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lms = `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, "0")}-01`;
    return { currentMonth: cm, lastMonthStr: lms };
  }, []);

  function getRank(keywordId: string, month: string): number | null {
    const r = rankings.find(
      (r) => r.keyword_id === keywordId && r.month === month
    );
    return r?.rank ?? null;
  }

  function handleSaveRank(keywordId: string) {
    startTransition(async () => {
      const rank = editValue ? parseInt(editValue) : null;
      const result = await saveKeywordRanking(keywordId, currentMonth, rank);
      if (result.success) {
        toast.success("순위가 저장되었습니다.");
        setEditingId(null);
      } else {
        toast.error(result.error ?? "저장에 실패했습니다.");
      }
    });
  }

  if (keywords.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            키워드 순위 추적
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<Search className="h-8 w-8 text-muted-foreground" />}
            title="추적할 키워드가 없습니다"
            description="추적할 키워드를 추가하세요. 매월 네이버에서 검색 순위를 확인하고 여기에 기록하면 추이를 볼 수 있습니다."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card suppressHydrationWarning>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4" />
          키워드 순위 추적
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium">키워드</th>
                <th className="pb-2 font-medium text-center w-24">이번 달</th>
                <th className="pb-2 font-medium text-center w-24">지난 달</th>
                <th className="pb-2 font-medium text-center w-20">변동</th>
                <th className="pb-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {keywords.map((kw) => {
                const currentRank = getRank(kw.id, currentMonth);
                const lastRank = getRank(kw.id, lastMonthStr);
                const isEditing = editingId === kw.id;

                let changeElement = (
                  <span className="text-muted-foreground">
                    <Minus className="h-3 w-3 inline" />
                  </span>
                );

                if (currentRank !== null && lastRank !== null) {
                  const diff = lastRank - currentRank; // positive = improvement
                  if (diff > 0) {
                    changeElement = (
                      <span className="text-green-600 font-medium inline-flex items-center gap-0.5">
                        <TrendingUp className="h-3 w-3" />
                        {diff}
                      </span>
                    );
                  } else if (diff < 0) {
                    changeElement = (
                      <span className="text-red-500 font-medium inline-flex items-center gap-0.5">
                        <TrendingDown className="h-3 w-3" />
                        {Math.abs(diff)}
                      </span>
                    );
                  }
                } else if (currentRank !== null && lastRank === null) {
                  changeElement = (
                    <span className="text-blue-600 text-xs font-medium">NEW</span>
                  );
                }

                return (
                  <tr key={kw.id} className="border-b last:border-0">
                    <td className="py-2.5">
                      <span className="font-medium">{kw.keyword}</span>
                    </td>
                    <td className="py-2.5 text-center">
                      {isEditing ? (
                        <Input
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="h-7 w-16 text-center mx-auto"
                          placeholder="-"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveRank(kw.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setEditingId(kw.id);
                            setEditValue(currentRank?.toString() ?? "");
                          }}
                          className="hover:bg-muted/50 rounded px-2 py-0.5 transition-colors"
                        >
                          {currentRank !== null ? `${currentRank}위` : "-"}
                        </button>
                      )}
                    </td>
                    <td className="py-2.5 text-center text-muted-foreground">
                      {lastRank !== null ? `${lastRank}위` : "-"}
                    </td>
                    <td className="py-2.5 text-center">{changeElement}</td>
                    <td className="py-2.5 text-center">
                      {isEditing && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSaveRank(kw.id)}
                          disabled={isPending}
                          className="h-7 w-7 p-0"
                        >
                          <Save className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
```

## 6. supabase/migrations/006_missing_tables.sql:30-49

```sql
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
```
