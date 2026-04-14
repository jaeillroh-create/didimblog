"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Square,
  CheckSquare,
} from "lucide-react";
import {
  clientCrossValidate,
  clientRewriteWithFeedback,
  type ClientLLMProvider,
  type CrossValidationProviderConfig,
  type CrossValidationProviderResult,
  type FactCheckIssue,
  type SelectedIssue,
} from "@/lib/client-generate";
import { PROMPT_FACT_CHECK } from "@/lib/constants/prompts";

interface LLMModelOption {
  id: number;
  displayName: string;
  model: string;
  provider: string;
  apiKey: string;
  isDefault: boolean;
}

interface CrossLLMValidationPanelProps {
  title: string;
  body: string;
  availableModels: LLMModelOption[]; // /api/llm-config 에서 받은 전체 모델
  baseProvider: ClientLLMProvider; // 재작성에 사용할 원본 LLM
  baseModel: string;
  baseApiKey: string;
  onApplyRewrite: (newBody: string) => void;
  onClose?: () => void;
}

const SEVERITY_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  high: { color: "#dc2626", bg: "#fee2e2", label: "높음" },
  medium: { color: "#d97706", bg: "#fef3c7", label: "중간" },
  low: { color: "#6b7280", bg: "#f3f4f6", label: "낮음" },
};

const VERDICT_STYLES: Record<string, { color: string; bg: string; label: string; icon: typeof CheckCircle2 }> = {
  pass: { color: "var(--quality-excellent)", bg: "#dcfce7", label: "통과", icon: CheckCircle2 },
  fix_required: { color: "var(--quality-average)", bg: "#fef3c7", label: "수정 필요", icon: AlertTriangle },
  major_issues: { color: "var(--quality-critical)", bg: "#fee2e2", label: "주요 문제", icon: XCircle },
};

interface IssueRow {
  key: string;
  provider: ClientLLMProvider;
  providerLabel: string;
  issue: FactCheckIssue;
}

export function CrossLLMValidationPanel({
  title,
  body,
  availableModels,
  baseProvider,
  baseModel,
  baseApiKey,
  onApplyRewrite,
  onClose,
}: CrossLLMValidationPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [isValidating, setIsValidating] = useState(false);
  const [results, setResults] = useState<CrossValidationProviderResult[] | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewriteProgress, setRewriteProgress] = useState(0);

  // 등록된 provider별로 가장 적합한 (default 우선) 모델 1개씩만 사용
  function buildProviderConfigs(): CrossValidationProviderConfig[] {
    const byProvider: Record<string, LLMModelOption> = {};
    for (const m of availableModels) {
      if (!m.apiKey) continue;
      const existing = byProvider[m.provider];
      if (!existing || (m.isDefault && !existing.isDefault)) {
        byProvider[m.provider] = m;
      }
    }
    return Object.values(byProvider).map((m) => ({
      provider: m.provider as ClientLLMProvider,
      model: m.model,
      apiKey: m.apiKey,
      displayName: m.displayName,
    }));
  }

  function handleStart() {
    const configs = buildProviderConfigs();
    if (configs.length === 0) {
      setError("등록된 LLM이 없습니다. 설정에서 API 키를 등록해주세요.");
      return;
    }

    setIsValidating(true);
    setError(null);
    setResults(null);
    setSelectedKeys(new Set());

    // 진행 상황 점진 갱신을 위해 빈 결과로 시작
    const placeholder: CrossValidationProviderResult[] = configs.map((c) => ({
      provider: c.provider,
      displayName: c.displayName,
      success: false,
      error: undefined,
    }));
    setResults(placeholder);
    setExpandedProviders(new Set(configs.map((c) => c.provider)));

    (async () => {
      try {
        const final = await clientCrossValidate({
          title,
          body,
          systemPrompt: PROMPT_FACT_CHECK,
          providers: configs,
          onProviderDone: (one) => {
            setResults((prev) => {
              if (!prev) return prev;
              return prev.map((r) => (r.provider === one.provider ? one : r));
            });
          },
        });
        setResults(final);

        // 처음에는 high severity 이슈를 모두 자동 선택
        const autoSelected = new Set<string>();
        for (const pr of final) {
          if (!pr.success || !pr.result?.issues) continue;
          pr.result.issues.forEach((iss, idx) => {
            if (iss.severity === "high") {
              autoSelected.add(`${pr.provider}:${idx}`);
            }
          });
        }
        setSelectedKeys(autoSelected);
      } catch (err) {
        setError(err instanceof Error ? err.message : "교차검증 실패");
      } finally {
        setIsValidating(false);
      }
    })();
  }

  function toggleSelect(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleProvider(provider: string) {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  }

  function selectAllForProvider(provider: ClientLLMProvider, count: number) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (let i = 0; i < count; i++) next.add(`${provider}:${i}`);
      return next;
    });
  }

  function clearSelection() {
    setSelectedKeys(new Set());
  }

  // 모든 이슈를 평탄화한 행 목록
  const allRows: IssueRow[] = [];
  if (results) {
    for (const pr of results) {
      if (!pr.success || !pr.result?.issues) continue;
      pr.result.issues.forEach((iss, idx) => {
        allRows.push({
          key: `${pr.provider}:${idx}`,
          provider: pr.provider,
          providerLabel: pr.displayName,
          issue: iss,
        });
      });
    }
  }

  function handleApplyAndRewrite() {
    const selected: SelectedIssue[] = allRows
      .filter((r) => selectedKeys.has(r.key))
      .map((r) => ({
        category: r.issue.category,
        description: r.issue.description,
        suggestion: r.issue.suggestion,
        original_text: r.issue.original_text,
        replacement_text: r.issue.replacement_text,
        provider: r.providerLabel,
      }));

    if (selected.length === 0) {
      toast.error("반영할 항목을 1개 이상 선택해주세요.");
      return;
    }

    startTransition(() => {
      setIsRewriting(true);
      setRewriteProgress(0);
      setError(null);

      (async () => {
        try {
          const res = await clientRewriteWithFeedback({
            title,
            body,
            selectedIssues: selected,
            model: baseModel,
            apiKey: baseApiKey,
            provider: baseProvider,
            onProgress: (txt) => setRewriteProgress(txt.length),
          });

          if (!res.success || !res.rewrittenBody) {
            setError(res.error || "재작성 실패");
            toast.error(res.error || "재작성 실패");
            return;
          }

          onApplyRewrite(res.rewrittenBody);
          toast.success(`${selected.length}건 반영하여 본문을 재작성했습니다`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "재작성 실패";
          setError(msg);
          toast.error(msg);
        } finally {
          setIsRewriting(false);
        }
      })();
    });
  }

  // 등록된 LLM이 없는 경우
  const providerCount = buildProviderConfigs().length;

  // 검증 전 상태
  if (!results && !isValidating) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: "var(--brand-accent)" }} />
            교차검증
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            등록된 LLM <strong>{providerCount}개</strong>(Claude/GPT/Gemini)에 동시 팩트체크를 요청합니다.
            결과를 비교한 뒤 반영할 항목을 선택하면, 원본 LLM(<strong>{baseProvider}</strong>)으로 본문을 다시 작성합니다.
          </p>
          {providerCount === 0 && (
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-700 border border-amber-200">
              등록된 LLM이 없습니다. <strong>설정 → AI 설정</strong>에서 Claude/OpenAI/Gemini 중 하나 이상의 API 키를 등록해주세요.
            </div>
          )}
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">{error}</div>
          )}
          <div className="flex gap-2">
            <Button onClick={handleStart} disabled={providerCount === 0} className="flex-1">
              <Sparkles className="mr-1 h-4 w-4" />
              교차검증 시작 ({providerCount}개 LLM)
            </Button>
            {onClose && (
              <Button variant="outline" onClick={onClose}>
                닫기
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // 검증 중 + 결과 표시
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: "var(--brand-accent)" }} />
            교차검증 결과
            {isValidating && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "var(--brand-accent)" }} />
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            선택 {selectedKeys.size} / 전체 {allRows.length}건
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* provider별 결과 */}
        <div className="space-y-3">
          {results?.map((pr) => {
            const expanded = expandedProviders.has(pr.provider);
            const issueCount = pr.result?.issues?.length ?? 0;
            const verdictKey = pr.result?.verdict ?? "fix_required";
            const verdict = VERDICT_STYLES[verdictKey] ?? VERDICT_STYLES.fix_required;
            const VerdictIcon = verdict.icon;

            return (
              <div key={pr.provider} className="rounded-lg border">
                <button
                  type="button"
                  onClick={() => toggleProvider(pr.provider)}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {expanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="font-medium text-sm">{pr.displayName}</span>
                    {pr.success && pr.result ? (
                      <>
                        <Badge
                          style={{ backgroundColor: verdict.bg, color: verdict.color }}
                          className="text-xs"
                        >
                          <VerdictIcon className="mr-1 h-3 w-3 inline" />
                          {verdict.label} {pr.result.overall_score}점
                        </Badge>
                        <span className="text-xs text-muted-foreground">{issueCount}건 지적</span>
                      </>
                    ) : pr.error ? (
                      <Badge variant="outline" className="text-xs text-red-600 border-red-200">
                        실패
                      </Badge>
                    ) : (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  {pr.success && issueCount > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectAllForProvider(pr.provider, issueCount);
                      }}
                      className="text-xs underline text-muted-foreground hover:text-foreground"
                    >
                      전체 선택
                    </button>
                  )}
                </button>

                {expanded && (
                  <div className="border-t px-3 py-2 space-y-2 bg-muted/10">
                    {pr.error && (
                      <p className="text-xs text-red-600">에러: {pr.error}</p>
                    )}
                    {pr.success && pr.result && (
                      <>
                        {pr.result.strengths.length > 0 && (
                          <div className="space-y-0.5 mb-2">
                            {pr.result.strengths.map((s, i) => (
                              <p key={i} className="text-xs flex items-start gap-1.5 text-muted-foreground">
                                <CheckCircle2
                                  className="h-3 w-3 shrink-0 mt-0.5"
                                  style={{ color: "var(--quality-excellent)" }}
                                />
                                {s}
                              </p>
                            ))}
                          </div>
                        )}
                        {issueCount === 0 && (
                          <p className="text-xs text-muted-foreground py-1">지적 사항 없음</p>
                        )}
                        {pr.result.issues.map((iss, idx) => {
                          const key = `${pr.provider}:${idx}`;
                          const checked = selectedKeys.has(key);
                          const sev = SEVERITY_STYLES[iss.severity] ?? SEVERITY_STYLES.medium;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => toggleSelect(key)}
                              className={`w-full text-left rounded-md border p-2 text-xs transition-colors ${
                                checked
                                  ? "border-[var(--brand-accent)] bg-[var(--brand-accent)]/5"
                                  : "hover:bg-muted/50"
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                {checked ? (
                                  <CheckSquare
                                    className="h-4 w-4 shrink-0 mt-0.5"
                                    style={{ color: "var(--brand-accent)" }}
                                  />
                                ) : (
                                  <Square className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                                )}
                                <div className="flex-1 space-y-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span
                                      className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                                      style={{ backgroundColor: sev.bg, color: sev.color }}
                                    >
                                      {sev.label}
                                    </span>
                                    <span className="font-medium">{iss.category}</span>
                                    {iss.location && (
                                      <span className="text-muted-foreground truncate max-w-[160px]">
                                        &ldquo;{iss.location}…&rdquo;
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-muted-foreground">{iss.description}</p>
                                  {iss.suggestion && (
                                    <p style={{ color: "var(--brand-accent)" }}>제안: {iss.suggestion}</p>
                                  )}
                                  {iss.replacement_text && iss.original_text && (
                                    <div className="mt-1 rounded bg-background border p-1.5 space-y-0.5">
                                      <p className="text-[10px] text-muted-foreground line-through truncate">
                                        {iss.original_text}
                                      </p>
                                      <p className="text-[10px] text-foreground truncate">
                                        → {iss.replacement_text}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">{error}</div>
        )}

        {isRewriting && (
          <div className="rounded-md border p-3 bg-muted/30 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--brand-accent)" }} />
            <span className="text-sm">
              {baseProvider}으로 본문 재작성 중... ({rewriteProgress.toLocaleString()}자)
            </span>
          </div>
        )}

        <Separator />

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleApplyAndRewrite}
            disabled={isValidating || isPending || isRewriting || selectedKeys.size === 0}
            style={{ backgroundColor: "var(--brand-accent)" }}
            className="flex-1 min-w-[200px]"
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${isRewriting ? "animate-spin" : ""}`} />
            선택 {selectedKeys.size}건 반영하여 재작성
          </Button>
          <Button variant="outline" onClick={clearSelection} disabled={isRewriting || selectedKeys.size === 0}>
            선택 해제
          </Button>
          <Button variant="outline" onClick={handleStart} disabled={isValidating || isRewriting}>
            다시 검증
          </Button>
          {onClose && (
            <Button variant="ghost" onClick={onClose} disabled={isRewriting}>
              닫기
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
