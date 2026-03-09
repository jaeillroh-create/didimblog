"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/** 할 일 항목 타입 */
interface TaskItem {
  id: string;
  label: string;
  status: string;
  completed: boolean;
}

/** 더미 데이터: 이번 주 할 일 */
const initialTasks: TaskItem[] = [
  {
    id: "task-1",
    label: "현장수첩 #47 초안 작성",
    status: "완료",
    completed: true,
  },
  {
    id: "task-2",
    label: "'특허 출원 비용' 키워드 글 기획",
    status: "진행중",
    completed: false,
  },
  {
    id: "task-3",
    label: "IP라운지 #12 SEO 최적화",
    status: "대기",
    completed: false,
  },
  {
    id: "task-4",
    label: "3월 2주차 성과 리포트 작성",
    status: "대기",
    completed: false,
  },
  {
    id: "task-5",
    label: "디딤 다이어리 #8 검수 요청",
    status: "대기",
    completed: false,
  },
];

/** 이번 주 할 일 체크리스트 */
export function WeeklyTasks() {
  const [tasks, setTasks] = useState<TaskItem[]>(initialTasks);

  /** 체크박스 토글 핸들러 */
  const handleToggle = (taskId: string) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, completed: !task.completed } : task
      )
    );
  };

  const completedCount = tasks.filter((t) => t.completed).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            이번 주 할 일
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {completedCount}/{tasks.length} 완료
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-3">
            <Checkbox
              id={task.id}
              checked={task.completed}
              onCheckedChange={() => handleToggle(task.id)}
            />
            <label
              htmlFor={task.id}
              className={cn(
                "flex-1 cursor-pointer text-sm",
                task.completed && "text-muted-foreground line-through"
              )}
            >
              {task.label}
            </label>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                task.status === "완료" &&
                  "bg-emerald-100 text-emerald-700",
                task.status === "진행중" &&
                  "bg-blue-100 text-blue-700",
                task.status === "대기" &&
                  "bg-gray-100 text-gray-500"
              )}
            >
              {task.status}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
