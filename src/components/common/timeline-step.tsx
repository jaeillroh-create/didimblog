import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface Step {
  /** 단계 라벨 */
  label: string;
  /** 날짜 (선택) */
  date?: string;
  /** 단계 상태 */
  status: "completed" | "current" | "upcoming";
}

interface TimelineStepProps {
  /** 타임라인 단계 목록 */
  steps: Step[];
}

/**
 * 세로 방향 타임라인 컴포넌트 — 완료·현재·예정 상태를 시각적으로 표시
 */
export function TimelineStep({ steps }: TimelineStepProps) {
  return (
    <div className="flex flex-col gap-0" role="list">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;

        return (
          <div key={index} className="flex gap-3" role="listitem">
            {/* 점 + 연결선 */}
            <div className="flex flex-col items-center">
              {/* 점 */}
              <div
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                  step.status === "completed" &&
                    "border-semantic-success bg-semantic-success text-white",
                  step.status === "current" &&
                    "border-semantic-info bg-semantic-info/20 text-semantic-info animate-pulse",
                  step.status === "upcoming" &&
                    "border-muted-foreground/30 bg-muted text-muted-foreground"
                )}
              >
                {step.status === "completed" && <Check className="h-3.5 w-3.5" />}
                {step.status === "current" && (
                  <span className="h-2 w-2 rounded-full bg-semantic-info" />
                )}
                {step.status === "upcoming" && (
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                )}
              </div>
              {/* 연결선 */}
              {!isLast && (
                <div
                  className={cn(
                    "w-0.5 flex-1 min-h-6",
                    step.status === "completed" ? "bg-semantic-success" : "bg-muted"
                  )}
                />
              )}
            </div>
            {/* 텍스트 */}
            <div className={cn("pb-6", isLast && "pb-0")}>
              <p
                className={cn(
                  "text-sm font-medium leading-6",
                  step.status === "upcoming" && "text-muted-foreground"
                )}
              >
                {step.label}
              </p>
              {step.date && (
                <p className="text-xs text-muted-foreground mt-0.5">{step.date}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
