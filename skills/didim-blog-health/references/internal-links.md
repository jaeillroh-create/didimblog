# 내부 링크 추천 원문

> 원본 그대로. 포팅: scripts/internal_links.py. 결정 사항(skills/_DECISIONS.md)에 따라 '같은 카테고리'는 신규 카테고리 합산값(categoryNo)으로 비교한다.

## 목차
1. 점수 로직 — internal-link-recommender.ts
2. 서버 액션 — manage.ts getInternalLinkSuggestions
3. 상세 페이지 패널 — internal-links-panel.tsx
4. SEO 권장 기준(내부 링크 2~3개)
5. 주간 루틴의 내부 링크 작업

## 1. src/lib/internal-link-recommender.ts 전체 (1-106)

```ts
import type { Content } from "@/lib/types/database";
import { getPrimaryCategoryId } from "@/lib/recommendation-engine";

// ── 내부 링크 추천 결과 ──

export interface InternalLinkSuggestion {
  contentId: string;
  title: string;
  relevanceScore: number;
  reason: string;
  categoryId: string;
}

// ── 키워드 기반 유사도 계산 ──

function calculateRelevance(
  source: Content,
  target: Content
): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  // 1. 같은 카테고리 가산 (+20)
  const sourcePrimary = getPrimaryCategoryId(source.category_id ?? "");
  const targetPrimary = getPrimaryCategoryId(target.category_id ?? "");
  if (sourcePrimary === targetPrimary) {
    score += 20;
    reasons.push("같은 카테고리");
  }

  // 2. 같은 2차 분류 가산 (+15)
  if (
    source.secondary_category &&
    source.secondary_category === target.secondary_category
  ) {
    score += 15;
    reasons.push("같은 2차 분류");
  }

  // 3. 키워드 일치 가산 (+30)
  const sourceKeyword = source.target_keyword?.toLowerCase() ?? "";
  const targetTitle = target.title?.toLowerCase() ?? "";
  const targetBody = target.body?.toLowerCase() ?? "";
  const targetKeyword = target.target_keyword?.toLowerCase() ?? "";

  if (sourceKeyword && targetKeyword && sourceKeyword === targetKeyword) {
    score += 30;
    reasons.push("동일 타겟 키워드");
  } else if (sourceKeyword && targetTitle.includes(sourceKeyword)) {
    score += 25;
    reasons.push("제목에 키워드 포함");
  } else if (sourceKeyword && targetBody.includes(sourceKeyword)) {
    score += 15;
    reasons.push("본문에 키워드 포함");
  }

  // 4. 태그 교집합 가산
  const sourceTags = new Set(source.tags?.map((t) => t.toLowerCase()) ?? []);
  const targetTags = target.tags?.map((t) => t.toLowerCase()) ?? [];
  const commonTags = targetTags.filter((t) => sourceTags.has(t));
  if (commonTags.length > 0) {
    score += commonTags.length * 10;
    reasons.push(`공통 태그 ${commonTags.length}개`);
  }

  // 5. 조회수 보너스 (인기글 우선)
  if (target.views_1m && target.views_1m > 500) {
    score += 10;
    reasons.push("인기글");
  }

  return { score, reason: reasons.join(", ") };
}

// ── 내부 링크 추천 ──

export function recommendInternalLinks(
  source: Content,
  allContents: Content[],
  maxResults: number = 5
): InternalLinkSuggestion[] {
  // 자기 자신과 삭제된 글 제외, 발행(S4+) 글만
  const candidates = allContents.filter(
    (c) =>
      c.id !== source.id &&
      !c.is_deleted &&
      (c.status === "S4" || c.status === "S5")
  );

  const scored = candidates
    .map((target) => {
      const { score, reason } = calculateRelevance(source, target);
      return {
        contentId: target.id,
        title: target.title ?? "제목 없음",
        relevanceScore: score,
        reason,
        categoryId: target.category_id ?? "",
      };
    })
    .filter((s) => s.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, maxResults);

  return scored;
}
```

## 2. 서버 액션 — src/actions/manage.ts:124-163

```ts
// ── 내부 링크 추천 ──

export async function getInternalLinkSuggestions(
  contentId: string
): Promise<{
  suggestions: InternalLinkSuggestion[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    // 현재 콘텐츠
    const { data: content, error: contentError } = await supabase
      .from("contents")
      .select("*")
      .eq("id", contentId)
      .single();

    if (contentError) throw contentError;

    // 발행된 모든 콘텐츠
    const { data: allContents, error: allError } = await supabase
      .from("contents")
      .select("*")
      .in("status", ["S4", "S5"])
      .eq("is_deleted", false);

    if (allError) throw allError;

    const suggestions = recommendInternalLinks(
      content as Content,
      (allContents ?? []) as Content[]
    );

    return { suggestions, error: null };
  } catch (err) {
    console.error("[getInternalLinkSuggestions] 에러:", err);
    return { suggestions: [], error: "내부 링크 추천에 실패했습니다." };
  }
}
```

## 3. 상세 페이지 패널 — src/components/contents/internal-links-panel.tsx 전체

```tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getInternalLinkSuggestions } from "@/actions/manage";
import type { InternalLinkSuggestion } from "@/lib/internal-link-recommender";
import { Link2, ExternalLink, Copy, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface InternalLinksPanelProps {
  contentId: string;
}

export function InternalLinksPanel({ contentId }: InternalLinksPanelProps) {
  const [suggestions, setSuggestions] = useState<InternalLinkSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { suggestions: data } = await getInternalLinkSuggestions(contentId);
      setSuggestions(data);
      setLoading(false);
    }
    load();
  }, [contentId]);

  const handleCopyTitle = (title: string) => {
    navigator.clipboard.writeText(title);
    toast.success("제목이 복사되었습니다.");
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            내부 링크 추천
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (suggestions.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            내부 링크 추천
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            추천할 관련 글이 없습니다.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          내부 링크 추천
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {suggestions.map((s) => (
          <div
            key={s.contentId}
            className="flex items-center justify-between py-2 border-b last:border-0"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{s.title}</p>
              <p className="text-xs text-muted-foreground">{s.reason}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => handleCopyTitle(s.title)}
                title="제목 복사"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Link href={`/contents/${s.contentId}`}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  title="글 보기"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

## 4. 관련 SEO 기준 — SPEC.md §5.2 권장 항목 (SPEC.md:506-510)

```markdown
**권장 (5개) — 2개까지 미충족 허용:**
6. 소제목 '제목2' 2개+
7. 소제목 키워드 변형
12. 내부 링크 2~3개
15. 태그 구성 (핵심3+연관3+브랜드2+롱테일2)
```

## 5. 주간 루틴의 내부 링크 작업 — docs/08_주간_루틴.md:31-37

```text
  월 저녁    콘텐츠 담당  수정사항 반영. 이미지 제작 + ALT    1\~2시간      예약 발행
                          텍스트 입력. 태그 10개 입력                       설정 완료
                          (핵심3+연관3+브랜드2+롱테일2). 내부               
                          링크 2\~3개 삽입. CTA 배치 최종                   
                          확인. SEO 체크리스트(18항목) 전수                 
                          점검. → 화요일 09:00 예약 발행                    
                          설정.                                             
```
