"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { CategoryTree } from "@/components/categories/category-tree";
import { CategoryDetailCard } from "@/components/categories/category-detail-card";
import { CategoryMetricChart } from "@/components/categories/category-metric-chart";
import { Card, CardContent } from "@/components/ui/card";
import { getCategories, getCategoryMetrics } from "@/actions/categories";
import { CATEGORY_COLORS } from "@/lib/constants/categories";
import { FolderTree } from "lucide-react";
import type { Category, CategoryMetric } from "@/lib/types/database";

function getCategoryColor(category: Category): string {
  // 2차 카테고리인 경우 부모 색상 사용
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

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<CategoryMetric[]>([]);
  const [loading, setLoading] = useState(true);

  const selectedCategory = categories.find((c) => c.id === selectedId) ?? null;

  const loadCategories = useCallback(async () => {
    try {
      const data = await getCategories();
      setCategories(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    if (!selectedId) {
      setMetrics([]);
      return;
    }

    const loadMetrics = async () => {
      // 부모 카테고리의 메트릭이 있으면 로드, 2차 카테고리면 부모 메트릭 로드
      const category = categories.find((c) => c.id === selectedId);
      if (!category) return;

      const metricCategoryId =
        category.tier === "secondary" && category.parent_id
          ? category.parent_id
          : category.id;

      const data = await getCategoryMetrics(metricCategoryId);
      setMetrics(data);
    };

    loadMetrics();
  }, [selectedId, categories]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
  };

  const handleUpdated = () => {
    loadCategories();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="카테고리 관리"
          description="블로그 카테고리 구조 및 성과 관리"
        />
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
          로딩 중...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="카테고리 관리"
        description="블로그 카테고리 구조 및 성과 관리"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 왼쪽: 카테고리 트리 */}
        <div className="lg:col-span-1">
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                카테고리 구조
              </h3>
              <CategoryTree
                categories={categories}
                selectedId={selectedId}
                onSelect={handleSelect}
              />
            </CardContent>
          </Card>
        </div>

        {/* 오른쪽: 상세 + 차트 */}
        <div className="lg:col-span-2 space-y-4">
          {selectedCategory ? (
            <>
              <CategoryDetailCard
                key={selectedCategory.id}
                category={selectedCategory}
                onUpdated={handleUpdated}
              />
              <CategoryMetricChart
                metrics={metrics}
                categoryColor={getCategoryColor(selectedCategory)}
              />
            </>
          ) : (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={<FolderTree className="h-6 w-6" />}
                  title="카테고리를 선택하세요"
                  description="왼쪽 트리에서 카테고리를 선택하면 상세 정보와 성과 데이터를 확인할 수 있습니다."
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
