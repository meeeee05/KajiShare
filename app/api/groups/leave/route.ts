import { NextResponse } from "next/server";
import { auth } from "@/auth";

type LeavePayload = {
  groupId?: string;
  shareKey?: string;
};

type Attempt = {
  method: "POST" | "DELETE";
  url: string;
  body?: Record<string, unknown>;
};

const buildV1Base = (apiUrl: string) => {
  const trimmed = apiUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/api/v1") ? trimmed : `${trimmed}/api/v1`;
};

const requestWithAuth = async (
  idToken: string,
  attempt: Attempt,
): Promise<Response | null> => {
  return fetch(attempt.url, {
    method: attempt.method,
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: attempt.body ? JSON.stringify(attempt.body) : undefined,
  }).catch(() => null);
};

const resolveUserId = async (session: any, idToken: string, base: string) => {
  const fromSession = (session.user as any)?.id as string | number | undefined;
  if (fromSession != null) {
    return String(fromSession);
  }

  for (const endpoint of [`${base}/users/me`, `${base}/users`]) {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${idToken}` },
      cache: "no-store",
    }).catch(() => null);

    if (!res?.ok) {
      continue;
    }

    const data = await res.json().catch(() => null);
    const userId =
      (data as any)?.id ?? (data as any)?.user?.id ?? (data as any)?.data?.id;

    if (userId != null) {
      return String(userId);
    }
  }

  return undefined;
};

export async function POST(req: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    return NextResponse.json(
      { error: "API_URL is not configured" },
      { status: 500 },
    );
  }

  const idToken = (session.user as any)?.idToken as string | undefined;
  if (!idToken) {
    return NextResponse.json({ error: "ID token is missing" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as LeavePayload | null;
  const groupId = body?.groupId?.trim();
  const shareKey = body?.shareKey?.trim();

  if (!groupId && !shareKey) {
    return NextResponse.json(
      { error: "groupId または shareKey が必要です。" },
      { status: 400 },
    );
  }

  const base = apiUrl.replace(/\/+$/, "");
  const v1Base = buildV1Base(apiUrl);
  const userId = await resolveUserId(session, idToken, base);

  const attempts: Attempt[] = [];

  if (groupId) {
    attempts.push(
      {
        method: "DELETE",
        url: `${v1Base}/groups/${encodeURIComponent(groupId)}/leave`,
      },
      {
        method: "POST",
        url: `${base}/groups/${encodeURIComponent(groupId)}/leave`,
      },
      {
        method: "DELETE",
        url: `${base}/groups/${encodeURIComponent(groupId)}/leave`,
      },
      {
        method: "DELETE",
        url: `${base}/groups/${encodeURIComponent(groupId)}/members/me`,
      },
    );

    if (userId) {
      attempts.push(
        {
          method: "DELETE",
          url: `${base}/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(String(userId))}`,
        },
        {
          method: "DELETE",
          url: `${base}/groups/${encodeURIComponent(groupId)}/users/${encodeURIComponent(String(userId))}`,
        },
        {
          method: "DELETE",
          url: `${base}/memberships`,
          body: {
            group_id: groupId,
            user_id: userId,
          },
        },
      );
    }
  }

  if (shareKey) {
    attempts.push(
      {
        method: "POST",
        url: `${base}/groups/leave`,
        body: {
          share_key: shareKey,
          user_id: userId,
        },
      },
      {
        method: "DELETE",
        url: `${base}/memberships`,
        body: {
          share_key: shareKey,
          user_id: userId,
        },
      },
    );
  }

  let lastMessage = "退会に失敗しました。";
  let lastStatus = 500;

  for (const attempt of attempts) {
    const res = await requestWithAuth(idToken, attempt);

    if (!res) {
      continue;
    }

    if (res.ok) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    lastStatus = res.status;
    const errorData = await res.json().catch(() => null);
    lastMessage =
      (errorData as any)?.error ??
      (errorData as any)?.message ??
      `退会に失敗しました。(status: ${res.status})`;
  }

  return NextResponse.json({ error: lastMessage }, { status: lastStatus });
}
