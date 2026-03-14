"use client";

import { WeeklyRecommendation } from "@/components/dashboard/weekly-recommendation";
import { MonthlyPublish } from "@/components/dashboard/monthly-publish";
import { MonthlySummaryCard } from "@/components/dashboard/monthly-summary";
import { UpdateNeeded } from "@/components/dashboard/update-needed";
import { TopPosts } from "@/components/dashboard/top-posts";
import type { Recommendation } from "@/lib/recommendation-engine";
import type {
  MonthlyPublishProgress,
  MonthlySummary,
  UpdateNeededPost,
  TopPerformingPost,
} from "@/actions/recommendations";
import type { Category, LLMConfig } from "@/lib/types/database";

interface DashboardWidgetsProps {
  recommendations: Recommendation[];
  publishProgress: MonthlyPublishProgress[];
  monthlySummary: MonthlySummary;
  updateNeeded: UpdateNeededPost[];
  topPosts: TopPerformingPost[];
  categories: Category[];
  llmConfigs: LLMConfig[];
}

export function DashboardWidgets({
  recommendations,
  publishProgress,
  monthlySummary,
  updateNeeded,
  topPosts,
  categories,
  llmConfigs,
}: DashboardWidgetsProps) {
  return (
    <div className="space-y-6">
      {/* 상단 2열: 이번 주 추천 | 월간 발행 현황 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <WeeklyRecommendation
          recommendations={recommendations}
          categories={categories}
          llmConfigs={llmConfigs}
        />
        <MonthlyPublish progress={publishProgress} />
      </div>

      {/* 중간 2열: 월간 성과 요약 | 업데이트 필요 글 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MonthlySummaryCard summary={monthlySummary} />
        <UpdateNeeded posts={updateNeeded} />
      </div>

      {/* 하단: TOP 성과 글 (전체 너비) */}
      <TopPosts posts={topPosts} />
    </div>
  );
}
