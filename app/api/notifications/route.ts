import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { backendOrigin } from "@/lib/backend-origin";
import { backendServerHeaders } from "@/lib/backend-server-headers";

// 通知取得件数
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const FETCH_ERROR_MESSAGE = "通知の取得に失敗しました";

// クエリパラメータからlimitを確認（不正入力や極端な値を補正）
const parseLimit = (rawLimit: string | null): number => {
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(parsed), MAX_LIMIT);
};

// Authorizationヘッダーの値をマスク（デバッグ用）
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

// エラー時のレスポンス返却
const jsonError = (status: number, message: string) => {
  return NextResponse.json({ error: message }, { status });
};

const parseJsonSafely = async (res: Response) => {
  return res.json().catch(() => null);
};

// 認証チェック、通知APIへ投げるためのURLとパラメータ作成
export async function GET(req: Request) {
  const session = await auth();
  const idToken = (session?.user as { idToken?: string } | undefined)?.idToken;

  if (!idToken) {
    return jsonError(401, "認証情報がありません");
  }

  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    return jsonError(500, "API_URL is not configured");
  }

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const debug = url.searchParams.get("debug") === "1";
  const type = url.searchParams.get("type");
  const sinceId = url.searchParams.get("since_id");
  const forRecords = url.searchParams.get("for_records");

  const base = apiUrl.replace(/\/+$/, "");
  const v1Base = base.endsWith("/api/v1") ? base : `${base}/api/v1`;
  const backendParams = new URLSearchParams({ limit: String(limit) });
  if (type) {
    backendParams.set("type", type);
  }
  if (sinceId) {
    backendParams.set("since_id", sinceId);
  }
  if (forRecords) {
    backendParams.set("for_records", forRecords);
  }
  const endpoint = `${v1Base}/notifications?${backendParams.toString()}`;

  // APIリクエスト（認証情報付き）
  try {
    const res = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${idToken}`,
        Origin: backendOrigin(),
        ...backendServerHeaders(),
      },
      cache: "no-store",
    });

    const payload = await parseJsonSafely(res);

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
      return jsonError(res.status || 502, FETCH_ERROR_MESSAGE);
    }

    return NextResponse.json(payload, { status: 200 });
  } catch {
    return jsonError(502, FETCH_ERROR_MESSAGE);
  }
}
