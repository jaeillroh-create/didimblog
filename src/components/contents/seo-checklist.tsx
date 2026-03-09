"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SEO_ITEMS,
  type SeoGrade,
  type SeoItem,
} from "@/lib/constants/seo-items";
import type { SeoVerdict } from "@/lib/types/database";
import { CheckCircle2, AlertTriangle, XCircle, Save } from "lucide-react";

interface SeoChecklistProps {
  contentId: string;
  initialItems?: Record<string, { passed: boolean; note: string }>;
  onSave?: (items: Record<string, { passed: boolean; note: string }>) => void;
}

type SeoItemState = Record<string, { passed: boolean; note: string }>;

const GRADE_CONFIG: Record<
  SeoGrade,
  { label: string; total: number; colorVar: string; bgClass: string }
> = {
  required: {
    label: "필수",
    total: 10,
    colorVar: "var(--seo-required)",
    bgClass: "bg-[var(--seo-required)]",
  },
  recommended: {
    label: "권장",
    total: 5,
    colorVar: "var(--seo-recommended)",
    bgClass: "bg-[var(--seo-recommended)]",
  },
  optional: {
    label: "선택",
    total: 3,
    colorVar: "var(--seo-optional)",
    bgClass: "bg-[var(--seo-optional)]",
  },
};

const VERDICT_CONFIG: Record<
  SeoVerdict,
  { label: string; icon: React.ElementType; className: string }
> = {
  pass: {
    label: "통과",
    icon: CheckCircle2,
    className: "text-[var(--semantic-success)]",
  },
  fix_required: {
    label: "수정 필요",
    icon: AlertTriangle,
    className: "text-[var(--semantic-warning)]",
  },
  blocked: {
    label: "발행 불가",
    icon: XCircle,
    className: "text-[var(--semantic-error)]",
  },
};

function getVerdict(items: SeoItemState): SeoVerdict {
  const requiredItems = SEO_ITEMS.filter((i) => i.grade === "required");
  const recommendedItems = SEO_ITEMS.filter((i) => i.grade === "recommended");

  const requiredPass = requiredItems.filter(
    (i) => items[String(i.id)]?.passed
  ).length;
  const recommendedPass = recommendedItems.filter(
    (i) => items[String(i.id)]?.passed
  ).length;

  if (requiredPass < 10) return "blocked";
  const recommendedFail = recommendedItems.length - recommendedPass;
  if (recommendedFail > 2) return "fix_required";
  return "pass";
}

function getGradePassCount(grade: SeoGrade, items: SeoItemState): number {
  return SEO_ITEMS.filter(
    (i) => i.grade === grade && items[String(i.id)]?.passed
  ).length;
}

/**
 * SEO 18항목 체크리스트 컴포넌트
 */
export function SeoChecklist({
  contentId,
  initialItems,
  onSave,
}: SeoChecklistProps) {
  const [items, setItems] = useState<SeoItemState>(() => {
    if (initialItems) return initialItems;
    // 기본 빈 상태
    const defaultItems: SeoItemState = {};
    SEO_ITEMS.forEach((item) => {
      defaultItems[String(item.id)] = { passed: false, note: "" };
    });
    return defaultItems;
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleToggle = useCallback((itemId: number, checked: boolean) => {
    setItems((prev) => ({
      ...prev,
      [String(itemId)]: {
        ...prev[String(itemId)],
        passed: checked,
      },
    }));
  }, []);

  const handleNoteChange = useCallback((itemId: number, note: string) => {
    setItems((prev) => ({
      ...prev,
      [String(itemId)]: {
        ...prev[String(itemId)],
        note,
      },
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave(items);
    } finally {
      setIsSaving(false);
    }
  }, [items, onSave]);

  const verdict = getVerdict(items);
  const verdictConfig = VERDICT_CONFIG[verdict];
  const VerdictIcon = verdictConfig.icon;

  const grouped: Record<SeoGrade, SeoItem[]> = {
    required: SEO_ITEMS.filter((i) => i.grade === "required"),
    recommended: SEO_ITEMS.filter((i) => i.grade === "recommended"),
    optional: SEO_ITEMS.filter((i) => i.grade === "optional"),
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">SEO 체크리스트</CardTitle>
          <div className="flex items-center gap-2">
            <div className={cn("flex items-center gap-1", verdictConfig.className)}>
              <VerdictIcon className="h-4 w-4" />
              <span className="text-sm font-medium">{verdictConfig.label}</span>
            </div>
            {onSave && (
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="ml-2"
              >
                <Save className="h-4 w-4 mr-1" />
                {isSaving ? "저장 중..." : "저장"}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {(["required", "recommended", "optional"] as SeoGrade[]).map(
          (grade) => {
            const config = GRADE_CONFIG[grade];
            const passCount = getGradePassCount(grade, items);

            return (
              <div key={grade} className="space-y-2">
                {/* 등급 헤더 */}
                <div className="flex items-center gap-2">
                  <Badge
                    className={cn(
                      "text-white border-transparent text-xs",
                      config.bgClass
                    )}
                  >
                    {config.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {passCount}/{config.total} 통과
                  </span>
                </div>

                {/* 항목 리스트 */}
                <div className="space-y-1.5">
                  {grouped[grade].map((item) => {
                    const state = items[String(item.id)];
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 rounded-md border px-3 py-2"
                      >
                        <Checkbox
                          id={`seo-${contentId}-${item.id}`}
                          checked={state?.passed ?? false}
                          onCheckedChange={(checked) =>
                            handleToggle(item.id, checked === true)
                          }
                        />
                        <label
                          htmlFor={`seo-${contentId}-${item.id}`}
                          className="flex-shrink-0 text-sm font-medium cursor-pointer select-none min-w-[100px]"
                        >
                          {item.label}
                        </label>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {item.description}
                        </span>
                        <Input
                          placeholder="메모"
                          value={state?.note ?? ""}
                          onChange={(e) =>
                            handleNoteChange(item.id, e.target.value)
                          }
                          className="h-7 text-xs ml-auto max-w-[200px]"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }
        )}
      </CardContent>
    </Card>
  );
}
