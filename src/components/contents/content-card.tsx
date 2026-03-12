"use client";

import { Draggable } from "@hello-pangea/dnd";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { CategoryBadge } from "@/components/common/category-badge";
import { SLAIndicator } from "@/components/common/sla-indicator";
import type { Category } from "@/lib/types/database";
import type { ContentWithCategory } from "@/actions/contents";
import { Calendar, Sparkles } from "lucide-react";

// 카테고리 색상 매핑
const CATEGORY_COLORS: Record<string, string> = {
  "CAT-A": "#D4740A",
  "CAT-B": "#1B3A5C",
  "CAT-C": "#6B7280",
  "CAT-INTRO": "#94A3B8",
  "CAT-CONSULT": "#2E75B6",
};

function getCategoryColor(categoryId: string | null): string {
  if (!categoryId) return "#94A3B8";
  // 부모 카테고리 색상을 사용 (CAT-A-01 → CAT-A)
  const parentId = categoryId.split("-").slice(0, 2).join("-");
  return CATEGORY_COLORS[parentId] ?? CATEGORY_COLORS[categoryId] ?? "#94A3B8";
}

interface ContentCardProps {
  /** 콘텐츠 데이터 */
  content: ContentWithCategory;
  /** 드래그 인덱스 */
  index: number;
  /** 프로필 목록 (작성자 이름 표시용) */
  profiles: { id: string; name: string }[];
}

/**
 * 칸반보드에 표시되는 콘텐츠 카드 컴포넌트
 */
export function ContentCard({ content, index, profiles }: ContentCardProps) {
  const router = useRouter();

  const authorName =
    profiles.find((p) => p.id === content.author_id)?.name ?? "미배정";
  const authorInitial = authorName.charAt(0);

  const categoryName =
    content.category?.name ?? content.category_id ?? "미분류";
  const categoryColor = getCategoryColor(content.category_id);

  // 현재 상태에 따른 마감일 결정
  function getRelevantDueDate(): string | null {
    switch (content.status) {
      case "S0":
        return content.briefing_due;
      case "S1":
        return content.draft_due;
      case "S2":
        return content.review_due;
      case "S3":
        return content.publish_due;
      default:
        return content.publish_date;
    }
  }

  const dueDate = getRelevantDueDate();

  function handleClick() {
    router.push(`/contents/${content.id}`);
  }

  return (
    <Draggable draggableId={content.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={handleClick}
          className={cn(
            "card-compact card-hover cursor-pointer",
            snapshot.isDragging && "rotate-[2deg]"
          )}
          style={{
            ...provided.draggableProps.style,
            minHeight: "88px",
            borderRadius: "var(--r-lg)",
            boxShadow: snapshot.isDragging ? "var(--sh-lg)" : "var(--sh-sm)",
            ...(snapshot.isDragging ? { outline: "2px solid var(--brand-light)" } : {}),
          }}
        >
          {/* 제목 */}
          <p className="t-md font-medium leading-snug line-clamp-2 mb-2" style={{ color: "var(--g900)" }}>
            {content.title ?? "제목 없음"}
          </p>

          {/* 배지 영역 */}
          <div className="mb-2 flex items-center gap-1.5 flex-wrap">
            <CategoryBadge
              categoryId={content.category_id ?? ""}
              categoryName={categoryName}
              color={categoryColor}
            />
            {content.is_ai_generated && (
              <span className="ucl-badge ucl-badge-sm badge-info">
                <Sparkles className="h-2.5 w-2.5" />
                AI
              </span>
            )}
          </div>

          {/* 하단 메타 정보 */}
          <div className="flex items-center justify-between gap-2">
            {/* 발행일 */}
            {content.publish_date && (
              <div className="flex items-center gap-1 t-xs" style={{ color: "var(--g500)" }}>
                <Calendar className="h-3 w-3" />
                <span>{content.publish_date}</span>
              </div>
            )}

            <div className="flex items-center gap-2 ml-auto">
              {/* SLA 인디케이터 */}
              {dueDate && content.status !== "S4" && content.status !== "S5" && (
                <SLAIndicator dueDate={dueDate} />
              )}

              {/* 작성자 아바타 */}
              <div
                className="ucl-avatar flex h-6 w-6 shrink-0 items-center justify-center text-xs font-medium text-white"
                style={{ backgroundColor: "var(--brand)" }}
                title={authorName}
              >
                {authorInitial}
              </div>
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}
