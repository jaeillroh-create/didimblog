# SLA·발행일·캘린더·카테고리 비율 원문

> 원본 그대로. 계산 포팅은 scripts/sla.py, scripts/calendar_ratio.py.

## 목차
1. SPEC.md §5.4 SLA 기준
2. 주간 운영 루틴(원본 매뉴얼 섹션 8) — docs/08_주간_루틴.md
3. SLA 날짜 계산 — date-helpers.ts
4. SLA 상태 판정 — sla-checker.ts
5. 대시보드 SLA 알림 — dashboard.ts getDashboardSlaAlerts
6. SLA 인디케이터 — components/common/sla-indicator.tsx
7. 콘텐츠 생성 시 ID·SLA 기록 — contents.ts createContent
8. 발행 캘린더 데이터 — actions/calendar.ts
9. 캘린더 표시·비율 게이지 — monthly-calendar.tsx, ratio-gauge.tsx, calendar/page.tsx
10. 월간 발행 현황 — recommendations.ts getMonthlyPublishProgress + recommendation-engine.ts
11. SPEC.md §4.4 발행 캘린더

## 1. SPEC.md §5.4 — SPEC.md:531-539

```text
### 5.4 SLA 기준 (발행일 기준 역산)
```
D-5 (목요일): 음성 브리핑 완료
D-3 (토요일): 초안 작성 완료
D-2 (일요일): 팩트체크 + 검수 완료
D-1 (월요일): 이미지 제작 완료
D-0 (화요일): 최종 편집 + 09:00 예약 발행
```

```

## 2. 주간 운영 루틴 — docs/08_주간_루틴.md:1-62

```text
# 08 주간 루틴

> 원본 매뉴얼 v2.0 (섹션 8)

---

**8. 주간 운영 루틴**

아래 루틴을 52주간 반복한다. 이 루틴이 자리 잡으면 대표 투입 최소화
상태에서 블로그가 안정적으로 돌아간다.

  --------------------------------------------------------------------------------------
  **요일**   **담당자**   **할 일**                           **소요 시간** **산출물**
  ---------- ------------ ----------------------------------- ------------- ------------
  토\~일     노재일 대표  다음 주 글 주제에 대해 음성 브리핑  10분          음성 파일
                          녹음. 카톡 음성메시지 or 녹음 앱.                 
                          핵심 포인트 3가지를 구조적으로                    
                          말함: \"첫째 (사례), 둘째                         
                          (숫자/근거), 셋째 (결론)\"                        

  월 오전    콘텐츠 담당  음성 기반 초안 작성. SEO 키워드     2\~3시간      블로그 글
                          자연 배치 (3\~5회). 소제목(제목2)                 초안 (네이버
                          2\~3개 구조화. 이미지 위치 지정                   에디터
                          (\"○○이미지 삽입\" 표시). CTA 문구                임시저장)
                          배치.                                             

  월 오후    노재일 대표  초안 검수. 숫자/법률 정확성 확인.   10분          수정 지시
                          \"이 표현은 OO로 바꿔\" 구체적 수정               
                          지시. 카톡 or 메모로 전달.                        

  월 저녁    콘텐츠 담당  수정사항 반영. 이미지 제작 + ALT    1\~2시간      예약 발행
                          텍스트 입력. 태그 10개 입력                       설정 완료
                          (핵심3+연관3+브랜드2+롱테일2). 내부               
                          링크 2\~3개 삽입. CTA 배치 최종                   
                          확인. SEO 체크리스트(18항목) 전수                 
                          점검. → 화요일 09:00 예약 발행                    
                          설정.                                             

  화 09:00   (자동)       글 자동 발행. 발행 후 PC/모바일에서 5분           발행 확인
                          정상 표시 확인.                                   

  화\~수     콘텐츠 담당  발행 글에 달린 댓글 확인 + 답변.    10분/건       댓글 답변
             (또는 대표)  당일 or 익일 내 응답. 전문적이고                  
                          정성스러운 답변 작성.                             

  수\~금     콘텐츠 담당  이웃 활동: ① 타깃 블로그 3\~5곳     30\~45분/주   이웃 활동
                          방문 (경영 컨설턴트, 세무사,                      완료
                          스타트업 블로그 등) ② 의미 있는                   
                          전문적 댓글 작성 (\"좋은 글이네요\"               
                          금지. 전문적 코멘트만) ③ 주 2\~3회,               
                          1회 15분                                          

  금         콘텐츠 담당  주간 통계 체크: ① 이번 주 글 조회수 15분          주간 통계
                          ② 유입 키워드 TOP 5 ③ 이웃 추가 수                메모
                          ④ 댓글 수 → 이상치 있으면 원인 파악               
                          메모                                              
  --------------------------------------------------------------------------------------

**대표 투입 시간 합계: 주당 20분 (음성 브리핑 10분 + 검수 10분)**

**콘텐츠 담당 투입 시간 합계: 주당 5\~7시간**

```

## 3. date-helpers.ts — src/lib/utils/date-helpers.ts:1-29

```ts
import { format, subDays, nextTuesday } from "date-fns";
import { ko } from "date-fns/locale";

// 한국어 날짜 포맷
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "yyyy-MM-dd");
}

export function formatDateKo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "yyyy년 M월 d일", { locale: ko });
}

// 발행일(화요일) 기준 SLA 날짜 계산
export function calculateSlaDates(publishDate: Date) {
  return {
    briefingDue: subDays(publishDate, 5), // D-5 목요일 (AI 주제선정+초안생성)
    draftDue: subDays(publishDate, 3), // D-3 토요일
    reviewDue: subDays(publishDate, 2), // D-2 일요일
    imageDue: subDays(publishDate, 1), // D-1 월요일
    publishDue: publishDate, // D-0 화요일
  };
}

// 다음 화요일 구하기
export function getNextTuesday(from?: Date): Date {
  return nextTuesday(from ?? new Date());
}
```

## 4. sla-checker.ts — src/lib/utils/sla-checker.ts:1-71

```ts
import { isBefore, isToday } from "date-fns";
import type { Content } from "@/lib/types/database";

export type SlaStatus = "on_track" | "due_today" | "overdue" | "completed";

export interface SlaItem {
  label: string;
  dueDate: string | null;
  completedAt: string | null;
  status: SlaStatus;
}

// SLA 기준 (발행일 기준 역산)
// D-5 (목요일): AI 주제선정 + 초안생성
// D-3 (토요일): 초안 작성 완료
// D-2 (일요일): 팩트체크 + 검수 완료
// D-1 (월요일): 이미지 제작 완료
// D-0 (화요일): 최종 편집 + 09:00 예약 발행

export function checkSla(content: Content): SlaItem[] {
  const now = new Date();

  const items: SlaItem[] = [
    {
      label: "AI 주제선정 (D-5)",
      dueDate: content.briefing_due,
      completedAt: content.briefing_done_at,
      status: getSlaStatus(content.briefing_due, content.briefing_done_at, now),
    },
    {
      label: "초안 (D-3)",
      dueDate: content.draft_due,
      completedAt: content.draft_done_at,
      status: getSlaStatus(content.draft_due, content.draft_done_at, now),
    },
    {
      label: "검수 (D-2)",
      dueDate: content.review_due,
      completedAt: content.review_done_at,
      status: getSlaStatus(content.review_due, content.review_done_at, now),
    },
    {
      label: "이미지 (D-1)",
      dueDate: content.image_due,
      completedAt: content.image_done_at,
      status: getSlaStatus(content.image_due, content.image_done_at, now),
    },
    {
      label: "발행 (D-0)",
      dueDate: content.publish_due,
      completedAt: content.published_at,
      status: getSlaStatus(content.publish_due, content.published_at, now),
    },
  ];

  return items;
}

function getSlaStatus(
  dueDate: string | null,
  completedAt: string | null,
  now: Date
): SlaStatus {
  if (completedAt) return "completed";
  if (!dueDate) return "on_track";

  const due = new Date(dueDate);
  if (isToday(due)) return "due_today";
  if (isBefore(due, now)) return "overdue";
  return "on_track";
}
```

## 5. getDashboardSlaAlerts — src/actions/dashboard.ts:185-254

```ts
export async function getDashboardSlaAlerts(): Promise<DashboardSlaAlert[]> {
  try {
    const supabase = await createClient();
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);

    // SLA 마감이 다가오거나 초과된 콘텐츠 조회
    const { data, error } = await supabase
      .from("contents")
      .select("id, title, status, briefing_due, draft_due, review_due, image_due, publish_due")
      .in("status", ["S0", "S1", "S2", "S3"])
      .order("publish_date", { ascending: true })
      .limit(10);

    if (error || !data || data.length === 0) return [];

    const alerts: DashboardSlaAlert[] = [];
    const SLA_MAP: Record<string, { field: string; label: string }> = {
      S0: { field: "briefing_due", label: "AI 주제선정" },
      S1: { field: "draft_due", label: "초안" },
      S2: { field: "review_due", label: "검토" },
      S3: { field: "publish_due", label: "발행" },
    };

    for (const c of data) {
      const sla = SLA_MAP[c.status];
      if (!sla) continue;

      const dueDate = c[sla.field as keyof typeof c] as string | null;
      if (!dueDate) continue;

      const due = new Date(dueDate);
      const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      let status: "overdue" | "warning" | "on-track";
      let statusLabel: string;
      let timeInfo: string;

      if (diffDays < 0) {
        status = "overdue";
        statusLabel = "초과";
        timeInfo = `${sla.label} SLA ${Math.abs(diffDays)}일 초과`;
      } else if (diffDays <= 1) {
        status = "warning";
        statusLabel = "주의";
        timeInfo = diffDays === 0 ? `${sla.label} SLA 오늘 마감` : `${sla.label} SLA 내일 마감`;
      } else {
        status = "on-track";
        statusLabel = "정상";
        timeInfo = `${sla.label} SLA ${diffDays}일 남음`;
      }

      alerts.push({
        id: c.id,
        status,
        statusLabel,
        content: c.title ?? c.id,
        timeInfo,
      });
    }

    // overdue > warning > on-track 순서로 정렬
    const ORDER = { overdue: 0, warning: 1, "on-track": 2 };
    return alerts.sort((a, b) => ORDER[a.status] - ORDER[b.status]).slice(0, 5);
  } catch (err) {
    console.error("[getDashboardSlaAlerts] 에러:", err);
    return [];
  }
}
```

## 6. sla-indicator.tsx — src/components/common/sla-indicator.tsx:1-52

```tsx
"use client";

import { cn } from "@/lib/utils";

type SLAStatus = "on-track" | "warning" | "overdue" | "future";

interface SLAConfig {
  label: string;
  emoji: string;
  color: string;
  trackColor: string;
}

const SLA_CONFIG: Record<SLAStatus, SLAConfig> = {
  "on-track": {
    label: "정상",
    emoji: "✅",
    color: "var(--success)",
    trackColor: "var(--success)",
  },
  warning: {
    label: "주의",
    emoji: "⚠️",
    color: "var(--warning)",
    trackColor: "var(--warning)",
  },
  overdue: {
    label: "초과",
    emoji: "❌",
    color: "var(--danger)",
    trackColor: "var(--danger)",
  },
  future: {
    label: "미래",
    emoji: "📅",
    color: "var(--g400)",
    trackColor: "var(--g300)",
  },
};

function calculateSLAStatus(dueDate: string, currentDate: string): { status: SLAStatus; daysRemaining: number } {
  const due = new Date(dueDate);
  const now = new Date(currentDate);
  const diffMs = due.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0) return { status: "overdue", daysRemaining };
  if (daysRemaining <= 1) return { status: "warning", daysRemaining };
  if (daysRemaining > 30) return { status: "future", daysRemaining };
  return { status: "on-track", daysRemaining };
}

```

## 7. createContent — src/actions/contents.ts:143-184

```ts
export async function createContent(input: CreateContentInput): Promise<{
  data: Content | null;
  error: string | null;
}> {
  try {
    const publishDate = input.publish_date
      ? new Date(input.publish_date)
      : getNextTuesday();
    const slaDates = calculateSlaDates(publishDate);

    // W{주차}-{순번} 형식 ID 생성
    const weekNumber = Math.ceil(
      (publishDate.getTime() - new Date("2026-01-05").getTime()) /
        (7 * 24 * 60 * 60 * 1000)
    );
    const weekStr = String(weekNumber).padStart(2, "0");

    const supabase = await createClient();

    // 해당 주차의 기존 콘텐츠 수 확인
    const { count } = await supabase
      .from("contents")
      .select("*", { count: "exact", head: true })
      .like("id", `W${weekStr}-%`);

    const seq = String((count ?? 0) + 1).padStart(2, "0");
    const contentId = `W${weekStr}-${seq}`;

    const newContent: Omit<Content, "created_at" | "updated_at"> = {
      id: contentId,
      title: input.title,
      category_id: input.category_id,
      secondary_category: input.secondary_category ?? null,
      target_keyword: input.target_keyword ?? null,
      target_audience: (input.target_audience as Content["target_audience"]) ?? null,
      status: "S0",
      publish_date: formatDate(publishDate),
      briefing_due: formatDate(slaDates.briefingDue),
      draft_due: formatDate(slaDates.draftDue),
      review_due: formatDate(slaDates.reviewDue),
      image_due: formatDate(slaDates.imageDue),
      publish_due: formatDate(slaDates.publishDue),
```

## 8. actions/calendar.ts 전체 — src/actions/calendar.ts:1-91

주의: schedules 테이블(001)에는 title·sub_category 컬럼이 없다(s.title, s.sub_category 는 항상 undefined). 레포 시드에는 schedules 행이 없어 실제로는 contents 폴백 경로가 쓰인다(실DB 확인 필요).

```ts
"use server";

import { createClient } from "@/lib/supabase/server";

export interface CalendarScheduleItem {
  planned_date: string;
  category: string;
  categoryId: string;
  title: string;
  status: string;
  sub?: string;
}

export async function getCalendarSchedules(): Promise<CalendarScheduleItem[]> {
  try {
    const supabase = await createClient();

    // schedules 테이블에서 조회
    const { data: schedules, error } = await supabase
      .from("schedules")
      .select("*")
      .order("week_number", { ascending: true });

    if (error) throw error;

    if (schedules && schedules.length > 0) {
      // 카테고리/콘텐츠 매핑 데이터 조회
      const catIds = [...new Set(schedules.map((s) => s.category_id).filter(Boolean))];
      const contentIds = [...new Set(schedules.map((s) => s.content_id).filter(Boolean))];

      const [{ data: cats }, { data: conts }] = await Promise.all([
        catIds.length > 0
          ? supabase.from("categories").select("id, name").in("id", catIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        contentIds.length > 0
          ? supabase.from("contents").select("id, title").in("id", contentIds)
          : Promise.resolve({ data: [] as { id: string; title: string }[] }),
      ]);

      const catMap = new Map((cats ?? []).map((c) => [c.id, c.name]));
      const contMap = new Map((conts ?? []).map((c) => [c.id, c.title]));

      return schedules.map((s) => ({
        planned_date: s.planned_date,
        category: catMap.get(s.category_id) ?? "",
        categoryId: s.category_id ?? "",
        title: contMap.get(s.content_id) ?? s.title ?? "",
        status: s.status ?? "planned",
        sub: s.sub_category ?? undefined,
      }));
    }

    // schedules 테이블이 비어있으면 contents에서 직접 구성
    const { data: contents, error: contentsError } = await supabase
      .from("contents")
      .select("id, title, status, publish_date, category_id")
      .not("publish_date", "is", null)
      .order("publish_date", { ascending: true });

    if (contentsError) throw contentsError;

    if (contents && contents.length > 0) {
      // 카테고리명을 별도로 조회
      const categoryIds = [...new Set(contents.map((c) => c.category_id).filter(Boolean))];
      const { data: cats } = await supabase
        .from("categories")
        .select("id, name")
        .in("id", categoryIds);
      const catMap = new Map((cats ?? []).map((c) => [c.id, c.name]));

      return contents.map((c) => {
        let calStatus = "planned";
        if (c.status === "S4" || c.status === "S5") calStatus = "published";
        else if (c.status === "S1" || c.status === "S2" || c.status === "S3") calStatus = "in_progress";

        return {
          planned_date: c.publish_date!,
          category: catMap.get(c.category_id) ?? "",
          categoryId: c.category_id ?? "",
          title: c.title ?? c.id,
          status: calStatus,
        };
      });
    }

    return [];
  } catch (err) {
    console.error("[getCalendarSchedules] 에러:", err);
    return [];
  }
}
```

## 9. 캘린더 표시·비율 게이지

monthly-calendar.tsx:21-25, 43-58 (카테고리 색, 시작 월 2026-01, 하루 1건만 find)

```tsx
const CATEGORY_COLORS: Record<string, string> = {
  "CAT-A": "var(--category-field-note)",
  "CAT-B": "var(--category-ip-lounge)",
  "CAT-C": "var(--category-diary)",
};
```

```tsx
  const [currentMonth, setCurrentMonth] = useState(new Date(2026, 0, 1));
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleItem | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const handlePrev = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNext = () => setCurrentMonth(addMonths(currentMonth, 1));

  const getScheduleForDay = (day: Date): ScheduleItem | undefined => {
    return schedules.find((s) => isSameDay(new Date(s.planned_date), day));
  };
```

ratio-gauge.tsx 전체 — src/components/calendar/ratio-gauge.tsx:1-89

```tsx
"use client";

import type { ScheduleItem } from "./monthly-calendar";

const CATEGORY_CONFIG = [
  { id: "CAT-A", name: "현장 수첩", color: "var(--category-field-note)", target: 2 },
  { id: "CAT-B", name: "IP 라운지", color: "var(--category-ip-lounge)", target: 1 },
  { id: "CAT-C", name: "디딤 다이어리", color: "var(--category-diary)", target: 1 },
];

interface RatioGaugeProps {
  schedules: ScheduleItem[];
}

export function RatioGauge({ schedules }: RatioGaugeProps) {
  const total = schedules.length;

  const counts = CATEGORY_CONFIG.map((cat) => ({
    ...cat,
    count: schedules.filter((s) => s.categoryId === cat.id).length,
  }));

  // GCD 계산으로 비율 단순화
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const countValues = counts.map((c) => c.count);
  const commonDivisor = countValues.reduce((acc, val) => gcd(acc, val), countValues[0] || 1);
  const ratioValues = countValues.map((v) => (commonDivisor > 0 ? v / commonDivisor : 0));

  return (
    <div className="card-default">
      <div className="mb-4">
        <h3 className="t-lg" style={{ color: "var(--g900)" }}>
          <span className="tf tf-14">📈</span> 발행 비율
        </h3>
      </div>
      <div className="space-y-4">
        {/* 스택형 수평 바 — progress-track 사용 */}
        <div className="progress-track progress-track-lg" style={{ height: 32, borderRadius: "var(--r-full)" }}>
          <div className="flex h-full w-full overflow-hidden" style={{ borderRadius: "var(--r-full)" }}>
            {counts.map((cat) => {
              const pct = total > 0 ? (cat.count / total) * 100 : 0;
              if (pct === 0) return null;
              return (
                <div
                  key={cat.id}
                  className="flex items-center justify-center t-xs text-white transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: cat.color,
                    fontWeight: 600,
                  }}
                  title={`${cat.name}: ${cat.count}건 (${Math.round(pct)}%)`}
                >
                  {pct >= 10 && `${cat.count}건`}
                </div>
              );
            })}
          </div>
        </div>

        {/* 범례 */}
        <div className="flex items-center justify-center gap-4">
          {counts.map((cat) => (
            <div key={cat.id} className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3"
                style={{ backgroundColor: cat.color, borderRadius: "var(--r-xs)" }}
              />
              <span className="t-sm" style={{ color: "var(--g500)" }}>
                {cat.name} ({cat.count})
              </span>
            </div>
          ))}
        </div>

        {/* 비율 텍스트 */}
        <p className="text-center t-sm" style={{ color: "var(--g500)" }}>
          현재{" "}
          <span className="font-num" style={{ fontWeight: 700, color: "var(--g900)" }}>
            {ratioValues.join(":")}
          </span>
          {" / "}
          목표{" "}
          <span className="font-num" style={{ fontWeight: 700, color: "var(--g900)" }}>2:1:1</span>
        </p>
      </div>
    </div>
  );
}
```

calendar/page.tsx:13-16 (페이지 설명)

```tsx
      <PageHeader
        title="발행 캘린더"
        description="매주 화요일 발행 스케줄"
      />
```

## 10. 월간 발행 현황 — src/actions/recommendations.ts:487-557, src/lib/recommendation-engine.ts:90-115

```ts
// ── 월간 발행 현황 ──

export interface MonthlyPublishProgress {
  categoryId: string;
  categoryName: string;
  published: number;
  target: number;
}

export async function getMonthlyPublishProgress(): Promise<
  MonthlyPublishProgress[]
> {
  try {
    const supabase = await createClient();
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

    const { data: published } = await supabase
      .from("contents")
      .select("category_id")
      .eq("status", "S4")
      .gte("published_at", firstDay.toISOString())
      .eq("is_deleted", false);

    const stats = calcMonthlyStats(published ?? []);

    return [
      {
        categoryId: "CAT-A",
        categoryName: "변리사의 현장 수첩",
        published: stats.field,
        target: 2,
      },
      {
        categoryId: "CAT-B",
        categoryName: "IP 라운지",
        published: stats.lounge,
        target: 1,
      },
      {
        categoryId: "CAT-C",
        categoryName: "디딤 다이어리",
        published: stats.diary,
        target: 1,
      },
    ];
  } catch (err) {
    console.error("[getMonthlyPublishProgress] 에러:", err);
    return [
      {
        categoryId: "CAT-A",
        categoryName: "변리사의 현장 수첩",
        published: 0,
        target: 2,
      },
      {
        categoryId: "CAT-B",
        categoryName: "IP 라운지",
        published: 0,
        target: 1,
      },
      {
        categoryId: "CAT-C",
        categoryName: "디딤 다이어리",
        published: 0,
        target: 1,
      },
    ];
  }
}

```

```ts
// ── 1차 카테고리 ID 추출 (2차 → 1차 폴백) ──

export function getPrimaryCategoryId(categoryId: string): string {
  if (["CAT-A", "CAT-B", "CAT-C"].includes(categoryId)) return categoryId;
  // CAT-A-01 → CAT-A
  const parts = categoryId.split("-");
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  return categoryId;
}

// ── 월간 발행 통계 계산 ──

export function calcMonthlyStats(
  publishedContents: Pick<Content, "category_id">[]
): MonthlyPublishStats {
  const stats: MonthlyPublishStats = { field: 0, lounge: 0, diary: 0 };

  for (const c of publishedContents) {
    const primary = getPrimaryCategoryId(c.category_id ?? "");
    if (primary === "CAT-A") stats.field++;
    else if (primary === "CAT-B") stats.lounge++;
    else if (primary === "CAT-C") stats.diary++;
  }

  return stats;
}
```

## 11. SPEC.md §4.4 — SPEC.md:446-450

```markdown
### 4.4 발행 캘린더 (/calendar)
- 월간 캘린더 뷰
- 카테고리별 색상 코드: 현장수첩=오렌지, IP라운지=네이비, 다이어리=그레이
- 화요일에만 발행 마커 표시
- 발행 비율 게이지 (현재 비율 vs 목표 2:1:1)
```
