"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/common/empty-state";
import { AiDraftDialog, type AiDraftInitialValues } from "@/components/contents/ai-draft-dialog";
import {
  getMultiSourceRecommendations,
  acceptRecommendation,
  rejectRecommendation,
} from "@/actions/recommendations";
import type { Recommendation } from "@/lib/recommendation-engine";
import type { Category, LLMConfig } from "@/lib/types/database";
import {
  Sparkles,
  ExternalLink,
  Pin,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  Key,
  Newspaper,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";

interface WeeklyRecommendationProps {
  recommendations: Recommendation[];
  categories: Category[];
  llmConfigs: LLMConfig[];
}

const SOURCE_META: Record<
  string,
  { label: string; icon: typeof Key; color: string; bg: string }
> = {
  keyword_pool: {
    label: "키워드",
    icon: Key,
    color: "#d97706",
    bg: "#fef3c7",
  },
  news_api: {
    label: "뉴스",
    icon: Newspaper,
    color: "#dc2626",
    bg: "#fee2e2",
  },
  schedule: {
    label: "스케줄",
    icon: Calendar,
    color: "#2563eb",
    bg: "#dbeafe",
  },
  manual: {
    label: "수동",
    icon: Pin,
    color: "#6b7280",
    bg: "#f3f4f6",
  },
};

const REJECT_PRESETS = [
  "주제가 디딤 서비스와 관련 없음",
  "이미 다룬 주제",
  "시의성 없음",
  "기타 (아래에 직접 입력)",
];

export function WeeklyRecommendation({
  recommendations: initialRecommendations,
  categories,
  llmConfigs,
}: WeeklyRecommendationProps) {
  const [recommendations, setRecommendations] = useState(initialRecommendations);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftInitial, setDraftInitial] = useState<AiDraftInitialValues | undefined>();
  const [isRefreshing, startRefresh] = useTransition();
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // 처리된 카드 id 목록 (accepted / rejected) — 재표시 방지
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());

  // 부적합 다이얼로그 state
  const [rejectingRec, setRejectingRec] = useState<Recommendation | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [rejectCustom, setRejectCustom] = useState<string>("");
  const [isRejecting, startReject] = useTransition();

  function handleCreateDraft(rec: Recommendation) {
    // accept DB 업데이트 (존재하면)
    if (rec.recId) {
      acceptRecommendation(rec.recId).catch((err) =>
        console.warn("[acceptRecommendation] 실패:", err)
      );
      setProcessedIds((prev) => new Set(prev).add(rec.recId!));
    }
    setDraftInitial({
      topic: rec.title,
      categoryId: rec.categoryId,
      secondaryCategory: rec.subCategoryId,
      keyword: rec.keywords?.[0],
      additionalContext: rec.newsUrl
        ? `참고 자료(뉴스 원문): ${rec.newsUrl}`
        : undefined,
    });
    setDraftOpen(true);
  }

  function openRejectDialog(rec: Recommendation) {
    setRejectingRec(rec);
    setRejectReason(REJECT_PRESETS[0]);
    setRejectCustom("");
  }

  function handleConfirmReject() {
    if (!rejectingRec?.recId) {
      // DB 저장 실패한 추천 — 클라이언트에서만 처리
      if (rejectingRec) {
        const idKey = rejectingRec.title;
        setProcessedIds((prev) => new Set(prev).add(idKey));
      }
      setRejectingRec(null);
      return;
    }

    startReject(async () => {
      const finalReason =
        rejectReason === REJECT_PRESETS[REJECT_PRESETS.length - 1]
          ? rejectCustom.trim() || "기타"
          : rejectReason;
      const res = await rejectRecommendation({
        recId: rejectingRec.recId!,
        reason: finalReason,
      });
      if (!res.success) {
        toast.error(`부적합 처리 실패: ${res.error ?? ""}`);
        return;
      }
      setProcessedIds((prev) => new Set(prev).add(rejectingRec.recId!));
      toast.success("부적합 처리 완료 — 다음 새로고침에 반영됩니다");
      setRejectingRec(null);
    });
  }

  function handleRefresh() {
    setRefreshError(null);
    startRefresh(async () => {
      try {
        // 현재 표시 중인 카드들 + 이미 처리된 카드들을 exclude 로 전달
        const excludeIds = [
          ...recommendations.map((r) => r.recId).filter((id): id is string => !!id),
          ...Array.from(processedIds),
        ];
        const result = await getMultiSourceRecommendations(excludeIds);
        setRecommendations(result.cards);
        setProcessedIds(new Set());
        if (result.cards.length === 0) {
          toast.info("추천 가능한 주제가 없습니다. 키워드 풀 또는 뉴스 DB를 확인해주세요.");
        } else {
          toast.success(`${result.cards.length}개의 새로운 추천이 생성되었습니다.`);
        }
      } catch (err) {
        console.error("[추천 새로고침] 실패:", err);
        setRefreshError("추천 새로고침에 실패했습니다. 잠시 후 다시 시도해주세요.");
        toast.error("추천 새로고침에 실패했습니다.");
      }
    });
  }

  // 표시할 카드 = 전체 추천 - 이미 처리된 것
  const visibleCards = recommendations.filter((r) => {
    const idKey = r.recId ?? r.title;
    return !processedIds.has(idKey);
  });

  // ── 빈 상태 ──
  if (visibleCards.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Pin className="h-4 w-4" />
              이번 주 추천
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-7 px-2 text-muted-foreground"
            >
              {isRefreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span className="ml-1 text-xs">새로고침</span>
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<Sparkles className="h-8 w-8 text-muted-foreground" />}
            title={
              recommendations.length === 0
                ? "추천 주제를 계산 중입니다..."
                : "모든 추천이 처리되었습니다"
            }
            description={
              recommendations.length === 0
                ? "키워드 풀 / 최신 뉴스 / 12주 스케줄에서 추천을 생성합니다."
                : "새로고침으로 새로운 추천을 받아보세요."
            }
          />
          {refreshError && (
            <p className="text-xs text-red-500 text-center mt-2">{refreshError}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Pin className="h-4 w-4" />
              이번 주 추천 ({visibleCards.length}건)
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-7 px-2 text-muted-foreground"
            >
              {isRefreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span className="ml-1 text-xs">새로고침</span>
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {refreshError && (
            <p className="text-xs text-red-500 bg-red-50 rounded p-2">{refreshError}</p>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {visibleCards.map((rec) => {
              const sourceKey = rec.source ?? "manual";
              const sourceMeta = SOURCE_META[sourceKey] ?? SOURCE_META.manual;
              const SourceIcon = sourceMeta.icon;
              const idKey = rec.recId ?? rec.title;

              return (
                <div
                  key={idKey}
                  className="rounded-lg border p-3 space-y-2 flex flex-col bg-background hover:shadow-sm transition-shadow"
                >
                  {/* 헤더: 소스 배지 + 카테고리 + 우선도 */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{ backgroundColor: sourceMeta.bg, color: sourceMeta.color }}
                    >
                      <SourceIcon className="h-3 w-3" />
                      {sourceMeta.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {rec.category}
                      {rec.subCategory && ` · ${rec.subCategory}`}
                    </span>
                    {rec.priority === "URGENT" && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                        긴급
                      </span>
                    )}
                  </div>

                  {/* 제목 */}
                  <p className="text-sm font-semibold leading-snug line-clamp-2">
                    {rec.title}
                  </p>

                  {/* 추천 이유 */}
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 flex-1">
                    {rec.reason}
                  </p>

                  {/* 키워드 목록 */}
                  {rec.keywords && rec.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {rec.keywords.slice(0, 3).map((kw, i) => (
                        <span
                          key={i}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                        >
                          #{kw}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 뉴스 원문 링크 (뉴스 추천 전용) */}
                  {rec.newsUrl && (
                    <a
                      href={rec.newsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      뉴스 원문 보기
                    </a>
                  )}

                  {/* 액션 버튼 */}
                  <div className="flex gap-1.5 pt-1">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleCreateDraft(rec)}
                      className="flex-1 h-8 text-xs"
                      style={{ backgroundColor: "var(--brand-accent)" }}
                    >
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      적합 · 초안 생성
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openRejectDialog(rec)}
                      className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <XCircle className="mr-1 h-3 w-3" />
                      부적합
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 부적합 사유 다이얼로그 */}
      <Dialog open={!!rejectingRec} onOpenChange={(open) => !open && setRejectingRec(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>부적합 사유 (선택)</DialogTitle>
            <DialogDescription>
              사유를 선택하면 해당 주제의 키워드가 향후 추천에서 필터링됩니다.
              3회 이상 거부된 키워드는 블랙리스트에 등록됩니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              주제: <span className="font-medium text-foreground">{rejectingRec?.title}</span>
            </p>

            <div className="space-y-2">
              {REJECT_PRESETS.map((preset) => (
                <label
                  key={preset}
                  className="flex items-center gap-2 cursor-pointer text-sm"
                >
                  <input
                    type="radio"
                    name="reject-reason"
                    value={preset}
                    checked={rejectReason === preset}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="h-4 w-4"
                  />
                  {preset}
                </label>
              ))}
            </div>

            {rejectReason === REJECT_PRESETS[REJECT_PRESETS.length - 1] && (
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                rows={2}
                placeholder="자유 입력..."
                value={rejectCustom}
                onChange={(e) => setRejectCustom(e.target.value)}
              />
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingRec(null)} disabled={isRejecting}>
              취소
            </Button>
            <Button
              variant="default"
              onClick={handleConfirmReject}
              disabled={isRejecting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isRejecting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              부적합 처리
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
