import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Supabase auth 쿠키 존재 여부로 세션 확인
  // Supabase v2는 sb-<ref>-auth-token 또는 chunked 쿠키(.0, .1 등)를 사용
  const hasAuthCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token"));

  const { pathname } = request.nextUrl;

  // 로그인/auth 경로는 미들웨어 skip
  if (pathname.startsWith("/login") || pathname.startsWith("/auth")) {
    return NextResponse.next();
  }

  // 인증 쿠키가 없으면 로그인으로 리다이렉트
  if (!hasAuthCookie) {
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
