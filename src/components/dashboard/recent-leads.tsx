import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import { getDashboardRecentLeads } from "@/actions/dashboard";

/** 상태별 UCL 배지 클래스 매핑 */
const STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  S3: { label: "상담대기", badgeClass: "ucl-badge ucl-badge-sm badge-info" },
  S4: { label: "제안발송", badgeClass: "ucl-badge ucl-badge-sm badge-warning" },
  S5: { label: "계약완료", badgeClass: "ucl-badge ucl-badge-sm badge-success" },
};

const SERVICE_LABELS: Record<string, string> = {
  tax_consulting: "절세컨설팅",
  lab_management: "연구소 관리",
  venture_cert: "벤처인증",
  invention_cert: "발명진흥",
  patent: "특허출원",
  other: "기타",
};

/** 최근 리드 테이블 카드 — Supabase 데이터, SectionCard 패턴 */
export async function RecentLeads() {
  const leads = await getDashboardRecentLeads();

  return (
    <div className="scard h-full">
      <div className="scard-head">
        <div className="scard-head-left">
          <div className="scard-head-icon" style={{ background: "var(--brand-light)" }}>
            <span className="tf tf-14">👥</span>
          </div>
          <span className="scard-head-title">최근 리드</span>
        </div>
        {leads.length > 0 && (
          <span className="t-xs" style={{ color: "var(--g400)" }}>
            {leads.length}건
          </span>
        )}
      </div>
      <div className="scard-body">
        {leads.length === 0 ? (
          <EmptyState
            icon={<span className="tf tf-14">👥</span>}
            title="아직 리드가 없습니다"
            description="블로그를 통해 유입된 리드가 여기에 표시됩니다."
            className="py-8"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={{ color: "var(--g500)" }}>회사명</TableHead>
                <TableHead style={{ color: "var(--g500)" }}>관심 서비스</TableHead>
                <TableHead style={{ color: "var(--g500)" }}>연락일</TableHead>
                <TableHead style={{ color: "var(--g500)" }}>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => {
                const config = STATUS_CONFIG[lead.visitor_status] ?? {
                  label: lead.visitor_status,
                  badgeClass: "ucl-badge ucl-badge-sm badge-neutral",
                };
                return (
                  <TableRow key={lead.id}>
                    <TableCell
                      className="font-medium"
                      style={{ color: "var(--g900)" }}
                    >
                      {lead.company_name}
                    </TableCell>
                    <TableCell style={{ color: "var(--g700)" }}>
                      {lead.interested_service
                        ? SERVICE_LABELS[lead.interested_service] ?? lead.interested_service
                        : "-"}
                    </TableCell>
                    <TableCell style={{ color: "var(--g400)" }}>
                      {lead.contact_date}
                    </TableCell>
                    <TableCell>
                      <span className={config.badgeClass}>
                        {config.label}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
