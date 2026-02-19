import { NextResponse } from "next/server";
import { auth } from "@/auth";

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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const name = (body?.name as string | undefined)?.trim();

  if (!name) {
    return NextResponse.json(
      { error: "グループ名を入力してください。" },
      { status: 400 },
    );
  }

  const idToken = (session.user as any)?.idToken as string | undefined;

  if (!idToken) {
    return NextResponse.json({ error: "ID token is missing" }, { status: 401 });
  }

  const trimmedApiUrl = apiUrl.replace(/\/+$/, "");
  const endpoint = trimmedApiUrl.endsWith("/api/v1")
    ? `${trimmedApiUrl}/groups`
    : `${trimmedApiUrl}/api/v1/groups`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ name }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json(
        {
          error:
            (data as any)?.message ??
            "グループの作成に失敗しました。時間をおいて再度お試しください。",
        },
        { status: res.status },
      );
    }

    return NextResponse.json(data ?? { ok: true }, { status: 201 });
  } catch (error) {
    console.error("Create group error", error);
    return NextResponse.json(
      { error: "グループの作成中にエラーが発生しました。" },
      { status: 500 },
    );
  }
}
