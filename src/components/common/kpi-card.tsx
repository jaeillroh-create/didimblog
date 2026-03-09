"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface KPICardProps {
  /** 지표 제목 */
  title: string;
  /** 지표 값 */
  value: string | number;
  /** 변동률 (퍼센트, 양수=증가, 음수=감소) */
  change?: number;
  /** 변동 기간 라벨 (예: "전월 대비") */
  changeLabel?: string;
  /** 좌측 상단 아이콘 */
  icon?: React.ReactNode;
}

/**
 * KPI 수치를 카드 형태로 표시하는 컴포넌트
 */
export function KPICard({ title, value, change, changeLabel, icon }: KPICardProps) {
  const isPositive = change !== undefined && change >= 0;
  const isNegative = change !== undefined && change < 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {change !== undefined && (
          <div className="mt-1 flex items-center gap-1 text-xs">
            {isPositive && <TrendingUp className="h-3 w-3 text-semantic-success" />}
            {isNegative && <TrendingDown className="h-3 w-3 text-semantic-error" />}
            <span
              className={cn(
                "font-medium",
                isPositive && "text-semantic-success",
                isNegative && "text-semantic-error"
              )}
            >
              {isPositive ? "+" : ""}
              {change.toFixed(1)}%
            </span>
            {changeLabel && (
              <span className="text-muted-foreground">{changeLabel}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
