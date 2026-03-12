"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { signUp } from "@/actions/auth";
import { cn } from "@/lib/utils";

type TabType = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("login");
  const [isLoading, setIsLoading] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState("");

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) {
        toast.error("로그인에 실패했습니다", {
          description: error.message,
        });
        return;
      }

      toast.success("로그인 성공");
      router.refresh();
      router.push("/dashboard");
    } catch (error) {
      console.error("로그인 오류:", error);
      toast.error("로그인 중 오류가 발생했습니다");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (signupPassword !== signupPasswordConfirm) {
      toast.error("비밀번호가 일치하지 않습니다");
      return;
    }

    if (signupPassword.length < 6) {
      toast.error("비밀번호는 6자 이상이어야 합니다");
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await signUp({
        name: signupName,
        email: signupEmail,
        password: signupPassword,
      });

      if (error) {
        toast.error("회원가입에 실패했습니다", { description: error });
        return;
      }

      toast.success("회원가입이 완료되었습니다", {
        description: "관리자 승인 후 이용할 수 있습니다.",
      });
      setActiveTab("login");
      setSignupName("");
      setSignupEmail("");
      setSignupPassword("");
      setSignupPasswordConfirm("");
    } catch (error) {
      console.error("회원가입 오류:", error);
      toast.error("회원가입 중 오류가 발생했습니다");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ background: "var(--g50)" }}
    >
      <div
        className="w-full max-w-[400px] p-8"
        style={{
          background: "var(--white)",
          borderRadius: "var(--r-xl)",
          boxShadow: "var(--sh-lg)",
        }}
      >
        {/* 브랜드 로고 영역 */}
        <div className="mb-6 text-center">
          <h1 className="t-3xl" style={{ color: "var(--brand)" }}>
            D!DiM
          </h1>
          <p className="t-md mt-2" style={{ color: "var(--g400)" }}>
            블로그 운영 시스템
          </p>
        </div>

        {/* 탭 전환 — UCL Pill Tab 패턴 */}
        <div className="ucl-tab-pill mb-6">
          <button
            type="button"
            className={cn(
              "ucl-tab-item flex-1",
              activeTab === "login" && "ucl-tab-item-active"
            )}
            onClick={() => setActiveTab("login")}
          >
            로그인
          </button>
          <button
            type="button"
            className={cn(
              "ucl-tab-item flex-1",
              activeTab === "signup" && "ucl-tab-item-active"
            )}
            onClick={() => setActiveTab("signup")}
          >
            회원가입
          </button>
        </div>

        {/* 로그인 폼 */}
        {activeTab === "login" && (
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <div className="input-label">이메일</div>
              <div className={cn("input-wrap", isLoading && "input-wrap-disabled")}>
                <input
                  id="login-email"
                  type="email"
                  placeholder="name@example.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="email"
                  className="input-field"
                />
              </div>
            </div>

            <div>
              <div className="input-label">비밀번호</div>
              <div className={cn("input-wrap", isLoading && "input-wrap-disabled")}>
                <input
                  id="login-password"
                  type="password"
                  placeholder="비밀번호를 입력하세요"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="current-password"
                  className="input-field"
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg btn-full"
              disabled={isLoading}
            >
              <span className="tf tf-16">🚀</span>
              {isLoading ? "로그인 중..." : "로그인"}
            </button>
          </form>
        )}

        {/* 회원가입 폼 */}
        {activeTab === "signup" && (
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <div className="input-label">이름</div>
              <div className={cn("input-wrap", isLoading && "input-wrap-disabled")}>
                <input
                  id="signup-name"
                  type="text"
                  placeholder="홍길동"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="name"
                  className="input-field"
                />
              </div>
            </div>

            <div>
              <div className="input-label">이메일</div>
              <div className={cn("input-wrap", isLoading && "input-wrap-disabled")}>
                <input
                  id="signup-email"
                  type="email"
                  placeholder="name@example.com"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="email"
                  className="input-field"
                />
              </div>
            </div>

            <div>
              <div className="input-label">비밀번호</div>
              <div className={cn("input-wrap", isLoading && "input-wrap-disabled")}>
                <input
                  id="signup-password"
                  type="password"
                  placeholder="6자 이상"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="new-password"
                  minLength={6}
                  className="input-field"
                />
              </div>
            </div>

            <div>
              <div className="input-label">비밀번호 확인</div>
              <div className={cn("input-wrap", isLoading && "input-wrap-disabled")}>
                <input
                  id="signup-password-confirm"
                  type="password"
                  placeholder="비밀번호를 한 번 더 입력하세요"
                  value={signupPasswordConfirm}
                  onChange={(e) => setSignupPasswordConfirm(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="new-password"
                  minLength={6}
                  className="input-field"
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg btn-full"
              disabled={isLoading}
            >
              {isLoading ? "가입 중..." : "회원가입"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
