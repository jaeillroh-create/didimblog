"use client";

import { useState } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
  isToday,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_COLORS: Record<string, string> = {
  "CAT-A": "var(--category-field-note)",
  "CAT-B": "var(--category-ip-lounge)",
  "CAT-C": "var(--category-diary)",
};

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

export interface ScheduleItem {
  planned_date: string;
  category: string;
  categoryId: string;
  title: string;
  status: string;
  sub?: string;
}

interface MonthlyCalendarProps {
  schedules: ScheduleItem[];
}

export function MonthlyCalendar({ schedules }: MonthlyCalendarProps) {
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

  const statusLabel = (status: string) => {
    switch (status) {
      case "published":
        return "발행 완료";
      case "in_progress":
        return "진행 중";
      case "planned":
        return "예정";
      case "delayed":
        return "지연";
      case "skipped":
        return "건너뜀";
      default:
        return status;
    }
  };

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case "published":
        return "badge-success";
      case "in_progress":
        return "badge-info";
      case "planned":
        return "badge-neutral";
      case "delayed":
        return "badge-danger";
      default:
        return "badge-neutral";
    }
  };

  return (
    <div className="card-default !p-0 overflow-hidden">
      {/* 헤더: 월 네비게이션 */}
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--g100)" }}>
        <button className="icon-btn" onClick={handlePrev}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="t-xl" style={{ color: "var(--g900)" }}>
          {format(currentMonth, "yyyy년 M월", { locale: ko })}
        </h2>
        <button className="icon-btn" onClick={handleNext}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7" style={{ borderBottom: "1px solid var(--g100)" }}>
        {DAY_NAMES.map((day, i) => (
          <div
            key={day}
            className="py-2 text-center t-sm"
            style={{
              color: i === 0 ? "var(--danger)" : i === 6 ? "var(--info)" : "var(--g500)",
              fontWeight: 600,
            }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7">
        {days.map((day, idx) => {
          const schedule = getScheduleForDay(day);
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);
          const isSelected =
            selectedSchedule &&
            schedule &&
            isSameDay(new Date(schedule.planned_date), new Date(selectedSchedule.planned_date));

          return (
            <div
              key={idx}
              className={cn(
                "relative min-h-[100px] p-1.5",
                idx % 7 === 0 && "border-l"
              )}
              style={{
                borderBottom: "1px solid var(--g100)",
                borderRight: "1px solid var(--g100)",
                background: !inMonth ? "var(--g50)" : "var(--white)",
              }}
              onClick={() => {
                if (schedule) {
                  setSelectedSchedule(isSelected ? null : schedule);
                } else {
                  setSelectedSchedule(null);
                }
              }}
            >
              {/* 날짜 번호 */}
              <span
                className={cn(
                  "inline-flex h-7 w-7 items-center justify-center t-sm",
                  today && "font-num"
                )}
                style={{
                  borderRadius: "var(--r-full)",
                  color: !inMonth ? "var(--g300)" : today ? "var(--white)" : "var(--g900)",
                  background: today ? "var(--brand)" : "transparent",
                  fontWeight: today ? 700 : 400,
                }}
              >
                {format(day, "d")}
              </span>

              {/* 스케줄 마커 */}
              {schedule && inMonth && (
                <div
                  className="mt-1 cursor-pointer px-1.5 py-0.5 t-xs leading-tight text-white transition-opacity hover:opacity-80"
                  style={{
                    borderRadius: "var(--r-xs)",
                    backgroundColor:
                      CATEGORY_COLORS[schedule.categoryId] ?? "var(--g500)",
                  }}
                >
                  <span className="line-clamp-2" style={{ fontWeight: 600 }}>
                    {schedule.title}
                  </span>
                </div>
              )}

              {/* 선택된 스케줄 상세 팝오버 */}
              {isSelected && inMonth && (
                <div
                  className="absolute left-0 top-full z-10 mt-1 w-64 p-3"
                  style={{
                    borderRadius: "var(--r-lg)",
                    border: "1px solid var(--g150)",
                    background: "var(--white)",
                    boxShadow: "var(--sh-lg)",
                  }}
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5"
                        style={{
                          borderRadius: "var(--r-full)",
                          backgroundColor:
                            CATEGORY_COLORS[schedule.categoryId] ?? "var(--g500)",
                        }}
                      />
                      <span className="t-sm" style={{ fontWeight: 600, color: "var(--g900)" }}>
                        {schedule.category}
                      </span>
                      {schedule.sub && (
                        <span className="t-xs" style={{ color: "var(--g400)" }}>
                          · {schedule.sub}
                        </span>
                      )}
                    </div>
                    <p className="t-md" style={{ fontWeight: 700, color: "var(--g900)", lineHeight: 1.4 }}>
                      {schedule.title}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="t-xs" style={{ color: "var(--g400)" }}>
                        {format(new Date(schedule.planned_date), "M월 d일 (E)", {
                          locale: ko,
                        })}
                      </span>
                      <span className={`ucl-badge ucl-badge-sm ${statusBadgeClass(schedule.status)}`}>
                        {statusLabel(schedule.status)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
