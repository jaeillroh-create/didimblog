import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** SLA 알림 상태 타입 */
type SlaStatus = "overdue" | "warning" | "on-track";

/** SLA 알림 항목 */
interface SlaAlertItem {
  id: string;
  status: SlaStatus;
  statusLabel: string;
  content: string;
  timeInfo: string;
}

/** 더미 데이터: SLA 알림 */
const alertData: SlaAlertItem[] = [
  {
    id: "sla-1",
    status: "overdue",
    statusLabel: "초과",
    content: "현장수첩 #45",
    timeInfo: "검토 SLA 1일 초과",
  },
  {
    id: "sla-2",
    status: "warning",
    statusLabel: "주의",
    content: "IP라운지 #11",
    timeInfo: "발행 SLA 내일 마감",
  },
  {
    id: "sla-3",
    status: "on-track",
    statusLabel: "정상",
    content: "현장수첩 #47",
    timeInfo: "초안 SLA 3일 남음",
  },
];

/** 상태별 스타일 매핑 */
const statusStyles: Record<SlaStatus, { dot: string; text: string; badge: string }> = {
  overdue: {
    dot: "bg-sla-overdue",
    text: "text-sla-overdue",
    badge: "bg-red-50 text-sla-overdue",
  },
  warning: {
    dot: "bg-sla-warning",
    text: "text-sla-warning",
    badge: "bg-amber-50 text-sla-warning",
  },
  "on-track": {
    dot: "bg-sla-on-track",
    text: "text-sla-on-track",
    badge: "bg-emerald-50 text-sla-on-track",
  },
};

/** SLA 알림 카드 */
export function SlaAlerts() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">SLA 알림</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {alertData.map((alert) => {
          const style = statusStyles[alert.status];
          return (
            <div
              key={alert.id}
              className="flex items-center gap-3 rounded-md border p-3"
            >
              {/* 상태 도트 */}
              <span
                className={cn(
                  "h-2.5 w-2.5 shrink-0 rounded-full",
                  style.dot
                )}
              />
              {/* 상태 배지 */}
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold",
                  style.badge
                )}
              >
                {alert.statusLabel}
              </span>
              {/* 콘텐츠 제목 */}
              <span className="font-medium">{alert.content}</span>
              {/* 시간 정보 */}
              <span
                className={cn(
                  "ml-auto shrink-0 text-xs font-medium",
                  style.text
                )}
              >
                {alert.timeInfo}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
