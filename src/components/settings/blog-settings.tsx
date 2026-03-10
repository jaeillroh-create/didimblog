"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveBlogStartDate } from "@/actions/ai";
import { Calendar, Loader2, CheckCircle2 } from "lucide-react";

interface BlogSettingsProps {
  initialStartDate: string;
}

export function BlogSettings({ initialStartDate }: BlogSettingsProps) {
  const [startDate, setStartDate] = useState(initialStartDate);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (!startDate) return;

    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveBlogStartDate(startDate);
      if (!result.success) {
        setError(result.error || "저장에 실패했습니다.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  // 현재 주차 계산
  const today = new Date();
  const start = new Date(startDate);
  const diffDays = (today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  const currentWeek = Math.ceil(diffDays / 7);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-5 w-5" />
            블로그 스케줄 설정
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="blog-start-date">블로그 시작일</Label>
            <p className="text-xs text-[var(--neutral-text-muted)]">
              12주 콘텐츠 스케줄의 기준일입니다. 시작일로부터 주차를 자동 계산합니다.
            </p>
            <div className="flex items-center gap-3">
              <Input
                id="blog-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-48"
              />
              <Button
                onClick={handleSave}
                disabled={isPending}
                size="sm"
                style={{ backgroundColor: "var(--brand-accent)" }}
              >
                {isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : saved ? (
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                ) : null}
                {saved ? "저장됨" : "저장"}
              </Button>
            </div>
            {error && (
              <p className="text-xs text-red-600">{error}</p>
            )}
          </div>

          <div className="rounded-md bg-[var(--neutral-surface)] p-3 space-y-1">
            <p className="text-sm font-medium">현재 상태</p>
            <div className="flex items-center gap-4 text-xs text-[var(--neutral-text-muted)]">
              <span>시작일: {startDate}</span>
              <span>현재 주차: W{currentWeek > 0 ? currentWeek : "-"}</span>
              <span>
                {currentWeek > 12
                  ? "Phase 1 완료"
                  : currentWeek > 0
                    ? `Phase 1 진행 중 (${Math.round((currentWeek / 12) * 100)}%)`
                    : "시작 전"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
