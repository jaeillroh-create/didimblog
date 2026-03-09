import { cn } from "@/lib/utils";

interface LoadingSkeletonProps {
  /** 스켈레톤 변형 */
  variant?: "card" | "table" | "list" | "kanban";
  /** 반복 횟수 */
  count?: number;
  /** 추가 CSS 클래스 */
  className?: string;
}

/** 개별 스켈레톤 블록 */
function Bone({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

/** 카드 형태 스켈레톤 */
function CardSkeleton() {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <Bone className="h-4 w-2/3" />
      <Bone className="h-3 w-full" />
      <Bone className="h-3 w-4/5" />
      <div className="flex gap-2 pt-1">
        <Bone className="h-5 w-14 rounded-full" />
        <Bone className="h-5 w-14 rounded-full" />
      </div>
    </div>
  );
}

/** 테이블 행 스켈레톤 */
function TableSkeleton({ count }: { count: number }) {
  return (
    <div className="rounded-lg border overflow-hidden">
      {/* 헤더 */}
      <div className="flex gap-4 border-b bg-muted/40 px-4 py-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Bone key={i} className="h-3 flex-1" />
        ))}
      </div>
      {/* 행 */}
      {Array.from({ length: count }).map((_, rowIdx) => (
        <div key={rowIdx} className="flex gap-4 border-b last:border-b-0 px-4 py-3">
          {Array.from({ length: 5 }).map((_, colIdx) => (
            <Bone key={colIdx} className="h-3 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** 리스트 항목 스켈레톤 */
function ListSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
          <Bone className="h-8 w-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Bone className="h-3 w-3/4" />
            <Bone className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 칸반보드 열 스켈레톤 */
function KanbanSkeleton({ count }: { count: number }) {
  return (
    <div className="flex gap-4 overflow-x-auto">
      {Array.from({ length: count }).map((_, colIdx) => (
        <div key={colIdx} className="w-72 shrink-0 space-y-3">
          <Bone className="h-6 w-24" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, cardIdx) => (
              <CardSkeleton key={cardIdx} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 로딩 상태 스켈레톤 컴포넌트 — 다양한 변형 지원
 */
export function LoadingSkeleton({ variant = "card", count = 3, className }: LoadingSkeletonProps) {
  return (
    <div className={cn(className)}>
      {variant === "card" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: count }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}
      {variant === "table" && <TableSkeleton count={count} />}
      {variant === "list" && <ListSkeleton count={count} />}
      {variant === "kanban" && <KanbanSkeleton count={count} />}
    </div>
  );
}
