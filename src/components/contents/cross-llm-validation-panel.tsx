"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
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
  Check,
  X,
  Zap,
  Settings as SettingsIcon,
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
import { PROMPT_FACT_CHECK, PROMPT_FACT_CHECK_QUICK } from "@/lib/constants/prompts";

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
  availableModels: LLMModelOption[];
  baseProvider: ClientLLMProvider;
  baseModel: string;
  baseApiKey: string;
  /** 개별 issue 반영 — true 반환 시 본문 교체 성공 */
  onApplyFix: (originalText: string, replacementText: string) => boolean;
  /** 선택 항목들을 베이스 LLM 으로 한꺼번에 재작성 */
  onApplyRewrite: (newBody: string) => void;
  onClose?: () => void;
}

const SEVERITY_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  high: { color: "#dc2626", bg: "#fee2e2", label: "심각" },
  medium: { color: "#d97706", bg: "#fef3c7", label: "주의" },
  low: { color: "#6b7280", bg: "#f3f4f6", label: "경미" },
};

interface IssueRow {
  key: string;
  stage: 1 | 2;
  provider: ClientLLMProvider;
  providerLabel: string;
  index: number;
  issue: FactCheckIssue;
}

type ItemStatus = "pending" | "applied" | "ignored";

/**
 * 1단계 빠른 검증에 사용할 LLM 선정.
 * 모델 ID 에 mini/flash/haiku/lite/nano 가 있으면 우선 (저렴/빠름).
 */
function pickFastProvider(
  configs: CrossValidationProviderConfig[]
): CrossValidationProviderConfig | null {
  if (configs.length === 0) return null;
  const fast = configs.find((c) => /mini|flash|haiku|lite|nano/i.test(c.model));
  return fast ?? configs[0];
}

export function CrossLLMValidationPanel({
  title,
  body,
  availableModels,
  baseProvider,
  baseModel,
  baseApiKey,
  onApplyFix,
  onApplyRewrite,
  onClose,
}: CrossLLMValidationPanelProps) {
  const [isPending, startTransition] = useTransition();

  // 단계별 상태
  const [stage1Result, setStage1Result] = useState<CrossValidationProviderResult | null>(null);
  const [stage1Loading, setStage1Loading] = useState(false);
  const [stage2Results, setStage2Results] = useState<CrossValidationProviderResult[] | null>(null);
  const [stage2Loading, setStage2Loading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // 각 issue 의 상태 (pending / applied / ignored)
  const [itemStatus, setItemStatus] = useState<Record<string, ItemStatus>>({});
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // 통합 재작성 상태
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewriteProgress, setRewriteProgress] = useState(0);

  // base provider 를 제외한 등록 LLM 목록
  const otherProviderConfigs = useMemo<CrossValidationProviderConfig[]>(() => {
    const byProvider: Record<string, LLMModelOption> = {};
    for (const m of availableModels) {
      if (!m.apiKey) continue;
      if (m.provider === baseProvider) continue; // base 제외
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
  }, [availableModels, baseProvider]);

  const stage1Provider = useMemo(() => pickFastProvider(otherProviderConfigs), [otherProviderConfigs]);
  const stage2Providers = useMemo(
    () => otherProviderConfigs.filter((c) => c.provider !== stage1Provider?.provider),
    [otherProviderConfigs, stage1Provider]
  );

  // 모든 이슈 평탄화 (stage1 + stage2)
  const allRows = useMemo<IssueRow[]>(() => {
    const rows: IssueRow[] = [];
    if (stage1Result?.success && stage1Result.result?.issues) {
      stage1Result.result.issues.forEach((iss, idx) => {
        rows.push({
          key: `s1:${stage1Result.provider}:${idx}`,
          stage: 1,
          provider: stage1Result.provider,
          providerLabel: stage1Result.displayName,
          index: idx,
          issue: iss,
        });
      });
    }
    if (stage2Results) {
      for (const pr of stage2Results) {
        if (!pr.success || !pr.result?.issues) continue;
        pr.result.issues.forEach((iss, idx) => {
          rows.push({
            key: `s2:${pr.provider}:${idx}`,
            stage: 2,
            provider: pr.provider,
            providerLabel: pr.displayName,
            index: idx,
            issue: iss,
          });
        });
      }
    }
    return rows;
  }, [stage1Result, stage2Results]);

  // severity 별 카운트 (pending 만)
  const severityCounts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0 };
    for (const r of allRows) {
      if (itemStatus[r.key] === "applied" || itemStatus[r.key] === "ignored") continue;
      const sev = r.issue.severity;
      if (sev === "high") c.high++;
      else if (sev === "medium") c.medium++;
      else if (sev === "low") c.low++;
    }
    return c;
  }, [allRows, itemStatus]);

  /** 단일 provider 검증 호출 */
  async function runSingleStage(
    config: CrossValidationProviderConfig,
    systemPrompt: string
  ): Promise<CrossValidationProviderResult> {
    const arr = await clientCrossValidate({
      title,
      body,
      systemPrompt,
      providers: [config],
    });
    return arr[0];
  }

  /** 1단계 시작 */
  async function startStage1() {
    if (!stage1Provider) {
      setError("교차검증을 위해 다른 LLM을 최소 1개 이상 등록해주세요.");
      return;
    }

    setError(null);
    setStage1Loading(true);
    setStage1Result(null);
    setStage2Results(null);
    setItemStatus({});
    setSelectedKeys(new Set());

    try {
      const result = await runSingleStage(stage1Provider, PROMPT_FACT_CHECK_QUICK);
      setStage1Result(result);

      if (!result.success) {
        toast.error(`1단계 검증 실패: ${result.error}`);
        return;
      }

      const highCount = result.result?.issues?.filter((i) => i.severity === "high").length ?? 0;
      toast.success(`1단계 빠른 검증 완료 (${result.displayName})`);

      // 자동 트리거: high 2건 이상이면 2단계 자동 진행
      if (highCount >= 2 && stage2Providers.length > 0) {
        toast.info(`심각 이슈 ${highCount}건 발견 — 정밀 검증 자동 시작`);
        await runStage2();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "1단계 검증 실패";
      setError(msg);
      toast.error(msg);
    } finally {
      setStage1Loading(false);
    }
  }

  /** 2단계 시작 — 1단계는 그대로 두고 추가 LLM 으로 정밀 검증 */
  async function runStage2() {
    if (stage2Providers.length === 0) {
      toast.info("정밀 검증할 추가 LLM이 없습니다. 다른 LLM을 등록하세요.");
      return;
    }

    setStage2Loading(true);

    // 진행 표시용 placeholder
    const placeholder: CrossValidationProviderResult[] = stage2Providers.map((c) => ({
      provider: c.provider,
      displayName: c.displayName,
      success: false,
      error: undefined,
    }));
    setStage2Results(placeholder);

    try {
      const final = await clientCrossValidate({
        title,
        body,
        systemPrompt: PROMPT_FACT_CHECK,
        providers: stage2Providers,
        onProviderDone: (one) => {
          setStage2Results((prev) => prev?.map((r) => (r.provider === one.provider ? one : r)) ?? null);
        },
      });
      setStage2Results(final);
      const successCount = final.filter((r) => r.success).length;
      toast.success(`2단계 정밀 검증 완료 (${successCount}/${final.length})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "2단계 검증 실패";
      setError(msg);
      toast.error(msg);
    } finally {
      setStage2Loading(false);
    }
  }

  function handleApplyOne(row: IssueRow) {
    const iss = row.issue;
    if (!iss.original_text || !iss.replacement_text) {
      toast.error("원문/교체문이 누락된 항목입니다 — 수동 확인 필요");
      return;
    }
    const ok = onApplyFix(iss.original_text, iss.replacement_text);
    if (!ok) {
      toast.error("본문에서 원문을 찾지 못했습니다 — 수동 확인 필요");
      return;
    }
    setItemStatus((prev) => ({ ...prev, [row.key]: "applied" }));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.delete(row.key);
      return next;
    });
    toast.success(`${row.issue.category} 반영 완료`);
  }

  function handleIgnoreOne(row: IssueRow) {
    setItemStatus((prev) => ({ ...prev, [row.key]: "ignored" }));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.delete(row.key);
      return next;
    });
  }

  function toggleSelect(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleApplyAndRewrite() {
    const selected: SelectedIssue[] = allRows
      .filter((r) => selectedKeys.has(r.key))
      .filter((r) => itemStatus[r.key] !== "applied" && itemStatus[r.key] !== "ignored")
      .map((r) => ({
        category: r.issue.category,
        description: r.issue.description,
        suggestion: r.issue.suggestion,
        original_text: r.issue.original_text,
        replacement_text: r.issue.replacement_text,
        provider: r.providerLabel,
      }));

    if (selected.length === 0) {
      toast.error("재작성할 항목을 1개 이상 선택해주세요.");
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

  // ── 렌더 ──

  // 0) 다른 LLM 이 등록되지 않은 경우 — 안내 + 설정 링크
  if (otherProviderConfigs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" style={{ color: "var(--brand-accent)" }} />
              교차검증
            </span>
            {onClose && (
              <button
                onClick={onClose}
                className="text-xs text-muted-foreground hover:text-foreground"
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 space-y-2">
            <p className="text-sm text-amber-900">
              교차검증을 위해 <strong>기본 모델({baseProvider})과 다른 LLM</strong>을 최소 1개 이상 등록해주세요.
            </p>
            <p className="text-xs text-amber-800">
              기본 모델이 자기 자신의 출력을 검증하면 의미가 없으므로, 반드시 다른 LLM이 필요합니다.
            </p>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 text-xs font-medium text-amber-900 hover:text-amber-950 underline"
            >
              <SettingsIcon className="h-3 w-3" />
              설정 → AI 설정으로 이동
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 1) 검증 아직 시작 전 — 자동으로 시작
  // 첫 마운트 직후 stage1 시작을 위한 useEffect-less 트리거. 사용자가 헤더의
  // "교차검증" 버튼으로 이 패널을 열었으므로, 패널이 표시되면 즉시 1단계 시작.
  // useEffect 대신 첫 렌더에서 lazy 시작 — pending 상태로 안내를 표시하면서
  // 사용자가 명시적으로 시작 버튼을 누르도록 한다.

  const hasAnyResult = stage1Result !== null || stage2Results !== null;
  const isAnyLoading = stage1Loading || stage2Loading;

  // 2) 결과 없음 + 로딩 아님 → 시작 화면 (헤더 버튼 후 첫 표시)
  if (!hasAnyResult && !isAnyLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" style={{ color: "var(--brand-accent)" }} />
              교차검증
            </span>
            {onClose && (
              <button
                onClick={onClose}
                className="text-xs text-muted-foreground hover:text-foreground"
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md bg-muted/30 p-3 text-xs space-y-1">
            <p>
              <strong>1단계 빠른 검증</strong>: {stage1Provider?.displayName ?? "-"} (팩트체크·논리·톤만)
            </p>
            <p>
              <strong>2단계 정밀 검증</strong>:{" "}
              {stage2Providers.length > 0
                ? stage2Providers.map((c) => c.displayName).join(", ") + " (전체 항목)"
                : "추가 LLM 없음 (1단계만 실행)"}
            </p>
            <p className="text-muted-foreground">
              심각 이슈 2건 이상이면 2단계 자동 시작. 그 외에는 수동 트리거.
            </p>
          </div>
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">{error}</div>
          )}
          <Button onClick={startStage1} className="w-full" disabled={!stage1Provider}>
            <Zap className="mr-1 h-4 w-4" />
            1단계 빠른 검증 시작
          </Button>
        </CardContent>
      </Card>
    );
  }

  // 3) 결과 + 검증 중 통합 화면
  const stage1Verdict = stage1Result?.success ? stage1Result.result?.verdict : undefined;
  const allHighZero = severityCounts.high === 0;
  const summaryBg = allHighZero ? "#dcfce7" : "#fee2e2";
  const summaryColor = allHighZero ? "var(--quality-excellent)" : "var(--quality-critical)";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: "var(--brand-accent)" }} />
            교차검증 결과
            {isAnyLoading && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "var(--brand-accent)" }} />
            )}
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="text-xs text-muted-foreground hover:text-foreground"
              disabled={isRewriting}
              aria-label="닫기"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 요약 배지 */}
        <div
          className="rounded-md p-3 space-y-2"
          style={{ backgroundColor: summaryBg }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            {stage1Loading ? (
              <Badge variant="outline" className="text-xs">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                1단계 검증 중...
              </Badge>
            ) : stage1Result?.success ? (
              <Badge
                style={{ backgroundColor: "white", color: summaryColor, borderColor: summaryColor }}
                variant="outline"
                className="text-xs"
              >
                ✓ 1단계 완료 ({stage1Result.displayName})
                {stage1Result.result?.overall_score !== undefined &&
                  ` · ${stage1Result.result.overall_score}점`}
              </Badge>
            ) : stage1Result?.error ? (
              <Badge variant="outline" className="text-xs text-red-600 border-red-200">
                ✗ 1단계 실패: {stage1Result.error.slice(0, 60)}
              </Badge>
            ) : null}

            {stage2Loading ? (
              <Badge variant="outline" className="text-xs">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                2단계 검증 중...
              </Badge>
            ) : stage2Results ? (
              <Badge
                style={{ backgroundColor: "white", color: summaryColor, borderColor: summaryColor }}
                variant="outline"
                className="text-xs"
              >
                ✓ 2단계 완료 ({stage2Results.filter((r) => r.success).length}/{stage2Results.length})
              </Badge>
            ) : null}
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs" style={{ color: summaryColor }}>
            {allHighZero ? (
              <span className="flex items-center gap-1 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                심각 이슈 없음
              </span>
            ) : (
              <span className="flex items-center gap-1 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" />
                심각 {severityCounts.high}건
              </span>
            )}
            <span style={{ color: "#d97706" }}>· 주의 {severityCounts.medium}건</span>
            <span style={{ color: "#6b7280" }}>· 경미 {severityCounts.low}건</span>
            <span className="text-muted-foreground ml-auto">총 {allRows.length}건 (반영/무시 제외)</span>
          </div>

          {/* 정밀 검증 추가 버튼 */}
          {stage1Result?.success && !stage2Results && !stage2Loading && stage2Providers.length > 0 && (
            <Button size="sm" variant="outline" onClick={runStage2} className="w-full bg-white">
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              정밀 검증 추가 실행 ({stage2Providers.map((c) => c.displayName).join(", ")})
            </Button>
          )}
        </div>

        {/* 이슈 목록 — provider 별로 그룹화 */}
        <IssueListGrouped
          rows={allRows}
          itemStatus={itemStatus}
          selectedKeys={selectedKeys}
          onApplyOne={handleApplyOne}
          onIgnoreOne={handleIgnoreOne}
          onToggleSelect={toggleSelect}
        />

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

        {/* 액션 버튼 */}
        <div className="flex flex-wrap gap-2">
          {selectedKeys.size > 0 && (
            <Button
              onClick={handleApplyAndRewrite}
              disabled={isAnyLoading || isPending || isRewriting}
              style={{ backgroundColor: "var(--brand-accent)" }}
              className="flex-1 min-w-[200px]"
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${isRewriting ? "animate-spin" : ""}`} />
              선택 {selectedKeys.size}건 반영 후 재작성
            </Button>
          )}
          <Button
            variant="outline"
            onClick={startStage1}
            disabled={isAnyLoading || isRewriting}
          >
            다시 검증
          </Button>
          {stage1Result?.success && stage2Providers.length > 0 && !stage2Results && !stage2Loading && (
            <Button variant="outline" onClick={runStage2} disabled={isRewriting}>
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              정밀 검증
            </Button>
          )}
        </div>

        <p suppressHydrationWarning className="text-[11px] text-muted-foreground">
          반영 = 본문에 즉시 적용 / 무시 = 카드 닫기 / 체크 = 묶어서 LLM 재작성
        </p>
      </CardContent>
    </Card>
  );
}

// ── 이슈 목록 — provider 별 그룹화 ──

interface IssueListGroupedProps {
  rows: IssueRow[];
  itemStatus: Record<string, ItemStatus>;
  selectedKeys: Set<string>;
  onApplyOne: (row: IssueRow) => void;
  onIgnoreOne: (row: IssueRow) => void;
  onToggleSelect: (key: string) => void;
}

function IssueListGrouped({
  rows,
  itemStatus,
  selectedKeys,
  onApplyOne,
  onIgnoreOne,
  onToggleSelect,
}: IssueListGroupedProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // group key = stage:provider
  const groups = useMemo(() => {
    const map = new Map<string, { stage: 1 | 2; provider: ClientLLMProvider; label: string; rows: IssueRow[] }>();
    for (const r of rows) {
      const k = `${r.stage}:${r.provider}`;
      if (!map.has(k)) {
        map.set(k, { stage: r.stage, provider: r.provider, label: r.providerLabel, rows: [] });
      }
      map.get(k)!.rows.push(r);
    }
    return Array.from(map.entries()).map(([k, v]) => ({ key: k, ...v }));
  }, [rows]);

  // 처음에 모두 펼침
  if (expanded.size === 0 && groups.length > 0) {
    setExpanded(new Set(groups.map((g) => g.key)));
  }

  if (groups.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">지적 사항이 없습니다.</p>;
  }

  function toggleGroup(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const isOpen = expanded.has(g.key);
        const pendingCount = g.rows.filter((r) => itemStatus[r.key] !== "applied" && itemStatus[r.key] !== "ignored").length;
        return (
          <div key={g.key} className="rounded-lg border">
            <button
              type="button"
              onClick={() => toggleGroup(g.key)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 text-left"
            >
              <div className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <Badge variant="outline" className="text-[10px]">
                  {g.stage === 1 ? "1단계" : "2단계"}
                </Badge>
                <span className="text-sm font-medium">{g.label}</span>
                <span className="text-xs text-muted-foreground">
                  {pendingCount}/{g.rows.length}건
                </span>
              </div>
            </button>
            {isOpen && (
              <div className="border-t px-3 py-2 space-y-2 bg-muted/10">
                {g.rows.map((r) => (
                  <IssueCard
                    key={r.key}
                    row={r}
                    status={itemStatus[r.key] ?? "pending"}
                    selected={selectedKeys.has(r.key)}
                    onApply={() => onApplyOne(r)}
                    onIgnore={() => onIgnoreOne(r)}
                    onToggleSelect={() => onToggleSelect(r.key)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface IssueCardProps {
  row: IssueRow;
  status: ItemStatus;
  selected: boolean;
  onApply: () => void;
  onIgnore: () => void;
  onToggleSelect: () => void;
}

function IssueCard({ row, status, selected, onApply, onIgnore, onToggleSelect }: IssueCardProps) {
  const iss = row.issue;
  const sev = SEVERITY_STYLES[iss.severity] ?? SEVERITY_STYLES.medium;
  const canApply = !!iss.original_text && !!iss.replacement_text;

  return (
    <div
      className={`rounded-md border p-2 text-xs space-y-1 transition-colors ${
        status === "applied"
          ? "bg-green-50 border-green-200 opacity-70"
          : status === "ignored"
            ? "bg-muted/30 opacity-50"
            : selected
              ? "border-[var(--brand-accent)] bg-[var(--brand-accent)]/5"
              : "bg-background"
      }`}
    >
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
        <div className="ml-auto flex items-center gap-1">
          {status === "applied" ? (
            <Badge
              style={{ backgroundColor: "#16a34a", color: "white" }}
              className="text-[10px]"
            >
              <Check className="mr-0.5 h-3 w-3" />
              반영됨
            </Badge>
          ) : status === "ignored" ? (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              무시됨
            </Badge>
          ) : (
            <>
              <Button
                size="sm"
                variant="default"
                className="h-6 px-2 text-[10px]"
                onClick={onApply}
                disabled={!canApply}
                title={canApply ? "본문에 즉시 적용" : "원문 매칭 불가 — 수동 확인"}
              >
                <Check className="mr-0.5 h-3 w-3" />
                반영
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px]"
                onClick={onIgnore}
              >
                <X className="mr-0.5 h-3 w-3" />
                무시
              </Button>
              <button
                type="button"
                onClick={onToggleSelect}
                className={`h-6 w-6 rounded border flex items-center justify-center text-[10px] ${
                  selected ? "bg-[var(--brand-accent)] text-white border-[var(--brand-accent)]" : "border-input"
                }`}
                title="LLM 재작성에 묶기"
                aria-label="LLM 재작성 선택"
              >
                {selected ? "✓" : ""}
              </button>
            </>
          )}
        </div>
      </div>
      <p className="text-muted-foreground">{iss.description}</p>
      {iss.suggestion && (
        <p style={{ color: "var(--brand-accent)" }}>제안: {iss.suggestion}</p>
      )}
      {canApply && (
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
  );
}
