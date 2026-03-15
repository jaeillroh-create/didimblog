"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HealthCheckTab } from "@/components/manage/health-check-tab";
import { SeriesTab } from "@/components/manage/series-tab";
import { KeywordCoverageTab } from "@/components/manage/keyword-coverage-tab";
import type { Content, Series } from "@/lib/types/database";
import type { HealthCheckResult } from "@/lib/content-health";
import type { KeywordCoverageItem } from "@/actions/manage";
import { ShieldCheck, BookOpen, Map } from "lucide-react";

interface ManageTabsProps {
  healthContents: (Content & { healthCheck: HealthCheckResult })[];
  seriesList: (Series & { contentCount: number; publishedCount: number })[];
  coverage: KeywordCoverageItem[];
  coverageStats: { total: number; covered: number; uncovered: number };
}

export function ManageTabs({
  healthContents,
  seriesList,
  coverage,
  coverageStats,
}: ManageTabsProps) {
  return (
    <Tabs defaultValue="health" className="space-y-4">
      <TabsList>
        <TabsTrigger value="health" className="gap-1.5">
          <ShieldCheck className="h-4 w-4" />
          업데이트 필요
        </TabsTrigger>
        <TabsTrigger value="series" className="gap-1.5">
          <BookOpen className="h-4 w-4" />
          시리즈 현황
        </TabsTrigger>
        <TabsTrigger value="coverage" className="gap-1.5">
          <Map className="h-4 w-4" />
          키워드 커버리지
        </TabsTrigger>
      </TabsList>

      <TabsContent value="health">
        <HealthCheckTab contents={healthContents} />
      </TabsContent>

      <TabsContent value="series">
        <SeriesTab seriesList={seriesList} />
      </TabsContent>

      <TabsContent value="coverage">
        <KeywordCoverageTab coverage={coverage} stats={coverageStats} />
      </TabsContent>
    </Tabs>
  );
}
