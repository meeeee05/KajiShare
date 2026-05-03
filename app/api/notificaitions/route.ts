import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = url.searchParams.get("limit");
  const target = limit
    ? `/api/notifications?limit=${encodeURIComponent(limit)}`
    : "/api/notifications";

  return NextResponse.redirect(new URL(target, req.url), { status: 307 });
}
