"use server";

import { createClient } from "@/lib/supabase/server";

export interface DashboardKPI {
  weeklyPublished: number;
  weeklyTarget: number;
  monthlyViews: number;
  monthlyViewsChange: number | null;
  avgQualityScore: number | null;
  avgQualityChange: number | null;
  activeLeads: number;
  activeLeadsChange: number | null;
  conversionRate: number | null;
  conversionRateChange: number | null;
  totalContents: number;
}

export interface DashboardTask {
  id: string;
  label: string;
  status: string;
}

export interface DashboardSlaAlert {
  id: string;
  status: "overdue" | "warning" | "on-track";
  statusLabel: string;
  content: string;
  timeInfo: string;
}

export interface DashboardLead {
  id: number;
  company_name: string;
  interested_service: string | null;
  contact_date: string;
  visitor_status: string;
}

export async function getDashboardKPI(): Promise<DashboardKPI> {
  try {
    const supabase = await createClient();

    // 이번 주 발행 수
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const { count: weeklyPublished } = await supabase
      .from("contents")
      .select("*", { count: "exact", head: true })
      .in("status", ["S4", "S5"])
      .gte("published_at", weekStart.toISOString())
      .lt("published_at", weekEnd.toISOString());

    // 총 콘텐츠 수
    const { count: totalContents } = await supabase
      .from("contents")
      .select("*", { count: "exact", head: true });

    // 활성 리드 수 (S3, S4)
    const { count: activeLeads } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .in("visitor_status", ["S3", "S4"]);

    // 평균 품질점수
    const { data: qualityData } = await supabase
      .from("contents")
      .select("quality_score_final")
      .not("quality_score_final", "is", null);

    let avgQualityScore: number | null = null;
    if (qualityData && qualityData.length > 0) {
      const total = qualityData.reduce((sum, c) => sum + (c.quality_score_final ?? 0), 0);
      avgQualityScore = Math.round(total / qualityData.length);
    }

    // 월간 조회수 합계
    const { data: viewsData } = await supabase
      .from("contents")
      .select("views_1m")
      .not("views_1m", "is", null);

    let monthlyViews = 0;
    if (viewsData && viewsData.length > 0) {
      monthlyViews = viewsData.reduce((sum, c) => sum + (c.views_1m ?? 0), 0);
    }

    // 이번 달 vs 지난 달 content_metrics 비교로 monthlyViewsChange 계산
    let monthlyViewsChange: number | null = null;
    try {
      const thisMonth = now.toISOString().substring(0, 7); // YYYY-MM
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonth = prevDate.toISOString().substring(0, 7);

      const { data: thisMonthMetrics } = await supabase
        .from("content_metrics")
        .select("views")
        .gte("measured_at", `${thisMonth}-01`)
        .lt("measured_at", `${thisMonth}-32`);

      const { data: prevMonthMetrics } = await supabase
        .from("content_metrics")
        .select("views")
        .gte("measured_at", `${prevMonth}-01`)
        .lt("measured_at", `${prevMonth}-32`);

      const thisTotal = (thisMonthMetrics ?? []).reduce((s, r) => s + (r.views ?? 0), 0);
      const prevTotal = (prevMonthMetrics ?? []).reduce((s, r) => s + (r.views ?? 0), 0);

      if (prevTotal > 0) {
        monthlyViewsChange = Math.round(((thisTotal - prevTotal) / prevTotal) * 100);
      }
    } catch {
      // content_metrics 조회 실패 시 null 유지
    }

    return {
      weeklyPublished: weeklyPublished ?? 0,
      weeklyTarget: 3,
      monthlyViews,
      monthlyViewsChange,
      avgQualityScore,
      avgQualityChange: null,
      activeLeads: activeLeads ?? 0,
      activeLeadsChange: null,
      conversionRate: null,
      conversionRateChange: null,
      totalContents: totalContents ?? 0,
    };
  } catch (err) {
    console.error("[getDashboardKPI] 에러:", err);
    return {
      weeklyPublished: 0,
      weeklyTarget: 3,
      monthlyViews: 0,
      monthlyViewsChange: null,
      avgQualityScore: null,
      avgQualityChange: null,
      activeLeads: 0,
      activeLeadsChange: null,
      conversionRate: null,
      conversionRateChange: null,
      totalContents: 0,
    };
  }
}

export async function getDashboardTasks(): Promise<DashboardTask[]> {
  try {
    const supabase = await createClient();

    // 진행 중인 콘텐츠 (S0~S3)를 할 일 목록으로 변환
    const { data, error } = await supabase
      .from("contents")
      .select("id, title, status")
      .in("status", ["S0", "S1", "S2", "S3"])
      .order("publish_date", { ascending: true })
      .limit(5);

    if (error || !data || data.length === 0) return [];

    const STATUS_LABELS: Record<string, string> = {
      S0: "기획",
      S1: "초안 작성",
      S2: "검토 중",
      S3: "발행 예정",
    };

    return data.map((c) => ({
      id: c.id,
      label: c.title ?? c.id,
      status: STATUS_LABELS[c.status] ?? c.status,
    }));
  } catch (err) {
    console.error("[getDashboardTasks] 에러:", err);
    return [];
  }
}

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

export async function getDashboardRecentLeads(): Promise<DashboardLead[]> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("leads")
      .select("id, company_name, interested_service, contact_date, visitor_status")
      .order("contact_date", { ascending: false })
      .limit(5);

    if (error || !data) return [];

    return data as DashboardLead[];
  } catch (err) {
    console.error("[getDashboardRecentLeads] 에러:", err);
    return [];
  }
}
