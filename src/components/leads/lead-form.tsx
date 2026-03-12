"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createLead } from "@/actions/leads";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { Profile, Content } from "@/lib/types/database";

interface LeadFormProps {
  profiles: Profile[];
  contents: Pick<Content, "id" | "title" | "status">[];
}

export function LeadForm({ profiles, contents }: LeadFormProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // 폼 상태
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [source, setSource] = useState<"blog" | "referral" | "other">("blog");
  const [sourceContentId, setSourceContentId] = useState("");
  const [interestedService, setInterestedService] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [notes, setNotes] = useState("");

  function resetForm() {
    setCompanyName("");
    setContactName("");
    setContactInfo("");
    setSource("blog");
    setSourceContentId("");
    setInterestedService("");
    setAssignedTo("");
    setNotes("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!companyName.trim()) {
      toast.error("회사명을 입력해 주세요.");
      return;
    }

    startTransition(async () => {
      const { error } = await createLead({
        company_name: companyName,
        contact_name: contactName || undefined,
        contact_info: contactInfo || undefined,
        source,
        source_content_id: source === "blog" ? sourceContentId || undefined : undefined,
        interested_service: interestedService || undefined,
        assigned_to: assignedTo || undefined,
        notes: notes || undefined,
      });

      if (error) {
        toast.error(error);
      } else {
        toast.success("리드가 추가되었습니다.");
        resetForm();
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="btn btn-primary btn-sm">
          <Plus className="h-4 w-4" />
          리드 추가
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>새 리드 추가</DialogTitle>
          <DialogDescription>
            새로운 리드 정보를 입력하세요.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 회사명 */}
          <div>
            <label className="input-label" htmlFor="company_name">
              회사명 <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <div className="input-wrap">
              <input
                id="company_name"
                className="input-field"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="주식회사 OOO"
                required
              />
            </div>
          </div>

          {/* 담당자명 */}
          <div>
            <label className="input-label" htmlFor="contact_name">담당자명</label>
            <div className="input-wrap">
              <input
                id="contact_name"
                className="input-field"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="홍길동"
              />
            </div>
          </div>

          {/* 연락처 */}
          <div>
            <label className="input-label" htmlFor="contact_info">연락처</label>
            <div className="input-wrap">
              <input
                id="contact_info"
                className="input-field"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                placeholder="010-1234-5678"
              />
            </div>
          </div>

          {/* 유입경로 */}
          <div>
            <label className="input-label">유입경로</label>
            <Select
              value={source}
              onValueChange={(val) => setSource(val as "blog" | "referral" | "other")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blog">블로그</SelectItem>
                <SelectItem value="referral">소개</SelectItem>
                <SelectItem value="other">기타</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 경유글 (블로그일 때만) */}
          {source === "blog" && (
            <div>
              <label className="input-label">경유글</label>
              <Select
                value={sourceContentId}
                onValueChange={setSourceContentId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="경유글 선택 (선택사항)" />
                </SelectTrigger>
                <SelectContent>
                  {contents.map((content) => (
                    <SelectItem key={content.id} value={content.id}>
                      <span className="truncate">
                        [{content.id}] {content.title ?? "제목 없음"}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* 관심서비스 */}
          <div>
            <label className="input-label">관심서비스</label>
            <Select
              value={interestedService}
              onValueChange={setInterestedService}
            >
              <SelectTrigger>
                <SelectValue placeholder="서비스 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tax_consulting">절세 컨설팅</SelectItem>
                <SelectItem value="lab_management">연구소 관리</SelectItem>
                <SelectItem value="venture_cert">벤처인증</SelectItem>
                <SelectItem value="invention_cert">발명인증</SelectItem>
                <SelectItem value="patent">특허</SelectItem>
                <SelectItem value="other">기타</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 담당자 */}
          <div>
            <label className="input-label">담당자</label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger>
                <SelectValue placeholder="담당자 선택" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 메모 */}
          <div>
            <label className="input-label" htmlFor="notes">메모</label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="추가 메모사항..."
              rows={3}
              className="textarea"
            />
          </div>

          <DialogFooter>
            <button
              type="button"
              className="btn btn-secondary btn-md"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              취소
            </button>
            <button type="submit" className="btn btn-primary btn-md" disabled={isPending}>
              {isPending ? "저장 중..." : "추가"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
