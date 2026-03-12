"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QualityBadge } from "@/components/common/quality-badge";
import { cn } from "@/lib/utils";
import type { Content } from "@/lib/types/database";
import {
  Eye,
  Clock,
  Search,
  MousePointerClick,
  BarChart3,
} from "lucide-react";

interface QualityScoreProps {
  content: Content;
}

/** 원형 점수 인디케이터 */
function CircularScore({ score }: { score: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const strokeDashoffset = circumference - progress;

  // 점수에 따른 색상 (UCL semantic tokens)
  const color =
    score >= 80
      ? "var(--success)"
      : score >= 60
        ? "var(--info)"
        : score >= 40
          ? "var(--warning)"
          : "var(--danger)";

  return (
    <div className="relative flex items-center justify-center">
      <svg width="100" height="100" className="-rotate-90">
        {/* 배경 원 — progress-track */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--g200)"
          strokeWidth="8"
          className="progress-track"
        />
        {/* 진행률 원 — progress-fill */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="progress-fill transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="stat-value font-num t-2xl font-bold" style={{ color }}>
          {Math.round(score)}
        </span>
      </div>
    </div>
  );
}

/** 지표 항목 */
function MetricRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="doc-row flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2 t-sm" style={{ color: "var(--g500)" }}>
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <span className="stat-value font-num t-sm font-medium" style={{ color: "var(--g900)" }}>
        {value}
      </span>
    </div>
  );
}

/**
 * 콘텐츠 품질 점수 및 성과 지표 표시 컴포넌트
 */
export function QualityScore({ content }: QualityScoreProps) {
  const statusOrder = ["S0", "S1", "S2", "S3", "S4", "S5"];
  const statusIndex = statusOrder.indexOf(content.status);

  // S4 미만이면 안내 메시지
  if (statusIndex < 4) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="t-lg">품질 점수</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <BarChart3 className="h-8 w-8 mb-2" style={{ color: "var(--g300)" }} />
            <p className="t-sm" style={{ color: "var(--g500)" }}>
              발행 후 측정됩니다
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const finalScore = content.quality_score_final ?? content.quality_score_1st ?? 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="t-lg">품질 점수</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 원형 점수 + 등급 뱃지 */}
        <div className="flex flex-col items-center gap-2">
          <CircularScore score={finalScore} />
          <QualityBadge score={finalScore} />
          {content.quality_score_1st != null &&
            content.quality_score_final != null &&
            content.quality_score_1st !== content.quality_score_final && (
              <p className="t-xs" style={{ color: "var(--g500)" }}>
                초기 {Math.round(content.quality_score_1st)}점 →{" "}
                최종 {Math.round(content.quality_score_final)}점
              </p>
            )}
        </div>

        {/* 성과 지표 */}
        <div className={cn("pt-3 space-y-0.5")} style={{ borderTop: "1px solid var(--g200)" }}>
          <MetricRow
            icon={Eye}
            label="주간 조회수"
            value={
              content.views_1w != null
                ? content.views_1w.toLocaleString()
                : "-"
            }
          />
          <MetricRow
            icon={Eye}
            label="월간 조회수"
            value={
              content.views_1m != null
                ? content.views_1m.toLocaleString()
                : "-"
            }
          />
          <MetricRow
            icon={Clock}
            label="평균 체류시간"
            value={
              content.avg_duration_sec != null
                ? `${Math.floor(content.avg_duration_sec / 60)}분 ${content.avg_duration_sec % 60}초`
                : "-"
            }
          />
          <MetricRow
            icon={Search}
            label="검색 순위"
            value={
              content.search_rank != null
                ? `${content.search_rank}위`
                : "-"
            }
          />
          <MetricRow
            icon={MousePointerClick}
            label="CTA 클릭수"
            value={
              content.cta_clicks != null
                ? content.cta_clicks.toLocaleString()
                : "-"
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
