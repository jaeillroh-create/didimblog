"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface CopyButtonProps {
  /** 복사할 텍스트 */
  text: string;
  /** 버튼 라벨 */
  label?: string;
  /** 복사 성공 시 토스트 메시지 */
  toastMessage?: string;
  /** 버튼 크기 */
  size?: "sm" | "default" | "lg" | "icon";
  /** 버튼 스타일 */
  variant?: "default" | "outline" | "ghost" | "secondary";
  /** 추가 className */
  className?: string;
}

/**
 * 클립보드 복사 버튼 — navigator.clipboard.writeText만 사용
 */
export function CopyButton({
  text,
  label = "복사",
  toastMessage = "클립보드에 복사되었습니다",
  size = "sm",
  variant = "outline",
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(toastMessage);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("복사에 실패했습니다");
    }
  }, [text, toastMessage]);

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handleCopy}
      disabled={!text}
    >
      {copied ? (
        <Check className="h-4 w-4 mr-1 text-green-600" />
      ) : (
        <Copy className="h-4 w-4 mr-1" />
      )}
      {copied ? "복사됨" : label}
    </Button>
  );
}
