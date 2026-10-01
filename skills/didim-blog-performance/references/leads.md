# 상담(리드) 추적 원문

> 원본 그대로. 포팅: scripts/leads_kpi.py. Notion "디딤 블로그 상담" 매핑은 references/notion-fields.md.

## 목차
1. 명세 — SPEC.md §4.6, UPGRADE_SPEC §1.2·§2.3·§4.3
2. 테이블 — 001 leads
3. 서버 액션 — src/actions/leads.ts 전체
4. 리드 페이지 KPI — leads/page.tsx
5. 파이프라인·유입경로 — pipeline-chart.tsx
6. 라벨·표 — lead-table.tsx, lead-form.tsx 선택지
7. 대시보드 최근 리드 — dashboard.ts getDashboardRecentLeads

## 1. 명세
SPEC.md:458-462

```markdown
### 4.6 리드 추적 (/leads)
- 리드 목록 테이블 (정렬/필터/검색)
- 유입 경로 통계 (블로그 vs 소개 vs 기타)
- 파이프라인 시각화 (S3 리드 → S4 상담 → S5 계약)
- 계약 전환율 + 누적 계약금액
```

docs/UPGRADE_SPEC.md:44-48 (§1.2 상담 상태), 90-98 (§2.3 상담 기록 플로우), 195-213 (§4.3 consultations — 레포 마이그레이션에는 없음, 코드는 leads 테이블 사용)

```markdown
### 1.2 상담 상태

```
접수(RECEIVED) → 상담중(IN_PROGRESS) → 계약(CONTRACTED) / 미계약(NOT_CONTRACTED)
```
```

```markdown
### 2.3 상담 기록 플로우

```
[대시보드 또는 사이드 메뉴 > 상담 로그]
    ↓
[새 상담 추가] — 날짜, 회사명, 유입 경로, 경유 글(드롭다운), 관심 서비스, 메모
    ↓
[상담 결과 업데이트] — 진행중 → 계약/미계약
```
```

```sql
### 4.3 신규 테이블: consultations (상담 로그)

```sql
CREATE TABLE consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_date DATE NOT NULL,
  company_name TEXT,  -- 익명 가능 (A사, B사)
  source TEXT NOT NULL CHECK (source IN ('BLOG', 'REFERRAL', 'OTHER')),
  source_post_id UUID REFERENCES posts(id),  -- 경유 글 (블로그 유입 시)
  service_interest TEXT NOT NULL CHECK (service_interest IN ('TAX_SAVING', 'CERTIFICATION', 'LAB_MGMT', 'PATENT', 'TRADEMARK', 'OTHER')),
  status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'IN_PROGRESS', 'CONTRACTED', 'NOT_CONTRACTED')),
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_consultations_date ON consultations(consultation_date);
CREATE INDEX idx_consultations_source_post ON consultations(source_post_id);
```
```

## 2. 테이블 — supabase/migrations/001_initial_schema.sql:142-162

```sql
-- ============================================
-- 8. leads (리드 추적)
-- ============================================
create table public.leads (
  id serial primary key,
  contact_date date not null,
  company_name text not null,
  contact_name text,
  contact_info text,
  source text not null check (source in ('blog', 'referral', 'other')),
  source_content_id text references public.contents(id),
  interested_service text check (interested_service in ('tax_consulting', 'lab_management', 'venture_cert', 'invention_cert', 'patent', 'other')),
  visitor_status text not null default 'S3' check (visitor_status in ('S3', 'S4', 'S5')),
  consultation_result text check (consultation_result in ('consulted', 'proposal_sent', 'pending', 'lost')),
  contract_yn boolean default false,
  contract_amount numeric(15,0),
  notes text,
  assigned_to uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

## 3. src/actions/leads.ts 전체

```ts
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
```

## 4. src/app/(dashboard)/leads/page.tsx:19-73

```tsx
  // KPI 계산
  const totalLeads = leads.length;

  const s3Count = leads.filter((l) => l.visitor_status === "S3").length;
  const s4Count = leads.filter((l) => l.visitor_status === "S4").length;
  const s5Count = leads.filter((l) => l.visitor_status === "S5").length;

  const reachedS4 = s4Count + s5Count;
  const consultationRate = totalLeads > 0
    ? Math.round((reachedS4 / totalLeads) * 100)
    : 0;

  const contractRate = reachedS4 > 0
    ? Math.round((s5Count / reachedS4) * 100)
    : 0;

  const totalContractAmount = leads
    .filter((l) => l.contract_yn && l.contract_amount)
    .reduce((sum, l) => sum + (l.contract_amount ?? 0), 0);

  const formattedAmount = new Intl.NumberFormat("ko-KR").format(totalContractAmount) + "원";

  return (
    <div className="space-y-6">
      <PageHeader
        title="리드 추적"
        description="블로그를 통해 유입된 리드를 관리하고 전환 성과를 추적합니다."
      >
        <LeadForm profiles={profiles} contents={contents} />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="총 리드 수"
          value={totalLeads}
          icon={<span className="tf tf-14">👥</span>}
        />
        <KPICard
          title="상담 전환율 (S3→S4)"
          value={`${consultationRate}%`}
          icon={<span className="tf tf-14">📈</span>}
        />
        <KPICard
          title="계약 전환율 (S4→S5)"
          value={`${contractRate}%`}
          icon={<span className="tf tf-14">✅</span>}
        />
        <KPICard
          title="누적 계약금액"
          value={formattedAmount}
          icon={<span className="tf tf-14">💰</span>}
          valueColor="var(--brand)"
        />
      </div>

```

## 5. src/components/leads/pipeline-chart.tsx:23-81

```tsx
const PIPELINE_COLORS = {
  S3: "var(--status-s3)",
  S4: "var(--status-s1)",
  S5: "var(--status-s4)",
};

const SOURCE_COLORS = {
  blog: "var(--brand)",
  referral: "var(--info)",
  other: "var(--g400)",
};

const SOURCE_LABELS: Record<string, string> = {
  blog: "블로그",
  referral: "소개",
  other: "기타",
};

export function PipelineChart({ leads }: PipelineChartProps) {
  // 파이프라인 데이터 계산
  const pipelineData = useMemo(() => {
    const s3Count = leads.filter((l) => l.visitor_status === "S3").length;
    const s4Count = leads.filter((l) => l.visitor_status === "S4").length;
    const s5Count = leads.filter((l) => l.visitor_status === "S5").length;

    // 전환율 계산 (누적 기준: S4+S5는 S3 단계를 거친 것)
    const totalFromS3 = s3Count + s4Count + s5Count; // 전체 리드
    const reachedS4 = s4Count + s5Count; // S4 이상 도달
    const reachedS5 = s5Count; // S5 도달

    const s3ToS4Rate = totalFromS3 > 0 ? Math.round((reachedS4 / totalFromS3) * 100) : 0;
    const s4ToS5Rate = reachedS4 > 0 ? Math.round((reachedS5 / reachedS4) * 100) : 0;

    return {
      chartData: [
        { name: "리드 (S3)", count: s3Count, fill: PIPELINE_COLORS.S3 },
        { name: "상담 (S4)", count: s4Count, fill: PIPELINE_COLORS.S4 },
        { name: "계약 (S5)", count: s5Count, fill: PIPELINE_COLORS.S5 },
      ],
      s3ToS4Rate,
      s4ToS5Rate,
    };
  }, [leads]);

  // 유입경로 분포 데이터
  const sourceData = useMemo(() => {
    const counts: Record<string, number> = { blog: 0, referral: 0, other: 0 };
    leads.forEach((lead) => {
      counts[lead.source] = (counts[lead.source] || 0) + 1;
    });

    return Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([source, count]) => ({
        name: SOURCE_LABELS[source] ?? source,
        value: count,
        fill: SOURCE_COLORS[source as keyof typeof SOURCE_COLORS] ?? "var(--g400)",
      }));
  }, [leads]);
```

## 6. lead-table.tsx:35-68, lead-form.tsx:147-206

```tsx
// ── 라벨 매핑 ──

const LEAD_STATUS_CONFIG = {
  S3: { label: "리드", badgeClass: "badge-warning" },
  S4: { label: "상담", badgeClass: "badge-info" },
  S5: { label: "계약", badgeClass: "badge-success" },
} as const;

const SOURCE_LABELS: Record<string, string> = {
  blog: "블로그",
  referral: "소개",
  other: "기타",
};

const SERVICE_LABELS: Record<string, string> = {
  tax_consulting: "절세 컨설팅",
  lab_management: "연구소 관리",
  venture_cert: "벤처인증",
  invention_cert: "발명인증",
  patent: "특허",
  other: "기타",
};

const CONSULTATION_LABELS: Record<string, string> = {
  consulted: "상담완료",
  proposal_sent: "제안서발송",
  pending: "대기중",
  lost: "실패",
};

function formatAmount(amount: number | null): string {
  if (amount === null || amount === undefined) return "-";
  return new Intl.NumberFormat("ko-KR").format(amount) + "원";
}
```

```tsx
          {/* 유입경로 */}
          <div>
            <label className="input-label">유입경로</label>
            <Select
              value={source}
              onValueChange={(val) => setSource(val as "blog" | "referral" | "other")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blog">블로그</SelectItem>
                <SelectItem value="referral">소개</SelectItem>
                <SelectItem value="other">기타</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 경유글 (블로그일 때만) */}
          {source === "blog" && (
            <div>
              <label className="input-label">경유글</label>
              <Select
                value={sourceContentId}
                onValueChange={setSourceContentId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="경유글 선택 (선택사항)" />
                </SelectTrigger>
                <SelectContent>
                  {contents.map((content) => (
                    <SelectItem key={content.id} value={content.id}>
                      <span className="truncate">
                        [{content.id}] {content.title ?? "제목 없음"}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* 관심서비스 */}
          <div>
            <label className="input-label">관심서비스</label>
            <Select
              value={interestedService}
              onValueChange={setInterestedService}
            >
              <SelectTrigger>
                <SelectValue placeholder="서비스 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tax_consulting">절세 컨설팅</SelectItem>
                <SelectItem value="lab_management">연구소 관리</SelectItem>
                <SelectItem value="venture_cert">벤처인증</SelectItem>
                <SelectItem value="invention_cert">발명인증</SelectItem>
                <SelectItem value="patent">특허</SelectItem>
                <SelectItem value="other">기타</SelectItem>
              </SelectContent>
```

## 7. src/actions/dashboard.ts:256-273

```ts
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
```
