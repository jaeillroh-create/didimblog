"use client";

import { useMemo } from "react";
import { addWeeks, isBefore, isAfter, startOfWeek } from "date-fns";
import { PageHeader } from "@/components/common/page-header";
import { MonthlyCalendar, type ScheduleItem } from "@/components/calendar/monthly-calendar";
import { RatioGauge } from "@/components/calendar/ratio-gauge";

/** 12주 스케줄 원본 데이터 */
const SCHEDULE_RAW = [
  { week: 1, category: "현장 수첩", sub: "절세 시뮬레이션", title: "법인세 2억 내던 대표님, 지금은 5천만원입니다", keyword: "직무발명보상금 절세" },
  { week: 2, category: "IP 라운지", sub: "특허 전략 노트", title: "특허 1건으로 벤처인증 + 투자유치 + 정부과제 3마리 토끼", keyword: "스타트업 특허 전략" },
  { week: 3, category: "현장 수첩", sub: "연구소 운영 실무", title: "연구소 세무조사 통지서 받고 전화 온 대표님", keyword: "기업부설연구소 세무조사" },
  { week: 4, category: "디딤 다이어리", sub: "대표의 생각", title: "KAIST → CIPO → 변리사, 디딤을 만든 이유" },
  { week: 5, category: "현장 수첩", sub: "절세 시뮬레이션", title: "대표이사에게 보상금 지급, 가능한가요? (가능합니다)" },
  { week: 6, category: "IP 라운지", sub: "AI와 IP", title: "ChatGPT로 만든 로고, 상표등록 될까?" },
  { week: 7, category: "현장 수첩", sub: "인증 가이드", title: "벤처인증 3번 떨어진 회사, 4번째에 성공한 비결" },
  { week: 8, category: "디딤 다이어리", sub: "컨설팅 후기", title: "이번 달 벤처인증 3건 완료 — 세 회사 세 가지 전략" },
  { week: 9, category: "현장 수첩", sub: "절세 시뮬레이션", title: "상여금으로 줬으면 6,600만원 더 나갔습니다" },
  { week: 10, category: "IP 라운지", sub: "IP 뉴스 한 입", title: "직무발명보상 5만원 줬다가 2조 소송당한 회사" },
  { week: 11, category: "현장 수첩", sub: "인증 가이드", title: "직원 2명이면 연구소 됩니다 — 설립한 대표님 후기" },
  { week: 12, category: "디딤 다이어리", sub: "디딤 일상", title: "변리사가 서울대 AI 과정을 듣는 이유" },
] as const;

/** 카테고리명 → ID 매핑 */
const CATEGORY_ID_MAP: Record<string, string> = {
  "현장 수첩": "CAT-A",
  "IP 라운지": "CAT-B",
  "디딤 다이어리": "CAT-C",
};

/**
 * 12주 스케줄을 실제 화요일 날짜에 매핑하여 ScheduleItem 배열 생성.
 * 첫 번째 화요일: 2026-01-06
 */
function generateScheduleData(): ScheduleItem[] {
  const firstTuesday = new Date(2026, 0, 6); // 2026-01-06 화요일
  const now = new Date();

  return SCHEDULE_RAW.map((item) => {
    const plannedDate = addWeeks(firstTuesday, item.week - 1);
    // 해당 주의 시작 (일요일 기준) 을 구해서 현재 주와 비교
    const weekStart = startOfWeek(now, { weekStartsOn: 0 });
    const itemWeekStart = startOfWeek(plannedDate, { weekStartsOn: 0 });

    let status: string;
    if (isBefore(plannedDate, weekStart)) {
      status = "published";
    } else if (
      !isBefore(itemWeekStart, weekStart) &&
      !isAfter(itemWeekStart, weekStart)
    ) {
      status = "in_progress";
    } else {
      status = "planned";
    }

    return {
      planned_date: plannedDate.toISOString().split("T")[0],
      category: item.category,
      categoryId: CATEGORY_ID_MAP[item.category] ?? "CAT-C",
      title: item.title,
      status,
      sub: item.sub,
    };
  });
}

export default function CalendarPage() {
  const schedules = useMemo(() => generateScheduleData(), []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="발행 캘린더"
        description="매주 화요일 발행 스케줄"
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* 월별 캘린더 */}
        <MonthlyCalendar schedules={schedules} />

        {/* 발행 비율 게이지 */}
        <div className="space-y-6">
          <RatioGauge schedules={schedules} />

          {/* 범례 카드 */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold">상태 안내</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
                <span className="text-sm text-muted-foreground">발행 완료</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
                <span className="text-sm text-muted-foreground">진행 중</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-400" />
                <span className="text-sm text-muted-foreground">예정</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
