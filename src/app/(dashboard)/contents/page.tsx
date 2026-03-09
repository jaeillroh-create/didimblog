import { PageHeader } from "@/components/common/page-header";
import { KanbanBoard } from "@/components/contents/kanban-board";
import {
  getContents,
  getCategories,
  getProfiles,
  getStateTransitions,
} from "@/actions/contents";
import { getLLMConfigs } from "@/actions/ai";

export default async function ContentsPage() {
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
      />
    </div>
  );
}
