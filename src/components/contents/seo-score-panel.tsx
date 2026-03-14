"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  calculateSeoScore,
  type SeoScoreResult,
  type SeoCheckResult,
} from "@/lib/seo-calculator";
import { getScoreColor } from "@/lib/constants/seo-rubrics";
import type { Content } from "@/lib/types/database";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  TrendingUp,
} from "lucide-react";

interface SeoScorePanelProps {
  content: Content;
  categoryId: string | null;
  /** 점수 변경 시 콜백 (seo_score 저장용) */
  onScoreChange?: (score: number) => void;
}

const VERDICT_CONFIG = {
  pass: {
    label: "통과",
    icon: CheckCircle2,
    badgeClass: "bg-green-100 text-green-700",
  },
  fix_required: {
    label: "수정 필요",
    icon: AlertTriangle,
    badgeClass: "bg-orange-100 text-orange-700",
  },
  blocked: {
    label: "발행 불가",
    icon: XCircle,
    badgeClass: "bg-red-100 text-red-700",
  },
};

/**
 * SEO 자동 계산 점수 패널
 * 기존 수동 체크박스(SeoChecklist) 대체
 */
export function SeoScorePanel({
  content,
  categoryId,
  onScoreChange,
}: SeoScorePanelProps) {
  const result: SeoScoreResult = useMemo(() => {
    const r = calculateSeoScore(content, categoryId);
    // 점수 변경 콜백
    onScoreChange?.(r.normalizedScore);
    return r;
  }, [content, categoryId, onScoreChange]);

  const verdictConfig = VERDICT_CONFIG[result.verdict];
  const VerdictIcon = verdictConfig.icon;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            SEO 점수
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* 점수 */}
            <span
              className={cn(
                "text-2xl font-bold",
                getScoreColor(result.normalizedScore)
              )}
            >
              {result.normalizedScore}
            </span>
            <span className="text-sm text-muted-foreground">/100</span>
            {/* 판정 뱃지 */}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                verdictConfig.badgeClass
              )}
            >
              <VerdictIcon className="h-3.5 w-3.5" />
              {verdictConfig.label}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 프로그레스 바 */}
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className={cn(
              "h-2 rounded-full transition-all",
              result.normalizedScore >= 80
                ? "bg-green-500"
                : result.normalizedScore >= 50
                  ? "bg-orange-400"
                  : "bg-red-500"
            )}
            style={{ width: `${result.normalizedScore}%` }}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {result.activeItemCount}개 항목 검사 (
          {result.totalScore}/{result.maxPossibleScore}점)
        </p>

        {/* 개별 항목 */}
        <div className="space-y-1.5 mt-3">
          {result.items.map((item) => (
            <SeoItemRow key={item.key} item={item} />
          ))}
        </div>

        {/* S3+ 발행 불가 경고 */}
        {result.verdict === "blocked" && (
          <div className="mt-3 px-3 py-2 bg-red-50 rounded-lg border border-red-200">
            <p className="text-sm text-red-700 font-medium">
              발행 불가 — SEO 점수가 50점 미만입니다
            </p>
            <p className="text-xs text-red-600 mt-1">
              S3(발행예정) 이상에서는 50점 이상이어야 발행 가능합니다.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** 개별 SEO 항목 행 */
function SeoItemRow({ item }: { item: SeoCheckResult }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm",
        item.passed ? "bg-green-50/50" : "bg-red-50/50"
      )}
    >
      {/* 상태 아이콘 */}
      {item.passed ? (
        <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
      )}

      {/* 라벨 */}
      <span className="font-medium min-w-[80px] flex-shrink-0">
        {item.label}
      </span>

      {/* 실측값 */}
      <span className="text-muted-foreground text-xs flex-shrink-0">
        {item.actual}
      </span>

      {/* 기준 */}
      <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
        ({item.expected})
      </span>

      {/* 점수 */}
      <span
        className={cn(
          "text-xs font-bold flex-shrink-0 min-w-[40px] text-right",
          item.passed ? "text-green-600" : "text-red-500"
        )}
      >
        {item.score}/{item.maxScore}
      </span>

      {/* 힌트 (미통과 시 툴팁) */}
      {!item.passed && item.hint && (
        <span className="text-xs text-orange-600 hidden lg:inline truncate max-w-[200px]" title={item.hint}>
          {item.hint}
        </span>
      )}
    </div>
  );
}
