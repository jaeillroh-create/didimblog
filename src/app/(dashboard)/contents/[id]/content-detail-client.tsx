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
import { SeoChecklist } from "@/components/contents/seo-checklist";
import { QualityScore } from "@/components/contents/quality-score";
import { saveSeoCheck } from "@/actions/seo-checks";
import { checkSla } from "@/lib/utils/sla-checker";
import { CONTENT_STATES } from "@/lib/constants/content-states";
import { cn } from "@/lib/utils";
import type {
  Content,
  Category,
  Profile,
  StateTransition,
  Briefing,
  SeoCheck,
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
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface ContentDetailClientProps {
  content: Content;
  categories: Category[];
  profiles: Profile[];
  transitions: StateTransition[];
  briefing: Briefing | null;
  seoCheck: SeoCheck | null;
}

export function ContentDetailClient({
  content: initialContent,
  categories,
  profiles,
  transitions,
  briefing: initialBriefing,
  seoCheck,
}: ContentDetailClientProps) {
  const router = useRouter();

  // 콘텐츠 폼 상태
  const [content, setContent] = useState(initialContent);
  const [title, setTitle] = useState(content.title ?? "");
  const [categoryId, setCategoryId] = useState(content.category_id ?? "");
  const [secondaryCategory, setSecondaryCategory] = useState(
    content.secondary_category ?? ""
  );
  const [targetKeyword, setTargetKeyword] = useState(
    content.target_keyword ?? ""
  );
  const [targetAudience, setTargetAudience] = useState<string>(
    content.target_audience ?? ""
  );

  // 브리핑 상태
  const [briefingText, setBriefingText] = useState("");
  const [keyPoints, setKeyPoints] = useState<string[]>(
    initialBriefing?.key_points ?? ["", "", ""]
  );

  // 상태 전이 다이얼로그
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingTransition, setPendingTransition] =
    useState<StateTransition | null>(null);

  // 저장 중 상태
  const [isSavingContent, setIsSavingContent] = useState(false);
  const [isSavingBriefing, setIsSavingBriefing] = useState(false);

  // 유효한 전이 목록
  const validTransitions = transitions.filter(
    (t) => t.from_status === content.status
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

  // 콘텐츠 저장
  const handleSaveContent = useCallback(async () => {
    setIsSavingContent(true);
    try {
      // 데모: 로컬 상태만 업데이트
      setContent((prev) => ({
        ...prev,
        title,
        category_id: categoryId || null,
        secondary_category: secondaryCategory || null,
        target_keyword: targetKeyword || null,
        target_audience: (targetAudience as TargetAudience) || null,
        updated_at: new Date().toISOString(),
      }));
    } finally {
      setIsSavingContent(false);
    }
  }, [title, categoryId, secondaryCategory, targetKeyword, targetAudience]);

  // 브리핑 저장
  const handleSaveBriefing = useCallback(async () => {
    setIsSavingBriefing(true);
    try {
      // 데모: 로컬 상태만 업데이트
      console.log("브리핑 저장:", { briefingText, keyPoints });
    } finally {
      setIsSavingBriefing(false);
    }
  }, [briefingText, keyPoints]);

  // 상태 전이
  const handleTransition = useCallback(
    (transition: StateTransition) => {
      setPendingTransition(transition);
      setConfirmOpen(true);
    },
    []
  );

  const confirmTransition = useCallback(() => {
    if (!pendingTransition) return;
    setContent((prev) => ({
      ...prev,
      status: pendingTransition.to_status as ContentStatus,
      updated_at: new Date().toISOString(),
    }));
    setPendingTransition(null);
  }, [pendingTransition]);

  // SEO 체크 저장
  const handleSaveSeoCheck = useCallback(
    async (items: Record<string, { passed: boolean; note: string }>) => {
      const result = await saveSeoCheck(content.id, items);
      if (!result.success) {
        console.error("SEO 체크 저장 실패:", result.error);
      }
    },
    [content.id]
  );

  // 키포인트 변경
  const handleKeyPointChange = useCallback(
    (index: number, value: string) => {
      setKeyPoints((prev) => {
        const next = [...prev];
        next[index] = value;
        return next;
      });
    },
    []
  );

  const statusIndex = ["S0", "S1", "S2", "S3", "S4", "S5"].indexOf(
    content.status
  );

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <PageHeader
        title={content.title ?? "제목 없음"}
        description={`${CONTENT_STATES[content.status].label} | ${getCategoryName(content.category_id)}`}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/contents")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          목록
        </Button>
      </PageHeader>

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
                  <Label>카테고리</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger>
                      <SelectValue placeholder="카테고리 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>보조 카테고리</Label>
                  <Select
                    value={secondaryCategory}
                    onValueChange={setSecondaryCategory}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="보조 카테고리 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">없음</SelectItem>
                      {categories.map((cat) => (
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

          {/* 브리핑 섹션 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">브리핑</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="briefing-text">브리핑 내용</Label>
                <textarea
                  id="briefing-text"
                  className={cn(
                    "flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2",
                    "text-sm ring-offset-background placeholder:text-muted-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    "disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                  )}
                  value={briefingText}
                  onChange={(e) => setBriefingText(e.target.value)}
                  placeholder="브리핑 내용을 입력하세요..."
                />
              </div>

              <div className="space-y-2">
                <Label>핵심 포인트</Label>
                {keyPoints.map((point, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground w-6 text-center">
                      {index + 1}
                    </span>
                    <Input
                      value={point}
                      onChange={(e) =>
                        handleKeyPointChange(index, e.target.value)
                      }
                      placeholder={`핵심 포인트 ${index + 1}`}
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSaveBriefing}
                  disabled={isSavingBriefing}
                  size="sm"
                  variant="outline"
                >
                  <Save className="h-4 w-4 mr-1" />
                  {isSavingBriefing ? "저장 중..." : "브리핑 저장"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* SEO 체크리스트 (S1 이상) */}
          {statusIndex >= 1 && (
            <SeoChecklist
              contentId={content.id}
              initialItems={seoCheck?.items}
              onSave={handleSaveSeoCheck}
            />
          )}
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
                          <span className="truncate">{t.description}</span>
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
                value={`${content.revision_count}회`}
              />
              <InfoRow
                label="생성일"
                value={format(
                  new Date(content.created_at),
                  "yyyy.MM.dd HH:mm",
                  { locale: ko }
                )}
              />
              <InfoRow
                label="수정일"
                value={format(
                  new Date(content.updated_at),
                  "yyyy.MM.dd HH:mm",
                  { locale: ko }
                )}
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
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        <span>{label}</span>
      </div>
      <span className="font-medium">{value}</span>
    </div>
  );
}
