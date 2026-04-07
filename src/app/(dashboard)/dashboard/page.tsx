import { PageHeader } from "@/components/common/page-header";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { WeeklyTasks } from "@/components/dashboard/weekly-tasks";
import { SlaAlerts } from "@/components/dashboard/sla-alerts";
import { RecentLeads } from "@/components/dashboard/recent-leads";
import { DashboardWidgets } from "./dashboard-widgets";
import {
  getWeeklyRecommendations,
  getMonthlyPublishProgress,
  getMonthlySummary,
  getUpdateNeededPosts,
  getTopPerformingPosts,
} from "@/actions/recommendations";
import { getCategories } from "@/actions/contents";
import { getLLMConfigs } from "@/actions/ai";
import { getRecentNews } from "@/actions/news-search";

export const metadata = {
  title: "대시보드 | 디딤 블로그 운영 시스템",
};

/** 대시보드 메인 페이지 — 블로그 운영 현황 한눈에 보기 */
export default async function DashboardPage() {
  // 병렬 데이터 로드
  const [
    recommendations,
    publishProgress,
    monthlySummary,
    updateNeeded,
    topPosts,
    categoriesResult,
    llmResult,
    newsItems,
  ] = await Promise.all([
    getWeeklyRecommendations(),
    getMonthlyPublishProgress(),
    getMonthlySummary(),
    getUpdateNeededPosts(),
    getTopPerformingPosts(),
    getCategories(),
    getLLMConfigs(),
    getRecentNews(5),
  ]);

  const now = new Date();
  const monthLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <PageHeader
        title="대시보드"
        description={`블로그 운영 현황을 한눈에 확인하세요 — ${monthLabel}`}
      />

      {/* 이번 주 추천 + 월간 발행 현황 (최상단) */}
      <DashboardWidgets
        recommendations={recommendations}
        publishProgress={publishProgress}
        monthlySummary={monthlySummary}
        updateNeeded={updateNeeded}
        topPosts={topPosts}
        categories={categoriesResult.data}
        llmConfigs={llmResult.data}
        newsItems={newsItems}
      />

      {/* KPI 카드 그리드 (기존) */}
      <KpiCards />

      {/* 하단 2열 레이아웃: 할 일 + SLA | 최근 리드 (기존) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <WeeklyTasks />
          <SlaAlerts />
        </div>
        <RecentLeads />
      </div>
    </div>
  );
}
