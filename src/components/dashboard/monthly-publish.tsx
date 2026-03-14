import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MonthlyPublishProgress } from "@/actions/recommendations";
import { BarChart3 } from "lucide-react";

interface MonthlyPublishProps {
  progress: MonthlyPublishProgress[];
}

const CATEGORY_COLORS: Record<string, string> = {
  "CAT-A": "bg-orange-500",
  "CAT-B": "bg-blue-800",
  "CAT-C": "bg-gray-500",
};

export function MonthlyPublish({ progress }: MonthlyPublishProps) {
  const totalPublished = progress.reduce((sum, p) => sum + p.published, 0);
  const totalTarget = progress.reduce((sum, p) => sum + p.target, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          월간 발행 현황
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {progress.map((item) => {
          const pct = item.target > 0
            ? Math.min(100, Math.round((item.published / item.target) * 100))
            : 0;
          const barColor = CATEGORY_COLORS[item.categoryId] ?? "bg-gray-400";

          return (
            <div key={item.categoryId} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{item.categoryName}</span>
                <span className="text-muted-foreground">
                  {item.published}/{item.target}편
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}

        <div className="pt-2 border-t">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">총 발행</span>
            <span className="font-bold">
              {totalPublished}/{totalTarget}편
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
