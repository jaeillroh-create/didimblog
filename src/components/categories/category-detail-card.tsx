"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { Category } from "@/lib/types/database";
import {
  CATEGORY_ROLE_TYPES,
  FUNNEL_STAGES,
  CATEGORY_STATUSES,
} from "@/lib/constants/categories";
import { updateCategory } from "@/actions/categories";
import { Save } from "lucide-react";

interface CategoryDetailCardProps {
  category: Category;
  onUpdated?: () => void;
}

const CTA_TYPES = {
  direct: "직접 CTA",
  neighbor: "이웃 CTA",
  none: "없음",
} as const;

const PROLOGUE_LABELS = {
  area1: "영역 1",
  area2: "영역 2",
  area3: "영역 3",
} as const;

export function CategoryDetailCard({
  category,
  onUpdated,
}: CategoryDetailCardProps) {
  const [monthlyTarget, setMonthlyTarget] = useState(
    category.monthly_target.toString()
  );
  const [status, setStatus] = useState(category.status);
  const [ctaType, setCtaType] = useState(category.cta_type);
  const [saving, setSaving] = useState(false);

  const statusInfo = CATEGORY_STATUSES[category.status];

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await updateCategory(category.id, {
        monthly_target: parseInt(monthlyTarget, 10) || 0,
        status,
        cta_type: ctaType,
      });
      if (result.success) {
        onUpdated?.();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{category.name}</CardTitle>
          <Badge
            variant="outline"
            className="border-transparent font-medium"
            style={{
              backgroundColor: `${statusInfo.color}20`,
              color: statusInfo.color,
            }}
          >
            {statusInfo.label}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {category.tier === "primary" ? "1차 카테고리" : "2차 카테고리"} /{" "}
          {category.id}
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* 기본 정보 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              역할 유형
            </label>
            <p className="text-sm mt-0.5">
              {CATEGORY_ROLE_TYPES[category.role_type]}
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              퍼널 단계
            </label>
            <p className="text-sm mt-0.5">
              {FUNNEL_STAGES[category.funnel_stage]}
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              CTA 유형
            </label>
            <p className="text-sm mt-0.5">{CTA_TYPES[category.cta_type]}</p>
          </div>
          {category.prologue_position && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                프롤로그 위치
              </label>
              <p className="text-sm mt-0.5">
                {PROLOGUE_LABELS[category.prologue_position]}
              </p>
            </div>
          )}
        </div>

        <Separator />

        {/* 연결 서비스 */}
        {category.connected_services.length > 0 && (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              연결 서비스
            </label>
            <div className="flex flex-wrap gap-1.5">
              {category.connected_services.map((service) => (
                <Badge key={service} variant="secondary" className="text-xs">
                  {service}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* 타겟 키워드 */}
        {category.target_keywords.length > 0 && (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              타겟 키워드
            </label>
            <div className="flex flex-wrap gap-1.5">
              {category.target_keywords.map((keyword) => (
                <Badge key={keyword} variant="outline" className="text-xs">
                  {keyword}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <Separator />

        {/* 수정 가능 필드 */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">설정 변경</h4>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                월간 목표 (건)
              </label>
              <Input
                type="number"
                min={0}
                value={monthlyTarget}
                onChange={(e) => setMonthlyTarget(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                상태
              </label>
              <Select
                value={status}
                onValueChange={(v) =>
                  setStatus(v as Category["status"])
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_STATUSES).map(([key, info]) => (
                    <SelectItem key={key} value={key}>
                      {info.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                CTA 유형
              </label>
              <Select
                value={ctaType}
                onValueChange={(v) =>
                  setCtaType(v as Category["cta_type"])
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CTA_TYPES).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="w-full"
          >
            <Save className="h-4 w-4 mr-1.5" />
            {saving ? "저장 중..." : "변경사항 저장"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
