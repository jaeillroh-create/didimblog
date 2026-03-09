"use client";

import { useState, useTransition } from "react";
import { type CtaTemplate, updateCtaTemplate } from "@/actions/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Megaphone, Pencil, ChevronDown, ChevronRight, Info } from "lucide-react";

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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            CTA 템플릿 관리
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {templates.map((template) => {
            const isExpanded = expandedKey === template.key;
            const isNoCta = !template.text && template.note;

            return (
              <Card key={template.key} className="border">
                <button
                  type="button"
                  className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => toggleExpand(template.key)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-medium">{template.categoryName}</span>
                    {isNoCta && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        CTA 없음
                      </Badge>
                    )}
                    {template.emailSubjectTag && (
                      <Badge variant="secondary" className="text-xs">
                        {template.emailSubjectTag}
                      </Badge>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4">
                    <Separator />

                    {isNoCta ? (
                      <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3">
                        <Info className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
                        <p className="text-sm text-muted-foreground">{template.note}</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">CTA 문구</Label>
                          <pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm font-mono">
                            {template.text}
                          </pre>
                        </div>
                      </div>
                    )}

                    <div>
                      <Label className="text-xs text-muted-foreground">전환 방법</Label>
                      <p className="mt-1 text-sm">{template.conversionMethod}</p>
                    </div>

                    {template.emailSubjectTag && (
                      <div>
                        <Label className="text-xs text-muted-foreground">이메일 제목 태그</Label>
                        <p className="mt-1 text-sm">{template.emailSubjectTag}</p>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(template)}
                        disabled={isPending}
                      >
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        수정
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              CTA 템플릿 수정 — {editTarget?.categoryName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cta-text">CTA 문구</Label>
              <textarea
                id="cta-text"
                className="flex min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                placeholder="CTA 문구를 입력하세요..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conversion-method">전환 방법</Label>
              <Input
                id="conversion-method"
                value={editConversionMethod}
                onChange={(e) => setEditConversionMethod(e.target.value)}
                placeholder="전환 방법을 입력하세요..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-tag">이메일 제목 태그 (선택)</Label>
              <Input
                id="email-tag"
                value={editEmailTag}
                onChange={(e) => setEditEmailTag(e.target.value)}
                placeholder="이메일 제목 태그를 입력하세요..."
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
