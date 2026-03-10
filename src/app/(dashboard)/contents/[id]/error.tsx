"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, ArrowLeft, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ContentDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center space-y-4">
          <AlertTriangle className="h-12 w-12 mx-auto text-[var(--semantic-warning)]" />
          <h2 className="text-lg font-semibold">페이지 로딩 중 오류가 발생했습니다</h2>
          <p className="text-sm text-muted-foreground">
            {error?.message || "콘텐츠를 불러오는 중 문제가 발생했습니다."}
          </p>
          <div className="flex gap-2 justify-center pt-2">
            <Button variant="outline" onClick={() => router.push("/contents")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              목록으로
            </Button>
            <Button onClick={() => reset()}>
              <RotateCcw className="h-4 w-4 mr-1" />
              다시 시도
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
