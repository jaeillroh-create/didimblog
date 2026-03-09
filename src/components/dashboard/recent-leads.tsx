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
import { cn } from "@/lib/utils";

/** 리드 상태 타입 */
type LeadStatus = "신규" | "연락완료" | "상담예정" | "계약완료";

/** 리드 항목 */
interface LeadItem {
  id: string;
  name: string;
  inquiry: string;
  date: string;
  status: LeadStatus;
}

/** 더미 데이터: 최근 리드 5건 */
const leadsData: LeadItem[] = [
  {
    id: "lead-1",
    name: "김철수",
    inquiry: "특허 출원 상담",
    date: "2024-03-08",
    status: "신규",
  },
  {
    id: "lead-2",
    name: "이영희",
    inquiry: "상표 등록 문의",
    date: "2024-03-07",
    status: "연락완료",
  },
  {
    id: "lead-3",
    name: "박민수",
    inquiry: "PCT 출원 상담",
    date: "2024-03-06",
    status: "상담예정",
  },
  {
    id: "lead-4",
    name: "정수진",
    inquiry: "디자인 출원",
    date: "2024-03-05",
    status: "신규",
  },
  {
    id: "lead-5",
    name: "최동혁",
    inquiry: "특허 침해 분석",
    date: "2024-03-04",
    status: "계약완료",
  },
];

/** 상태별 배지 스타일 */
const statusStyles: Record<LeadStatus, string> = {
  신규: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  연락완료: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  상담예정: "bg-purple-100 text-purple-700 hover:bg-purple-100",
  계약완료: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
};

/** 최근 리드 테이블 카드 */
export function RecentLeads() {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">최근 리드</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>문의 내용</TableHead>
              <TableHead>날짜</TableHead>
              <TableHead>상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leadsData.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell className="font-medium">{lead.name}</TableCell>
                <TableCell>{lead.inquiry}</TableCell>
                <TableCell className="text-muted-foreground">
                  {lead.date}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "border-none font-medium",
                      statusStyles[lead.status]
                    )}
                  >
                    {lead.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
