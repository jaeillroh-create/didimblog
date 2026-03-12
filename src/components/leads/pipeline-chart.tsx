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
import type { Lead } from "@/lib/types/database";

interface PipelineChartProps {
  leads: Lead[];
}

const PIPELINE_COLORS = {
  S3: "var(--status-s3)",
  S4: "var(--status-s1)",
  S5: "var(--status-s4)",
};

const SOURCE_COLORS = {
  blog: "var(--brand)",
  referral: "var(--info)",
  other: "var(--g400)",
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
        fill: SOURCE_COLORS[source as keyof typeof SOURCE_COLORS] ?? "var(--g400)",
      }));
  }, [leads]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 파이프라인 바 차트 */}
      <div className="card-default">
        <div className="mb-3">
          <h3 className="t-lg" style={{ color: "var(--g900)" }}>
            <span className="tf tf-14">📊</span> 리드 파이프라인
          </h3>
          <div className="flex gap-4 t-xs mt-1" style={{ color: "var(--g500)" }}>
            <span>
              S3→S4 전환율:{" "}
              <span className="font-num" style={{ fontWeight: 700, color: "var(--g900)" }}>
                {pipelineData.s3ToS4Rate}%
              </span>
            </span>
            <span>
              S4→S5 전환율:{" "}
              <span className="font-num" style={{ fontWeight: 700, color: "var(--g900)" }}>
                {pipelineData.s4ToS5Rate}%
              </span>
            </span>
          </div>
        </div>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={pipelineData.chartData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--g150)" />
              <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--g500)", fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={80}
                tick={{ fill: "var(--g700)", fontSize: 13 }}
              />
              <Tooltip
                formatter={(value) => [`${value}건`, "리드 수"]}
                contentStyle={{
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--g150)",
                  boxShadow: "var(--sh-md)",
                  fontSize: 13,
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
      </div>

      {/* 유입경로 도넛 차트 */}
      <div className="card-default">
        <div className="mb-3">
          <h3 className="t-lg" style={{ color: "var(--g900)" }}>
            <span className="tf tf-14">🔄</span> 유입경로 분포
          </h3>
        </div>
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
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--g150)",
                  boxShadow: "var(--sh-md)",
                  fontSize: 13,
                }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value: string) => (
                  <span className="t-xs">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
