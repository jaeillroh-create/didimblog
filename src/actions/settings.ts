"use server";

import { createClient } from "@/lib/supabase/server";
import {
  type Profile,
  type UserRole,
  type StateTransition,
} from "@/lib/types/database";
import { type SeoItem, SEO_ITEMS } from "@/lib/constants/seo-items";

export interface CtaTemplate {
  key: string;
  categoryName: string;
  text: string | null;
  note: string | null;
  conversionMethod: string;
  emailSubjectTag: string | null;
}

export interface SeoSettingItem extends SeoItem {
  enabled: boolean;
}

// ── 팀 멤버 관리 ──

export async function getTeamMembers(): Promise<{
  data: Profile[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .neq("role", "pending")
      .order("name", { ascending: true });

    if (error) throw error;

    return { data: (data ?? []) as Profile[], error: null };
  } catch (err) {
    console.error("[getTeamMembers] 에러:", err);
    return { data: [], error: "팀원 목록을 불러올 수 없습니다." };
  }
}

export async function updateMemberRole(
  userId: string,
  newRole: UserRole
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", userId);

    if (error) throw error;

    return { error: null };
  } catch (err) {
    console.error("[updateMemberRole] 에러:", err);
    return { error: "역할 변경에 실패했습니다." };
  }
}

export async function removeMember(
  userId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (error) throw error;

    return { error: null };
  } catch (err) {
    console.error("[removeMember] 에러:", err);
    return { error: "멤버 삭제에 실패했습니다." };
  }
}

/** pending 사용자 목록 조회 */
export async function getPendingMembers(): Promise<{
  data: Profile[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "pending")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return { data: (data as Profile[]) ?? [], error: null };
  } catch (err) {
    console.error("[getPendingMembers] 에러:", err);
    return { data: [], error: null };
  }
}

/** pending 사용자 승인 (역할 부여) */
export async function approveMember(
  userId: string,
  role: UserRole
): Promise<{ error: string | null }> {
  if (role === "pending") {
    return { error: "유효한 역할을 선택해주세요." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", userId);

    if (error) throw error;

    return { error: null };
  } catch (err) {
    console.error("[approveMember] 에러:", err);
    return { error: "승인에 실패했습니다." };
  }
}

/** pending 사용자 거부 (프로필 삭제) */
export async function rejectMember(
  userId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (error) throw error;

    return { error: null };
  } catch (err) {
    console.error("[rejectMember] 에러:", err);
    return { error: "거부에 실패했습니다." };
  }
}

// ── CTA 템플릿 관리 ──

export async function getCtaTemplates(): Promise<{
  data: CtaTemplate[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("cta_templates")
      .select("*")
      .order("key", { ascending: true });

    if (error) throw error;

    const templates: CtaTemplate[] = (data ?? []).map((row: Record<string, unknown>) => ({
      key: row.key as string,
      categoryName: row.category_name as string,
      text: row.text as string | null,
      note: row.note as string | null,
      conversionMethod: row.conversion_method as string,
      emailSubjectTag: row.email_subject_tag as string | null,
    }));
    return { data: templates, error: null };
  } catch (err) {
    console.error("[getCtaTemplates] 에러:", err);
    return { data: [], error: "CTA 템플릿을 불러올 수 없습니다." };
  }
}

export async function updateCtaTemplate(
  key: string,
  data: { text: string | null; conversionMethod: string; emailSubjectTag: string | null }
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("cta_templates")
      .update({
        text: data.text,
        conversion_method: data.conversionMethod,
        email_subject_tag: data.emailSubjectTag,
      })
      .eq("key", key);

    if (error) throw error;

    return { error: null };
  } catch (err) {
    console.error("[updateCtaTemplate] 에러:", err);
    return { error: "CTA 템플릿 수정에 실패했습니다." };
  }
}

// ── SEO 설정 ──

export async function getSeoSettings(): Promise<{
  data: SeoSettingItem[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("seo_settings")
      .select("*");

    if (error) throw error;

    if (data && data.length > 0) {
      return {
        data: SEO_ITEMS.map((item) => {
          const setting = data.find((s: Record<string, unknown>) => s.item_id === item.id);
          return { ...item, enabled: setting ? (setting.enabled as boolean) : true };
        }),
        error: null,
      };
    }

    // 설정 데이터 없으면 기본값: 모두 활성화
    return {
      data: SEO_ITEMS.map((item) => ({ ...item, enabled: true })),
      error: null,
    };
  } catch (err) {
    console.error("[getSeoSettings] 에러:", err);
    return {
      data: SEO_ITEMS.map((item) => ({ ...item, enabled: true })),
      error: null,
    };
  }
}

export async function updateSeoSettings(
  items: { id: number; enabled: boolean }[]
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();

    for (const item of items) {
      const { error } = await supabase
        .from("seo_settings")
        .upsert({ item_id: item.id, enabled: item.enabled }, { onConflict: "item_id" });

      if (error) throw error;
    }

    return { error: null };
  } catch (err) {
    console.error("[updateSeoSettings] 에러:", err);
    return { error: "SEO 설정 저장에 실패했습니다." };
  }
}

// ── 상태 전이 규칙 관리 ──

export async function getAllStateTransitions(): Promise<{
  data: StateTransition[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("state_transitions")
      .select("*")
      .order("id", { ascending: true });

    if (error) throw error;

    return { data: (data ?? []) as StateTransition[], error: null };
  } catch (err) {
    console.error("[getAllStateTransitions] 에러:", err);
    return { data: [], error: "상태 전이 규칙을 불러올 수 없습니다." };
  }
}

export async function updateStateTransition(
  id: number,
  data: Partial<Omit<StateTransition, "id">>
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("state_transitions")
      .update(data)
      .eq("id", id);

    if (error) throw error;

    return { error: null };
  } catch (err) {
    console.error("[updateStateTransition] 에러:", err);
    return { error: "상태 전이 규칙 수정에 실패했습니다." };
  }
}

export async function createStateTransition(
  data: Omit<StateTransition, "id">
): Promise<{ data: StateTransition | null; error: string | null }> {
  try {
    const supabase = await createClient();
    const { data: created, error } = await supabase
      .from("state_transitions")
      .insert(data)
      .select()
      .single();

    if (error) throw error;

    return { data: created as StateTransition, error: null };
  } catch (err) {
    console.error("[createStateTransition] 에러:", err);
    return { data: null, error: "상태 전이 규칙 생성에 실패했습니다." };
  }
}

export async function deleteStateTransition(
  id: number
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("state_transitions")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return { error: null };
  } catch (err) {
    console.error("[deleteStateTransition] 에러:", err);
    return { error: "상태 전이 규칙 삭제에 실패했습니다." };
  }
}
