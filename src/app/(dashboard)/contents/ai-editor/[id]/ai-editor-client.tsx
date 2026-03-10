"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/common/page-header";
import { CrossValidationPanel } from "@/components/contents/cross-validation-panel";
import { getGenerationStatus } from "@/actions/ai";
import { createContent } from "@/actions/contents";
import type { GenerationStatus } from "@/lib/types/database";
import { calculateCategorySeoScore } from "@/lib/utils/seo-scoring";
import {
  ArrowLeft,
  Save,
  RefreshCw,
  Sparkles,
  Clock,
  Cpu,
  Hash,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Image as ImageIcon,
  X,
} from "lucide-react";

interface AiEditorClientProps {
  generationId: number;
}


export function AiEditorClient({ generationId }: AiEditorClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // 생성 상태
  const [status, setStatus] = useState<GenerationStatus>("pending");
  const [generatedText, setGeneratedText] = useState("");
  const [generatedTitle, setGeneratedTitle] = useState("");
  const [generatedTags, setGeneratedTags] = useState<string[]>([]);
  const [genError, setGenError] = useState<string | null>(null);

  // 편집 상태
  const [editTitle, setEditTitle] = useState("");
  const [editText, setEditText] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [keyword, setKeyword] = useState("");

  // 생성 메타
  const [llmInfo, setLlmInfo] = useState<string>("");
  const [tokensUsed, setTokensUsed] = useState<number | null>(null);
  const [genTimeMs, setGenTimeMs] = useState<number | null>(null);

  // 카테고리 (SEO 채점 기준 분기용)
  const [categoryId, setCategoryId] = useState<string | null>(null);

  // 교차검증
  const [showValidation, setShowValidation] = useState(false);
  const [currentGenerationId, setCurrentGenerationId] = useState(generationId);

  // 폴링으로 생성 상태 확인
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const result = await getGenerationStatus(currentGenerationId);
      if (cancelled) return;

      if (!result.success) {
        setGenError(result.error || "상태 조회 실패");
        return;
      }

      setStatus(result.status!);

      if (result.categoryId) {
        setCategoryId(result.categoryId);
      }

      if (result.status === "completed") {
        const text = result.generatedText || "";
        const title = result.generatedTitle || "";
        const tags = result.generatedTags || [];

        setGeneratedText(text);
        setGeneratedTitle(title);
        setGeneratedTags(tags);
        setEditText(text);
        setEditTitle(title);
        setEditTags(tags);
      } else if (result.status === "failed") {
        setGenError(result.error || "AI 초안 생성에 실패했습니다.");
      }
    }

    poll();

    // pending/generating 상태면 폴링 계속
    if (status === "pending" || status === "generating") {
      const interval = setInterval(poll, 2000);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }

    return () => { cancelled = true; };
  }, [status, currentGenerationId]);

  // SEO 점수 계산 (카테고리별 채점 기준 적용)
  const seoResult = calculateCategorySeoScore(editTitle, editText, keyword, categoryId);

  // [IMAGE: ...] 마커 하이라이트된 텍스트
  const highlightedText = editText.replace(
    /\[IMAGE:\s*(.+?)\]/g,
    "<<IMAGE_MARKER>>$1<<END_MARKER>>"
  );

  // 저장 (S1로 전이, 콘텐츠 생성)
  function handleSave() {
    startTransition(async () => {
      const { error } = await createContent({
        title: editTitle,
        category_id: categoryId || "CAT-A",
        target_keyword: keyword || undefined,
      });

      if (error) {
        setGenError(error);
        return;
      }

      router.push("/contents");
    });
  }

  function handleRegenerate(newGenId: number) {
    setCurrentGenerationId(newGenId);
    setStatus("pending");
    setShowValidation(false);
    setGenError(null);
  }

  function removeTag(index: number) {
    setEditTags((prev) => prev.filter((_, i) => i !== index));
  }

  function addTag() {
    if (newTag.trim() && !editTags.includes(newTag.trim())) {
      setEditTags((prev) => [...prev, newTag.trim()]);
      setNewTag("");
    }
  }

  // 로딩 / 생성 중 상태
  if (status === "pending" || status === "generating") {
    return (
      <div className="space-y-6">
        <PageHeader
          title="AI 초안 생성 중"
          description="AI가 초안을 작성하고 있습니다. 잠시만 기다려주세요."
          actions={
            <Button variant="outline" onClick={() => router.push("/contents")}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              콘텐츠 관리
            </Button>
          }
        />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2
              className="h-12 w-12 animate-spin mb-4"
              style={{ color: "var(--brand-accent)" }}
            />
            <p className="text-lg font-medium mb-2">
              {status === "pending" ? "생성 준비 중..." : "초안 작성 중..."}
            </p>
            <p className="text-sm text-[var(--neutral-text-muted)]">
              카테고리별 톤과 SEO를 고려하여 초안을 생성합니다
            </p>
            <div className="mt-6 flex gap-2">
              <div className="h-2 w-2 rounded-full bg-[var(--brand-accent)] animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="h-2 w-2 rounded-full bg-[var(--brand-accent)] animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="h-2 w-2 rounded-full bg-[var(--brand-accent)] animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 실패 상태
  if (status === "failed") {
    return (
      <div className="space-y-6">
        <PageHeader
          title="AI 초안 생성 실패"
          actions={
            <Button variant="outline" onClick={() => router.push("/contents")}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              콘텐츠 관리
            </Button>
          }
        />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <XCircle className="h-12 w-12 mb-4" style={{ color: "var(--quality-critical)" }} />
            <p className="text-lg font-medium mb-2">생성에 실패했습니다</p>
            <p className="text-sm text-[var(--neutral-text-muted)]">
              {genError || "알 수 없는 오류가 발생했습니다."}
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => router.push("/contents")}
            >
              콘텐츠 관리로 돌아가기
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 완료 → 에디터 표시
  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <PageHeader
        title="초안 편집"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/contents")}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              콘텐츠 관리
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowValidation(!showValidation)}
            >
              <Sparkles className="mr-1 h-4 w-4" />
              교차검증
            </Button>
            <Button
              onClick={handleSave}
              disabled={isPending}
              style={{ backgroundColor: "var(--brand-accent)" }}
            >
              <Save className="mr-1 h-4 w-4" />
              {isPending ? "저장 중..." : "저장 (S1 전이)"}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 좌측: 에디터 영역 */}
        <div className="lg:col-span-2 space-y-4">
          {/* 제목 편집 */}
          <Card>
            <CardContent className="pt-6">
              <label className="text-sm font-medium mb-2 block">제목</label>
              <input
                type="text"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
              <p className="mt-1 text-xs text-[var(--neutral-text-muted)]">
                {editTitle.length}자 (권장 25~30자)
              </p>
            </CardContent>
          </Card>

          {/* 본문 편집 */}
          <Card>
            <CardContent className="pt-6">
              <label className="text-sm font-medium mb-2 block">본문</label>
              <textarea
                className="w-full min-h-[500px] rounded-md border border-input bg-background px-4 py-3 text-sm leading-relaxed font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring whitespace-pre-wrap"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
              />
              <p className="mt-1 text-xs text-[var(--neutral-text-muted)]">
                {editText.replace(/\s/g, "").length.toLocaleString()}자 (공백 제외)
              </p>
            </CardContent>
          </Card>

          {/* 이미지 마커 목록 */}
          {(() => {
            const markers = editText.match(/\[IMAGE:\s*(.+?)\]/g) || [];
            if (markers.length === 0) return null;
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-1">
                    <ImageIcon className="h-4 w-4" />
                    이미지 마커 ({markers.length}개)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {markers.map((marker, i) => {
                      const desc = marker.replace(/\[IMAGE:\s*/, "").replace(/\]$/, "");
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-2 rounded-md p-2 text-sm"
                          style={{ backgroundColor: "var(--neutral-surface)" }}
                        >
                          <Badge
                            variant="outline"
                            className="shrink-0"
                            style={{ borderColor: "var(--brand-accent)", color: "var(--brand-accent)" }}
                          >
                            IMG {i + 1}
                          </Badge>
                          <span>{desc}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* 교차검증 패널 */}
          {showValidation && (
            <CrossValidationPanel
              generationId={currentGenerationId}
              onRegenerate={handleRegenerate}
              onProceed={() => setShowValidation(false)}
            />
          )}
        </div>

        {/* 우측: 사이드 패널 */}
        <div className="space-y-4">
          {/* SEO 점수 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center justify-between">
                <span>SEO 점수</span>
                <span
                  className="text-lg font-bold"
                  style={{
                    color:
                      seoResult.score >= seoResult.totalMax * 0.8
                        ? "var(--quality-excellent)"
                        : seoResult.score >= seoResult.totalMax * 0.6
                          ? "var(--quality-good)"
                          : "var(--quality-average)",
                  }}
                >
                  {seoResult.score}/{seoResult.totalMax}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {seoResult.checks.map((check, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5">
                    {check.passed ? (
                      <CheckCircle2
                        className="h-4 w-4 shrink-0"
                        style={{ color: "var(--quality-excellent)" }}
                      />
                    ) : (
                      <AlertTriangle
                        className="h-4 w-4 shrink-0"
                        style={{ color: "var(--quality-average)" }}
                      />
                    )}
                    <span>{check.label}</span>
                  </div>
                  <span className="text-xs text-[var(--neutral-text-muted)]">
                    {check.detail} ({check.score}/{check.maxScore})
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 생성 정보 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">생성 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-[var(--neutral-text-muted)]">
                  <Cpu className="h-4 w-4" />
                  LLM
                </span>
                <span>AI 생성</span>
              </div>
              {tokensUsed !== null && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-[var(--neutral-text-muted)]">
                    <Hash className="h-4 w-4" />
                    토큰
                  </span>
                  <span>{tokensUsed.toLocaleString()}</span>
                </div>
              )}
              {genTimeMs !== null && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-[var(--neutral-text-muted)]">
                    <Clock className="h-4 w-4" />
                    생성시간
                  </span>
                  <span>{Math.round(genTimeMs / 1000)}초</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-[var(--neutral-text-muted)]">
                  <Sparkles className="h-4 w-4" />
                  생성 ID
                </span>
                <span>#{currentGenerationId}</span>
              </div>
            </CardContent>
          </Card>

          {/* 태그 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">태그</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {editTags.map((tag, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {tag}
                    <button
                      onClick={() => removeTag(i)}
                      className="ml-1 hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-1">
                <input
                  type="text"
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="태그 추가"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                />
                <Button size="sm" variant="outline" onClick={addTag}>
                  추가
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 키워드 입력 (SEO 점수용) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">SEO 키워드</CardTitle>
            </CardHeader>
            <CardContent>
              <input
                type="text"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="SEO 분석용 키워드"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
