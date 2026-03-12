import { EmptyState } from "@/components/common/empty-state";
import { getDashboardTasks } from "@/actions/dashboard";

/** 상태별 UCL 배지 클래스 매핑 */
const STATUS_BADGE: Record<string, string> = {
  "기획": "ucl-badge ucl-badge-sm badge-neutral",
  "초안 작성": "ucl-badge ucl-badge-sm badge-info",
  "검토 중": "ucl-badge ucl-badge-sm badge-warning",
  "발행 예정": "ucl-badge ucl-badge-sm badge-success",
};

/** 진행 중인 콘텐츠 목록 — Supabase 데이터, SectionCard 패턴 */
export async function WeeklyTasks() {
  const tasks = await getDashboardTasks();

  return (
    <div className="scard">
      <div className="scard-head">
        <div className="scard-head-left">
          <div className="scard-head-icon" style={{ background: "var(--info-light)" }}>
            <span className="tf tf-14">📋</span>
          </div>
          <span className="scard-head-title">진행 중인 콘텐츠</span>
        </div>
        {tasks.length > 0 && (
          <span className="t-xs" style={{ color: "var(--g400)" }}>
            {tasks.length}건
          </span>
        )}
      </div>
      <div className="scard-body">
        {tasks.length === 0 ? (
          <EmptyState
            icon={<span className="tf tf-14">📋</span>}
            title="진행 중인 콘텐츠가 없습니다"
            description="새 콘텐츠를 기획하면 여기에 표시됩니다."
            className="py-8"
          />
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3">
                <span
                  className="flex-1 t-sm truncate"
                  style={{ color: "var(--g900)" }}
                >
                  {task.label}
                </span>
                <span
                  className={STATUS_BADGE[task.status] ?? "ucl-badge ucl-badge-sm badge-neutral"}
                >
                  {task.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
