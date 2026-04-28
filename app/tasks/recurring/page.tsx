import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import RecurringTaskManager from "@/components/recurring-task-panel";

type AnyRecord = Record<string, unknown>;

type GroupItem = {
  id?: string;
  name: string;
  createdById?: string;
  creatorId?: string;
  creatorEmail?: string;
};

const asRecord = (value: unknown): AnyRecord | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as AnyRecord;
};

const normalizeText = (value?: string) => (value ?? "").trim().toLowerCase();

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

const firstArray = (...values: unknown[]): unknown[] => {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
};

const extractGroupsArray = (payload: unknown): unknown[] => {
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
    root.groups,
    root.memberships,
    root.data,
    root.items,
    root.results,
    rootData?.groups,
    rootData?.memberships,
    rootData?.items,
    rootData?.results,
    rootDataData?.groups,
    rootDataData?.memberships,
    rootDataData?.items,
    rootDataData?.results,
  );
};

const normalizeGroups = (payloads: unknown[]): GroupItem[] => {
  const map = new Map<string, GroupItem>();

  const put = (group: GroupItem) => {
    const key = group.id ? `id:${group.id}` : `name:${group.name}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, group);
      return;
    }

    map.set(key, {
      ...existing,
      ...group,
      createdById: existing.createdById ?? group.createdById,
      creatorId: existing.creatorId ?? group.creatorId,
      creatorEmail: existing.creatorEmail ?? group.creatorEmail,
    });
  };

  for (const payload of payloads) {
    const rows = extractGroupsArray(payload);
    for (const row of rows) {
      const root = asRecord(row);
      const membershipGroup = asRecord(root?.group);
      const item = membershipGroup ?? root;
      const creator = asRecord(item?.creator) ?? asRecord(root?.creator);

      const id = pickFirstString(item, ["id", "group_id", "groupId"]);
      const name = pickFirstString(item, ["name"]);
      const createdById = pickFirstString(item, [
        "created_by_id",
        "createdById",
        "creator_id",
        "creatorId",
      ]);
      const creatorId = pickFirstString(creator, ["id", "user_id", "userId"]);
      const creatorEmail = pickFirstString(creator, ["email", "mail"]);

      if (!name) {
        continue;
      }

      put({ id, name, createdById, creatorId, creatorEmail });
    }
  }

  return Array.from(map.values());
};

export default async function RecurringTasksPage({
  searchParams,
}: {
  searchParams?: { group?: string };
}) {
  const session = await auth();

  if (!session) {
    redirect("/auth/timeout");
  }

  const apiUrl = process.env.API_URL;
  const idToken = (session.user as { idToken?: string } | undefined)?.idToken;
  const currentUserId = (session.user as { id?: string } | undefined)?.id;
  const currentUserEmail = session.user?.email ?? undefined;

  if (!apiUrl || !idToken) {
    throw new Error(
      !apiUrl ? "API_URL is not configured" : "ID token is missing",
    );
  }

  const selectedGroupId = searchParams?.group;
  const base = apiUrl.replace(/\/+$/, "");
  const v1Base = base.endsWith("/api/v1") ? base : `${base}/api/v1`;

  const fetchOkJson = async (url: string): Promise<unknown | null> => {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      cache: "no-store",
    }).catch(() => null);

    if (!res?.ok) {
      return null;
    }

    return res.json().catch(() => null);
  };

  const [groupsV1, groupsLegacy, membershipsV1, membershipsLegacy] =
    await Promise.all([
      fetchOkJson(`${v1Base}/groups`),
      fetchOkJson(`${base}/groups`),
      fetchOkJson(`${v1Base}/memberships`),
      fetchOkJson(`${base}/memberships`),
    ]);

  const groups = normalizeGroups([
    groupsV1,
    groupsLegacy,
    membershipsV1,
    membershipsLegacy,
  ]);

  const sortedGroups = [...groups].sort((a, b) => {
    if (
      selectedGroupId &&
      a.id === selectedGroupId &&
      b.id !== selectedGroupId
    ) {
      return -1;
    }
    if (
      selectedGroupId &&
      b.id === selectedGroupId &&
      a.id !== selectedGroupId
    ) {
      return 1;
    }
    return a.name.localeCompare(b.name, "ja");
  });

  return (
    <div className="prose max-w-none p-4 sm:p-6">
      <div className="not-prose mb-4 flex flex-col items-start justify-between gap-3 border-b-2 border-current pb-2 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-extrabold">周期タスク管理</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            毎週実施するタスクを自動で設定できます。
          </p>
        </div>
        <Link
          href="/tasks"
          className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-900"
        >
          タスク一覧へ戻る
        </Link>
      </div>

      {sortedGroups.length === 0 ? (
        <div className="not-prose mt-6 rounded-lg border p-4 text-sm text-slate-600 dark:text-slate-300">
          参加中のグループがありません。
        </div>
      ) : (
        <div className="not-prose mt-6 space-y-5">
          {sortedGroups.map((group) => {
            const ownerIds = [group.createdById, group.creatorId]
              .map((value) => normalizeText(value))
              .filter((value) => value.length > 0);
            const ownerEmail = normalizeText(group.creatorEmail);
            const meId = normalizeText(currentUserId);
            const meEmail = normalizeText(currentUserEmail);
            const hasOwnerSignal = ownerIds.length > 0 || ownerEmail.length > 0;

            const canManage =
              !hasOwnerSignal ||
              (ownerIds.length > 0 &&
                meId.length > 0 &&
                ownerIds.includes(meId)) ||
              (ownerEmail.length > 0 &&
                meEmail.length > 0 &&
                ownerEmail === meEmail);

            return (
              <section
                key={group.id ?? group.name}
                className="rounded-xl border bg-white p-4 shadow-sm dark:bg-slate-950 sm:p-5"
              >
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-lg font-bold tracking-tight">
                    {group.name}
                  </h2>
                  {selectedGroupId && group.id === selectedGroupId ? (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                      選択中
                    </span>
                  ) : null}
                </div>

                <RecurringTaskManager
                  groupId={group.id}
                  apiUrl={apiUrl}
                  canManage={canManage}
                />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
