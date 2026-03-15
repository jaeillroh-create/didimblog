"use server";

import { createClient } from "@/lib/supabase/server";
import type { Lead, Profile, Content } from "@/lib/types/database";

// ── 리드 목록 조회 ──

export async function getLeads(): Promise<{
  data: Lead[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("contact_date", { ascending: false });

    if (error) throw error;

    return { data: (data ?? []) as Lead[], error: null };
  } catch (err) {
    console.error("[getLeads] 에러:", err);
    return { data: [], error: "리드 목록을 불러올 수 없습니다." };
  }
}

// ── 프로필(팀원) 목록 조회 ──

export async function getLeadProfiles(): Promise<{
  data: Profile[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("name", { ascending: true });

    if (error) throw error;

    return { data: (data ?? []) as Profile[], error: null };
  } catch (err) {
    console.error("[getLeadProfiles] 에러:", err);
    return { data: [], error: "팀원 목록을 불러올 수 없습니다." };
  }
}

// ── 발행된 콘텐츠 목록 조회 (source_content_id 링킹용) ──

export async function getLeadContents(): Promise<{
  data: Pick<Content, "id" | "title" | "status">[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("contents")
      .select("id, title, status")
      .in("status", ["S4", "S5"])
      .order("published_at", { ascending: false });

    if (error) throw error;

    return { data: (data ?? []) as Pick<Content, "id" | "title" | "status">[], error: null };
  } catch (err) {
    console.error("[getLeadContents] 에러:", err);
    return { data: [], error: "콘텐츠 목록을 불러올 수 없습니다." };
  }
}

// ── 리드 생성 ──

interface CreateLeadInput {
  company_name: string;
  contact_name?: string;
  contact_info?: string;
  source: "blog" | "referral" | "other";
  source_content_id?: string;
  interested_service?: string;
  assigned_to?: string;
  notes?: string;
}

export async function createLead(input: CreateLeadInput): Promise<{
  data: Lead | null;
  error: string | null;
}> {
  try {
    if (!input.company_name.trim()) {
      return { data: null, error: "회사명은 필수 입력 항목입니다." };
    }

    const supabase = await createClient();

    const newLead = {
      contact_date: new Date().toISOString().split("T")[0],
      company_name: input.company_name.trim(),
      contact_name: input.contact_name?.trim() || null,
      contact_info: input.contact_info?.trim() || null,
      source: input.source,
      source_content_id: input.source === "blog" ? (input.source_content_id || null) : null,
      interested_service: input.interested_service || null,
      visitor_status: "S3" as const,
      consultation_result: null,
      contract_yn: false,
      contract_amount: null,
      notes: input.notes?.trim() || null,
      assigned_to: input.assigned_to || null,
    };

    const { data, error } = await supabase
      .from("leads")
      .insert(newLead)
      .select()
      .single();

    if (error) throw error;

    return { data: data as Lead, error: null };
  } catch (err) {
    console.error("[createLead] 에러:", err);
    return { data: null, error: "리드 생성에 실패했습니다." };
  }
}

// ── 리드 상태 변경 ──

export async function updateLeadStatus(
  leadId: number,
  newStatus: "S3" | "S4" | "S5"
): Promise<{
  data: Lead | null;
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    const updateData: Record<string, unknown> = {
      visitor_status: newStatus,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("leads")
      .update(updateData)
      .eq("id", leadId)
      .select()
      .single();

    if (error) throw error;

    return { data: data as Lead, error: null };
  } catch (err) {
    console.error("[updateLeadStatus] 에러:", err);
    return { data: null, error: "리드 상태 변경에 실패했습니다." };
  }
}

// ── 리드 수정 ──

export async function updateLead(
  leadId: number,
  data: Partial<Omit<Lead, "id" | "created_at">>
): Promise<{
  data: Lead | null;
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    const { data: updated, error } = await supabase
      .from("leads")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", leadId)
      .select()
      .single();

    if (error) throw error;

    return { data: updated as Lead, error: null };
  } catch (err) {
    console.error("[updateLead] 에러:", err);
    return { data: null, error: "리드 수정에 실패했습니다." };
  }
}

// ── 리드 삭제 ──

export async function deleteLead(leadId: number): Promise<{
  success: boolean;
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from("leads")
      .delete()
      .eq("id", leadId);

    if (error) throw error;

    return { success: true, error: null };
  } catch (err) {
    console.error("[deleteLead] 에러:", err);
    return { success: false, error: "리드 삭제에 실패했습니다." };
  }
}
