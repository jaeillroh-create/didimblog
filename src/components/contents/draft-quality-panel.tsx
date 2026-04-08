"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { validateDraft, calcDraftScore, type DraftCheckItem } from "@/lib/draft-validator";
import { CheckCircle2, XCircle, ChevronDown, ChevronRight, ClipboardCheck } from "lucide-react";

interface DraftQualityPanelProps {
  title: string;
  body: string;
  categoryId: string;
}

const CATEGORY_ORDER: DraftCheckItem["category"][] = [
  "제목", "도입부", "본문구조", "서식", "이미지", "CTA", "서명",
];

export function DraftQualityPanel({ title, body, categoryId }: DraftQualityPanelProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const checks = useMemo(() => validateDraft(title, body, categoryId), [title, body, categoryId]);
  const { score, total, passedCount, failedItems } = useMemo(() => calcDraftScore(checks), [checks]);

  // 기본적으로 미통과 카테고리만 펼치기
  const failedCategories = useMemo(
    () => new Set(failedItems.map((c) => c.category)),
    [failedItems]
  );

  function isExpanded(cat: DraftCheckItem["category"]) {
    return expandedCategories.has(cat) || failedCategories.has(cat);
  }

  function toggleCategory(cat: DraftCheckItem["category"]) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  // 카테고리별 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<string, DraftCheckItem[]>();
    for (const check of checks) {
      const arr = map.get(check.category) || [];
      arr.push(check);
      map.set(check.category, arr);
    }
    return map;
  }, [checks]);

  const scoreColor =
    score >= 80 ? "var(--quality-excellent)" :
    score >= 60 ? "var(--quality-good)" :
    "var(--quality-average)";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <ClipboardCheck className="h-4 w-4" />
            초안 품질 체크
          </span>
          <span className="text-lg font-bold" style={{ color: scoreColor }}>
            {score}점
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {passedCount}/{total} 항목 통과
        </p>
      </CardHeader>
      <CardContent className="space-y-1">
        {CATEGORY_ORDER.map((cat) => {
          const items = grouped.get(cat);
          if (!items || items.length === 0) return null;

          const catPassed = items.every((c) => c.passed);
          const expanded = isExpanded(cat);

          return (
            <div key={cat}>
              <button
                onClick={() => toggleCategory(cat)}
                className="flex items-center gap-1.5 w-full text-left py-1.5 text-sm hover:bg-muted/50 rounded px-1 -mx-1"
              >
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="font-medium flex-1">{cat}</span>
                {catPassed ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--quality-excellent)" }} />
                ) : (
                  <XCircle className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--quality-critical)" }} />
                )}
              </button>
              {expanded && (
                <div className="ml-5 space-y-1 pb-1">
                  {items.map((check) => (
                    <div key={check.id} className="flex items-start gap-1.5 text-xs">
                      {check.passed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: "var(--quality-excellent)" }} />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: "var(--quality-critical)" }} />
                      )}
                      <div>
                        <span className={check.passed ? "text-muted-foreground" : "text-red-700 font-medium"}>
                          {check.rule}
                        </span>
                        <span className="text-muted-foreground ml-1">— {check.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
