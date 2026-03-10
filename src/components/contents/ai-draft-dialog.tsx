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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateDraft, getTopicRecommendations } from "@/actions/ai";
import { searchNews, expandKeywords, summarizeSearchResults } from "@/actions/news-search";
import type { SearchSortOption } from "@/actions/news-search";
import type { Category, LLMConfig, NewsArticle } from "@/lib/types/database";
import {
  Sparkles,
  Lightbulb,
  Newspaper,
  Loader2,
  ExternalLink,
  Check,
  Wand2,
  X,
  ArrowUpDown,
  FileText,
} from "lucide-react";

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

  // 뉴스 검색
  const [newsQuery, setNewsQuery] = useState("");
  const [newsResults, setNewsResults] = useState<NewsArticle[]>([]);
  const [selectedNews, setSelectedNews] = useState<Set<number>>(new Set());
  const [searchingNews, setSearchingNews] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<SearchSortOption>("date");

  // AI 키워드 확장
  const [expandedKeywords, setExpandedKeywords] = useState<string[]>([]);
  const [expandingKeywords, setExpandingKeywords] = useState(false);

  // AI 요약
  const [summarizing, setSummarizing] = useState(false);
  const [summaryText, setSummaryText] = useState<string | null>(null);

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

  // AI 키워드 확장
  async function handleExpandKeywords() {
    const kw = keyword.trim();
    if (!kw) return;

    setExpandingKeywords(true);
    const result = await expandKeywords(kw);
    if (result.success && result.keywords) {
      setExpandedKeywords(result.keywords);
    }
    setExpandingKeywords(false);
  }

  // 뉴스 검색
  async function handleSearchNews(queryOverride?: string) {
    const q = queryOverride || newsQuery.trim() || keyword.trim();
    if (!q) {
      setNewsError("키워드를 입력하거나 핵심 키워드를 먼저 입력해주세요.");
      return;
    }

    setSearchingNews(true);
    setNewsError(null);
    setSummaryText(null);

    const result = await searchNews(q, 10, sortOption);

    if (!result.success) {
      setNewsError(result.error || "뉴스 검색에 실패했습니다.");
      setSearchingNews(false);
      return;
    }

    setNewsResults(result.articles || []);
    setSelectedNews(new Set());
    setSearchingNews(false);
  }

  // AI 요약
  async function handleSummarize() {
    const selected = newsResults.filter((_, i) => selectedNews.has(i));
    if (selected.length === 0) return;

    setSummarizing(true);
    const result = await summarizeSearchResults(selected, keyword.trim() || newsQuery.trim());
    if (result.success && result.summary) {
      setSummaryText(result.summary);
    }
    setSummarizing(false);
  }

  // 요약 결과를 참고사항에 첨부
  function applySummary() {
    if (!summaryText) return;
    setAdditionalContext((prev) =>
      prev ? `${prev}\n\n--- AI 뉴스 분석 ---\n${summaryText}` : `--- AI 뉴스 분석 ---\n${summaryText}`
    );
    setSummaryText(null);
  }

  // 선택된 뉴스를 참고사항에 첨부
  function applySelectedNews() {
    if (selectedNews.size === 0) return;

    const selected = newsResults.filter((_, i) => selectedNews.has(i));
    const newsText = selected
      .map((a, i) => `[참고 뉴스 ${i + 1}] ${a.title}\n${a.description}\n출처: ${a.link}`)
      .join("\n\n");

    setAdditionalContext((prev) =>
      prev ? `${prev}\n\n--- 참고 뉴스 ---\n${newsText}` : `--- 참고 뉴스 ---\n${newsText}`
    );
    setNewsResults([]);
    setSelectedNews(new Set());
  }

  function toggleNewsSelection(index: number) {
    setSelectedNews((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function formatDate(dateStr: string): string {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "";
      return `${d.getMonth() + 1}/${d.getDate()}`;
    } catch {
      return "";
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
    setNewsQuery("");
    setNewsResults([]);
    setSelectedNews(new Set());
    setNewsError(null);
    setExpandedKeywords([]);
    setSummaryText(null);
    setSortOption("date");
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
      router.push(`/contents/ai-editor/${result.generationId}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] max-h-[85vh] overflow-y-auto">
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
              <div className="py-8 text-center space-y-2">
                <p className="text-sm text-[var(--neutral-text-muted)]">
                  추천 주제 없음 — 직접 입력해주세요
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab("manual")}
                >
                  직접 입력으로 이동
                </Button>
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
                  <div className="flex gap-1.5">
                    <Input
                      id="ai-keyword"
                      placeholder="SEO 핵심 키워드"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      required
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0 h-9 w-9"
                      onClick={handleExpandKeywords}
                      disabled={expandingKeywords || !keyword.trim()}
                      title="AI 연관 키워드 확장"
                    >
                      {expandingKeywords ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Wand2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                  {/* 확장 키워드 pills */}
                  {expandedKeywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {expandedKeywords.map((kw, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setNewsQuery(kw);
                            handleSearchNews(kw);
                          }}
                          className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors hover:border-[var(--brand-accent)] hover:bg-[var(--brand-accent)]/5"
                        >
                          {kw}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setExpandedKeywords([])}
                        className="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs text-[var(--neutral-text-muted)] hover:text-red-500"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
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

              {/* 관련 뉴스 검색 */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Newspaper className="h-3.5 w-3.5" />
                  관련 뉴스 검색
                </Label>
                <div className="flex gap-2">
                  <Input
                    placeholder={keyword ? `"${keyword}" 로 검색 (또는 다른 키워드 입력)` : "검색 키워드 입력"}
                    value={newsQuery}
                    onChange={(e) => setNewsQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSearchNews();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSearchNews()}
                    disabled={searchingNews}
                    className="shrink-0"
                  >
                    {searchingNews ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "검색"
                    )}
                  </Button>
                </div>

                {/* 정렬 옵션 */}
                {newsResults.length > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-[var(--neutral-text-muted)]">
                        검색 결과 {newsResults.length}건
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const next = sortOption === "date" ? "relevance" : "date";
                          setSortOption(next);
                          handleSearchNews();
                        }}
                        className="flex items-center gap-1 text-xs text-[var(--neutral-text-muted)] hover:text-[var(--brand-accent)]"
                      >
                        <ArrowUpDown className="h-3 w-3" />
                        {sortOption === "date" ? "최신순" : "관련순"}
                      </button>
                      {selectedNews.size > 0 && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleSummarize}
                            disabled={summarizing}
                            className="text-xs h-7"
                          >
                            {summarizing ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <FileText className="mr-1 h-3 w-3" />
                            )}
                            AI 요약
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={applySelectedNews}
                            className="text-xs h-7"
                          >
                            {selectedNews.size}건 첨부
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {newsError && (
                  <p className="text-xs text-red-600">{newsError}</p>
                )}

                {/* AI 요약 결과 */}
                {summaryText && (
                  <div className="rounded-md border border-[var(--brand-accent)]/30 bg-[var(--brand-accent)]/5 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium" style={{ color: "var(--brand-accent)" }}>
                        AI 뉴스 분석
                      </span>
                      <div className="flex gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={applySummary}
                          className="text-xs h-6 px-2"
                        >
                          참고사항에 추가
                        </Button>
                        <button
                          type="button"
                          onClick={() => setSummaryText(null)}
                          className="text-[var(--neutral-text-muted)] hover:text-red-500"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="text-xs leading-relaxed whitespace-pre-wrap text-[var(--neutral-text-default)]">
                      {summaryText}
                    </div>
                  </div>
                )}

                {/* 뉴스 결과 */}
                {newsResults.length > 0 && (
                  <div className="space-y-1 max-h-[220px] overflow-y-auto rounded-md border p-2">
                    {newsResults.map((article, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleNewsSelection(i)}
                        className={`w-full rounded-md p-2 text-left text-xs transition-colors ${
                          selectedNews.has(i)
                            ? "bg-[var(--brand-accent)]/10 border border-[var(--brand-accent)]/30"
                            : "hover:bg-gray-50 border border-transparent"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              selectedNews.has(i)
                                ? "border-[var(--brand-accent)] bg-[var(--brand-accent)] text-white"
                                : "border-gray-300"
                            }`}
                          >
                            {selectedNews.has(i) && <Check className="h-3 w-3" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium leading-snug line-clamp-1 flex-1">
                                {article.title}
                              </p>
                              {article.source && (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 text-[10px] px-1.5 py-0"
                                  style={
                                    article.source === "naver"
                                      ? { borderColor: "#03c75a", color: "#03c75a" }
                                      : { borderColor: "#4285f4", color: "#4285f4" }
                                  }
                                >
                                  {article.source === "naver" ? "N" : "G"}
                                </Badge>
                              )}
                            </div>
                            <p className="mt-0.5 text-[var(--neutral-text-muted)] line-clamp-2">
                              {article.description}
                            </p>
                            <div className="mt-1 flex items-center gap-2 text-[var(--neutral-text-muted)]">
                              {article.pubDate && (
                                <span className="text-[10px]">{formatDate(article.pubDate)}</span>
                              )}
                            </div>
                          </div>
                          <a
                            href={article.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0 text-[var(--neutral-text-muted)] hover:text-[var(--brand-accent)]"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
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
