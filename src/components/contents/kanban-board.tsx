"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { Plus, RotateCcw, Sparkles, ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { KanbanColumn } from "@/components/contents/kanban-column";
import { ContentForm } from "@/components/contents/content-form";
import { AiDraftDialog, type AiDraftInitialValues } from "@/components/contents/ai-draft-dialog";
import { CONTENT_STATUS_OPTIONS } from "@/lib/constants/content-states";
import { CONTENT_STATES } from "@/lib/constants/content-states";
import { useContentFilterStore } from "@/stores/content-filter";
import {
  validateTransition,
  updateContentStatus,
  type ContentWithCategory,
} from "@/actions/contents";
import type {
  Category,
  Profile,
  StateTransition,
  ContentStatus,
  LLMConfig,
} from "@/lib/types/database";

interface KanbanBoardProps {
  /** 콘텐츠 목록 */
  contents: ContentWithCategory[];
  /** 카테고리 목록 */
  categories: Category[];
  /** 프로필(팀원) 목록 */
  profiles: Profile[];
  /** 상태 전이 규칙 */
  transitions: StateTransition[];
  /** LLM 설정 (AI 생성용) */
  llmConfigs?: LLMConfig[];
  /** AI 초안 다이얼로그 초기값 (URL 쿼리파라미터에서 전달) */
  aiDraftInitialValues?: AiDraftInitialValues;
  /** AI 초안 다이얼로그 초기 참고사항 */
  aiDraftInitialContext?: string;
}

/**
 * 콘텐츠 칸반보드 — S0~S5 칼럼 + 드래그&드롭 상태 전이
 */
export function KanbanBoard({
  contents: initialContents,
  categories,
  profiles,
  transitions,
  llmConfigs = [],
  aiDraftInitialValues,
  aiDraftInitialContext,
}: KanbanBoardProps) {
  const router = useRouter();
  const [contents, setContents] = useState(initialContents);
  const [formOpen, setFormOpen] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(!!aiDraftInitialValues);
  const [errorDialog, setErrorDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
  }>({ open: false, title: "", description: "" });

  // Zustand 필터 스토어
  const {
    categoryId: filterCategoryId,
    status: filterStatus,
    authorId: filterAuthorId,
    setCategoryId,
    setStatus,
    setAuthorId,
    reset: resetFilters,
  } = useContentFilterStore();

  // 필터 적용 — 계층적 카테고리 필터링
  const filteredContents = useMemo(() => {
    return contents.filter((c) => {
      if (filterCategoryId) {
        const matchesDirect = c.category_id === filterCategoryId;
        // 1차 카테고리 선택 시 해당 하위 카테고리도 포함
        const selectedCat = categories.find((cat) => cat.id === filterCategoryId);
        const isParentMatch =
          selectedCat?.tier === "primary" &&
          c.category_id !== null &&
          categories.some(
            (cat) =>
              cat.id === c.category_id &&
              cat.parent_id === filterCategoryId
          );
        if (!matchesDirect && !isParentMatch) return false;
      }
      if (filterStatus && c.status !== filterStatus) return false;
      if (filterAuthorId && c.author_id !== filterAuthorId) return false;
      return true;
    });
  }, [contents, filterCategoryId, filterStatus, filterAuthorId, categories]);

  // 상태별로 콘텐츠 그룹핑
  const columnData = useMemo(() => {
    const grouped: Record<ContentStatus, ContentWithCategory[]> = {
      S0: [],
      S1: [],
      S2: [],
      S3: [],
      S4: [],
      S5: [],
    };
    filteredContents.forEach((c) => {
      grouped[c.status].push(c);
    });
    return grouped;
  }, [filteredContents]);

  // 드래그 완료 핸들러
  const handleDragEnd = useCallback(
    async (result: DropResult) => {
      const { draggableId, source, destination } = result;

      // 드롭 위치 없음 또는 같은 위치
      if (!destination) return;
      if (
        source.droppableId === destination.droppableId &&
        source.index === destination.index
      ) {
        return;
      }

      const fromStatus = source.droppableId as ContentStatus;
      const toStatus = destination.droppableId as ContentStatus;
      const contentId = draggableId;

      // 같은 칼럼 내 순서 변경은 허용
      if (fromStatus === toStatus) {
        return;
      }

      // 낙관적 업데이트: 즉시 상태 변경
      const prevContents = [...contents];
      setContents((prev) =>
        prev.map((c) => (c.id === contentId ? { ...c, status: toStatus } : c))
      );

      // 전이 검증
      const { valid, failedConditions } = await validateTransition(
        contentId,
        fromStatus,
        toStatus
      );

      if (!valid) {
        // 검증 실패: 롤백 + 에러 다이얼로그
        setContents(prevContents);
        setErrorDialog({
          open: true,
          title: "상태 전이 불가",
          description: failedConditions.length > 0
            ? failedConditions.join("\n")
            : `${CONTENT_STATES[fromStatus].label}에서 ${CONTENT_STATES[toStatus].label}(으)로 이동할 수 없습니다.`,
        });
        return;
      }

      // Supabase에 상태 업데이트
      const { error } = await updateContentStatus(contentId, toStatus);
      if (error) {
        // 업데이트 실패 시 롤백
        setContents(prevContents);
        setErrorDialog({
          open: true,
          title: "상태 변경 실패",
          description: error,
        });
      }
    },
    [contents]
  );

  // 콘텐츠 생성 후 새로고침
  function handleContentCreated() {
    router.refresh();
  }

  // 콘텐츠 삭제 후 목록에서 즉시 제거
  function handleContentDeleted(contentId: string) {
    setContents((prev) => prev.filter((c) => c.id !== contentId));
  }

  const hasActiveFilters = !!(filterCategoryId || filterStatus || filterAuthorId);
  const primaryCategories = categories.filter((c) => c.tier === "primary");

  return (
    <div className="space-y-4">
      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-3">
        {/* 카테고리 필터 */}
        <Select
          value={filterCategoryId ?? "all"}
          onValueChange={(v) => setCategoryId(v === "all" ? null : v)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="카테고리 전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">카테고리 전체</SelectItem>
            {primaryCategories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 상태 필터 */}
        <Select
          value={filterStatus ?? "all"}
          onValueChange={(v) => setStatus(v === "all" ? null : v)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="상태 전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">상태 전체</SelectItem>
            {CONTENT_STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {CONTENT_STATES[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 담당자 필터 */}
        <Select
          value={filterAuthorId ?? "all"}
          onValueChange={(v) => setAuthorId(v === "all" ? null : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="담당자 전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">담당자 전체</SelectItem>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 필터 초기화 */}
        {hasActiveFilters && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={resetFilters}
          >
            <RotateCcw className="mr-1 h-4 w-4" />
            초기화
          </button>
        )}

        {/* 새 글 만들기 드롭다운 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="btn btn-primary btn-md ml-auto"
              style={{
                backgroundColor: "var(--brand)",
              }}
            >
              <span className="tf tf-14">📝</span>
              <Plus className="mr-1 h-4 w-4" />
              새 글 만들기
              <ChevronDown className="ml-1 h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              수동 작성
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAiDialogOpen(true)}>
              <Sparkles className="mr-2 h-4 w-4" />
              AI 생성
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 칸반 보드 */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {CONTENT_STATUS_OPTIONS.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              contents={columnData[status]}
              profiles={profiles}
              onDeleted={handleContentDeleted}
            />
          ))}
        </div>
      </DragDropContext>

      {/* 새 글 만들기 다이얼로그 (수동) */}
      <ContentForm
        open={formOpen}
        onOpenChange={setFormOpen}
        categories={categories}
        llmConfigs={llmConfigs}
        onCreated={handleContentCreated}
      />

      {/* AI 초안 생성 다이얼로그 */}
      <AiDraftDialog
        open={aiDialogOpen}
        onOpenChange={setAiDialogOpen}
        categories={categories}
        llmConfigs={llmConfigs}
        initialValues={aiDraftInitialValues}
        initialContext={aiDraftInitialContext}
      />

      {/* 에러 다이얼로그 */}
      <ConfirmDialog
        open={errorDialog.open}
        onOpenChange={(open) => setErrorDialog((prev) => ({ ...prev, open }))}
        title={errorDialog.title}
        description={errorDialog.description}
        confirmLabel="확인"
        onConfirm={() => setErrorDialog((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
