"use client";

import { useState, useTransition, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  approveReview,
  requestRevision,
  resetReviewStatus,
} from "@/actions/contents";
import type { Content, Profile } from "@/lib/types/database";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ClipboardCheck,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface ReviewPanelProps {
  content: Content;
  profiles: Profile[];
  onContentUpdated: (next: Content) => void;
}

const REVIEW_CHECKLIST = [
  { id: "numbers", label: "숫자/금액이 정확한가?" },
  { id: "law", label: "법률 조항 번호가 맞는가?" },
  { id: "cases", label: "고객 사례가 사실에 기반하는가?" },
  { id: "tone", label: "톤이 카테고리에 적합한가?" },
  { id: "privacy", label: "공개해도 되는 내용인가?" },
];

export function ReviewPanel({
  content,
  profiles,
  onContentUpdated,
}: ReviewPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false);
  const [revisionMemo, setRevisionMemo] = useState("");

  const reviewStatus = content.review_status ?? "pending";
  const reviewerName = useMemo(() => {
    if (!content.reviewer_id) return null;
    const p = profiles.find((pr) => pr.id === content.reviewer_id);
    return p?.name ?? "알 수 없음";
  }, [content.reviewer_id, profiles]);

  const reviewedAtFormatted = useMemo(() => {
    if (!content.review_done_at) return null;
    return format(new Date(content.review_done_at), "M/d HH:mm", { locale: ko });
  }, [content.review_done_at]);

  const checkedCount = checked.size;
  const canApprove = checkedCount >= 3;

  function toggleCheck(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleApprove() {
    if (!canApprove) {
      toast.error("최소 3개 항목을 체크해야 승인할 수 있습니다.");
      return;
    }
    startTransition(async () => {
      const res = await approveReview({
        contentId: content.id,
        checkedItems: Array.from(checked),
      });
      if (res.error || !res.data) {
        toast.error(res.error ?? "검수 승인 실패");
        return;
      }
      onContentUpdated(res.data);
      toast.success("검수 승인 완료");
    });
  }

  function handleRevisionRequest() {
    if (!revisionMemo.trim()) {
      toast.error("수정 사항을 입력해주세요.");
      return;
    }
    setRevisionDialogOpen(false);
    startTransition(async () => {
      const res = await requestRevision({
        contentId: content.id,
        memo: revisionMemo.trim(),
      });
      if (res.error || !res.data) {
        toast.error(res.error ?? "수정 요청 실패");
        return;
      }
      onContentUpdated(res.data);
      setRevisionMemo("");
      toast.success("수정 요청이 등록되었습니다.");
    });
  }

  function handleResetReview() {
    startTransition(async () => {
      const res = await resetReviewStatus(content.id);
      if (res.error || !res.data) {
        toast.error(res.error ?? "검수 초기화 실패");
        return;
      }
      onContentUpdated(res.data);
      setChecked(new Set());
      toast.success("검수 상태가 초기화되었습니다. 다시 검수를 요청하세요.");
    });
  }

  // S1(초안완료)일 때만 검수 패널 표시
  if (content.status !== "S1") return null;

  return (
    <>
      <Separator />
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">대표 검수</span>
        </div>

        {/* 승인 완료 상태 */}
        {reviewStatus === "approved" && (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 space-y-1">
            <div className="flex items-center gap-1.5 text-green-700 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4" />
              검수 완료
            </div>
            <p className="text-xs text-green-600">
              {reviewerName && `${reviewerName}`}
              {reviewedAtFormatted && `, ${reviewedAtFormatted}`}
            </p>
          </div>
        )}

        {/* 수정 요청 상태 */}
        {reviewStatus === "revision_requested" && (
          <div className="space-y-2">
            <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 space-y-1">
              <div className="flex items-center gap-1.5 text-orange-700 text-sm font-medium">
                <AlertTriangle className="h-4 w-4" />
                수정 요청됨
              </div>
              {content.review_memo && (
                <p className="text-xs text-orange-600">{content.review_memo}</p>
              )}
              <p className="text-xs text-orange-500">
                {reviewerName && `요청자: ${reviewerName}`}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs"
              onClick={handleResetReview}
              disabled={isPending}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              수정 완료 → 재검수 요청
            </Button>
          </div>
        )}

        {/* 미검수 상태 — 체크리스트 + 승인/수정요청 버튼 */}
        {reviewStatus === "pending" && (
          <div className="space-y-2">
            <div className="rounded-md border bg-muted/30 p-2 space-y-1.5">
              <p className="text-[11px] text-muted-foreground">
                검수 체크리스트 ({checkedCount}/{REVIEW_CHECKLIST.length})
                {checkedCount < 3 && " — 최소 3개 이상 체크"}
              </p>
              {REVIEW_CHECKLIST.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={checked.has(item.id)}
                    onChange={() => toggleCheck(item.id)}
                    className="h-3.5 w-3.5 rounded border-gray-300"
                  />
                  <span className={checked.has(item.id) ? "text-muted-foreground" : "text-foreground"}>
                    {item.label}
                  </span>
                </label>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="default"
                className="flex-1 h-8 text-xs"
                onClick={handleApprove}
                disabled={isPending || !canApprove}
                style={{
                  backgroundColor: canApprove ? "var(--brand-accent)" : undefined,
                }}
              >
                {isPending ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                )}
                검수 승인
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 text-xs text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => setRevisionDialogOpen(true)}
                disabled={isPending}
              >
                <XCircle className="h-3 w-3 mr-1" />
                수정 요청
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 수정 요청 메모 다이얼로그 */}
      <Dialog open={revisionDialogOpen} onOpenChange={setRevisionDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>수정 요청</DialogTitle>
            <DialogDescription>
              수정이 필요한 사항을 구체적으로 입력해주세요. 작성자에게 알림이 표시됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              rows={4}
              placeholder="예: 절세 금액 수치가 맞는지 재확인 필요, 고객사 동의 여부 확인..."
              value={revisionMemo}
              onChange={(e) => setRevisionMemo(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevisionDialogOpen(false)} disabled={isPending}>
              취소
            </Button>
            <Button
              onClick={handleRevisionRequest}
              disabled={isPending || !revisionMemo.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              수정 요청
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
