// LEGACY: seo-score-panel.tsx (자동 채점)로 대체됨. 참조용으로 보존.
"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  { label: string; total: number; badgeClass: string }
> = {
  required: {
    label: "필수",
    total: 10,
    badgeClass: "badge-danger",
  },
  recommended: {
    label: "권장",
    total: 5,
    badgeClass: "badge-warning",
  },
  optional: {
    label: "선택",
    total: 3,
    badgeClass: "badge-info",
  },
};

const VERDICT_CONFIG: Record<
  SeoVerdict,
  { label: string; icon: React.ElementType; badgeClass: string; color: string }
> = {
  pass: {
    label: "통과",
    icon: CheckCircle2,
    badgeClass: "badge-success",
    color: "var(--success)",
  },
  fix_required: {
    label: "수정 필요",
    icon: AlertTriangle,
    badgeClass: "badge-warning",
    color: "var(--warning)",
  },
  blocked: {
    label: "발행 불가",
    icon: XCircle,
    badgeClass: "badge-danger",
    color: "var(--danger)",
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
          <CardTitle className="t-lg">SEO 체크리스트</CardTitle>
          <div className="flex items-center gap-2">
            <span className={cn("ucl-badge ucl-badge-sm", verdictConfig.badgeClass)}>
              <VerdictIcon className="h-3.5 w-3.5" />
              {verdictConfig.label}
            </span>
            {onSave && (
              <button
                className="btn btn-primary btn-sm ml-2"
                onClick={handleSave}
                disabled={isSaving}
                style={{ backgroundColor: "var(--brand)" }}
              >
                <Save className="h-4 w-4 mr-1" />
                {isSaving ? "저장 중..." : "저장"}
              </button>
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
                  <span className={cn("ucl-badge ucl-badge-sm", config.badgeClass)}>
                    {config.label}
                  </span>
                  <span className="t-xs" style={{ color: "var(--g500)" }}>
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
                        className="doc-row flex items-center gap-3 px-3 py-2"
                        style={{
                          borderRadius: "var(--r-sm)",
                          border: "1px solid var(--g200)",
                        }}
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
                          className="t-sm font-medium cursor-pointer select-none min-w-[100px] flex-shrink-0"
                          style={{ color: "var(--g900)" }}
                        >
                          {item.label}
                        </label>
                        <span className="t-xs flex-shrink-0" style={{ color: "var(--g500)" }}>
                          {item.description}
                        </span>
                        <Input
                          placeholder="메모"
                          value={state?.note ?? ""}
                          onChange={(e) =>
                            handleNoteChange(item.id, e.target.value)
                          }
                          className="input-field h-7 t-xs ml-auto max-w-[200px]"
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
