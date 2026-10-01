# 상태 전이 규칙 원문 (S0~S5)

> 원본 코드·SQL·명세를 **그대로** 옮긴 참조. 해석은 SKILL.md 와 docs/skills-spec/didim-blog-ops.md 참조.
> 각 블록 제목의 `파일:행` 은 레포 기준(커밋 f0ac302).

## 목차
1. 상태 정의 — src/lib/constants/content-states.ts
2. 전이 규칙 시드 — supabase/seed.sql (= SPEC.md §3.2)
3. SPEC.md §5.1 전이 조건 표
4. docs/UPGRADE_SPEC.md §1.1 콘텐츠 상태 (고도화 명세)
5. validateTransition — src/actions/contents.ts
6. 상세 패널 조건 체크(필수/권장) — status-transition-panel.tsx buildChecks
7. 상세 패널 전이 핸들러(권장 확인·강제 전환·발행·성과·역행)
8. 상태별 자동 기록 필드·notes 메타 — updateContentStatusWithMeta
9. 칸반 드래그 전이 — kanban-board.tsx onDragEnd
10. 발행 전 미완료 항목 배너 — content-detail-client.tsx
11. 전이 이력 테이블 — supabase/migrations/014
12. conditions 키 해석표 (코드 근거 요약)

---

## 1. 상태 정의 — src/lib/constants/content-states.ts:1-22

```ts
import { colors } from "./design-tokens";

// S0~S5 콘텐츠 상태 정의 — 디자인 토큰 참조
export const CONTENT_STATES = {
  S0: { label: "기획중", color: colors.status.s0 },
  S1: { label: "초안완료", color: colors.status.s1 },
  S2: { label: "검토완료", color: colors.status.s2 },
  S3: { label: "발행예정", color: colors.status.s3 },
  S4: { label: "발행완료", color: colors.status.s4 },
  S5: { label: "성과측정", color: colors.status.s5 },
} as const;

export type ContentStatus = keyof typeof CONTENT_STATES;

export const CONTENT_STATUS_OPTIONS: ContentStatus[] = [
  "S0",
  "S1",
  "S2",
  "S3",
  "S4",
  "S5",
];
```

## 2. 전이 규칙 시드 — supabase/seed.sql:18-26

014 마이그레이션은 이 행들을 **수정하지 않는다**(전이 이력 테이블만 추가). 커밋 abe96ec(전이 조건 완화)·47cc218(연쇄 전이)도 SQL 을 바꾸지 않고 UI 코드만 바꿨다. 레포에 다른 state_transitions 수정 SQL 은 없다(설정 화면에서 admin 이 편집 가능 — 실DB 값은 확인 필요).

```sql
-- 콘텐츠 상태 전이 규칙
insert into public.state_transitions (entity_type, from_status, to_status, conditions, auto_checks, description, is_reversible) values
('content', 'S0', 'S1', '{"briefing_done": true}', '{"briefing_exists"}', '기획→초안: 브리핑 완료 필요', false),
('content', 'S1', 'S2', '{"review_done": true, "seo_required_pass": true}', '{"seo_required_check", "fact_check_done"}', '초안→검토: 팩트체크+SEO필수 통과', true),
('content', 'S2', 'S3', '{"image_done": true, "final_edit_done": true}', '{"image_uploaded", "publish_date_set"}', '검토→발행예정: 이미지+최종편집 완료', false),
('content', 'S3', 'S4', '{"scheduled_time_reached": true}', '{}', '발행예정→발행완료: 예약 시간 도래 (자동)', false),
('content', 'S4', 'S5', '{"quality_measured": true}', '{"quality_score_calculated"}', '발행→성과측정: 품질점수 입력 완료', false),
('content', 'S1', 'S0', '{"major_revision": true}', '{}', '초안→기획: 전면 변경 시 역행', true),
('content', 'S2', 'S1', '{"minor_revision": true, "revision_count_lt_3": true}', '{}', '검토→초안: 수정 필요 시 역행 (최대2회)', true);
```

## 3. SPEC.md §5.1 — SPEC.md:480-490

```markdown
### 5.1 콘텐츠 상태 전이 규칙 (S0~S5)

| 전이 | 조건 | 자동 검증 |
|------|------|-----------|
| S0→S1 | 브리핑 완료 | briefings 테이블에 레코드 존재 |
| S1→S2 | 팩트체크 완료 + SEO 필수 10항목 통과 | seo_checks.verdict = 'pass' |
| S2→S3 | 이미지 완료 + 최종 편집 완료 | image_done_at not null + publish_date 설정됨 |
| S3→S4 | 예약 시간 도래 (자동) | 현재시간 >= publish_date |
| S4→S5 | 품질점수 입력 완료 | quality_score_final not null |
| S1→S0 | 전면 변경 (역행) | revision_count < 3 |
| S2→S1 | 수정 필요 (역행) | revision_count < 3, revision_count++ |
```

## 4. docs/UPGRADE_SPEC.md §1.1 — docs/UPGRADE_SPEC.md:24-42

```markdown
## 1. 상태 전이 규칙

### 1.1 콘텐츠 상태

```
기획중(PLANNING) → 초안완료(DRAFTED) → 검토완료(REVIEWED) → 발행예정(SCHEDULED) → 발행완료(PUBLISHED)
```

허용 전이:
- PLANNING → DRAFTED (AI 초안 생성 완료 시 자동 전이, 또는 수동)
- DRAFTED → REVIEWED (대표 검수 완료 표시)
- REVIEWED → SCHEDULED (예약 시간 설정 완료)
- SCHEDULED → PUBLISHED (네이버 발행 완료 확인)
- **역방향 전이 허용:** DRAFTED → PLANNING, REVIEWED → DRAFTED, SCHEDULED → REVIEWED (수정 필요 시)
- **삭제:** 모든 상태에서 가능. PUBLISHED 삭제 시 경고: "네이버 블로그에서도 별도로 삭제해야 합니다."

불가:
- PLANNING → SCHEDULED/PUBLISHED (중간 단계 건너뛰기 금지)
- PUBLISHED → 다른 상태로 변경 금지 (발행 취소는 삭제로만)
```

## 5. validateTransition — src/actions/contents.ts:236-304

```ts
// ── 상태 전이 검증 ──

export async function validateTransition(
  contentId: string,
  fromStatus: ContentStatus,
  toStatus: ContentStatus
): Promise<{
  valid: boolean;
  failedConditions: string[];
  transition: StateTransition | null;
}> {
  try {
    const { data: transitions } = await getStateTransitions();

    // 해당 전이 규칙 찾기
    const transition = transitions.find(
      (t) => t.from_status === fromStatus && t.to_status === toStatus
    );

    if (!transition) {
      return {
        valid: false,
        failedConditions: [`${fromStatus}에서 ${toStatus}로의 전이는 허용되지 않습니다.`],
        transition: null,
      };
    }

    const failedConditions: string[] = [];
    const conditions = transition.conditions ?? {};

    const supabase = await createClient();
    const { data: content } = await supabase
      .from("contents")
      .select("*")
      .eq("id", contentId)
      .single();

    if (content) {
      if (conditions.ai_generation_done && !content.ai_generation_id) {
        failedConditions.push("AI 초안 생성이 완료되지 않았습니다.");
      }
      if (conditions.review_done && !content.review_done_at) {
        failedConditions.push("검토가 완료되지 않았습니다.");
      }
      if (conditions.image_done && !content.image_done_at) {
        failedConditions.push("이미지가 준비되지 않았습니다.");
      }
      if (conditions.revision_count_lt_3 && content.revision_count >= 3) {
        failedConditions.push("수정 횟수가 최대치(2회)를 초과했습니다.");
      }
      if (conditions.quality_measured && !content.quality_score_final) {
        failedConditions.push("품질 점수가 입력되지 않았습니다.");
      }
    }

    return {
      valid: failedConditions.length === 0,
      failedConditions,
      transition,
    };
  } catch (err) {
    console.error("[validateTransition] 에러:", err);
    return {
      valid: false,
      failedConditions: ["전이 검증 중 오류가 발생했습니다."],
      transition: null,
    };
  }
}
```

## 6. buildChecks / findForwardTransition / findReverseTransitions — src/components/contents/status-transition-panel.tsx:51-226

```ts
interface ConditionCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  scrollTarget?: string;
  /** required=true: 미충족 시 전이 차단. false: 경고만 표시 */
  required: boolean;
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
        id: "body-500",
        label: "본문 500자 이상",
        passed: bodyCharCount >= 500,
        detail: `${bodyCharCount.toLocaleString()}자`,
        scrollTarget: "body-editor",
        required: true,
      },
      {
        id: "tags-10",
        label: "태그 10개",
        passed: tagCount >= 10,
        detail: `현재 ${tagCount}개`,
        scrollTarget: "tags-input",
        required: true,
      },
      {
        id: "cta-exists",
        label: isDiary ? "CTA 불필요 (다이어리)" : "CTA 블록 존재",
        passed: isDiary || body.includes("━━") || body.includes("roh@didimip"),
        detail: isDiary ? "면제" : (body.includes("━━") ? "있음" : "없음"),
        scrollTarget: "body-editor",
        required: !isDiary,
      },
      {
        id: "review-approved",
        label: "대표 검수 승인",
        passed: content.review_status === "approved",
        detail:
          content.review_status === "approved"
            ? "승인됨"
            : content.review_status === "revision_requested"
              ? "수정 요청됨"
              : "미검수",
        scrollTarget: "review-panel",
        required: true,
      },
      {
        id: "seo-70",
        label: "SEO 점수 70점 이상 (권장)",
        passed: props.seoScore >= 70,
        detail: `현재 ${props.seoScore}점`,
        scrollTarget: "seo-panel",
        required: false,
      },
      {
        id: "cross-validation",
        label: "교차검증 완료 (권장)",
        passed: props.crossValidationRun && props.crossValidationCriticalCount === 0,
        detail: props.crossValidationRun
          ? `심각 ${props.crossValidationCriticalCount}건`
          : "미수행",
        scrollTarget: "body-editor",
        required: false,
      },
      {
        id: "images-3",
        label: "이미지 마커 3개 이상 (권장)",
        passed: props.imageMarkerCount >= 3,
        detail: `현재 ${props.imageMarkerCount}개`,
        scrollTarget: "body-editor",
        required: false,
      },
    ];
  }

  if (status === "S2") {
    // S2 → S3 (검토완료 → 발행예정)
    const hasPublishDate = !!(content.publish_date || content.publish_due);
    return [
      {
        id: "publish-date",
        label: "발행예정일 설정",
        passed: hasPublishDate,
        detail: hasPublishDate
          ? (content.publish_date ?? content.publish_due ?? "").slice(0, 10)
          : "미설정",
        scrollTarget: "publish-date",
        required: true,
      },
      {
        id: "images-ready",
        label: "이미지 준비 (권장)",
        passed: props.imageMarkerCount >= 1,
        detail: `이미지 ${props.imageMarkerCount}개`,
        scrollTarget: "body-editor",
        required: false,
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
          required: true,
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
        required: true,
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
```

## 7. 전이 핸들러 — src/components/contents/status-transition-panel.tsx:281-430

```ts
  const requiredChecks = checks.filter((c) => c.required);
  const recommendedChecks = checks.filter((c) => !c.required);
  const requiredMet = requiredChecks.filter((c) => c.passed).length;
  const requiredTotal = requiredChecks.length;
  const allRequiredMet = requiredTotal === 0 || requiredMet === requiredTotal;
  const recommendedMet = recommendedChecks.filter((c) => c.passed).length;
  const hasUnmetRecommendations = recommendedMet < recommendedChecks.length;

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
    if (!allRequiredMet) {
      toast.error("필수 조건이 충족되지 않았습니다. 체크리스트를 확인해주세요.");
      return;
    }
    if (hasUnmetRecommendations) {
      // 권장 미충족 시 확인 모달
      setRecommendConfirmOpen(true);
      return;
    }
    startTransition(async () => {
      await runStatusUpdate({
        contentId: content.id,
        newStatus: nextStatus,
      });
    });
  }

  function handleConfirmRecommendedUnmet() {
    if (!forwardTransition) return;
    const nextStatus = forwardTransition.to_status as ContentStatus;
    setRecommendConfirmOpen(false);
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
```

### 7-1. 모달 문구 — status-transition-panel.tsx (발행 완료·성과 측정·역행·권장 미완료·강제 전환)

```tsx
          <DialogHeader>
            <DialogTitle>발행 완료 처리</DialogTitle>
            <DialogDescription>
              네이버 블로그에 실제 발행한 URL과 발행일시를 입력하세요. 공란으로 두면 URL은 생략되고 발행일시는 현재 시간이 사용됩니다.
            </DialogDescription>
```

```tsx
          <DialogHeader>
            <DialogTitle>성과 측정 기록</DialogTitle>
            <DialogDescription>
              발행 후 1주차 성과 지표를 입력하세요. 비워두면 저장하지 않습니다.
            </DialogDescription>
```

```tsx
          <DialogHeader>
            <DialogTitle>이전 상태로 되돌리기</DialogTitle>
            <DialogDescription>
              {reverseTransition && (
                <>
                  {CONTENT_STATES[content.status]?.label} →{" "}
                  {CONTENT_STATES[reverseTransition.to_status as ContentStatus]?.label}
                  으로 되돌립니다. 사유를 입력해주세요 (필수).
                </>
```

```tsx
              <AlertTriangle className="h-5 w-5" />
              권장 항목 미완료
            </DialogTitle>
            <DialogDescription>
              필수 조건은 충족되었지만, 다음 권장 항목이 완료되지 않았습니다.
              그래도 전이를 진행하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-1">
            {recommendedChecks
              .filter((c) => !c.passed)
              .map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-sm text-orange-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>{c.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{c.detail}</span>
                </div>
              ))}
            <p className="text-xs text-muted-foreground mt-2">
              미완료 항목은 콘텐츠 상세 페이지에 배너로 표시되어 언제든 보완할 수 있습니다.
            </p>
```

```tsx
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              관리자 강제 전환
            </DialogTitle>
            <DialogDescription>
              조건이 충족되지 않았지만 관리자 권한으로 상태를 강제 전환합니다. 이 전환은 기록에 남으며, 미충족 조건으로 인한 품질 저하에 주의하세요.
            </DialogDescription>
```

## 8. 상태별 자동 기록·notes 메타 — src/actions/contents.ts:384-492

```ts
/**
 * 확장된 상태 전이 — 메타 정보(URL, 성과, 사유)를 함께 저장.
 *
 * 사용처:
 *   - S3 → S4 발행 완료: naverBlogUrl, publishedAt 주입
 *   - S4 → S5 성과 측정: performanceSnapshot (views / comments / neighbor / consultation)
 *   - 역행 전이: transitionReason 주입
 *
 * 기존 contents.notes 컬럼에 prefix 로 저장하여 마이그레이션 없이 작동한다.
 * notes 의 기존 내용이 있으면 뒤에 append 하는 방식.
 */
export interface UpdateContentStatusWithMetaInput {
  contentId: string;
  newStatus: ContentStatus;
  naverBlogUrl?: string;
  publishedAtOverride?: string;
  performanceSnapshot?: {
    views_1w?: number;
    comments?: number;
    neighbor_added?: number;
    consultation_yn?: boolean;
  };
  transitionReason?: string;
  isReversal?: boolean;
  force?: boolean; // admin 강제 전환 플래그 (서버측 별도 검증 없음 — UI 에서 이미 판단)
}

export async function updateContentStatusWithMeta(
  input: UpdateContentStatusWithMetaInput
): Promise<{
  data: Content | null;
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    // 인증 확인
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return {
        data: null,
        error: `상태 변경 실패: 인증 오류 — ${authError?.message ?? "세션 없음"}`,
      };
    }

    // 기존 content 조회 (notes append + 전이 로그용)
    const { data: existing } = await supabase
      .from("contents")
      .select("notes, views_1w, status")
      .eq("id", input.contentId)
      .single();
    const fromStatus = (existing?.status as string) ?? "unknown";

    const updateData: Record<string, unknown> = {
      status: input.newStatus,
      updated_at: new Date().toISOString(),
    };

    // 상태별 타임스탬프 자동 기록 (override 있으면 그 값 사용)
    if (input.newStatus === "S1") {
      updateData.draft_done_at = new Date().toISOString();
    } else if (input.newStatus === "S2") {
      updateData.review_done_at = new Date().toISOString();
    } else if (input.newStatus === "S3") {
      updateData.image_done_at = new Date().toISOString();
    } else if (input.newStatus === "S4") {
      updateData.published_at = input.publishedAtOverride || new Date().toISOString();
    }

    // 성과 스냅샷 — contents 테이블의 기존 컬럼(views_1w, cta_clicks)에 매핑
    if (input.performanceSnapshot) {
      if (typeof input.performanceSnapshot.views_1w === "number") {
        updateData.views_1w = input.performanceSnapshot.views_1w;
      }
      if (typeof input.performanceSnapshot.comments === "number") {
        updateData.cta_clicks = input.performanceSnapshot.comments;
      }
    }

    // notes 에 메타 정보 append (마이그레이션 없이 작동)
    const existingNotes = (existing?.notes as string | null) ?? "";
    const metaLines: string[] = [];
    if (input.naverBlogUrl) {
      metaLines.push(`[네이버 URL] ${input.naverBlogUrl}`);
    }
    if (input.performanceSnapshot) {
      const s = input.performanceSnapshot;
      const parts: string[] = [];
      if (typeof s.views_1w === "number") parts.push(`조회수 ${s.views_1w}`);
      if (typeof s.comments === "number") parts.push(`댓글 ${s.comments}`);
      if (typeof s.neighbor_added === "number") parts.push(`이웃 +${s.neighbor_added}`);
      if (typeof s.consultation_yn === "boolean")
        parts.push(`상담 ${s.consultation_yn ? "유입" : "없음"}`);
      if (parts.length > 0) {
        metaLines.push(`[성과 1주차] ${parts.join(" · ")}`);
      }
    }
    if (input.transitionReason) {
      const prefix = input.isReversal ? "[역행 전이 사유]" : "[전이 사유]";
      metaLines.push(`${prefix} ${input.transitionReason}`);
    }
    if (metaLines.length > 0) {
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const block = `\n\n── ${stamp} (${input.newStatus}) ──\n${metaLines.join("\n")}`;
      updateData.notes = existingNotes + block;
    }
```

기본 전이 함수(칸반 드래그용) updateContentStatus 의 타임스탬프 규칙 — src/actions/contents.ts:343-352

```ts
    // 상태별 타임스탬프 자동 기록
    if (newStatus === "S1") {
      updateData.draft_done_at = new Date().toISOString();
    } else if (newStatus === "S2") {
      updateData.review_done_at = new Date().toISOString();
    } else if (newStatus === "S3") {
      updateData.image_done_at = new Date().toISOString();
    } else if (newStatus === "S4") {
      updateData.published_at = new Date().toISOString();
    }
```

## 9. 칸반 드래그 전이 — src/components/contents/kanban-board.tsx:160-251

```ts

      const fromStatus = source.droppableId as ContentStatus;
      const toStatus = destination.droppableId as ContentStatus;
      const contentId = draggableId;

      // 같은 칼럼 내 순서 변경은 허용
      if (fromStatus === toStatus) {
        return;
      }

      // 낙관적 업데이트: 즉시 상태 변경
      const prevContents = [...contents];
      setContents((prev) =>
        prev.map((c) => (c.id === contentId ? { ...c, status: toStatus } : c))
      );

      // 전이 검증 — 전이 규칙 존재 여부만 확인 (세부 조건은 상세 페이지에서 처리)
      const { transition, failedConditions } = await validateTransition(
        contentId,
        fromStatus,
        toStatus
      );

      // 전이 규칙 자체가 없으면 차단 (예: S0→S5 직행)
      if (!transition) {
        setContents(prevContents);
        setErrorDialog({
          open: true,
          title: "상태 전이 불가",
          description:
            `${CONTENT_STATES[fromStatus].label}에서 ${CONTENT_STATES[toStatus].label}(으)로 이동할 수 없습니다 — 허용되지 않은 전이입니다.`,
          contentId,
          failedConditions: [],
          kind: "blocked",
        });
        return;
      }

      // 권장 조건 미충족 — 경고 + 진행 옵션
      if (failedConditions.length > 0) {
        setContents(prevContents);
        setPendingTransition({ contentId, fromStatus, toStatus });
        setErrorDialog({
          open: true,
          title: "권장 항목 미완료",
          description:
            `${CONTENT_STATES[fromStatus].label} → ${CONTENT_STATES[toStatus].label} 전이 시 다음 항목이 완료되지 않았습니다. 그대로 진행하시겠습니까?`,
          contentId,
          failedConditions,
          kind: "warning",
        });
        return;
      }

      // Supabase에 상태 업데이트
      const { error } = await updateContentStatus(contentId, toStatus);
      if (error) {
        // 업데이트 실패 시 롤백
        setContents(prevContents);
        setErrorDialog({
          open: true,
          title: "상태 변경 실패",
          description: error,
          contentId,
          failedConditions: [],
          kind: "blocked",
        });
      }
    },
    [contents]
  );

  // 경고 다이얼로그에서 "진행" 선택 시 전이 수행
  async function handleProceedAnyway() {
    if (!pendingTransition) return;
    const { contentId, toStatus } = pendingTransition;
    setErrorDialog((prev) => ({ ...prev, open: false }));
    setPendingTransition(null);

    // 낙관적 업데이트 재실행
    setContents((prev) =>
      prev.map((c) => (c.id === contentId ? { ...c, status: toStatus } : c))
    );

    const { error } = await updateContentStatus(contentId, toStatus);
    if (error) {
      // 실패 시 새로고침으로 롤백
      router.refresh();
      setErrorDialog({
        open: true,
        title: "상태 변경 실패",
        description: error,
```

## 10. 발행 전 미완료 항목 배너 — src/app/(dashboard)/contents/[id]/content-detail-client.tsx:361-390 (+ 이미지 마커 계수 72-92)

```ts
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
```

```ts
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
```

## 11. 전이 이력 테이블 — supabase/migrations/014_fix_rls_and_transitions_log.sql:75-86

```sql
-- ── 6) 상태 전이 이력 테이블 ──
CREATE TABLE IF NOT EXISTS state_transitions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id text NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  transitioned_by uuid,
  transitioned_at timestamptz DEFAULT now(),
  is_forced boolean DEFAULT false,
  force_reason text,
  condition_snapshot jsonb
);
```

## 12. conditions 키 해석표 (코드 근거 요약)

| conditions 키 (시드) | 시드 행 | validateTransition 평가 | 평가식 / 비고 |
|---|---|---|---|
| briefing_done | S0→S1 | 안 함 | 코드에 분기 없음 |
| review_done | S1→S2 | 함 | `!content.review_done_at` 이면 실패 "검토가 완료되지 않았습니다." |
| seo_required_pass | S1→S2 | 안 함 | 코드에 분기 없음 |
| image_done | S2→S3 | 함 | `!content.image_done_at` 이면 실패. image_done_at 은 S3 전이 때 기록되므로 S2→S3 드래그에서는 대부분 실패(경고) |
| final_edit_done | S2→S3 | 안 함 | 코드에 분기 없음 |
| scheduled_time_reached | S3→S4 | 안 함 | 자동 발행 코드 없음 |
| quality_measured | S4→S5 | 함 | `!content.quality_score_final` 이면 실패. quality_score_final 을 쓰는 코드 없음 |
| major_revision | S1→S0 | 안 함 | — |
| minor_revision | S2→S1 | 안 함 | — |
| revision_count_lt_3 | S2→S1 | 함 | `revision_count >= 3` 이면 실패 "수정 횟수가 최대치(2회)를 초과했습니다." |
| ai_generation_done | (시드에 없음) | 함 | `!content.ai_generation_id` 이면 실패 |

칸반(kanban-board.tsx)은 validateTransition 의 failedConditions 를 **모두 '권장 미충족 경고'로 표시하고 "그대로 진행"을 허용**한다. 차단은 규칙 행 자체가 없을 때뿐이다.
상세 패널(status-transition-panel.tsx)은 DB conditions 를 쓰지 않고 buildChecks 의 필수/권장 조건(코드 상수)을 쓴다.
