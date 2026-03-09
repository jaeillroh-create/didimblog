"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="w-10 pb-3 pr-2 text-center">#</th>
            <th className="pb-3 pr-4">제목</th>
            <th className="pb-3 pr-4">카테고리</th>
            <th className="pb-3 pr-4 text-center">품질 점수</th>
            <th className="pb-3 pr-4 text-right">조회수</th>
            <th className="pb-3 text-right">체류시간</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50">
              <td className="py-3 pr-2 text-center font-medium text-muted-foreground">
                {startRank + idx}
              </td>
              <td className="py-3 pr-4">
                <span className="font-medium" title={item.title}>
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
              <td className="py-3 pr-4 text-right tabular-nums">
                {item.views.toLocaleString()}
              </td>
              <td className="py-3 text-right tabular-nums">
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
    <Card>
      <CardHeader>
        <CardTitle>품질 점수 랭킹</CardTitle>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
