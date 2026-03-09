"use client";

import { useState, useTransition } from "react";
import {
  type StateTransition,
  type EntityType,
} from "@/lib/types/database";
import {
  updateStateTransition,
  createStateTransition,
  deleteStateTransition,
} from "@/actions/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { toast } from "sonner";
import { GitBranch, Pencil, Trash2, Plus, ArrowRight } from "lucide-react";
import { CONTENT_STATES } from "@/lib/constants/content-states";

const STATUS_COLORS: Record<string, string> = {
  S0: CONTENT_STATES.S0.color,
  S1: CONTENT_STATES.S1.color,
  S2: CONTENT_STATES.S2.color,
  S3: CONTENT_STATES.S3.color,
  S4: CONTENT_STATES.S4.color,
  S5: CONTENT_STATES.S5.color,
};

const STATUS_LABELS: Record<string, string> = {
  S0: "기획중",
  S1: "초안완료",
  S2: "검토완료",
  S3: "발행예정",
  S4: "발행완료",
  S5: "성과측정",
};

function StatusBadgeInline({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "#6b7280";
  const label = STATUS_LABELS[status] ?? status;

  return (
    <Badge
      variant="outline"
      className="border-transparent font-medium text-xs px-2 py-0.5"
      style={{
        backgroundColor: `${color}20`,
        color: color,
      }}
    >
      {label}
    </Badge>
  );
}

interface StateTransitionEditorProps {
  initialTransitions: StateTransition[];
}

type EditFormData = {
  entity_type: EntityType;
  from_status: string;
  to_status: string;
  conditions: string;
  auto_checks: string;
  description: string;
  is_reversible: boolean;
};

const EMPTY_FORM: EditFormData = {
  entity_type: "content",
  from_status: "",
  to_status: "",
  conditions: "{}",
  auto_checks: "",
  description: "",
  is_reversible: false,
};

export function StateTransitionEditor({
  initialTransitions,
}: StateTransitionEditorProps) {
  const [transitions, setTransitions] =
    useState<StateTransition[]>(initialTransitions);
  const [activeTab, setActiveTab] = useState<string>("content");
  const [editTarget, setEditTarget] = useState<StateTransition | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<EditFormData>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<StateTransition | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredTransitions = transitions.filter(
    (t) => t.entity_type === activeTab
  );

  function openEdit(transition: StateTransition) {
    setEditTarget(transition);
    setIsCreating(false);
    setFormData({
      entity_type: transition.entity_type,
      from_status: transition.from_status,
      to_status: transition.to_status,
      conditions: JSON.stringify(transition.conditions ?? {}, null, 2),
      auto_checks: transition.auto_checks.join(", "),
      description: transition.description ?? "",
      is_reversible: transition.is_reversible,
    });
  }

  function openCreate() {
    setEditTarget(null);
    setIsCreating(true);
    setFormData({
      ...EMPTY_FORM,
      entity_type: activeTab as EntityType,
    });
  }

  function handleSave() {
    let parsedConditions: Record<string, unknown>;
    try {
      parsedConditions = JSON.parse(formData.conditions);
    } catch {
      toast.error("조건(JSON) 형식이 올바르지 않습니다.");
      return;
    }

    const autoChecks = formData.auto_checks
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      entity_type: formData.entity_type,
      from_status: formData.from_status,
      to_status: formData.to_status,
      conditions: parsedConditions,
      auto_checks: autoChecks,
      description: formData.description || null,
      is_reversible: formData.is_reversible,
    };

    if (isCreating) {
      startTransition(async () => {
        const { data, error } = await createStateTransition(payload);
        if (error) {
          toast.error(error);
          return;
        }
        if (data) {
          setTransitions((prev) => [...prev, data]);
        }
        toast.success("상태 전이 규칙이 추가되었습니다.");
        setIsCreating(false);
      });
    } else if (editTarget) {
      const id = editTarget.id;
      startTransition(async () => {
        const { error } = await updateStateTransition(id, payload);
        if (error) {
          toast.error(error);
          return;
        }
        setTransitions((prev) =>
          prev.map((t) => (t.id === id ? { ...t, ...payload } : t))
        );
        toast.success("상태 전이 규칙이 수정되었습니다.");
        setEditTarget(null);
      });
    }
  }

  function handleDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;

    startTransition(async () => {
      const { error } = await deleteStateTransition(id);
      if (error) {
        toast.error(error);
        return;
      }
      setTransitions((prev) => prev.filter((t) => t.id !== id));
      toast.success("상태 전이 규칙이 삭제되었습니다.");
      setDeleteTarget(null);
    });
  }

  const dialogOpen = !!editTarget || isCreating;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              상태 전이 규칙
            </CardTitle>
            <Button size="sm" onClick={openCreate} disabled={isPending}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              규칙 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="space-y-4"
          >
            <TabsList>
              <TabsTrigger value="content">콘텐츠</TabsTrigger>
              <TabsTrigger value="lead">리드</TabsTrigger>
            </TabsList>

            <TabsContent value="content">
              <TransitionTable
                transitions={filteredTransitions}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
                isPending={isPending}
              />
            </TabsContent>

            <TabsContent value="lead">
              <TransitionTable
                transitions={filteredTransitions}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
                isPending={isPending}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null);
            setIsCreating(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              {isCreating ? "상태 전이 규칙 추가" : "상태 전이 규칙 수정"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="from-status">이전 상태</Label>
                <Select
                  value={formData.from_status}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, from_status: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="선택..." />
                  </SelectTrigger>
                  <SelectContent>
                    {["S0", "S1", "S2", "S3", "S4", "S5"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s] ?? s} ({s})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="to-status">다음 상태</Label>
                <Select
                  value={formData.to_status}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, to_status: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="선택..." />
                  </SelectTrigger>
                  <SelectContent>
                    {["S0", "S1", "S2", "S3", "S4", "S5"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s] ?? s} ({s})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="conditions">조건 (JSON)</Label>
              <textarea
                id="conditions"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                value={formData.conditions}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, conditions: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="auto-checks">자동 검사 (쉼표 구분)</Label>
              <Input
                id="auto-checks"
                value={formData.auto_checks}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    auto_checks: e.target.value,
                  }))
                }
                placeholder="예: seo_check, review_exists"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">설명</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="전이 규칙에 대한 설명"
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="is-reversible"
                checked={formData.is_reversible}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({
                    ...prev,
                    is_reversible: !!checked,
                  }))
                }
              />
              <Label htmlFor="is-reversible" className="cursor-pointer">
                역행 가능
              </Label>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setEditTarget(null);
                setIsCreating(false);
              }}
            >
              취소
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isCreating ? "추가" : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="규칙 삭제"
        description={`"${deleteTarget?.description ?? "이 규칙"}"을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        confirmLabel="삭제"
        cancelLabel="취소"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </>
  );
}

function TransitionTable({
  transitions,
  onEdit,
  onDelete,
  isPending,
}: {
  transitions: StateTransition[];
  onEdit: (t: StateTransition) => void;
  onDelete: (t: StateTransition) => void;
  isPending: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>이전 상태</TableHead>
          <TableHead className="w-[30px]" />
          <TableHead>다음 상태</TableHead>
          <TableHead>조건</TableHead>
          <TableHead>자동 검사</TableHead>
          <TableHead>역행</TableHead>
          <TableHead>설명</TableHead>
          <TableHead className="w-[80px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {transitions.map((t) => (
          <TableRow key={t.id}>
            <TableCell>
              <StatusBadgeInline status={t.from_status} />
            </TableCell>
            <TableCell>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </TableCell>
            <TableCell>
              <StatusBadgeInline status={t.to_status} />
            </TableCell>
            <TableCell>
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                {JSON.stringify(t.conditions ?? {})}
              </code>
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {t.auto_checks.map((check) => (
                  <Badge key={check} variant="secondary" className="text-xs">
                    {check}
                  </Badge>
                ))}
                {t.auto_checks.length === 0 && (
                  <span className="text-xs text-muted-foreground">없음</span>
                )}
              </div>
            </TableCell>
            <TableCell>
              {t.is_reversible ? (
                <Badge
                  variant="outline"
                  className="bg-green-50 text-green-700 border-green-200 text-xs"
                >
                  Y
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-gray-50 text-gray-500 border-gray-200 text-xs"
                >
                  N
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
              {t.description ?? "-"}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onEdit(t)}
                  disabled={isPending}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => onDelete(t)}
                  disabled={isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
        {transitions.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={8}
              className="text-center text-muted-foreground py-8"
            >
              등록된 상태 전이 규칙이 없습니다.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
