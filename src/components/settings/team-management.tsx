"use client";

import { useState, useTransition } from "react";
import { type Profile, type UserRole } from "@/lib/types/database";
import {
  updateMemberRole,
  removeMember,
  approveMember,
  rejectMember,
} from "@/actions/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { toast } from "sonner";
import { Check, Trash2, Users, UserPlus, X } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  admin: "관리자",
  editor: "편집자",
  designer: "디자이너",
  pending: "승인 대기",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-primary/10 text-primary",
  editor: "bg-blue-100 text-blue-700",
  designer: "bg-purple-100 text-purple-700",
  pending: "bg-amber-100 text-amber-700",
};

interface TeamManagementProps {
  initialMembers: Profile[];
  initialPendingMembers: Profile[];
}

export function TeamManagement({
  initialMembers,
  initialPendingMembers,
}: TeamManagementProps) {
  const [members, setMembers] = useState<Profile[]>(initialMembers);
  const [pendingMembers, setPendingMembers] =
    useState<Profile[]>(initialPendingMembers);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Profile | null>(null);
  const [approveRoles, setApproveRoles] = useState<
    Record<string, UserRole>
  >({});
  const [isPending, startTransition] = useTransition();

  function handleRoleChange(userId: string, newRole: UserRole) {
    startTransition(async () => {
      const { error } = await updateMemberRole(userId, newRole);
      if (error) {
        toast.error(error);
        return;
      }
      setMembers((prev) =>
        prev.map((m) => (m.id === userId ? { ...m, role: newRole } : m))
      );
      toast.success("역할이 변경되었습니다.");
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id;

    startTransition(async () => {
      const { error } = await removeMember(targetId);
      if (error) {
        toast.error(error);
        return;
      }
      setMembers((prev) => prev.filter((m) => m.id !== targetId));
      toast.success("멤버가 삭제되었습니다.");
      setDeleteTarget(null);
    });
  }

  function handleApprove(userId: string) {
    const role = approveRoles[userId];
    if (!role || role === "pending") {
      toast.error("역할을 선택해주세요.");
      return;
    }

    startTransition(async () => {
      const { error } = await approveMember(userId, role);
      if (error) {
        toast.error(error);
        return;
      }
      const approved = pendingMembers.find((m) => m.id === userId);
      if (approved) {
        setMembers((prev) => [...prev, { ...approved, role }]);
      }
      setPendingMembers((prev) => prev.filter((m) => m.id !== userId));
      toast.success("멤버가 승인되었습니다.");
    });
  }

  function handleReject() {
    if (!rejectTarget) return;
    const targetId = rejectTarget.id;

    startTransition(async () => {
      const { error } = await rejectMember(targetId);
      if (error) {
        toast.error(error);
        return;
      }
      setPendingMembers((prev) => prev.filter((m) => m.id !== targetId));
      toast.success("가입 요청이 거부되었습니다.");
      setRejectTarget(null);
    });
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  return (
    <>
      {/* 승인 대기 섹션 */}
      {pendingMembers.length > 0 && (
        <Card className="mb-6 border-amber-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <UserPlus className="h-5 w-5" />
              승인 대기 ({pendingMembers.length}명)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>이메일</TableHead>
                  <TableHead>가입일</TableHead>
                  <TableHead>역할 지정</TableHead>
                  <TableHead className="w-[120px]">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingMembers.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs font-medium bg-amber-100 text-amber-700">
                            {member.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{member.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {member.email}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(member.created_at)}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={approveRoles[member.id] ?? ""}
                        onValueChange={(value) =>
                          setApproveRoles((prev) => ({
                            ...prev,
                            [member.id]: value as UserRole,
                          }))
                        }
                        disabled={isPending}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue placeholder="역할 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">관리자</SelectItem>
                          <SelectItem value="editor">편집자</SelectItem>
                          <SelectItem value="designer">디자이너</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={() => handleApprove(member.id)}
                          disabled={isPending || !approveRoles[member.id]}
                          title="승인"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setRejectTarget(member)}
                          disabled={isPending}
                          title="거부"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 기존 팀 멤버 관리 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            팀 멤버 관리
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>멤버</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>역할</TableHead>
                <TableHead>가입일</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs font-medium">
                          {member.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{member.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {member.email}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={member.role}
                      onValueChange={(value) =>
                        handleRoleChange(member.id, value as UserRole)
                      }
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue>
                          <Badge
                            variant="outline"
                            className={`border-transparent ${ROLE_COLORS[member.role] ?? ""}`}
                          >
                            {ROLE_LABELS[member.role] ?? member.role}
                          </Badge>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">관리자</SelectItem>
                        <SelectItem value="editor">편집자</SelectItem>
                        <SelectItem value="designer">디자이너</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(member.created_at)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(member)}
                      disabled={isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {members.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-8"
                  >
                    등록된 팀 멤버가 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 멤버 삭제 확인 */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="멤버 삭제"
        description={`"${deleteTarget?.name}" 멤버를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        confirmLabel="삭제"
        cancelLabel="취소"
        variant="destructive"
        onConfirm={handleDelete}
      />

      {/* 가입 거부 확인 */}
      <ConfirmDialog
        open={!!rejectTarget}
        onOpenChange={(open) => !open && setRejectTarget(null)}
        title="가입 거부"
        description={`"${rejectTarget?.name}" (${rejectTarget?.email})의 가입 요청을 거부하시겠습니까? 프로필이 삭제됩니다.`}
        confirmLabel="거부"
        cancelLabel="취소"
        variant="destructive"
        onConfirm={handleReject}
      />
    </>
  );
}
