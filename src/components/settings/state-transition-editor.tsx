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

const STATUS_BADGE_MAP: Record<string, string> = {
  S0: "badge-neutral",
  S1: "badge-info",
  S2: "badge-brand",
  S3: "badge-warning",
  S4: "badge-success",
  S5: "badge-brand",
};

function StatusBadgeInline({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  const badgeClass = STATUS_BADGE_MAP[status] ?? "badge-neutral";

  return (
    <span className={`ucl-badge ucl-badge-sm badge-dot ${badgeClass}`}>
      {label}
    </span>
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
      <div className="scard">
        <div className="scard-head">
          <div className="scard-head-left">
            <GitBranch className="h-5 w-5" style={{ color: "var(--g500)" }} />
            <span className="scard-head-title">상태 전이 규칙</span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={openCreate} disabled={isPending}>
            <Plus className="h-3.5 w-3.5" />
            규칙 추가
          </button>
        </div>
        <div className="scard-body">
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
        </div>
      </div>

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
              <div>
                <label className="input-label">이전 상태</label>
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
              <div>
                <label className="input-label">다음 상태</label>
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

            <div>
              <label className="input-label" htmlFor="conditions">조건 (JSON)</label>
              <textarea
                id="conditions"
                className="textarea font-mono"
                style={{ minHeight: 80 }}
                value={formData.conditions}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, conditions: e.target.value }))
                }
              />
            </div>

            <div>
              <label className="input-label" htmlFor="auto-checks">자동 검사 (쉼표 구분)</label>
              <div className="input-wrap">
                <input
                  id="auto-checks"
                  className="input-field"
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
            </div>

            <div>
              <label className="input-label" htmlFor="description">설명</label>
              <div className="input-wrap">
                <input
                  id="description"
                  className="input-field"
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
              <label htmlFor="is-reversible" className="cursor-pointer t-sm" style={{ color: "var(--g700)" }}>
                역행 가능
              </label>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              className="btn btn-secondary btn-md"
              onClick={() => {
                setEditTarget(null);
                setIsCreating(false);
              }}
            >
              취소
            </button>
            <button className="btn btn-primary btn-md" onClick={handleSave} disabled={isPending}>
              {isCreating ? "추가" : "저장"}
            </button>
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
              <ArrowRight className="h-3.5 w-3.5" style={{ color: "var(--g400)" }} />
            </TableCell>
            <TableCell>
              <StatusBadgeInline status={t.to_status} />
            </TableCell>
            <TableCell>
              <code
                className="t-xs font-mono px-1.5 py-0.5"
                style={{ background: "var(--g100)", borderRadius: "var(--r-xs)", color: "var(--g700)" }}
              >
                {JSON.stringify(t.conditions ?? {})}
              </code>
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {t.auto_checks.map((check) => (
                  <span key={check} className="ucl-badge ucl-badge-sm badge-neutral">
                    {check}
                  </span>
                ))}
                {t.auto_checks.length === 0 && (
                  <span className="t-xs" style={{ color: "var(--g400)" }}>없음</span>
                )}
              </div>
            </TableCell>
            <TableCell>
              {t.is_reversible ? (
                <span className="ucl-badge ucl-badge-sm badge-success">Y</span>
              ) : (
                <span className="ucl-badge ucl-badge-sm badge-neutral">N</span>
              )}
            </TableCell>
            <TableCell>
              <span className="t-sm max-w-[200px] truncate block" style={{ color: "var(--g500)" }}>
                {t.description ?? "-"}
              </span>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <button
                  className="icon-btn"
                  style={{ width: 28, height: 28 }}
                  onClick={() => onEdit(t)}
                  disabled={isPending}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  className="icon-btn"
                  style={{ width: 28, height: 28, color: "var(--g400)" }}
                  onClick={() => onDelete(t)}
                  disabled={isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </TableCell>
          </TableRow>
        ))}
        {transitions.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={8}
              className="text-center py-8"
              style={{ color: "var(--g400)" }}
            >
              등록된 상태 전이 규칙이 없습니다.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
