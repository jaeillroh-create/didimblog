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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          메트릭 데이터가 없습니다.
        </CardContent>
      </Card>
    );
  }

  const chartData = metrics.map((m) => ({
    month: formatMonth(m.month),
    published_count: m.published_count,
    total_views: m.total_views,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">월별 성과</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {/* 발행 건수 바 차트 */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">발행 건수</p>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={24}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
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
            <p className="text-xs text-muted-foreground mb-2">총 조회수</p>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
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
      </CardContent>
    </Card>
  );
}
