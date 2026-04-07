"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/empty-state";
import { collectNews, summarizeNewsForBlog } from "@/actions/news-search";
import type { NewsItem } from "@/lib/types/database";
import { Newspaper, RefreshCw, Sparkles, PenLine, Loader2 } from "lucide-react";

interface NewsFeedProps {
  initialNews: NewsItem[];
}

export function NewsFeed({ initialNews }: NewsFeedProps) {
  const [news, setNews] = useState<NewsItem[]>(initialNews);
  const [isCollecting, startCollecting] = useTransition();
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);

  function handleCollect() {
    startCollecting(async () => {
      const result = await collectNews();
      if (result.success) {
        // 페이지 새로고침으로 최신 데이터 반영
        window.location.reload();
      }
    });
  }

  async function handleAnalyze(newsId: number) {
    setAnalyzingId(newsId);
    try {
      const result = await summarizeNewsForBlog(newsId);
      if (result.success) {
        setNews((prev) =>
          prev.map((n) =>
            n.id === newsId
              ? { ...n, ai_summary: result.summary ?? null, blog_angle: result.angle ?? null }
              : n
          )
        );
      }
    } finally {
      setAnalyzingId(null);
    }
  }

  function handleWriteFromNews(item: NewsItem) {
    const topic = item.title;
    const context = item.ai_summary
      ? `뉴스 요약: ${item.ai_summary}\n블로그 각도: ${item.blog_angle ?? ""}`
      : `뉴스: ${item.title}\n${item.description ?? ""}`;
    const params = new URLSearchParams({
      action: "ai-draft",
      topic,
      context,
    });
    window.location.href = `/contents?${params.toString()}`;
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Newspaper className="h-4 w-4" />
            IP·세제 뉴스
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCollect}
            disabled={isCollecting}
          >
            {isCollecting ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            새로고침
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {news.length === 0 ? (
          <EmptyState
            icon={<Newspaper className="h-8 w-8 text-muted-foreground" />}
            title="이번 주 관련 뉴스가 없습니다"
            description="직접 검색하려면 AI 초안 생성의 뉴스 탭을 이용하세요"
          />
        ) : (
          <div className="space-y-3">
            {news.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border p-3 space-y-2"
              >
                {/* 제목 + 메타 */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium hover:underline line-clamp-2"
                    >
                      {item.title}
                    </a>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        {item.search_keyword}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(item.pub_date ?? item.created_at)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* AI 분석 결과 */}
                {item.ai_summary && (
                  <div className="rounded bg-muted/50 p-2 text-xs space-y-1">
                    <p className="text-muted-foreground">{item.ai_summary}</p>
                    {item.blog_angle && (
                      <p className="text-primary font-medium">{item.blog_angle}</p>
                    )}
                  </div>
                )}

                {/* 액션 버튼 */}
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleAnalyze(item.id)}
                    disabled={analyzingId === item.id}
                  >
                    {analyzingId === item.id ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Sparkles className="h-3 w-3 mr-1" />
                    )}
                    AI 분석
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleWriteFromNews(item)}
                  >
                    <PenLine className="h-3 w-3 mr-1" />
                    이 뉴스로 글쓰기
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
