import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import GroupTaskCreateButton from "@/components/group-task-create-button";

type AnyRecord = Record<string, unknown>;

type GroupItem = {
  id?: string;
  name: string;
};

type TaskItem = {
  id?: string;
  title: string;
  assigneeName?: string;
  status?: string;
  dueDate?: string;
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
    if (!map.has(key)) {
      map.set(key, group);
    }
  };

  for (const payload of payloads) {
    const rows = extractGroupsArray(payload);
    for (const row of rows) {
      const root = asRecord(row);
      const membershipGroup = asRecord(root?.group);
      const item = membershipGroup ?? root;

      const id = pickFirstString(item, ["id", "group_id", "groupId"]);
      const name = pickFirstString(item, ["name"]);

      if (!name) {
        continue;
      }

      put({ id, name });
    }
  }

  return Array.from(map.values());
};

const extractTasksArray = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  const root = asRecord(payload);
  if (!root) {
    return [];
  }

  const rootData = asRecord(root.data);
  const rootDataData = asRecord(rootData?.data);
  const rootTask = asRecord(root.task);

  return firstArray(
    root.tasks,
    root.items,
    root.results,
    root.data,
    rootTask?.items,
    rootTask?.tasks,
    rootData?.tasks,
    rootData?.items,
    rootData?.results,
    rootData?.data,
    rootDataData?.tasks,
    rootDataData?.items,
    rootDataData?.results,
  );
};

const normalizeTask = (row: unknown, index: number): TaskItem => {
  const root = asRecord(row);
  const task = asRecord(root?.task) ?? root;
  const assignee = asRecord(task?.assignee) ?? asRecord(task?.user);

  const title =
    pickFirstString(task, ["title", "name", "task_name", "content"]) ??
    `タスク ${index + 1}`;

  return {
    id: pickFirstString(task, ["id", "task_id", "taskId"]),
    title,
    assigneeName: pickFirstString(assignee, ["name", "display_name"]),
    status: pickFirstString(task, ["status", "state"]),
    dueDate: pickFirstString(task, ["due_date", "dueDate", "deadline"]),
  };
};

export default async function TasksPage() {
  const session = await auth();

  if (!session) {
    redirect("/auth/signin");
  }

  const apiUrl = process.env.API_URL;
  const idToken = (session.user as { idToken?: string } | undefined)?.idToken;

  if (!apiUrl || !idToken) {
    throw new Error(
      !apiUrl ? "API_URL is not configured" : "ID token is missing",
    );
  }

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

  if (groups.length === 0) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-2xl font-extrabold">タスク一覧</h1>
        <p className="text-slate-600 dark:text-slate-300">
          参加中のグループがありません。
        </p>
        <Link
          href="/groups/empty"
          className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          グループを追加する
        </Link>
      </div>
    );
  }

  const groupsWithTasks = await Promise.all(
    groups.map(async (group) => {
      if (!group.id) {
        return { group, tasks: [] as TaskItem[] };
      }

      const candidates = [
        `${v1Base}/groups/${encodeURIComponent(group.id)}/tasks`,
        `${base}/groups/${encodeURIComponent(group.id)}/tasks`,
        `${v1Base}/tasks?group_id=${encodeURIComponent(group.id)}`,
        `${base}/tasks?group_id=${encodeURIComponent(group.id)}`,
      ];

      let payload: unknown | null = null;
      for (const url of candidates) {
        const data = await fetchOkJson(url);
        if (data != null) {
          payload = data;
          break;
        }
      }

      const tasks = extractTasksArray(payload).map(normalizeTask);
      return { group, tasks };
    }),
  );

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-extrabold">タスク一覧</h1>

      <div className="space-y-5">
        {groupsWithTasks.map(({ group, tasks }) => (
          <section key={group.id ?? group.name} className="rounded-lg border p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold">{group.name}</h2>
              <div className="flex flex-col items-end gap-2">
                <span className="text-sm text-slate-500">{tasks.length} 件</span>
                <GroupTaskCreateButton groupId={group.id} apiUrl={apiUrl} />
              </div>
            </div>

            {tasks.length === 0 ? (
              <p className="text-sm text-slate-500">このグループのタスクはまだありません。</p>
            ) : (
              <ul className="space-y-2">
                {tasks.map((task, index) => (
                  <li
                    key={task.id ?? `${group.id ?? group.name}-${index}`}
                    className="rounded-md border bg-card px-3 py-2"
                  >
                    <p className="font-medium">{task.title}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      {task.assigneeName ? <span>担当: {task.assigneeName}</span> : null}
                      {task.status ? <span>状態: {task.status}</span> : null}
                      {task.dueDate ? <span>期限: {task.dueDate}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
