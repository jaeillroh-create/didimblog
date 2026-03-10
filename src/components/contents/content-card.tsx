"use client";

import { useState } from "react";
import { Draggable } from "@hello-pangea/dnd";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { CategoryBadge } from "@/components/common/category-badge";
import { SLAIndicator } from "@/components/common/sla-indicator";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteContent } from "@/actions/contents";
import type { ContentWithCategory } from "@/actions/contents";
import { Calendar, Sparkles, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
  /** 삭제 후 콜백 */
  onDeleted?: () => void;
}

/**
 * 칸반보드에 표시되는 콘텐츠 카드 컴포넌트
 */
export function ContentCard({ content, index, profiles, onDeleted }: ContentCardProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const authorName =
    profiles.find((p) => p.id === content.author_id)?.name ?? "미배정";
  const authorInitial = authorName.charAt(0);

  const categoryName =
    content.category?.name ?? content.category_id ?? "미분류";
  const categoryColor = getCategoryColor(content.category_id);

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
  const isPublished = content.status === "S4" || content.status === "S5";

  function handleClick() {
    router.push(`/contents/${content.id}`);
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const { success, error } = await deleteContent(content.id);
      if (!success) {
        toast.error(error || "삭제에 실패했습니다.");
        return;
      }
      toast.success("삭제되었습니다");
      onDeleted?.();
    } catch {
      toast.error("삭제에 실패했습니다.");
    } finally {
      setIsDeleting(false);
      setDeleteOpen(false);
    }
  }

  return (
    <>
      <Draggable draggableId={content.id} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            onClick={handleClick}
            className={cn(
              "group relative rounded-lg border bg-white p-3 shadow-sm cursor-pointer",
              "transition-shadow hover:shadow-md",
              snapshot.isDragging && "shadow-lg ring-2 ring-[var(--brand-accent)]/30 rotate-[2deg]"
            )}
            style={{
              ...provided.draggableProps.style,
              minHeight: "88px",
            }}
          >
            {/* ⋯ 메뉴 */}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <DropdownMenu>
                <DropdownMenuTrigger
                  onClick={(e) => e.stopPropagation()}
                  className="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100"
                >
                  <MoreHorizontal className="h-4 w-4 text-gray-400" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteOpen(true);
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    삭제
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* 제목 */}
            <p className="text-sm font-medium leading-snug text-[var(--neutral-text)] line-clamp-2 mb-2 pr-6">
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
                <span
                  className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ backgroundColor: "#ede9fe", color: "#7c3aed" }}
                >
                  <Sparkles className="h-2.5 w-2.5" />
                  AI
                </span>
              )}
            </div>

            {/* 하단 메타 정보 */}
            <div className="flex items-center justify-between gap-2">
              {content.publish_date && (
                <div className="flex items-center gap-1 text-xs text-[var(--neutral-text-secondary)]">
                  <Calendar className="h-3 w-3" />
                  <span>{content.publish_date}</span>
                </div>
              )}

              <div className="flex items-center gap-2 ml-auto">
                {dueDate && !isPublished && (
                  <SLAIndicator dueDate={dueDate} />
                )}

                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: "var(--brand-primary)" }}
                  title={authorName}
                >
                  {authorInitial}
                </div>
              </div>
            </div>
          </div>
        )}
      </Draggable>

      {/* 삭제 확인 다이얼로그 */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="콘텐츠 삭제"
        description={
          isPublished
            ? "발행된 콘텐츠입니다. 삭제하시겠습니까? 네이버 블로그에서도 별도 삭제가 필요합니다."
            : "이 콘텐츠를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."
        }
        confirmLabel={isDeleting ? "삭제 중..." : "삭제"}
        onConfirm={handleDelete}
      />
    </>
  );
}
