import { PageHeader } from "@/components/common/page-header";
import { KanbanBoard } from "@/components/contents/kanban-board";
import {
  getContents,
  getCategories,
  getProfiles,
  getStateTransitions,
} from "@/actions/contents";
import { getLLMConfigs } from "@/actions/ai";
import type { AiDraftInitialValues } from "@/components/contents/ai-draft-dialog";

interface ContentsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ContentsPage({ searchParams }: ContentsPageProps) {
  const [
    { data: contents },
    { data: categories },
    { data: profiles },
    { data: transitions },
    { data: llmConfigs },
  ] = await Promise.all([
    getContents(),
    getCategories(),
    getProfiles(),
    getStateTransitions(),
    getLLMConfigs(),
  ]);

  // URL 쿼리파라미터로 AI 초안 다이얼로그 자동 열기
  const params = await searchParams;
  const action = typeof params.action === "string" ? params.action : undefined;
  const topic = typeof params.topic === "string" ? params.topic : undefined;
  const context = typeof params.context === "string" ? params.context : undefined;

  let aiDraftInitial: AiDraftInitialValues | undefined;
  if (action === "ai-draft" && topic) {
    aiDraftInitial = { topic };
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="콘텐츠 관리"
        description="블로그 콘텐츠의 기획부터 성과 측정까지 전체 워크플로우를 관리합니다."
      />

      <KanbanBoard
        contents={contents}
        categories={categories}
        profiles={profiles}
        transitions={transitions}
        llmConfigs={llmConfigs}
        aiDraftInitialValues={aiDraftInitial}
        aiDraftInitialContext={context}
      />
    </div>
  );
}
