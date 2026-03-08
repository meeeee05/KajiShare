import { redirect } from "next/navigation";
import { auth } from "@/auth";
import Link from "next/link";
import GroupLeaveLink from "@/components/group-leave-link";
import GroupEditableField from "../../components/group-editable-field";

type AnyRecord = Record<string, unknown>;

type GroupListItem = {
  id?: string;
  name: string;
  shareKey?: string;
  assign_mode?: string;
  balanceType?: string;
  createdById?: string;
  creator?: {
    id?: string;
    name?: string;
    email?: string;
    picture?: string;
    accountType?: string;
  };
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

  const visited = new Set<unknown>();

  const walk = (value: unknown, depth: number): string | undefined => {
    if (depth > 5 || value == null) {
      return undefined;
    }

    if (typeof value !== "object") {
      return undefined;
    }

    if (visited.has(value)) {
      return undefined;
    }
    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = walk(item, depth + 1);
        if (nested) {
          return nested;
        }
      }
      return undefined;
    }

    const record = value as AnyRecord;

    for (const [key, v] of Object.entries(record)) {
      const lower = key.toLowerCase();
      if (
        typeof v === "string" &&
        v.trim() &&
        lower.includes("name") &&
        !lower.includes("admin") &&
        !lower.includes("owner") &&
        !lower.includes("user")
      ) {
        return v;
      }
    }

    for (const v of Object.values(record)) {
      const nested = walk(v, depth + 1);
      if (nested) {
        return nested;
      }
    }

    return undefined;
  };

  const nestedName = walk(obj, 0);
  if (nestedName) {
    return nestedName;
  }

  return undefined;
};

/*const pickAdminName = (
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
};*/

const buildGroupItem = (
  group: AnyRecord | null,
  base: AnyRecord | null,
  fallbackName: string,
): GroupListItem => {
  const sourceGroup =
    asRecord(group?.attributes) ?? asRecord(group?.data) ?? group;
  const sourceBase = asRecord(base?.attributes) ?? asRecord(base?.data) ?? base;

  const id =
    pickFirstString(sourceGroup, ["id", "group_id", "groupId"]) ??
    pickFirstString(sourceBase, ["group_id", "groupId", "id", "gid"]);

  const name =
    pickLikelyGroupName(sourceGroup) ??
    pickLikelyGroupName(sourceBase) ??
    fallbackName;

  const shareKey =
    pickFirstString(sourceGroup, [
      "share_key",
      "shareKey",
      "sharekey",
      "invite_code",
      "inviteCode",
      "ashare_key",
      "a_share_key",
    ]) ??
    pickFirstString(sourceBase, [
      "share_key",
      "shareKey",
      "sharekey",
      "invite_code",
      "inviteCode",
      "ashare_key",
      "a_share_key",
    ]);

  const assign_mode =
    pickFirstString(sourceGroup, [
      "assign_mode",
      "assignment_mode",
      "assign_mode",
      "assignmentMode",
    ]) ??
    pickFirstString(sourceBase, [
      "assign_mode",
      "assignment_mode",
      "assign_mode",
      "assignmentMode",
      "signMode",
      "assign_mode",
    ]) ??
    pickFirstString(sourceBase, [
      "ssign_mode",
      "sign_mode",
      "assign_mode",
      "assignment_mode",
      "signMode",
      "assign_mode",
    ]);

  const balanceType =
    pickFirstString(sourceGroup, ["balance_type", "balanceType"]) ??
    pickFirstString(sourceBase, ["balance_type", "balanceType"]);

  const creatorSource =
    asRecord(sourceGroup?.creator) ??
    asRecord(sourceBase?.creator) ??
    asRecord(sourceGroup?.created_by) ??
    asRecord(sourceBase?.created_by) ??
    asRecord(sourceGroup?.createdBy) ??
    asRecord(sourceBase?.createdBy);

  const createdById =
    pickFirstString(sourceGroup, ["created_by_id", "createdById"]) ??
    pickFirstString(sourceBase, ["created_by_id", "createdById"]);

  const creator = creatorSource
    ? {
        id: pickFirstString(creatorSource, ["id", "user_id", "userId"]),
        name: pickFirstString(creatorSource, [
          "name",
          "full_name",
          "fullName",
          "display_name",
          "displayName",
          "username",
        ]),
        email: pickFirstString(creatorSource, ["email"]),
        picture: pickFirstString(creatorSource, ["picture", "image", "avatar"]),
        accountType: pickFirstString(creatorSource, [
          "account_type",
          "accountType",
        ]),
      }
    : undefined;

  //const adminName = creator?.name ?? pickAdminName(sourceGroup, sourceBase);

  return {
    id,
    name,
    shareKey,
    assign_mode,
    balanceType,
    createdById,
    creator,
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

const toArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  const values = Object.values(record);
  if (values.length === 0) {
    return [];
  }

  const objectLikeCount = values.filter(
    (v) => typeof v === "object" && v !== null,
  ).length;

  return objectLikeCount > 0 ? values : [];
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
    asRecord(root.data)?.data,
    asRecord(root.data)?.groups,
    asRecord(root.data)?.memberships,
    asRecord(root.data)?.rows,
    asRecord(root.data)?.list,
    asRecord(root.data)?.results,
    asRecord(root.data)?.items,
    asRecord(asRecord(root.data)?.data)?.groups,
    asRecord(asRecord(root.data)?.data)?.memberships,
    asRecord(asRecord(root.data)?.data)?.rows,
    asRecord(asRecord(root.data)?.data)?.list,
    asRecord(asRecord(root.data)?.data)?.results,
    asRecord(asRecord(root.data)?.data)?.items,
    root.data,
    root.items,
    root.results,
    root.rows,
    root.list,
  ];

  for (const candidate of candidates) {
    const arr = toArray(candidate);
    if (arr.length > 0) {
      return arr;
    }
  }
  return [];
};

const enrichFallbackNames = async (
  groups: GroupListItem[],
  apiUrl: string,
  idToken: string,
): Promise<GroupListItem[]> => {
  return Promise.all(
    groups.map(async (group) => {
      const isFallback = /^グループ\s+\d+$/.test(group.name);
      if (!isFallback || !group.id) {
        return group;
      }

      const res = await fetch(`${apiUrl}/groups/${group.id}`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        cache: "no-store",
      }).catch(() => null);

      if (!res?.ok) {
        return group;
      }

      const payload = await res.json().catch(() => null);
      const root = asRecord(payload);
      const detail = asRecord(root?.group) ?? asRecord(root?.data) ?? root;
      const name = pickLikelyGroupName(detail) ?? pickLikelyGroupName(root);

      if (!name) {
        return group;
      }

      return {
        ...group,
        name,
      };
    }),
  );
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
        <div className="not-prose mb-2 flex items-center justify-between gap-3 border-b-2 border-current pb-1">
          <h1 className="text-2xl font-extrabold">グループ設定</h1>
          <Link
            href="/groups/empty?from=groups"
            className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            グループ追加
          </Link>
        </div>
        <p className="mt-6">
          所属グループの確認・切り替え・管理を行うページです。
        </p>
      </div>
    );
  }

  if (!idToken) {
    return (
      <div className="prose max-w-none p-6">
        <div className="not-prose mb-2 flex items-center justify-between gap-3 border-b-2 border-current pb-1">
          <h1 className="text-2xl font-extrabold">グループ設定</h1>
          <Link
            href="/groups/empty?from=groups"
            className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            グループ追加
          </Link>
        </div>
        <p className="mt-6 text-sm text-red-600">
          セッション情報の取得に失敗しました。再サインインしてください。
        </p>
      </div>
    );
  }

  let memberships: unknown[] = [];
  const trimmedApiUrl = apiUrl.replace(/\/+$/, "");
  const v1ApiUrl = trimmedApiUrl.endsWith("/api/v1")
    ? trimmedApiUrl
    : `${trimmedApiUrl}/api/v1`;

  const fetchAllOkJson = async (urls: string[]): Promise<unknown[]> => {
    const payloads: unknown[] = [];

    for (const url of urls) {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        cache: "no-store",
      }).catch(() => null);

      if (!res?.ok) {
        continue;
      }

      const payload = await res.json().catch(() => null);
      if (payload != null) {
        payloads.push(payload);
      }
    }

    return payloads;
  };

  const membershipsPayloads = await fetchAllOkJson([
    `${trimmedApiUrl}/memberships`,
    `${v1ApiUrl}/memberships`,
  ]);
  memberships = membershipsPayloads.flatMap((payload) =>
    extractMembershipsArray(payload),
  );

  const groupsPayloads = await fetchAllOkJson([
    `${v1ApiUrl}/groups`,
    `${trimmedApiUrl}/groups`,
  ]);

  const groupsFromGroupsApi = groupsPayloads.flatMap((payload) =>
    normalizeGroups(payload),
  );
  const groupsFromMemberships = normalizeMemberships(memberships);

  const roleByKey = new Map<string, string>();
  for (const membershipGroup of groupsFromMemberships) {
    if (membershipGroup.id && membershipGroup.role) {
      roleByKey.set(`id:${membershipGroup.id}`, membershipGroup.role);
    }
    if (membershipGroup.shareKey && membershipGroup.role) {
      roleByKey.set(`share:${membershipGroup.shareKey}`, membershipGroup.role);
    }
  }

  const mergedMap = new Map<string, GroupListItem>();

  const normalizeText = (value?: string) => (value ?? "").trim().toLowerCase();

  const isFallbackName = (name?: string) => /^グループ\s+\d+$/.test(name ?? "");

  const findExistingKey = (group: GroupListItem): string | undefined => {
    const nextId = normalizeText(group.id);
    const nextShare = normalizeText(group.shareKey);
    const nextName = normalizeText(group.name);
    let foundKey: string | undefined;

    mergedMap.forEach((prev, key) => {
      if (foundKey) {
        return;
      }

      const prevId = normalizeText(prev.id);
      const prevShare = normalizeText(prev.shareKey);
      const prevName = normalizeText(prev.name);

      if (nextId && prevId && nextId === prevId) {
        foundKey = key;
        return;
      }

      if (nextShare && prevShare && nextShare === prevShare) {
        foundKey = key;
        return;
      }

      if (
        nextName &&
        prevName &&
        nextName === prevName &&
        !isFallbackName(group.name) &&
        !isFallbackName(prev.name)
      ) {
        foundKey = key;
        return;
      }
    });

    return foundKey;
  };

  const put = (group: GroupListItem) => {
    const preferredKey = group.id
      ? `id:${group.id}`
      : group.shareKey
        ? `share:${group.shareKey}`
        : `name:${group.name}`;

    const existingKey = findExistingKey(group);
    const key = existingKey ?? preferredKey;

    const prev = mergedMap.get(key);
    if (!prev) {
      mergedMap.set(key, group);
      return;
    }

    mergedMap.set(key, {
      ...prev,
      ...group,
      id: group.id ?? prev.id,
      shareKey: group.shareKey ?? prev.shareKey,
      assign_mode: group.assign_mode ?? prev.assign_mode,
      balanceType: group.balanceType ?? prev.balanceType,
      createdById: group.createdById ?? prev.createdById,
      creator: group.creator ?? prev.creator,
      name:
        isFallbackName(prev.name) && !isFallbackName(group.name)
          ? group.name
          : prev.name,
      role: group.role ?? prev.role,
    });
  };

  for (const group of groupsFromGroupsApi) {
    const role =
      (group.id ? roleByKey.get(`id:${group.id}`) : undefined) ??
      (group.shareKey ? roleByKey.get(`share:${group.shareKey}`) : undefined);

    put({
      ...group,
      role: role ?? group.role,
    });
  }

  for (const group of groupsFromMemberships) {
    put(group);
  }

  let groupList = Array.from(mergedMap.values());

  groupList = await enrichFallbackNames(groupList, apiUrl, idToken);

  if (groupList.length === 0) {
    redirect("/groups/empty");
  }

  return (
    <div className="prose max-w-none p-6">
      <div className="not-prose mb-2 flex items-center justify-between gap-3 border-b-2 border-current pb-1">
        <h1 className="text-2xl font-extrabold">グループ設定</h1>
        <Link
          href="/groups/empty?from=groups"
          className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
        >
          グループ追加
        </Link>
      </div>

      <p className="mt-6 text-sm text-slate-600 dark:text-slate-300">
        あなたが参加しているグループは {groupList.length} 件です。
      </p>

      <div className="not-prose mt-8 space-y-6">
        {groupList.map((group, index) => (
          <section
            key={group.id ?? `${group.name}-${index}`}
            className="rounded-lg border bg-card p-5"
          >
            <GroupEditableField
              groupId={group.id}
              shareKey={group.shareKey}
              field="name"
              value={group.name}
              textClassName="text-lg font-bold"
              inputClassName="text-base"
            />

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-[140px_1fr] items-center gap-3 text-base sm:text-lg">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  share_key
                </span>
                <span className="font-medium break-all">
                  {group.shareKey ?? "-"}
                </span>
              </div>

              <div className="grid grid-cols-[140px_1fr] items-center gap-3 text-base sm:text-lg">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  担当割り当て
                </span>
                <GroupEditableField
                  groupId={group.id}
                  shareKey={group.shareKey}
                  field="assign_mode"
                  value={group.assign_mode}
                  textClassName="font-medium break-all"
                />
              </div>

              <div className="grid grid-cols-[140px_1fr] items-center gap-3 text-base sm:text-lg">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  負担バランス
                </span>
                <GroupEditableField
                  groupId={group.id}
                  shareKey={group.shareKey}
                  field="balance_type"
                  value={group.balanceType}
                  textClassName="font-medium break-all"
                />
              </div>

              <div className="grid grid-cols-[140px_1fr] items-center gap-3 text-base sm:text-lg">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  管理者
                </span>
                <span className="font-medium break-all">
                  {group.creator?.name ?? "-"}
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

              <div className="pt-2">
                <GroupLeaveLink
                  groupId={group.id}
                  shareKey={group.shareKey}
                  groupName={group.name}
                  apiUrl={apiUrl}
                />
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
