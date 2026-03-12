"use client";

import { cn } from "@/lib/utils";

type SLAStatus = "on-track" | "warning" | "overdue" | "future";

interface SLAConfig {
  label: string;
  emoji: string;
  color: string;
  trackColor: string;
}

const SLA_CONFIG: Record<SLAStatus, SLAConfig> = {
  "on-track": {
    label: "정상",
    emoji: "✅",
    color: "var(--success)",
    trackColor: "var(--success)",
  },
  warning: {
    label: "주의",
    emoji: "⚠️",
    color: "var(--warning)",
    trackColor: "var(--warning)",
  },
  overdue: {
    label: "초과",
    emoji: "❌",
    color: "var(--danger)",
    trackColor: "var(--danger)",
  },
  future: {
    label: "미래",
    emoji: "📅",
    color: "var(--g400)",
    trackColor: "var(--g300)",
  },
};

function calculateSLAStatus(dueDate: string, currentDate: string): { status: SLAStatus; daysRemaining: number } {
  const due = new Date(dueDate);
  const now = new Date(currentDate);
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
 * SLA 마감일까지 남은 기간을 Tossface 이모지 + 프로그레스 바로 표시
 * UCL Progress + Emoji 패턴 적용
 */
export function SLAIndicator({ dueDate, currentDate }: SLAIndicatorProps) {
  const now = currentDate ?? new Date().toISOString();
  const { status, daysRemaining } = calculateSLAStatus(dueDate, now);
  const config = SLA_CONFIG[status];

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
      <span className="tf tf-14">{config.emoji}</span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span
          className="t-xs font-medium whitespace-nowrap"
          style={{ color: config.color }}
        >
          {daysText}
        </span>
        <div className="progress-track progress-track-sm" style={{ width: "64px" }}>
          <div
            className="progress-fill"
            style={{
              width: `${progressPercent}%`,
              background: config.trackColor,
            }}
          />
        </div>
      </div>
    </div>
  );
}
