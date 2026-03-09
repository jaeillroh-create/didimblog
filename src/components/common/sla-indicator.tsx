"use client";

import { cn } from "@/lib/utils";
import { Clock, AlertTriangle, CheckCircle2, CalendarClock } from "lucide-react";

type SLAStatus = "on-track" | "warning" | "overdue" | "future";

interface SLAConfig {
  label: string;
  className: string;
  icon: React.ElementType;
}

const SLA_CONFIG: Record<SLAStatus, SLAConfig> = {
  "on-track": {
    label: "정상",
    className: "text-sla-on-track",
    icon: CheckCircle2,
  },
  warning: {
    label: "주의",
    className: "text-sla-warning",
    icon: AlertTriangle,
  },
  overdue: {
    label: "초과",
    className: "text-sla-overdue",
    icon: Clock,
  },
  future: {
    label: "미래",
    className: "text-muted-foreground",
    icon: CalendarClock,
  },
};

function calculateSLAStatus(dueDate: string, currentDate: string): { status: SLAStatus; daysRemaining: number } {
  const due = new Date(dueDate);
  const now = new Date(currentDate);
  // 날짜 차이 계산 (일 단위)
  const diffMs = due.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0) return { status: "overdue", daysRemaining };
  if (daysRemaining <= 1) return { status: "warning", daysRemaining };
  if (daysRemaining > 30) return { status: "future", daysRemaining };
  return { status: "on-track", daysRemaining };
}

interface SLAIndicatorProps {
  /** 마감일 (ISO 날짜 문자열) */
  dueDate: string;
  /** 기준 날짜 — 미지정 시 현재 시각 */
  currentDate?: string;
}

/**
 * SLA 마감일까지 남은 기간을 아이콘·텍스트·프로그레스 바로 표시하는 컴포넌트
 */
export function SLAIndicator({ dueDate, currentDate }: SLAIndicatorProps) {
  const now = currentDate ?? new Date().toISOString();
  const { status, daysRemaining } = calculateSLAStatus(dueDate, now);
  const config = SLA_CONFIG[status];
  const Icon = config.icon;

  // 프로그레스 바 비율 계산 (최대 14일 기준)
  const progressMax = 14;
  const progressValue = Math.max(0, Math.min(progressMax, daysRemaining));
  const progressPercent = status === "overdue" ? 100 : (1 - progressValue / progressMax) * 100;

  const daysText =
    status === "overdue"
      ? `${Math.abs(daysRemaining)}일 초과`
      : daysRemaining === 0
        ? "오늘 마감"
        : `${daysRemaining}일 남음`;

  return (
    <div className="flex items-center gap-2">
      <Icon className={cn("h-4 w-4 shrink-0", config.className)} />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className={cn("text-xs font-medium whitespace-nowrap", config.className)}>
          {daysText}
        </span>
        {/* 진행률 바 */}
        <div className="h-1 w-16 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              status === "on-track" && "bg-sla-on-track",
              status === "warning" && "bg-sla-warning",
              status === "overdue" && "bg-sla-overdue",
              status === "future" && "bg-muted-foreground/40"
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
