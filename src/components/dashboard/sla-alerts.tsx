import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { getDashboardSlaAlerts } from "@/actions/dashboard";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/** 상태별 스타일 매핑 */
const statusStyles = {
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
} as const;

/** SLA 알림 카드 — Supabase 데이터 */
export async function SlaAlerts() {
  const alerts = await getDashboardSlaAlerts();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">SLA 알림</CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-6 w-6" />}
            title="SLA 알림이 없습니다"
            description="진행 중인 콘텐츠의 SLA 현황이 여기에 표시됩니다."
            className="py-8"
          />
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => {
              const style = statusStyles[alert.status];
              return (
                <div
                  key={alert.id}
                  className="flex items-center gap-3 rounded-md border p-3"
                >
                  <span
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      style.dot
                    )}
                  />
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold",
                      style.badge
                    )}
                  >
                    {alert.statusLabel}
                  </span>
                  <span className="font-medium truncate flex-1">{alert.content}</span>
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
