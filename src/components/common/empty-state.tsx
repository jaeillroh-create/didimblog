import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Tossface 이모지 (예: "🔍") */
  emoji?: string;
  /** 기존 방식 아이콘 (lucide 등) — emoji보다 우선 */
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
 * UCL EmptyState 패턴 적용
 */
export function EmptyState({ emoji, icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("empty-state", className)}>
      {icon ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-g-100 text-g-400">
          {icon}
        </div>
      ) : (
        <span className="tf tf-48">{emoji ?? "📋"}</span>
      )}
      <div className="empty-state-title">{title}</div>
      {description && (
        <div className="empty-state-desc">{description}</div>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
