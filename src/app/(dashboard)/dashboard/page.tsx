import { PageHeader } from "@/components/common/page-header";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { WeeklyTasks } from "@/components/dashboard/weekly-tasks";
import { SlaAlerts } from "@/components/dashboard/sla-alerts";
import { RecentLeads } from "@/components/dashboard/recent-leads";

export const metadata = {
  title: "대시보드 | 디딤 블로그 운영 시스템",
};

/** 대시보드 메인 페이지 — 블로그 운영 현황 한눈에 보기 */
export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <PageHeader
        title="대시보드"
        description="블로그 운영 현황을 한눈에 확인하세요"
      />

      {/* KPI 카드 그리드 */}
      <KpiCards />

      {/* 하단 2열 레이아웃: 할 일 + SLA | 최근 리드 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 왼쪽 열: 이번 주 할 일 + SLA 알림 */}
        <div className="space-y-6">
          <WeeklyTasks />
          <SlaAlerts />
        </div>

        {/* 오른쪽 열: 최근 리드 */}
        <RecentLeads />
      </div>
    </div>
  );
}
