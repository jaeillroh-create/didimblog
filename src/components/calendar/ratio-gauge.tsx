"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScheduleItem } from "./monthly-calendar";

const CATEGORY_CONFIG = [
  { id: "CAT-A", name: "현장 수첩", color: "#D4740A", target: 2 },
  { id: "CAT-B", name: "IP 라운지", color: "#1B3A5C", target: 1 },
  { id: "CAT-C", name: "디딤 다이어리", color: "#6B7280", target: 1 },
];

interface RatioGaugeProps {
  schedules: ScheduleItem[];
}

export function RatioGauge({ schedules }: RatioGaugeProps) {
  const total = schedules.length;

  const counts = CATEGORY_CONFIG.map((cat) => ({
    ...cat,
    count: schedules.filter((s) => s.categoryId === cat.id).length,
  }));

  // GCD 계산으로 비율 단순화
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const countValues = counts.map((c) => c.count);
  const commonDivisor = countValues.reduce((acc, val) => gcd(acc, val), countValues[0] || 1);
  const ratioValues = countValues.map((v) => (commonDivisor > 0 ? v / commonDivisor : 0));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">발행 비율</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 스택형 수평 바 */}
        <div className="flex h-8 w-full overflow-hidden rounded-full">
          {counts.map((cat) => {
            const pct = total > 0 ? (cat.count / total) * 100 : 0;
            if (pct === 0) return null;
            return (
              <div
                key={cat.id}
                className="flex items-center justify-center text-xs font-medium text-white transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: cat.color,
                }}
                title={`${cat.name}: ${cat.count}건 (${Math.round(pct)}%)`}
              >
                {pct >= 10 && `${cat.count}건`}
              </div>
            );
          })}
        </div>

        {/* 범례 */}
        <div className="flex items-center justify-center gap-4">
          {counts.map((cat) => (
            <div key={cat.id} className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ backgroundColor: cat.color }}
              />
              <span className="text-sm text-muted-foreground">
                {cat.name} ({cat.count})
              </span>
            </div>
          ))}
        </div>

        {/* 비율 텍스트 */}
        <p className="text-center text-sm text-muted-foreground">
          현재{" "}
          <span className="font-semibold text-foreground">
            {ratioValues.join(":")}
          </span>
          {" / "}
          목표{" "}
          <span className="font-semibold text-foreground">2:1:1</span>
        </p>
      </CardContent>
    </Card>
  );
}
