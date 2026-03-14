import { createClient } from "@/lib/supabase/server";
import { getCtaTemplates } from "@/actions/settings";
import type { Content, Category } from "@/lib/types/database";
import { ContentNotFound } from "../content-not-found";
import { PublishPrepClient } from "./publish-prep-client";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PublishPrepPage({ params }: PageProps) {
  const { id } = await params;

  let content: Content | null = null;
  let categories: Category[] = [];

  try {
    const supabase = await createClient();

    const [contentRes, categoriesRes] = await Promise.all([
      supabase.from("contents").select("*").eq("id", id).single(),
      supabase.from("categories").select("*").order("sort_order"),
    ]);

    if (contentRes.data) {
      const c = contentRes.data as Content;
      if (c.is_deleted) {
        content = null;
      } else {
        content = c;
      }
    }
    if (categoriesRes.data) categories = categoriesRes.data as Category[];
  } catch {
    console.log("Supabase 연결 실패");
  }

  if (!content) {
    return <ContentNotFound />;
  }

  // CTA 템플릿 조회 (site_settings 기반)
  const { data: ctaTemplates } = await getCtaTemplates();

  return (
    <PublishPrepClient
      content={content}
      categories={categories}
      ctaTemplates={ctaTemplates}
    />
  );
}
