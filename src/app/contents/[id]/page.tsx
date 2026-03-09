export default async function ContentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">콘텐츠 상세 ({resolvedParams.id})</h1>
      {/* TODO: 콘텐츠 편집 폼, 상태 전이, SEO 체크, 브리핑, SLA 타임라인 */}
    </div>
  );
}
