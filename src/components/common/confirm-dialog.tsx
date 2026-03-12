"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmDialogProps {
  /** 다이얼로그 열림 상태 */
  open: boolean;
  /** 열림 상태 변경 핸들러 */
  onOpenChange: (open: boolean) => void;
  /** 제목 */
  title: string;
  /** 설명 */
  description: string;
  /** 확인 버튼 라벨 */
  confirmLabel?: string;
  /** 취소 버튼 라벨 */
  cancelLabel?: string;
  /** 확인 콜백 */
  onConfirm: () => void;
  /** 스타일 변형 — destructive일 경우 확인 버튼이 빨간색 */
  variant?: "default" | "destructive";
}

/**
 * 사용자 확인을 요청하는 대화 상자 컴포넌트
 * UCL Modal + Button 패턴 적용
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  onConfirm,
  variant = "default",
}: ConfirmDialogProps) {
  function handleConfirm() {
    onConfirm();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" style={{ borderRadius: "var(--r-xl)" }}>
        <DialogHeader>
          <DialogTitle className="t-xl">{title}</DialogTitle>
          <DialogDescription className="t-md text-g-500">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <button className="btn btn-ghost btn-md" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </button>
          <button
            className={`btn btn-md ${variant === "destructive" ? "btn-danger" : "btn-primary"}`}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
