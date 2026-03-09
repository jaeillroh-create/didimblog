"use client";

import { useState, useTransition } from "react";
import { type Profile, type UserRole } from "@/lib/types/database";
import { updateMemberRole, removeMember } from "@/actions/settings";
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
import { Trash2, Users } from "lucide-react";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "관리자",
  editor: "편집자",
  designer: "디자이너",
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: "bg-primary/10 text-primary",
  editor: "bg-blue-100 text-blue-700",
  designer: "bg-purple-100 text-purple-700",
};

interface TeamManagementProps {
  initialMembers: Profile[];
}

export function TeamManagement({ initialMembers }: TeamManagementProps) {
  const [members, setMembers] = useState<Profile[]>(initialMembers);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
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

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  return (
    <>
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
                            className={`border-transparent ${ROLE_COLORS[member.role]}`}
                          >
                            {ROLE_LABELS[member.role]}
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
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    등록된 팀 멤버가 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
    </>
  );
}
