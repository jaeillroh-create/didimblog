import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Supabase 세션 갱신 미들웨어 유틸
 * @supabase/ssr 공식 가이드 기준 구현
 * https://supabase.com/docs/guides/auth/server-side/nextjs
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: createServerClient와 supabase.auth.getUser() 사이에
  // 다른 로직을 넣지 말 것. 단순해 보여도 디버깅이 매우 어려운 문제를 유발할 수 있음.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 미인증 사용자를 로그인 페이지로 리다이렉트
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // IMPORTANT: supabaseResponse 객체를 그대로 반환해야 함.
  // NextResponse.next()로 새로 만들면 쿠키가 유실되어 세션이 끊길 수 있음.
  return supabaseResponse;
}
