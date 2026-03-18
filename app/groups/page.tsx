import { redirect } from "next/navigation";
import { auth } from "@/auth";
import Link from "next/link";
import GroupLeaveLink from "@/components/group-leave-link";
import GroupEditableField from "../../components/group-editable-field";

type AnyRecord = Record<string, unknown>;

type GroupListItem = {
  id?: string;
  name: string;
  share_key?: string;
  assign_mode?: string;
  balancedType?: string;
  creator?: {
    name?: string;
  };
  role?: string;
};

const SHARE_KEY = "share_key";

const ASSIGN_MODE = "assign_mode";

const BALANCE_TYPE = "balance_type";

const normalizeAssignMode = (value?: string) => {
  const normalized = normalizeText(value);

  if (!normalized) {
    return "";
  }

  if (normalized.includes("バランス") || normalized.includes("balanced")) {
    return "balanced";
  }
  if (normalized.includes("random") || normalized.includes("ランダム")) {
    return "random";
  }
  if (normalized.includes("manual") || normalized.includes("手動")) {
    return "manual";
  }

  return normalized;
};

const isbalancedAssignMode = (value?: string) => {
  return normalizeAssignMode(value) === "balanced";
};

const normalizeText = (value?: string) => (value ?? "").trim().toLowerCase();

const isFallbackName = (name?: string) => /^グループ\s+\d+$/.test(name ?? "");

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

const unwrapEntity = (value: AnyRecord | null) =>
  asRecord(value?.attributes) ?? asRecord(value?.data) ?? value;

const pickFromSources = (
  sourceA: AnyRecord | null,
  sourceB: AnyRecord | null,
  keys: string[],
) => pickFirstString(sourceA, keys) ?? pickFirstString(sourceB, keys);

const buildGroupItem = (
  group: AnyRecord | null,
  base: AnyRecord | null,
  fallbackName: string,
): GroupListItem => {
  const sourceGroup = unwrapEntity(group);
  const sourceBase = unwrapEntity(base);

  const id = pickFromSources(sourceGroup, sourceBase, [
    "id",
    "group_id",
    "groupId",
    "gid",
  ]);

  const name =
    pickFirstString(sourceGroup, ["name"]) ??
    pickFirstString(sourceBase, ["name"]) ??
    fallbackName;

  const share_key = pickFromSources(sourceGroup, sourceBase, [SHARE_KEY]);

  const assign_mode = normalizeAssignMode(
    pickFromSources(sourceGroup, sourceBase, [ASSIGN_MODE]),
  );

  const balancedType = pickFromSources(sourceGroup, sourceBase, [BALANCE_TYPE]);

  const creatorSource = asRecord(sourceGroup?.creator);

  const creator = creatorSource
    ? {
        name: pickFirstString(creatorSource, ["name"]),
      }
    : undefined;

  return {
    id,
    name,
    share_key,
    assign_mode,
    balancedType,
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

const firstArray = (...values: unknown[]): unknown[] => {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) {
      return value;
    }
  }

  return [];
};

const extractMembershipsArray = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  const root = asRecord(payload);
  if (!root) {
    return [];
  }

  const rootData = asRecord(root.data);
  const rootDataData = asRecord(rootData?.data);

  return firstArray(
    root.memberships,
    root.groups,
    rootData?.data,
    rootData?.groups,
    rootData?.memberships,
    rootData?.rows,
    rootData?.list,
    rootData?.results,
    rootData?.items,
    rootDataData?.groups,
    rootDataData?.memberships,
    rootDataData?.rows,
    rootDataData?.list,
    rootDataData?.results,
    rootDataData?.items,
    root.items,
    root.results,
    root.rows,
    root.list,
  );
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
      const name =
        pickFirstString(detail, ["name"]) ?? pickFirstString(root, ["name"]);

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

  if (!apiUrl || !idToken) {
    throw new Error(
      !apiUrl ? "API_URL is not configured" : "ID token is missing",
    );
  }

  const currentUserName = normalizeText(session.user?.name ?? undefined);

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
  const memberships = membershipsPayloads.flatMap((payload) =>
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
    if (membershipGroup.share_key && membershipGroup.role) {
      roleByKey.set(`share:${membershipGroup.share_key}`, membershipGroup.role);
    }
  }

  const mergedMap = new Map<string, GroupListItem>();

  const findExistingKey = (group: GroupListItem): string | undefined => {
    const nextId = normalizeText(group.id);
    const nextShare = normalizeText(group.share_key);
    const nextName = normalizeText(group.name);
    let foundKey: string | undefined;

    mergedMap.forEach((prev, key) => {
      if (foundKey) {
        return;
      }

      const prevId = normalizeText(prev.id);
      const prevShare = normalizeText(prev.share_key);
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
      : group.share_key
        ? `share:${group.share_key}`
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
      share_key: group.share_key ?? prev.share_key,
      assign_mode: group.assign_mode ?? prev.assign_mode,
      balancedType: group.balancedType ?? prev.balancedType,
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
      (group.share_key ? roleByKey.get(`share:${group.share_key}`) : undefined);

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
              shareKey={group.share_key}
              apiUrl={apiUrl}
              field="name"
              value={group.name}
              textClassName="text-lg font-bold"
              inputClassName="text-base"
              linkHref="/tasks"
            />

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-[140px_1fr] items-center gap-3 text-base sm:text-lg">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  share_key
                </span>
                <span className="font-medium break-all">
                  {group.share_key ?? "-"}
                </span>
              </div>

              <div className="grid grid-cols-[140px_1fr] items-center gap-3 text-base sm:text-lg">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  担当割り当て
                </span>
                <GroupEditableField
                  groupId={group.id}
                  shareKey={group.share_key}
                  apiUrl={apiUrl}
                  field="assign_mode"
                  value={group.assign_mode}
                  textClassName="font-medium text-sm sm:text-base break-all"
                />
              </div>

              {isbalancedAssignMode(group.assign_mode) ? (
                <div className="grid grid-cols-[140px_1fr] items-center gap-3 text-base sm:text-lg">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    負担バランス
                  </span>
                  <GroupEditableField
                    groupId={group.id}
                    shareKey={group.share_key}
                    apiUrl={apiUrl}
                    field="balance_type"
                    value={group.balancedType}
                    textClassName="font-medium break-all"
                  />
                </div>
              ) : null}

              <div className="grid grid-cols-[140px_1fr] items-center gap-3 text-base sm:text-lg">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  管理者
                </span>
                <span className="font-semibold break-all">
                  {group.creator?.name ?? "-"}
                </span>
              </div>

              <div className="grid grid-cols-[140px_1fr] items-center gap-3 text-base sm:text-lg">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  あなたの権限
                </span>
                <span className="font-semibold break-all">
                  {currentUserName !== "" &&
                  currentUserName === normalizeText(group.creator?.name)
                    ? "管理者"
                    : "メンバー"}
                </span>
              </div>

              <div className="pt-2">
                <GroupLeaveLink
                  groupId={group.id}
                  shareKey={group.share_key}
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
