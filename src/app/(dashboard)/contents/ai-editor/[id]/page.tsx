import { AiEditorClient } from "./ai-editor-client";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AiEditorPage({ params }: PageProps) {
  const { id } = await params;
  return <AiEditorClient generationId={parseInt(id)} />;
}
