"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, LogOut } from "lucide-react";
import { toast } from "sonner";

/** 승인 대기 화면 — pending 상태 사용자에게 표시 */
export default function PendingApprovalPage() {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("로그아웃되었습니다");
    router.refresh();
    router.push("/login");
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ backgroundColor: "var(--neutral-bg, #F8FAFC)" }}
    >
      <Card className="w-full max-w-[460px] p-8 shadow-lg text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
          <Clock className="h-8 w-8 text-amber-600" />
        </div>

        <h1 className="text-xl font-bold text-foreground mb-2">
          관리자 승인 대기중입니다
        </h1>

        <p className="text-muted-foreground mb-6 leading-relaxed">
          회원가입이 완료되었습니다.<br />
          관리자가 계정을 승인하면 시스템을 이용할 수 있습니다.<br />
          승인 후 다시 로그인해 주세요.
        </p>

        <Button
          variant="outline"
          onClick={handleLogout}
          className="gap-2"
        >
          <LogOut className="h-4 w-4" />
          로그아웃
        </Button>
      </Card>
    </div>
  );
}
