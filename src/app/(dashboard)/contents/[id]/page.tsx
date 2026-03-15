import { createClient } from "@/lib/supabase/server";
import type {
  Content,
  Category,
  Profile,
  StateTransition,
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
  } catch (err) {
    console.error("[ContentDetailPage] 에러:", err);
  }

  if (!content) {
    return <ContentNotFound />;
  }

  return (
    <ContentDetailClient
      content={content}
      categories={categories}
      profiles={profiles}
      transitions={transitions}
    />
  );
}
