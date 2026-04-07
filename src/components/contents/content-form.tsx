"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { createContent } from "@/actions/contents";
import { generateDraft } from "@/actions/ai";
import { formatDate, getNextTuesday, calculateSlaDates } from "@/lib/utils/date-helpers";
import type { Category, LLMConfig } from "@/lib/types/database";
import { Sparkles, FileEdit } from "lucide-react";
import { toast } from "sonner";

interface ContentFormProps {
  /** 다이얼로그 열림 상태 */
  open: boolean;
  /** 열림 상태 변경 핸들러 */
  onOpenChange: (open: boolean) => void;
  /** 카테고리 목록 */
  categories: Category[];
  /** LLM 설정 (AI 자동작성용) */
  llmConfigs?: LLMConfig[];
  /** 생성 완료 후 콜백 */
  onCreated?: () => void;
}

/**
 * 새 콘텐츠 생성 다이얼로그 폼
 * - 수동 생성: S0 기획 상태로 빈 콘텐츠 생성
 * - AI 자동작성: S0 생성 후 동일 SEO 기준으로 AI 초안 자동 생성 → 편집기 이동
 */
export function ContentForm({
  open,
  onOpenChange,
  categories,
  llmConfigs,
  onCreated,
}: ContentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const nextTuesday = getNextTuesday();
  const slaDates = calculateSlaDates(nextTuesday);

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [secondaryCategory, setSecondaryCategory] = useState("");
  const [targetKeyword, setTargetKeyword] = useState("");
  const [targetAudience, setTargetAudience] = useState<string>("");
  const [publishDate, setPublishDate] = useState(formatDate(nextTuesday));
  const [autoGenerate, setAutoGenerate] = useState(false);

  const hasLlmConfigs = llmConfigs && llmConfigs.length > 0;

  function resetForm() {
    setTitle("");
    setCategoryId("");
    setSecondaryCategory("");
    setTargetKeyword("");
    setTargetAudience("");
    setPublishDate(formatDate(getNextTuesday()));
    setAutoGenerate(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim() || !categoryId) return;

    startTransition(async () => {
      // 1. 콘텐츠(S0) 생성
      const { data: content, error } = await createContent({
        title: title.trim(),
        category_id: categoryId,
        secondary_category: secondaryCategory.trim() || undefined,
        target_keyword: targetKeyword.trim() || undefined,
        target_audience: targetAudience as "startup" | "sme" | "cto" | undefined,
        publish_date: publishDate,
      });

      if (error) {
        toast.error(`콘텐츠 생성 실패: ${error}`);
        return;
      }

      // 2. AI 자동작성 모드인 경우 → AI 초안 생성
      if (autoGenerate && content) {
        toast.info("AI 초안을 생성합니다...");

        const result = await generateDraft({
          topic: title.trim(),
          categoryId,
          keyword: targetKeyword.trim() || title.trim(),
          targetAudience: targetAudience || undefined,
          subCategoryId: secondaryCategory.trim() || undefined,
          contentId: content.id,
          llmConfigId: llmConfigs?.[0]?.id,
        });

        if (result.success && result.generationId) {
          resetForm();
          onOpenChange(false);
          onCreated?.();
          router.push(`/contents/ai-editor/${result.generationId}`);
          return;
        }

        // AI 생성 실패해도 콘텐츠는 이미 생성됨
        toast.error(`AI 초안 생성 실패: ${result.error ?? "알 수 없는 오류"}. 콘텐츠는 S0 상태로 생성되었습니다.`);
      }

      resetForm();
      onOpenChange(false);
      onCreated?.();
    });
  }

  // 1차 카테고리만 필터
  const primaryCategories = categories.filter((c) => c.tier === "primary");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>새 글 만들기</DialogTitle>
          <DialogDescription>
            새로운 블로그 콘텐츠를 기획합니다. 발행일은 자동으로 다음 화요일로
            설정됩니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 제목 */}
          <div className="space-y-1.5">
            <Label htmlFor="title">제목 *</Label>
            <Input
              id="title"
              placeholder="콘텐츠 제목을 입력하세요"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          {/* 카테고리 + 세부 카테고리 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>카테고리 *</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="카테고리 선택" />
                </SelectTrigger>
                <SelectContent>
                  {primaryCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="secondary">세부 카테고리</Label>
              <Input
                id="secondary"
                placeholder="세부 분류 (선택)"
                value={secondaryCategory}
                onChange={(e) => setSecondaryCategory(e.target.value)}
              />
            </div>
          </div>

          {/* 타겟 키워드 + 타겟 독자 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="keyword">타겟 키워드</Label>
              <Input
                id="keyword"
                placeholder="SEO 타겟 키워드"
                value={targetKeyword}
                onChange={(e) => setTargetKeyword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>타겟 독자</Label>
              <Select value={targetAudience} onValueChange={setTargetAudience}>
                <SelectTrigger>
                  <SelectValue placeholder="타겟 독자 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="startup">스타트업</SelectItem>
                  <SelectItem value="sme">중소기업</SelectItem>
                  <SelectItem value="cto">CTO/연구소장</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 발행 예정일 */}
          <div className="space-y-1.5">
            <Label htmlFor="publishDate">발행 예정일</Label>
            <Input
              id="publishDate"
              type="date"
              value={publishDate}
              onChange={(e) => setPublishDate(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              SLA: AI 주제선정 D-5 ({formatDate(slaDates.briefingDue)}) / 초안 D-3 (
              {formatDate(slaDates.draftDue)}) / 검토 D-2 (
              {formatDate(slaDates.reviewDue)}) / 이미지 D-1 (
              {formatDate(slaDates.imageDue)})
            </p>
          </div>

          {/* AI 자동작성 옵션 */}
          {hasLlmConfigs && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAutoGenerate(false)}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border p-4 text-sm transition-colors ${!autoGenerate ? "border-[var(--brand)] bg-[var(--brand)]/5 text-[var(--brand)]" : "border-gray-200 text-muted-foreground hover:border-gray-300"}`}
                  >
                    <FileEdit className="h-5 w-5" />
                    <span className="font-medium">수동 작성</span>
                    <span className="text-[10px] opacity-70">S0 기획 상태로 생성</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoGenerate(true)}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border p-4 text-sm transition-colors ${autoGenerate ? "border-[var(--brand-accent)] bg-[var(--brand-accent)]/5 text-[var(--brand-accent)]" : "border-gray-200 text-muted-foreground hover:border-gray-300"}`}
                  >
                    <Sparkles className="h-5 w-5" />
                    <span className="font-medium">AI 자동작성</span>
                    <span className="text-[10px] opacity-70">SEO 기준으로 초안 생성</span>
                  </button>
                </div>
                {autoGenerate && (
                  <p className="text-[11px] text-muted-foreground">
                    카테고리별 SEO 기준(분량, 키워드 빈도, 소제목, CTA 등)에 맞춰 AI가 초안을 자동 생성합니다.
                    생성 후 편집기에서 수정할 수 있습니다.
                  </p>
                )}
              </div>
            </>
          )}

          <DialogFooter>
            <button
              type="button"
              className="btn btn-ghost btn-md"
              onClick={() => onOpenChange(false)}
            >
              취소
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-md"
              disabled={isPending || !title.trim() || !categoryId}
              style={{ backgroundColor: autoGenerate ? "var(--brand-accent)" : "var(--brand)" }}
            >
              {isPending
                ? autoGenerate
                  ? "AI 생성 중..."
                  : "생성 중..."
                : autoGenerate
                  ? "AI 자동작성"
                  : "생성하기"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
