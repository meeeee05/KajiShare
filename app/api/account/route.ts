import { NextResponse } from "next/server";
import { auth } from "@/auth";

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
  let userId =
    ((session.user as any)?.id as string | number | undefined) ?? undefined;

  if (!userId) {
    const profileCandidates = [
      `${trimmedApiUrl}/api/v1/users/me`,
      `${trimmedApiUrl}/users`,
      `${trimmedApiUrl}/api/v1/users`,
    ];

    for (const endpoint of profileCandidates) {
      try {
        const meRes = await fetch(endpoint, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
          cache: "no-store",
        });

        if (!meRes.ok) {
          continue;
        }

        const meData = await meRes.json().catch(() => null);
        userId =
          (meData as any)?.id ??
          (meData as any)?.user?.id ??
          (meData as any)?.data?.id;

        if (userId) {
          break;
        }
      } catch {
        // 次の候補を試す
      }
    }
  }

  if (!userId) {
    return NextResponse.json(
      { error: "削除対象ユーザーIDを取得できませんでした。" },
      { status: 500 },
    );
  }

  const deleteBase = trimmedApiUrl.endsWith("/api/v1")
    ? trimmedApiUrl
    : `${trimmedApiUrl}/api/v1`;
  const endpoint = `${deleteBase}/users/${encodeURIComponent(String(userId))}`;

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
