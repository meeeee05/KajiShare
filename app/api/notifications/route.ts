import { auth } from "@/auth";
import { NextResponse } from "next/server";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const parseLimit = (rawLimit: string | null): number => {
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.floor(parsed), MAX_LIMIT);
};

export async function GET(req: Request) {
  const session = await auth();
  const idToken = (session?.user as { idToken?: string } | undefined)?.idToken;

  if (!idToken) {
    return NextResponse.json(
      { error: "認証情報がありません" },
      { status: 401 },
    );
  }

  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    return NextResponse.json(
      { error: "API_URL is not configured" },
      { status: 500 },
    );
  }

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"));

  const base = apiUrl.replace(/\/+$/, "");
  const v1Base = base.endsWith("/api/v1") ? base : `${base}/api/v1`;
  const endpoint = `${v1Base}/notifications?limit=${limit}`;

  try {
    const res = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      cache: "no-store",
    });

    const payload = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json(
        { error: "通知の取得に失敗しました" },
        { status: res.status || 502 },
      );
    }

    return NextResponse.json(payload, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "通知の取得に失敗しました" },
      { status: 502 },
    );
  }
}