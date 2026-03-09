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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CATEGORY_COLORS: Record<string, string> = {
  "CAT-A": "#D4740A",
  "CAT-B": "#1B3A5C",
  "CAT-C": "#6B7280",
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

  const statusColor = (status: string) => {
    switch (status) {
      case "published":
        return "text-green-600";
      case "in_progress":
        return "text-blue-600";
      case "planned":
        return "text-gray-500";
      case "delayed":
        return "text-red-600";
      default:
        return "text-gray-500";
    }
  };

  return (
    <div className="rounded-lg border bg-card shadow-sm">
      {/* 헤더: 월 네비게이션 */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <Button variant="outline" size="icon" onClick={handlePrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold">
          {format(currentMonth, "yyyy년 M월", { locale: ko })}
        </h2>
        <Button variant="outline" size="icon" onClick={handleNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b">
        {DAY_NAMES.map((day, i) => (
          <div
            key={day}
            className={cn(
              "py-2 text-center text-sm font-medium",
              i === 0 && "text-red-500",
              i === 6 && "text-blue-500",
              i !== 0 && i !== 6 && "text-muted-foreground"
            )}
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
                "relative min-h-[100px] border-b border-r p-1.5",
                !inMonth && "bg-muted/30",
                idx % 7 === 0 && "border-l"
              )}
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
                  "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm",
                  !inMonth && "text-muted-foreground/40",
                  today && "bg-primary font-semibold text-primary-foreground",
                  inMonth && !today && "text-foreground"
                )}
              >
                {format(day, "d")}
              </span>

              {/* 스케줄 마커 */}
              {schedule && inMonth && (
                <div
                  className={cn(
                    "mt-1 cursor-pointer rounded px-1.5 py-0.5 text-xs leading-tight text-white transition-opacity hover:opacity-80",
                    !inMonth && "opacity-40"
                  )}
                  style={{
                    backgroundColor:
                      CATEGORY_COLORS[schedule.categoryId] ?? "#6B7280",
                  }}
                >
                  <span className="line-clamp-2 font-medium">
                    {schedule.title}
                  </span>
                </div>
              )}

              {/* 선택된 스케줄 상세 팝오버 */}
              {isSelected && inMonth && (
                <div className="absolute left-0 top-full z-10 mt-1 w-64 rounded-lg border bg-popover p-3 shadow-lg">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor:
                            CATEGORY_COLORS[schedule.categoryId] ?? "#6B7280",
                        }}
                      />
                      <span className="text-sm font-medium">
                        {schedule.category}
                      </span>
                      {schedule.sub && (
                        <span className="text-xs text-muted-foreground">
                          · {schedule.sub}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold leading-snug">
                      {schedule.title}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(schedule.planned_date), "M월 d일 (E)", {
                          locale: ko,
                        })}
                      </span>
                      <span
                        className={cn("text-xs font-medium", statusColor(schedule.status))}
                      >
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
