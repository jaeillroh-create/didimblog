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
