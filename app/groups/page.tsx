import { redirect } from "next/navigation";
import { auth } from "@/auth";

type AnyRecord = Record<string, unknown>;

type GroupListItem = {
  id?: string;
  name: string;
  ashareKey?: string;
  ssignMode?: string;
  balanceType?: string;
  adminName?: string;
  role?: string;
};

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

const pickAdminName = (
  group: AnyRecord | null,
  membership: AnyRecord | null,
): string | undefined => {
  const fromFlat =
    pickFirstString(group, [
      "admin_name",
      "adminName",
      "owner_name",
      "ownerName",
      "created_by_name",
      "createdByName",
    ]) ??
    pickFirstString(membership, [
      "admin_name",
      "adminName",
      "owner_name",
      "ownerName",
    ]);

  if (fromFlat) {
    return fromFlat;
  }

  const adminRecord =
    asRecord(group?.admin) ??
    asRecord(group?.owner) ??
    asRecord(group?.created_by) ??
    asRecord(group?.createdBy);

  const fromNested = pickFirstString(adminRecord, [
    "name",
    "full_name",
    "fullName",
    "display_name",
    "displayName",
    "username",
  ]);

  if (fromNested) {
    return fromNested;
  }

  const members = Array.isArray(group?.members) ? group?.members : null;
  if (!members) {
    return undefined;
  }

  for (const rawMember of members) {
    const member = asRecord(rawMember);
    const memberRole = pickFirstString(member, ["role", "member_role", "type"]);

    if (memberRole?.toLowerCase() !== "admin") {
      continue;
    }

    const memberUser = asRecord(member?.user);
    const adminName =
      pickFirstString(memberUser, [
        "name",
        "full_name",
        "fullName",
        "display_name",
        "displayName",
      ]) ??
      pickFirstString(member, [
        "name",
        "full_name",
        "fullName",
        "display_name",
        "displayName",
      ]);

    if (adminName) {
      return adminName;
    }
  }

  return undefined;
};

const normalizeMemberships = (memberships: unknown): GroupListItem[] => {
  if (!Array.isArray(memberships)) {
    return [];
  }

  return memberships.map((item, index) => {
    const membership = asRecord(item);
    const group = asRecord(membership?.group);

    const id =
      pickFirstString(group, ["id", "group_id", "groupId"]) ??
      pickFirstString(membership, ["group_id", "groupId", "id"]);

    const name =
      pickFirstString(group, ["name", "group_name", "title"]) ??
      pickFirstString(membership, ["group_name", "name", "title"]) ??
      `グループ ${index + 1}`;

    const ashareKey =
      pickFirstString(group, [
        "ashare_key",
        "a_share_key",
        "share_key",
        "shareKey",
      ]) ??
      pickFirstString(membership, [
        "ashare_key",
        "a_share_key",
        "share_key",
        "shareKey",
      ]);

    const ssignMode =
      pickFirstString(group, [
        "ssign_mode",
        "sign_mode",
        "assign_mode",
        "assignment_mode",
        "signMode",
        "assignMode",
      ]) ??
      pickFirstString(membership, [
        "ssign_mode",
        "sign_mode",
        "assign_mode",
        "assignment_mode",
        "signMode",
        "assignMode",
      ]);

    const balanceType =
      pickFirstString(group, ["balance_type", "balanceType"]) ??
      pickFirstString(membership, ["balance_type", "balanceType"]);

    const adminName = pickAdminName(group, membership);

    const role = pickFirstString(membership, ["role", "member_role", "type"]);

    return {
      id,
      name,
      ashareKey,
      ssignMode,
      balanceType,
      adminName,
      role,
    };
  });
};

const extractMembershipsArray = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  const root = asRecord(payload);
  if (!root) {
    return [];
  }

  const candidates: unknown[] = [
    root.memberships,
    root.groups,
    root.data,
    root.items,
    root.results,
    asRecord(root.data)?.memberships,
    asRecord(root.data)?.groups,
    asRecord(root.data)?.items,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
};

export default async function GroupsPage() {
  const session = await auth();

  // 未サインインならサインインページへ
  if (!session) {
    redirect("/auth/signin");
  }

  const apiUrl = process.env.API_URL;
  const idToken = (session.user as any)?.idToken as string | undefined;

  // API_URL が未設定の場合は従来の説明だけ表示
  if (!apiUrl) {
    return (
      <div className="prose max-w-none p-6">
        <h1>グループ設定</h1>
        <p>所属グループの確認・切り替え・管理を行うページです。</p>
      </div>
    );
  }

  if (!idToken) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">所属グループ一覧</h1>
        <p className="mt-2 text-sm text-red-600">
          セッション情報の取得に失敗しました。再サインインしてください。
        </p>
      </div>
    );
  }

  let memberships: unknown[] = [];

  const res = await fetch(`${apiUrl}/memberships`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
    cache: "no-store",
  }).catch(() => null);

  if (res?.ok) {
    const payload = await res.json().catch(() => null);
    memberships = extractMembershipsArray(payload);
  }

  // バックエンドによっては /memberships ではなく /groups が一覧APIの場合があるためフォールバック
  if (memberships.length === 0) {
    const groupsRes = await fetch(`${apiUrl}/groups`, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      cache: "no-store",
    }).catch(() => null);

    if (groupsRes?.ok) {
      const payload = await groupsRes.json().catch(() => null);
      memberships = extractMembershipsArray(payload);
    }
  }

  const groupList = normalizeMemberships(memberships);

  if (groupList.length === 0) {
    redirect("/groups/empty");
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">所属グループ一覧</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        あなたが参加しているグループは {groupList.length} 件です。
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groupList.map((group, index) => (
          <div
            key={group.id ?? `${group.name}-${index}`}
            className="rounded-lg border bg-white p-4 shadow-sm dark:bg-slate-900"
          >
            <p className="text-base font-semibold">{group.name}</p>
            <div className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
              <p>グループID: {group.id ?? "-"}</p>
              <p>ashare_key: {group.ashareKey ?? "-"}</p>
              <p>ssign_mode: {group.ssignMode ?? "-"}</p>
              <p>balance_type: {group.balanceType ?? "-"}</p>
              <p>Admin: {group.adminName ?? "-"}</p>
              <p>権限: {group.role ?? "-"}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
