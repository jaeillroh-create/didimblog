# 글 건강 점검 원문 (업데이트 필요·법률 키워드)

> 원본 그대로. 계산 포팅은 scripts/content_health.py.

## 목차
1. 고도화 명세 — UPGRADE_SPEC §1.3, §2.4, Sprint 6
2. 건강 점검 규칙 — src/lib/content-health.ts 전체
3. 실행·저장 — src/actions/manage.ts runHealthCheck / updateHealthStatus / getHealthCheckContents
4. 대시보드 '업데이트 필요 글' — src/actions/recommendations.ts getUpdateNeededPosts
5. 1차 카테고리 판정 — src/lib/recommendation-engine.ts getPrimaryCategoryId
6. 화면 — health-check-tab.tsx, health-banner.tsx, dashboard/update-needed.tsx
7. 컬럼 — supabase/migrations/007_contents_columns.sql

## 1. 고도화 명세
docs/UPGRADE_SPEC.md:50-58 (§1.3 글 건강 상태)

```markdown
### 1.3 글 건강 상태

```
정상(HEALTHY) → 점검필요(CHECK_NEEDED) → 수정필요(UPDATE_NEEDED) → 수정완료(UPDATED)
```

- 현장수첩: 발행 후 60일 경과 시 HEALTHY → CHECK_NEEDED 자동 전이
- 기타 카테고리: 발행 후 90일 경과 시 자동 전이
- 법률 변경 뉴스 감지 시: 관련 글 즉시 CHECK_NEEDED 전이
```

docs/UPGRADE_SPEC.md:100-110 (§2.4 글 건강 점검 플로우)

```markdown
### 2.4 글 건강 점검 플로우

```
[대시보드 "업데이트 필요 N편" 클릭]
    ↓
[글 관리 > 점검 필요 탭] — 해당 글 목록
    ↓
[글 클릭] → [상세 페이지에서 내용 검토]
    ↓
["확인 완료" 또는 "수정 필요" 버튼] → 상태 업데이트 + 점검일 기록
```
```

docs/UPGRADE_SPEC.md:701-707 (Sprint 6 글 관리)

```markdown
### Sprint 6: 글 관리
- [ ] 업데이트 알림 (현장수첩 60일, 기타 90일 자동 플래그)
- [ ] 법률 변경 감지 (뉴스 키워드 매칭 → 관련 기존 글 경고)
- [ ] 내부 링크 추천 (같은 카테고리/키워드 글 간 상호 링크 제안)
- [ ] 시리즈물 관리 (시리즈 등록, 편 번호 추적, 다음 편 발행 상태)
- [ ] 키워드 커버리지 맵 시각화 (전체 풀 vs 발행 매핑, 매출 가중치 색상)
- [ ] DB 마이그레이션: series 테이블
```

## 2. src/lib/content-health.ts:1-127

```ts
import type { Content, HealthStatus } from "@/lib/types/database";
import { getPrimaryCategoryId } from "@/lib/recommendation-engine";

// ── 헬스체크 임계값 (일수) ──

const THRESHOLDS: Record<string, { check: number; update: number }> = {
  "CAT-A": { check: 60, update: 90 },
  "CAT-B": { check: 90, update: 120 },
  "CAT-C": { check: 120, update: 180 },
};

const DEFAULT_THRESHOLD = { check: 90, update: 120 };

// ── 법률/세무 관련 키워드 (변경 감지용) ──

export const LEGAL_KEYWORDS = [
  "세액공제",
  "연구소",
  "벤처인증",
  "직무발명",
  "특허법",
  "법인세",
  "소득세",
  "R&D",
  "기업부설연구소",
  "세무조사",
  "조세특례제한법",
  "중소기업기본법",
];

// ── 헬스체크 결과 ──

export interface HealthCheckResult {
  contentId: string;
  currentStatus: HealthStatus;
  recommendedStatus: HealthStatus;
  daysSincePublish: number;
  daysSinceLastCheck: number | null;
  reasons: string[];
  hasLegalKeywords: boolean;
  legalKeywordsFound: string[];
}

// ── 단일 콘텐츠 헬스체크 ──

export function checkContentHealth(content: Content): HealthCheckResult {
  const now = new Date();
  const reasons: string[] = [];
  let recommendedStatus: HealthStatus = "HEALTHY";

  // 발행일 기준 경과일
  const publishedAt = content.published_at
    ? new Date(content.published_at)
    : null;
  const daysSincePublish = publishedAt
    ? Math.floor((now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // 마지막 체크일 기준 경과일
  const lastCheck = content.health_checked_at
    ? new Date(content.health_checked_at)
    : null;
  const daysSinceLastCheck = lastCheck
    ? Math.floor((now.getTime() - lastCheck.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // 카테고리별 임계값
  const primaryCat = getPrimaryCategoryId(content.category_id ?? "");
  const threshold = THRESHOLDS[primaryCat] ?? DEFAULT_THRESHOLD;

  // 1. 경과일 기반 상태 판정
  if (daysSincePublish >= threshold.update) {
    recommendedStatus = "UPDATE_NEEDED";
    reasons.push(`발행 후 ${daysSincePublish}일 경과 (업데이트 권장 ${threshold.update}일)`);
  } else if (daysSincePublish >= threshold.check) {
    recommendedStatus = "CHECK_NEEDED";
    reasons.push(`발행 후 ${daysSincePublish}일 경과 (점검 권장 ${threshold.check}일)`);
  }

  // 2. 법률 키워드 검사
  const bodyText = `${content.title ?? ""} ${content.body ?? ""} ${content.target_keyword ?? ""}`;
  const legalKeywordsFound = LEGAL_KEYWORDS.filter((kw) =>
    bodyText.includes(kw)
  );
  const hasLegalKeywords = legalKeywordsFound.length > 0;

  if (hasLegalKeywords && daysSincePublish >= 30) {
    if (recommendedStatus === "HEALTHY") {
      recommendedStatus = "CHECK_NEEDED";
    }
    reasons.push(`법률/세무 키워드 포함: ${legalKeywordsFound.join(", ")}`);
  }

  // 3. 이미 UPDATED면 유지
  if (content.health_status === "UPDATED") {
    recommendedStatus = "HEALTHY";
    reasons.length = 0;
    reasons.push("최근 업데이트 완료");
  }

  return {
    contentId: content.id,
    currentStatus: content.health_status,
    recommendedStatus,
    daysSincePublish,
    daysSinceLastCheck,
    reasons,
    hasLegalKeywords,
    legalKeywordsFound,
  };
}

// ── 헬스 상태 라벨 ──

export const HEALTH_STATUS_LABELS: Record<HealthStatus, string> = {
  HEALTHY: "정상",
  CHECK_NEEDED: "점검 필요",
  UPDATE_NEEDED: "업데이트 필요",
  UPDATED: "업데이트 완료",
};

export const HEALTH_STATUS_COLORS: Record<HealthStatus, string> = {
  HEALTHY: "bg-green-100 text-green-700",
  CHECK_NEEDED: "bg-yellow-100 text-yellow-700",
  UPDATE_NEEDED: "bg-red-100 text-red-700",
  UPDATED: "bg-blue-100 text-blue-700",
};
```

## 3. src/actions/manage.ts:8-122

```ts
// ── 헬스체크 전체 실행 ──

export async function runHealthCheck(): Promise<{
  results: HealthCheckResult[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    const { data: contents, error } = await supabase
      .from("contents")
      .select("*")
      .eq("status", "S4")
      .eq("is_deleted", false)
      .not("published_at", "is", null);

    if (error) throw error;
    if (!contents || contents.length === 0) {
      return { results: [], error: null };
    }

    const results = (contents as Content[]).map((c) => checkContentHealth(c));

    // 상태 업데이트가 필요한 건들 자동 반영
    for (const result of results) {
      if (result.recommendedStatus !== result.currentStatus) {
        await supabase
          .from("contents")
          .update({
            health_status: result.recommendedStatus,
            health_checked_at: new Date().toISOString(),
          })
          .eq("id", result.contentId);
      }
    }

    return { results, error: null };
  } catch (err) {
    console.error("[runHealthCheck] 에러:", err);
    return { results: [], error: "헬스체크 실행에 실패했습니다." };
  }
}

// ── 단일 콘텐츠 헬스 상태 업데이트 ──

export async function updateHealthStatus(
  contentId: string,
  status: HealthStatus
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from("contents")
      .update({
        health_status: status,
        health_checked_at: new Date().toISOString(),
      })
      .eq("id", contentId);

    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    console.error("[updateHealthStatus] 에러:", err);
    return { success: false, error: "상태 업데이트에 실패했습니다." };
  }
}

// ── 헬스체크 대상 글 목록 ──

export async function getHealthCheckContents(): Promise<{
  data: (Content & { healthCheck: HealthCheckResult })[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    const { data: contents, error } = await supabase
      .from("contents")
      .select("*")
      .eq("status", "S4")
      .eq("is_deleted", false)
      .not("published_at", "is", null)
      .order("published_at", { ascending: true });

    if (error) throw error;
    if (!contents || contents.length === 0) {
      return { data: [], error: null };
    }

    const results = (contents as Content[]).map((c) => ({
      ...c,
      healthCheck: checkContentHealth(c),
    }));

    // 문제가 있는 글을 먼저 표시
    results.sort((a, b) => {
      const statusOrder: Record<HealthStatus, number> = {
        UPDATE_NEEDED: 0,
        CHECK_NEEDED: 1,
        HEALTHY: 2,
        UPDATED: 3,
      };
      return (
        statusOrder[a.healthCheck.recommendedStatus] -
        statusOrder[b.healthCheck.recommendedStatus]
      );
    });

    return { data: results, error: null };
  } catch (err) {
    console.error("[getHealthCheckContents] 에러:", err);
    return { data: [], error: "헬스체크 데이터를 불러오지 못했습니다." };
  }
}
```

## 4. src/actions/recommendations.ts:609-671

content-health.ts 와 임계값이 다르다: 여기는 현장수첩 60일·그 외 90일 단일 기준 + health_status 플래그, 최대 5건.

```ts
// ── 업데이트 필요 글 ──

export interface UpdateNeededPost {
  id: string;
  title: string;
  publishedAt: string;
  daysSincePublish: number;
  categoryId: string;
}

export async function getUpdateNeededPosts(): Promise<UpdateNeededPost[]> {
  try {
    const supabase = await createClient();
    const now = new Date();

    // 발행 완료 글 중 60/90일 경과 글
    const { data } = await supabase
      .from("contents")
      .select("id, title, published_at, category_id, health_status")
      .eq("status", "S4")
      .eq("is_deleted", false)
      .not("published_at", "is", null)
      .order("published_at", { ascending: true });

    if (!data || data.length === 0) return [];

    const results: UpdateNeededPost[] = [];

    for (const post of data) {
      if (!post.published_at) continue;

      const publishedDate = new Date(post.published_at);
      const daysSince = Math.floor(
        (now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const primaryCat = getPrimaryCategoryId(post.category_id ?? "");

      // 현장수첩: 60일, 나머지: 90일
      const threshold = primaryCat === "CAT-A" ? 60 : 90;

      if (
        daysSince >= threshold ||
        post.health_status === "CHECK_NEEDED" ||
        post.health_status === "UPDATE_NEEDED"
      ) {
        results.push({
          id: post.id,
          title: post.title ?? "제목 없음",
          publishedAt: post.published_at,
          daysSincePublish: daysSince,
          categoryId: post.category_id ?? "",
        });
      }
    }

    return results.slice(0, 5);
  } catch (err) {
    console.error("[getUpdateNeededPosts] 에러:", err);
    return [];
  }
}

// ── TOP 성과 글 ──
```

## 5. src/lib/recommendation-engine.ts:92-98

```ts
export function getPrimaryCategoryId(categoryId: string): string {
  if (["CAT-A", "CAT-B", "CAT-C"].includes(categoryId)) return categoryId;
  // CAT-A-01 → CAT-A
  const parts = categoryId.split("-");
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  return categoryId;
}
```

## 6. 화면

health-check-tab.tsx:22-73 (점검 대상·전체 헬스체크·업데이트 완료 표시)

```tsx
export function HealthCheckTab({ contents: initialContents }: HealthCheckTabProps) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [contents, setContents] = useState(initialContents);

  const problemContents = contents.filter(
    (c) =>
      c.healthCheck.recommendedStatus === "CHECK_NEEDED" ||
      c.healthCheck.recommendedStatus === "UPDATE_NEEDED"
  );

  const handleRunCheck = async () => {
    setIsRunning(true);
    try {
      const { error } = await runHealthCheck();
      if (error) {
        toast.error(error);
      } else {
        toast.success("헬스체크가 완료되었습니다.");
        router.refresh();
      }
    } catch {
      toast.error("헬스체크 실행에 실패했습니다.");
    } finally {
      setIsRunning(false);
    }
  };

  const handleMarkUpdated = async (contentId: string) => {
    const { success, error } = await updateHealthStatus(contentId, "UPDATED");
    if (success) {
      toast.success("업데이트 완료로 표시했습니다.");
      setContents((prev) =>
        prev.map((c) =>
          c.id === contentId
            ? {
                ...c,
                health_status: "UPDATED" as HealthStatus,
                healthCheck: {
                  ...c.healthCheck,
                  recommendedStatus: "HEALTHY" as HealthStatus,
                  currentStatus: "UPDATED" as HealthStatus,
                  reasons: ["최근 업데이트 완료"],
                },
              }
            : c
        )
      );
    } else {
      toast.error(error ?? "상태 변경에 실패했습니다.");
    }
  };
```

health-check-tab.tsx:76-86 (요약 문구)

```tsx
    <div className="space-y-4">
      {/* 요약 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            발행 글 {contents.length}개 중{" "}
            <span className="font-semibold text-red-600">
              {problemContents.length}개
            </span>{" "}
            점검 필요
          </span>
```

health-banner.tsx:26-72 (상세 페이지 배너 문구)

```tsx
  if (status === "HEALTHY" || status === "UPDATED") {
    return null;
  }

  const handleMarkUpdated = async () => {
    const { success, error } = await updateHealthStatus(contentId, "UPDATED");
    if (success) {
      toast.success("업데이트 완료로 표시했습니다.");
      setStatus("UPDATED");
    } else {
      toast.error(error ?? "상태 변경에 실패했습니다.");
    }
  };

  const isUrgent = status === "UPDATE_NEEDED";

  return (
    <div
      className={`rounded-lg border p-4 flex items-center justify-between gap-4 ${
        isUrgent
          ? "bg-red-50 border-red-200"
          : "bg-yellow-50 border-yellow-200"
      }`}
    >
      <div className="flex items-center gap-3">
        {isUrgent ? (
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
        ) : (
          <ShieldCheck className="h-5 w-5 text-yellow-600 shrink-0" />
        )}
        <div>
          <p className={`text-sm font-medium ${isUrgent ? "text-red-700" : "text-yellow-700"}`}>
            {HEALTH_STATUS_LABELS[status]}
          </p>
          <p className="text-xs text-muted-foreground">
            {isUrgent
              ? "이 글은 업데이트가 필요합니다. 내용을 검토하고 최신 정보로 수정해주세요."
              : "이 글은 점검이 필요합니다. 내용이 최신 상태인지 확인해주세요."}
            {healthCheckedAt &&
              ` (마지막 점검: ${healthCheckedAt.substring(0, 10)})`}
          </p>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={handleMarkUpdated}>
        <CheckCircle className="h-3.5 w-3.5 mr-1" />
        업데이트 완료
      </Button>
```

dashboard/update-needed.tsx 전체

```tsx
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import type { UpdateNeededPost } from "@/actions/recommendations";
import { AlertTriangle, Clock } from "lucide-react";

interface UpdateNeededProps {
  posts: UpdateNeededPost[];
}

export function UpdateNeeded({ posts }: UpdateNeededProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          업데이트 필요 글
        </CardTitle>
      </CardHeader>
      <CardContent>
        {posts.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-8 w-8 text-muted-foreground" />}
            title="점검 대상 없음"
            description="아직 업데이트 점검 대상 글이 없습니다"
          />
        ) : (
          <div className="space-y-2">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/contents/${post.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <span className="text-sm font-medium truncate flex-1">
                  {post.title}
                </span>
                <span className="text-xs text-orange-600 font-medium flex-shrink-0">
                  {post.daysSincePublish}일 경과
                </span>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

## 7. supabase/migrations/007_contents_columns.sql:12-13

```sql
ALTER TABLE contents ADD COLUMN IF NOT EXISTS health_status TEXT DEFAULT 'HEALTHY';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS health_checked_at TIMESTAMPTZ;
```
