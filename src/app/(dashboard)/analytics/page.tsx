import { PageHeader } from "@/components/common/page-header";
import { KPICard } from "@/components/common/kpi-card";
import { KpiTrendChart } from "@/components/analytics/kpi-trend-chart";
import { QualityRanking } from "@/components/analytics/quality-ranking";
import { CategoryComparison } from "@/components/analytics/category-comparison";
import {
  getMonthlyKPI,
  getContentRankings,
  getCategoryMetrics,
  getAnalyticsSummary,
} from "@/actions/analytics";
import { Eye, Clock, FileText, TrendingUp } from "lucide-react";

export default async function AnalyticsPage() {
  const [kpiResult, rankingsResult, categoryResult, summaryResult] =
    await Promise.all([
      getMonthlyKPI(),
      getContentRankings(),
      getCategoryMetrics(),
      getAnalyticsSummary(),
    ]);

  const summary = summaryResult.data;

  const formatDuration = (seconds: number): string => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    if (min === 0) return `${sec}초`;
    return `${min}분 ${sec}초`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="성과 분석"
        description="콘텐츠 성과 및 KPI 분석"
      />

      {/* KPI 요약 카드 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="이번 달 조회수"
          value={summary.totalViews.toLocaleString()}
          change={summary.totalViewsChange}
          changeLabel="전월 대비"
          icon={<Eye className="h-4 w-4" />}
        />
        <KPICard
          title="평균 체류시간"
          value={formatDuration(summary.avgDuration)}
          change={summary.avgDurationChange}
          changeLabel="전월 대비"
          icon={<Clock className="h-4 w-4" />}
        />
        <KPICard
          title="발행 건수"
          value={`${summary.publishedCount}건`}
          change={summary.publishedCountChange}
          changeLabel="전월 대비"
          icon={<FileText className="h-4 w-4" />}
        />
        <KPICard
          title="전환율"
          value={`${summary.conversionRate.toFixed(2)}%`}
          change={summary.conversionRateChange}
          changeLabel="전월 대비"
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      {/* KPI 트렌드 차트 */}
      <KpiTrendChart data={kpiResult.data} />

      {/* 품질 랭킹 + 카테고리 비교 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <QualityRanking data={rankingsResult.data} />
        <CategoryComparison data={categoryResult.data} />
      </div>
    </div>
  );
}
