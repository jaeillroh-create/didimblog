"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/common/empty-state";
import { AiDraftDialog, type AiDraftInitialValues } from "@/components/contents/ai-draft-dialog";
import { refreshWeeklyRecommendations } from "@/actions/recommendations";
import type { Recommendation } from "@/lib/recommendation-engine";
import type { Category, LLMConfig } from "@/lib/types/database";
import {
  Sparkles,
  AlertTriangle,
  ExternalLink,
  Pin,
  ClipboardList,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Search,
  Tag,
  Users,
  Lightbulb,
  Link2,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface WeeklyRecommendationProps {
  recommendations: Recommendation[];
  categories: Category[];
  llmConfigs: LLMConfig[];
}

type VerificationState = Record<
  number,
  { status: "pending" | "verified" | "rejected"; note: string }
>;

const PRIORITY_STYLES = {
  URGENT: {
    badge: "bg-red-600 text-white animate-pulse",
    label: "긴급 발행",
    icon: AlertTriangle,
    cardClass: "border-red-300 bg-red-50/50 ring-1 ring-red-200",
  },
  PRIMARY: {
    badge: "bg-blue-100 text-blue-700",
    label: "1순위",
    icon: Pin,
    cardClass: "",
  },
  SECONDARY: {
    badge: "bg-gray-100 text-gray-600",
    label: "2순위",
    icon: Pin,
    cardClass: "",
  },
};

export function WeeklyRecommendation({
  recommendations: initialRecommendations,
  categories,
  llmConfigs,
}: WeeklyRecommendationProps) {
  const [recommendations, setRecommendations] = useState(initialRecommendations);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftInitial, setDraftInitial] = useState<AiDraftInitialValues | undefined>();
  const [verification, setVerification] = useState<VerificationState>({});
  const [isRefreshing, startRefresh] = useTransition();
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // 모든 추천이 부적합인지 확인
  const allRejected =
    recommendations.length > 0 &&
    recommendations.every((_, idx) => verification[idx]?.status === "rejected");

  function handleCreateDraft(rec: Recommendation) {
    setDraftInitial({
      topic: rec.title,
      categoryId: rec.categoryId,
      secondaryCategory: rec.subCategoryId,
      keyword: rec.keywords?.[0],
    });
    setDraftOpen(true);
  }

  function handleVerify(idx: number, status: "verified" | "rejected") {
    setVerification((prev) => ({
      ...prev,
      [idx]: { ...prev[idx], status, note: prev[idx]?.note ?? "" },
    }));
    if (status === "rejected") {
      console.log(
        `[추천 재검증] 부적합 판단 — 추천 #${idx}`,
        recommendations[idx]?.title,
        verification[idx]?.note
      );
    }
  }

  function handleNoteChange(idx: number, note: string) {
    setVerification((prev) => ({
      ...prev,
      [idx]: { ...prev[idx], status: prev[idx]?.status ?? "pending", note },
    }));
  }

  function getVerificationStatus(idx: number): "pending" | "verified" | "rejected" {
    return verification[idx]?.status ?? "pending";
  }

  function handleRefresh() {
    setRefreshError(null);
    startRefresh(async () => {
      try {
        const newRecs = await refreshWeeklyRecommendations();
        setRecommendations(newRecs);
        setVerification({}); // 재검증 상태 초기화
        if (newRecs.length === 0) {
          toast.info("추천 가능한 주제가 없습니다. 키워드 풀을 확인해주세요.");
        } else {
          toast.success(`추천 ${newRecs.length}건이 새로 생성되었습니다.`);
        }
      } catch (err) {
        console.error("[추천 새로고침] 실패:", err);
        setRefreshError("추천 새로고침에 실패했습니다. 잠시 후 다시 시도해주세요.");
        toast.error("추천 새로고침에 실패했습니다.");
      }
    });
  }

  // ── 빈 상태 / 전부 부적합 ──
  if (recommendations.length === 0 || allRejected) {
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
        <CardContent className="space-y-3">
          {/* 전부 부적합인 경우 접힌 카드들 표시 */}
          {allRejected && recommendations.map((rec, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-2 flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <span className="text-xs text-muted-foreground line-through truncate">
                  {rec.title}
                </span>
              </div>
              <span className="text-[10px] text-red-400 shrink-0">부적합</span>
            </div>
          ))}

          <EmptyState
            icon={
              allRejected
                ? <XCircle className="h-8 w-8 text-muted-foreground" />
                : <Sparkles className="h-8 w-8 text-muted-foreground" />
            }
            title={
              allRejected
                ? "모든 추천이 부적합 처리되었습니다"
                : "추천 주제를 계산 중입니다..."
            }
            description={
              allRejected
                ? "새로고침 버튼을 눌러 새로운 추천을 받아보세요."
                : "카테고리 균형과 키워드 커버리지를 분석하여 최적의 주제를 추천합니다."
            }
          />

          {refreshError && (
            <p className="text-xs text-red-500 text-center">{refreshError}</p>
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
        <CardContent className="space-y-4">
          {refreshError && (
            <p className="text-xs text-red-500 bg-red-50 rounded p-2">{refreshError}</p>
          )}

          {recommendations.map((rec, idx) => {
            const style = PRIORITY_STYLES[rec.priority];
            const Icon = style.icon;
            const vStatus = getVerificationStatus(idx);
            const isRejected = vStatus === "rejected";
            const isVerified = vStatus === "verified";
            const isUrgent = rec.priority === "URGENT";

            // 부적합 카드: 접힌 상태로 표시 (한 줄 요약만)
            if (isRejected) {
              return (
                <div
                  key={idx}
                  className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-2 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                    <span className="text-xs text-muted-foreground line-through truncate">
                      {rec.title}
                    </span>
                  </div>
                  <span className="text-[10px] text-red-400 shrink-0">
                    부적합{verification[idx]?.note ? ` — ${verification[idx].note}` : ""}
                  </span>
                </div>
              );
            }

            // 다른 뉴스가 부적합이면 이 카드 강조
            const hasRejectedNews = recommendations.some(
              (r, i) => i !== idx && r.priority === "URGENT" && r.newsUrl && getVerificationStatus(i) === "rejected"
            );
            const boostClass = hasRejectedNews && !isUrgent ? "ring-2 ring-blue-200 bg-blue-50/30" : "";

            return (
              <div
                key={idx}
                className={`rounded-lg border p-4 space-y-3 ${style.cardClass} ${boostClass}`}
              >
                {/* 헤더: 뱃지 + 카테고리 */}
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
                  {isUrgent && (
                    <span className="text-[10px] text-muted-foreground">
                      {isVerified ? "✅ 적합" : "⏳ 미검증"}
                    </span>
                  )}
                </div>

                {/* 제목 */}
                <p className="text-sm font-medium">{rec.title}</p>

                {/* 추천 이유 상세 */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <ClipboardList className="h-3 w-3" />
                    추천 이유
                  </div>
                  <Separator className="my-1" />

                  {/* 뉴스 추천: 상세 이유 */}
                  {isUrgent && rec.matchedWatchKeywords && rec.matchedWatchKeywords.length > 0 && (
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div className="flex items-start gap-1.5">
                        <Tag className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>
                          <span className="font-medium">매칭 키워드:</span>{" "}
                          {rec.matchedWatchKeywords.join(", ")}
                        </span>
                      </div>
                      {rec.relevanceReason && (
                        <div className="flex items-start gap-1.5">
                          <Search className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>
                            <span className="font-medium">관련성:</span>{" "}
                            {rec.relevanceReason}
                          </span>
                        </div>
                      )}
                      {rec.targetAudience && (
                        <div className="flex items-start gap-1.5">
                          <Users className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>
                            <span className="font-medium">타깃 독자:</span>{" "}
                            {rec.targetAudience}
                          </span>
                        </div>
                      )}
                      {rec.suggestedAngle && (
                        <div className="flex items-start gap-1.5">
                          <Lightbulb className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>
                            <span className="font-medium">글쓰기 관점:</span>{" "}
                            {rec.suggestedAngle}
                          </span>
                        </div>
                      )}
                      {rec.affectedExistingPosts && rec.affectedExistingPosts.length > 0 && (
                        <div className="flex items-start gap-1.5">
                          <Link2 className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>
                            <span className="font-medium">관련 기존 글:</span>{" "}
                            {rec.affectedExistingPosts.map((t, i) => (
                              <span key={i}>
                                {i > 0 && ", "}
                                &ldquo;{t}&rdquo;
                              </span>
                            ))}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 비뉴스 추천: 간단 이유 */}
                  {!isUrgent && (
                    <p className="text-xs text-muted-foreground">{rec.reason}</p>
                  )}
                </div>

                {/* 재검증 영역 (뉴스 추천 전용) */}
                {isUrgent && !isVerified && (
                  <div className="space-y-2">
                    <Separator />
                    <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <Search className="h-3 w-3" />
                      재검증
                    </div>
                    <p className="text-xs text-muted-foreground">
                      이 추천이 디딤 블로그에 적합한가요?
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 hover:bg-green-50 border-green-200"
                        onClick={() => handleVerify(idx, "verified")}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        적합 — 초안 생성
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:bg-red-50 border-red-200"
                        onClick={() => handleVerify(idx, "rejected")}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" />
                        부적합 — 건너뛰기
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0" />
                      <Input
                        placeholder="메모 추가 (선택)"
                        className="h-7 text-xs"
                        value={verification[idx]?.note ?? ""}
                        onChange={(e) => handleNoteChange(idx, e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* 하단 액션 버튼 */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
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
                    variant={isVerified ? "default" : "outline"}
                    onClick={() => handleCreateDraft(rec)}
                    className={isVerified ? "bg-[var(--brand-accent)] hover:bg-[var(--brand-accent)]/90" : ""}
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    이 주제로 초안 생성
                  </Button>
                </div>
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
