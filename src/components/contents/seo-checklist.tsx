"use client";

import { useState, useCallback, useMemo } from "react";
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
import { CheckCircle2, AlertTriangle, XCircle, Save, Info } from "lucide-react";

interface SeoChecklistProps {
  contentId: string;
  initialItems?: Record<string, { passed: boolean; note: string }>;
  onSave?: (items: Record<string, { passed: boolean; note: string }>) => void;
  /** 카테고리 ID — CTA 체크 기준 분기 */
  categoryId?: string | null;
  /** 현재 콘텐츠 상태 — 예약 시간 필수 여부 분기 */
  contentStatus?: string;
}

type SeoItemState = Record<string, { passed: boolean; note: string }>;

const VERDICT_CONFIG: Record<
  SeoVerdict | "preparing",
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
  preparing: {
    label: "발행 준비 중",
    icon: Info,
    className: "text-[var(--neutral-text-muted)]",
  },
};

/**
 * 카테고리별로 SEO 항목을 조정
 * - CTA 배치(id:16): 다이어리는 "CTA 없음 확인"으로 변경, IP 뉴스 한 입은 "이웃 추가"로 변경
 * - 예약 시간(id:18): 발행예정(S3) 이전 단계에서는 제외
 */
function getAdjustedItems(
  categoryId?: string | null,
  contentStatus?: string
): { items: SeoItem[]; excludedIds: Set<number> } {
  const excludedIds = new Set<number>();
  const items = SEO_ITEMS.map((item) => {
    // 예약 시간: S3 이전 단계에서는 제외
    if (item.id === 18) {
      const statusOrder = ["S0", "S1", "S2", "S3", "S4", "S5"];
      const idx = statusOrder.indexOf(contentStatus || "S0");
      if (idx < 3) {
        // S0, S1, S2에서는 예약 시간 비필수 (제외)
        excludedIds.add(18);
        return item;
      }
    }

    // CTA 배치: 카테고리별 기준 변경
    if (item.id === 16 && categoryId) {
      // 디딤 다이어리 (CAT-C): CTA 없음 확인
      if (categoryId === "CAT-C" || categoryId.startsWith("CAT-C-")) {
        return { ...item, label: "CTA 없음 확인", description: "CTA 키워드 미포함" };
      }
      // IP 뉴스 한 입 (CAT-B-03): 이웃 추가 유도
      if (categoryId === "CAT-B-03") {
        return { ...item, label: "CTA 배치", description: "이웃 추가 유도" };
      }
      // IP 라운지 (CAT-B): 이웃 추가 유도
      if (categoryId === "CAT-B" || categoryId.startsWith("CAT-B-")) {
        return { ...item, label: "CTA 배치", description: "이웃 추가 + 이메일 안내" };
      }
    }

    return item;
  });

  return { items: items.filter((i) => !excludedIds.has(i.id)), excludedIds };
}

function getVerdict(
  items: SeoItemState,
  activeItems: SeoItem[],
  contentStatus?: string
): SeoVerdict | "preparing" {
  // 기획중(S0), 초안완료(S1)에서는 "발행 준비 중"
  const earlyStatuses = ["S0", "S1"];
  if (earlyStatuses.includes(contentStatus || "S0")) {
    return "preparing";
  }

  const requiredItems = activeItems.filter((i) => i.grade === "required");
  const recommendedItems = activeItems.filter((i) => i.grade === "recommended");

  const requiredPass = requiredItems.filter(
    (i) => items[String(i.id)]?.passed
  ).length;
  const recommendedPass = recommendedItems.filter(
    (i) => items[String(i.id)]?.passed
  ).length;

  if (requiredPass < requiredItems.length) return "blocked";
  const recommendedFail = recommendedItems.length - recommendedPass;
  if (recommendedFail > 2) return "fix_required";
  return "pass";
}

function getGradePassCount(grade: SeoGrade, items: SeoItemState, activeItems: SeoItem[]): number {
  return activeItems.filter(
    (i) => i.grade === grade && items[String(i.id)]?.passed
  ).length;
}

function getGradeTotal(grade: SeoGrade, activeItems: SeoItem[]): number {
  return activeItems.filter((i) => i.grade === grade).length;
}

/**
 * SEO 체크리스트 컴포넌트 — 카테고리/상태 인식
 */
export function SeoChecklist({
  contentId,
  initialItems,
  onSave,
  categoryId,
  contentStatus,
}: SeoChecklistProps) {
  const { items: activeItems, excludedIds } = useMemo(
    () => getAdjustedItems(categoryId, contentStatus),
    [categoryId, contentStatus]
  );

  const [items, setItems] = useState<SeoItemState>(() => {
    if (initialItems) return initialItems;
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

  const verdict = getVerdict(items, activeItems, contentStatus);
  const verdictConfig = VERDICT_CONFIG[verdict];
  const VerdictIcon = verdictConfig.icon;

  const grouped: Record<SeoGrade, SeoItem[]> = {
    required: activeItems.filter((i) => i.grade === "required"),
    recommended: activeItems.filter((i) => i.grade === "recommended"),
    optional: activeItems.filter((i) => i.grade === "optional"),
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
            const gradeItems = grouped[grade];
            if (gradeItems.length === 0) return null;
            const passCount = getGradePassCount(grade, items, activeItems);
            const total = getGradeTotal(grade, activeItems);

            const gradeConfig: Record<SeoGrade, { label: string; bgClass: string }> = {
              required: { label: "필수", bgClass: "bg-[var(--seo-required)]" },
              recommended: { label: "권장", bgClass: "bg-[var(--seo-recommended)]" },
              optional: { label: "선택", bgClass: "bg-[var(--seo-optional)]" },
            };
            const config = gradeConfig[grade];

            return (
              <div key={grade} className="space-y-2">
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
                    {passCount}/{total} 통과
                  </span>
                </div>

                <div className="space-y-1.5">
                  {gradeItems.map((item) => {
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
