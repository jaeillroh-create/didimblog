"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { colors } from "@/lib/constants/design-tokens";
import type { Lead } from "@/lib/types/database";

interface PipelineChartProps {
  leads: Lead[];
}

const PIPELINE_COLORS = {
  S3: colors.status.s3,
  S4: colors.status.s4,
  S5: colors.status.s5,
};

const SOURCE_COLORS = {
  blog: colors.brand.cta,
  referral: colors.brand.primary,
  other: colors.neutral.textMuted,
};

const SOURCE_LABELS: Record<string, string> = {
  blog: "블로그",
  referral: "소개",
  other: "기타",
};

export function PipelineChart({ leads }: PipelineChartProps) {
  // 파이프라인 데이터 계산
  const pipelineData = useMemo(() => {
    const s3Count = leads.filter((l) => l.visitor_status === "S3").length;
    const s4Count = leads.filter((l) => l.visitor_status === "S4").length;
    const s5Count = leads.filter((l) => l.visitor_status === "S5").length;

    // 전환율 계산 (누적 기준: S4+S5는 S3 단계를 거친 것)
    const totalFromS3 = s3Count + s4Count + s5Count; // 전체 리드
    const reachedS4 = s4Count + s5Count; // S4 이상 도달
    const reachedS5 = s5Count; // S5 도달

    const s3ToS4Rate = totalFromS3 > 0 ? Math.round((reachedS4 / totalFromS3) * 100) : 0;
    const s4ToS5Rate = reachedS4 > 0 ? Math.round((reachedS5 / reachedS4) * 100) : 0;

    return {
      chartData: [
        { name: "리드 (S3)", count: s3Count, fill: PIPELINE_COLORS.S3 },
        { name: "상담 (S4)", count: s4Count, fill: PIPELINE_COLORS.S4 },
        { name: "계약 (S5)", count: s5Count, fill: PIPELINE_COLORS.S5 },
      ],
      s3ToS4Rate,
      s4ToS5Rate,
    };
  }, [leads]);

  // 유입경로 분포 데이터
  const sourceData = useMemo(() => {
    const counts: Record<string, number> = { blog: 0, referral: 0, other: 0 };
    leads.forEach((lead) => {
      counts[lead.source] = (counts[lead.source] || 0) + 1;
    });

    return Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([source, count]) => ({
        name: SOURCE_LABELS[source] ?? source,
        value: count,
        fill: SOURCE_COLORS[source as keyof typeof SOURCE_COLORS] ?? colors.neutral.textMuted,
      }));
  }, [leads]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 파이프라인 바 차트 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">
            리드 파이프라인
          </CardTitle>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>
              S3→S4 전환율:{" "}
              <span className="font-semibold text-foreground">
                {pipelineData.s3ToS4Rate}%
              </span>
            </span>
            <span>
              S4→S5 전환율:{" "}
              <span className="font-semibold text-foreground">
                {pipelineData.s4ToS5Rate}%
              </span>
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={pipelineData.chartData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={80}
                  tick={{ fontSize: 13 }}
                />
                <Tooltip
                  formatter={(value) => [`${value}건`, "리드 수"]}
                  contentStyle={{
                    borderRadius: "8px",
                    border: `1px solid ${colors.neutral.border}`,
                  }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={28}>
                  {pipelineData.chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 유입경로 도넛 차트 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">
            유입경로 분포
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sourceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {sourceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [`${value}건`, "리드 수"]}
                  contentStyle={{
                    borderRadius: "8px",
                    border: `1px solid ${colors.neutral.border}`,
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value: string) => (
                    <span className="text-xs">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
