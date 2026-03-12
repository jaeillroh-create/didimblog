"use client";

import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
} from "recharts";
import type { MonthlyKPI } from "@/actions/analytics";

interface KpiTrendChartProps {
  data: MonthlyKPI[];
}

const MONTH_LABELS: Record<string, string> = {
  "2026-01": "1월",
  "2026-02": "2월",
  "2026-03": "3월",
  "2026-04": "4월",
  "2026-05": "5월",
  "2026-06": "6월",
};

const LINE_COLORS = {
  views: "var(--brand)",
  duration: "var(--status-s2)",
  conversions: "var(--success)",
  published: "var(--status-s3)",
} as const;

const LABEL_MAP: Record<string, string> = {
  totalViews: "조회수",
  avgDuration: "체류시간(초)",
  conversions: "전환수",
  publishedCount: "발행건수",
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const monthLabel = MONTH_LABELS[label as string] ?? label;

  return (
    <div
      className="p-3"
      style={{
        borderRadius: "var(--r-lg)",
        border: "1px solid var(--g150)",
        background: "var(--white)",
        boxShadow: "var(--sh-md)",
      }}
    >
      <p className="mb-2 t-sm" style={{ fontWeight: 700, color: "var(--g900)" }}>{monthLabel}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 t-sm">
          <span
            className="inline-block h-2.5 w-2.5"
            style={{ backgroundColor: entry.color, borderRadius: "var(--r-full)" }}
          />
          <span style={{ color: "var(--g500)" }}>
            {LABEL_MAP[entry.dataKey] ?? entry.dataKey}:
          </span>
          <span className="font-num" style={{ fontWeight: 600, color: "var(--g900)" }}>
            {entry.dataKey === "avgDuration"
              ? `${Math.floor(entry.value / 60)}분 ${entry.value % 60}초`
              : entry.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

export function KpiTrendChart({ data }: KpiTrendChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    monthLabel: MONTH_LABELS[d.month] ?? d.month,
  }));

  return (
    <div className="scard">
      <div className="scard-head">
        <div className="scard-head-left">
          <span className="tf tf-16">📈</span>
          <span className="scard-head-title">KPI 트렌드</span>
        </div>
      </div>
      <div className="scard-body">
        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--g150)" />
              <XAxis
                dataKey="month"
                tickFormatter={(v: string) => MONTH_LABELS[v] ?? v}
                tick={{ fontSize: 11, fill: "var(--g500)" }}
              />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "var(--g500)" }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "var(--g500)" }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(value: string) => LABEL_MAP[value] ?? value}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="totalViews"
                stroke={LINE_COLORS.views}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="avgDuration"
                stroke={LINE_COLORS.duration}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="conversions"
                stroke={LINE_COLORS.conversions}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="publishedCount"
                stroke={LINE_COLORS.published}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
