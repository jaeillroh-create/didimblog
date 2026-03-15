import { PageHeader } from "@/components/common/page-header";
import { getHealthCheckContents, getSeriesList, getKeywordCoverage } from "@/actions/manage";
import { ManageTabs } from "./manage-tabs";

export default async function ManagePage() {
  const [healthResult, seriesResult, coverageResult] = await Promise.all([
    getHealthCheckContents(),
    getSeriesList(),
    getKeywordCoverage(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="글 관리"
        description="발행 글 헬스체크, 시리즈 관리, 키워드 커버리지를 한 곳에서 관리합니다."
      />

      <ManageTabs
        healthContents={healthResult.data}
        seriesList={seriesResult.data}
        coverage={coverageResult.data}
        coverageStats={coverageResult.stats}
      />
    </div>
  );
}
