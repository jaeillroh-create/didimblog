"use client";

import { useState, useEffect, useRef, useTransition } from "react";
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
import { CopyButton } from "@/components/common/copy-button";
import { toast } from "sonner";
import { DraftQualityPanel } from "@/components/contents/draft-quality-panel";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { calcDraftScore, validateDraft } from "@/lib/draft-validator";
import { CrossLLMValidationPanel } from "@/components/contents/cross-llm-validation-panel";
import {
  saveGenerationResult,
  markGenerationFailed,
  saveAiDraftToContent,
  savePhase1Output,
  savePhase2Output,
  getCategoryName,
  getGenerationMeta,
} from "@/actions/ai";
import {
  clientRunPhase1,
  clientRunPhase2,
  clientRunPhase3,
  appendCtaAndSignature,
  type ClientLLMProvider,
} from "@/lib/client-generate";
import {
  PHASE1_PROMPT,
  PHASE2_PROMPT,
  PHASE3_PROMPT_BY_KEY,
  CATEGORY_TONE_RULES,
  COMMON_WRITING_RULES,
  VISUAL_RULES,
  FIELD_CTA,
  getPromptKey,
  getFieldCta,
} from "@/lib/constants/prompts";
import { checkImageGenAvailable, generateAllInfographics, getGeneratedImages } from "@/actions/image-gen";
import { ImageGenPanel } from "@/components/contents/image-gen-panel";
import type { GenerationStatus, ImageMarker, Phase1Outline, PipelinePhase } from "@/lib/types/database";
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
  ExternalLink,
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

  // 교차검증 — 베이스 LLM 정보 (생성에 사용된 LLM. 나중에 재작성 시에도 사용)
  const baseLLMRef = useRef<{ apiKey: string; model: string; provider: ClientLLMProvider } | null>(null);

  // 본문 textarea hydration mismatch 방지용 highlight (교차검증 반영 시 잠깐 강조)
  const [bodyHighlight, setBodyHighlight] = useState(false);

  // 3-Phase 파이프라인 상태
  const [pipelinePhase, setPipelinePhase] = useState<PipelinePhase>("phase1");
  const [phase1Outline, setPhase1Outline] = useState<Phase1Outline | null>(null);
  const [phase3Loading, setPhase3Loading] = useState(false);
  const [phase3Error, setPhase3Error] = useState<string | null>(null);

  // 클라이언트 사이드 생성 — useRef로 한 번만 트리거
  const generationTriggered = useRef(false);
  const isMounted = useRef(true);
  const [streamingText, setStreamingText] = useState("");

  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

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

  // pending 감지 → 생성 시작 (한 번만)
  useEffect(() => {
    if (status === "pending" && !generationTriggered.current) {
      generationTriggered.current = true;
      startClientGeneration(currentGenerationId);
    }
  }, [status, currentGenerationId]);

  async function startClientGeneration(genId: number) {
    console.log("[AI Editor] 3-Phase 파이프라인 시작, genId:", genId);
    setStatus("generating");
    setPipelinePhase("phase1");
    setPhase1Outline(null);

    const startTime = Date.now();

    try {
      // ── 0. LLM 설정 + 생성 메타 조회 ──
      const configRes = await fetch("/api/llm-config");
      if (!configRes.ok) throw new Error("LLM 설정을 가져올 수 없습니다.");
      const configData = await configRes.json();

      if (configData.models && isMounted.current) {
        setAvailableModels(configData.models);
        if (!selectedModelId) {
          const def = configData.models.find((m: LLMModelOption) => m.isDefault) ?? configData.models[0];
          if (def) setSelectedModelId(String(def.id));
        }
      }

      const selected = configData.models?.find((m: LLMModelOption) => String(m.id) === selectedModelId);
      const apiKey = selected?.apiKey ?? configData.apiKey;
      const model = selected?.model ?? configData.model;
      const provider = (selected?.provider ?? configData.provider ?? "claude") as ClientLLMProvider;
      baseLLMRef.current = { apiKey, model, provider };
      const llm = { apiKey, model, provider };

      // 생성 메타 (topic, category_id, target_keyword) 조회
      const meta = await getGenerationMeta(genId);
      if (!meta.success || !meta.data) throw new Error(meta.error || "생성 메타 조회 실패");

      const topic = meta.data.topic ?? "";
      const categoryId = meta.data.category_id ?? "";
      const targetKeyword = meta.data.target_keyword ?? "";
      const promptKey = getPromptKey(categoryId);
      const categoryName = await getCategoryName(categoryId);

      if (targetKeyword && isMounted.current) {
        setKeyword(targetKeyword);
      }

      // ── Phase 1: 구조 설계 ──
      console.log("[Phase 1] 시작 — provider:", provider, "model:", model);
      if (isMounted.current) setStreamingText("📋 구조 설계 중...");
      const phase1Result = await clientRunPhase1({
        llm,
        phase1Prompt: PHASE1_PROMPT,
        categoryName,
        topic,
        targetKeyword,
      });

      if (!phase1Result.success || !phase1Result.outline) {
        throw new Error(phase1Result.error || "Phase 1 실패");
      }

      console.log("[Phase 1] 완료 — 제목:", phase1Result.outline.title);
      await savePhase1Output(genId, phase1Result.outline);
      if (isMounted.current) {
        setPhase1Outline(phase1Result.outline);
        setPipelinePhase("phase2");
      }

      // ── Phase 2: 본문 생성 (스트리밍) ──
      console.log("[Phase 2] 시작");
      if (isMounted.current) setStreamingText("");

      const phase2Result = await clientRunPhase2({
        llm,
        phase2Prompt: PHASE2_PROMPT,
        categoryToneRules: CATEGORY_TONE_RULES[promptKey],
        commonWritingRules: COMMON_WRITING_RULES,
        visualRules: VISUAL_RULES,
        phase1Outline: phase1Result.outline,
        onProgress: (text) => {
          if (isMounted.current) setStreamingText(text);
        },
      });

      if (!phase2Result.success || !phase2Result.body) {
        throw new Error(phase2Result.error || "Phase 2 실패");
      }

      console.log("[Phase 2] 완료, 길이:", phase2Result.body.length);
      const phase2Body = phase2Result.body;
      await savePhase2Output(genId, phase2Body);

      // 본문에서 이미지 마커 추출 (Phase 2 결과 기준)
      const imageMarkerRegex = /\[IMAGE:\s*([\s\S]+?)\]/g;
      const imageMarkers: { position: number; description: string }[] = [];
      let m: RegExpExecArray | null;
      while ((m = imageMarkerRegex.exec(phase2Body)) !== null) {
        imageMarkers.push({ position: m.index, description: m[1].slice(0, 100) });
      }

      // 제목은 Phase 1 outline 의 title 을 신뢰
      const title = phase1Result.outline.title;
      const generationTimeMs = Date.now() - startTime;

      // 저장 — Phase 3 는 사용자가 별도 트리거 (생략 가능)
      await saveGenerationResult(genId, {
        generatedText: phase2Body,
        generatedTitle: title,
        generatedTags: [],
        imageMarkers,
        generationTimeMs,
      });

      if (isMounted.current) {
        setGeneratedText(phase2Body);
        setGeneratedTitle(title);
        setEditText(phase2Body);
        setEditTitle(title);
        setStatus("completed");
        setPipelinePhase("phase3"); // Phase 3 트리거 가능 상태
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "생성 중 오류가 발생했습니다.";
      console.error("[AI Editor] 파이프라인 에러:", err);
      await markGenerationFailed(genId, errorMessage);
      if (isMounted.current) {
        setGenError(errorMessage);
        setStatus("failed");
        setPipelinePhase("failed");
      }
    }
  }

  /**
   * Phase 3 — SEO 정량 체크 + CTA/서명/태그 append
   * 사용자가 헤더의 "SEO 최적화 (Phase 3)" 버튼을 누르면 실행.
   * Phase 2 결과를 입력으로 받아 새 본문을 생성하고 editText 로 교체.
   */
  async function runPhase3() {
    if (!baseLLMRef.current) return;
    if (phase3Loading) return;

    setPhase3Loading(true);
    setPhase3Error(null);

    try {
      const meta = await getGenerationMeta(currentGenerationId);
      if (!meta.success || !meta.data) throw new Error(meta.error || "메타 조회 실패");

      const categoryId = meta.data.category_id ?? "";
      const targetKeyword = meta.data.target_keyword ?? "";
      const promptKey = getPromptKey(categoryId);
      const categoryName = await getCategoryName(categoryId);
      const phase3Prompt = PHASE3_PROMPT_BY_KEY[promptKey];

      const result = await clientRunPhase3({
        llm: baseLLMRef.current,
        phase3Prompt,
        targetKeyword,
        categoryName,
        phase2Body: editText,
        onProgress: (text) => {
          if (isMounted.current) setStreamingText(text);
        },
      });

      if (!result.success || !result.body) {
        throw new Error(result.error || "Phase 3 실패");
      }

      // CTA / 서명 / 태그 한 줄 append (다이어리는 자동으로 건너뜀)
      const cta = promptKey === "PROMPT_FIELD" ? getFieldCta(categoryId) : { cta: "", emailSubject: "" };
      const finalBody = appendCtaAndSignature({
        body: result.body,
        promptKey,
        ctaText: cta.cta || FIELD_CTA["CAT-A-01"]?.cta,
        emailSubject: cta.emailSubject || FIELD_CTA["CAT-A-01"]?.emailSubject,
        targetKeyword,
      });

      if (isMounted.current) {
        setEditText(finalBody);
        setBodyHighlight(true);
        setTimeout(() => setBodyHighlight(false), 3000);
        setPipelinePhase("completed");
        setStreamingText("");
      }

      // DB 저장
      await saveGenerationResult(currentGenerationId, {
        generatedText: finalBody,
        generatedTitle: editTitle,
        generatedTags: [],
        imageMarkers: [],
        generationTimeMs: 0,
      });
      toast.success("Phase 3 SEO 최적화 완료");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Phase 3 실패";
      console.error("[Phase 3] 에러:", err);
      setPhase3Error(msg);
      toast.error(msg);
    } finally {
      setPhase3Loading(false);
    }
  }

  /**
   * 교차검증 패널에서 개별 issue 반영 시 호출.
   * 본문에서 originalText → replacementText 교체.
   * 매칭 성공하면 textarea 를 잠깐 강조해서 사용자에게 시각적 피드백.
   */
  function applyFixToBody(originalText: string, replacementText: string): boolean {
    if (!editText.includes(originalText)) return false;
    setEditText((prev) => prev.replace(originalText, replacementText));
    setBodyHighlight(true);
    setTimeout(() => setBodyHighlight(false), 3000);
    return true;
  }

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

  // 저장 경고 다이얼로그
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);

  // 저장 실행
  function doSave() {
    startTransition(async () => {
      const result = await saveAiDraftToContent(currentGenerationId, {
        title: editTitle,
        body: editText,
        tags: editTags,
        keyword: keyword || undefined,
      });

      if (!result.success) {
        setGenError(result.error || "저장에 실패했습니다.");
        return;
      }

      router.push("/contents");
    });
  }

  // 저장 버튼 클릭: 미통과 3개 이상이면 확인 모달
  function handleSave() {
    const draftChecks = validateDraft(editTitle, editText, "");
    const { failedItems } = calcDraftScore(draftChecks);
    if (failedItems.length >= 3) {
      setSaveConfirmOpen(true);
    } else {
      doSave();
    }
  }

  function handleRegenerate(newGenId: number) {
    setCurrentGenerationId(newGenId);
    setStatus("pending");
    generationTriggered.current = false;
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
        {/* 3-Phase 진행 인디케이터 */}
        <PhaseIndicator phase={pipelinePhase} />
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
            {pipelinePhase === "phase3" && (
              <Button
                variant="outline"
                onClick={runPhase3}
                disabled={phase3Loading}
                title="Phase 3 — 키워드 빈도/볼드/구분선 등 SEO 정량 체크 + CTA·서명·태그 추가"
              >
                {phase3Loading ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-4 w-4" />
                )}
                {phase3Loading ? "SEO 최적화 중..." : "🔍 SEO 최적화 (Phase 3)"}
              </Button>
            )}
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

      {/* Phase 3 에러 표시 */}
      {phase3Error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          Phase 3 SEO 최적화 실패: {phase3Error}
          <span className="block text-xs text-red-600 mt-1">
            현재 본문(Phase 2 결과)을 그대로 사용할 수 있습니다.
          </span>
        </div>
      )}

      {/* Phase 1 outline 미리보기 (collapsed) */}
      {phase1Outline && (
        <details className="rounded-md border border-dashed p-2 bg-muted/20">
          <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground">
            📋 Phase 1 구조 ({phase1Outline.sections?.length ?? 0}개 섹션 · 키워드 {phase1Outline.keyword_plan?.total_count ?? "?"}회 · {phase1Outline.legal_references?.length ?? 0}개 법령)
          </summary>
          <pre className="mt-2 text-[10px] overflow-x-auto whitespace-pre-wrap text-muted-foreground font-mono">
            {JSON.stringify(phase1Outline, null, 2)}
          </pre>
        </details>
      )}

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
              <label className="text-sm font-medium mb-2 block flex items-center gap-2">
                본문
                {bodyHighlight && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#dcfce7", color: "var(--quality-excellent)" }}>
                    ✓ 본문에 반영됨
                  </span>
                )}
              </label>
              <textarea
                className={`w-full min-h-[500px] rounded-md border bg-background px-4 py-3 text-sm leading-relaxed font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring whitespace-pre-wrap transition-all duration-300 ${
                  bodyHighlight
                    ? "border-[var(--quality-excellent)] shadow-[0_0_0_3px_rgba(34,197,94,0.15)]"
                    : "border-input"
                }`}
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
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const bodyWithoutMarkers = editText.replace(/\[IMAGE:[^\]]+\]/g, "").replace(/\n{3,}/g, "\n\n");
                        const markerTexts = imageMarkers.map((m, i) => `[IMG ${i + 1}]\n${m.rawText}`).join("\n\n");
                        const fullCopy = `---\n[블로그 글 전체 내용]\n${bodyWithoutMarkers}\n\n---\n\n위 블로그 글의 맥락에 맞게 아래 ${imageMarkers.length}개의 인포그래픽을 생성해주세요.\n각 인포그래픽은 블로그 본문의 해당 위치에 삽입될 이미지입니다.\n한국어로 작성하고, 세련된 비즈니스 스타일로 만들어주세요.\n\n${markerTexts}\n---`;
                        navigator.clipboard.writeText(fullCopy).then(() => toast.success("본문 + 이미지 프롬프트가 복사되었습니다"));
                      }}
                    >
                      전체 복사 (본문+이미지)
                    </Button>
                    <a
                      href="https://www.genspark.ai"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border hover:bg-muted/50 transition-colors"
                    >
                      Genspark.ai
                      <ExternalLink className="h-3 w-3" />
                    </a>
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
                  </div>
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
                        <span className="flex-1">{marker.description}</span>
                        <CopyButton
                          text={marker.rawText}
                          label="복사"
                          toastMessage="이미지 프롬프트가 복사되었습니다"
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs shrink-0"
                        />
                      </div>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 교차검증 패널 — 헤더 "교차검증" 버튼이 유일한 트리거 */}
          {showValidation && baseLLMRef.current && (
            <CrossLLMValidationPanel
              title={editTitle}
              body={editText}
              availableModels={availableModels}
              baseProvider={baseLLMRef.current.provider}
              baseModel={baseLLMRef.current.model}
              baseApiKey={baseLLMRef.current.apiKey}
              onApplyFix={applyFixToBody}
              onApplyRewrite={(newBody) => {
                setEditText(newBody);
                setBodyHighlight(true);
                setTimeout(() => setBodyHighlight(false), 3000);
              }}
              onClose={() => setShowValidation(false)}
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

          {/* 초안 품질 체크 */}
          <DraftQualityPanel
            title={editTitle}
            body={editText}
            categoryId=""
          />

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

      {/* 저장 경고 다이얼로그 */}
      <ConfirmDialog
        open={saveConfirmOpen}
        onOpenChange={setSaveConfirmOpen}
        title="품질 체크 미통과 항목 있음"
        description={`품질 체크 미통과 항목이 ${validateDraft(editTitle, editText, "").filter((c) => !c.passed).length}개 있습니다. 그래도 저장하시겠습니까?`}
        confirmLabel="저장"
        onConfirm={() => {
          setSaveConfirmOpen(false);
          doSave();
        }}
      />
    </div>
  );
}

/**
 * 3-Phase 진행 인디케이터.
 * 생성 중 페이지 상단에서 현재 단계를 시각적으로 보여준다.
 */
function PhaseIndicator({ phase }: { phase: PipelinePhase }) {
  const steps: { key: PipelinePhase; icon: string; label: string }[] = [
    { key: "phase1", icon: "📋", label: "구조 설계" },
    { key: "phase2", icon: "✍️", label: "본문 작성" },
    { key: "phase3", icon: "🔍", label: "SEO 최적화" },
  ];

  // 현재 phase 인덱스 (completed 면 모두 done)
  const order: Record<PipelinePhase, number> = {
    phase1: 0,
    phase2: 1,
    phase3: 2,
    completed: 3,
    failed: -1,
  };
  const current = order[phase];

  return (
    <div className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => {
        const done = current > i || phase === "completed";
        const active = current === i && phase !== "completed" && phase !== "failed";
        const failed = phase === "failed" && i === Math.max(0, current);
        return (
          <div key={s.key} className="flex items-center gap-1">
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border ${
                done
                  ? "bg-[var(--quality-excellent)]/10 border-[var(--quality-excellent)] text-[var(--quality-excellent)]"
                  : active
                    ? "bg-[var(--brand-accent)]/10 border-[var(--brand-accent)] text-[var(--brand-accent)] animate-pulse"
                    : failed
                      ? "bg-red-50 border-red-300 text-red-600"
                      : "bg-muted/30 border-input text-muted-foreground"
              }`}
            >
              {done ? "✅" : active ? "⏳" : s.icon} {s.label}
            </span>
            {i < steps.length - 1 && (
              <span className="text-muted-foreground">→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
