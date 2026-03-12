"use client";

import { cn } from "@/lib/utils";

interface KPICardProps {
  /** 지표 제목 */
  title: string;
  /** 지표 값 */
  value: string | number;
  /** 변동률 (퍼센트, 양수=증가, 음수=감소) */
  change?: number;
  /** 변동 기간 라벨 (예: "전월 대비") */
  changeLabel?: string;
  /** 이모지 아이콘 */
  icon?: React.ReactNode;
  /** 값 색상 (CSS var) */
  valueColor?: string;
}

/**
 * KPI 수치를 StatCard 패턴으로 표시하는 컴포넌트
 * Universal Component Library StatCard 패턴 적용
 */
export function KPICard({ title, value, change, changeLabel, icon, valueColor }: KPICardProps) {
  const isPositive = change !== undefined && change >= 0;
  const isNegative = change !== undefined && change < 0;

  return (
    <div className="card-default card-hover">
      <div className="stat-label">
        {icon}
        <span>{title}</span>
      </div>
      <div
        className="stat-value"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </div>
      {change !== undefined && (
        <div className="stat-sub flex items-center gap-1">
          <span
            className={cn(
              "font-medium font-num",
              isPositive && "text-success",
              isNegative && "text-danger"
            )}
          >
            {isPositive ? "+" : ""}
            {change.toFixed(1)}%
          </span>
          {changeLabel && <span>{changeLabel}</span>}
        </div>
      )}
    </div>
  );
}
