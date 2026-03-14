import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** 페이지 제목 */
  title: React.ReactNode;
  /** 부가 설명 */
  description?: string;
  /** 우측 액션 영역 (버튼 등) — actions 또는 children 사용 가능 */
  actions?: React.ReactNode;
  children?: React.ReactNode;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * 페이지 상단 헤더 — 좌측에 제목·설명, 우측에 액션 버튼 배치
 * UCL 타이포그래피 t-2xl 적용
 */
export function PageHeader({ title, description, actions, children, className }: PageHeaderProps) {
  const rightContent = actions || children;
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="t-2xl text-g-900">{title}</h1>
          {description && (
            <p className="t-md text-g-400">{description}</p>
          )}
        </div>
        {rightContent && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{rightContent}</div>
        )}
      </div>
      <div className="divider" />
    </div>
  );
}
