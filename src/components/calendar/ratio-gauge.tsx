"use client";

import type { ScheduleItem } from "./monthly-calendar";

const CATEGORY_CONFIG = [
  { id: "CAT-A", name: "현장 수첩", color: "var(--category-field-note)", target: 2 },
  { id: "CAT-B", name: "IP 라운지", color: "var(--category-ip-lounge)", target: 1 },
  { id: "CAT-C", name: "디딤 다이어리", color: "var(--category-diary)", target: 1 },
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
    <div className="card-default">
      <div className="mb-4">
        <h3 className="t-lg" style={{ color: "var(--g900)" }}>
          <span className="tf tf-14">📈</span> 발행 비율
        </h3>
      </div>
      <div className="space-y-4">
        {/* 스택형 수평 바 — progress-track 사용 */}
        <div className="progress-track progress-track-lg" style={{ height: 32, borderRadius: "var(--r-full)" }}>
          <div className="flex h-full w-full overflow-hidden" style={{ borderRadius: "var(--r-full)" }}>
            {counts.map((cat) => {
              const pct = total > 0 ? (cat.count / total) * 100 : 0;
              if (pct === 0) return null;
              return (
                <div
                  key={cat.id}
                  className="flex items-center justify-center t-xs text-white transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: cat.color,
                    fontWeight: 600,
                  }}
                  title={`${cat.name}: ${cat.count}건 (${Math.round(pct)}%)`}
                >
                  {pct >= 10 && `${cat.count}건`}
                </div>
              );
            })}
          </div>
        </div>

        {/* 범례 */}
        <div className="flex items-center justify-center gap-4">
          {counts.map((cat) => (
            <div key={cat.id} className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3"
                style={{ backgroundColor: cat.color, borderRadius: "var(--r-xs)" }}
              />
              <span className="t-sm" style={{ color: "var(--g500)" }}>
                {cat.name} ({cat.count})
              </span>
            </div>
          ))}
        </div>

        {/* 비율 텍스트 */}
        <p className="text-center t-sm" style={{ color: "var(--g500)" }}>
          현재{" "}
          <span className="font-num" style={{ fontWeight: 700, color: "var(--g900)" }}>
            {ratioValues.join(":")}
          </span>
          {" / "}
          목표{" "}
          <span className="font-num" style={{ fontWeight: 700, color: "var(--g900)" }}>2:1:1</span>
        </p>
      </div>
    </div>
  );
}
