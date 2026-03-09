import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Supabase auth 쿠키 존재 여부로 세션 확인
  // @supabase/ssr은 Edge Runtime에서 호환 문제가 있으므로 쿠키 직접 확인
  const hasAuthCookie = request.cookies
    .getAll()
    .some(
      (cookie) =>
        cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token")
    );

  const isLoginPage = request.nextUrl.pathname.startsWith("/login");
  const isAuthCallback = request.nextUrl.pathname.startsWith("/auth");

  // 인증 쿠키가 없고 로그인/auth 페이지가 아니면 리다이렉트
  if (!hasAuthCookie && !isLoginPage && !isAuthCallback) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * 다음으로 시작하는 경로를 제외한 모든 요청에 매칭:
     * - _next/static (정적 파일)
     * - _next/image (이미지 최적화)
     * - favicon.ico (파비콘)
     * - public 폴더의 정적 파일들
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
