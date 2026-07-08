import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import RecurringTaskManager from "./_components/recurring-task-panel";
import {
  GUEST_EXPIRED_REDIRECT_PATH,
  isGuestSessionExpiredStatus,
  isGuestSessionUser,
} from "@/lib/guest-session";
import { backendOrigin } from "@/lib/backend-origin";
import { backendServerHeaders } from "@/lib/backend-server-headers";

// 型定義
type AnyRecord = Record<string, unknown>;
type GroupItem = {
  id?: string;
  name: string;
};
type MembershipItem = {
  groupId?: string;
  userId?: string;
  role?: string;
};

// nullでないか
const asRecord = (value: unknown): AnyRecord | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as AnyRecord;
};

// 比較用に文字列を正規化
const normalizeText = (value?: string) => (value ?? "").trim().toLowerCase();

// 最初に見つかった文字列値を取り出す
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

// APIレスポンスから配列を取り出す
const dataArray = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }
  const root = asRecord(payload);
  return Array.isArray(root?.data) ? root.data : [];
};

// JSON:API resource の attributes を取り出す
const unwrapEntity = (value: AnyRecord | null) =>
  asRecord(value?.attributes) ?? asRecord(value?.data) ?? value;

// JSON:API relationship の id を取り出す
const pickRelationshipId = (row: unknown, key: string) => {
  const resource = asRecord(row);
  const relationships = asRecord(resource?.relationships);
  const relationship = asRecord(relationships?.[key]);
  const data = asRecord(relationship?.data);
  return pickFirstString(data, ["id"]);
};

// グループ一覧の正規化
const normalizeGroups = (payload: unknown): GroupItem[] =>
  dataArray(payload)
    .map((row): GroupItem | null => {
      const group = asRecord(row);
      const name = pickFirstString(group, ["name"]);
      if (!name) {
        return null;
      }
      return {
        id: pickFirstString(group, ["id"]),
        name,
      };
    })
    .filter((group): group is GroupItem => Boolean(group));

// メンバーシップ一覧の正規化
const normalizeMemberships = (payload: unknown): MembershipItem[] =>
  dataArray(payload).map((row) => {
    const membership = unwrapEntity(asRecord(row));
    return {
      groupId: pickFirstString(membership, ["group_id"]),
      userId: pickRelationshipId(row, "user"),
      role: pickFirstString(membership, ["role"]),
    };
  });

export default async function RecurringTasksPage({
  searchParams,
}: {
  searchParams?: { group?: string };
}) {
  const session = await auth();

  if (!session) {
    redirect("/auth/signin");
  }

  const apiUrl = process.env.API_URL;
  const idToken = (session.user as { idToken?: string } | undefined)?.idToken;
  const isGuestSession = isGuestSessionUser(session.user);
  const currentUserId =
    (session.user as { id?: string } | undefined)?.id ??
    (session.user as { userId?: string } | undefined)?.userId;

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
        Origin: backendOrigin(),
        ...backendServerHeaders(),
      },
      cache: "no-store",
    }).catch(() => null);

    if (!res?.ok) {
      if (res && isGuestSession && isGuestSessionExpiredStatus(res.status)) {
        redirect(GUEST_EXPIRED_REDIRECT_PATH);
      }
      return null;
    }
    return res.json().catch(() => null);
  };

  const [groupsPayload, membershipsPayload] = await Promise.all([
    fetchOkJson(`${v1Base}/groups`),
    fetchOkJson(`${v1Base}/memberships`),
  ]);

  const groups = normalizeGroups(groupsPayload);
  const meId = normalizeText(currentUserId);
  const adminGroupIds = new Set(
    normalizeMemberships(membershipsPayload)
      .filter(
        (membership) =>
          membership.role === "admin" &&
          meId.length > 0 &&
          normalizeText(membership.userId) === meId,
      )
      .map((membership) => normalizeText(membership.groupId))
      .filter((groupId) => groupId.length > 0),
  );

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
            const canManage = adminGroupIds.has(normalizeText(group.id));

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
