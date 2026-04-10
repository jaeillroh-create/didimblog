"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { FactCheckResult } from "@/lib/client-generate";
import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  SkipForward,
  Replace,
  Check,
} from "lucide-react";
import { useState, useCallback } from "react";
import { toast } from "sonner";

interface FactCheckPanelProps {
  status: "idle" | "checking" | "done" | "error" | "skipped";
  result?: FactCheckResult | null;
  error?: string | null;
  onSkip?: () => void;
  onRetry?: () => void;
  onApplyFix?: (originalText: string, replacementText: string) => boolean;
  onApplyAllFixes?: () => void;
}

const SEVERITY_STYLE: Record<string, { color: string; label: string }> = {
  high: { color: "var(--quality-critical)", label: "심각" },
  medium: { color: "var(--quality-average)", label: "주의" },
  low: { color: "var(--quality-good)", label: "경미" },
};

const VERDICT_STYLE: Record<string, { color: string; icon: typeof CheckCircle2; label: string }> = {
  pass: { color: "var(--quality-excellent)", icon: CheckCircle2, label: "통과" },
  fix_required: { color: "var(--quality-average)", icon: AlertTriangle, label: "수정 필요" },
  major_issues: { color: "var(--quality-critical)", icon: XCircle, label: "주요 문제" },
};

const FACT_VERDICT_STYLE: Record<string, string> = {
  "정확": "var(--quality-excellent)",
  "확인필요": "var(--quality-average)",
  "오류": "var(--quality-critical)",
};

export function FactCheckPanel({ status, result, error, onSkip, onRetry, onApplyFix, onApplyAllFixes }: FactCheckPanelProps) {
  const [issuesOpen, setIssuesOpen] = useState(true);
  const [factsOpen, setFactsOpen] = useState(false);
  const [appliedIssues, setAppliedIssues] = useState<Set<number>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);

  const handleApplySingle = useCallback((index: number) => {
    if (!result || !onApplyFix) return;
    const issue = result.issues[index];
    if (!issue?.original_text || !issue?.replacement_text) return;

    const success = onApplyFix(issue.original_text, issue.replacement_text);
    if (success) {
      setAppliedIssues((prev) => new Set(prev).add(index));
      toast.success("수정 반영 완료");
    } else {
      toast.error("원문 매칭 실패 — 수동 확인 필요");
    }
  }, [result, onApplyFix]);

  const handleApplyAll = useCallback(() => {
    if (!result || !onApplyFix) return;
    setShowConfirm(false);

    // severity high → medium → low 순서
    const sortedIndices = result.issues
      .map((_, i) => i)
      .filter((i) => !appliedIssues.has(i))
      .filter((i) => result.issues[i].original_text && result.issues[i].replacement_text)
      .sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return (order[result.issues[a].severity] ?? 1) - (order[result.issues[b].severity] ?? 1);
      });

    let applied = 0;
    let failed = 0;
    const newApplied = new Set(appliedIssues);

    for (const i of sortedIndices) {
      const issue = result.issues[i];
      const success = onApplyFix(issue.original_text!, issue.replacement_text!);
      if (success) {
        newApplied.add(i);
        applied++;
      } else {
        failed++;
      }
    }

    setAppliedIssues(newApplied);

    if (applied > 0) toast.success(`${applied}건 수정 반영 완료`);
    if (failed > 0) toast.info(`${failed}건 수동 확인 필요 (원문 매칭 실패)`);
    if (applied === 0 && failed === 0) toast.info("반영할 수정 사항이 없습니다");
  }, [result, onApplyFix, appliedIssues]);

  if (status === "idle" || status === "skipped") return null;

  if (status === "checking") {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-6">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--brand-accent)" }} />
          <div>
            <p className="text-sm font-medium">팩트체크 진행 중...</p>
            <p className="text-xs text-muted-foreground">법률 근거, 수치, 톤 일관성을 검증하고 있습니다</p>
          </div>
          {onSkip && (
            <Button variant="ghost" size="sm" className="ml-auto" onClick={onSkip}>
              <SkipForward className="h-3.5 w-3.5 mr-1" />
              건너뛰기
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card>
        <CardContent className="py-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">팩트체크 실패: {error || "알 수 없는 오류"}</p>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              재시도
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!result) return null;

  const verdictInfo = VERDICT_STYLE[result.verdict] ?? VERDICT_STYLE.fix_required;
  const VerdictIcon = verdictInfo.icon;
  const fixableCount = result.issues.filter((issue, i) => !appliedIssues.has(i) && issue.original_text && issue.replacement_text).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Shield className="h-4 w-4" />
            팩트체크 결과
          </span>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold" style={{ color: verdictInfo.color }}>
              {result.overall_score}점
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: verdictInfo.color + "20", color: verdictInfo.color }}
            >
              <VerdictIcon className="h-3 w-3 inline mr-0.5" />
              {verdictInfo.label}
            </span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 전체 수정 반영 버튼 */}
        {fixableCount > 0 && onApplyFix && (
          <div>
            {showConfirm ? (
              <div className="rounded-md border p-3 space-y-2 bg-muted/30">
                <p className="text-xs">팩트체크 지적 사항 {fixableCount}건을 본문에 자동 반영합니다. 반영 후에도 직접 확인해주세요.</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="default" onClick={handleApplyAll}>
                    반영
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowConfirm(false)}>
                    취소
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="w-full" onClick={() => setShowConfirm(true)}>
                <Replace className="h-3.5 w-3.5 mr-1" />
                전체 수정 반영 ({fixableCount}건)
              </Button>
            )}
          </div>
        )}

        {/* 잘된 점 */}
        {result.strengths.length > 0 && (
          <div className="space-y-1">
            {result.strengths.map((s, i) => (
              <p key={i} className="text-xs flex items-start gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: "var(--quality-excellent)" }} />
                {s}
              </p>
            ))}
          </div>
        )}

        {/* 이슈 */}
        {result.issues.length > 0 && (
          <div>
            <button
              onClick={() => setIssuesOpen(!issuesOpen)}
              className="flex items-center gap-1 text-xs font-medium w-full text-left py-1"
            >
              {issuesOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              지적 사항 ({result.issues.length}개)
            </button>
            {issuesOpen && (
              <div className="space-y-2 mt-1">
                {result.issues.map((issue, i) => {
                  const sev = SEVERITY_STYLE[issue.severity] ?? SEVERITY_STYLE.medium;
                  const isApplied = appliedIssues.has(i);
                  const canApply = !!issue.original_text && !!issue.replacement_text && !isApplied;

                  return (
                    <div key={i} className={`rounded-md border p-2 text-xs space-y-1 ${isApplied ? "opacity-50" : ""}`}>
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: sev.color + "20", color: sev.color }}>
                          {isApplied ? "반영됨" : sev.label}
                        </span>
                        <span className="font-medium">{issue.category}</span>
                        {issue.location && (
                          <span className="text-muted-foreground truncate max-w-[120px]">&ldquo;{issue.location}...&rdquo;</span>
                        )}
                        {canApply && onApplyFix && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-auto h-6 px-2 text-[10px]"
                            onClick={() => handleApplySingle(i)}
                          >
                            <Replace className="h-3 w-3 mr-0.5" />
                            반영
                          </Button>
                        )}
                        {isApplied && (
                          <Check className="ml-auto h-3.5 w-3.5 shrink-0" style={{ color: "var(--quality-excellent)" }} />
                        )}
                        {!canApply && !isApplied && !issue.original_text && (
                          <span className="ml-auto text-[10px] text-muted-foreground">수동 확인</span>
                        )}
                      </div>
                      <p className="text-muted-foreground">{issue.description}</p>
                      <p style={{ color: "var(--brand-accent)" }}>{issue.suggestion}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 팩트체크 항목 */}
        {result.fact_check_items.length > 0 && (
          <div>
            <button
              onClick={() => setFactsOpen(!factsOpen)}
              className="flex items-center gap-1 text-xs font-medium w-full text-left py-1"
            >
              {factsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              팩트체크 ({result.fact_check_items.length}개)
            </button>
            {factsOpen && (
              <div className="space-y-1 mt-1">
                {result.fact_check_items.map((item, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs">
                    <span
                      className="shrink-0 mt-0.5 w-2 h-2 rounded-full"
                      style={{ backgroundColor: FACT_VERDICT_STYLE[item.verdict] ?? "#999" }}
                    />
                    <div>
                      <span className="font-medium">{item.claim}</span>
                      <span className="text-muted-foreground ml-1">— {item.verdict}: {item.reason}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
