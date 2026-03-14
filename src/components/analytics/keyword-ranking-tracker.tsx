"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { saveKeywordRanking } from "@/actions/keywords";
import type { KeywordPool, KeywordRanking } from "@/lib/types/database";
import { Search, TrendingUp, TrendingDown, Minus, Save } from "lucide-react";
import { toast } from "sonner";

interface KeywordRankingTrackerProps {
  keywords: KeywordPool[];
  rankings: KeywordRanking[];
}

export function KeywordRankingTracker({
  keywords,
  rankings,
}: KeywordRankingTrackerProps) {
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // 현재 월 (1일 기준)
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-01`;

  function getRank(keywordId: string, month: string): number | null {
    const r = rankings.find(
      (r) => r.keyword_id === keywordId && r.month === month
    );
    return r?.rank ?? null;
  }

  function handleSaveRank(keywordId: string) {
    startTransition(async () => {
      const rank = editValue ? parseInt(editValue) : null;
      const result = await saveKeywordRanking(keywordId, currentMonth, rank);
      if (result.success) {
        toast.success("순위가 저장되었습니다.");
        setEditingId(null);
      } else {
        toast.error(result.error ?? "저장에 실패했습니다.");
      }
    });
  }

  if (keywords.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            키워드 순위 추적
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<Search className="h-8 w-8 text-muted-foreground" />}
            title="추적할 키워드가 없습니다"
            description="추적할 키워드를 추가하세요. 매월 네이버에서 검색 순위를 확인하고 여기에 기록하면 추이를 볼 수 있습니다."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4" />
          키워드 순위 추적
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium">키워드</th>
                <th className="pb-2 font-medium text-center w-24">이번 달</th>
                <th className="pb-2 font-medium text-center w-24">지난 달</th>
                <th className="pb-2 font-medium text-center w-20">변동</th>
                <th className="pb-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {keywords.map((kw) => {
                const currentRank = getRank(kw.id, currentMonth);
                const lastRank = getRank(kw.id, lastMonthStr);
                const isEditing = editingId === kw.id;

                let changeElement = (
                  <span className="text-muted-foreground">
                    <Minus className="h-3 w-3 inline" />
                  </span>
                );

                if (currentRank !== null && lastRank !== null) {
                  const diff = lastRank - currentRank; // positive = improvement
                  if (diff > 0) {
                    changeElement = (
                      <span className="text-green-600 font-medium inline-flex items-center gap-0.5">
                        <TrendingUp className="h-3 w-3" />
                        {diff}
                      </span>
                    );
                  } else if (diff < 0) {
                    changeElement = (
                      <span className="text-red-500 font-medium inline-flex items-center gap-0.5">
                        <TrendingDown className="h-3 w-3" />
                        {Math.abs(diff)}
                      </span>
                    );
                  }
                } else if (currentRank !== null && lastRank === null) {
                  changeElement = (
                    <span className="text-blue-600 text-xs font-medium">NEW</span>
                  );
                }

                return (
                  <tr key={kw.id} className="border-b last:border-0">
                    <td className="py-2.5">
                      <span className="font-medium">{kw.keyword}</span>
                    </td>
                    <td className="py-2.5 text-center">
                      {isEditing ? (
                        <Input
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="h-7 w-16 text-center mx-auto"
                          placeholder="-"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveRank(kw.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setEditingId(kw.id);
                            setEditValue(currentRank?.toString() ?? "");
                          }}
                          className="hover:bg-muted/50 rounded px-2 py-0.5 transition-colors"
                        >
                          {currentRank !== null ? `${currentRank}위` : "-"}
                        </button>
                      )}
                    </td>
                    <td className="py-2.5 text-center text-muted-foreground">
                      {lastRank !== null ? `${lastRank}위` : "-"}
                    </td>
                    <td className="py-2.5 text-center">{changeElement}</td>
                    <td className="py-2.5 text-center">
                      {isEditing && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSaveRank(kw.id)}
                          disabled={isPending}
                          className="h-7 w-7 p-0"
                        >
                          <Save className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
