# 대표 검수(승인·수정요청·리셋)와 자동 전이 원문

> 원본 그대로. 커밋 47cc218 "파이프라인 완료 시 자동 마무리 + 검수 후 연쇄 전이" 반영본.

## 목차
1. 검수 체크리스트·승인 연쇄 전이·수정요청·리셋 UI — review-panel.tsx
2. 서버 액션 approveReview / requestRevision / resetReviewStatus — contents.ts
3. 검수 컬럼 마이그레이션 — 012 / 014
4. AI 초안 저장 시 S1 자동 전이 — actions/ai.ts saveAiDraftToContent
5. Phase 3 완료 후 자동 마무리(Finalization) — ai-editor-client.tsx
6. 커밋 47cc218 메시지(전이 조건 재정의 요약)

## 1. review-panel.tsx — src/components/contents/review-panel.tsx:39-173

```tsx
const REVIEW_CHECKLIST = [
  { id: "numbers", label: "숫자/금액이 정확한가?" },
  { id: "law", label: "법률 조항 번호가 맞는가?" },
  { id: "cases", label: "고객 사례가 사실에 기반하는가?" },
  { id: "tone", label: "톤이 카테고리에 적합한가?" },
  { id: "privacy", label: "공개해도 되는 내용인가?" },
];

export function ReviewPanel({
  content,
  profiles,
  onContentUpdated,
}: ReviewPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false);
  const [revisionMemo, setRevisionMemo] = useState("");

  const reviewStatus = content.review_status ?? "pending";
  const reviewerName = useMemo(() => {
    if (!content.reviewer_id) return null;
    const p = profiles.find((pr) => pr.id === content.reviewer_id);
    return p?.name ?? "알 수 없음";
  }, [content.reviewer_id, profiles]);

  const reviewedAtFormatted = useMemo(() => {
    if (!content.review_done_at) return null;
    return format(new Date(content.review_done_at), "M/d HH:mm", { locale: ko });
  }, [content.review_done_at]);

  const checkedCount = checked.size;
  const canApprove = checkedCount >= 3;

  function toggleCheck(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleApprove() {
    if (!canApprove) {
      toast.error("최소 3개 항목을 체크해야 승인할 수 있습니다.");
      return;
    }
    startTransition(async () => {
      const res = await approveReview({
        contentId: content.id,
        checkedItems: Array.from(checked),
      });
      if (res.error || !res.data) {
        toast.error(res.error ?? "검수 승인 실패");
        return;
      }

      let latest = res.data;
      toast.success("검수 승인 완료");

      // ── 연쇄 자동 전이: S1→S2 ──
      if (latest.status === "S1") {
        const body = latest.body ?? "";
        const bodyLen = body.replace(/\s/g, "").length;
        const tagCount = latest.tags?.length ?? 0;
        const hasCta = body.includes("━━") || body.includes("admin@didimip");
        const isDiary = latest.category_id?.startsWith("CAT-C") ?? false;

        if (bodyLen >= 500 && tagCount >= 10 && (isDiary || hasCta)) {
          const s2Res = await updateContentStatusWithMeta({
            contentId: content.id,
            newStatus: "S2",
          });
          if (s2Res.data) {
            latest = s2Res.data;
            toast.success("→ 검토완료(S2) 자동 전이");
          }
        }
      }

      // ── 연쇄 자동 전이: S2→S3 ──
      if (latest.status === "S2") {
        const hasDate = !!(latest.publish_date || latest.publish_due);
        if (hasDate) {
          const s3Res = await updateContentStatusWithMeta({
            contentId: content.id,
            newStatus: "S3",
          });
          if (s3Res.data) {
            latest = s3Res.data;
            toast.success("→ 발행예정(S3) 자동 전이");
          }
        }
      }

      onContentUpdated(latest);
    });
  }

  function handleRevisionRequest() {
    if (!revisionMemo.trim()) {
      toast.error("수정 사항을 입력해주세요.");
      return;
    }
    setRevisionDialogOpen(false);
    startTransition(async () => {
      const res = await requestRevision({
        contentId: content.id,
        memo: revisionMemo.trim(),
      });
      if (res.error || !res.data) {
        toast.error(res.error ?? "수정 요청 실패");
        return;
      }
      onContentUpdated(res.data);
      setRevisionMemo("");
      toast.success("수정 요청이 등록되었습니다.");
    });
  }

  function handleResetReview() {
    startTransition(async () => {
      const res = await resetReviewStatus(content.id);
      if (res.error || !res.data) {
        toast.error(res.error ?? "검수 초기화 실패");
        return;
      }
      onContentUpdated(res.data);
      setChecked(new Set());
      toast.success("검수 상태가 초기화되었습니다. 다시 검수를 요청하세요.");
    });
  }

  // S1(초안완료)일 때만 검수 패널 표시
  if (content.status !== "S1") return null;
```

## 2. 서버 액션 — src/actions/contents.ts:659-799

```ts
// ── 대표 검수 ──

export interface ReviewApproveInput {
  contentId: string;
  checkedItems: string[];
}

/**
 * 대표 검수 승인.
 *
 * 기록:
 *   - review_status = 'approved'
 *   - reviewer_id = 현재 인증 사용자 id
 *   - review_done_at = now()
 *   - review_memo = 체크 항목 기록
 *
 * ⚠️ review_status / review_memo 컬럼이 DB 에 없으면 Supabase 가 42703 에러를 반환.
 *    그 경우 012_review_columns.sql 마이그레이션을 Supabase SQL Editor 에서 수동 실행해야 함.
 */
export async function approveReview(
  input: ReviewApproveInput
): Promise<{ data: Content | null; error: string | null }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        data: null,
        error: `검수 승인 실패: 인증 오류 — ${authError?.message ?? "세션 없음"}. 다시 로그인 해주세요.`,
      };
    }

    const { data, error } = await supabase
      .from("contents")
      .update({
        review_status: "approved" as ReviewStatus,
        reviewer_id: user.id,
        review_done_at: new Date().toISOString(),
        review_memo: `[검수 승인] 체크: ${input.checkedItems.join(", ")}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.contentId)
      .select()
      .single();

    if (error) {
      console.error("[approveReview] Supabase 에러:", JSON.stringify(error));
      return { data: null, error: formatSupabaseError(error, "검수 승인 실패") };
    }
    return { data: data as Content, error: null };
  } catch (err) {
    console.error("[approveReview] 예외:", err);
    return { data: null, error: formatSupabaseError(err, "검수 승인 실패") };
  }
}

export interface RevisionRequestInput {
  contentId: string;
  memo: string;
}

/** 대표 수정 요청 — review_status='revision_requested', revision_count++ */
export async function requestRevision(
  input: RevisionRequestInput
): Promise<{ data: Content | null; error: string | null }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        data: null,
        error: `수정 요청 실패: 인증 오류 — ${authError?.message ?? "세션 없음"}`,
      };
    }

    // 기존 revision_count 조회
    const { data: existing } = await supabase
      .from("contents")
      .select("revision_count")
      .eq("id", input.contentId)
      .single();

    const { data, error } = await supabase
      .from("contents")
      .update({
        review_status: "revision_requested" as ReviewStatus,
        reviewer_id: user.id,
        review_memo: input.memo,
        revision_count: (existing?.revision_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.contentId)
      .select()
      .single();

    if (error) {
      console.error("[requestRevision] Supabase 에러:", JSON.stringify(error));
      return { data: null, error: formatSupabaseError(error, "수정 요청 실패") };
    }
    return { data: data as Content, error: null };
  } catch (err) {
    console.error("[requestRevision] 예외:", err);
    return { data: null, error: formatSupabaseError(err, "수정 요청 실패") };
  }
}

/** 검수 상태 초기화 (수정 완료 후 재검수 요청) */
export async function resetReviewStatus(
  contentId: string
): Promise<{ data: Content | null; error: string | null }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("contents")
      .update({
        review_status: "pending" as ReviewStatus,
        review_memo: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contentId)
      .select()
      .single();

    if (error) {
      console.error("[resetReviewStatus] Supabase 에러:", JSON.stringify(error));
      return { data: null, error: formatSupabaseError(error, "검수 상태 초기화 실패") };
    }
    return { data: data as Content, error: null };
  } catch (err) {
    console.error("[resetReviewStatus] 예외:", err);
    return { data: null, error: formatSupabaseError(err, "검수 상태 초기화 실패") };
  }
}
```

## 3. 검수 컬럼 — supabase/migrations/012_review_columns.sql 전체, 014:57-73

```sql
-- 012: 대표 검수 컬럼 추가
-- review_status: pending(미검수) / approved(승인) / revision_requested(수정요청)
-- review_memo: 수정 요청 시 메모
--
-- ⚠️ 이 마이그레이션이 적용되지 않으면 검수 승인 시 42703 에러 발생:
--    "column review_status of relation contents does not exist"
--    Supabase SQL Editor 에서 이 파일 전체를 수동 실행하세요.

-- review_status (CHECK 제약 포함)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contents' AND column_name = 'review_status'
  ) THEN
    ALTER TABLE contents ADD COLUMN review_status text DEFAULT 'pending';
    ALTER TABLE contents ADD CONSTRAINT contents_review_status_check
      CHECK (review_status IN ('pending', 'approved', 'revision_requested'));
  END IF;
END $$;

-- review_memo
ALTER TABLE contents ADD COLUMN IF NOT EXISTS review_memo text;
```

```sql
-- ── 5) 누락될 수 있는 컬럼 재확인 ──
ALTER TABLE contents ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'pending';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS review_memo text;

-- review_status CHECK 제약 (이미 있으면 무시)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'contents_review_status_check'
  ) THEN
    ALTER TABLE contents ADD CONSTRAINT contents_review_status_check
      CHECK (review_status IN ('pending', 'approved', 'revision_requested'));
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
```

## 4. AI 초안 저장 → S1 — src/actions/ai.ts:710-809

```ts
export async function saveAiDraftToContent(
  generationId: number,
  overrides?: {
    title?: string;
    body?: string;
    tags?: string[];
    keyword?: string;
  }
): Promise<{ success: boolean; contentId?: string; error?: string }> {
  try {
    const supabase = await createClient();

    // 1. generation 레코드 조회
    const { data: gen, error: genError } = await supabase
      .from("ai_generations")
      .select("*")
      .eq("id", generationId)
      .single();

    if (genError || !gen) {
      return { success: false, error: "생성 이력을 찾을 수 없습니다." };
    }

    const title = overrides?.title || gen.generated_title || gen.topic;
    const body = overrides?.body || gen.generated_text || "";
    const tags = overrides?.tags || gen.generated_tags || [];
    const keyword = overrides?.keyword || gen.target_keyword || "";

    let contentId = gen.content_id;

    if (contentId) {
      // 2a. 기존 콘텐츠 업데이트
      const { error } = await supabase
        .from("contents")
        .update({
          title,
          body,
          tags,
          target_keyword: keyword || undefined,
          status: "S1",
          draft_done_at: new Date().toISOString(),
          ai_generation_id: generationId,
          is_ai_generated: true,
        })
        .eq("id", contentId);

      if (error) {
        return { success: false, error: `콘텐츠 업데이트 실패: ${error.message}` };
      }
    } else {
      // 2b. 새 콘텐츠 생성
      const { createContent } = await import("@/actions/contents");
      const { data: newContent, error: createError } = await createContent({
        title,
        category_id: gen.category_id || "CAT-A",
        target_keyword: keyword || undefined,
      });

      if (createError || !newContent) {
        return { success: false, error: createError || "콘텐츠 생성 실패" };
      }

      contentId = newContent.id;

      // body, tags, status 업데이트 (createContent는 S0으로 생성하므로)
      const { error: updateError } = await supabase
        .from("contents")
        .update({
          body,
          tags,
          status: "S1",
          draft_done_at: new Date().toISOString(),
          ai_generation_id: generationId,
          is_ai_generated: true,
        })
        .eq("id", contentId);

      if (updateError) {
        console.error("[saveAiDraftToContent] 콘텐츠 업데이트 실패:", JSON.stringify(updateError));
        return { success: false, error: `콘텐츠 업데이트 실패: (${updateError.code}) ${updateError.message}` };
      }

      // generation에 content_id 연결
      const { error: linkError } = await supabase
        .from("ai_generations")
        .update({ content_id: contentId })
        .eq("id", generationId);

      if (linkError) {
        console.warn("[saveAiDraftToContent] generation 연결 실패:", linkError.message);
        // 콘텐츠 자체는 저장되었으므로 경고만
      }
    }

    return { success: true, contentId };
  } catch (err) {
    console.error("[saveAiDraftToContent] 예외:", err);
    const msg = err instanceof Error ? err.message : "저장 실패";
    return { success: false, error: msg };
  }
```

## 5. Phase 3 자동 마무리 — src/app/(dashboard)/contents/ai-editor/[id]/ai-editor-client.tsx:1014-1062

주의: 주석은 '기존에 없으면 다음 화요일 자동 배정'이지만 코드는 publish_date 를 **항상** 다음 화요일로 덮어쓴다. SLA 마감일(briefing_due 등)은 다시 계산하지 않는다.

```ts
      // ── 마무리 단계 (Finalization) — contents 테이블 자동 업데이트 ──
      console.log("[Finalization] 시작 — 본문/태그/발행일/SEO 자동 저장");
      const finalizationErrors: string[] = [];

      try {
        // 문단 ID 제거한 본문 저장
        const bodyForDb = stripParagraphIds(finalBody);

        // SEO 점수 재계산 (로컬 calculateSeoScore 사용)
        const seoCalc = calculateSeoScore(editTitle, bodyForDb, targetKeyword);
        const seoScore = seoCalc.score;

        // 발행예정일 — 기존에 없으면 다음 화요일 자동 배정
        const { getNextTuesday } = await import("@/lib/utils/date-helpers");
        const nextTue = getNextTuesday().toISOString().slice(0, 10);

        const saveResult = await saveAiDraftToContent(
          currentGenerationId,
          {
            title: editTitle,
            body: bodyForDb,
            tags: autoTags,
            keyword: targetKeyword || undefined,
          }
        );

        if (!saveResult.success || !saveResult.contentId) {
          finalizationErrors.push(`본문 저장: ${saveResult.error ?? "알 수 없는 오류"}`);
          console.error("[Finalization] 본문 저장 실패:", saveResult.error);
        } else {
          // 추가 필드 업데이트 (SEO, 발행일)
          const { updateContent: updateFn } = await import("@/actions/contents");
          const { error: updateErr } = await updateFn(saveResult.contentId, {
            seo_score: seoScore,
            publish_date: nextTue,
          });
          if (updateErr) {
            finalizationErrors.push(`SEO/발행일: ${updateErr}`);
          }
          console.log("[Finalization] 완료 — 본문:", bodyForDb.length, "자, SEO:", seoScore, "점, 발행일:", nextTue);
        }
      } catch (finErr) {
        const msg = finErr instanceof Error ? finErr.message : "마무리 단계 실패";
        finalizationErrors.push(msg);
        console.error("[Finalization] 예외:", finErr);
      }

      if (finalizationErrors.length > 0) {
        toast.error(`자동 처리 일부 실패: ${finalizationErrors.join("; ")}`, { duration: 8000 });
```

## 6. 커밋 47cc218 메시지 발췌

```text
feat(pipeline): 파이프라인 완료 시 자동 마무리 + 검수 후 연쇄 전이

## 전이 조건 재정의 (required vs recommended)

S1→S2 (초안완료 → 검토완료):
필수: 본문 500자+, 태그 10개, CTA 존재(다이어리 제외), 대표 검수 승인
권장(미충족 시 경고만): SEO 70+, 교차검증 완료, 이미지 3개+

S2→S3 (검토완료 → 발행예정):
필수: 발행예정일 설정
권장: 이미지 준비

UI 변경:
- 필수 미충족: ❌ 빨간 아이콘 + 전이 차단
- 권장 미충족: ⚠️ 주황 아이콘 + 전이 허용 + 안내 토스트

## Phase 3 완료 시 자동 마무리 (Finalization)

Phase 3 완료 후 contents 테이블에 자동 저장:
- body: 문단 ID 제거 후 최종 본문
- tags: 자동 생성 10개
- publish_date: 다음 화요일 자동 배정
- seo_score: 재계산 후 저장

기존 동작: Phase 3 후 ai_generations 만 업데이트, 사용자가 "저장" 클릭해야
contents 반영됨 → 저장 안 하면 본문이 비어있는 상태로 남음

## 검수 승인 후 연쇄 자동 전이

대표가 "검수 승인" 1번 클릭하면:
1) review_status = 'approved' 저장
2) S1→S2 자동 전이 (필수 조건 충족 시)
3) S2→S3 자동 전이 (발행일 있으면)

결과: 검수 승인 1번으로 기획중 → 초안완료 → 검토완료 → 발행예정까지 자동.
사람이 할 일: 검수 승인 + 이미지 준비 + 네이버 발행.

https://claude.ai/code/session_01GUuVjkf1FPZ5oVtvMjto7p

```
