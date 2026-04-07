"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generateInfographic } from "@/actions/image-gen";
import type { ImageMarker } from "@/lib/types/database";
import { Loader2, RefreshCw, Check, Image as ImageIcon } from "lucide-react";

interface ImageGenPanelProps {
  marker: ImageMarker;
  markerIndex: number;
  generationId: number;
  blogTopic: string;
  categoryId?: string;
  onImageGenerated: (markerIndex: number, imageUrl: string) => void;
}

export function ImageGenPanel({
  marker,
  markerIndex,
  generationId,
  blogTopic,
  categoryId,
  onImageGenerated,
}: ImageGenPanelProps) {
  const [status, setStatus] = useState<"idle" | "generating" | "completed" | "failed">(
    marker.imageUrl ? "completed" : "idle"
  );
  const [imageUrl, setImageUrl] = useState<string | null>(marker.imageUrl || null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setStatus("generating");
    setError(null);

    const result = await generateInfographic({
      description: marker.description,
      blogTopic,
      categoryId,
      generationId,
      markerIndex,
    });

    if (!result.success) {
      setStatus("failed");
      setError(result.error || "이미지 생성 실패");
      return;
    }

    setImageUrl(result.imageUrl!);
    setStatus("completed");
    onImageGenerated(markerIndex, result.imageUrl!);
  }

  return (
    <div
      className="rounded-lg border p-4 space-y-3"
      style={{ backgroundColor: "var(--neutral-surface)" }}
    >
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className="shrink-0"
          style={{ borderColor: "var(--brand-accent)", color: "var(--brand-accent)" }}
        >
          IMG {markerIndex + 1}
        </Badge>
        <span className="text-sm font-medium">{marker.description}</span>
      </div>

      {/* 이미지 미리보기 영역 */}
      {status === "completed" && imageUrl ? (
        <div className="relative rounded-md overflow-hidden border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={marker.altText || marker.description}
            className="w-full h-auto max-h-[300px] object-contain bg-white"
          />
        </div>
      ) : status === "generating" ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed p-8 bg-white">
          <Loader2
            className="h-8 w-8 animate-spin mb-2"
            style={{ color: "var(--brand-accent)" }}
          />
          <p className="text-sm text-[var(--neutral-text-muted)]">이미지 생성 중...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed p-8 bg-white">
          <ImageIcon className="h-8 w-8 text-[var(--neutral-text-muted)] mb-2" />
          <p className="text-xs text-[var(--neutral-text-muted)]">이미지를 생성해주세요</p>
        </div>
      )}

      {/* 에러 메시지 */}
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      {/* ALT 텍스트 */}
      {marker.altText && (
        <p className="text-xs text-[var(--neutral-text-muted)]">
          ALT: {marker.altText}
        </p>
      )}

      {/* 액션 버튼 */}
      <div className="flex gap-2">
        {status === "idle" || status === "failed" ? (
          <Button
            size="sm"
            onClick={handleGenerate}
            style={{ backgroundColor: "var(--brand-accent)" }}
          >
            <ImageIcon className="mr-1 h-3.5 w-3.5" />
            이미지 생성
          </Button>
        ) : status === "completed" ? (
          <>
            <Button size="sm" variant="outline" onClick={handleGenerate}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              다시 생성
            </Button>
            <Badge className="bg-green-100 text-green-700 border-0 text-xs">
              <Check className="mr-1 h-3 w-3" />
              생성 완료
            </Badge>
          </>
        ) : null}
      </div>
    </div>
  );
}
