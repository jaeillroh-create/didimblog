"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createContent } from "@/actions/contents";
import { formatDate, getNextTuesday, calculateSlaDates } from "@/lib/utils/date-helpers";
import type { Category } from "@/lib/types/database";

interface ContentFormProps {
  /** 다이얼로그 열림 상태 */
  open: boolean;
  /** 열림 상태 변경 핸들러 */
  onOpenChange: (open: boolean) => void;
  /** 카테고리 목록 */
  categories: Category[];
  /** 생성 완료 후 콜백 */
  onCreated?: () => void;
}

/**
 * 새 콘텐츠 생성 다이얼로그 폼
 */
export function ContentForm({
  open,
  onOpenChange,
  categories,
  onCreated,
}: ContentFormProps) {
  const [isPending, startTransition] = useTransition();

  const nextTuesday = getNextTuesday();
  const slaDates = calculateSlaDates(nextTuesday);

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [secondaryCategory, setSecondaryCategory] = useState("");
  const [targetKeyword, setTargetKeyword] = useState("");
  const [targetAudience, setTargetAudience] = useState<string>("");
  const [publishDate, setPublishDate] = useState(formatDate(nextTuesday));

  function resetForm() {
    setTitle("");
    setCategoryId("");
    setSecondaryCategory("");
    setTargetKeyword("");
    setTargetAudience("");
    setPublishDate(formatDate(getNextTuesday()));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim() || !categoryId) return;

    startTransition(async () => {
      const { error } = await createContent({
        title: title.trim(),
        category_id: categoryId,
        secondary_category: secondaryCategory.trim() || undefined,
        target_keyword: targetKeyword.trim() || undefined,
        target_audience: targetAudience as "startup" | "sme" | "cto" | undefined,
        publish_date: publishDate,
      });

      if (error) {
        console.error("[ContentForm] 생성 실패:", error);
        return;
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
          <div className="space-y-2">
            <Label htmlFor="title">제목 *</Label>
            <Input
              id="title"
              placeholder="콘텐츠 제목을 입력하세요"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          {/* 카테고리 */}
          <div className="space-y-2">
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

          {/* 세부 카테고리 */}
          <div className="space-y-2">
            <Label htmlFor="secondary">세부 카테고리</Label>
            <Input
              id="secondary"
              placeholder="세부 분류 (선택)"
              value={secondaryCategory}
              onChange={(e) => setSecondaryCategory(e.target.value)}
            />
          </div>

          {/* 타겟 키워드 */}
          <div className="space-y-2">
            <Label htmlFor="keyword">타겟 키워드</Label>
            <Input
              id="keyword"
              placeholder="SEO 타겟 키워드"
              value={targetKeyword}
              onChange={(e) => setTargetKeyword(e.target.value)}
            />
          </div>

          {/* 타겟 독자 */}
          <div className="space-y-2">
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

          {/* 발행 예정일 */}
          <div className="space-y-2">
            <Label htmlFor="publishDate">발행 예정일</Label>
            <Input
              id="publishDate"
              type="date"
              value={publishDate}
              onChange={(e) => setPublishDate(e.target.value)}
            />
            <p className="text-xs text-[var(--neutral-text-muted)]">
              SLA: AI 주제선정 D-5 ({formatDate(slaDates.briefingDue)}) / 초안 D-3 (
              {formatDate(slaDates.draftDue)}) / 검토 D-2 (
              {formatDate(slaDates.reviewDue)}) / 이미지 D-1 (
              {formatDate(slaDates.imageDue)})
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              취소
            </Button>
            <Button type="submit" disabled={isPending || !title.trim() || !categoryId}>
              {isPending ? "생성 중..." : "생성하기"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
