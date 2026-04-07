"use client";

import { Button } from "@/components/ui/button";
import {
  HEALTH_STATUS_LABELS,
} from "@/lib/content-health";
import { updateHealthStatus } from "@/actions/manage";
import type { HealthStatus } from "@/lib/types/database";
import { AlertTriangle, ShieldCheck, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

interface HealthBannerProps {
  contentId: string;
  healthStatus: HealthStatus;
  healthCheckedAt: string | null;
}

export function HealthBanner({
  contentId,
  healthStatus: initialStatus,
  healthCheckedAt,
}: HealthBannerProps) {
  const [status, setStatus] = useState(initialStatus);

  if (status === "HEALTHY" || status === "UPDATED") {
    return null;
  }

  const handleMarkUpdated = async () => {
    const { success, error } = await updateHealthStatus(contentId, "UPDATED");
    if (success) {
      toast.success("업데이트 완료로 표시했습니다.");
      setStatus("UPDATED");
    } else {
      toast.error(error ?? "상태 변경에 실패했습니다.");
    }
  };

  const isUrgent = status === "UPDATE_NEEDED";

  return (
    <div
      className={`rounded-lg border p-4 flex items-center justify-between gap-4 ${
        isUrgent
          ? "bg-red-50 border-red-200"
          : "bg-yellow-50 border-yellow-200"
      }`}
    >
      <div className="flex items-center gap-3">
        {isUrgent ? (
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
        ) : (
          <ShieldCheck className="h-5 w-5 text-yellow-600 shrink-0" />
        )}
        <div>
          <p className={`text-sm font-medium ${isUrgent ? "text-red-700" : "text-yellow-700"}`}>
            {HEALTH_STATUS_LABELS[status]}
          </p>
          <p className="text-xs text-muted-foreground">
            {isUrgent
              ? "이 글은 업데이트가 필요합니다. 내용을 검토하고 최신 정보로 수정해주세요."
              : "이 글은 점검이 필요합니다. 내용이 최신 상태인지 확인해주세요."}
            {healthCheckedAt &&
              ` (마지막 점검: ${healthCheckedAt.substring(0, 10)})`}
          </p>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={handleMarkUpdated}>
        <CheckCircle className="h-3.5 w-3.5 mr-1" />
        업데이트 완료
      </Button>
    </div>
  );
}
