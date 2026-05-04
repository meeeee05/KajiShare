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

const maskAuthorization = (value: string) => {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();
  if (trimmed.length <= 18) {
    return "Bearer ***";
  }

  return `${trimmed.slice(0, 14)}...${trimmed.slice(-4)}`;
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
  const debug = url.searchParams.get("debug") === "1";

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

    if (debug) {
      return NextResponse.json(
        {
          debug: {
            request: {
              endpoint,
              headers: {
                Authorization: maskAuthorization(`Bearer ${idToken}`),
              },
            },
            response: {
              status: res.status,
              ok: res.ok,
              headers: {
                "content-type": res.headers.get("content-type") ?? "",
              },
            },
          },
          data: payload,
        },
        { status: res.ok ? 200 : res.status || 502 },
      );
    }

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
