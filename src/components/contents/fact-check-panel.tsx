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
} from "lucide-react";
import { useState } from "react";

interface FactCheckPanelProps {
  status: "idle" | "checking" | "done" | "error" | "skipped";
  result?: FactCheckResult | null;
  error?: string | null;
  onSkip?: () => void;
  onRetry?: () => void;
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

export function FactCheckPanel({ status, result, error, onSkip, onRetry }: FactCheckPanelProps) {
  const [issuesOpen, setIssuesOpen] = useState(true);
  const [factsOpen, setFactsOpen] = useState(false);

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
                  return (
                    <div key={i} className="rounded-md border p-2 text-xs space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: sev.color + "20", color: sev.color }}>
                          {sev.label}
                        </span>
                        <span className="font-medium">{issue.category}</span>
                        {issue.location && (
                          <span className="text-muted-foreground truncate max-w-[120px]">&ldquo;{issue.location}...&rdquo;</span>
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
