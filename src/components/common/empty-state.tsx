import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  /** 중앙 아이콘 — 미지정 시 기본 아이콘 */
  icon?: React.ReactNode;
  /** 제목 */
  title: string;
  /** 부가 설명 */
  description?: string;
  /** 액션 버튼 등 추가 요소 */
  action?: React.ReactNode;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * 데이터가 없을 때 표시하는 빈 상태 컴포넌트
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 text-center",
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
