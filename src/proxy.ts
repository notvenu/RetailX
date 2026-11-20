import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";

// Public site and the two doors are open; everything else needs a session.
// Per-area access (roles) is checked where the business is loaded: src/lib/session.ts.
const PUBLIC = new Set(["/", "/features", "/how-it-works", "/about", "/forgot", "/reset", "/verify"]);
const DOORS = new Set(["/signin", "/signup"]);

// Reads the session without the `auth(handler)` wrapper on purpose: the wrapper re-issues the session cookie on
// every response, and a background prefetch still in flight at sign-out would bring the session back to life.
export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.has(pathname)) return NextResponse.next();
  const signedIn = !!(await auth())?.user?.businessId;
  if (DOORS.has(pathname)) return signedIn ? NextResponse.redirect(new URL("/dashboard", req.nextUrl)) : NextResponse.next();
  if (!signedIn) {
    const url = new URL("/signin", req.nextUrl);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // static files (icons, manifest, service worker) and API routes (which check their own auth) skip the gate
  matcher: ["/((?!api|signout|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webmanifest|js)$).*)"],
};
