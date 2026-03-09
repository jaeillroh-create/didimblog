"use client";

import { useState, useTransition } from "react";
import { type SeoSettingItem, updateSeoSettings } from "@/actions/settings";
import { type SeoGrade } from "@/lib/constants/seo-items";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Search, RotateCcw } from "lucide-react";

const GRADE_CONFIG: Record<
  SeoGrade,
  { label: string; color: string; rule: string }
> = {
  required: {
    label: "필수",
    color: "bg-red-100 text-red-700 border-red-200",
    rule: "모두 통과해야 발행 가능",
  },
  recommended: {
    label: "권장",
    color: "bg-orange-100 text-orange-700 border-orange-200",
    rule: "2개까지 미충족 허용",
  },
  optional: {
    label: "선택",
    color: "bg-gray-100 text-gray-600 border-gray-200",
    rule: "미충족 허용",
  },
};

const GRADE_ORDER: SeoGrade[] = ["required", "recommended", "optional"];

interface SeoCriteriaEditorProps {
  initialItems: SeoSettingItem[];
}

export function SeoCriteriaEditor({ initialItems }: SeoCriteriaEditorProps) {
  const [items, setItems] = useState<SeoSettingItem[]>(initialItems);
  const [isPending, startTransition] = useTransition();

  function toggleItem(id: number) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, enabled: !item.enabled } : item
      )
    );
  }

  function handleSave() {
    startTransition(async () => {
      const { error } = await updateSeoSettings(
        items.map((item) => ({ id: item.id, enabled: item.enabled }))
      );
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("SEO 설정이 저장되었습니다.");
    });
  }

  function handleReset() {
    setItems((prev) => prev.map((item) => ({ ...item, enabled: true })));
    toast.info("기본값으로 복원되었습니다. 저장 버튼을 눌러 적용하세요.");
  }

  const groupedItems = GRADE_ORDER.map((grade) => ({
    grade,
    config: GRADE_CONFIG[grade],
    items: items.filter((item) => item.grade === grade),
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            SEO 기준 설정
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={isPending}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              기본값 복원
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isPending}>
              저장
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {groupedItems.map(({ grade, config, items: gradeItems }) => (
          <div key={grade} className="space-y-3">
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className={`font-medium ${config.color}`}
              >
                {config.label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {config.rule}
              </span>
            </div>

            <div className="space-y-1">
              {gradeItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    id={`seo-${item.id}`}
                    checked={item.enabled}
                    onCheckedChange={() => toggleItem(item.id)}
                    disabled={isPending}
                  />
                  <Label
                    htmlFor={`seo-${item.id}`}
                    className="flex flex-1 cursor-pointer items-center gap-3"
                  >
                    <span className="font-medium text-sm min-w-[120px]">
                      {item.label}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {item.description}
                    </span>
                  </Label>
                </div>
              ))}
            </div>

            {grade !== "optional" && <Separator />}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
