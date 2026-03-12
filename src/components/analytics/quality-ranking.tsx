"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QualityBadge } from "@/components/common/quality-badge";
import { CategoryBadge } from "@/components/common/category-badge";
import type { ContentRanking } from "@/actions/analytics";

interface QualityRankingProps {
  data: ContentRanking[];
}

function truncateTitle(title: string, maxLength: number = 28): string {
  if (title.length <= maxLength) return title;
  return title.slice(0, maxLength) + "...";
}

function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (min === 0) return `${sec}초`;
  return `${min}분 ${sec}초`;
}

function RankingTable({
  items,
  startRank,
}: {
  items: ContentRanking[];
  startRank: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full t-sm">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--g150)" }}>
            <th className="w-10 pb-3 pr-2 text-center t-xs" style={{ fontWeight: 600, color: "var(--g500)" }}>#</th>
            <th className="pb-3 pr-4 text-left t-xs" style={{ fontWeight: 600, color: "var(--g500)" }}>제목</th>
            <th className="pb-3 pr-4 text-left t-xs" style={{ fontWeight: 600, color: "var(--g500)" }}>카테고리</th>
            <th className="pb-3 pr-4 text-center t-xs" style={{ fontWeight: 600, color: "var(--g500)" }}>품질 점수</th>
            <th className="pb-3 pr-4 text-right t-xs" style={{ fontWeight: 600, color: "var(--g500)" }}>조회수</th>
            <th className="pb-3 text-right t-xs" style={{ fontWeight: 600, color: "var(--g500)" }}>체류시간</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr
              key={item.id}
              className="hover:bg-[var(--g50)] transition-colors"
              style={{ borderBottom: idx < items.length - 1 ? "1px solid var(--g100)" : "none" }}
            >
              <td className="py-3 pr-2 text-center font-num" style={{ fontWeight: 600, color: "var(--g400)" }}>
                {startRank + idx}
              </td>
              <td className="py-3 pr-4">
                <span className="t-sm" style={{ fontWeight: 600, color: "var(--g900)" }} title={item.title}>
                  {truncateTitle(item.title)}
                </span>
              </td>
              <td className="py-3 pr-4">
                <CategoryBadge
                  categoryId={item.id}
                  categoryName={item.category_name}
                />
              </td>
              <td className="py-3 pr-4 text-center">
                <QualityBadge score={item.quality_score} />
              </td>
              <td className="py-3 pr-4 text-right font-num" style={{ color: "var(--g700)" }}>
                {item.views.toLocaleString()}
              </td>
              <td className="py-3 text-right font-num" style={{ color: "var(--g700)" }}>
                {formatDuration(item.avg_duration_sec)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function QualityRanking({ data }: QualityRankingProps) {
  const sorted = [...data].sort((a, b) => b.quality_score - a.quality_score);
  const top10 = sorted.slice(0, 10);
  const bottom5 = sorted.slice(-5).reverse();

  return (
    <div className="scard">
      <div className="scard-head">
        <div className="scard-head-left">
          <span className="tf tf-16">🏆</span>
          <span className="scard-head-title">품질 점수 랭킹</span>
        </div>
      </div>
      <div className="scard-body">
        <Tabs defaultValue="top">
          <TabsList>
            <TabsTrigger value="top">상위 10개</TabsTrigger>
            <TabsTrigger value="bottom">하위 5개</TabsTrigger>
          </TabsList>
          <TabsContent value="top">
            <RankingTable items={top10} startRank={1} />
          </TabsContent>
          <TabsContent value="bottom">
            <RankingTable
              items={bottom5}
              startRank={sorted.length - 4}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
