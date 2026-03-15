"use client";

import { useState, useCallback } from "react";
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
import { StatusBadge } from "@/components/common/status-badge";
import { TimelineStep } from "@/components/common/timeline-step";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { SeoScorePanel } from "@/components/contents/seo-score-panel";
import { QualityScore } from "@/components/contents/quality-score";
import { PerformanceInput } from "@/components/contents/performance-input";
import { HealthBanner } from "@/components/contents/health-banner";
import { InternalLinksPanel } from "@/components/contents/internal-links-panel";
import { calculateSeoScore } from "@/lib/seo-calculator";
import {
  updateContent,
  updateContentStatus,
  deleteContent,
} from "@/actions/contents";
import { checkSla } from "@/lib/utils/sla-checker";
import { CONTENT_STATES } from "@/lib/constants/content-states";
import type {
  Content,
  Category,
  Profile,
  StateTransition,
  ContentStatus,
  TargetAudience,
} from "@/lib/types/database";
import {
  ArrowLeft,
  Save,
  ArrowRight,
  Undo2,
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
}

export function ContentDetailClient({
  content: initialContent,
  categories,
  profiles,
  transitions,
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

  // 상태 전이 다이얼로그
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingTransition, setPendingTransition] =
    useState<StateTransition | null>(null);

  // 삭제 다이얼로그
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // 저장 중 상태
  const [isSavingContent, setIsSavingContent] = useState(false);

  // 유효한 전이 목록
  const validTransitions = transitions.filter(
    (t) => t.from_status === content.status
  );

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
        toast.error("저장에 실패했습니다");
        console.error("[저장 실패]", error);
        return;
      }

      if (data) {
        setContent(data);
      } else {
        // 폴백: 로컬 상태 업데이트
        setContent((prev) => ({
          ...prev,
          ...updateData,
          tags: parsedTags.length > 0 ? parsedTags : null,
          updated_at: new Date().toISOString(),
        }));
      }

      toast.success("저장되었습니다");
    } catch (err) {
      toast.error("저장에 실패했습니다");
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

  // 상태 전이
  const handleTransition = useCallback(
    (transition: StateTransition) => {
      setPendingTransition(transition);
      setConfirmOpen(true);
    },
    []
  );

  const confirmTransition = useCallback(async () => {
    if (!pendingTransition) return;
    const newStatus = pendingTransition.to_status as ContentStatus;

    const { data, error } = await updateContentStatus(content.id, newStatus);

    if (error) {
      toast.error("상태 변경에 실패했습니다");
      console.error("[상태 전이 실패]", error);
    } else {
      if (data) {
        setContent(data);
      } else {
        setContent((prev) => ({
          ...prev,
          status: newStatus,
          updated_at: new Date().toISOString(),
        }));
      }
      toast.success(`상태가 변경되었습니다: ${CONTENT_STATES[newStatus]?.label ?? newStatus}`);
    }
    setPendingTransition(null);
  }, [pendingTransition, content.id]);

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
                <div className="space-y-2">
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
          <Card>
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
          <Card>
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
          <SeoScorePanel
            content={content}
            categoryId={content.secondary_category || content.category_id}
          />
        </div>

        {/* 오른쪽 사이드바 (1/3) */}
        <div className="space-y-6">
          {/* 상태 카드 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">상태</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">현재:</span>
                <StatusBadge status={content.status} />
              </div>

              {validTransitions.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">
                      상태 전이
                    </p>
                    {validTransitions.map((t) => {
                      const isReverse = t.is_reversible;
                      return (
                        <Button
                          key={t.id}
                          variant={isReverse ? "outline" : "default"}
                          size="sm"
                          className="w-full justify-start"
                          onClick={() => handleTransition(t)}
                        >
                          {isReverse ? (
                            <Undo2 className="h-4 w-4 mr-2" />
                          ) : (
                            <ArrowRight className="h-4 w-4 mr-2" />
                          )}
                          <span className="truncate">
                            {t.description}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                </>
              )}
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

      {/* 상태 전이 확인 다이얼로그 */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="상태 변경"
        description={
          pendingTransition?.description ?? "상태를 변경하시겠습니까?"
        }
        confirmLabel="변경"
        onConfirm={confirmTransition}
      />

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
