import { NextResponse } from "next/server";
import { auth } from "@/auth";

const resolveUserId = async (
  session: any,
  idToken: string,
  trimmedApiUrl: string,
) => {
  let userId =
    ((session.user as any)?.id as string | number | undefined) ?? undefined;

  if (userId) {
    return userId;
  }

  const profileCandidates = [
    `${trimmedApiUrl}/users/me`,
    `${trimmedApiUrl}/users`,
    `${trimmedApiUrl}/users`,
  ];

  for (const endpoint of profileCandidates) {
    const meRes = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      cache: "no-store",
    }).catch(() => null);

    if (!meRes?.ok) {
      continue;
    }

    const meData = await meRes.json().catch(() => null);
    userId =
      (meData as any)?.id ??
      (meData as any)?.user?.id ??
      (meData as any)?.data?.id;

    if (userId) {
      return userId;
    }
  }

  return undefined;
};

const buildUsersV1Endpoint = (apiUrl: string, userId: string | number) => {
  const trimmedApiUrl = apiUrl.replace(/\/+$/, "");
  const base = trimmedApiUrl.endsWith("/")
    ? trimmedApiUrl
    : `${trimmedApiUrl}/`;

  return `${base}/users/${encodeURIComponent(String(userId))}`;
};

export async function PATCH(req: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiUrl = process.env.API_URL;
  const idToken = (session.user as any)?.idToken as string | undefined;

  if (!apiUrl) {
    return NextResponse.json(
      { error: "API_URL is not configured" },
      { status: 500 },
    );
  }

  if (!idToken) {
    return NextResponse.json({ error: "ID token is missing" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const payload: Record<string, string> = {};
  const allowedFields = ["name", "email", "account_type"] as const;

  for (const field of allowedFields) {
    const value = body?.[field];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        payload[field] = trimmed;
      }
    }
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json(
      { error: "更新対象がありません。" },
      { status: 400 },
    );
  }

  const userId = await resolveUserId(
    session,
    idToken,
    apiUrl.replace(/\/+$/, ""),
  );

  if (!userId) {
    return NextResponse.json(
      { error: "更新対象ユーザーIDを取得できませんでした。" },
      { status: 500 },
    );
  }

  const endpoint = buildUsersV1Endpoint(apiUrl, userId);

  try {
    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json(
        {
          error:
            (data as any)?.message ??
            (data as any)?.error ??
            "アカウント情報の更新に失敗しました。",
        },
        { status: res.status },
      );
    }

    return NextResponse.json(data ?? { ok: true }, { status: 200 });
  } catch (error) {
    console.error("Update account error", error);
    return NextResponse.json(
      { error: "アカウント更新中にエラーが発生しました。" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiUrl = process.env.API_URL;
  const idToken = (session.user as any)?.idToken as string | undefined;

  if (!apiUrl) {
    return NextResponse.json(
      { error: "API_URL is not configured" },
      { status: 500 },
    );
  }

  if (!idToken) {
    return NextResponse.json({ error: "ID token is missing" }, { status: 401 });
  }

  const trimmedApiUrl = apiUrl.replace(/\/+$/, "");
  const userId = await resolveUserId(session, idToken, trimmedApiUrl);

  if (!userId) {
    return NextResponse.json(
      { error: "削除対象ユーザーIDを取得できませんでした。" },
      { status: 500 },
    );
  }

  const endpoint = buildUsersV1Endpoint(apiUrl, userId);

  try {
    const res = await fetch(endpoint, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json(
        {
          error:
            (data as any)?.message ??
            (data as any)?.error ??
            "アカウント削除に失敗しました。",
        },
        { status: res.status },
      );
    }

    return NextResponse.json(data ?? { ok: true }, { status: 200 });
  } catch (error) {
    console.error("Delete account error", error);
    return NextResponse.json(
      { error: "アカウント削除中にエラーが発生しました。" },
      { status: 500 },
    );
  }
}
