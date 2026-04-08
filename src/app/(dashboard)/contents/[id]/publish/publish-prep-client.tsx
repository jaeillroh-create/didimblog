"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { CopyButton } from "@/components/common/copy-button";
import {
  stripMarkdown,
  markdownToHtml,
  extractTablesAsTabSeparated,
  generateFormatGuide,
  enforceEmail,
  generateImageGuide,
} from "@/lib/utils/publish-helpers";
import { updateContentStatus } from "@/actions/contents";
import { CONTENT_STATES } from "@/lib/constants/content-states";
import type { Content, Category, ContentStatus } from "@/lib/types/database";
import type { CtaTemplate } from "@/actions/settings";
import {
  ArrowLeft,
  FileText,
  Hash,
  Image as ImageIcon,
  Megaphone,
  BookOpen,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

interface PublishPrepClientProps {
  content: Content;
  categories: Category[];
  ctaTemplates: CtaTemplate[];
}

// 발행 체크리스트 7항목
const PUBLISH_CHECKLIST = [
  { id: "title", label: "제목 복사 완료" },
  { id: "body", label: "본문 복사 & 붙여넣기 완료" },
  { id: "images", label: "이미지 삽입 완료 (ALT 텍스트 포함)" },
  { id: "cta", label: "CTA 복사 & 배치 완료" },
  { id: "tags", label: "태그 10개 입력 완료" },
  { id: "format", label: "네이버 에디터 포맷 적용 완료" },
  { id: "preview", label: "미리보기 확인 완료" },
];

export function PublishPrepClient({
  content,
  categories,
  ctaTemplates,
}: PublishPrepClientProps) {
  const router = useRouter();
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [isTransitioning, setIsTransitioning] = useState(false);

  // 카테고리 정보
  const category = categories.find((c) => c.id === content.category_id);
  const effectiveCategoryId =
    content.secondary_category || content.category_id || "";

  // CTA 매칭: 카테고리 기반으로 site_settings CTA 조회
  const matchedCta = useMemo(() => {
    if (!category) return null;

    // 디딤 다이어리: CTA 없음
    if (
      content.category_id === "CAT-C" ||
      content.category_id?.startsWith("CAT-C-")
    ) {
      return null;
    }

    // 1차: secondary_category로 매칭 시도
    if (content.secondary_category) {
      const secondaryCat = categories.find(
        (c) => c.id === content.secondary_category
      );
      if (secondaryCat) {
        const match = ctaTemplates.find((t) =>
          t.categoryName
            .toLowerCase()
            .includes(secondaryCat.name.toLowerCase().substring(0, 4))
        );
        if (match) return match;
      }
    }

    // 2차: primary category로 매칭
    const primaryMatch = ctaTemplates.find(
      (t) =>
        t.categoryName
          .toLowerCase()
          .includes(category.name.toLowerCase().substring(0, 4)) ||
        t.key.startsWith(
          content.category_id === "CAT-A"
            ? "현장수첩"
            : content.category_id === "CAT-B"
              ? "IP라운지"
              : ""
        )
    );
    return primaryMatch || null;
  }, [content, category, categories, ctaTemplates]);

  // CTA 텍스트 (이메일 강제 치환 적용)
  const ctaText = useMemo(() => {
    if (!matchedCta?.text) return null;
    return enforceEmail(matchedCta.text);
  }, [matchedCta]);

  // 본문 → 네이버용 텍스트 + HTML
  const strippedBody = useMemo(
    () => stripMarkdown(content.body ?? ""),
    [content.body]
  );
  const htmlBody = useMemo(
    () => markdownToHtml(content.body ?? ""),
    [content.body]
  );

  // 리치 텍스트(HTML) 클립보드 복사
  const copyRichText = useCallback(async () => {
    try {
      const htmlBlob = new Blob([htmlBody], { type: "text/html" });
      const textBlob = new Blob([strippedBody], { type: "text/plain" });
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": htmlBlob,
          "text/plain": textBlob,
        }),
      ]);
      toast.success("서식 포함 복사 완료");
    } catch {
      await navigator.clipboard.writeText(strippedBody);
      toast.success("텍스트 복사 완료 (서식 미지원 브라우저)");
    }
  }, [htmlBody, strippedBody]);

  // 표 데이터 (탭 구분)
  const tableTsvs = useMemo(
    () => extractTablesAsTabSeparated(content.body ?? ""),
    [content.body]
  );

  // 포맷 가이드
  const formatGuide = useMemo(
    () => generateFormatGuide(effectiveCategoryId),
    [effectiveCategoryId]
  );

  // 이미지 가이드
  const imageMarkers = useMemo(
    () => generateImageGuide(content.body ?? ""),
    [content.body]
  );

  // 태그 텍스트 (콤마 구분)
  const tagsText = useMemo(() => {
    if (!content.tags || content.tags.length === 0) return "";
    return content.tags.join(", ");
  }, [content.tags]);

  // ALT 텍스트 (이미지 마커 기반)
  const altTexts = useMemo(() => {
    return imageMarkers.map((m) => m.description);
  }, [imageMarkers]);

  // 체크리스트 핸들러
  const handleCheckToggle = useCallback((id: string, checked: boolean) => {
    setChecklist((prev) => ({ ...prev, [id]: checked }));
  }, []);

  const allChecked = PUBLISH_CHECKLIST.every(
    (item) => checklist[item.id] === true
  );

  // "발행 완료" 상태 전이 (S3→S4)
  const handlePublishComplete = useCallback(async () => {
    if (!allChecked) {
      toast.error("모든 체크리스트를 완료해주세요");
      return;
    }
    setIsTransitioning(true);
    try {
      const newStatus: ContentStatus = "S4";
      const { error } = await updateContentStatus(content.id, newStatus);
      if (error) {
        toast.error("상태 변경에 실패했습니다");
        return;
      }
      toast.success(
        `발행 완료! 상태: ${CONTENT_STATES[newStatus]?.label ?? newStatus}`
      );
      router.push(`/contents/${content.id}`);
    } catch {
      toast.error("상태 변경에 실패했습니다");
    } finally {
      setIsTransitioning(false);
    }
  }, [allChecked, content.id, router]);

  const isDiary =
    content.category_id === "CAT-C" ||
    content.category_id?.startsWith("CAT-C-");

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <PageHeader
        title="네이버 발행 준비"
        description={`${content.title ?? "제목 없음"} | ${CONTENT_STATES[content.status]?.label ?? content.status}`}
      >
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/contents/${content.id}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            상세로 돌아가기
          </Button>
          <StatusBadge status={content.status} />
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 왼쪽 메인 (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* 제목 섹션 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  제목
                </CardTitle>
                <CopyButton
                  text={content.title ?? ""}
                  label="제목 복사"
                  toastMessage="제목이 복사되었습니다"
                />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">
                {content.title ?? "제목 없음"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {(content.title ?? "").length}자
              </p>
            </CardContent>
          </Card>

          {/* 본문 섹션 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  본문
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={copyRichText}>
                    서식 포함 복사
                  </Button>
                  <CopyButton
                    text={strippedBody}
                    label="텍스트만 복사"
                    toastMessage="본문이 복사되었습니다 (텍스트만)"
                    variant="ghost"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap text-sm leading-relaxed bg-muted/50 rounded-lg p-4 max-h-[500px] overflow-y-auto font-sans">
                {strippedBody || "본문이 없습니다"}
              </pre>
              <p className="text-xs text-muted-foreground mt-2">
                {strippedBody.length.toLocaleString()}자
              </p>
              {tableTsvs.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <CopyButton
                    text={tableTsvs.join("\n\n")}
                    label={`표 데이터 복사 (${tableTsvs.length}개)`}
                    toastMessage="표 데이터가 복사되었습니다. 네이버 에디터에서 표 삽입 후 붙여넣기하세요."
                    variant="outline"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    네이버 에디터에서 표 삽입 후 붙여넣기하세요
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* CTA 섹션 (디딤 다이어리 제외) */}
          {!isDiary && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Megaphone className="h-4 w-4" />
                    CTA
                    {matchedCta && (
                      <span className="text-xs font-normal text-muted-foreground">
                        ({matchedCta.categoryName})
                      </span>
                    )}
                  </CardTitle>
                  {ctaText && (
                    <CopyButton
                      text={ctaText}
                      label="CTA 복사"
                      toastMessage="CTA가 복사되었습니다"
                    />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {ctaText ? (
                  <pre className="whitespace-pre-wrap text-sm bg-muted/50 rounded-lg p-4 font-sans">
                    {ctaText}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    이 카테고리에 매칭되는 CTA 템플릿이 없습니다.
                  </p>
                )}
                {matchedCta?.note && (
                  <p className="text-xs text-orange-600 mt-2">
                    참고: {matchedCta.note}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {isDiary && (
            <Card className="border-orange-200 bg-orange-50/50">
              <CardContent className="py-4">
                <p className="text-sm text-orange-700 font-medium">
                  디딤 다이어리는 CTA를 넣지 않습니다. 상업적 CTA가 진정성을
                  훼손할 수 있습니다.
                </p>
              </CardContent>
            </Card>
          )}

          {/* 태그 섹션 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  태그
                </CardTitle>
                <CopyButton
                  text={tagsText}
                  label="태그 복사"
                  toastMessage="태그가 복사되었습니다"
                />
              </div>
            </CardHeader>
            <CardContent>
              {content.tags && content.tags.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {content.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {content.tags.length}/10개
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  태그가 없습니다. 콘텐츠 상세에서 추가해주세요.
                </p>
              )}
            </CardContent>
          </Card>

          {/* 이미지 가이드 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                이미지 가이드
              </CardTitle>
            </CardHeader>
            <CardContent>
              {imageMarkers.length > 0 ? (
                <div className="space-y-2">
                  {imageMarkers.map((marker, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 px-3 py-2 bg-muted/50 rounded-lg"
                    >
                      <span className="text-xs font-bold text-muted-foreground bg-background rounded px-1.5 py-0.5 mt-0.5">
                        #{marker.position}
                      </span>
                      <div>
                        <p className="text-sm">{marker.description}</p>
                        {altTexts[i] && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            ALT: {altTexts[i]}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="mt-3">
                    <CopyButton
                      text={altTexts.join("\n")}
                      label="ALT 텍스트 전체 복사"
                      toastMessage="ALT 텍스트가 복사되었습니다"
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  본문에 [IMAGE: 설명] 마커가 없습니다.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 오른쪽 사이드바 (1/3) */}
        <div className="space-y-6">
          {/* 포맷 가이드 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  포맷 가이드
                </CardTitle>
                <CopyButton
                  text={formatGuide}
                  label="복사"
                  toastMessage="포맷 가이드가 복사되었습니다"
                />
              </div>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap text-xs leading-relaxed bg-muted/50 rounded-lg p-3 font-sans">
                {formatGuide}
              </pre>
            </CardContent>
          </Card>

          {/* 발행 체크리스트 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                발행 체크리스트
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {PUBLISH_CHECKLIST.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <Checkbox
                    id={`check-${item.id}`}
                    checked={checklist[item.id] ?? false}
                    onCheckedChange={(checked) =>
                      handleCheckToggle(item.id, checked === true)
                    }
                  />
                  <label
                    htmlFor={`check-${item.id}`}
                    className="text-sm cursor-pointer select-none"
                  >
                    {item.label}
                  </label>
                </div>
              ))}

              <Separator />

              <p className="text-xs text-muted-foreground">
                {Object.values(checklist).filter(Boolean).length}/
                {PUBLISH_CHECKLIST.length} 완료
              </p>

              {/* S3+ 일 때만 발행 완료 버튼 */}
              {["S3", "S4", "S5"].includes(content.status) && (
                <Button
                  className="w-full"
                  disabled={!allChecked || isTransitioning}
                  onClick={handlePublishComplete}
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  {isTransitioning ? "처리 중..." : "발행 완료 (S3→S4)"}
                </Button>
              )}

              {!["S3", "S4", "S5"].includes(content.status) && (
                <p className="text-xs text-orange-600">
                  발행 완료 전환은 S3(발행예정) 이상에서만 가능합니다.
                </p>
              )}
            </CardContent>
          </Card>

          {/* 콘텐츠 정보 요약 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">콘텐츠 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">카테고리</span>
                <span className="font-medium">
                  {category?.name ?? "-"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">타겟 키워드</span>
                <span className="font-medium">
                  {content.target_keyword ?? "-"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">발행예정일</span>
                <span className="font-medium">
                  {content.publish_date ?? "-"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">본문 글자수</span>
                <span className="font-medium">
                  {(content.body ?? "").length.toLocaleString()}자
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
