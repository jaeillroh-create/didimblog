"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { requestCrossValidation, getValidationResults, regenerateDraft } from "@/actions/ai";
import type { ValidationResult, ValidationIssue, LLMProvider } from "@/lib/types/database";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  RefreshCw,
  ArrowRight,
} from "lucide-react";

interface CrossValidationPanelProps {
  generationId: number;
  onRegenerate?: (newGenerationId: number) => void;
  onProceed?: () => void;
}

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  claude: "Claude",
  openai: "GPT-4o",
  gemini: "Gemini",
};

const VERDICT_CONFIG = {
  pass: {
    label: "통과",
    color: "var(--quality-excellent)",
    bg: "#dcfce7",
    icon: CheckCircle2,
  },
  fix_required: {
    label: "수정 필요",
    color: "var(--quality-average)",
    bg: "#fef3c7",
    icon: AlertTriangle,
  },
  major_issues: {
    label: "주요 문제",
    color: "var(--quality-critical)",
    bg: "#fee2e2",
    icon: XCircle,
  },
} as const;

const SEVERITY_STYLES = {
  high: { color: "#dc2626", bg: "#fee2e2", label: "높음" },
  medium: { color: "#d97706", bg: "#fef3c7", label: "중간" },
  low: { color: "#6b7280", bg: "#f3f4f6", label: "낮음" },
} as const;

export function CrossValidationPanel({
  generationId,
  onRegenerate,
  onProceed,
}: CrossValidationPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [isValidating, setIsValidating] = useState(false);
  const [results, setResults] = useState<ValidationResult[] | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleRequestValidation() {
    setIsValidating(true);
    setError(null);

    startTransition(async () => {
      const providers: LLMProvider[] = ["claude", "openai", "gemini"];
      const result = await requestCrossValidation({
        generationId,
        llmProviders: providers,
      });

      if (!result.success || !result.validationId) {
        setError(result.error || "교차검증 요청에 실패했습니다.");
        setIsValidating(false);
        return;
      }

      // 폴링으로 결과 대기
      const validationId = result.validationId;
      const pollInterval = setInterval(async () => {
        const status = await getValidationResults(validationId);
        if (status.success && status.status === "completed" && status.results) {
          clearInterval(pollInterval);
          setResults(status.results);
          setIsValidating(false);
        } else if (status.status === "failed") {
          clearInterval(pollInterval);
          setError(status.error || "교차검증에 실패했습니다.");
          setIsValidating(false);
        }
      }, 3000);

      // 최대 5분 타임아웃
      setTimeout(() => {
        clearInterval(pollInterval);
        if (isValidating) {
          setIsValidating(false);
          setError("교차검증 시간이 초과되었습니다.");
        }
      }, 300000);
    });
  }

  function handleRegenerate() {
    startTransition(async () => {
      const result = await regenerateDraft({
        generationId,
        feedback: feedback.trim() || undefined,
      });

      if (result.success && result.newGenerationId) {
        onRegenerate?.(result.newGenerationId);
      } else {
        setError(result.error || "재생성에 실패했습니다.");
      }
    });
  }

  // 검증 전 상태
  if (!results && !isValidating) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">교차검증</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[var(--neutral-text-muted)]">
            멀티 LLM으로 초안의 팩트체크, 논리, 톤, SEO를 검증합니다.
          </p>
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
          <Button
            onClick={handleRequestValidation}
            disabled={isPending}
            variant="outline"
            className="w-full"
          >
            교차검증 요청
          </Button>
        </CardContent>
      </Card>
    );
  }

  // 검증 중
  if (isValidating) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">교차검증 진행 중</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 py-6 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--brand-accent)" }} />
            <span className="text-sm text-[var(--neutral-text-muted)]">
              멀티 LLM 검증 중...
            </span>
          </div>
          <div className="flex gap-2 justify-center">
            {(["claude", "openai", "gemini"] as LLMProvider[]).map((p) => (
              <Badge key={p} variant="outline" className="text-xs">
                {PROVIDER_LABELS[p]}
                <Loader2 className="ml-1 h-3 w-3 animate-spin" />
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // 검증 완료
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">교차검증 결과</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {results?.map((result, i) => {
            const verdictConfig = VERDICT_CONFIG[result.verdict];
            const VerdictIcon = verdictConfig.icon;
            return (
              <div key={i} className="rounded-lg border p-4">
                {/* 헤더 */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {PROVIDER_LABELS[result.llm]}
                    </span>
                    <span className="text-sm font-semibold">
                      ({result.overall_score}점)
                    </span>
                  </div>
                  <Badge
                    style={{
                      backgroundColor: verdictConfig.bg,
                      color: verdictConfig.color,
                    }}
                  >
                    <VerdictIcon className="mr-1 h-3 w-3" />
                    {verdictConfig.label}
                  </Badge>
                </div>

                <Separator className="mb-3" />

                {/* 이슈 목록 */}
                {result.issues.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {result.issues.map((issue: ValidationIssue, j: number) => {
                      const sevStyle = SEVERITY_STYLES[issue.severity];
                      return (
                        <div key={j} className="flex items-start gap-2 text-sm">
                          <Badge
                            variant="outline"
                            className="mt-0.5 shrink-0 text-xs"
                            style={{
                              backgroundColor: sevStyle.bg,
                              color: sevStyle.color,
                              borderColor: sevStyle.color,
                            }}
                          >
                            {issue.category}
                          </Badge>
                          <div>
                            <p>{issue.description}</p>
                            {issue.suggestion && (
                              <p className="mt-0.5 text-xs text-[var(--neutral-text-muted)]">
                                제안: {issue.suggestion}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 강점 */}
                {result.strengths.length > 0 && (
                  <div className="space-y-1">
                    {result.strengths.map((s, j) => (
                      <div key={j} className="flex items-center gap-1 text-sm">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--quality-excellent)" }} />
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          {/* 피드백 + 액션 */}
          <Separator />
          <div className="space-y-3">
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="재생성 시 반영할 피드백을 입력하세요 (선택)"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleRegenerate}
                disabled={isPending}
                className="flex-1"
              >
                <RefreshCw className="mr-1 h-4 w-4" />
                {isPending ? "재생성 중..." : "피드백 반영 재생성"}
              </Button>
              <Button
                onClick={onProceed}
                className="flex-1"
                style={{ backgroundColor: "var(--brand-accent)" }}
              >
                <ArrowRight className="mr-1 h-4 w-4" />
                현재 초안으로 진행
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
