"use server";

import { createClient } from "@/lib/supabase/server";
import {
  type Profile,
  type UserRole,
  type StateTransition,
  type EntityType,
} from "@/lib/types/database";
import { type SeoItem, SEO_ITEMS } from "@/lib/constants/seo-items";

// ── 데모 데이터 (Supabase 미연결 시 폴백) ──

const DEMO_PROFILES: Profile[] = [
  {
    id: "user-1",
    name: "노재일",
    role: "admin",
    email: "jaeil@didim.kr",
    avatar_url: null,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "user-2",
    name: "콘텐츠 담당자",
    role: "editor",
    email: "editor@didim.kr",
    avatar_url: null,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "user-3",
    name: "디자인 담당자",
    role: "designer",
    email: "designer@didim.kr",
    avatar_url: null,
    created_at: "2026-01-01T00:00:00Z",
  },
];

const DEMO_STATE_TRANSITIONS: StateTransition[] = [
  {
    id: 1,
    entity_type: "content",
    from_status: "S0",
    to_status: "S1",
    conditions: { briefing_done: true },
    auto_checks: ["briefing_exists"],
    description: "기획→초안: 브리핑 완료 필요",
    is_reversible: false,
  },
  {
    id: 2,
    entity_type: "content",
    from_status: "S1",
    to_status: "S2",
    conditions: { review_done: true, seo_required_pass: true },
    auto_checks: ["seo_check", "review_exists"],
    description: "초안→검토: 팩트체크+SEO필수 통과",
    is_reversible: false,
  },
  {
    id: 3,
    entity_type: "content",
    from_status: "S2",
    to_status: "S3",
    conditions: { image_done: true, final_edit_done: true },
    auto_checks: ["image_uploaded", "final_edit"],
    description: "검토→발행예정: 이미지+최종편집 완료",
    is_reversible: false,
  },
  {
    id: 4,
    entity_type: "content",
    from_status: "S3",
    to_status: "S4",
    conditions: { scheduled_time_reached: true },
    auto_checks: ["schedule_check"],
    description: "발행예정→발행완료: 예약 시간 도래 (자동)",
    is_reversible: false,
  },
  {
    id: 5,
    entity_type: "content",
    from_status: "S4",
    to_status: "S5",
    conditions: { quality_measured: true },
    auto_checks: ["quality_score_exists"],
    description: "발행→성과측정: 품질점수 입력 완료",
    is_reversible: false,
  },
  {
    id: 6,
    entity_type: "content",
    from_status: "S1",
    to_status: "S0",
    conditions: { major_revision: true },
    auto_checks: [],
    description: "초안→기획: 전면 변경 시 역행",
    is_reversible: true,
  },
  {
    id: 7,
    entity_type: "content",
    from_status: "S2",
    to_status: "S1",
    conditions: { minor_revision: true, revision_count_lt_3: true },
    auto_checks: [],
    description: "검토→초안: 수정 필요 시 역행 (최대2회)",
    is_reversible: true,
  },
  {
    id: 8,
    entity_type: "lead",
    from_status: "S3",
    to_status: "S4",
    conditions: { consultation_done: true },
    auto_checks: ["consultation_record"],
    description: "상담완료→제안서발송: 상담 기록 필요",
    is_reversible: false,
  },
  {
    id: 9,
    entity_type: "lead",
    from_status: "S4",
    to_status: "S5",
    conditions: { contract_signed: true },
    auto_checks: ["contract_exists"],
    description: "제안서발송→계약체결: 계약서 확인",
    is_reversible: false,
  },
  {
    id: 10,
    entity_type: "lead",
    from_status: "S4",
    to_status: "S3",
    conditions: { renegotiation: true },
    auto_checks: [],
    description: "제안서발송→상담완료: 재협상 시 역행",
    is_reversible: true,
  },
];

export interface CtaTemplate {
  key: string;
  categoryName: string;
  text: string | null;
  note: string | null;
  conversionMethod: string;
  emailSubjectTag: string | null;
}

const DEMO_CTA_TEMPLATES: CtaTemplate[] = [
  {
    key: "현장수첩_절세",
    categoryName: "현장수첩 - 절세",
    text: '━━━━━━━━━━━━━━━━━━\n"우리 회사도 가능할까?"\n지금 바로 절세 시뮬레이션을 받아보세요.\n\n📧 재무제표를 보내주시면,\n48시간 내 맞춤 절세 리포트를 보내드립니다.\n\n👉 jaeil@didim.kr\n━━━━━━━━━━━━━━━━━━',
    note: null,
    conversionMethod: "이메일로 재무제표 수신 → 48시간 내 절세 시뮬레이션 리포트 발송",
    emailSubjectTag: "절세 시뮬레이션",
  },
  {
    key: "현장수첩_인증",
    categoryName: "현장수첩 - 인증",
    text: '━━━━━━━━━━━━━━━━━━\n우리 회사가 받을 수 있는 인증,\n지금 무료로 진단받아 보세요.\n\n📞 02-XXX-XXXX\n📧 jaeil@didim.kr\n\n"블로그 보고 연락드렸습니다" 한 마디면\n우선 상담을 도와드립니다.\n━━━━━━━━━━━━━━━━━━',
    note: null,
    conversionMethod: "이메일/전화 문의 → 무료 인증 진단 리포트 발송",
    emailSubjectTag: "인증 진단",
  },
  {
    key: "IP라운지",
    categoryName: "IP 라운지",
    text: '━━━━━━━━━━━━━━━━━━\n이런 IP 이야기가 도움이 되셨다면,\n디딤 블로그를 이웃 추가해 주세요!\n\n매주 화요일, 실무에 바로 쓸 수 있는\nIP 전략을 전해드립니다.\n\n👉 이웃 추가하기\n━━━━━━━━━━━━━━━━━━',
    note: null,
    conversionMethod: "이웃 추가 유도 + 사이드바 상담 안내로 자연 유도",
    emailSubjectTag: null,
  },
  {
    key: "디딤다이어리",
    categoryName: "디딤 다이어리",
    text: null,
    note: "이 카테고리는 CTA를 넣지 않는다. 디딤의 일상/철학을 담는 공간이므로 상업적 CTA가 오히려 신뢰를 깎을 수 있다.",
    conversionMethod: "사이드바/프로필의 상담 안내로 자연 유도",
    emailSubjectTag: null,
  },
];

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
      .order("name", { ascending: true });

    if (error) throw error;

    if (data && data.length > 0) {
      return { data: data as Profile[], error: null };
    }

    return { data: DEMO_PROFILES, error: null };
  } catch (err) {
    console.error("[getTeamMembers] 에러:", err);
    return { data: DEMO_PROFILES, error: null };
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

    if (data && data.length > 0) {
      return {
        data: data.map((row: Record<string, unknown>) => ({
          key: row.key as string,
          categoryName: row.category_name as string,
          text: row.text as string | null,
          note: row.note as string | null,
          conversionMethod: row.conversion_method as string,
          emailSubjectTag: row.email_subject_tag as string | null,
        })),
        error: null,
      };
    }

    return { data: DEMO_CTA_TEMPLATES, error: null };
  } catch (err) {
    console.error("[getCtaTemplates] 에러:", err);
    return { data: DEMO_CTA_TEMPLATES, error: null };
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

    // 기본값: 모두 활성화
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

    if (data && data.length > 0) {
      return { data: data as StateTransition[], error: null };
    }

    return { data: DEMO_STATE_TRANSITIONS, error: null };
  } catch (err) {
    console.error("[getAllStateTransitions] 에러:", err);
    return { data: DEMO_STATE_TRANSITIONS, error: null };
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
