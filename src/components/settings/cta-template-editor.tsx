"use client";

import { useState, useTransition } from "react";
import { type CtaTemplate, updateCtaTemplate } from "@/actions/settings";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, ChevronDown, ChevronRight, Info } from "lucide-react";

interface CtaTemplateEditorProps {
  initialTemplates: CtaTemplate[];
}

export function CtaTemplateEditor({ initialTemplates }: CtaTemplateEditorProps) {
  const [templates, setTemplates] = useState<CtaTemplate[]>(initialTemplates);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<CtaTemplate | null>(null);
  const [editText, setEditText] = useState("");
  const [editConversionMethod, setEditConversionMethod] = useState("");
  const [editEmailTag, setEditEmailTag] = useState("");
  const [isPending, startTransition] = useTransition();

  function openEdit(template: CtaTemplate) {
    setEditTarget(template);
    setEditText(template.text ?? "");
    setEditConversionMethod(template.conversionMethod);
    setEditEmailTag(template.emailSubjectTag ?? "");
  }

  function handleSave() {
    if (!editTarget) return;
    const key = editTarget.key;

    startTransition(async () => {
      const { error } = await updateCtaTemplate(key, {
        text: editText || null,
        conversionMethod: editConversionMethod,
        emailSubjectTag: editEmailTag || null,
      });

      if (error) {
        toast.error(error);
        return;
      }

      setTemplates((prev) =>
        prev.map((t) =>
          t.key === key
            ? {
                ...t,
                text: editText || null,
                conversionMethod: editConversionMethod,
                emailSubjectTag: editEmailTag || null,
              }
            : t
        )
      );
      toast.success("CTA 템플릿이 수정되었습니다.");
      setEditTarget(null);
    });
  }

  function toggleExpand(key: string) {
    setExpandedKey((prev) => (prev === key ? null : key));
  }

  return (
    <>
      <div className="scard">
        <div className="scard-head">
          <div className="scard-head-left">
            <span className="tf tf-14">📢</span>
            <span className="scard-head-title">CTA 템플릿 관리</span>
          </div>
        </div>
        <div className="scard-body space-y-3">
          {templates.map((template) => {
            const isExpanded = expandedKey === template.key;
            const isNoCta = !template.text && template.note;

            return (
              <div
                key={template.key}
                className="card-default"
                style={{ border: "1px solid var(--g200)", borderRadius: "var(--r-md)" }}
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between p-4 text-left transition-colors"
                  onClick={() => toggleExpand(template.key)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" style={{ color: "var(--g400)" }} />
                    ) : (
                      <ChevronRight className="h-4 w-4" style={{ color: "var(--g400)" }} />
                    )}
                    <span className="t-md">{template.categoryName}</span>
                    {isNoCta && (
                      <span className="ucl-badge ucl-badge-sm badge-neutral">
                        CTA 없음
                      </span>
                    )}
                    {template.emailSubjectTag && (
                      <span className="ucl-badge ucl-badge-sm badge-brand">
                        {template.emailSubjectTag}
                      </span>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4">
                    <div className="divider" />

                    {isNoCta ? (
                      <div
                        className="flex items-start gap-2 p-3"
                        style={{ background: "var(--g50)", borderRadius: "var(--r-sm)" }}
                      >
                        <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--g400)" }} />
                        <p className="t-sm" style={{ color: "var(--g500)" }}>{template.note}</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="input-label">CTA 문구</label>
                          <pre
                            className="mt-1 whitespace-pre-wrap p-3 t-sm font-mono"
                            style={{ background: "var(--g50)", borderRadius: "var(--r-sm)" }}
                          >
                            {template.text}
                          </pre>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="input-label">전환 방법</label>
                      <p className="mt-1 t-sm" style={{ color: "var(--g700)" }}>{template.conversionMethod}</p>
                    </div>

                    {template.emailSubjectTag && (
                      <div>
                        <label className="input-label">이메일 제목 태그</label>
                        <p className="mt-1 t-sm" style={{ color: "var(--g700)" }}>{template.emailSubjectTag}</p>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => openEdit(template)}
                        disabled={isPending}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        수정
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              CTA 템플릿 수정 — {editTarget?.categoryName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="input-label">CTA 문구</label>
              <textarea
                id="cta-text"
                className="textarea font-mono"
                style={{ minHeight: 160 }}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                placeholder="CTA 문구를 입력하세요..."
              />
            </div>
            <div>
              <label className="input-label">전환 방법</label>
              <div className="input-wrap">
                <input
                  id="conversion-method"
                  className="input-field"
                  value={editConversionMethod}
                  onChange={(e) => setEditConversionMethod(e.target.value)}
                  placeholder="전환 방법을 입력하세요..."
                />
              </div>
            </div>
            <div>
              <label className="input-label">이메일 제목 태그 (선택)</label>
              <div className="input-wrap">
                <input
                  id="email-tag"
                  className="input-field"
                  value={editEmailTag}
                  onChange={(e) => setEditEmailTag(e.target.value)}
                  placeholder="이메일 제목 태그를 입력하세요..."
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <button className="btn btn-secondary btn-md" onClick={() => setEditTarget(null)}>
              취소
            </button>
            <button className="btn btn-primary btn-md" onClick={handleSave} disabled={isPending}>
              저장
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
