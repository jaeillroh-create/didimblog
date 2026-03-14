import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import type { MonthlySummary } from "@/actions/recommendations";
import { TrendingUp, Eye, MessageCircle, FileCheck } from "lucide-react";

interface MonthlySummaryCardProps {
  summary: MonthlySummary;
}

export function MonthlySummaryCard({ summary }: MonthlySummaryCardProps) {
  const isEmpty =
    summary.totalViews === 0 &&
    summary.consultations === 0 &&
    summary.contracts === 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          월간 성과 요약
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <EmptyState
            icon={<TrendingUp className="h-8 w-8 text-muted-foreground" />}
            title="성과 데이터가 없습니다"
            description="발행 후 성과가 여기에 표시됩니다"
          />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50/50">
              <Eye className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <div>
                <p className="text-sm text-muted-foreground">총 조회수</p>
                <p className="text-lg font-bold">
                  {summary.totalViews.toLocaleString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50/50">
              <MessageCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-sm text-muted-foreground">상담 문의</p>
                <p className="text-lg font-bold">{summary.consultations}건</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-50/50">
              <FileCheck className="h-5 w-5 text-purple-600 flex-shrink-0" />
              <div>
                <p className="text-sm text-muted-foreground">계약 체결</p>
                <p className="text-lg font-bold">{summary.contracts}건</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
