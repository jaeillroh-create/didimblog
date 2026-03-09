import { PageHeader } from "@/components/common/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamManagement } from "@/components/settings/team-management";
import { CtaTemplateEditor } from "@/components/settings/cta-template-editor";
import { SeoCriteriaEditor } from "@/components/settings/seo-criteria-editor";
import { StateTransitionEditor } from "@/components/settings/state-transition-editor";
import { AiSettings } from "@/components/settings/ai-settings";
import {
  getTeamMembers,
  getPendingMembers,
  getCtaTemplates,
  getSeoSettings,
  getAllStateTransitions,
} from "@/actions/settings";
import { getLLMConfigs, getPromptTemplates } from "@/actions/ai";

export default async function SettingsPage() {
  const [
    { data: members },
    { data: pendingMembers },
    { data: ctaTemplates },
    { data: seoItems },
    { data: transitions },
    { data: llmConfigs },
    { data: promptTemplates },
  ] = await Promise.all([
    getTeamMembers(),
    getPendingMembers(),
    getCtaTemplates(),
    getSeoSettings(),
    getAllStateTransitions(),
    getLLMConfigs(),
    getPromptTemplates(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="설정" description="시스템 설정 및 관리" />

      <Tabs defaultValue="team" className="space-y-6">
        <TabsList>
          <TabsTrigger value="team">팀 관리</TabsTrigger>
          <TabsTrigger value="cta">CTA 템플릿</TabsTrigger>
          <TabsTrigger value="seo">SEO 기준</TabsTrigger>
          <TabsTrigger value="transitions">상태 규칙</TabsTrigger>
          <TabsTrigger value="ai">AI 설정</TabsTrigger>
        </TabsList>

        <TabsContent value="team">
          <TeamManagement initialMembers={members} initialPendingMembers={pendingMembers} />
        </TabsContent>

        <TabsContent value="cta">
          <CtaTemplateEditor initialTemplates={ctaTemplates} />
        </TabsContent>

        <TabsContent value="seo">
          <SeoCriteriaEditor initialItems={seoItems} />
        </TabsContent>

        <TabsContent value="transitions">
          <StateTransitionEditor initialTransitions={transitions} />
        </TabsContent>

        <TabsContent value="ai">
          <AiSettings initialConfigs={llmConfigs} initialTemplates={promptTemplates} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
