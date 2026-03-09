import { getLeads, getLeadProfiles, getLeadContents } from "@/actions/leads";
import { PageHeader } from "@/components/common/page-header";
import { KPICard } from "@/components/common/kpi-card";
import { LeadTable } from "@/components/leads/lead-table";
import { LeadForm } from "@/components/leads/lead-form";
import { PipelineChart } from "@/components/leads/pipeline-chart";
import { Users, TrendingUp, FileCheck, DollarSign } from "lucide-react";

export default async function LeadsPage() {
  const [
    { data: leads },
    { data: profiles },
    { data: contents },
  ] = await Promise.all([
    getLeads(),
    getLeadProfiles(),
    getLeadContents(),
  ]);

  // KPI 계산
  const totalLeads = leads.length;

  const s3Count = leads.filter((l) => l.visitor_status === "S3").length;
  const s4Count = leads.filter((l) => l.visitor_status === "S4").length;
  const s5Count = leads.filter((l) => l.visitor_status === "S5").length;

  // 상담 전환율: S4 이상 도달 / 전체 리드
  const reachedS4 = s4Count + s5Count;
  const consultationRate = totalLeads > 0
    ? Math.round((reachedS4 / totalLeads) * 100)
    : 0;

  // 계약 전환율: S5 도달 / S4 이상 도달
  const contractRate = reachedS4 > 0
    ? Math.round((s5Count / reachedS4) * 100)
    : 0;

  // 누적 계약금액
  const totalContractAmount = leads
    .filter((l) => l.contract_yn && l.contract_amount)
    .reduce((sum, l) => sum + (l.contract_amount ?? 0), 0);

  const formattedAmount = new Intl.NumberFormat("ko-KR").format(totalContractAmount) + "원";

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <PageHeader
        title="리드 추적"
        description="블로그를 통해 유입된 리드를 관리하고 전환 성과를 추적합니다."
      >
        <LeadForm profiles={profiles} contents={contents} />
      </PageHeader>

      {/* KPI 카드 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="총 리드 수"
          value={totalLeads}
          icon={<Users className="h-4 w-4" />}
        />
        <KPICard
          title="상담 전환율 (S3→S4)"
          value={`${consultationRate}%`}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KPICard
          title="계약 전환율 (S4→S5)"
          value={`${contractRate}%`}
          icon={<FileCheck className="h-4 w-4" />}
        />
        <KPICard
          title="누적 계약금액"
          value={formattedAmount}
          icon={<DollarSign className="h-4 w-4" />}
        />
      </div>

      {/* 파이프라인 + 유입경로 차트 */}
      <PipelineChart leads={leads} />

      {/* 리드 테이블 */}
      <LeadTable leads={leads} profiles={profiles} contents={contents} />
    </div>
  );
}
