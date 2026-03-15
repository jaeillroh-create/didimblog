import { PageHeader } from "@/components/common/page-header";
import { MonthlyCalendar, type ScheduleItem } from "@/components/calendar/monthly-calendar";
import { RatioGauge } from "@/components/calendar/ratio-gauge";
import { EmptyState } from "@/components/common/empty-state";
import { getCalendarSchedules } from "@/actions/calendar";
import { Calendar } from "lucide-react";

export default async function CalendarPage() {
  const schedules: ScheduleItem[] = await getCalendarSchedules();

  return (
    <div className="space-y-6">
      <PageHeader
        title="발행 캘린더"
        description="매주 화요일 발행 스케줄"
      />

      {schedules.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-6 w-6" />}
          title="발행 스케줄이 없습니다"
          description="콘텐츠를 기획하고 발행일을 설정하면 캘린더에 표시됩니다."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <MonthlyCalendar schedules={schedules} />
          <div className="space-y-6">
            <RatioGauge schedules={schedules} />
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
      )}
    </div>
  );
}
