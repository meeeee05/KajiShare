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

const pickLikelyGroupName = (obj: AnyRecord | null): string | undefined => {
  if (!obj) {
    return undefined;
  }

  const explicit = pickFirstString(obj, [
    "name",
    "group_name",
    "groupName",
    "title",
    "group_title",
    "groupTitle",
  ]);

  if (explicit) {
    return explicit;
  }

  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (
      typeof value === "string" &&
      value.trim() &&
      lower.includes("name") &&
      !lower.includes("admin") &&
      !lower.includes("owner") &&
      !lower.includes("user")
    ) {
      return value;
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

const buildGroupItem = (
  group: AnyRecord | null,
  base: AnyRecord | null,
  fallbackName: string,
): GroupListItem => {
  const id =
    pickFirstString(group, ["id", "group_id", "groupId"]) ??
    pickFirstString(base, ["group_id", "groupId", "id", "gid"]);

  const name =
    pickLikelyGroupName(group) ?? pickLikelyGroupName(base) ?? fallbackName;

  const ashareKey =
    pickFirstString(group, [
      "ashare_key",
      "a_share_key",
      "share_key",
      "shareKey",
    ]) ??
    pickFirstString(base, [
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
    pickFirstString(base, [
      "ssign_mode",
      "sign_mode",
      "assign_mode",
      "assignment_mode",
      "signMode",
      "assignMode",
    ]);

  const balanceType =
    pickFirstString(group, ["balance_type", "balanceType"]) ??
    pickFirstString(base, ["balance_type", "balanceType"]);

  const adminName = pickAdminName(group, base);

  return {
    id,
    name,
    ashareKey,
    ssignMode,
    balanceType,
    adminName,
  };
};

const normalizeMemberships = (memberships: unknown): GroupListItem[] => {
  if (!Array.isArray(memberships)) {
    return [];
  }

  return memberships.map((item, index) => {
    const membership = asRecord(item);
    const group = asRecord(membership?.group) ?? membership;
    const normalized = buildGroupItem(
      group,
      membership,
      `グループ ${index + 1}`,
    );

    const role = pickFirstString(membership, ["role", "member_role", "type"]);

    return {
      ...normalized,
      role,
    };
  });
};

const normalizeGroups = (groupsPayload: unknown): GroupListItem[] => {
  const groups = extractMembershipsArray(groupsPayload);

  return groups
    .map((item, index) => {
      const root = asRecord(item);
      const group = asRecord(root?.group) ?? root;
      return buildGroupItem(group, root, `グループ ${index + 1}`);
    })
    .filter((group) => Boolean(group.name?.trim()));
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
    asRecord(root.data)?.groups,
    asRecord(root.data)?.memberships,
    root.data,
    root.items,
    root.results,
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
        <h1 className="inline-block w-full border-b-2 border-current pb-1 text-2xl font-extrabold">
          グループ設定
        </h1>
        <p className="mt-6">
          所属グループの確認・切り替え・管理を行うページです。
        </p>
      </div>
    );
  }

  if (!idToken) {
    return (
      <div className="prose max-w-none p-6">
        <h1 className="inline-block w-full border-b-2 border-current pb-1 text-2xl font-extrabold">
          グループ設定
        </h1>
        <p className="mt-6 text-sm text-red-600">
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

  const groupsRes = await fetch(`${apiUrl}/groups`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
    cache: "no-store",
  }).catch(() => null);

  const groupsPayload = groupsRes?.ok
    ? await groupsRes.json().catch(() => null)
    : null;

  const groupsFromGroupsApi = normalizeGroups(groupsPayload);
  const groupsFromMemberships = normalizeMemberships(memberships);

  const roleByKey = new Map<string, string>();
  for (const membershipGroup of groupsFromMemberships) {
    if (membershipGroup.id && membershipGroup.role) {
      roleByKey.set(`id:${membershipGroup.id}`, membershipGroup.role);
    }
    if (membershipGroup.ashareKey && membershipGroup.role) {
      roleByKey.set(`share:${membershipGroup.ashareKey}`, membershipGroup.role);
    }
  }

  let groupList =
    groupsFromGroupsApi.length > 0
      ? groupsFromGroupsApi.map((group) => {
          const role =
            (group.id ? roleByKey.get(`id:${group.id}`) : undefined) ??
            (group.ashareKey
              ? roleByKey.get(`share:${group.ashareKey}`)
              : undefined);

          return {
            ...group,
            role: role ?? group.role,
          };
        })
      : groupsFromMemberships;

  if (groupList.length === 0) {
    redirect("/groups/empty");
  }

  return (
    <div className="prose max-w-none p-6">
      <h1 className="inline-block w-full border-b-2 border-current pb-1 text-2xl font-extrabold">
        グループ設定
      </h1>

      <p className="mt-6 text-sm text-slate-600 dark:text-slate-300">
        あなたが参加しているグループは {groupList.length} 件です。
      </p>

      <div className="not-prose mt-8 space-y-6">
        {groupList.map((group, index) => (
          <section
            key={group.id ?? `${group.name}-${index}`}
            className="rounded-lg border bg-card p-5"
          >
            <h2 className="text-lg font-bold">{group.name}</h2>

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-[140px_1fr] items-center gap-3 text-base sm:text-lg">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  グループID
                </span>
                <span className="font-medium break-all">{group.id ?? "-"}</span>
              </div>

              <div className="grid grid-cols-[140px_1fr] items-center gap-3 text-base sm:text-lg">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  ashare_key
                </span>
                <span className="font-medium break-all">
                  {group.ashareKey ?? "-"}
                </span>
              </div>

              <div className="grid grid-cols-[140px_1fr] items-center gap-3 text-base sm:text-lg">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  ssign_mode
                </span>
                <span className="font-medium break-all">
                  {group.ssignMode ?? "-"}
                </span>
              </div>

              <div className="grid grid-cols-[140px_1fr] items-center gap-3 text-base sm:text-lg">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  balance_type
                </span>
                <span className="font-medium break-all">
                  {group.balanceType ?? "-"}
                </span>
              </div>

              <div className="grid grid-cols-[140px_1fr] items-center gap-3 text-base sm:text-lg">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  Admin
                </span>
                <span className="font-medium break-all">
                  {group.adminName ?? "-"}
                </span>
              </div>

              <div className="grid grid-cols-[140px_1fr] items-center gap-3 text-base sm:text-lg">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  あなたの権限
                </span>
                <span className="font-medium break-all">
                  {group.role ?? "-"}
                </span>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
