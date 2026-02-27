import { NextResponse } from "next/server";
import { auth } from "@/auth";

type AnyRecord = Record<string, unknown>;

const asRecord = (value: unknown): AnyRecord | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as AnyRecord;
};

const pickFirstString = (
  obj: AnyRecord | null,
  keys: string[],
): string | undefined => {
  if (!obj) {
    return undefined;
  }

  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
  }

  return undefined;
};

const extractGroups = (payload: unknown): AnyRecord[] => {
  if (Array.isArray(payload)) {
    return payload.map((v) => asRecord(v)).filter((v): v is AnyRecord => !!v);
  }

  const root = asRecord(payload);
  if (!root) {
    return [];
  }

  const candidates = [
    root.data,
    root.groups,
    root.items,
    root.results,
    root.rows,
    root.list,
    asRecord(root.data)?.groups,
    asRecord(root.data)?.items,
    asRecord(root.data)?.results,
    asRecord(root.data)?.rows,
    asRecord(root.data)?.list,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    return candidate
      .map((v) => {
        const rootItem = asRecord(v);
        return (
          asRecord(rootItem?.group) ??
          asRecord(rootItem?.data) ??
          asRecord(rootItem?.attributes) ??
          rootItem
        );
      })
      .filter((v): v is AnyRecord => !!v);
  }

  return [];
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

  const body = await req.json().catch(() => null);
  const inviteCode = (body?.inviteCode as string | undefined)?.trim();

  if (!inviteCode) {
    return NextResponse.json(
      { error: "招待IDを入力してください。" },
      { status: 400 },
    );
  }

  const v1Base = buildV1Base(apiUrl);

  // 1) GET /api/v1/groups で share_key 完全一致を確認
  const groupsRes = await fetch(`${v1Base}/groups`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
    cache: "no-store",
  }).catch(() => null);

  if (!groupsRes?.ok) {
    const errorData = await groupsRes?.json().catch(() => null);
    return NextResponse.json(
      {
        error:
          (errorData as any)?.error ??
          (errorData as any)?.message ??
          "グループ一覧の取得に失敗しました。",
      },
      { status: groupsRes?.status ?? 500 },
    );
  }

  const groupsPayload = await groupsRes.json().catch(() => null);
  const groups = extractGroups(groupsPayload);

  const matched = groups.some((group) => {
    const shareKey =
      pickFirstString(group, ["share_key", "shareKey"]) ??
      pickFirstString(asRecord(group.attributes), ["share_key", "shareKey"]) ??
      pickFirstString(asRecord(group.data), ["share_key", "shareKey"]);
    return shareKey === inviteCode;
  });

  if (!matched) {
    return NextResponse.json(
      { error: "招待IDが見つかりません。入力内容をご確認ください。" },
      { status: 404 },
    );
  }

  // 2) 参加処理はバックエンドへ委譲
  const joinRes = await fetch(`${v1Base}/groups/join`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ share_key: inviteCode }),
  }).catch(() => null);

  if (!joinRes?.ok) {
    const errorData = await joinRes?.json().catch(() => null);
    return NextResponse.json(
      {
        error:
          (errorData as any)?.error ??
          (errorData as any)?.message ??
          "グループ参加に失敗しました。",
      },
      { status: joinRes?.status ?? 500 },
    );
  }

  const data = await joinRes.json().catch(() => null);
  return NextResponse.json(data ?? { ok: true }, { status: 200 });
}
