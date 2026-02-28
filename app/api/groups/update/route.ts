import { NextResponse } from "next/server";
import { auth } from "@/auth";

type UpdatePayload = {
  groupId?: string;
  shareKey?: string;
  name?: string;
  assign_mode?: string;
  balance_type?: string;
};

type Attempt = {
  method: "PATCH" | "PUT" | "POST";
  url: string;
  body: Record<string, unknown>;
};

const buildV1Base = (apiUrl: string) => {
  const trimmed = apiUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/api/v1") ? trimmed : `${trimmed}/api/v1`;
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

  const body = (await req.json().catch(() => null)) as UpdatePayload | null;
  const groupId = body?.groupId?.trim();
  const shareKey = body?.shareKey?.trim();

  const updateBody: Record<string, string> = {};
  if (body?.name?.trim()) {
    updateBody.name = body.name.trim();
  }
  if (body?.assign_mode?.trim()) {
    updateBody.assign_mode = body.assign_mode.trim();
  }
  if (body?.balance_type?.trim()) {
    updateBody.balance_type = body.balance_type.trim();
  }

  if (!groupId && !shareKey) {
    return NextResponse.json(
      { error: "groupId または shareKey が必要です。" },
      { status: 400 },
    );
  }

  if (Object.keys(updateBody).length === 0) {
    return NextResponse.json(
      { error: "更新項目がありません。" },
      { status: 400 },
    );
  }

  const base = apiUrl.replace(/\/+$/, "");
  const v1Base = buildV1Base(apiUrl);

  const attempts: Attempt[] = [];

  if (groupId) {
    attempts.push(
      {
        method: "PATCH",
        url: `${base}/groups/${encodeURIComponent(groupId)}`,
        body: updateBody,
      },
      {
        method: "PUT",
        url: `${base}/groups/${encodeURIComponent(groupId)}`,
        body: updateBody,
      },
      {
        method: "PATCH",
        url: `${v1Base}/groups/${encodeURIComponent(groupId)}`,
        body: updateBody,
      },
      {
        method: "PUT",
        url: `${v1Base}/groups/${encodeURIComponent(groupId)}`,
        body: updateBody,
      },
    );
  }

  if (shareKey) {
    attempts.push(
      {
        method: "PATCH",
        url: `${base}/groups/update`,
        body: {
          share_key: shareKey,
          ...updateBody,
        },
      },
      {
        method: "POST",
        url: `${base}/groups/update`,
        body: {
          share_key: shareKey,
          ...updateBody,
        },
      },
      {
        method: "PATCH",
        url: `${v1Base}/groups/update`,
        body: {
          share_key: shareKey,
          ...updateBody,
        },
      },
      {
        method: "POST",
        url: `${v1Base}/groups/update`,
        body: {
          share_key: shareKey,
          ...updateBody,
        },
      },
    );
  }

  if (groupId || shareKey) {
    attempts.push(
      {
        method: "PATCH",
        url: `${base}/groups`,
        body: {
          group_id: groupId,
          share_key: shareKey,
          ...updateBody,
        },
      },
      {
        method: "PATCH",
        url: `${v1Base}/groups`,
        body: {
          group_id: groupId,
          share_key: shareKey,
          ...updateBody,
        },
      },
    );
  }

  let lastMessage = "グループ情報の更新に失敗しました。";
  let lastStatus = 500;

  for (const attempt of attempts) {
    const res = await fetch(attempt.url, {
      method: attempt.method,
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(attempt.body),
    }).catch(() => null);

    if (!res) {
      continue;
    }

    if (res.ok) {
      const data = await res.json().catch(() => null);
      return NextResponse.json(data ?? { ok: true }, { status: 200 });
    }

    lastStatus = res.status;
    const errorData = await res.json().catch(() => null);
    lastMessage =
      (errorData as any)?.error ??
      (errorData as any)?.message ??
      `グループ情報の更新に失敗しました。(status: ${res.status})`;
  }

  return NextResponse.json({ error: lastMessage }, { status: lastStatus });
}
