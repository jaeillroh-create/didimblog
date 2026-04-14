"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generateInfographic } from "@/actions/image-gen";
import type { ImageMarker } from "@/lib/types/database";
import { toast } from "sonner";
import { Loader2, RefreshCw, Check, Image as ImageIcon, Copy, ChevronDown, ChevronRight } from "lucide-react";

interface ImageGenPanelProps {
  marker: ImageMarker;
  markerIndex: number;
  generationId: number;
  blogTopic: string;
  categoryId?: string;
  /** 박스 형식 [IMAGE: ...] 전체 raw text — 다른 이미지 LLM에 붙여넣기 용 복사에 사용 */
  rawText?: string;
  onImageGenerated: (markerIndex: number, imageUrl: string) => void;
}

/**
 * description 에서 (2) English: 부분만 추출.
 * 박스 형식이면 영문 프롬프트 단독 추출, 단순 형식이면 null 반환.
 */
function extractEnglishPrompt(description: string): string | null {
  const m = description.match(/\(2\)\s*English\s*:\s*([\s\S]*?)$/i);
  if (m) return m[1].trim();
  return null;
}

export function ImageGenPanel({
  marker,
  markerIndex,
  generationId,
  blogTopic,
  categoryId,
  rawText,
  onImageGenerated,
}: ImageGenPanelProps) {
  const [status, setStatus] = useState<"idle" | "generating" | "completed" | "failed">(
    marker.imageUrl ? "completed" : "idle"
  );
  const [imageUrl, setImageUrl] = useState<string | null>(marker.imageUrl || null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const englishPrompt = extractEnglishPrompt(marker.description);
  // 헤더에는 첫 줄만 표시 (자르지 않고 line-clamp 로 시각만 줄임)
  const firstLine = marker.description.split("\n")[0]?.trim() ?? "";

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

  function handleCopyFull() {
    const textToCopy = rawText ?? marker.description;
    navigator.clipboard.writeText(textToCopy).then(
      () => toast.success("프롬프트 전체가 복사되었습니다 (한국어 + 영문)"),
      () => toast.error("클립보드 복사에 실패했습니다")
    );
  }

  function handleCopyEnglishOnly() {
    if (!englishPrompt) {
      toast.error("영문 프롬프트를 찾지 못했습니다 — 전체 복사를 사용하세요");
      return;
    }
    navigator.clipboard.writeText(englishPrompt).then(
      () => toast.success("영문 프롬프트가 복사되었습니다 — 이미지 생성 LLM에 붙여넣으세요"),
      () => toast.error("클립보드 복사에 실패했습니다")
    );
  }

  return (
    <div
      className="rounded-lg border p-4 space-y-3"
      style={{ backgroundColor: "var(--neutral-surface)" }}
    >
      <div className="flex items-start gap-2">
        <Badge
          variant="outline"
          className="shrink-0 mt-0.5"
          style={{ borderColor: "var(--brand-accent)", color: "var(--brand-accent)" }}
        >
          IMG {markerIndex + 1}
        </Badge>
        <span
          className="text-sm font-medium flex-1 leading-relaxed"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" as const,
            overflow: "hidden",
            wordBreak: "break-word",
          }}
        >
          {firstLine || marker.description}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 inline-flex items-center text-xs text-muted-foreground hover:text-foreground"
          aria-label={expanded ? "프롬프트 접기" : "프롬프트 펼치기"}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* 펼침 시 전체 프롬프트 (한국어 + 영문) */}
      {expanded && (
        <div className="rounded-md border bg-background p-3 max-h-[260px] overflow-y-auto">
          <pre className="text-xs leading-relaxed whitespace-pre-wrap break-words font-mono text-foreground">
            {rawText ?? marker.description}
          </pre>
        </div>
      )}

      {/* 복사 버튼 (영문만 / 전체) */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleCopyEnglishOnly}
          disabled={!englishPrompt}
          title={
            englishPrompt
              ? "이미지 생성 LLM(Gemini, ChatGPT, Midjourney 등)에 바로 붙여넣기"
              : "(2) English 프롬프트가 없어 사용 불가 — 전체 복사를 사용하세요"
          }
        >
          <Copy className="mr-1 h-3.5 w-3.5" />
          영문 프롬프트 복사
        </Button>
        <Button size="sm" variant="ghost" onClick={handleCopyFull}>
          <Copy className="mr-1 h-3.5 w-3.5" />
          전체 복사 (한+영)
        </Button>
      </div>

      {/* 이미지 미리보기 영역 */}
      {status === "completed" && imageUrl ? (
        <div className="relative rounded-md overflow-hidden border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={marker.altText || firstLine || "infographic"}
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
        <p className="text-xs text-red-600 whitespace-pre-wrap break-words">{error}</p>
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
