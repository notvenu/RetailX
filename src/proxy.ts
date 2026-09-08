import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAccess } from "@/lib/access";
import type { Role } from "@/lib/users";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLogin = pathname === "/login";
  const session = req.auth;

  if (!session) {
    if (isLogin) return NextResponse.next();
    const url = new URL("/login", req.nextUrl);
    if (pathname !== "/") url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (isLogin) return NextResponse.redirect(new URL("/", req.nextUrl));

  const role = session.user.role as Role;
  if (!canAccess(role, pathname)) {
    return NextResponse.redirect(new URL("/?denied=" + encodeURIComponent(pathname), req.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
