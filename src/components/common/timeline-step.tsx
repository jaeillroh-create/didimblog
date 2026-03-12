import { cn } from "@/lib/utils";

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
 * 세로 방향 타임라인 컴포넌트 — UCL Stepper 패턴 적용
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
              <div
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                  step.status === "completed" &&
                    "border-success bg-success text-white",
                  step.status === "current" &&
                    "border-brand bg-brand-light text-brand animate-pulse",
                  step.status === "upcoming" &&
                    "border-g-200 bg-g-100 text-g-400"
                )}
              >
                {step.status === "completed" && (
                  <span className="tf tf-12">✅</span>
                )}
                {step.status === "current" && (
                  <span className="h-2 w-2 rounded-full bg-brand" />
                )}
                {step.status === "upcoming" && (
                  <span className="h-2 w-2 rounded-full bg-g-300" />
                )}
              </div>
              {!isLast && (
                <div
                  className={cn(
                    "w-0.5 flex-1 min-h-6",
                    step.status === "completed" ? "bg-success" : "bg-g-150"
                  )}
                />
              )}
            </div>
            {/* 텍스트 */}
            <div className={cn("pb-6", isLast && "pb-0")}>
              <p
                className={cn(
                  "t-md leading-6",
                  step.status === "upcoming" ? "text-g-400" : "text-g-900 font-semibold"
                )}
              >
                {step.label}
              </p>
              {step.date && (
                <p className="t-xs text-g-400 mt-0.5">{step.date}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
