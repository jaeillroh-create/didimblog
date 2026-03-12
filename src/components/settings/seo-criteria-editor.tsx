"use client";

import { useState, useTransition } from "react";
import { type SeoSettingItem, updateSeoSettings } from "@/actions/settings";
import { type SeoGrade } from "@/lib/constants/seo-items";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Search, RotateCcw } from "lucide-react";

const GRADE_CONFIG: Record<
  SeoGrade,
  { label: string; badgeClass: string; rule: string; borderColor: string }
> = {
  required: {
    label: "필수",
    badgeClass: "badge-danger",
    rule: "모두 통과해야 발행 가능",
    borderColor: "var(--danger)",
  },
  recommended: {
    label: "권장",
    badgeClass: "badge-warning",
    rule: "2개까지 미충족 허용",
    borderColor: "var(--warning)",
  },
  optional: {
    label: "선택",
    badgeClass: "badge-neutral",
    rule: "미충족 허용",
    borderColor: "var(--g300)",
  },
};

const GRADE_ORDER: SeoGrade[] = ["required", "recommended", "optional"];

interface SeoCriteriaEditorProps {
  initialItems: SeoSettingItem[];
}

export function SeoCriteriaEditor({ initialItems }: SeoCriteriaEditorProps) {
  const [items, setItems] = useState<SeoSettingItem[]>(initialItems);
  const [isPending, startTransition] = useTransition();

  function toggleItem(id: number) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, enabled: !item.enabled } : item
      )
    );
  }

  function handleSave() {
    startTransition(async () => {
      const { error } = await updateSeoSettings(
        items.map((item) => ({ id: item.id, enabled: item.enabled }))
      );
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("SEO 설정이 저장되었습니다.");
    });
  }

  function handleReset() {
    setItems((prev) => prev.map((item) => ({ ...item, enabled: true })));
    toast.info("기본값으로 복원되었습니다. 저장 버튼을 눌러 적용하세요.");
  }

  const groupedItems = GRADE_ORDER.map((grade) => ({
    grade,
    config: GRADE_CONFIG[grade],
    items: items.filter((item) => item.grade === grade),
  }));

  return (
    <div className="scard">
      <div className="scard-head">
        <div className="scard-head-left">
          <Search className="h-5 w-5" style={{ color: "var(--g500)" }} />
          <span className="scard-head-title">SEO 기준 설정</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleReset}
            disabled={isPending}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            기본값 복원
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={isPending}>
            저장
          </button>
        </div>
      </div>
      <div className="scard-body space-y-6">
        {groupedItems.map(({ grade, config, items: gradeItems }) => (
          <div key={grade} className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={`ucl-badge ${config.badgeClass}`}>
                {config.label}
              </span>
              <span className="t-xs" style={{ color: "var(--g400)" }}>
                {config.rule}
              </span>
            </div>

            <div className="space-y-1">
              {gradeItems.map((item) => (
                <div
                  key={item.id}
                  className={`doc-row ${item.enabled ? "doc-row-done" : "doc-row-empty"}`}
                  style={{
                    borderLeftColor: item.enabled ? config.borderColor : "var(--g200)",
                  }}
                >
                  <Checkbox
                    id={`seo-${item.id}`}
                    checked={item.enabled}
                    onCheckedChange={() => toggleItem(item.id)}
                    disabled={isPending}
                  />
                  <label
                    htmlFor={`seo-${item.id}`}
                    className="flex flex-1 cursor-pointer items-center gap-3"
                  >
                    <span className="t-sm min-w-[120px]" style={{ fontWeight: 600, color: "var(--g900)" }}>
                      {item.label}
                    </span>
                    <span className="t-sm" style={{ color: "var(--g500)" }}>
                      {item.description}
                    </span>
                  </label>
                </div>
              ))}
            </div>

            {grade !== "optional" && <div className="divider" />}
          </div>
        ))}
      </div>
    </div>
  );
}
