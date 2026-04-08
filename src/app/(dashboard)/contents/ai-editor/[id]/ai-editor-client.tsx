"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/common/page-header";
import { CrossValidationPanel } from "@/components/contents/cross-validation-panel";
import {
  getGenerationStatus,
  getGenerationPrompt,
  saveGenerationResult,
  markGenerationFailed,
} from "@/actions/ai";
import { clientGenerateDraft } from "@/lib/client-generate";
import { createContent } from "@/actions/contents";
import { checkImageGenAvailable, generateAllInfographics, getGeneratedImages } from "@/actions/image-gen";
import { ImageGenPanel } from "@/components/contents/image-gen-panel";
import type { GenerationStatus, ImageMarker } from "@/lib/types/database";
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

// 간이 SEO 체크
function calculateSeoScore(title: string, text: string, keyword: string) {
  const checks: { label: string; passed: boolean; detail: string }[] = [];

  // 제목 길이
  const titleLen = title.length;
  checks.push({
    label: "제목 길이 25~30자",
    passed: titleLen >= 25 && titleLen <= 30,
    detail: `${titleLen}자`,
  });

  // 제목 키워드 앞 15자
  const keywordInFirst15 = title.substring(0, 15).includes(keyword);
  checks.push({
    label: "키워드 앞 15자",
    passed: keywordInFirst15 || keyword.length === 0,
    detail: keywordInFirst15 ? "포함됨" : "미포함",
  });

  // 본문 키워드 횟수
  const keywordCount = keyword
    ? (text.match(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length
    : 0;
  checks.push({
    label: "본문 키워드 3~5회",
    passed: keywordCount >= 3 && keywordCount <= 5,
    detail: `${keywordCount}회`,
  });

  // 소제목 개수
  const headingCount = (text.match(/^##\s/gm) || []).length;
  checks.push({
    label: "소제목(##) 2개 이상",
    passed: headingCount >= 2,
    detail: `${headingCount}개`,
  });

  // 이미지 마커
  const imageMarkers = (text.match(/\[IMAGE:\s*.+?\]/g) || []).length;
  checks.push({
    label: "이미지 마커 3개 이상",
    passed: imageMarkers >= 3,
    detail: `${imageMarkers}개`,
  });

  // 본문 분량
  const charCount = text.replace(/\s/g, "").length;
  checks.push({
    label: "본문 1,500~2,500자",
    passed: charCount >= 1500 && charCount <= 2500,
    detail: `${charCount.toLocaleString()}자`,
  });

  // 태그 확인 (#태그)
  const tagCount = (text.match(/#[^\s#]+/g) || []).length;
  checks.push({
    label: "태그 10개",
    passed: tagCount >= 8,
    detail: `${tagCount}개`,
  });

  // CTA 존재 여부
  const hasCta = text.includes("절세 시뮬레이션") || text.includes("연락") || text.includes("상담") || text.includes("이웃");
  checks.push({
    label: "CTA 배치",
    passed: hasCta,
    detail: hasCta ? "있음" : "없음",
  });

  const passedCount = checks.filter((c) => c.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);

  return { checks, score, passedCount, totalCount: checks.length };
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

  // 교차검증
  const [showValidation, setShowValidation] = useState(false);
  const [currentGenerationId, setCurrentGenerationId] = useState(generationId);

  // 이미지 생성
  const [imageGenAvailable, setImageGenAvailable] = useState(false);
  const [generatedImageUrls, setGeneratedImageUrls] = useState<Record<number, string>>({});
  const [bulkGenerating, setBulkGenerating] = useState(false);

  // 클라이언트 사이드 생성: pending이면 브라우저에서 직접 Anthropic API 호출
  const [executionTriggered, setExecutionTriggered] = useState(false);
  const [streamingText, setStreamingText] = useState("");

  // LLM 모델 선택
  interface LLMModelOption {
    id: number;
    displayName: string;
    model: string;
    provider: string;
    apiKey: string;
    isDefault: boolean;
  }
  const [availableModels, setAvailableModels] = useState<LLMModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>("");

  console.log("[AI Editor] 마운트됨, generationId:", currentGenerationId, "status:", status);

  useEffect(() => {
    let cancelled = false;

    async function clientSideGenerate() {
      if (status !== "pending" || executionTriggered) return;

      console.log("[AI Editor] pending 감지, 클라이언트 생성 시작");
      setExecutionTriggered(true);
      setStatus("generating");

      const startTime = Date.now();

      try {
        // 1. LLM 설정 조회 (짧은 요청)
        console.log("[AI Editor] LLM config 조회 시작");
        const configRes = await fetch("/api/llm-config");
        if (!configRes.ok) {
          throw new Error("LLM 설정을 가져올 수 없습니다.");
        }
        const configData = await configRes.json();
        console.log("[AI Editor] LLM config 응답:", configData.apiKey ? "키 있음" : "키 없음", "모델:", configData.model);

        // 모델 목록 저장
        if (configData.models) {
          setAvailableModels(configData.models);
          if (!selectedModelId) {
            const def = configData.models.find((m: LLMModelOption) => m.isDefault) ?? configData.models[0];
            if (def) setSelectedModelId(String(def.id));
          }
        }

        // 선택된 모델 또는 기본 모델 사용
        const selected = configData.models?.find((m: LLMModelOption) => String(m.id) === selectedModelId);
        const apiKey = selected?.apiKey ?? configData.apiKey;
        const model = selected?.model ?? configData.model;

        // 2. 프롬프트 조립 (Server Action, 짧은 요청)
        console.log("[AI Editor] getGenerationPrompt 호출 시작, generationId:", currentGenerationId);
        const promptResult = await getGenerationPrompt(currentGenerationId);
        console.log("[AI Editor] getGenerationPrompt 응답:", promptResult.success ? "성공" : "실패", promptResult);
        if (!promptResult.success || !promptResult.messages) {
          throw new Error(promptResult.error || "프롬프트 조립 실패");
        }

        if (cancelled) {
          console.log("[AI Editor] cancelled=true, 생성 중단");
          return;
        }

        // 3. 브라우저에서 직접 Anthropic API 스트리밍 호출
        console.log("[AI Editor] clientGenerateDraft 준비 중...");
        console.log("[AI Editor] apiKey:", apiKey ? `${apiKey.slice(0, 8)}...` : "없음");
        console.log("[AI Editor] model:", model);
        console.log("[AI Editor] messages 길이:", promptResult.messages?.length);
        console.log("[AI Editor] messages[0] role:", promptResult.messages?.[0]?.role, "내용 길이:", promptResult.messages?.[0]?.content?.length);

        console.log("[AI Editor] clientGenerateDraft 호출 직전");
        const fullText = await clientGenerateDraft({
          messages: promptResult.messages,
          model,
          apiKey,
          onProgress: (text) => {
            if (!cancelled) {
              setStreamingText(text);
              if (text.length % 500 < 20) {
                console.log("[AI Editor] 스트리밍 수신 중, 길이:", text.length);
              }
            }
          },
        });
        console.log("[AI Editor] clientGenerateDraft 완료, 길이:", fullText?.length);

        if (cancelled) return;

        const generationTimeMs = Date.now() - startTime;

        // 4. 결과 파싱
        const lines = fullText.split("\n").filter((l) => l.trim());
        let title = lines[0]?.replace(/^#+\s*/, "").trim() || "";
        if (title.length > 50) title = title.substring(0, 50);

        let tags: string[] = [];
        const tagsMatch = fullText.match(/\[TAGS\]\s*([\s\S]*?)\s*\[\/TAGS\]/);
        if (tagsMatch) {
          tags = tagsMatch[1].split(/[,\n]/).map((t) => t.replace(/^\d+\.\s*/, "").trim()).filter(Boolean).slice(0, 10);
        } else {
          const tagMatches = fullText.match(/#([^\s#]+)/g);
          tags = tagMatches ? tagMatches.map((t) => t.replace("#", "")).slice(0, 10) : [];
        }

        const imageMarkerRegex = /\[IMAGE:\s*(.+?)\]/g;
        const imageMarkers: { position: number; description: string }[] = [];
        let match;
        while ((match = imageMarkerRegex.exec(fullText)) !== null) {
          imageMarkers.push({ position: match.index, description: match[1] });
        }

        // 5. DB에 결과 저장 (Server Action, 짧은 요청)
        await saveGenerationResult(currentGenerationId, {
          generatedText: fullText,
          generatedTitle: title,
          generatedTags: tags,
          imageMarkers,
          generationTimeMs,
        });

        if (cancelled) return;

        // 6. UI 상태 업데이트
        setGeneratedText(fullText);
        setGeneratedTitle(title);
        setGeneratedTags(tags);
        setEditText(fullText);
        setEditTitle(title);
        setEditTags(tags);
        setStatus("completed");
      } catch (err) {
        if (cancelled) return;
        const errorMessage = err instanceof Error ? err.message : "생성 중 오류가 발생했습니다.";
        console.error("[AI Editor] 생성 에러:", err);
        setGenError(errorMessage);
        setStatus("failed");
        await markGenerationFailed(currentGenerationId, errorMessage);
      }
    }

    // 이미 generating인 상태로 페이지 진입 시 (새로고침 등) → 폴링으로 대기
    async function pollExisting() {
      if (status !== "generating" || !executionTriggered) return;
      // 이미 클라이언트 생성이 진행 중이면 스킵 (streamingText가 있으면 진행 중)
      if (streamingText) return;

      const pollStart = Date.now();
      const interval = setInterval(async () => {
        if (cancelled || Date.now() - pollStart > 120_000) {
          clearInterval(interval);
          if (!cancelled) {
            console.log("[AI Editor] 타임아웃 발생");
            setGenError("생성 시간이 초과되었습니다.");
            setStatus("failed");
          }
          return;
        }
        const result = await getGenerationStatus(currentGenerationId);
        if (cancelled) { clearInterval(interval); return; }
        if (result.status === "completed") {
          clearInterval(interval);
          setGeneratedText(result.generatedText || "");
          setGeneratedTitle(result.generatedTitle || "");
          setGeneratedTags(result.generatedTags || []);
          setEditText(result.generatedText || "");
          setEditTitle(result.generatedTitle || "");
          setEditTags(result.generatedTags || []);
          setStatus("completed");
        } else if (result.status === "failed") {
          clearInterval(interval);
          setGenError(result.error || "AI 초안 생성에 실패했습니다.");
          setStatus("failed");
        }
      }, 2000);
      return () => clearInterval(interval);
    }

    clientSideGenerate();
    pollExisting();

    return () => { cancelled = true; };
  }, [status, currentGenerationId, executionTriggered]);

  // 이미지 생성 가능 여부 + 기존 이미지 로드
  useEffect(() => {
    checkImageGenAvailable().then(setImageGenAvailable);
  }, []);

  useEffect(() => {
    if (status === "completed") {
      getGeneratedImages(currentGenerationId).then((result) => {
        if (result.success && result.images) {
          const urls: Record<number, string> = {};
          for (const img of result.images) {
            if (img.public_url) {
              urls[img.marker_index] = img.public_url;
            }
          }
          setGeneratedImageUrls(urls);
        }
      });
    }
  }, [status, currentGenerationId]);

  // 이미지 마커 추출 (재사용)
  const imageMarkers: (ImageMarker & { rawText: string })[] = [];
  const markerRegex = /\[IMAGE:\s*(.+?)\]/g;
  let markerMatch;
  while ((markerMatch = markerRegex.exec(editText)) !== null) {
    imageMarkers.push({
      position: markerMatch.index,
      description: markerMatch[1],
      rawText: markerMatch[0],
      imageUrl: generatedImageUrls[imageMarkers.length] || undefined,
    });
  }

  function handleImageGenerated(markerIndex: number, imageUrl: string) {
    setGeneratedImageUrls((prev) => ({ ...prev, [markerIndex]: imageUrl }));
  }

  async function handleBulkGenerate() {
    if (imageMarkers.length === 0) return;
    setBulkGenerating(true);

    const markers = imageMarkers.map((m, i) => ({
      index: i,
      description: m.description,
    }));

    const result = await generateAllInfographics({
      generationId: currentGenerationId,
      blogTopic: editTitle,
      markers,
    });

    if (result.success) {
      const urls: Record<number, string> = { ...generatedImageUrls };
      for (const img of result.images) {
        if (img.imageUrl) {
          urls[img.markerIndex] = img.imageUrl;
        }
      }
      setGeneratedImageUrls(urls);
    }

    setBulkGenerating(false);
  }

  // SEO 점수 계산
  const seoResult = calculateSeoScore(editTitle, editText, keyword);

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
        category_id: "CAT-A", // TODO: 생성 시 카테고리 정보 연동
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
    setExecutionTriggered(false);
    setStreamingText("");
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
        {/* 모델 선택 (생성 시작 전에만 변경 가능) */}
        {availableModels.length > 1 && !streamingText && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">LLM 모델:</span>
            <Select value={selectedModelId} onValueChange={setSelectedModelId}>
              <SelectTrigger className="w-[280px] h-8 text-sm">
                <SelectValue placeholder="모델 선택" />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.displayName}{m.isDefault ? " (기본)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {streamingText ? (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-3">
                <Loader2
                  className="h-4 w-4 animate-spin"
                  style={{ color: "var(--brand-accent)" }}
                />
                <span className="text-sm font-medium">초안 작성 중... ({streamingText.replace(/\s/g, "").length.toLocaleString()}자)</span>
              </div>
              <div
                className="w-full min-h-[300px] max-h-[500px] overflow-y-auto rounded-md border border-input bg-muted/30 px-4 py-3 text-sm leading-relaxed font-mono whitespace-pre-wrap"
              >
                {streamingText}
                <span className="inline-block w-1.5 h-4 bg-[var(--brand-accent)] animate-pulse ml-0.5" />
              </div>
            </CardContent>
          </Card>
        ) : (
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
        )}
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
          <div className="flex flex-wrap gap-2">
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

          {/* 이미지 마커 목록 + 이미지 생성 */}
          {imageMarkers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <ImageIcon className="h-4 w-4" />
                    이미지 마커 ({imageMarkers.length}개)
                  </span>
                  {imageGenAvailable && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleBulkGenerate}
                      disabled={bulkGenerating}
                    >
                      {bulkGenerating ? (
                        <>
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          일괄 생성 중...
                        </>
                      ) : (
                        <>
                          <ImageIcon className="mr-1 h-3.5 w-3.5" />
                          전체 이미지 일괄 생성
                        </>
                      )}
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {imageMarkers.map((marker, i) =>
                    imageGenAvailable ? (
                      <ImageGenPanel
                        key={i}
                        marker={{ ...marker, imageUrl: generatedImageUrls[i] }}
                        markerIndex={i}
                        generationId={currentGenerationId}
                        blogTopic={editTitle}
                        onImageGenerated={handleImageGenerated}
                      />
                    ) : (
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
                        <span>{marker.description}</span>
                      </div>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          )}

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
                      seoResult.score >= 80
                        ? "var(--quality-excellent)"
                        : seoResult.score >= 60
                          ? "var(--quality-good)"
                          : "var(--quality-average)",
                  }}
                >
                  {seoResult.score}/100
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
                    {check.detail}
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
