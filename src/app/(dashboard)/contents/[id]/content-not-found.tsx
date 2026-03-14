"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, FileX } from "lucide-react";

export function ContentNotFound() {
  const router = useRouter();

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full">
        <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8">
          <FileX className="h-16 w-16 text-muted-foreground" />
          <h2 className="text-xl font-semibold">콘텐츠를 찾을 수 없습니다</h2>
          <p className="text-sm text-muted-foreground text-center">
            요청하신 콘텐츠가 존재하지 않거나 삭제되었습니다.
          </p>
          <Button
            variant="outline"
            onClick={() => router.push("/contents")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            콘텐츠 목록으로 돌아가기
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
