"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { AiDraftDialog, type AiDraftInitialValues } from "@/components/contents/ai-draft-dialog";
import type { Recommendation } from "@/lib/recommendation-engine";
import type { Category, LLMConfig } from "@/lib/types/database";
import { Sparkles, AlertTriangle, ExternalLink, Pin } from "lucide-react";

interface WeeklyRecommendationProps {
  recommendations: Recommendation[];
  categories: Category[];
  llmConfigs: LLMConfig[];
}

const PRIORITY_STYLES = {
  URGENT: {
    badge: "bg-red-100 text-red-700",
    label: "긴급",
    icon: AlertTriangle,
  },
  PRIMARY: {
    badge: "bg-blue-100 text-blue-700",
    label: "1순위",
    icon: Pin,
  },
  SECONDARY: {
    badge: "bg-gray-100 text-gray-600",
    label: "2순위",
    icon: Pin,
  },
};

export function WeeklyRecommendation({
  recommendations,
  categories,
  llmConfigs,
}: WeeklyRecommendationProps) {
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftInitial, setDraftInitial] = useState<AiDraftInitialValues | undefined>();

  function handleCreateDraft(rec: Recommendation) {
    setDraftInitial({
      topic: rec.title,
      categoryId: rec.categoryId,
      secondaryCategory: rec.subCategoryId,
      keyword: rec.keywords?.[0],
    });
    setDraftOpen(true);
  }

  if (recommendations.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Pin className="h-4 w-4" />
            이번 주 추천
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<Sparkles className="h-8 w-8 text-muted-foreground" />}
            title="추천 주제를 계산 중입니다..."
            description="카테고리 균형과 키워드 커버리지를 분석하여 최적의 주제를 추천합니다."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Pin className="h-4 w-4" />
            이번 주 추천
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {recommendations.map((rec, idx) => {
            const style = PRIORITY_STYLES[rec.priority];
            const Icon = style.icon;

            return (
              <div
                key={idx}
                className="rounded-lg border p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}
                    >
                      <Icon className="h-3 w-3" />
                      {style.label}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {rec.category}
                    </span>
                  </div>
                </div>

                <p className="text-sm font-medium">{rec.title}</p>
                <p className="text-xs text-muted-foreground">{rec.reason}</p>

                {rec.newsUrl && (
                  <a
                    href={rec.newsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    뉴스 원문 보기
                  </a>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCreateDraft(rec)}
                  className="mt-1"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  이 주제로 초안 생성
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <AiDraftDialog
        key={draftInitial?.topic ?? "default"}
        open={draftOpen}
        onOpenChange={setDraftOpen}
        categories={categories}
        llmConfigs={llmConfigs}
        initialValues={draftInitial}
      />
    </>
  );
}
