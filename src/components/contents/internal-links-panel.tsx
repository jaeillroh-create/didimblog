"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getInternalLinkSuggestions } from "@/actions/manage";
import type { InternalLinkSuggestion } from "@/lib/internal-link-recommender";
import { Link2, ExternalLink, Copy, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface InternalLinksPanelProps {
  contentId: string;
}

export function InternalLinksPanel({ contentId }: InternalLinksPanelProps) {
  const [suggestions, setSuggestions] = useState<InternalLinkSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { suggestions: data } = await getInternalLinkSuggestions(contentId);
      setSuggestions(data);
      setLoading(false);
    }
    load();
  }, [contentId]);

  const handleCopyTitle = (title: string) => {
    navigator.clipboard.writeText(title);
    toast.success("제목이 복사되었습니다.");
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            내부 링크 추천
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (suggestions.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            내부 링크 추천
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            추천할 관련 글이 없습니다.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          내부 링크 추천
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {suggestions.map((s) => (
          <div
            key={s.contentId}
            className="flex items-center justify-between py-2 border-b last:border-0"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{s.title}</p>
              <p className="text-xs text-muted-foreground">{s.reason}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => handleCopyTitle(s.title)}
                title="제목 복사"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Link href={`/contents/${s.contentId}`}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  title="글 보기"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
