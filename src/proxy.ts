import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAccess } from "@/lib/access";
import type { Role } from "@/lib/users";

// the public site: readable signed in or out
const PUBLIC = new Set(["/", "/features", "/how-it-works", "/about"]);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLogin = pathname === "/login";
  const session = req.auth;
  if (PUBLIC.has(pathname)) return NextResponse.next();

  if (!session) {
    if (isLogin) return NextResponse.next();
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (isLogin) return NextResponse.redirect(new URL("/overview", req.nextUrl));

  const role = session.user.role as Role;
  if (!canAccess(role, pathname)) {
    return NextResponse.redirect(new URL("/overview?denied=" + encodeURIComponent(pathname), req.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
