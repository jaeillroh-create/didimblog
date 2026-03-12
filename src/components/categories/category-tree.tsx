"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types/database";
import {
  CATEGORY_COLORS,
  CATEGORY_ROLE_TYPES,
  CATEGORY_STATUSES,
} from "@/lib/constants/categories";

interface CategoryTreeProps {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function getCategoryColor(category: Category, categories: Category[]): string {
  if (category.tier === "secondary" && category.parent_id) {
    const parentId = category.parent_id.split("-").slice(0, 2).join("-");
    return (
      CATEGORY_COLORS[parentId as keyof typeof CATEGORY_COLORS] ?? "var(--g500)"
    );
  }
  return (
    CATEGORY_COLORS[category.id as keyof typeof CATEGORY_COLORS] ?? "var(--g500)"
  );
}

export function CategoryTree({
  categories,
  selectedId,
  onSelect,
}: CategoryTreeProps) {
  const primaryCategories = categories.filter((c) => c.tier === "primary");
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    primaryCategories.forEach((c) => {
      initial[c.id] = true;
    });
    return initial;
  });

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getChildren = (parentId: string) =>
    categories.filter((c) => c.parent_id === parentId);

  const statusBadgeClass = (statusColor: string): string => {
    if (statusColor.includes("0F9D58") || statusColor.includes("success")) return "badge-success";
    if (statusColor.includes("E88B00") || statusColor.includes("warning")) return "badge-warning";
    if (statusColor.includes("E5383B") || statusColor.includes("danger")) return "badge-danger";
    return "badge-neutral";
  };

  return (
    <div className="space-y-1">
      {primaryCategories.map((primary) => {
        const children = getChildren(primary.id);
        const isExpanded = expanded[primary.id] ?? true;
        const color = getCategoryColor(primary, categories);
        const statusInfo = CATEGORY_STATUSES[primary.status];

        return (
          <div key={primary.id}>
            {/* 1차 카테고리 */}
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors",
                selectedId === primary.id ? "bg-[var(--brand-light)]" : "hover:bg-[var(--g50)]"
              )}
              style={{ borderRadius: "var(--r-md)" }}
              onClick={() => onSelect(primary.id)}
            >
              {children.length > 0 ? (
                <button
                  className="shrink-0 p-0.5 hover:bg-[var(--g100)]"
                  style={{ borderRadius: "var(--r-xs)" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(primary.id);
                  }}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" style={{ color: "var(--g400)" }} />
                  ) : (
                    <ChevronRight className="h-4 w-4" style={{ color: "var(--g400)" }} />
                  )}
                </button>
              ) : (
                <span className="w-5" />
              )}

              <span
                className="inline-block h-2.5 w-2.5 shrink-0"
                style={{ backgroundColor: color, borderRadius: "var(--r-full)" }}
              />

              <span className="flex-1 t-sm truncate" style={{ fontWeight: 600, color: "var(--g900)" }}>
                {primary.name}
              </span>

              <div className="flex items-center gap-1.5 shrink-0">
                {primary.monthly_target > 0 && (
                  <span className="t-xs" style={{ color: "var(--g400)" }}>
                    월 {primary.monthly_target}건
                  </span>
                )}
                <span className={`ucl-badge ucl-badge-sm ${statusBadgeClass(statusInfo.color)}`}>
                  {statusInfo.label}
                </span>
                <span className="t-micro hidden lg:inline" style={{ color: "var(--g400)" }}>
                  {CATEGORY_ROLE_TYPES[primary.role_type]}
                </span>
              </div>
            </div>

            {/* 2차 카테고리 (하위) */}
            {isExpanded &&
              children.map((child) => {
                const childColor = getCategoryColor(child, categories);
                const childStatus = CATEGORY_STATUSES[child.status];

                return (
                  <div
                    key={child.id}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 ml-6 cursor-pointer transition-colors",
                      selectedId === child.id ? "bg-[var(--brand-light)]" : "hover:bg-[var(--g50)]"
                    )}
                    style={{
                      borderRadius: "var(--r-md)",
                      borderLeft: "2px solid var(--g200)",
                    }}
                    onClick={() => onSelect(child.id)}
                  >
                    <span className="w-5" />

                    <span
                      className="inline-block h-2 w-2 shrink-0"
                      style={{ backgroundColor: childColor, borderRadius: "var(--r-full)" }}
                    />

                    <span className="flex-1 t-sm truncate" style={{ color: "var(--g700)" }}>
                      {child.name}
                    </span>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {child.monthly_target > 0 && (
                        <span className="t-xs" style={{ color: "var(--g400)" }}>
                          월 {child.monthly_target}건
                        </span>
                      )}
                      <span className={`ucl-badge ucl-badge-sm ${statusBadgeClass(childStatus.color)}`}>
                        {childStatus.label}
                      </span>
                      <span className="t-micro hidden lg:inline" style={{ color: "var(--g400)" }}>
                        {CATEGORY_ROLE_TYPES[child.role_type]}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
