import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const isProtected = pathname.startsWith("/plan") || pathname.startsWith("/history");
  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register");

  const cookieHeader = request.headers.get("cookie") ?? "";

  try {
    // בדיקה אם המשתמש מחובר (access token)
    const meResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/me`, {
      method: "GET",
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });

    // אם זה דף login/register
    if (isAuthPage) {
      if (meResponse.ok) {
        return NextResponse.redirect(new URL("/plan", request.url));
      }
      return NextResponse.next();
    }

    // אם זה דף מוגן
    if (isProtected) {
      if (meResponse.ok) {
        return NextResponse.next();
      }

      // אם access פג → מנסים refresh
      const refreshResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`, {
        method: "POST",
        headers: { cookie: cookieHeader },
        cache: "no-store",
      });

      if (!refreshResponse.ok) {
        return NextResponse.redirect(new URL("/login", request.url));
      }

      // אם refresh הצליח → להעביר cookies חדשים
      const response = NextResponse.next();

      // ✅ ב-Next: יכול להגיע יותר מ-set-cookie אחד
      const anyHeaders = refreshResponse.headers as any;
      const setCookies: string[] = anyHeaders.getSetCookie?.() ?? [];

      for (const c of setCookies) {
        response.headers.append("set-cookie", c);
      }

      // fallback אם אין getSetCookie
      if (setCookies.length === 0) {
        const single = refreshResponse.headers.get("set-cookie");
        if (single) response.headers.append("set-cookie", single);
      }

      return response;
    }

    // כל שאר הדפים
    return NextResponse.next();
  } catch (error) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/plan/:path*", "/history/:path*", "/login", "/register"],
};