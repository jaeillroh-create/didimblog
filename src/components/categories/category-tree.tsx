"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
      CATEGORY_COLORS[parentId as keyof typeof CATEGORY_COLORS] ?? "#6B7280"
    );
  }
  return (
    CATEGORY_COLORS[category.id as keyof typeof CATEGORY_COLORS] ?? "#6B7280"
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
                "flex items-center gap-2 rounded-md px-3 py-2 cursor-pointer transition-colors hover:bg-accent/50",
                selectedId === primary.id && "bg-accent"
              )}
              onClick={() => onSelect(primary.id)}
            >
              {children.length > 0 ? (
                <button
                  className="shrink-0 p-0.5 rounded hover:bg-accent"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(primary.id);
                  }}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              ) : (
                <span className="w-5" />
              )}

              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />

              <span className="flex-1 text-sm font-medium truncate">
                {primary.name}
              </span>

              <div className="flex items-center gap-1.5 shrink-0">
                {primary.monthly_target > 0 && (
                  <span className="text-xs text-muted-foreground">
                    월 {primary.monthly_target}건
                  </span>
                )}
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 border-transparent font-medium"
                  style={{
                    backgroundColor: `${statusInfo.color}20`,
                    color: statusInfo.color,
                  }}
                >
                  {statusInfo.label}
                </Badge>
                <span className="text-[10px] text-muted-foreground hidden lg:inline">
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
                      "flex items-center gap-2 rounded-md px-3 py-1.5 ml-6 cursor-pointer transition-colors hover:bg-accent/50 border-l-2 border-muted",
                      selectedId === child.id && "bg-accent"
                    )}
                    onClick={() => onSelect(child.id)}
                  >
                    <span className="w-5" />

                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: childColor }}
                    />

                    <span className="flex-1 text-sm truncate">
                      {child.name}
                    </span>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {child.monthly_target > 0 && (
                        <span className="text-xs text-muted-foreground">
                          월 {child.monthly_target}건
                        </span>
                      )}
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 border-transparent font-medium"
                        style={{
                          backgroundColor: `${childStatus.color}20`,
                          color: childStatus.color,
                        }}
                      >
                        {childStatus.label}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground hidden lg:inline">
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
