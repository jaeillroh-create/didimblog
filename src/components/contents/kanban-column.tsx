"use client";

import { Droppable } from "@hello-pangea/dnd";
import { cn } from "@/lib/utils";
import { CONTENT_STATES, type ContentStatus } from "@/lib/constants/content-states";
import { ContentCard } from "@/components/contents/content-card";
import { EmptyState } from "@/components/common/empty-state";
import type { ContentWithCategory } from "@/actions/contents";

interface KanbanColumnProps {
  /** 상태 코드 (S0~S5) */
  status: ContentStatus;
  /** 이 칼럼에 표시할 콘텐츠 목록 */
  contents: ContentWithCategory[];
  /** 프로필 목록 (카드에 전달) */
  profiles: { id: string; name: string }[];
}

/**
 * 칸반보드의 단일 칼럼 — Droppable 영역
 */
export function KanbanColumn({ status, contents, profiles }: KanbanColumnProps) {
  const state = CONTENT_STATES[status];

  return (
    <div
      className="card-default flex w-[280px] shrink-0 flex-col"
      style={{ borderRadius: "var(--r-lg)", borderColor: "var(--g200)" }}
    >
      {/* 칼럼 헤더 */}
      <div
        className="flex items-center gap-2 px-3 py-2.5"
        style={{ borderBottom: "1px solid var(--g200)" }}
      >
        <span
          className="h-2.5 w-2.5 shrink-0"
          style={{ backgroundColor: state.color, borderRadius: "var(--r-full)" }}
          aria-hidden="true"
        />
        <span className="t-sm font-semibold" style={{ color: "var(--g900)" }}>
          {state.label}
        </span>
        <span
          className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center px-1.5 t-xs font-medium"
          style={{
            backgroundColor: `${state.color}20`,
            color: state.color,
            borderRadius: "var(--r-full)",
          }}
        >
          {contents.length}
        </span>
      </div>

      {/* Droppable 영역 */}
      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              "flex flex-1 flex-col gap-2 overflow-y-auto p-2 min-h-[200px] transition-colors",
              snapshot.isDraggingOver && "bg-[var(--brand-light)]"
            )}
          >
            {contents.length === 0 ? (
              <EmptyState
                title="콘텐츠 없음"
                description={`${state.label} 상태인 콘텐츠가 없습니다.`}
                className="py-8"
              />
            ) : (
              contents.map((content, index) => (
                <ContentCard
                  key={content.id}
                  content={content}
                  index={index}
                  profiles={profiles}
                />
              ))
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
