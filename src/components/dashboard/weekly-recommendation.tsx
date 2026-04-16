"use client";

import { useState, useTransition, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  getCategoryRecommendations,
  acceptRecommendation,
  rejectRecommendation,
  type CategoryRecommendationMap,
  type RecommendationCategoryId,
  type MonthlyPublishProgress,
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
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

interface WeeklyRecommendationProps {
  recommendationsByCategory: CategoryRecommendationMap;
  publishProgress: MonthlyPublishProgress[];
  categories: Category[];
  llmConfigs: LLMConfig[];
}

/** 소스별 뱃지 메타 */
const SOURCE_META: Record<
  string,
  { label: string; icon: typeof Key; color: string; bg: string }
> = {
  keyword_pool: { label: "키워드", icon: Key, color: "#d97706", bg: "#fef3c7" },
  news_api: { label: "뉴스", icon: Newspaper, color: "#dc2626", bg: "#fee2e2" },
  schedule: { label: "스케줄", icon: Calendar, color: "#2563eb", bg: "#dbeafe" },
  manual: { label: "수동", icon: Pin, color: "#6b7280", bg: "#f3f4f6" },
};

/** 카테고리 라벨/타겟 */
const CATEGORY_META: Record<
  RecommendationCategoryId,
  { short: string; full: string; target: number }
> = {
  "CAT-A": { short: "현장 수첩", full: "변리사의 현장 수첩", target: 2 },
  "CAT-B": { short: "IP 라운지", full: "IP 라운지", target: 1 },
  "CAT-C": { short: "디딤 다이어리", full: "디딤 다이어리", target: 1 },
};

const CATEGORY_ORDER: RecommendationCategoryId[] = ["CAT-A", "CAT-B", "CAT-C"];

const REJECT_PRESETS = [
  "주제가 디딤 서비스와 관련 없음",
  "이미 다룬 주제",
  "시의성 없음",
  "기타 (아래에 직접 입력)",
];

export function WeeklyRecommendation({
  recommendationsByCategory: initialByCategory,
  publishProgress,
  categories,
  llmConfigs,
}: WeeklyRecommendationProps) {
  const [byCategory, setByCategory] = useState<CategoryRecommendationMap>(initialByCategory);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftInitial, setDraftInitial] = useState<AiDraftInitialValues | undefined>();

  // 처리된 카드 id(혹은 title fallback) 목록 — 재표시 방지
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());

  // 카테고리별 refresh 상태
  const [refreshingCat, setRefreshingCat] = useState<RecommendationCategoryId | null>(null);
  const [, startRefresh] = useTransition();

  // 부적합 다이얼로그
  const [rejectingRec, setRejectingRec] = useState<Recommendation | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [rejectCustom, setRejectCustom] = useState<string>("");
  const [isRejecting, startReject] = useTransition();

  // 발행 현황 map 변환
  const progressMap = new Map<string, MonthlyPublishProgress>();
  for (const p of publishProgress) progressMap.set(p.categoryId, p);

  /**
   * 적합 처리 — 초안 생성 다이얼로그 오픈 + DB accept
   */
  const handleCreateDraft = useCallback((rec: Recommendation) => {
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
  }, []);

  /**
   * 부적합 다이얼로그 오픈
   */
  const openRejectDialog = useCallback((rec: Recommendation) => {
    setRejectingRec(rec);
    setRejectReason(REJECT_PRESETS[0]);
    setRejectCustom("");
  }, []);

  const handleConfirmReject = useCallback(() => {
    if (!rejectingRec) return;
    if (!rejectingRec.recId) {
      // DB 저장 실패한 추천 — 클라이언트에서만 처리
      setProcessedIds((prev) => new Set(prev).add(rejectingRec.title));
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
  }, [rejectingRec, rejectReason, rejectCustom]);

  /**
   * 특정 카테고리만 새로고침
   */
  const handleRefreshCategory = useCallback(
    (categoryId: RecommendationCategoryId) => {
      setRefreshingCat(categoryId);
      startRefresh(async () => {
        try {
          const current = byCategory[categoryId] ?? [];
          const excludeIds = [
            ...current.map((r) => r.recId).filter((id): id is string => !!id),
            ...Array.from(processedIds),
          ];
          const newCards = await getCategoryRecommendations(categoryId, excludeIds);
          setByCategory((prev) => ({ ...prev, [categoryId]: newCards }));
          // 해당 카테고리에 처리된 카드들의 id 는 더이상 보이지 않으므로 제거 가능
          if (newCards.length === 0) {
            toast.info(`${CATEGORY_META[categoryId].short} — 추천 가능한 주제가 없습니다.`);
          } else {
            toast.success(
              `${CATEGORY_META[categoryId].short} — ${newCards.length}개의 새 추천이 생성되었습니다.`
            );
          }
        } catch (err) {
          console.error("[추천 새로고침] 실패:", err);
          toast.error(`${CATEGORY_META[categoryId].short} 새로고침에 실패했습니다.`);
        } finally {
          setRefreshingCat(null);
        }
      });
    },
    [byCategory, processedIds]
  );

  /**
   * 전체 카테고리 새로고침 — 3개 병렬
   */
  const handleRefreshAll = useCallback(() => {
    setRefreshingCat("CAT-A"); // 최소 하나로 로딩 표시
    startRefresh(async () => {
      try {
        const excludeAll = [
          ...CATEGORY_ORDER.flatMap(
            (id) =>
              byCategory[id]
                ?.map((r) => r.recId)
                .filter((rid): rid is string => !!rid) ?? []
          ),
          ...Array.from(processedIds),
        ];
        const [a, b, c] = await Promise.all([
          getCategoryRecommendations("CAT-A", excludeAll),
          getCategoryRecommendations("CAT-B", excludeAll),
          getCategoryRecommendations("CAT-C", excludeAll),
        ]);
        setByCategory({ "CAT-A": a, "CAT-B": b, "CAT-C": c });
        const total = a.length + b.length + c.length;
        if (total === 0) {
          toast.info("추천 가능한 주제가 없습니다.");
        } else {
          toast.success(`${total}개의 새 추천이 생성되었습니다.`);
        }
      } catch (err) {
        console.error("[전체 추천 새로고침] 실패:", err);
        toast.error("전체 새로고침에 실패했습니다.");
      } finally {
        setRefreshingCat(null);
      }
    });
  }, [byCategory, processedIds]);

  /** 표시 대상 필터 (processedIds 제외) */
  const visibleFor = (categoryId: RecommendationCategoryId): Recommendation[] => {
    return (byCategory[categoryId] ?? []).filter((r) => {
      const idKey = r.recId ?? r.title;
      return !processedIds.has(idKey);
    });
  };

  const totalVisible = CATEGORY_ORDER.reduce(
    (sum, id) => sum + visibleFor(id).length,
    0
  );

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Pin className="h-4 w-4" />
              이번 주 추천 ({totalVisible}건)
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRefreshAll}
              disabled={refreshingCat !== null}
              className="h-7 px-2 text-muted-foreground"
            >
              {refreshingCat !== null ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span className="ml-1 text-xs">전체 새로고침</span>
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid grid-cols-4 h-9 w-full">
              <TabsTrigger value="all" className="text-xs">
                전체
              </TabsTrigger>
              {CATEGORY_ORDER.map((id) => (
                <TabsTrigger key={id} value={id} className="text-xs">
                  {CATEGORY_META[id].short}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* 전체 탭 — 카테고리별로 구분선과 함께 표시 */}
            <TabsContent value="all" className="space-y-4 mt-4">
              {CATEGORY_ORDER.map((id) => (
                <CategorySection
                  key={id}
                  categoryId={id}
                  recs={visibleFor(id)}
                  progress={progressMap.get(id)}
                  isRefreshing={refreshingCat === id}
                  onRefresh={() => handleRefreshCategory(id)}
                  onCreateDraft={handleCreateDraft}
                  onReject={openRejectDialog}
                  compact
                />
              ))}
            </TabsContent>

            {/* 카테고리별 탭 — 단독 표시 */}
            {CATEGORY_ORDER.map((id) => (
              <TabsContent key={id} value={id} className="mt-4">
                <CategorySection
                  categoryId={id}
                  recs={visibleFor(id)}
                  progress={progressMap.get(id)}
                  isRefreshing={refreshingCat === id}
                  onRefresh={() => handleRefreshCategory(id)}
                  onCreateDraft={handleCreateDraft}
                  onReject={openRejectDialog}
                  compact={false}
                />
              </TabsContent>
            ))}
          </Tabs>
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

/**
 * 한 카테고리 섹션 — 헤더(이름 + 발행 현황 + 뱃지 + 새로고침) + 카드 목록
 */
interface CategorySectionProps {
  categoryId: RecommendationCategoryId;
  recs: Recommendation[];
  progress: MonthlyPublishProgress | undefined;
  isRefreshing: boolean;
  onRefresh: () => void;
  onCreateDraft: (rec: Recommendation) => void;
  onReject: (rec: Recommendation) => void;
  /** 전체 탭에선 compact(구분선 + 작은 헤더), 단독 탭에선 일반 */
  compact: boolean;
}

function CategorySection({
  categoryId,
  recs,
  progress,
  isRefreshing,
  onRefresh,
  onCreateDraft,
  onReject,
  compact,
}: CategorySectionProps) {
  const meta = CATEGORY_META[categoryId];
  const published = progress?.published ?? 0;
  const target = progress?.target ?? meta.target;
  const achieved = published >= target;
  const shortage = !achieved && published < target;

  return (
    <section className="space-y-2">
      {/* 카테고리 헤더 */}
      <div
        className={
          compact
            ? "flex items-center gap-2 border-t pt-3 first:border-t-0 first:pt-0"
            : "flex items-center gap-2"
        }
      >
        <span className="text-sm font-semibold text-foreground">{meta.short}</span>
        <span className="text-xs text-muted-foreground">
          이번 달 <strong className={achieved ? "text-green-600" : "text-orange-600"}>
            {published}/{target}
          </strong>편
        </span>
        {achieved && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
            ✅ 목표 달성
          </span>
        )}
        {shortage && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium inline-flex items-center gap-0.5">
            <AlertTriangle className="h-2.5 w-2.5" />
            발행 부족
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="ml-auto h-6 px-1.5 text-muted-foreground"
        >
          {isRefreshing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          <span className="ml-1 text-[10px]">새로고침</span>
        </Button>
      </div>

      {/* 카드 리스트 */}
      {recs.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="h-6 w-6 text-muted-foreground" />}
          title={achieved ? "이번 달 목표 달성" : "추천 주제가 없습니다"}
          description={
            achieved
              ? "이 카테고리는 월간 목표를 달성했습니다."
              : "새로고침으로 새로운 추천을 받아보세요."
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {recs.map((rec) => (
            <RecCard
              key={rec.recId ?? rec.title}
              rec={rec}
              needsAttention={shortage}
              onCreateDraft={onCreateDraft}
              onReject={onReject}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * 개별 추천 카드
 */
interface RecCardProps {
  rec: Recommendation;
  needsAttention: boolean;
  onCreateDraft: (rec: Recommendation) => void;
  onReject: (rec: Recommendation) => void;
}

function RecCard({ rec, needsAttention, onCreateDraft, onReject }: RecCardProps) {
  const sourceKey = rec.source ?? "manual";
  const sourceMeta = SOURCE_META[sourceKey] ?? SOURCE_META.manual;
  const SourceIcon = sourceMeta.icon;

  return (
    <div className="rounded-lg border p-3 space-y-2 flex flex-col bg-background hover:shadow-sm transition-shadow">
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
        {needsAttention && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
            ⚠️ 발행 부족
          </span>
        )}
      </div>

      {/* 제목 */}
      <p className="text-sm font-semibold leading-snug line-clamp-2">{rec.title}</p>

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
          onClick={() => onCreateDraft(rec)}
          className="flex-1 h-8 text-xs"
          style={{ backgroundColor: "var(--brand-accent)" }}
        >
          <CheckCircle2 className="mr-1 h-3 w-3" />
          적합 · 초안 생성
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onReject(rec)}
          className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50"
        >
          <XCircle className="mr-1 h-3 w-3" />
          부적합
        </Button>
      </div>
    </div>
  );
}
