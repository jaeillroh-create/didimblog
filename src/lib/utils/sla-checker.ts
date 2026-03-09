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
// D-5 (목요일): 음성 브리핑 완료
// D-3 (토요일): 초안 작성 완료
// D-2 (일요일): 팩트체크 + 검수 완료
// D-1 (월요일): 이미지 제작 완료
// D-0 (화요일): 최종 편집 + 09:00 예약 발행

export function checkSla(content: Content): SlaItem[] {
  const now = new Date();

  const items: SlaItem[] = [
    {
      label: "브리핑 (D-5)",
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
