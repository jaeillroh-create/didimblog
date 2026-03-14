import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import type { UpdateNeededPost } from "@/actions/recommendations";
import { AlertTriangle, Clock } from "lucide-react";

interface UpdateNeededProps {
  posts: UpdateNeededPost[];
}

export function UpdateNeeded({ posts }: UpdateNeededProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          업데이트 필요 글
        </CardTitle>
      </CardHeader>
      <CardContent>
        {posts.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-8 w-8 text-muted-foreground" />}
            title="점검 대상 없음"
            description="아직 업데이트 점검 대상 글이 없습니다"
          />
        ) : (
          <div className="space-y-2">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/contents/${post.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <span className="text-sm font-medium truncate flex-1">
                  {post.title}
                </span>
                <span className="text-xs text-orange-600 font-medium flex-shrink-0">
                  {post.daysSincePublish}일 경과
                </span>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
