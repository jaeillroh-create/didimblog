"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import type { CategoryMetric } from "@/lib/types/database";

interface CategoryMetricChartProps {
  metrics: CategoryMetric[];
  categoryColor: string;
}

function formatMonth(month: string): string {
  const m = parseInt(month.split("-")[1], 10);
  return `${m}월`;
}

export function CategoryMetricChart({
  metrics,
  categoryColor,
}: CategoryMetricChartProps) {
  if (metrics.length === 0) {
    return (
      <div className="card-default">
        <div className="py-8 text-center t-sm" style={{ color: "var(--g400)" }}>
          메트릭 데이터가 없습니다.
        </div>
      </div>
    );
  }

  const chartData = metrics.map((m) => ({
    month: formatMonth(m.month),
    published_count: m.published_count,
    total_views: m.total_views,
  }));

  return (
    <div className="card-default">
      <div className="mb-3">
        <h3 className="t-md" style={{ fontWeight: 700, color: "var(--g900)" }}>
          <span className="tf tf-14">📊</span> 월별 성과
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {/* 발행 건수 바 차트 */}
        <div>
          <p className="t-xs mb-2" style={{ color: "var(--g500)" }}>발행 건수</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--g150)" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "var(--g500)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--g500)" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={24}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--g150)",
                  boxShadow: "var(--sh-md)",
                }}
                formatter={(value) => [`${value}건`, "발행"]}
              />
              <Bar
                dataKey="published_count"
                fill={categoryColor}
                radius={[4, 4, 0, 0]}
                barSize={24}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 조회수 라인 차트 */}
        <div>
          <p className="t-xs mb-2" style={{ color: "var(--g500)" }}>총 조회수</p>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--g150)" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "var(--g500)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--g500)" }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--g150)",
                  boxShadow: "var(--sh-md)",
                }}
                formatter={(value) => [
                  Number(value).toLocaleString(),
                  "조회수",
                ]}
              />
              <Line
                type="monotone"
                dataKey="total_views"
                stroke={categoryColor}
                strokeWidth={2}
                dot={{ r: 4, fill: categoryColor }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
