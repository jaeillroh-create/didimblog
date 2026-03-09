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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  views: "var(--brand-accent)",
  duration: "var(--status-s2)",
  conversions: "var(--semantic-success)",
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
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="mb-2 text-sm font-semibold">{monthLabel}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">
            {LABEL_MAP[entry.dataKey] ?? entry.dataKey}:
          </span>
          <span className="font-medium">
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
    <Card>
      <CardHeader>
        <CardTitle>KPI 트렌드</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="month"
                tickFormatter={(v: string) => MONTH_LABELS[v] ?? v}
                className="text-xs"
              />
              <YAxis yAxisId="left" className="text-xs" />
              <YAxis yAxisId="right" orientation="right" className="text-xs" />
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
      </CardContent>
    </Card>
  );
}
