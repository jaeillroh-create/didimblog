import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import type { TopPerformingPost } from "@/actions/recommendations";
import { Trophy, Eye, MessageCircle } from "lucide-react";

interface TopPostsProps {
  posts: TopPerformingPost[];
}

export function TopPosts({ posts }: TopPostsProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4" />
          TOP 성과 글 (조회수 기준)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {posts.length === 0 ? (
          <EmptyState
            icon={<Trophy className="h-8 w-8 text-muted-foreground" />}
            title="성과 데이터가 없습니다"
            description="글을 발행하고 성과 데이터를 입력하면 여기에 TOP 성과 글이 표시됩니다"
          />
        ) : (
          <div className="space-y-2">
            {posts.map((post, idx) => (
              <Link
                key={post.id}
                href={`/contents/${post.id}`}
                className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <span className="text-lg font-bold text-muted-foreground w-6 text-center flex-shrink-0">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{post.title}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Eye className="h-3 w-3" />
                      조회 {post.views.toLocaleString()}
                    </span>
                    {post.consultations > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <MessageCircle className="h-3 w-3" />
                        상담 {post.consultations}건
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
