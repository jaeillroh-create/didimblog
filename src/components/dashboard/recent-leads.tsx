import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/empty-state";
import { getDashboardRecentLeads } from "@/actions/dashboard";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

/** 상태별 배지 스타일 */
const STATUS_CONFIG: Record<string, { label: string; style: string }> = {
  S3: { label: "상담대기", style: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
  S4: { label: "제안발송", style: "bg-amber-100 text-amber-700 hover:bg-amber-100" },
  S5: { label: "계약완료", style: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" },
};

const SERVICE_LABELS: Record<string, string> = {
  tax_consulting: "절세컨설팅",
  lab_management: "연구소 관리",
  venture_cert: "벤처인증",
  invention_cert: "발명진흥",
  patent: "특허출원",
  other: "기타",
};

/** 최근 리드 테이블 카드 — Supabase 데이터 */
export async function RecentLeads() {
  const leads = await getDashboardRecentLeads();

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">최근 리드</CardTitle>
      </CardHeader>
      <CardContent>
        {leads.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="아직 리드가 없습니다"
            description="블로그를 통해 유입된 리드가 여기에 표시됩니다."
            className="py-8"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>회사명</TableHead>
                <TableHead>관심 서비스</TableHead>
                <TableHead>연락일</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => {
                const config = STATUS_CONFIG[lead.visitor_status] ?? {
                  label: lead.visitor_status,
                  style: "bg-gray-100 text-gray-700",
                };
                return (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">
                      {lead.company_name}
                    </TableCell>
                    <TableCell>
                      {lead.interested_service
                        ? SERVICE_LABELS[lead.interested_service] ?? lead.interested_service
                        : "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {lead.contact_date}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn("border-none font-medium", config.style)}
                      >
                        {config.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
