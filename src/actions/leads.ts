"use server";

import { createClient } from "@/lib/supabase/server";
import type { Lead, Profile, Content } from "@/lib/types/database";

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

const DEMO_LEADS: Lead[] = [
  {
    id: 1,
    contact_date: "2026-02-10",
    company_name: "주식회사 테크플러스",
    contact_name: "김민수",
    contact_info: "010-1234-5678",
    source: "blog",
    source_content_id: "W01-01",
    interested_service: "tax_consulting",
    visitor_status: "S5",
    consultation_result: "consulted",
    contract_yn: true,
    contract_amount: 5500000,
    notes: "연구소 절세 시뮬레이션 글을 보고 문의. 법인세 절감에 관심.",
    assigned_to: "user-1",
    created_at: "2026-02-10T09:00:00Z",
    updated_at: "2026-02-28T14:00:00Z",
  },
  {
    id: 2,
    contact_date: "2026-02-14",
    company_name: "바이오젠 코리아",
    contact_name: "이지현",
    contact_info: "02-555-1234",
    source: "referral",
    source_content_id: null,
    interested_service: "lab_management",
    visitor_status: "S5",
    consultation_result: "consulted",
    contract_yn: true,
    contract_amount: 8800000,
    notes: "기존 고객 소개로 연결. 연구소 관리 전담 계약.",
    assigned_to: "user-1",
    created_at: "2026-02-14T10:30:00Z",
    updated_at: "2026-03-01T11:00:00Z",
  },
  {
    id: 3,
    contact_date: "2026-02-20",
    company_name: "그린에너지 솔루션즈",
    contact_name: "박정호",
    contact_info: "010-9876-5432",
    source: "blog",
    source_content_id: "W03-01",
    interested_service: "venture_cert",
    visitor_status: "S4",
    consultation_result: "proposal_sent",
    contract_yn: false,
    contract_amount: null,
    notes: "벤처인증 가점 글 보고 문의. 제안서 발송 완료.",
    assigned_to: "user-2",
    created_at: "2026-02-20T14:00:00Z",
    updated_at: "2026-03-05T09:00:00Z",
  },
  {
    id: 4,
    contact_date: "2026-02-25",
    company_name: "스마트팩토리 주식회사",
    contact_name: "최유진",
    contact_info: "031-777-8888",
    source: "blog",
    source_content_id: "W02-01",
    interested_service: "patent",
    visitor_status: "S4",
    consultation_result: "consulted",
    contract_yn: false,
    contract_amount: null,
    notes: "특허 출원 체크리스트 글 경유. 기술 특허 3건 상담 완료.",
    assigned_to: "user-1",
    created_at: "2026-02-25T11:00:00Z",
    updated_at: "2026-03-04T16:00:00Z",
  },
  {
    id: 5,
    contact_date: "2026-03-01",
    company_name: "메디컬AI 연구소",
    contact_name: "정수민",
    contact_info: "010-5555-6666",
    source: "referral",
    source_content_id: null,
    interested_service: "invention_cert",
    visitor_status: "S4",
    consultation_result: "pending",
    contract_yn: false,
    contract_amount: null,
    notes: "대학 교수 소개. 직무발명 보상규정 자문 요청.",
    assigned_to: "user-2",
    created_at: "2026-03-01T13:00:00Z",
    updated_at: "2026-03-06T10:00:00Z",
  },
  {
    id: 6,
    contact_date: "2026-03-03",
    company_name: "넥스트모빌리티",
    contact_name: "한동욱",
    contact_info: "010-3333-4444",
    source: "blog",
    source_content_id: "W01-01",
    interested_service: "tax_consulting",
    visitor_status: "S3",
    consultation_result: null,
    contract_yn: false,
    contract_amount: null,
    notes: "절세 시뮬레이션 글 보고 전화 문의. 상담 일정 조율 중.",
    assigned_to: "user-1",
    created_at: "2026-03-03T15:00:00Z",
    updated_at: "2026-03-03T15:00:00Z",
  },
  {
    id: 7,
    contact_date: "2026-03-05",
    company_name: "클라우드나인 테크",
    contact_name: "오세영",
    contact_info: "02-999-1111",
    source: "other",
    source_content_id: null,
    interested_service: "venture_cert",
    visitor_status: "S3",
    consultation_result: null,
    contract_yn: false,
    contract_amount: null,
    notes: "지인 소개로 유입. 벤처인증 신규 신청 문의.",
    assigned_to: "user-2",
    created_at: "2026-03-05T09:30:00Z",
    updated_at: "2026-03-05T09:30:00Z",
  },
  {
    id: 8,
    contact_date: "2026-03-07",
    company_name: "퓨처바이오텍",
    contact_name: "윤서연",
    contact_info: "010-7777-8888",
    source: "blog",
    source_content_id: "W03-01",
    interested_service: "lab_management",
    visitor_status: "S3",
    consultation_result: null,
    contract_yn: false,
    contract_amount: null,
    notes: "블로그 글 통해 유입. 연구소 설립 및 관리 문의.",
    assigned_to: null,
    created_at: "2026-03-07T11:00:00Z",
    updated_at: "2026-03-07T11:00:00Z",
  },
  {
    id: 9,
    contact_date: "2026-03-08",
    company_name: "디지털헬스케어 주식회사",
    contact_name: "강민호",
    contact_info: "010-2222-3333",
    source: "referral",
    source_content_id: null,
    interested_service: "patent",
    visitor_status: "S5",
    consultation_result: "consulted",
    contract_yn: true,
    contract_amount: 12000000,
    notes: "기존 고객사 CTO 소개. 의료기기 특허 포트폴리오 구축 계약.",
    assigned_to: "user-1",
    created_at: "2026-03-08T10:00:00Z",
    updated_at: "2026-03-09T09:00:00Z",
  },
  {
    id: 10,
    contact_date: "2026-02-18",
    company_name: "에코솔라 에너지",
    contact_name: "송하늘",
    contact_info: "010-4444-5555",
    source: "other",
    source_content_id: null,
    interested_service: "other",
    visitor_status: "S4",
    consultation_result: "lost",
    contract_yn: false,
    contract_amount: null,
    notes: "세미나에서 명함 교환 후 문의. 예산 사유로 보류.",
    assigned_to: "user-2",
    created_at: "2026-02-18T16:00:00Z",
    updated_at: "2026-03-02T14:00:00Z",
  },
];

const DEMO_PUBLISHED_CONTENTS: Pick<Content, "id" | "title" | "status">[] = [
  { id: "W01-01", title: "연구소 절세 시뮬레이션 – 법인세 20% 줄이는 3가지 방법", status: "S5" },
  { id: "W02-01", title: "특허 출원 전 반드시 확인해야 할 5가지 체크리스트", status: "S4" },
  { id: "W03-01", title: "벤처인증 가점 항목 완전 정리 (2026년 최신)", status: "S4" },
];

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

    if (data && data.length > 0) {
      return { data: data as Lead[], error: null };
    }

    return { data: DEMO_LEADS, error: null };
  } catch (err) {
    console.error("[getLeads] 에러:", err);
    return { data: DEMO_LEADS, error: null };
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

    if (data && data.length > 0) {
      return { data: data as Profile[], error: null };
    }

    return { data: DEMO_PROFILES, error: null };
  } catch (err) {
    console.error("[getLeadProfiles] 에러:", err);
    return { data: DEMO_PROFILES, error: null };
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

    if (data && data.length > 0) {
      return { data: data as Pick<Content, "id" | "title" | "status">[], error: null };
    }

    return { data: DEMO_PUBLISHED_CONTENTS, error: null };
  } catch (err) {
    console.error("[getLeadContents] 에러:", err);
    return { data: DEMO_PUBLISHED_CONTENTS, error: null };
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

// ── 리드 삭제 (소프트 삭제) ──

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
