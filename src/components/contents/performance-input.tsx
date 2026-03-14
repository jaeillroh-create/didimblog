"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveContentPerformance } from "@/actions/keywords";
import type { Content } from "@/lib/types/database";
import { BarChart3, Save } from "lucide-react";
import { toast } from "sonner";

interface PerformanceInputProps {
  content: Content;
}

export function PerformanceInput({ content }: PerformanceInputProps) {
  const [isPending, startTransition] = useTransition();
  const [views1w, setViews1w] = useState(
    content.views_1w?.toString() ?? ""
  );
  const [views1m, setViews1m] = useState(
    content.views_1m?.toString() ?? ""
  );
  const [avgDuration, setAvgDuration] = useState(
    content.avg_duration_sec?.toString() ?? ""
  );
  const [searchRank, setSearchRank] = useState(
    content.search_rank?.toString() ?? ""
  );
  const [ctaClicks, setCtaClicks] = useState(
    content.cta_clicks?.toString() ?? ""
  );

  function handleSave() {
    startTransition(async () => {
      const data = {
        views_1w: views1w ? parseInt(views1w) : null,
        views_1m: views1m ? parseInt(views1m) : null,
        avg_duration_sec: avgDuration ? parseInt(avgDuration) : null,
        search_rank: searchRank ? parseInt(searchRank) : null,
        cta_clicks: ctaClicks ? parseInt(ctaClicks) : null,
      };

      const result = await saveContentPerformance(content.id, data);
      if (result.success) {
        toast.success("성과 데이터가 저장되었습니다.");
      } else {
        toast.error(result.error ?? "저장에 실패했습니다.");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          성과 데이터
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="views_1w" className="text-xs">
              주간 조회수
            </Label>
            <Input
              id="views_1w"
              type="number"
              value={views1w}
              onChange={(e) => setViews1w(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label htmlFor="views_1m" className="text-xs">
              월간 조회수
            </Label>
            <Input
              id="views_1m"
              type="number"
              value={views1m}
              onChange={(e) => setViews1m(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="avg_duration" className="text-xs">
              평균 체류시간 (초)
            </Label>
            <Input
              id="avg_duration"
              type="number"
              value={avgDuration}
              onChange={(e) => setAvgDuration(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label htmlFor="search_rank" className="text-xs">
              검색 순위
            </Label>
            <Input
              id="search_rank"
              type="number"
              value={searchRank}
              onChange={(e) => setSearchRank(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="cta_clicks" className="text-xs">
            CTA 클릭수
          </Label>
          <Input
            id="cta_clicks"
            type="number"
            value={ctaClicks}
            onChange={(e) => setCtaClicks(e.target.value)}
            placeholder="0"
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={isPending}
          size="sm"
          className="w-full"
        >
          <Save className="h-4 w-4 mr-1" />
          {isPending ? "저장 중..." : "성과 저장"}
        </Button>
      </CardContent>
    </Card>
  );
}
