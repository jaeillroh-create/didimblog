"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { generateDraft, getTopicRecommendations } from "@/actions/ai";
import type { Category, LLMConfig } from "@/lib/types/database";
import { Sparkles, Lightbulb } from "lucide-react";

interface TopicRecommendation {
  week: number;
  category: string;
  sub: string;
  title: string;
  keyword: string;
  cta: string;
  target: string;
}

interface AiDraftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  llmConfigs?: LLMConfig[];
}

export function AiDraftDialog({
  open,
  onOpenChange,
  categories,
  llmConfigs = [],
}: AiDraftDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"recommend" | "manual">("recommend");

  // 추천 주제
  const [recommendations, setRecommendations] = useState<TopicRecommendation[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);

  // 폼 상태
  const [topic, setTopic] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [secondaryCategory, setSecondaryCategory] = useState("");
  const [keyword, setKeyword] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [selectedLlmId, setSelectedLlmId] = useState<string>("");

  // 에러
  const [error, setError] = useState<string | null>(null);

  const primaryCategories = categories.filter((c) => c.tier === "primary");
  const secondaryCategories = categories.filter(
    (c) => c.tier === "secondary" && c.parent_id === categoryId
  );
  const activeConfigs = llmConfigs.filter((c) => c.is_active);

  // 추천 주제 로드
  useEffect(() => {
    if (!open || activeTab !== "recommend" || recommendations.length > 0) return;

    let cancelled = false;
    setLoadingRecommendations(true);

    getTopicRecommendations().then((result) => {
      if (cancelled) return;
      if (result.success && result.topics) {
        setRecommendations(result.topics);
      }
      setLoadingRecommendations(false);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeTab]);

  function selectRecommendation(rec: TopicRecommendation) {
    setTopic(rec.title);
    setKeyword(rec.keyword);
    // 카테고리 매핑
    const matched = categories.find((c) =>
      c.name.includes(rec.category) || rec.category.includes(c.name)
    );
    if (matched) {
      if (matched.tier === "secondary" && matched.parent_id) {
        setCategoryId(matched.parent_id);
        setSecondaryCategory(matched.id);
      } else {
        setCategoryId(matched.id);
      }
    }
  }

  function resetForm() {
    setTopic("");
    setCategoryId("");
    setSecondaryCategory("");
    setKeyword("");
    setTargetAudience("");
    setAdditionalContext("");
    setSelectedLlmId("");
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim() || !categoryId || !keyword.trim()) return;

    setError(null);
    startTransition(async () => {
      const result = await generateDraft({
        topic: topic.trim(),
        categoryId,
        keyword: keyword.trim(),
        targetAudience: targetAudience || undefined,
        additionalContext: additionalContext.trim() || undefined,
        llmConfigId: selectedLlmId ? parseInt(selectedLlmId) : undefined,
      });

      if (!result.success) {
        setError(result.error || "AI 초안 생성에 실패했습니다.");
        return;
      }

      resetForm();
      onOpenChange(false);
      // AI 에디터 페이지로 이동
      router.push(`/contents/ai-editor/${result.generationId}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" style={{ color: "var(--brand-accent)" }} />
            AI 초안 생성
          </DialogTitle>
          <DialogDescription>
            AI가 카테고리별 톤과 SEO를 고려한 초안을 생성합니다.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "recommend" | "manual")}
        >
          <TabsList className="w-full">
            <TabsTrigger value="recommend" className="flex-1">
              <Lightbulb className="mr-1 h-4 w-4" />
              추천 주제
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex-1">
              직접 입력
            </TabsTrigger>
          </TabsList>

          <TabsContent value="recommend" className="mt-4 space-y-3">
            {loadingRecommendations ? (
              <div className="py-8 text-center text-sm text-[var(--neutral-text-muted)]">
                추천 주제를 불러오는 중...
              </div>
            ) : recommendations.length === 0 ? (
              <div className="py-8 text-center text-sm text-[var(--neutral-text-muted)]">
                이번 주 추천 주제가 없습니다. 직접 입력해 주세요.
              </div>
            ) : (
              recommendations.map((rec, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    selectRecommendation(rec);
                    setActiveTab("manual");
                  }}
                  className="w-full rounded-lg border p-3 text-left transition-colors hover:border-[var(--brand-accent)] hover:bg-[var(--neutral-surface)]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium" style={{ color: "var(--brand-accent)" }}>
                      {rec.category} {rec.sub ? `> ${rec.sub}` : ""}
                    </span>
                    <span className="text-xs text-[var(--neutral-text-muted)]">
                      W{rec.week}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium">{rec.title}</p>
                  {rec.keyword && (
                    <p className="mt-1 text-xs text-[var(--neutral-text-muted)]">
                      키워드: {rec.keyword}
                    </p>
                  )}
                </button>
              ))
            )}
          </TabsContent>

          <TabsContent value="manual" className="mt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 주제 */}
              <div className="space-y-2">
                <Label htmlFor="ai-topic">주제 *</Label>
                <Input
                  id="ai-topic"
                  placeholder="블로그 글 주제를 입력하세요"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  required
                />
              </div>

              {/* 카테고리 + 2차 분류 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>카테고리 *</Label>
                  <Select value={categoryId} onValueChange={(v) => {
                    setCategoryId(v);
                    setSecondaryCategory("");
                  }}>
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
                <div className="space-y-2">
                  <Label>2차 분류</Label>
                  <Select
                    value={secondaryCategory}
                    onValueChange={setSecondaryCategory}
                    disabled={secondaryCategories.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="2차 분류 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {secondaryCategories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 키워드 + 타깃고객 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="ai-keyword">핵심 키워드 *</Label>
                  <Input
                    id="ai-keyword"
                    placeholder="SEO 핵심 키워드"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>타깃 고객군</Label>
                  <Select value={targetAudience} onValueChange={setTargetAudience}>
                    <SelectTrigger>
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="startup">스타트업</SelectItem>
                      <SelectItem value="sme">중소기업</SelectItem>
                      <SelectItem value="cto">CTO/연구소장</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 참고사항 */}
              <div className="space-y-2">
                <Label htmlFor="ai-context">참고 사항 (선택)</Label>
                <textarea
                  id="ai-context"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="추가 참고사항을 입력하세요 (예: 최근 만난 제조업 대표님 사례 포함)"
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                />
              </div>

              {/* LLM 모델 선택 */}
              {activeConfigs.length > 0 && (
                <div className="space-y-2">
                  <Label>LLM 모델</Label>
                  <Select value={selectedLlmId} onValueChange={setSelectedLlmId}>
                    <SelectTrigger>
                      <SelectValue placeholder="기본 LLM 사용" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeConfigs.map((config) => (
                        <SelectItem key={config.id} value={String(config.id)}>
                          {config.display_name}
                          {config.is_default && " (기본)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {error && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  취소
                </Button>
                <Button
                  type="submit"
                  disabled={isPending || !topic.trim() || !categoryId || !keyword.trim()}
                  style={{ backgroundColor: "var(--brand-accent)" }}
                >
                  <Sparkles className="mr-1 h-4 w-4" />
                  {isPending ? "생성 준비 중..." : "AI 초안 생성 시작"}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
