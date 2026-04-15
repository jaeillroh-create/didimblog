import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/actions/auth";
import type {
  Content,
  Category,
  Profile,
  StateTransition,
  ValidationResult,
} from "@/lib/types/database";
import { ContentDetailClient } from "./content-detail-client";
import { ContentNotFound } from "./content-not-found";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ContentDetailPage({ params }: PageProps) {
  const { id } = await params;

  let content: Content | null = null;
  let categories: Category[] = [];
  let profiles: Profile[] = [];
  let transitions: StateTransition[] = [];
  let validationResults: ValidationResult[] | null = null;

  try {
    const supabase = await createClient();

    const [contentRes, categoriesRes, profilesRes, transitionsRes] =
      await Promise.all([
        supabase.from("contents").select("*").eq("id", id).single(),
        supabase.from("categories").select("*").order("sort_order"),
        supabase.from("profiles").select("*"),
        supabase
          .from("state_transitions")
          .select("*")
          .eq("entity_type", "content"),
      ]);

    if (contentRes.data && !(contentRes.data as Content).is_deleted) {
      content = contentRes.data as Content;
    }

    categories = (categoriesRes.data ?? []) as Category[];
    profiles = (profilesRes.data ?? []) as Profile[];
    transitions = (transitionsRes.data ?? []) as StateTransition[];

    // 교차검증 결과: ai_generation_id 가 있으면 validation_results 조회
    if (content?.ai_generation_id) {
      const { data: aiGen } = await supabase
        .from("ai_generations")
        .select("validation_results")
        .eq("id", content.ai_generation_id)
        .maybeSingle();
      const raw = (aiGen as { validation_results: ValidationResult[] | null } | null)
        ?.validation_results ?? null;
      if (Array.isArray(raw) && raw.length > 0) {
        validationResults = raw;
      }
    }
  } catch (err) {
    console.error("[ContentDetailPage] 에러:", err);
  }

  if (!content) {
    return <ContentNotFound />;
  }

  // 관리자 여부 — 강제 전이 버튼 표시 권한
  const { role } = await getCurrentUserRole();
  const isAdmin = role === "admin";

  return (
    <ContentDetailClient
      content={content}
      categories={categories}
      profiles={profiles}
      transitions={transitions}
      isAdmin={isAdmin}
      validationResults={validationResults}
    />
  );
}
