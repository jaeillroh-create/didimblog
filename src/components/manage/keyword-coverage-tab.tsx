"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import type { KeywordCoverageItem } from "@/actions/manage";
import { Map, CheckCircle, Circle, ExternalLink } from "lucide-react";
import Link from "next/link";

interface KeywordCoverageTabProps {
  coverage: KeywordCoverageItem[];
  stats: { total: number; covered: number; uncovered: number };
}

const CATEGORY_LABELS: Record<string, string> = {
  "CAT-A": "변리사의 현장 수첩",
  "CAT-B": "IP 라운지",
  "CAT-C": "디딤 다이어리",
};

const PRIORITY_BADGE: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  LOW: "bg-gray-100 text-gray-600",
};

export function KeywordCoverageTab({ coverage, stats }: KeywordCoverageTabProps) {
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const filtered = coverage.filter((item) => {
    if (filterCategory !== "all" && item.keyword.category_id !== filterCategory)
      return false;
    if (filterStatus === "covered" && !item.coveredContent) return false;
    if (filterStatus === "uncovered" && item.coveredContent) return false;
    return true;
  });

  // 카테고리별 그룹핑
  const grouped: Record<string, KeywordCoverageItem[]> = {};
  for (const item of filtered) {
    const cat = item.keyword.category_id;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  const coveragePercent =
    stats.total > 0 ? Math.round((stats.covered / stats.total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* 요약 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-muted-foreground">전체 키워드</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">커버됨</p>
                <p className="text-2xl font-bold text-green-600">
                  {stats.covered}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">미커버</p>
                <p className="text-2xl font-bold text-red-600">
                  {stats.uncovered}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold">{coveragePercent}%</p>
              <p className="text-xs text-muted-foreground">커버리지</p>
            </div>
          </div>
          {/* 프로그레스 바 */}
          <div className="mt-3 w-full h-3 rounded-full bg-gray-100">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${coveragePercent}%`,
                background:
                  coveragePercent >= 80
                    ? "var(--success, #22c55e)"
                    : coveragePercent >= 50
                      ? "var(--brand, #1B3A5C)"
                      : "#ef4444",
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* 필터 */}
      <div className="flex gap-2 flex-wrap">
        <select
          className="text-sm border rounded-md px-3 py-1.5"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="all">전체 카테고리</option>
          <option value="CAT-A">변리사의 현장 수첩</option>
          <option value="CAT-B">IP 라운지</option>
          <option value="CAT-C">디딤 다이어리</option>
        </select>
        <select
          className="text-sm border rounded-md px-3 py-1.5"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">전체 상태</option>
          <option value="covered">커버됨</option>
          <option value="uncovered">미커버</option>
        </select>
      </div>

      {/* 카테고리별 키워드 목록 */}
      {Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<Map className="h-8 w-8 text-muted-foreground" />}
              title="키워드가 없습니다"
              description="키워드 풀에 키워드를 등록하세요."
            />
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([catId, items]) => (
            <Card key={catId}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {CATEGORY_LABELS[catId] ?? catId}
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    ({items.filter((i) => i.coveredContent).length}/
                    {items.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.keyword.id}
                      className="flex items-center justify-between py-1.5 border-b last:border-0"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {item.coveredContent ? (
                          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                        ) : (
                          <Circle className="h-4 w-4 text-gray-300 shrink-0" />
                        )}
                        <span className="text-sm truncate">
                          {item.keyword.keyword}
                        </span>
                        <span
                          className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_BADGE[item.keyword.priority]}`}
                        >
                          {item.keyword.priority}
                        </span>
                      </div>
                      {item.coveredContent ? (
                        <Link
                          href={`/contents/${item.coveredContent.id}`}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0 ml-2"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {item.coveredContent.title.slice(0, 20)}
                          {item.coveredContent.title.length > 20 ? "..." : ""}
                        </Link>
                      ) : (
                        <span className="text-xs text-red-500 shrink-0 ml-2">
                          미커버
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
      )}
    </div>
  );
}
