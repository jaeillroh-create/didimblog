"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/common/status-badge";
import {
  updateContentStatusWithMeta,
  type UpdateContentStatusWithMetaInput,
} from "@/actions/contents";
import type { Content, StateTransition, ContentStatus } from "@/lib/types/database";
import { CONTENT_STATES } from "@/lib/constants/content-states";
import {
  CheckCircle2,
  XCircle,
  ArrowRight,
  Undo2,
  AlertTriangle,
  Loader2,
  ExternalLink,
  TrendingUp,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

interface StatusTransitionPanelProps {
  content: Content;
  transitions: StateTransition[];
  isAdmin: boolean;
  /** SEO 점수 (seo-calculator 결과의 normalizedScore, 0~100) */
  seoScore: number;
  /** 교차검증 결과 수행 여부 + 심각 이슈 개수 */
  crossValidationRun: boolean;
  crossValidationCriticalCount: number;
  /** 본문에서 추출된 이미지 마커 개수 */
  imageMarkerCount: number;
  onContentUpdated: (next: Content) => void;
}

interface ConditionCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  /** 미충족 시 스크롤할 DOM id (content-detail-client 에 data-scroll-id 로 마킹해야 함) */
  scrollTarget?: string;
}

/**
 * 다음 forward 전이에 대해 조건 체크리스트를 생성.
 * 현재 상태 → 다음 상태 매핑별로 다른 체크.
 */
function buildChecks(
  content: Content,
  props: Pick<
    StatusTransitionPanelProps,
    "seoScore" | "crossValidationRun" | "crossValidationCriticalCount" | "imageMarkerCount"
  >
): ConditionCheck[] {
  const status = content.status;
  const body = content.body ?? "";
  const bodyCharCount = body.replace(/\s/g, "").length;
  const tagCount = content.tags?.length ?? 0;
  const isDiary = content.category_id?.startsWith("CAT-C") ?? false;

  if (status === "S1") {
    // S1 → S2 (초안완료 → 검토완료)
    return [
      {
        id: "seo-70",
        label: "SEO 점수 70점 이상",
        passed: props.seoScore >= 70,
        detail: `현재 ${props.seoScore}점`,
        scrollTarget: "seo-panel",
      },
      {
        id: "cross-validation",
        label: "교차검증 수행 + 심각 이슈 0건",
        passed: props.crossValidationRun && props.crossValidationCriticalCount === 0,
        detail: props.crossValidationRun
          ? `심각 ${props.crossValidationCriticalCount}건`
          : "미수행",
        scrollTarget: "body-editor",
      },
      {
        id: "body-1500",
        label: "본문 1,500자 이상 (공백 제외)",
        passed: bodyCharCount >= 1500,
        detail: `${bodyCharCount.toLocaleString()}자`,
        scrollTarget: "body-editor",
      },
      {
        id: "tags-10",
        label: "태그 10개 이상",
        passed: tagCount >= 10,
        detail: `현재 ${tagCount}개`,
        scrollTarget: "tags-input",
      },
      {
        id: "images-3",
        label: "이미지 마커 3개 이상",
        passed: props.imageMarkerCount >= 3,
        detail: `현재 ${props.imageMarkerCount}개`,
        scrollTarget: "body-editor",
      },
    ];
  }

  if (status === "S2") {
    // S2 → S3 (검토완료 → 발행예정)
    const hasPublishDate = !!(content.publish_date || content.publish_due);
    const hasCta =
      isDiary ||
      body.includes("상담") ||
      body.includes("연락") ||
      body.includes("이웃") ||
      body.includes("admin@didimip");
    const hasSignature =
      isDiary || body.includes("특허그룹 디딤") || body.includes("디딤변리사");
    return [
      {
        id: "publish-date",
        label: "발행예정일 설정",
        passed: hasPublishDate,
        detail: hasPublishDate
          ? (content.publish_date ?? content.publish_due ?? "").slice(0, 10)
          : "미설정",
        scrollTarget: "publish-date",
      },
      {
        id: "cta",
        label: isDiary ? "CTA 불필요 (다이어리)" : "CTA 배치",
        passed: hasCta,
        detail: hasCta ? "있음" : "없음",
        scrollTarget: "body-editor",
      },
      {
        id: "signature",
        label: isDiary ? "서명 불필요 (다이어리)" : "디딤 서명 블록 포함",
        passed: hasSignature,
        detail: hasSignature ? "있음" : "없음",
        scrollTarget: "body-editor",
      },
    ];
  }

  if (status === "S3") {
    // S3 → S4: 조건 없음 (모달에서 URL/일시 입력)
    return [];
  }

  if (status === "S4") {
    // S4 → S5: 발행 후 7일 경과
    if (!content.published_at) {
      return [
        {
          id: "published-at",
          label: "발행일시 필요",
          passed: false,
          detail: "발행일시가 기록되지 않음",
        },
      ];
    }
    const publishedAt = new Date(content.published_at).getTime();
    const daysSince = Math.floor((Date.now() - publishedAt) / (24 * 60 * 60 * 1000));
    return [
      {
        id: "d-plus-7",
        label: "발행 후 7일 경과",
        passed: daysSince >= 7,
        detail: `D+${daysSince}일`,
      },
    ];
  }

  return [];
}

/**
 * 현재 상태 → 다음 forward 상태 결정. transitions 테이블에서 forward(is_reversible=false)
 * 중 첫 번째를 선택. 없으면 null.
 */
function findForwardTransition(
  status: ContentStatus,
  transitions: StateTransition[]
): StateTransition | null {
  return (
    transitions.find(
      (t) => t.from_status === status && !t.is_reversible
    ) ?? null
  );
}

function findReverseTransitions(
  status: ContentStatus,
  transitions: StateTransition[]
): StateTransition[] {
  return transitions.filter((t) => t.from_status === status && t.is_reversible);
}

export function StatusTransitionPanel({
  content,
  transitions,
  isAdmin,
  seoScore,
  crossValidationRun,
  crossValidationCriticalCount,
  imageMarkerCount,
  onContentUpdated,
}: StatusTransitionPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // forward 전이 모달 (S3→S4 / S4→S5 같은 입력 폼 필요)
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [naverBlogUrl, setNaverBlogUrl] = useState("");
  const [publishedAtInput, setPublishedAtInput] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });

  const [performanceModalOpen, setPerformanceModalOpen] = useState(false);
  const [views1w, setViews1w] = useState("");
  const [comments, setComments] = useState("");
  const [neighborAdded, setNeighborAdded] = useState("");
  const [consultation, setConsultation] = useState<"yes" | "no">("no");

  // 역행 전이 사유
  const [reverseTransition, setReverseTransition] = useState<StateTransition | null>(null);
  const [reverseReason, setReverseReason] = useState("");

  // admin 강제 전환 확인
  const [forceConfirmOpen, setForceConfirmOpen] = useState(false);

  const checks = useMemo(
    () =>
      buildChecks(content, {
        seoScore,
        crossValidationRun,
        crossValidationCriticalCount,
        imageMarkerCount,
      }),
    [content, seoScore, crossValidationRun, crossValidationCriticalCount, imageMarkerCount]
  );

  const forwardTransition = findForwardTransition(content.status as ContentStatus, transitions);
  const reverseTransitions = findReverseTransitions(content.status as ContentStatus, transitions);

  const metCount = checks.filter((c) => c.passed).length;
  const totalCount = checks.length;
  const allMet = totalCount === 0 || metCount === totalCount;

  function scrollToTarget(scrollTarget?: string) {
    if (!scrollTarget) return;
    const el = document.querySelector(`[data-scroll-id="${scrollTarget}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function runStatusUpdate(input: UpdateContentStatusWithMetaInput) {
    const res = await updateContentStatusWithMeta(input);
    if (res.error || !res.data) {
      toast.error(res.error ?? "상태 변경에 실패했습니다");
      return false;
    }
    onContentUpdated(res.data);
    const labelFrom = CONTENT_STATES[content.status]?.label ?? content.status;
    const labelTo = CONTENT_STATES[input.newStatus]?.label ?? input.newStatus;
    toast.success(`상태 변경: ${labelFrom} → ${labelTo}`);
    router.refresh();
    return true;
  }

  function handleForwardClick() {
    if (!forwardTransition) return;
    const nextStatus = forwardTransition.to_status as ContentStatus;

    if (nextStatus === "S4") {
      // 발행 완료 모달
      setPublishModalOpen(true);
      return;
    }
    if (nextStatus === "S5") {
      // 성과 입력 모달
      setPerformanceModalOpen(true);
      return;
    }

    // S1→S2, S2→S3 — 조건 체크만 확인 후 바로 전이
    if (!allMet) {
      toast.error("조건이 충족되지 않았습니다. 체크리스트를 확인해주세요.");
      return;
    }
    startTransition(async () => {
      await runStatusUpdate({
        contentId: content.id,
        newStatus: nextStatus,
      });
    });
  }

  function handleForcedForwardClick() {
    setForceConfirmOpen(true);
  }

  function handleConfirmForced() {
    if (!forwardTransition) return;
    const nextStatus = forwardTransition.to_status as ContentStatus;
    setForceConfirmOpen(false);
    startTransition(async () => {
      await runStatusUpdate({
        contentId: content.id,
        newStatus: nextStatus,
        force: true,
        transitionReason: "관리자 강제 전환 (조건 미충족)",
      });
    });
  }

  function handleSubmitPublish() {
    if (!forwardTransition) return;
    setPublishModalOpen(false);
    startTransition(async () => {
      const ok = await runStatusUpdate({
        contentId: content.id,
        newStatus: "S4",
        naverBlogUrl: naverBlogUrl.trim() || undefined,
        publishedAtOverride: new Date(publishedAtInput).toISOString(),
      });
      if (ok) setNaverBlogUrl("");
    });
  }

  function handleSubmitPerformance() {
    if (!forwardTransition) return;
    setPerformanceModalOpen(false);
    const snapshot = {
      views_1w: views1w ? parseInt(views1w, 10) : undefined,
      comments: comments ? parseInt(comments, 10) : undefined,
      neighbor_added: neighborAdded ? parseInt(neighborAdded, 10) : undefined,
      consultation_yn: consultation === "yes",
    };
    startTransition(async () => {
      const ok = await runStatusUpdate({
        contentId: content.id,
        newStatus: "S5",
        performanceSnapshot: snapshot,
      });
      if (ok) {
        setViews1w("");
        setComments("");
        setNeighborAdded("");
        setConsultation("no");
      }
    });
  }

  function handleReverseClick(t: StateTransition) {
    setReverseTransition(t);
    setReverseReason("");
  }

  function handleSubmitReverse() {
    if (!reverseTransition || !reverseReason.trim()) {
      toast.error("되돌리기 사유를 입력해주세요");
      return;
    }
    const t = reverseTransition;
    setReverseTransition(null);
    startTransition(async () => {
      await runStatusUpdate({
        contentId: content.id,
        newStatus: t.to_status as ContentStatus,
        transitionReason: reverseReason.trim(),
        isReversal: true,
      });
    });
  }

  // 다음 상태 라벨
  const nextLabel = forwardTransition
    ? CONTENT_STATES[forwardTransition.to_status as ContentStatus]?.label
    : null;

  return (
    <>
      <div className="space-y-4">
        {/* 현재 상태 */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">현재:</span>
          <StatusBadge status={content.status} />
          {nextLabel && (
            <span className="text-xs text-muted-foreground">
              → 다음: <strong>{nextLabel}</strong>
            </span>
          )}
        </div>

        {/* 다음 단계 전이 버튼 + 체크리스트 */}
        {forwardTransition && (
          <>
            <Separator />
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground font-medium">다음 단계</p>

              <Button
                size="sm"
                variant="default"
                className="w-full"
                onClick={handleForwardClick}
                disabled={isPending || (!allMet && totalCount > 0)}
                style={{
                  backgroundColor: allMet || totalCount === 0 ? "var(--brand-accent)" : undefined,
                }}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : forwardTransition.to_status === "S4" ? (
                  <ExternalLink className="h-4 w-4 mr-1" />
                ) : forwardTransition.to_status === "S5" ? (
                  <TrendingUp className="h-4 w-4 mr-1" />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-1" />
                )}
                <span>
                  {forwardTransition.to_status === "S2" && "🔍 검토 완료 처리"}
                  {forwardTransition.to_status === "S3" && "📅 발행 예약"}
                  {forwardTransition.to_status === "S4" && "✅ 발행 완료 처리"}
                  {forwardTransition.to_status === "S5" && "📊 성과 기록"}
                  {!["S2", "S3", "S4", "S5"].includes(forwardTransition.to_status) &&
                    forwardTransition.description}
                </span>
              </Button>

              {/* 조건 체크리스트 */}
              {totalCount > 0 && (
                <div className="space-y-1.5 rounded-md border bg-muted/30 p-2">
                  <p className="text-[11px] text-muted-foreground">
                    조건 충족 현황: <strong>{metCount}/{totalCount}</strong>
                    {!allMet && " — 아래 항목을 해결하세요"}
                  </p>
                  {checks.map((check) => (
                    <button
                      key={check.id}
                      type="button"
                      onClick={() => scrollToTarget(check.scrollTarget)}
                      className="w-full flex items-center gap-2 text-left text-xs py-0.5 hover:bg-muted/50 rounded px-1 transition-colors"
                    >
                      {check.passed ? (
                        <CheckCircle2
                          className="h-3.5 w-3.5 shrink-0"
                          style={{ color: "var(--quality-excellent)" }}
                        />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                      )}
                      <span
                        className={
                          check.passed ? "text-muted-foreground" : "text-foreground font-medium"
                        }
                      >
                        {check.label}
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {check.detail}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* admin 강제 전환 */}
              {!allMet && totalCount > 0 && isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-red-600 border-red-200 hover:bg-red-50"
                  onClick={handleForcedForwardClick}
                  disabled={isPending}
                >
                  <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                  조건 미충족 — 강제 전환 (관리자)
                </Button>
              )}
            </div>
          </>
        )}

        {/* 역행 전이 */}
        {reverseTransitions.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">이전 상태로 되돌리기</p>
              {reverseTransitions.map((t) => (
                <Button
                  key={t.id}
                  size="sm"
                  variant="outline"
                  className="w-full justify-start text-muted-foreground"
                  onClick={() => handleReverseClick(t)}
                  disabled={isPending}
                >
                  <Undo2 className="h-3.5 w-3.5 mr-2" />
                  <span className="truncate text-xs">{t.description}</span>
                </Button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* S3 → S4 발행 완료 모달 */}
      <Dialog open={publishModalOpen} onOpenChange={setPublishModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>발행 완료 처리</DialogTitle>
            <DialogDescription>
              네이버 블로그에 실제 발행한 URL과 발행일시를 입력하세요. 공란으로 두면 URL은 생략되고 발행일시는 현재 시간이 사용됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">네이버 블로그 URL (선택)</Label>
              <Input
                type="url"
                placeholder="https://blog.naver.com/..."
                value={naverBlogUrl}
                onChange={(e) => setNaverBlogUrl(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">발행일시</Label>
              <Input
                type="datetime-local"
                value={publishedAtInput}
                onChange={(e) => setPublishedAtInput(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishModalOpen(false)} disabled={isPending}>
              취소
            </Button>
            <Button
              onClick={handleSubmitPublish}
              disabled={isPending}
              style={{ backgroundColor: "var(--brand-accent)" }}
            >
              발행 완료
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* S4 → S5 성과 입력 모달 */}
      <Dialog open={performanceModalOpen} onOpenChange={setPerformanceModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>성과 측정 기록</DialogTitle>
            <DialogDescription>
              발행 후 1주차 성과 지표를 입력하세요. 비워두면 저장하지 않습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">조회수 (1주차)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={views1w}
                  onChange={(e) => setViews1w(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">댓글 수</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">이웃 추가 수</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={neighborAdded}
                  onChange={(e) => setNeighborAdded(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">상담 문의 여부</Label>
                <div className="flex gap-2 mt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={consultation === "yes" ? "default" : "outline"}
                    onClick={() => setConsultation("yes")}
                    className="flex-1 h-9"
                  >
                    있음
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={consultation === "no" ? "default" : "outline"}
                    onClick={() => setConsultation("no")}
                    className="flex-1 h-9"
                  >
                    없음
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPerformanceModalOpen(false)} disabled={isPending}>
              취소
            </Button>
            <Button
              onClick={handleSubmitPerformance}
              disabled={isPending}
              style={{ backgroundColor: "var(--brand-accent)" }}
            >
              성과 기록
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 역행 전이 사유 모달 */}
      <Dialog open={!!reverseTransition} onOpenChange={(o) => !o && setReverseTransition(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>이전 상태로 되돌리기</DialogTitle>
            <DialogDescription>
              {reverseTransition && (
                <>
                  {CONTENT_STATES[content.status]?.label} →{" "}
                  {CONTENT_STATES[reverseTransition.to_status as ContentStatus]?.label}
                  으로 되돌립니다. 사유를 입력해주세요 (필수).
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-xs">되돌리기 사유</Label>
            <textarea
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              rows={3}
              placeholder="예: 팩트 오류 발견, 구조 변경 필요..."
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseTransition(null)} disabled={isPending}>
              취소
            </Button>
            <Button
              onClick={handleSubmitReverse}
              disabled={isPending || !reverseReason.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              되돌리기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* admin 강제 전환 확인 모달 */}
      <Dialog open={forceConfirmOpen} onOpenChange={setForceConfirmOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              관리자 강제 전환
            </DialogTitle>
            <DialogDescription>
              조건이 충족되지 않았지만 관리자 권한으로 상태를 강제 전환합니다. 이 전환은 기록에 남으며, 미충족 조건으로 인한 품질 저하에 주의하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-1 text-xs text-muted-foreground">
            {checks
              .filter((c) => !c.passed)
              .map((c) => (
                <div key={c.id} className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span>
                    {c.label} — {c.detail}
                  </span>
                </div>
              ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForceConfirmOpen(false)} disabled={isPending}>
              취소
            </Button>
            <Button
              onClick={handleConfirmForced}
              disabled={isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              강제 전환
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
