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
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }

  return undefined;
};

const extractArray = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  const root = asRecord(payload);
  if (!root) {
    return [];
  }

  const data = asRecord(root.data);
  const nestedData = asRecord(data?.data);

  const candidates: unknown[] = [
    root.memberships,
    root.items,
    root.results,
    root.rows,
    root.list,
    root.data,
    data?.memberships,
    data?.items,
    data?.results,
    data?.rows,
    data?.list,
    nestedData?.memberships,
    nestedData?.items,
    nestedData?.results,
    nestedData?.rows,
    nestedData?.list,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
};

const buildV1Base = (apiUrl: string) => {
  const trimmed = apiUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/api/v1") ? trimmed : `${trimmed}/api/v1`;
};

const resolveGroupIdByShareKey = async (
  base: string,
  v1Base: string,
  idToken: string,
  shareKey?: string,
): Promise<string | undefined> => {
  if (!shareKey) {
    return undefined;
  }

  const endpoints = [`${v1Base}/groups`, `${base}/groups`];

  for (const endpoint of endpoints) {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      cache: "no-store",
    }).catch(() => null);

    if (!res?.ok) {
      continue;
    }

    const payload = await res.json().catch(() => null);
    const rows = extractArray(payload);

    for (const row of rows) {
      const rec = asRecord(row);
      const group = asRecord(rec?.group) ?? asRecord(rec?.data) ?? rec;
      const rowShareKey =
        pickFirstString(rec, ["share_key", "shareKey"]) ??
        pickFirstString(group, ["share_key", "shareKey"]);

      if (!rowShareKey || rowShareKey.toLowerCase() !== shareKey.toLowerCase()) {
        continue;
      }

      const rowGroupId =
        pickFirstString(rec, ["group_id", "groupId", "id"]) ??
        pickFirstString(group, ["id", "group_id", "groupId"]);

      if (rowGroupId) {
        return rowGroupId;
      }
    }
  }

  return undefined;
};

const getMemberCount = async (
  base: string,
  v1Base: string,
  idToken: string,
  groupId?: string,
  shareKey?: string,
): Promise<number | null> => {
  const endpoints = [`${base}/memberships`, `${v1Base}/memberships`];

  for (const endpoint of endpoints) {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      cache: "no-store",
    }).catch(() => null);

    if (!res?.ok) {
      continue;
    }

    const payload = await res.json().catch(() => null);
    const rows = extractArray(payload);

    let count = 0;
    for (const row of rows) {
      const rec = asRecord(row);
      const group = asRecord(rec?.group);
      const rowGroupId =
        pickFirstString(rec, ["group_id", "groupId"]) ??
        pickFirstString(group, ["id", "group_id", "groupId"]);
      const rowShareKey =
        pickFirstString(rec, ["share_key", "shareKey"]) ??
        pickFirstString(group, ["share_key", "shareKey"]);

      const matchedById = Boolean(groupId && rowGroupId && groupId === rowGroupId);
      const matchedByShare = Boolean(
        shareKey && rowShareKey && shareKey.toLowerCase() === rowShareKey.toLowerCase(),
      );

      if (matchedById || matchedByShare) {
        count += 1;
      }
    }

    return count;
  }

  return null;
};

const tryDeleteGroupIfLastMember = async (
  base: string,
  v1Base: string,
  idToken: string,
  groupId?: string,
  shareKey?: string,
) => {
  const attempts: Array<{ method: "DELETE" | "POST"; url: string; body?: AnyRecord }> = [];

  if (groupId) {
    attempts.push(
      { method: "DELETE", url: `${base}/groups/${encodeURIComponent(groupId)}` },
      { method: "DELETE", url: `${v1Base}/groups/${encodeURIComponent(groupId)}` },
      {
        method: "POST",
        url: `${base}/groups/delete`,
        body: { group_id: groupId },
      },
      {
        method: "POST",
        url: `${v1Base}/groups/delete`,
        body: { group_id: groupId },
      },
    );
  }

  if (shareKey) {
    attempts.push(
      {
        method: "DELETE",
        url: `${base}/groups?share_key=${encodeURIComponent(shareKey)}`,
      },
      {
        method: "DELETE",
        url: `${v1Base}/groups?share_key=${encodeURIComponent(shareKey)}`,
      },
      {
        method: "POST",
        url: `${base}/groups/delete`,
        body: { share_key: shareKey },
      },
      {
        method: "POST",
        url: `${v1Base}/groups/delete`,
        body: { share_key: shareKey },
      },
    );
  }

  for (const attempt of attempts) {
    const res = await fetch(attempt.url, {
      method: attempt.method,
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: attempt.body ? JSON.stringify(attempt.body) : undefined,
    }).catch(() => null);

    if (res?.ok) {
      return true;
    }
  }

  return false;
};

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

  const candidates = [`${trimmedApiUrl}/users/me`, `${trimmedApiUrl}/users`];

  for (const endpoint of candidates) {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      cache: "no-store",
    }).catch(() => null);

    if (!res?.ok) {
      continue;
    }

    const data = await res.json().catch(() => null);
    userId =
      (data as any)?.id ?? (data as any)?.user?.id ?? (data as any)?.data?.id;

    if (userId) {
      return userId;
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
  const resolvedGroupId =
    groupId ??
    (await resolveGroupIdByShareKey(base, v1Base, idToken, shareKey));
  const membersBeforeLeave = await getMemberCount(
    base,
    v1Base,
    idToken,
    resolvedGroupId,
    shareKey,
  );

  const attempts: Attempt[] = [];

  if (resolvedGroupId) {
    attempts.push(
      {
        method: "DELETE",
        url: `${v1Base}/groups/${encodeURIComponent(resolvedGroupId)}/leave`,
      },
      {
        method: "POST",
        url: `${base}/groups/${encodeURIComponent(resolvedGroupId)}/leave`,
      },
      {
        method: "DELETE",
        url: `${base}/groups/${encodeURIComponent(resolvedGroupId)}/leave`,
      },
      {
        method: "DELETE",
        url: `${base}/groups/${encodeURIComponent(resolvedGroupId)}/members/me`,
      },
    );

    if (userId) {
      attempts.push(
        {
          method: "DELETE",
          url: `${base}/groups/${encodeURIComponent(resolvedGroupId)}/members/${encodeURIComponent(String(userId))}`,
        },
        {
          method: "DELETE",
          url: `${base}/groups/${encodeURIComponent(resolvedGroupId)}/users/${encodeURIComponent(String(userId))}`,
        },
        {
          method: "DELETE",
          url: `${base}/memberships`,
          body: {
            group_id: resolvedGroupId,
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
    const res = await fetch(attempt.url, {
      method: attempt.method,
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: attempt.body ? JSON.stringify(attempt.body) : undefined,
    }).catch(() => null);

    if (!res) {
      continue;
    }

    if (res.ok) {
      const shouldDeleteGroup = membersBeforeLeave !== null && membersBeforeLeave <= 1;

      if (shouldDeleteGroup) {
        const deleted = await tryDeleteGroupIfLastMember(
          base,
          v1Base,
          idToken,
          resolvedGroupId,
          shareKey,
        );

        return NextResponse.json(
          { ok: true, groupDeleted: deleted },
          { status: 200 },
        );
      }

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
