import { NextResponse, type NextRequest } from "next/server";

// Staff area protection: HTTP Basic auth with STAFF_PASSWORD (any username).
// Good enough to start; swap for proper staff accounts later.
export function middleware(req: NextRequest) {
  const password = process.env.STAFF_PASSWORD;
  if (!password) return new NextResponse("Staff area disabled: set STAFF_PASSWORD.", { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Basic ")) {
    const decoded = atob(auth.slice(6));
    const pass = decoded.slice(decoded.indexOf(":") + 1);
    if (pass === password) return NextResponse.next();
  }
  return new NextResponse("Staff login required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="GGM staff"' } });
}

export const config = { matcher: ["/staff/:path*"] };
