"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import {
  HEALTH_STATUS_LABELS,
  HEALTH_STATUS_COLORS,
  type HealthCheckResult,
} from "@/lib/content-health";
import { runHealthCheck, updateHealthStatus } from "@/actions/manage";
import type { Content, HealthStatus } from "@/lib/types/database";
import { ShieldCheck, RefreshCw, CheckCircle, AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface HealthCheckTabProps {
  contents: (Content & { healthCheck: HealthCheckResult })[];
}

export function HealthCheckTab({ contents: initialContents }: HealthCheckTabProps) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [contents, setContents] = useState(initialContents);

  const problemContents = contents.filter(
    (c) =>
      c.healthCheck.recommendedStatus === "CHECK_NEEDED" ||
      c.healthCheck.recommendedStatus === "UPDATE_NEEDED"
  );

  const handleRunCheck = async () => {
    setIsRunning(true);
    try {
      const { error } = await runHealthCheck();
      if (error) {
        toast.error(error);
      } else {
        toast.success("헬스체크가 완료되었습니다.");
        router.refresh();
      }
    } catch {
      toast.error("헬스체크 실행에 실패했습니다.");
    } finally {
      setIsRunning(false);
    }
  };

  const handleMarkUpdated = async (contentId: string) => {
    const { success, error } = await updateHealthStatus(contentId, "UPDATED");
    if (success) {
      toast.success("업데이트 완료로 표시했습니다.");
      setContents((prev) =>
        prev.map((c) =>
          c.id === contentId
            ? {
                ...c,
                health_status: "UPDATED" as HealthStatus,
                healthCheck: {
                  ...c.healthCheck,
                  recommendedStatus: "HEALTHY" as HealthStatus,
                  currentStatus: "UPDATED" as HealthStatus,
                  reasons: ["최근 업데이트 완료"],
                },
              }
            : c
        )
      );
    } else {
      toast.error(error ?? "상태 변경에 실패했습니다.");
    }
  };

  return (
    <div className="space-y-4">
      {/* 요약 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            발행 글 {contents.length}개 중{" "}
            <span className="font-semibold text-red-600">
              {problemContents.length}개
            </span>{" "}
            점검 필요
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRunCheck}
          disabled={isRunning}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${isRunning ? "animate-spin" : ""}`} />
          {isRunning ? "점검 중..." : "전체 헬스체크"}
        </Button>
      </div>

      {/* 글 목록 */}
      {problemContents.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<CheckCircle className="h-8 w-8 text-green-500" />}
              title="모든 글이 정상입니다"
              description="현재 점검이 필요한 글이 없습니다."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {problemContents.map((item) => {
            const status = item.healthCheck.recommendedStatus;
            return (
              <Card key={item.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${HEALTH_STATUS_COLORS[status]}`}
                        >
                          {status === "UPDATE_NEEDED" ? (
                            <AlertTriangle className="h-3 w-3" />
                          ) : (
                            <ShieldCheck className="h-3 w-3" />
                          )}
                          {HEALTH_STATUS_LABELS[status]}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          발행 후 {item.healthCheck.daysSincePublish}일
                        </span>
                      </div>
                      <p className="font-medium text-sm truncate">
                        {item.title ?? "제목 없음"}
                      </p>
                      <div className="mt-1 space-y-0.5">
                        {item.healthCheck.reasons.map((reason, i) => (
                          <p key={i} className="text-xs text-muted-foreground">
                            {reason}
                          </p>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(`/contents/${item.id}`)}
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        상세
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleMarkUpdated(item.id)}
                      >
                        <CheckCircle className="h-3.5 w-3.5 mr-1" />
                        업데이트 완료
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 정상 글 접힌 목록 */}
      {contents.filter(
        (c) =>
          c.healthCheck.recommendedStatus === "HEALTHY" ||
          c.healthCheck.recommendedStatus === "UPDATED"
      ).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-green-500" />
              정상 글 ({contents.filter(
                (c) =>
                  c.healthCheck.recommendedStatus === "HEALTHY" ||
                  c.healthCheck.recommendedStatus === "UPDATED"
              ).length}개)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {contents
                .filter(
                  (c) =>
                    c.healthCheck.recommendedStatus === "HEALTHY" ||
                    c.healthCheck.recommendedStatus === "UPDATED"
                )
                .slice(0, 5)
                .map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-1.5 text-sm"
                  >
                    <span className="truncate text-muted-foreground">
                      {item.title ?? "제목 없음"}
                    </span>
                    <span className="text-xs text-green-600 shrink-0 ml-2">
                      {HEALTH_STATUS_LABELS[item.healthCheck.recommendedStatus]}
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
