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
