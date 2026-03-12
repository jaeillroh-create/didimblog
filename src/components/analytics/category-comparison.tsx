"use client";

import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  Legend,
  Tooltip,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Bar,
} from "recharts";
import type { CategoryMetricData } from "@/actions/analytics";

interface CategoryComparisonProps {
  data: CategoryMetricData[];
}

const CATEGORY_COLORS: Record<string, string> = {
  "CAT-A": "var(--category-field-note)",
  "CAT-B": "var(--category-ip-lounge)",
  "CAT-C": "var(--category-diary)",
};

const MONTH_LABELS: Record<string, string> = {
  "2026-04": "4월",
  "2026-05": "5월",
  "2026-06": "6월",
};

function normalizeValue(value: number, max: number): number {
  if (max === 0) return 0;
  return Math.round((value / max) * 100);
}

function CustomRadarTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
}) {
  if (!active || !payload || payload.length === 0) return null;

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
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 t-sm">
          <span
            className="inline-block h-2.5 w-2.5"
            style={{ backgroundColor: entry.color, borderRadius: "var(--r-full)" }}
          />
          <span style={{ color: "var(--g500)" }}>{entry.name}:</span>
          <span className="font-num" style={{ fontWeight: 600, color: "var(--g900)" }}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export function CategoryComparison({ data }: CategoryComparisonProps) {
  // 가장 최근 월 데이터로 레이더 차트 구성
  const latestMonth = data.length > 0
    ? data.reduce((latest, d) => (d.month > latest ? d.month : latest), data[0].month)
    : "";

  const latestData = data.filter((d) => d.month === latestMonth);

  // 정규화를 위한 최대값 계산
  const maxPublished = Math.max(...latestData.map((d) => d.published_count), 1);
  const maxViews = Math.max(...latestData.map((d) => d.total_views), 1);
  const maxDuration = Math.max(...latestData.map((d) => d.avg_duration_sec), 1);
  const maxConversions = Math.max(...latestData.map((d) => d.estimated_conversions), 1);

  // 레이더 차트 데이터 구성
  const radarAxes = ["발행률", "조회수", "체류시간", "전환수"];
  const radarData = radarAxes.map((axis) => {
    const entry: Record<string, string | number> = { axis };
    for (const cat of latestData) {
      let value = 0;
      switch (axis) {
        case "발행률":
          value = normalizeValue(cat.published_count, maxPublished);
          break;
        case "조회수":
          value = normalizeValue(cat.total_views, maxViews);
          break;
        case "체류시간":
          value = normalizeValue(cat.avg_duration_sec, maxDuration);
          break;
        case "전환수":
          value = normalizeValue(cat.estimated_conversions, maxConversions);
          break;
      }
      entry[cat.category_name] = value;
    }
    return entry;
  });

  // 카테고리별 고유 이름 목록
  const categoryNames = [...new Set(latestData.map((d) => d.category_name))];
  const categoryIdMap = Object.fromEntries(
    latestData.map((d) => [d.category_name, d.category_id])
  );

  // 바 차트 데이터: 월별 발행 건수
  const months = [...new Set(data.map((d) => d.month))].sort();
  const barData = months.map((month) => {
    const entry: Record<string, string | number> = {
      month,
      monthLabel: MONTH_LABELS[month] ?? month,
    };
    for (const cat of data.filter((d) => d.month === month)) {
      entry[cat.category_name] = cat.published_count;
    }
    return entry;
  });

  return (
    <div className="scard">
      <div className="scard-head">
        <div className="scard-head-left">
          <span className="tf tf-16">🔄</span>
          <span className="scard-head-title">카테고리 비교</span>
        </div>
      </div>
      <div className="scard-body space-y-8">
        {/* 레이더 차트 */}
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
              <PolarGrid stroke="var(--g200)" />
              <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: "var(--g600)" }} />
              <Tooltip content={<CustomRadarTooltip />} />
              <Legend />
              {categoryNames.map((name) => {
                const catId = categoryIdMap[name] ?? "";
                const color = CATEGORY_COLORS[catId] ?? "var(--g500)";
                return (
                  <Radar
                    key={name}
                    name={name}
                    dataKey={name}
                    stroke={color}
                    fill={color}
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                );
              })}
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* 월별 발행 건수 바 차트 */}
        <div>
          <h4 className="mb-3 t-sm" style={{ fontWeight: 600, color: "var(--g500)" }}>
            월별 발행 건수
          </h4>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--g150)" />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: "var(--g500)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--g500)" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "var(--r-md)",
                    border: "1px solid var(--g150)",
                    boxShadow: "var(--sh-md)",
                    fontSize: 13,
                  }}
                />
                <Legend />
                {categoryNames.map((name) => {
                  const catId = categoryIdMap[name] ?? "";
                  const color = CATEGORY_COLORS[catId] ?? "var(--g500)";
                  return (
                    <Bar
                      key={name}
                      dataKey={name}
                      stackId="pub"
                      fill={color}
                      name={name}
                    />
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
