import { KPICard } from "@/components/common/kpi-card";
import { getDashboardKPI } from "@/actions/dashboard";
import { EmptyState } from "@/components/common/empty-state";

/** 대시보드 상단 KPI 카드 — Supabase 실시간 데이터 */
export async function KpiCards() {
  const kpi = await getDashboardKPI();

  const isEmpty =
    kpi.totalContents === 0 &&
    kpi.activeLeads === 0 &&
    kpi.monthlyViews === 0;

  if (isEmpty) {
    return (
      <EmptyState
        icon={<span className="tf tf-14">📊</span>}
        title="아직 데이터가 없습니다"
        description="콘텐츠를 발행하고 리드를 등록하면 KPI가 여기에 표시됩니다."
      />
    );
  }

  const kpiData = [
    {
      title: "이번 주 발행",
      value: `${kpi.weeklyPublished}/${kpi.weeklyTarget}건`,
      icon: <span className="tf tf-14">📝</span>,
      change: undefined,
    },
    {
      title: "월간 조회수",
      value: kpi.monthlyViews > 0 ? kpi.monthlyViews.toLocaleString() : "-",
      icon: <span className="tf tf-14">👀</span>,
      change: kpi.monthlyViewsChange ?? undefined,
      changeLabel: "전월 대비",
    },
    {
      title: "평균 품질점수",
      value: kpi.avgQualityScore !== null ? `${kpi.avgQualityScore}점` : "-",
      icon: <span className="tf tf-14">⭐</span>,
      change: kpi.avgQualityChange ?? undefined,
      changeLabel: "전월 대비",
    },
    {
      title: "활성 리드",
      value: `${kpi.activeLeads}건`,
      icon: <span className="tf tf-14">👥</span>,
      change: kpi.activeLeadsChange ?? undefined,
      changeLabel: "전월 대비",
    },
    {
      title: "총 콘텐츠",
      value: `${kpi.totalContents}건`,
      icon: <span className="tf tf-14">📋</span>,
      change: undefined,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {kpiData.map((kpi) => (
        <KPICard
          key={kpi.title}
          title={kpi.title}
          value={kpi.value}
          icon={kpi.icon}
          change={kpi.change}
          changeLabel={kpi.changeLabel}
        />
      ))}
    </div>
  );
}
