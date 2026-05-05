import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const target = new URL("/api/notifications", req.url);

  for (const [key, value] of url.searchParams.entries()) {
    target.searchParams.set(key, value);
  }

  return NextResponse.redirect(target, { status: 307 });
}
