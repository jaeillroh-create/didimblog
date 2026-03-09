import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { getDashboardTasks } from "@/actions/dashboard";
import { ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

/** 진행 중인 콘텐츠 목록 — Supabase 데이터 */
export async function WeeklyTasks() {
  const tasks = await getDashboardTasks();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            진행 중인 콘텐츠
          </CardTitle>
          {tasks.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {tasks.length}건
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-6 w-6" />}
            title="진행 중인 콘텐츠가 없습니다"
            description="새 콘텐츠를 기획하면 여기에 표시됩니다."
            className="py-8"
          />
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3">
                <span className="flex-1 text-sm truncate">{task.label}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                    task.status === "기획" && "bg-gray-100 text-gray-500",
                    task.status === "초안 작성" && "bg-blue-100 text-blue-700",
                    task.status === "검토 중" && "bg-amber-100 text-amber-700",
                    task.status === "발행 예정" && "bg-emerald-100 text-emerald-700"
                  )}
                >
                  {task.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
