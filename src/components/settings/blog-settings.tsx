"use client";

import { useState, useMemo, useTransition } from "react";
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

  // 현재 주차 계산 — suppressHydrationWarning으로 서버/클라이언트 차이 허용
  const currentWeek = useMemo(() => {
    const today = new Date();
    const start = new Date(startDate);
    const diffDays = (today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    return Math.ceil(diffDays / 7);
  }, [startDate]);

  return (
    <div className="space-y-6">
      <div className="scard">
        <div className="scard-head">
          <div className="scard-head-left">
            <Calendar className="h-5 w-5" style={{ color: "var(--g500)" }} />
            <span className="scard-head-title">블로그 스케줄 설정</span>
          </div>
        </div>
        <div className="scard-body space-y-4">
          <div>
            <label className="input-label" htmlFor="blog-start-date">블로그 시작일</label>
            <p className="t-xs mb-2" style={{ color: "var(--g400)" }}>
              12주 콘텐츠 스케줄의 기준일입니다. 시작일로부터 주차를 자동 계산합니다.
            </p>
            <div className="flex items-center gap-3">
              <div className="input-wrap" style={{ width: 192 }}>
                <input
                  id="blog-start-date"
                  type="date"
                  className="input-field"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSave}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : saved ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : null}
                {saved ? "저장됨" : "저장"}
              </button>
            </div>
            {error && (
              <p className="input-error">{error}</p>
            )}
          </div>

          <div className="p-3 space-y-1" style={{ background: "var(--g50)", borderRadius: "var(--r-md)" }}>
            <p className="t-sm" style={{ fontWeight: 600, color: "var(--g900)" }}>현재 상태</p>
            <div className="flex items-center gap-4 t-xs" style={{ color: "var(--g400)" }} suppressHydrationWarning>
              <span>시작일: {startDate}</span>
              <span>현재 주차: <span className="font-num" style={{ fontWeight: 700 }}>W{currentWeek > 0 ? currentWeek : "-"}</span></span>
              <span>
                {currentWeek > 12
                  ? "Phase 1 완료"
                  : currentWeek > 0
                    ? `Phase 1 진행 중 (${Math.round((currentWeek / 12) * 100)}%)`
                    : "시작 전"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
