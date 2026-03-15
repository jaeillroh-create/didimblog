"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/common/empty-state";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { createSeries, deleteSeries } from "@/actions/manage";
import type { Series } from "@/lib/types/database";
import { BookOpen, Plus, Trash2, BarChart3 } from "lucide-react";
import { toast } from "sonner";

interface SeriesTabProps {
  seriesList: (Series & { contentCount: number; publishedCount: number })[];
}

export function SeriesTab({ seriesList: initialList }: SeriesTabProps) {
  const [seriesList, setSeriesList] = useState(initialList);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTotal, setNewTotal] = useState("3");
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error("시리즈 이름을 입력해주세요.");
      return;
    }
    setIsCreating(true);
    try {
      const { data, error } = await createSeries(
        newName.trim(),
        parseInt(newTotal) || 3
      );
      if (error) {
        toast.error(error);
      } else if (data) {
        toast.success("시리즈가 생성되었습니다.");
        setSeriesList((prev) => [
          { ...data, contentCount: 0, publishedCount: 0 },
          ...prev,
        ]);
        setNewName("");
        setNewTotal("3");
        setShowCreate(false);
      }
    } catch {
      toast.error("시리즈 생성에 실패했습니다.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { success, error } = await deleteSeries(deleteTarget);
    if (success) {
      toast.success("시리즈가 삭제되었습니다.");
      setSeriesList((prev) => prev.filter((s) => s.id !== deleteTarget));
    } else {
      toast.error(error ?? "삭제에 실패했습니다.");
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4">
      {/* 생성 버튼 */}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="h-4 w-4 mr-1" />
          새 시리즈
        </Button>
      </div>

      {/* 생성 폼 */}
      {showCreate && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-end gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="seriesName">시리즈 이름</Label>
                <Input
                  id="seriesName"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="예: 스타트업 특허 전략 시리즈"
                />
              </div>
              <div className="w-32 space-y-2">
                <Label htmlFor="totalPlanned">계획 편수</Label>
                <Input
                  id="totalPlanned"
                  type="number"
                  min="1"
                  max="20"
                  value={newTotal}
                  onChange={(e) => setNewTotal(e.target.value)}
                />
              </div>
              <Button onClick={handleCreate} disabled={isCreating}>
                {isCreating ? "생성 중..." : "생성"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 시리즈 목록 */}
      {seriesList.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<BookOpen className="h-8 w-8 text-muted-foreground" />}
              title="시리즈가 없습니다"
              description="관련 글을 시리즈로 묶어 관리하세요. 새 시리즈를 만들어보세요."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {seriesList.map((series) => {
            const progress =
              series.total_planned > 0
                ? Math.round(
                    (series.publishedCount / series.total_planned) * 100
                  )
                : 0;

            return (
              <Card key={series.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm font-medium">
                      {series.name}
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                      onClick={() => setDeleteTarget(series.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <BarChart3 className="h-3.5 w-3.5" />
                    <span>
                      발행 {series.publishedCount} / 계획{" "}
                      {series.total_planned}편
                    </span>
                    <span className="ml-auto font-medium">{progress}%</span>
                  </div>
                  {/* 프로그레스 바 */}
                  <div className="w-full h-2 rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(progress, 100)}%`,
                        background:
                          progress >= 100
                            ? "var(--success, #22c55e)"
                            : "var(--brand, #1B3A5C)",
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    전체 등록 {series.contentCount}편
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 삭제 확인 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="시리즈 삭제"
        description="이 시리즈를 삭제하시겠습니까? 시리즈에 속한 글들의 시리즈 연결이 해제됩니다."
        confirmLabel="삭제"
        onConfirm={handleDelete}
      />
    </div>
  );
}
