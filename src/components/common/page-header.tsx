import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** 페이지 제목 */
  title: string;
  /** 부가 설명 */
  description?: string;
  /** 우측 액션 영역 (버튼 등) */
  children?: React.ReactNode;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * 페이지 상단 헤더 — 좌측에 제목·설명, 우측에 액션 버튼 배치
 */
export function PageHeader({ title, description, children, className }: PageHeaderProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {children && (
          <div className="flex shrink-0 items-center gap-2">{children}</div>
        )}
      </div>
      <Separator />
    </div>
  );
}
