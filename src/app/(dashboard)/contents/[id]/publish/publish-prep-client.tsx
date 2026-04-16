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
  formatTagsForNaver,
  generateFormatGuide,
  enforceEmail,
  generateImageGuide,
} from "@/lib/utils/publish-helpers";
import { updateContentStatus } from "@/actions/contents";
import {
  determineDisclaimerLevel,
  getDisclaimerText,
  DISCLAIMER_LEVEL_LABELS,
  type DisclaimerLevel,
} from "@/lib/client-generate";
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

/**
 * 하드코딩 CTA 폴백 — cta_templates 테이블이 비어있을 때 사용.
 * key 는 categoryName 매칭에 사용 / text 는 실제 CTA 본문.
 */
const FALLBACK_CTA: Record<string, CtaTemplate> = {
  "현장수첩_절세": {
    key: "현장수첩_절세",
    categoryName: "현장 수첩 · 절세 시뮬레이션",
    text: `━━━━━━━━━━━━━━━━━━
"우리 회사도 가능할까?" 궁금하시다면 재무제표를 보내주세요.
48시간 안에 절세 시뮬레이션을 만들어 드립니다. (무료)

📞 02-571-6613
📧 admin@didimip.com (메일 제목에 '절세 시뮬레이션'이라고 적어주세요)

특허그룹 디딤 | 기업을 아는 변리사`,
    note: null,
    conversionMethod: "이메일",
    emailSubjectTag: "절세 시뮬레이션",
  },
  "현장수첩_인증": {
    key: "현장수첩_인증",
    categoryName: "현장 수첩 · 인증 가이드",
    text: `━━━━━━━━━━━━━━━━━━
우리 회사가 인증 요건에 해당하는지 5분이면 확인할 수 있습니다.

📞 02-571-6613
📧 admin@didimip.com (메일 제목에 '인증 진단'이라고 적어주세요)

특허그룹 디딤 | 기업을 아는 변리사`,
    note: null,
    conversionMethod: "이메일",
    emailSubjectTag: "인증 진단",
  },
  "현장수첩_연구소": {
    key: "현장수첩_연구소",
    categoryName: "현장 수첩 · 연구소 운영",
    text: `━━━━━━━━━━━━━━━━━━
연구소 운영 상태 점검, 무료 진단 가능합니다.

📞 02-571-6613
📧 admin@didimip.com (메일 제목에 '연구소 진단'이라고 적어주세요)

특허그룹 디딤 | 기업을 아는 변리사`,
    note: null,
    conversionMethod: "이메일",
    emailSubjectTag: "연구소 진단",
  },
  "IP라운지": {
    key: "IP라운지",
    categoryName: "IP 라운지",
    text: `━━━━━━━━━━━━━━━━━━
AI·IP 전략이 궁금하신 대표님, 편하게 연락 주세요.

📞 02-571-6613
📧 admin@didimip.com

특허그룹 디딤 | 기업을 아는 변리사`,
    note: null,
    conversionMethod: "이메일",
    emailSubjectTag: "상담 문의",
  },
};

/** CTA 매칭: 콘텐츠의 카테고리로 가장 적합한 CTA 선택 */
function matchCtaForContent(
  content: Content,
  categories: Category[],
  ctaTemplates: CtaTemplate[]
): CtaTemplate | null {
  // 디딤 다이어리: CTA 없음
  if (
    content.category_id === "CAT-C" ||
    content.category_id?.startsWith("CAT-C-")
  ) {
    return null;
  }

  const category = categories.find((c) => c.id === content.category_id);
  if (!category) return null;

  // cta_templates + fallback 합산 pool
  const pool: CtaTemplate[] = [
    ...ctaTemplates,
    ...Object.values(FALLBACK_CTA),
  ];
  // 중복 key 제거 (DB 우선)
  const deduped = new Map<string, CtaTemplate>();
  for (const t of pool) deduped.set(t.key, deduped.get(t.key) ?? t);
  const allTemplates = Array.from(deduped.values());

  // Step 1: secondary_category 기반 매칭
  if (content.secondary_category) {
    const secondaryCat = categories.find((c) => c.id === content.secondary_category);
    if (secondaryCat) {
      const secName = secondaryCat.name.toLowerCase();
      const match = allTemplates.find((t) => {
        const cn = t.categoryName.toLowerCase();
        // 2차 카테고리 이름의 처음 4자 포함 OR key에 포함
        return cn.includes(secName.substring(0, 4)) || t.key.includes(secName.substring(0, 3));
      });
      if (match) return match;
    }
  }

  // Step 2: primary category id 기반 매칭
  const catId = content.category_id ?? "";
  if (catId.startsWith("CAT-A")) {
    // 서브카테고리로 더 세분화
    const subId = content.secondary_category ?? catId;
    if (subId === "CAT-A-02") return allTemplates.find((t) => t.key.includes("인증")) ?? null;
    if (subId === "CAT-A-03") return allTemplates.find((t) => t.key.includes("연구소")) ?? null;
    // 기본: 절세
    return allTemplates.find((t) => t.key.includes("절세")) ?? null;
  }
  if (catId.startsWith("CAT-B")) {
    return allTemplates.find((t) => t.key.includes("IP라운지") || t.key.includes("IP 라운지")) ?? null;
  }

  // Step 3: 범용 폴백 — pool 첫 번째 (CAT-C 는 위에서 이미 null 반환)
  return allTemplates[0] ?? null;
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

  // Disclaimer 자동 매칭
  const autoDisclaimer = useMemo(
    () =>
      determineDisclaimerLevel({
        categoryId: effectiveCategoryId,
        body: content.body ?? "",
        isAiGenerated: content.is_ai_generated,
      }),
    [effectiveCategoryId, content.body, content.is_ai_generated]
  );
  const [disclaimerOverride, setDisclaimerOverride] = useState<DisclaimerLevel | null>(null);
  const activeDisclaimerLevel = disclaimerOverride ?? autoDisclaimer.level;
  const activeDisclaimerText = useMemo(
    () => getDisclaimerText(activeDisclaimerLevel, content.is_ai_generated),
    [activeDisclaimerLevel, content.is_ai_generated]
  );

  // CTA 매칭: 카테고리 기반 + 하드코딩 폴백
  const autoMatchedCta = useMemo(
    () => matchCtaForContent(content, categories, ctaTemplates),
    [content, categories, ctaTemplates]
  );

  // CTA 수동 선택 오버라이드
  const [ctaOverrideKey, setCtaOverrideKey] = useState<string | null>(null);

  // 전체 사용 가능한 CTA 목록 (DB + fallback, 중복 제거)
  const allCtaOptions = useMemo(() => {
    const map = new Map<string, CtaTemplate>();
    for (const t of ctaTemplates) map.set(t.key, t);
    for (const [k, v] of Object.entries(FALLBACK_CTA)) {
      if (!map.has(k)) map.set(k, v);
    }
    return Array.from(map.values());
  }, [ctaTemplates]);

  const matchedCta = useMemo(() => {
    if (ctaOverrideKey) {
      return allCtaOptions.find((t) => t.key === ctaOverrideKey) ?? autoMatchedCta;
    }
    return autoMatchedCta;
  }, [ctaOverrideKey, allCtaOptions, autoMatchedCta]);

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

  // 태그 텍스트 (네이버 #태그 형식, 100자 이내)
  const tagsText = useMemo(() => {
    if (!content.tags || content.tags.length === 0) return "";
    return formatTagsForNaver(content.tags);
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
        toast.error(error, { duration: 8000 });
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

      {/* S1/S2 미리보기 배너 */}
      {!["S3", "S4", "S5"].includes(content.status) && (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 flex items-center gap-2 text-sm text-orange-700">
          <span>⚠️</span>
          <span>
            <strong>미리보기 모드</strong> — 현재 상태가 {CONTENT_STATES[content.status]?.label ?? content.status}이므로
            본문/CTA/태그 확인 및 복사만 가능합니다. 발행 완료 처리는 S3(발행예정) 이상에서 활성화됩니다.
          </span>
        </div>
      )}

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

          {/* 면책조항(Disclaimer) 섹션 */}
          {activeDisclaimerLevel !== "none" && activeDisclaimerText && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    면책조항
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                        activeDisclaimerLevel === "A"
                          ? "bg-red-100 text-red-700"
                          : activeDisclaimerLevel === "B"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      Level {activeDisclaimerLevel}
                    </span>
                  </CardTitle>
                  <CopyButton
                    text={activeDisclaimerText}
                    label="면책조항 복사"
                    toastMessage="면책조항이 복사되었습니다"
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <pre className="whitespace-pre-wrap text-xs leading-relaxed bg-muted/50 rounded-lg p-3 font-sans text-muted-foreground">
                  {activeDisclaimerText}
                </pre>
                <div className="pt-2 border-t">
                  <label className="text-xs text-muted-foreground font-medium block mb-1">
                    면책조항 레벨 변경
                  </label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={activeDisclaimerLevel}
                    onChange={(e) => {
                      const val = e.target.value as DisclaimerLevel;
                      setDisclaimerOverride(val === autoDisclaimer.level ? null : val);
                    }}
                  >
                    {(["A", "B", "C", "none"] as DisclaimerLevel[]).map((lv) => (
                      <option key={lv} value={lv}>
                        Level {lv} — {DISCLAIMER_LEVEL_LABELS[lv]}
                        {lv === autoDisclaimer.level ? " (자동 선택)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>
          )}

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
                  <div className="flex items-center gap-2">
                    {ctaText && (
                      <CopyButton
                        text={ctaText}
                        label="CTA 복사"
                        toastMessage="CTA가 복사되었습니다"
                      />
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
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
                {/* CTA 변경 드롭다운 */}
                {allCtaOptions.length > 1 && (
                  <div className="pt-2 border-t">
                    <label className="text-xs text-muted-foreground font-medium block mb-1">
                      다른 CTA 템플릿 선택
                    </label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={ctaOverrideKey ?? matchedCta?.key ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCtaOverrideKey(val || null);
                      }}
                    >
                      {allCtaOptions.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.categoryName}
                        </option>
                      ))}
                    </select>
                  </div>
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
                    {content.tags.map((tag, i) => {
                      const cleaned = tag.replace(/\s/g, "").replace(/#/g, "");
                      const preview = formatTagsForNaver(content.tags!.slice(0, i + 1));
                      const isOverflow = preview.length > 100 && formatTagsForNaver(content.tags!.slice(0, i)).length <= 100;
                      const isExcluded = formatTagsForNaver(content.tags!.slice(0, i)).length >= 100;
                      return (
                        <span
                          key={i}
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            isExcluded ? "bg-gray-100 text-gray-400 line-through" :
                            isOverflow ? "bg-red-50 text-red-400" :
                            "bg-blue-50 text-blue-700"
                          }`}
                        >
                          #{cleaned}
                        </span>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 font-mono break-all">
                    {tagsText}
                  </p>
                  <p className={`text-xs mt-1 ${tagsText.length > 100 ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                    {tagsText.length}/100자 · {content.tags.length}개
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
