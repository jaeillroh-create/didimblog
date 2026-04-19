"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/common/page-header";
import { TimelineStep } from "@/components/common/timeline-step";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { SeoScorePanel } from "@/components/contents/seo-score-panel";
import { QualityScore } from "@/components/contents/quality-score";
import { PerformanceInput } from "@/components/contents/performance-input";
import { HealthBanner } from "@/components/contents/health-banner";
import { InternalLinksPanel } from "@/components/contents/internal-links-panel";
import { StatusTransitionPanel } from "@/components/contents/status-transition-panel";
import { ReviewPanel } from "@/components/contents/review-panel";
import { calculateSeoScore } from "@/lib/seo-calculator";
import { hasParagraphIds, injectParagraphIds } from "@/lib/utils/paragraph-ids";
import {
  updateContent,
  deleteContent,
} from "@/actions/contents";
import { recoverBodyFromGeneration } from "@/actions/ai";
import { checkSla } from "@/lib/utils/sla-checker";
import { CONTENT_STATES } from "@/lib/constants/content-states";
import type {
  Content,
  Category,
  Profile,
  StateTransition,
  TargetAudience,
  ValidationResult,
} from "@/lib/types/database";
import {
  ArrowLeft,
  Save,
  User,
  Calendar,
  FileEdit,
  Info,
  Sparkles,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";

interface ContentDetailClientProps {
  content: Content;
  categories: Category[];
  profiles: Profile[];
  transitions: StateTransition[];
  isAdmin: boolean;
  validationResults: ValidationResult[] | null;
}

/**
 * 본문에서 이미지 마커 개수 추출 — ai-editor 의 extractImageMarkers 와 동일 로직.
 * 박스 형식 + 단순 형식 두 가지 모두 카운트.
 */
function countImageMarkers(text: string): number {
  if (!text) return 0;
  let count = 0;
  const positions: number[] = [];

  const boxRe = /\[IMAGE:\s*([\s\S]*?)\]\s*\n\s*━━/g;
  let m: RegExpExecArray | null;
  while ((m = boxRe.exec(text)) !== null) {
    positions.push(m.index);
    count++;
  }

  const simpleRe = /\[IMAGE:\s*([^\]\n]+?)\]/g;
  while ((m = simpleRe.exec(text)) !== null) {
    const idx = m.index;
    const overlap = positions.some((p) => idx >= p && idx < p + 200);
    if (overlap) continue;
    count++;
  }
  return count;
}

export function ContentDetailClient({
  content: initialContent,
  categories,
  profiles,
  transitions,
  isAdmin,
  validationResults,
}: ContentDetailClientProps) {
  const router = useRouter();

  // 콘텐츠 폼 상태
  const [content, setContent] = useState(initialContent);
  const [title, setTitle] = useState(content.title ?? "");
  const [body, setBody] = useState(content.body ?? "");
  const [categoryId, setCategoryId] = useState(content.category_id ?? "");
  const [secondaryCategory, setSecondaryCategory] = useState(
    content.secondary_category ?? "none"
  );
  const [targetKeyword, setTargetKeyword] = useState(
    content.target_keyword ?? ""
  );
  const [targetAudience, setTargetAudience] = useState<string>(
    content.target_audience ?? ""
  );
  const [publishDate, setPublishDate] = useState(content.publish_date ?? "");
  const [seoKeywords, setSeoKeywords] = useState(content.seo_keywords ?? "");
  const [tagsInput, setTagsInput] = useState(
    content.tags?.join(", ") ?? ""
  );

  // 문단 ID 자동 부여 (기존 콘텐츠 호환) — 백그라운드, 1회만, 로컬만
  const paragraphIdsInjected = useRef(false);
  useEffect(() => {
    if (paragraphIdsInjected.current) return;
    if (body && body.length > 100 && !hasParagraphIds(body)) {
      paragraphIdsInjected.current = true;
      const withIds = injectParagraphIds(body);
      setBody(withIds);
      // DB 저장은 사용자가 저장 버튼 누를 때 함께 반영됨 — 여기서 별도 저장하지 않음
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 삭제 다이얼로그
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // 저장 중 상태
  const [isSavingContent, setIsSavingContent] = useState(false);

  // 교차검증 결과 요약 (severity === "high" 가 심각 이슈)
  const crossValidationRun = !!validationResults && validationResults.length > 0;
  const crossValidationCriticalCount = (validationResults ?? []).reduce(
    (sum, r) => sum + (r.issues?.filter((i) => i.severity === "high").length ?? 0),
    0
  );

  // 본문에서 이미지 마커 개수 추출 (실시간 — body state 기반)
  const imageMarkerCount = countImageMarkers(body);

  // SEO 점수 — 저장된 값 우선, 없으면 즉시 계산
  const seoScore =
    content.seo_score ??
    calculateSeoScore(content, content.secondary_category || content.category_id)
      .normalizedScore;

  // 카테고리 계층 - 1차 카테고리 선택 시 2차 드롭다운 동적 변경
  const primaryCategories = categories.filter((c) => c.tier === "primary");
  const secondaryCategories = categories.filter(
    (c) => c.tier === "secondary" && c.parent_id === categoryId
  );

  // SLA 타임라인
  const slaItems = checkSla(content);
  const timelineSteps = slaItems.map((item) => ({
    label: item.label,
    date: item.dueDate
      ? format(new Date(item.dueDate), "M/d (EEE)", { locale: ko })
      : undefined,
    status: (item.status === "completed"
      ? "completed"
      : item.status === "overdue" || item.status === "due_today"
        ? "current"
        : "upcoming") as "completed" | "current" | "upcoming",
  }));

  // 프로필 이름 찾기
  const getProfileName = (id: string | null) => {
    if (!id) return "-";
    const profile = profiles.find((p) => p.id === id);
    return profile?.name ?? "-";
  };

  // 카테고리 이름 찾기
  const getCategoryName = (id: string | null) => {
    if (!id) return "-";
    const cat = categories.find((c) => c.id === id);
    return cat?.name ?? "-";
  };

  // 콘텐츠 저장 — Supabase 실제 연동
  const handleSaveContent = useCallback(async () => {
    setIsSavingContent(true);
    try {
      const parsedTags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      // SEO 점수 자동 계산
      const tempContent = {
        ...content,
        title: title || null,
        body: body || null,
        category_id: categoryId || null,
        target_keyword: targetKeyword || null,
        tags: parsedTags.length > 0 ? parsedTags : null,
      };
      const seoResult = calculateSeoScore(
        tempContent,
        secondaryCategory === "none" ? categoryId : secondaryCategory || categoryId
      );

      const updateData = {
        title: title || null,
        body: body || null,
        category_id: categoryId || null,
        secondary_category:
          secondaryCategory === "none" ? null : secondaryCategory || null,
        target_keyword: targetKeyword || null,
        target_audience: (targetAudience as TargetAudience) || null,
        publish_date: publishDate || null,
        seo_keywords: seoKeywords || null,
        tags: parsedTags.length > 0 ? parsedTags : null,
        seo_score: seoResult.normalizedScore,
      };

      const { data, error } = await updateContent(content.id, updateData);

      if (error) {
        toast.error(error, { duration: 8000 });
        console.error("[저장 실패]", error);
        return;
      }

      if (!data) {
        toast.error(
          "저장 실패: 서버에서 데이터를 반환하지 않았습니다. RLS 정책 또는 로그인 상태를 확인하세요.",
          { duration: 8000 }
        );
        return;
      }

      setContent(data);
      toast.success("저장되었습니다");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "알 수 없는 오류";
      toast.error(`저장 실패: ${msg}`, { duration: 8000 });
      console.error("[저장 에러]", err);
    } finally {
      setIsSavingContent(false);
    }
  }, [
    content.id,
    title,
    body,
    categoryId,
    secondaryCategory,
    targetKeyword,
    targetAudience,
    publishDate,
    seoKeywords,
    tagsInput,
  ]);

  // 삭제
  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      const { success, error } = await deleteContent(content.id);
      if (!success) {
        toast.error("삭제에 실패했습니다");
        console.error("[삭제 실패]", error);
        return;
      }
      toast.success("삭제되었습니다");
      router.push("/contents");
    } catch (err) {
      toast.error("삭제에 실패했습니다");
      console.error("[삭제 에러]", err);
    } finally {
      setIsDeleting(false);
    }
  }, [content.id, router]);

  const statusIndex = ["S0", "S1", "S2", "S3", "S4", "S5"].indexOf(
    content.status
  );

  // 글자수 카운터
  const bodyLength = body.length;

  // 삭제 확인 메시지
  const deleteMessage =
    content.status === "S4" || content.status === "S5"
      ? "이 글은 이미 발행된 상태입니다. 삭제하더라도 네이버 블로그에서는 별도로 삭제해야 합니다. 계속하시겠습니까?"
      : "이 콘텐츠를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.";

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {content.title ?? "제목 없음"}
            {content.is_ai_generated && (
              <span
                className="ucl-badge ucl-badge-sm"
                style={{ backgroundColor: "#ede9fe", color: "#7c3aed" }}
              >
                <span className="tf tf-12">AI</span>
              </span>
            )}
          </span>
        }
        description={`${CONTENT_STATES[content.status]?.label ?? content.status} | ${getCategoryName(content.category_id)}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/contents")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            목록
          </Button>
          {/* S1 이상: 네이버 발행 준비 버튼 */}
          {statusIndex >= 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/contents/${content.id}/publish`)}
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              네이버 발행 준비
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            삭제
          </Button>
        </div>
      </PageHeader>

      {/* 헬스 상태 배너 (S4 이상) */}
      {statusIndex >= 4 && (
        <HealthBanner
          contentId={content.id}
          healthStatus={content.health_status}
          healthCheckedAt={content.health_checked_at}
        />
      )}

      {/* 미완료 항목 배너 — S1~S3 에서 권장 항목 미충족 시 표시 */}
      {(() => {
        const incompleteItems: Array<{ label: string; scrollTarget?: string; action?: () => void }> = [];
        if (statusIndex >= 1 && statusIndex <= 3) {
          const tagCount = content.tags?.length ?? 0;
          if (tagCount < 10) {
            incompleteItems.push({
              label: `태그 ${tagCount}/10개`,
              scrollTarget: "tags-input",
            });
          }
          if (imageMarkerCount < 3) {
            incompleteItems.push({
              label: `이미지 ${imageMarkerCount}/3개 (권장)`,
              scrollTarget: "body-editor",
            });
          }
          if (seoScore < 70) {
            incompleteItems.push({
              label: `SEO ${seoScore}/70점 (권장)`,
              scrollTarget: "seo-panel",
            });
          }
          if (statusIndex >= 3 && !content.publish_date && !content.publish_due) {
            incompleteItems.push({
              label: "발행예정일 미설정",
              scrollTarget: "publish-date",
            });
          }
        }
        if (incompleteItems.length === 0) return null;
        return (
          <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3">
            <p className="text-sm font-medium text-orange-700 flex items-center gap-1.5">
              <span>⚠️</span>
              발행 전 미완료 항목 ({incompleteItems.length}건)
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {incompleteItems.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    if (item.scrollTarget) {
                      const el = document.querySelector(`[data-scroll-id="${item.scrollTarget}"]`);
                      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                  }}
                  className="text-xs px-2 py-1 rounded border border-orange-200 bg-white text-orange-700 hover:bg-orange-100 transition-colors"
                >
                  {item.label} →
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 2-column 레이아웃 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 왼쪽 메인 (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* 콘텐츠 정보 편집 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileEdit className="h-4 w-4" />
                콘텐츠 정보
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">제목</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="콘텐츠 제목을 입력하세요"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>1차 카테고리</Label>
                  <Select
                    value={categoryId}
                    onValueChange={(v) => {
                      setCategoryId(v);
                      setSecondaryCategory("none");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="카테고리 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {primaryCategories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>2차 분류</Label>
                  <Select
                    value={secondaryCategory}
                    onValueChange={setSecondaryCategory}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="2차 분류 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">없음</SelectItem>
                      {secondaryCategories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="keyword">타겟 키워드</Label>
                  <Input
                    id="keyword"
                    value={targetKeyword}
                    onChange={(e) => setTargetKeyword(e.target.value)}
                    placeholder="타겟 키워드"
                  />
                </div>

                <div className="space-y-2">
                  <Label>타겟 독자</Label>
                  <Select
                    value={targetAudience}
                    onValueChange={setTargetAudience}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="타겟 독자 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="startup">스타트업</SelectItem>
                      <SelectItem value="sme">중소기업</SelectItem>
                      <SelectItem value="cto">CTO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2" data-scroll-id="publish-date">
                  <Label htmlFor="publishDate">발행예정일</Label>
                  <Input
                    id="publishDate"
                    type="date"
                    value={publishDate}
                    onChange={(e) => setPublishDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="seoKeywords">SEO 키워드 (콤마 구분)</Label>
                  <Input
                    id="seoKeywords"
                    value={seoKeywords}
                    onChange={(e) => setSeoKeywords(e.target.value)}
                    placeholder="키워드1, 키워드2, 키워드3"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSaveContent}
                  disabled={isSavingContent}
                  size="sm"
                >
                  <Save className="h-4 w-4 mr-1" />
                  {isSavingContent ? "저장 중..." : "저장"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 본문 편집 */}
          <Card data-scroll-id="body-editor">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileEdit className="h-4 w-4" />
                  본문
                </span>
                <span
                  className={`text-sm font-normal ${
                    bodyLength > 2500
                      ? "text-red-500"
                      : bodyLength > 2000
                        ? "text-orange-500"
                        : "text-muted-foreground"
                  }`}
                >
                  {bodyLength.toLocaleString()}자
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* 본문 복구 배너 — AI 생성인데 body 가 비어있을 때 (admin) */}
              {isAdmin && content.ai_generation_id && (!body || body.replace(/\s/g, "").length < 100) && (
                <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2">
                  <p className="text-sm text-red-700 font-medium">
                    본문이 비어 있습니다 — AI 생성 이력에서 복구할 수 있습니다.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 text-xs border-red-200 text-red-600 hover:bg-red-100"
                    onClick={async () => {
                      const res = await recoverBodyFromGeneration(content.id);
                      if (res.success && res.body) {
                        setBody(res.body);
                        setContent((prev) => ({ ...prev, body: res.body! }));
                        toast.success(`본문 복구 완료 (${res.body.length.toLocaleString()}자)`);
                      } else {
                        toast.error(res.error ?? "복구 실패");
                      }
                    }}
                  >
                    AI 생성 이력에서 본문 복구
                  </Button>
                </div>
              )}
              {/* 대표 수정 요청 배너 */}
              {content.review_status === "revision_requested" && content.review_memo && (
                <div className="mb-3 rounded-md border border-orange-200 bg-orange-50 px-3 py-2">
                  <p className="text-sm text-orange-700 font-medium flex items-center gap-1.5">
                    <span>⚠️</span>
                    대표 수정 요청
                  </p>
                  <p className="text-xs text-orange-600 mt-1">{content.review_memo}</p>
                </div>
              )}
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                style={{ minHeight: "400px" }}
                placeholder="본문을 입력하세요..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <div className="flex justify-end mt-3">
                <Button
                  onClick={handleSaveContent}
                  disabled={isSavingContent}
                  size="sm"
                >
                  <Save className="h-4 w-4 mr-1" />
                  {isSavingContent ? "저장 중..." : "저장"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 태그 편집 */}
          <Card data-scroll-id="tags-input">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">태그</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="태그1, 태그2, 태그3, ... (콤마 구분, 최대 10개)"
              />
              <div className="flex flex-wrap gap-1.5">
                {tagsInput
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .map((tag, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-700"
                    >
                      {tag}
                    </span>
                  ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {tagsInput.split(",").map((t) => t.trim()).filter(Boolean).length}/10개
              </p>
            </CardContent>
          </Card>

          {/* AI 생성 정보 (AI 생성 콘텐츠인 경우) */}
          {content.is_ai_generated && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4" style={{ color: "#7c3aed" }} />
                  AI 생성 정보
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">생성 방식</span>
                  <span className="font-medium">AI 자동 생성</span>
                </div>
                {content.ai_generation_id && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">생성 ID</span>
                    <span className="font-medium">
                      #{content.ai_generation_id}
                    </span>
                  </div>
                )}
                {content.ai_edit_ratio !== null &&
                  content.ai_edit_ratio !== undefined && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">편집 비율</span>
                      <span className="font-medium">
                        {content.ai_edit_ratio}%
                      </span>
                    </div>
                  )}
                {content.ai_edited_by && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">편집자</span>
                    <span className="font-medium">
                      {getProfileName(content.ai_edited_by)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* SEO 자동 점수 패널 */}
          <div data-scroll-id="seo-panel">
            <SeoScorePanel
              content={content}
              categoryId={content.secondary_category || content.category_id}
            />
          </div>
        </div>

        {/* 오른쪽 사이드바 (1/3) */}
        <div className="space-y-6">
          {/* 상태 전이 패널 (조건 체크리스트 + 강제 전환 + 역행) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">상태</CardTitle>
            </CardHeader>
            <CardContent>
              <StatusTransitionPanel
                content={content}
                transitions={transitions}
                isAdmin={isAdmin}
                seoScore={seoScore}
                crossValidationRun={crossValidationRun}
                crossValidationCriticalCount={crossValidationCriticalCount}
                imageMarkerCount={imageMarkerCount}
                onContentUpdated={(next) => setContent(next)}
              />
              {/* 대표 검수 패널 (S1 일 때만 표시) */}
              <div data-scroll-id="review-panel">
                <ReviewPanel
                  content={content}
                  profiles={profiles}
                  onContentUpdated={(next) => setContent(next)}
                />
              </div>
            </CardContent>
          </Card>

          {/* SLA 타임라인 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                SLA 타임라인
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TimelineStep steps={timelineSteps} />
            </CardContent>
          </Card>

          {/* 성과 입력 (S4 이상) */}
          {statusIndex >= 4 && <PerformanceInput content={content} />}

          {/* 내부 링크 추천 */}
          <InternalLinksPanel contentId={content.id} />

          {/* 품질 점수 (S4 이상) */}
          {statusIndex >= 4 && <QualityScore content={content} />}

          {/* 정보 카드 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="h-4 w-4" />
                정보
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow
                icon={User}
                label="작성자"
                value={getProfileName(content.author_id)}
              />
              <InfoRow
                icon={User}
                label="검수자"
                value={getProfileName(content.reviewer_id)}
              />
              <InfoRow
                icon={User}
                label="디자이너"
                value={getProfileName(content.designer_id)}
              />
              <Separator />
              <InfoRow
                label="수정 횟수"
                value={`${content.revision_count ?? 0}회`}
              />
              <InfoRow
                label="생성일"
                value={
                  content.created_at
                    ? format(new Date(content.created_at), "yyyy.MM.dd HH:mm", {
                        locale: ko,
                      })
                    : "-"
                }
              />
              <InfoRow
                label="수정일"
                value={
                  content.updated_at
                    ? format(new Date(content.updated_at), "yyyy.MM.dd HH:mm", {
                        locale: ko,
                      })
                    : "-"
                }
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 삭제 확인 다이얼로그 */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="콘텐츠 삭제"
        description={deleteMessage}
        confirmLabel={isDeleting ? "삭제 중..." : "삭제"}
        onConfirm={handleDelete}
      />
    </div>
  );
}

/** 정보 행 */
function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between t-md">
      <div className="flex items-center gap-1.5 text-g-400">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        <span>{label}</span>
      </div>
      <span className="font-semibold text-g-900">{value}</span>
    </div>
  );
}
