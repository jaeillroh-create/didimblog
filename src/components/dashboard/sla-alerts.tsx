import { EmptyState } from "@/components/common/empty-state";
import { getDashboardSlaAlerts } from "@/actions/dashboard";

/** 상태별 스타일 매핑 — UCL 시맨틱 토큰 사용 */
const statusStyles = {
  overdue: {
    dotColor: "var(--danger)",
    badgeBg: "var(--danger-light)",
    badgeColor: "var(--danger)",
    textColor: "var(--danger)",
  },
  warning: {
    dotColor: "var(--warning)",
    badgeBg: "var(--warning-light)",
    badgeColor: "var(--warning)",
    textColor: "var(--warning)",
  },
  "on-track": {
    dotColor: "var(--success)",
    badgeBg: "var(--success-light)",
    badgeColor: "var(--success)",
    textColor: "var(--success)",
  },
} as const;

/** SLA 알림 카드 — Supabase 데이터, SectionCard 패턴 */
export async function SlaAlerts() {
  const alerts = await getDashboardSlaAlerts();

  return (
    <div className="scard">
      <div className="scard-head">
        <div className="scard-head-left">
          <div className="scard-head-icon" style={{ background: "var(--danger-light)" }}>
            <span className="tf tf-14">⏰</span>
          </div>
          <span className="scard-head-title">SLA 알림</span>
        </div>
        {alerts.length > 0 && (
          <span className="t-xs" style={{ color: "var(--g400)" }}>
            {alerts.length}건
          </span>
        )}
      </div>
      <div className="scard-body">
        {alerts.length === 0 ? (
          <EmptyState
            icon={<span className="tf tf-14">⏰</span>}
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
                  className="flex items-center gap-3 rounded-md p-3"
                  style={{
                    border: "1px solid var(--g150)",
                  }}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: style.dotColor }}
                  />
                  <span
                    className="ucl-badge ucl-badge-sm"
                    style={{
                      background: style.badgeBg,
                      color: style.badgeColor,
                    }}
                  >
                    {alert.statusLabel}
                  </span>
                  <span
                    className="t-sm font-medium truncate flex-1"
                    style={{ color: "var(--g900)" }}
                  >
                    {alert.content}
                  </span>
                  <span
                    className="ml-auto shrink-0 t-xs font-medium"
                    style={{ color: style.textColor }}
                  >
                    {alert.timeInfo}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
