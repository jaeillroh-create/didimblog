import { KPICard } from "@/components/common/kpi-card";
import {
  FileText,
  Eye,
  Award,
  Users,
  Database,
} from "lucide-react";
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
        icon={<BarChartIcon />}
        title="아직 데이터가 없습니다"
        description="콘텐츠를 발행하고 리드를 등록하면 KPI가 여기에 표시됩니다."
      />
    );
  }

  const kpiData = [
    {
      title: "이번 주 발행",
      value: `${kpi.weeklyPublished}/${kpi.weeklyTarget}건`,
      icon: <FileText className="h-4 w-4" />,
      change: undefined,
    },
    {
      title: "월간 조회수",
      value: kpi.monthlyViews > 0 ? kpi.monthlyViews.toLocaleString() : "-",
      icon: <Eye className="h-4 w-4" />,
      change: kpi.monthlyViewsChange ?? undefined,
      changeLabel: "전월 대비",
    },
    {
      title: "평균 품질점수",
      value: kpi.avgQualityScore !== null ? `${kpi.avgQualityScore}점` : "-",
      icon: <Award className="h-4 w-4" />,
      change: kpi.avgQualityChange ?? undefined,
      changeLabel: "전월 대비",
    },
    {
      title: "활성 리드",
      value: `${kpi.activeLeads}건`,
      icon: <Users className="h-4 w-4" />,
      change: kpi.activeLeadsChange ?? undefined,
      changeLabel: "전월 대비",
    },
    {
      title: "총 콘텐츠",
      value: `${kpi.totalContents}건`,
      icon: <Database className="h-4 w-4" />,
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

function BarChartIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" x2="12" y1="20" y2="10" />
      <line x1="18" x2="18" y1="20" y2="4" />
      <line x1="6" x2="6" y1="20" y2="16" />
    </svg>
  );
}
