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
  RotateCcw,
  Settings as SettingsIcon,
} from "lucide-react";
import {
  clientCrossValidateV2,
  clientRewriteParagraph,
  type ClientLLMProvider,
  type ClientPhaseLLMConfig,
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
  /** 초안 생성에 사용한 베이스 LLM — 문단 재작성은 교차검증 LLM 이 아닌 베이스 LLM 이 담당 */
  baseLLM: ClientPhaseLLMConfig;
  /** Phase 1 outline 에서 추출한 법령 목록. PROMPT_CROSS_VALIDATION 의 legal_references 에 주입 */
  legalReferences: string[];
  /** Phase 1 outline 의 category_name (한국어, 없으면 빈 문자열) */
  categoryName: string;
  /** 카테고리별 톤 규칙 — 문단 재작성 프롬프트에 주입 */
  categoryToneRules: string;
  /** SEO 키워드 */
  targetKeyword: string;
  /** 개별 issue 반영 — original_text → replacement_text 단순 치환. true 반환 시 본문 교체 성공 */
  onApplyFix: (originalText: string, replacementText: string) => boolean;
  /** 문단 재작성 반영 — originalParagraph → rewrittenParagraph 통째 교체 */
  onApplyParagraph?: (originalParagraph: string, rewrittenParagraph: string) => boolean;
  /** 문단 재작성 되돌리기 */
  onUndoParagraph?: (originalParagraph: string, rewrittenParagraph: string) => boolean;
  /** "반영됨" 항목 되돌리기 — 본문에서 replacement → original 로 역치환. true 반환 시 성공 */
  onUndoFix?: (originalText: string, replacementText: string) => boolean;
  /** 매칭 실패 시 본문에 문단 ID 강제 부여 후 재시도할 콜백 */
  onEnsureParagraphIds?: () => void;
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

/**
 * 이 이슈가 "단순 치환" 이 아니라 "문단 재작성" 을 필요로 하는지 결정.
 *
 * 단순 치환 조건: category in (숫자, 법률팩트) AND severity === "low"
 * 그 외에는 모두 재작성 필요:
 *   - severity 가 high 또는 medium
 *   - category 가 논리 / 단정 / 출처
 *   - suggested_text 길이가 original_text 대비 50% 이상 차이
 */
function needsParagraphRewrite(issue: FactCheckIssue): boolean {
  if (issue.severity === "high" || issue.severity === "medium") return true;
  const cat = issue.category ?? "";
  if (cat.includes("논리") || cat.includes("단정") || cat.includes("출처")) return true;
  const orig = issue.original_text ?? "";
  const repl = issue.replacement_text ?? "";
  if (orig.length > 0) {
    const ratio = Math.abs(repl.length - orig.length) / orig.length;
    if (ratio >= 0.5) return true;
  }
  return false;
}

/**
 * 본문에서 originalText 를 포함하는 문단을 찾는다.
 * 본문을 \n\n 단위로 split 후, original 이 속한 문단을 반환.
 * 정확 매칭 실패 시 whitespace 정규화 / prefix(첫 20자) 매칭으로 fallback.
 */
function findParagraphContaining(
  body: string,
  originalText: string
): { paragraph: string } | null {
  if (!originalText) return null;
  const paragraphs = body.split(/\n\n+/);

  // 1) 정확 매칭
  for (const p of paragraphs) {
    if (p.includes(originalText)) return { paragraph: p };
  }

  // 2) whitespace 정규화
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  const normOrig = normalize(originalText);
  if (normOrig.length >= 5) {
    for (const p of paragraphs) {
      if (normalize(p).includes(normOrig)) return { paragraph: p };
    }
  }

  // 3) prefix 매칭
  const prefix = originalText.trim().slice(0, 20);
  if (prefix.length >= 8) {
    for (const p of paragraphs) {
      if (p.includes(prefix)) return { paragraph: p };
    }
  }

  return null;
}

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
  baseLLM,
  legalReferences,
  categoryName,
  categoryToneRules,
  targetKeyword,
  onApplyFix,
  onApplyParagraph,
  onUndoParagraph,
  onUndoFix,
  onEnsureParagraphIds,
  onProceedToPhase3,
  onClose,
}: CrossLLMValidationPanelProps) {
  const baseProvider = baseLLM.provider;
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

  /**
   * 단순 반영 경로 — original_text → replacement_text 치환.
   * 카드가 needsParagraphRewrite === false 일 때만 사용.
   */
  function handleApplyGroup(group: IssueGroup) {
    const iss = group.primary.issue;
    if (!iss.original_text || !iss.replacement_text) {
      toast.error("원문/교체문이 누락된 항목입니다 — 수동 확인 필요");
      return;
    }
    let ok = onApplyFix(iss.original_text, iss.replacement_text);

    // 매칭 실패 시 문단 ID 자동 부여 후 재시도
    if (!ok && onEnsureParagraphIds) {
      onEnsureParagraphIds();
      ok = onApplyFix(iss.original_text, iss.replacement_text);
    }

    if (!ok) {
      // 모든 매칭 실패 → 클립보드 폴백
      const recoveryPayload = `[원문 — 본문에서 찾아 선택하세요]\n${iss.original_text}\n\n[교체할 내용]\n${iss.replacement_text}`;
      navigator.clipboard.writeText(recoveryPayload).then(
        () => {
          toast.error(
            "본문에서 원문을 자동 매칭하지 못했습니다. 원문/교체안이 클립보드에 복사되었습니다 — Ctrl+F 로 원문을 찾아 직접 수정해주세요.",
            { duration: 6000 }
          );
        },
        () => {
          toast.error("본문에서 원문을 찾지 못했습니다 — 수동 확인 필요");
        }
      );
      return;
    }
    setGroupStatus((prev) => ({ ...prev, [group.groupKey]: "applied" }));
    toast.success(`${iss.category} 반영 완료`);
  }

  /**
   * 문단 재작성 경로 — IssueCard 의 [반영 + 다듬기] 버튼이 호출.
   * 1) 본문에서 original_text 를 포함하는 문단을 찾음
   * 2) 베이스 LLM 에게 문단 + 수정사항을 보내 다듬어진 문단 받기
   * 3) IssueCard 는 이 결과를 preview 로 표시
   *
   * 실제 본문 교체는 사용자가 preview 에서 [적용] 누를 때 handleConfirmParagraph 가 처리.
   */
  async function handleRewriteParagraph(
    issue: FactCheckIssue
  ): Promise<{ originalParagraph: string; rewrittenParagraph: string } | { error: string }> {
    if (!issue.original_text) {
      return { error: "원문이 누락되었습니다" };
    }
    const found = findParagraphContaining(body, issue.original_text);
    if (!found) {
      return { error: "본문에서 원문이 포함된 문단을 찾지 못했습니다 — 수동 확인 필요" };
    }

    const res = await clientRewriteParagraph({
      llm: baseLLM,
      categoryTone: categoryToneRules,
      originalParagraph: found.paragraph,
      originalText: issue.original_text,
      suggestedText: issue.replacement_text ?? issue.suggestion ?? "",
      problem: issue.description ?? "",
    });

    if (!res.success || !res.rewrittenParagraph) {
      return { error: res.error ?? "문단 재작성 실패" };
    }
    return {
      originalParagraph: found.paragraph,
      rewrittenParagraph: res.rewrittenParagraph,
    };
  }

  /**
   * 문단 재작성 [적용] — preview 의 rewrittenParagraph 를 본문에 실제 반영.
   * 3단계 fuzzy 매칭 모두 실패하면 클립보드에 rewritten 을 복사하고 사용자에게
   * 수동 모드 안내.
   */
  function handleConfirmParagraph(group: IssueGroup, originalParagraph: string, rewrittenParagraph: string) {
    if (!onApplyParagraph) {
      toast.error("문단 재작성 기능이 활성화되지 않았습니다");
      return false;
    }
    let ok = onApplyParagraph(originalParagraph, rewrittenParagraph);

    // 매칭 실패 시 문단 ID 자동 부여 후 재시도
    if (!ok && onEnsureParagraphIds) {
      onEnsureParagraphIds();
      ok = onApplyParagraph(originalParagraph, rewrittenParagraph);
    }

    if (!ok) {
      const recoveryPayload = `[다듬어진 문단 — 본문 편집기에 직접 붙여넣으세요]\n\n${rewrittenParagraph}\n\n[원본 문단 — 이 위치를 Ctrl+F 로 찾으세요]\n\n${originalParagraph}`;
      navigator.clipboard.writeText(recoveryPayload).then(
        () => {
          toast.error(
            "자동 매칭에 실패했습니다. 다듬어진 문단과 원본이 클립보드에 복사되었습니다 — Ctrl+F 로 원본 문단을 찾아 직접 붙여넣으세요.",
            { duration: 8000 }
          );
        },
        () => {
          toast.error("본문에서 원본 문단을 찾지 못했습니다 — 수동 확인 필요");
        }
      );
      return false;
    }
    setGroupStatus((prev) => ({ ...prev, [group.groupKey]: "applied" }));
    toast.success(`${group.primary.issue.category} 반영 + 다듬기 완료`);
    return true;
  }

  function handleIgnoreGroup(group: IssueGroup) {
    setGroupStatus((prev) => ({ ...prev, [group.groupKey]: "ignored" }));
  }

  /**
   * 처리된 항목(반영됨/무시됨) 을 다시 pending 으로 되돌림.
   * - 무시됨 → 단순히 status 만 pending 으로 (본문 변경 없음)
   * - 반영됨 → 본문에서도 replacement_text → original_text 로 역치환
   */
  function handleUndoGroup(group: IssueGroup) {
    const current = groupStatus[group.groupKey];
    if (current === "applied") {
      const iss = group.primary.issue;
      if (!iss.original_text || !iss.replacement_text) {
        toast.error("원문/교체문이 없어 되돌릴 수 없습니다");
        return;
      }
      if (!onUndoFix) {
        toast.error("되돌리기 기능이 활성화되지 않았습니다");
        return;
      }
      const ok = onUndoFix(iss.original_text, iss.replacement_text);
      if (!ok) {
        toast.error("본문에서 교체된 문장을 찾지 못했습니다 (수동 편집됨?)");
        return;
      }
      setGroupStatus((prev) => {
        const next = { ...prev };
        delete next[group.groupKey];
        return next;
      });
      toast.success("반영 취소 — 본문이 되돌려졌습니다");
      return;
    }
    if (current === "ignored") {
      setGroupStatus((prev) => {
        const next = { ...prev };
        delete next[group.groupKey];
        return next;
      });
      toast.success("무시 취소 — 다시 처리할 수 있습니다");
    }
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
              onUndo={() => handleUndoGroup(g)}
              onRewriteRequest={() => handleRewriteParagraph(g.primary.issue)}
              onRewriteConfirm={(original, rewritten) =>
                handleConfirmParagraph(g, original, rewritten)
              }
              onRewriteUndo={(original, rewritten) => {
                if (!onUndoParagraph) return false;
                const ok = onUndoParagraph(original, rewritten);
                if (ok) {
                  setGroupStatus((prev) => {
                    const next = { ...prev };
                    delete next[g.groupKey];
                    return next;
                  });
                  toast.success("문단 재작성 취소 — 원래 문단으로 복귀했습니다");
                }
                return ok;
              }}
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
  onUndo: () => void;
  /** 문단 재작성 요청 — 베이스 LLM 호출, 결과(originalParagraph/rewrittenParagraph) 반환 */
  onRewriteRequest: () => Promise<
    { originalParagraph: string; rewrittenParagraph: string } | { error: string }
  >;
  /** preview 의 [적용] 버튼 — 본문에서 문단 교체 */
  onRewriteConfirm: (originalParagraph: string, rewrittenParagraph: string) => boolean;
  /** 적용 후 되돌리기 */
  onRewriteUndo: (originalParagraph: string, rewrittenParagraph: string) => boolean;
}

type RewriteState = "idle" | "generating" | "preview" | "applied-rewrite";

function IssueGroupCard({
  group,
  status,
  onApply,
  onIgnore,
  onUndo,
  onRewriteRequest,
  onRewriteConfirm,
  onRewriteUndo,
}: IssueGroupCardProps) {
  const sev = SEVERITY_STYLES[group.effectiveSeverity];
  const iss = group.primary.issue;
  const canApply = !!iss.original_text && !!iss.replacement_text;
  const isMultiLLM = group.providers.length >= 2;
  const requiresRewrite = needsParagraphRewrite(iss);

  // 문단 재작성 local state
  const [rewriteState, setRewriteState] = useState<RewriteState>("idle");
  const [originalParagraph, setOriginalParagraph] = useState<string | null>(null);
  const [rewrittenParagraph, setRewrittenParagraph] = useState<string | null>(null);
  const [rewriteError, setRewriteError] = useState<string | null>(null);

  async function handleRequestRewrite() {
    setRewriteState("generating");
    setRewriteError(null);
    const res = await onRewriteRequest();
    if ("error" in res) {
      setRewriteState("idle");
      setRewriteError(res.error);
      toast.error(res.error);
      return;
    }
    setOriginalParagraph(res.originalParagraph);
    setRewrittenParagraph(res.rewrittenParagraph);
    setRewriteState("preview");
  }

  function handleConfirm() {
    if (!originalParagraph || !rewrittenParagraph) return;
    const ok = onRewriteConfirm(originalParagraph, rewrittenParagraph);
    if (ok) {
      setRewriteState("applied-rewrite");
    }
  }

  function handleCancelPreview() {
    setRewriteState("idle");
    setOriginalParagraph(null);
    setRewrittenParagraph(null);
  }

  function handleRewriteUndoClick() {
    if (!originalParagraph || !rewrittenParagraph) {
      onUndo(); // 문단 정보가 없으면 단순 undo 로 fallback
      return;
    }
    const ok = onRewriteUndo(originalParagraph, rewrittenParagraph);
    if (ok) {
      setRewriteState("idle");
      setOriginalParagraph(null);
      setRewrittenParagraph(null);
    }
  }

  const effectiveStatus: ItemStatus =
    rewriteState === "applied-rewrite" ? "applied" : status;

  return (
    <div
      className={`rounded-md border p-3 text-sm space-y-2 transition-colors ${
        effectiveStatus === "applied"
          ? "bg-green-50 border-green-200 opacity-90"
          : effectiveStatus === "ignored"
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
        {requiresRewrite && (
          <Badge variant="outline" className="text-[10px] py-0 border-blue-300 text-blue-700">
            문단 재작성
          </Badge>
        )}
        {group.providers.map((p) => (
          <Badge key={p} variant="outline" className="text-xs py-0">
            {p}
          </Badge>
        ))}
        {isMultiLLM && (
          <span className="text-xs text-muted-foreground">· {group.providers.length}개 LLM 지적</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {effectiveStatus === "applied" ? (
            <>
              <Badge style={{ backgroundColor: "#16a34a", color: "white" }} className="text-xs">
                <Check className="mr-0.5 h-3.5 w-3.5" />
                {rewriteState === "applied-rewrite" ? "다듬기 반영됨" : "반영됨"}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={rewriteState === "applied-rewrite" ? handleRewriteUndoClick : onUndo}
                title="본문에서 되돌리고 다시 처리할 수 있게 합니다"
              >
                <RotateCcw className="mr-0.5 h-3.5 w-3.5" />
                되돌리기
              </Button>
            </>
          ) : effectiveStatus === "ignored" ? (
            <>
              <Badge variant="outline" className="text-xs text-muted-foreground">
                무시됨
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={onUndo}
                title="다시 [반영] / [무시] 를 선택할 수 있게 합니다"
              >
                <RotateCcw className="mr-0.5 h-3.5 w-3.5" />
                되돌리기
              </Button>
            </>
          ) : rewriteState === "generating" ? (
            <Badge variant="outline" className="text-xs">
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              다듬는 중...
            </Badge>
          ) : rewriteState === "preview" ? null : (
            <>
              {requiresRewrite ? (
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 px-2.5 text-xs"
                  onClick={handleRequestRewrite}
                  disabled={!iss.original_text}
                  title="해당 문단을 LLM 에게 다시 다듬게 합니다 (앞뒤 문맥 자연스럽게)"
                >
                  <Check className="mr-0.5 h-3.5 w-3.5" />
                  반영 + 다듬기
                </Button>
              ) : (
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
              )}
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

      {/* 단순 치환 케이스: 기존 diff 박스 (original_text → replacement_text) */}
      {!requiresRewrite && canApply && rewriteState === "idle" && (
        <div className="mt-2 rounded bg-background border p-2 space-y-1">
          <p
            className={`text-xs leading-relaxed whitespace-pre-wrap break-words ${
              effectiveStatus === "applied" ? "" : "line-through"
            }`}
            style={{
              color: effectiveStatus === "applied" ? "#dc2626" : "var(--neutral-text-muted)",
            }}
          >
            {iss.original_text}
          </p>
          <p
            className="text-xs leading-relaxed whitespace-pre-wrap break-words"
            style={{ color: effectiveStatus === "applied" ? "#16a34a" : "var(--foreground)" }}
          >
            → {iss.replacement_text}
          </p>
        </div>
      )}

      {/* 문단 재작성 preview — LLM 이 다듬어 준 문단을 수정 전/후로 비교 */}
      {rewriteState === "preview" && originalParagraph && rewrittenParagraph && (
        <div className="mt-2 space-y-2">
          <div className="rounded border p-2 bg-red-50">
            <div className="text-[10px] font-semibold text-red-700 mb-1">수정 전 문단</div>
            <p className="text-xs leading-relaxed whitespace-pre-wrap break-words text-neutral-600 line-through">
              {originalParagraph}
            </p>
          </div>
          <div className="rounded border p-2 bg-green-50">
            <div className="text-[10px] font-semibold text-green-700 mb-1">수정 후 문단 (LLM 다듬기)</div>
            <p className="text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground">
              {rewrittenParagraph}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="default"
              className="h-7 px-3 text-xs"
              onClick={handleConfirm}
              style={{ backgroundColor: "var(--brand-accent)" }}
            >
              <Check className="mr-0.5 h-3.5 w-3.5" />
              적용
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs"
              onClick={handleCancelPreview}
            >
              <X className="mr-0.5 h-3.5 w-3.5" />
              원래대로
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-3 text-xs"
              onClick={handleRequestRewrite}
            >
              <RotateCcw className="mr-0.5 h-3.5 w-3.5" />
              다시 다듬기
            </Button>
          </div>
        </div>
      )}

      {rewriteError && rewriteState === "idle" && (
        <p className="text-xs text-red-600 whitespace-pre-wrap break-words">{rewriteError}</p>
      )}
    </div>
  );
}
