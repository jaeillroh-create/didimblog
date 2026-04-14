"use client";

import { useState, useTransition, useMemo, useEffect, useRef } from "react";
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
  Check,
  X,
  ArrowRight,
  Settings as SettingsIcon,
} from "lucide-react";
import {
  clientCrossValidateV2,
  type ClientLLMProvider,
  type CrossValidationProviderConfig,
  type CrossValidationProviderResult,
  type FactCheckIssue,
} from "@/lib/client-generate";
import { PROMPT_CROSS_VALIDATION } from "@/lib/constants/prompts";

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
  /** Phase 1 outline 에서 추출한 법령 목록. PROMPT_CROSS_VALIDATION 의 legal_references 에 주입 */
  legalReferences: string[];
  /** Phase 1 outline 의 category_name (한국어, 없으면 빈 문자열) */
  categoryName: string;
  /** SEO 키워드 */
  targetKeyword: string;
  /** 개별 issue 반영 — true 반환 시 본문 교체 성공 */
  onApplyFix: (originalText: string, replacementText: string) => boolean;
  /** "Phase 3 진행" 버튼 — 모든 항목 처리 후 활성화. 호출 시 Phase 3 SEO 최적화 시작 */
  onProceedToPhase3: () => void;
  onClose?: () => void;
}

const SEVERITY_STYLES: Record<string, { color: string; bg: string; label: string; weight: number }> = {
  high: { color: "#dc2626", bg: "#fee2e2", label: "심각", weight: 3 },
  medium: { color: "#d97706", bg: "#fef3c7", label: "주의", weight: 2 },
  low: { color: "#6b7280", bg: "#f3f4f6", label: "경미", weight: 1 },
};

type SeverityLevel = "high" | "medium" | "low";

function upgradeSeverity(s: SeverityLevel): SeverityLevel {
  if (s === "low") return "medium";
  if (s === "medium") return "high";
  return "high";
}

/** issue 한 건 (한 LLM 의 지적) */
interface IssueRow {
  key: string;
  provider: ClientLLMProvider;
  providerLabel: string;
  index: number;
  issue: FactCheckIssue;
}

/** 같은 original_text 를 여러 LLM 이 지적한 묶음 */
interface IssueGroup {
  groupKey: string;
  primary: IssueRow; // 그룹의 대표 행 (가장 높은 severity)
  rows: IssueRow[]; // 같은 이슈를 지적한 모든 LLM
  effectiveSeverity: SeverityLevel; // 중복 지적 시 1단계 상향
  providers: string[]; // 지적한 LLM 표시명 목록
}

type ItemStatus = "pending" | "applied" | "ignored";

function normalizeKey(text: string | undefined): string {
  if (!text) return "";
  // 화이트스페이스 정규화 + 처음 60자 — 같은 이슈를 다른 표현으로 지적해도 어느 정도 묶음
  return text.replace(/\s+/g, " ").trim().slice(0, 60).toLowerCase();
}

function groupRows(rows: IssueRow[]): IssueGroup[] {
  const map = new Map<string, IssueRow[]>();
  for (const r of rows) {
    const k = normalizeKey(r.issue.original_text) || `noref-${r.key}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }

  return Array.from(map.entries()).map(([k, arr]) => {
    // primary = 가장 높은 severity 의 행
    const sorted = [...arr].sort(
      (a, b) =>
        SEVERITY_STYLES[b.issue.severity].weight - SEVERITY_STYLES[a.issue.severity].weight
    );
    const primary = sorted[0];
    const baseSeverity = primary.issue.severity as SeverityLevel;
    const effectiveSeverity: SeverityLevel = arr.length >= 2 ? upgradeSeverity(baseSeverity) : baseSeverity;
    const providers = Array.from(new Set(arr.map((r) => r.providerLabel)));
    return {
      groupKey: k,
      primary,
      rows: arr,
      effectiveSeverity,
      providers,
    };
  });
}

export function CrossLLMValidationPanel({
  title: _title,
  body,
  availableModels,
  baseProvider,
  legalReferences,
  categoryName,
  targetKeyword,
  onApplyFix,
  onProceedToPhase3,
  onClose,
}: CrossLLMValidationPanelProps) {
  void _title;
  const [, startTransition] = useTransition();

  const [results, setResults] = useState<CrossValidationProviderResult[] | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // group key 별 처리 상태 (반영/무시)
  const [groupStatus, setGroupStatus] = useState<Record<string, ItemStatus>>({});

  // Phase 2 본문이 변하면 자동 재검증 방지를 위해 한 번만 시작하는 ref
  const startedRef = useRef(false);

  // 베이스 provider 를 제외한 외부 LLM 목록
  const otherProviderConfigs = useMemo<CrossValidationProviderConfig[]>(() => {
    const byProvider: Record<string, LLMModelOption> = {};
    for (const m of availableModels) {
      if (!m.apiKey) continue;
      if (m.provider === baseProvider) continue;
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

  // ── 검증 시작 ──
  async function runValidation() {
    if (otherProviderConfigs.length === 0) {
      setError("교차검증을 위해 다른 LLM을 최소 1개 이상 등록해주세요.");
      return;
    }

    setIsValidating(true);
    setError(null);
    setResults(null);
    setGroupStatus({});

    // 진행 상황 placeholder
    const placeholder: CrossValidationProviderResult[] = otherProviderConfigs.map((c) => ({
      provider: c.provider,
      displayName: c.displayName,
      success: false,
      error: undefined,
    }));
    setResults(placeholder);

    try {
      const final = await clientCrossValidateV2({
        title: _title,
        body,
        promptTemplate: PROMPT_CROSS_VALIDATION,
        legalReferences,
        categoryName,
        targetKeyword,
        providers: otherProviderConfigs,
        onProviderDone: (one) => {
          setResults((prev) => prev?.map((r) => (r.provider === one.provider ? one : r)) ?? null);
        },
      });
      setResults(final);
      const successCount = final.filter((r) => r.success).length;
      toast.success(`교차검증 완료 — ${successCount}/${final.length}개 LLM 응답`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "교차검증 실패";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsValidating(false);
    }
  }

  // 자동 시작: 패널이 마운트되고 외부 LLM 이 있으면 한 번만 검증 실행
  // (Phase 2 직후 ai-editor 가 패널을 열어주므로 사용자에게 별도 시작 클릭 부담 X)
  useEffect(() => {
    if (startedRef.current) return;
    if (otherProviderConfigs.length === 0) return;
    startedRef.current = true;
    runValidation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 모든 issue 평탄화
  const allRows = useMemo<IssueRow[]>(() => {
    const rows: IssueRow[] = [];
    if (!results) return rows;
    for (const pr of results) {
      if (!pr.success || !pr.result?.issues) continue;
      pr.result.issues.forEach((iss, idx) => {
        rows.push({
          key: `${pr.provider}:${idx}`,
          provider: pr.provider,
          providerLabel: pr.displayName,
          index: idx,
          issue: iss,
        });
      });
    }
    return rows;
  }, [results]);

  const groups = useMemo(() => groupRows(allRows), [allRows]);

  // 카운트
  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0, applied: 0, ignored: 0, pending: 0 };
    for (const g of groups) {
      const s = groupStatus[g.groupKey] ?? "pending";
      if (s === "applied") c.applied++;
      else if (s === "ignored") c.ignored++;
      else {
        c.pending++;
        if (g.effectiveSeverity === "high") c.high++;
        else if (g.effectiveSeverity === "medium") c.medium++;
        else c.low++;
      }
    }
    return c;
  }, [groups, groupStatus]);

  // 모든 그룹이 처리(반영/무시)되었으면 Phase 3 진행 활성화
  const allHandled = groups.length > 0 && counts.pending === 0;
  const hasNoIssues = !isValidating && groups.length === 0 && results !== null;

  function handleApplyGroup(group: IssueGroup) {
    const iss = group.primary.issue;
    if (!iss.original_text || !iss.replacement_text) {
      toast.error("원문/교체문이 누락된 항목입니다 — 수동 확인 필요");
      return;
    }
    const ok = onApplyFix(iss.original_text, iss.replacement_text);
    if (!ok) {
      toast.error("본문에서 원문을 찾지 못했습니다 — 수동 확인 필요");
      return;
    }
    setGroupStatus((prev) => ({ ...prev, [group.groupKey]: "applied" }));
    toast.success(`${iss.category} 반영 완료`);
  }

  function handleIgnoreGroup(group: IssueGroup) {
    setGroupStatus((prev) => ({ ...prev, [group.groupKey]: "ignored" }));
  }

  function handleProceed() {
    startTransition(() => {
      onProceedToPhase3();
    });
  }

  // ── 등록된 외부 LLM 이 0개 ──
  if (otherProviderConfigs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" style={{ color: "var(--brand-accent)" }} />
              교차검증 (Phase 2 → Phase 3 사이)
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
              교차검증을 위해 <strong>설정 &gt; AI 설정</strong>에서 다른 LLM을 1개 이상 등록해주세요.
            </p>
            <p className="text-xs text-amber-800">
              초안 생성 LLM(<strong>{baseProvider}</strong>)이 자기 자신의 출력을 검증하면 의미가 없으므로,
              반드시 다른 LLM이 필요합니다.
            </p>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 text-xs font-medium text-amber-900 hover:text-amber-950 underline"
            >
              <SettingsIcon className="h-3 w-3" />
              설정 → AI 설정으로 이동
            </Link>
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={handleProceed} className="flex-1" variant="outline">
              <ArrowRight className="mr-1 h-4 w-4" />
              교차검증 건너뛰고 Phase 3 진행
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── 결과 + 검증 화면 ──
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: "var(--brand-accent)" }} />
            교차검증 (Phase 2 → Phase 3)
            {isValidating && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "var(--brand-accent)" }} />
            )}
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
      <CardContent className="space-y-4">
        {/* 진행 중 LLM 배지 */}
        <div className="flex items-center gap-2 flex-wrap text-sm">
          {results?.map((pr) => (
            <Badge
              key={pr.provider}
              variant="outline"
              className="text-sm py-1 px-2.5"
              style={
                pr.success
                  ? { backgroundColor: "#dcfce7", color: "#16a34a", borderColor: "#86efac" }
                  : pr.error
                    ? { backgroundColor: "#fee2e2", color: "#dc2626", borderColor: "#fca5a5" }
                    : {}
              }
            >
              {pr.success ? (
                <Check className="mr-1 h-3.5 w-3.5 inline" />
              ) : pr.error ? (
                <X className="mr-1 h-3.5 w-3.5 inline" />
              ) : (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin inline" />
              )}
              {pr.displayName}
              {pr.success && pr.result && ` · ${pr.result.overall_score}점`}
              {pr.error && ` · 실패`}
            </Badge>
          ))}
        </div>

        {/* 요약 카운트 */}
        {!isValidating && groups.length > 0 && (
          <div
            className="rounded-md p-3 text-sm flex items-center gap-3 flex-wrap"
            style={{
              backgroundColor: counts.high > 0 ? "#fee2e2" : counts.medium > 0 ? "#fef3c7" : "#dcfce7",
              color: counts.high > 0 ? "#dc2626" : counts.medium > 0 ? "#d97706" : "var(--quality-excellent)",
            }}
          >
            <span className="flex items-center gap-1.5 font-semibold">
              {counts.high === 0 ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              심각 {counts.high}건
            </span>
            <span style={{ color: "#d97706" }}>· 주의 {counts.medium}건</span>
            <span style={{ color: "#6b7280" }}>· 경미 {counts.low}건</span>
            <span className="text-muted-foreground ml-auto text-xs">
              {counts.applied}건 반영 · {counts.ignored}건 무시 · {counts.pending}건 대기
            </span>
          </div>
        )}

        {hasNoIssues && (
          <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            모든 LLM이 사실/논리 측면에서 통과로 판정했습니다.
          </div>
        )}

        {/* 이슈 그룹 리스트 */}
        <div className="space-y-2">
          {groups.map((g) => (
            <IssueGroupCard
              key={g.groupKey}
              group={g}
              status={groupStatus[g.groupKey] ?? "pending"}
              onApply={() => handleApplyGroup(g)}
              onIgnore={() => handleIgnoreGroup(g)}
            />
          ))}
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">{error}</div>
        )}

        <Separator />

        {/* 모달 footer: 좌측 = 다시 검증(회색), 우측 = 선택 반영 후 Phase 3 진행(파란 primary) */}
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" onClick={runValidation} disabled={isValidating}>
            <Sparkles className="mr-1 h-4 w-4" />
            다시 검증
          </Button>
          <Button
            onClick={handleProceed}
            disabled={isValidating || (!allHandled && !hasNoIssues)}
            style={{ backgroundColor: "var(--brand-accent)" }}
            className="min-w-[260px]"
            title={
              !allHandled && !hasNoIssues
                ? "모든 지적 사항을 반영 또는 무시한 뒤 진행할 수 있습니다"
                : "선택한 수정사항을 적용하고 Phase 3 SEO 최적화로 진행"
            }
          >
            <ArrowRight className="mr-1 h-4 w-4" />
            {hasNoIssues
              ? "Phase 3 진행 (지적 사항 없음)"
              : allHandled
                ? "선택 반영 후 Phase 3 진행"
                : `${counts.pending}건 처리 후 Phase 3 진행`}
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          반영 = 본문에 즉시 적용 / 무시 = 카드 닫기 / 2개 이상 LLM이 같은 이슈를 지적하면 severity 자동 상향됨
        </p>
      </CardContent>
    </Card>
  );
}

// ── 이슈 그룹 카드 (한 묶음 = 같은 original_text 를 지적한 1~N개 LLM) ──

interface IssueGroupCardProps {
  group: IssueGroup;
  status: ItemStatus;
  onApply: () => void;
  onIgnore: () => void;
}

function IssueGroupCard({ group, status, onApply, onIgnore }: IssueGroupCardProps) {
  const sev = SEVERITY_STYLES[group.effectiveSeverity];
  const iss = group.primary.issue;
  const canApply = !!iss.original_text && !!iss.replacement_text;
  const isMultiLLM = group.providers.length >= 2;

  return (
    <div
      className={`rounded-md border p-3 text-sm space-y-2 transition-colors ${
        status === "applied"
          ? "bg-green-50 border-green-200 opacity-70"
          : status === "ignored"
            ? "bg-muted/30 opacity-50"
            : "bg-background"
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="px-2 py-0.5 rounded text-xs font-semibold"
          style={{ backgroundColor: sev.bg, color: sev.color }}
        >
          {sev.label}
          {isMultiLLM && ` ⬆`}
        </span>
        <span className="font-semibold text-sm">{iss.category}</span>
        {/* provider 배지 */}
        {group.providers.map((p) => (
          <Badge key={p} variant="outline" className="text-xs py-0">
            {p}
          </Badge>
        ))}
        {isMultiLLM && (
          <span className="text-xs text-muted-foreground">· {group.providers.length}개 LLM 지적</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {status === "applied" ? (
            <Badge style={{ backgroundColor: "#16a34a", color: "white" }} className="text-xs">
              <Check className="mr-0.5 h-3.5 w-3.5" />
              반영됨
            </Badge>
          ) : status === "ignored" ? (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              무시됨
            </Badge>
          ) : (
            <>
              <Button
                size="sm"
                variant="default"
                className="h-7 px-2.5 text-xs"
                onClick={onApply}
                disabled={!canApply}
                title={canApply ? "본문에 즉시 적용" : "원문 매칭 불가 — 수동 확인"}
              >
                <Check className="mr-0.5 h-3.5 w-3.5" />
                반영
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2.5 text-xs"
                onClick={onIgnore}
              >
                <X className="mr-0.5 h-3.5 w-3.5" />
                무시
              </Button>
            </>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{iss.description}</p>
      {iss.suggestion && (
        <p className="text-sm leading-relaxed" style={{ color: "var(--brand-accent)" }}>
          제안: {iss.suggestion}
        </p>
      )}
      {canApply && (
        <div className="mt-2 rounded bg-background border p-2 space-y-1">
          <p
            className={`text-xs leading-relaxed whitespace-pre-wrap break-words ${status === "applied" ? "" : "line-through"}`}
            style={{
              color: status === "applied" ? "#dc2626" : "var(--neutral-text-muted)",
            }}
          >
            {iss.original_text}
          </p>
          <p
            className="text-xs leading-relaxed whitespace-pre-wrap break-words"
            style={{ color: status === "applied" ? "#16a34a" : "var(--foreground)" }}
          >
            → {iss.replacement_text}
          </p>
        </div>
      )}
    </div>
  );
}
