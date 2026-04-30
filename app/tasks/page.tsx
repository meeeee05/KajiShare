import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import GroupTaskCreateButton from "@/components/group-task-create-button";
import TaskDeleteButton from "@/components/task-delete-button";
import {
  GUEST_EXPIRED_REDIRECT_PATH,
  isGuestSessionExpiredStatus,
  isGuestSessionUser,
} from "@/lib/guest-session";

type AnyRecord = Record<string, unknown>;

type GroupItem = {
  id?: string;
  name: string;
};

type TaskItem = {
  id?: string;
  sourceTaskId?: string;
  name: string;
  point?: string;
  description?: string;
  createdAt?: string;
  isRecurring?: boolean;
  sourceIndex: number;
};

type RecurringTaskItem = {
  id?: string;
  name: string;
  point?: string;
  description?: string;
  scheduleType: "weekly" | "every_n_days" | "";
  dayOfWeek?: string;
  intervalDays?: string;
  startsOn?: string;
  active: boolean;
  sourceIndex: number;
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

const unwrapEntity = (value: AnyRecord | null) =>
  asRecord(value?.attributes) ?? asRecord(value?.data) ?? value;

const pickFromSources = (
  sourceA: AnyRecord | null,
  sourceB: AnyRecord | null,
  keys: string[],
) => pickFirstString(sourceA, keys) ?? pickFirstString(sourceB, keys);

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

const extractRecurringTasksArray = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  const root = asRecord(payload);
  if (!root) {
    return [];
  }

  const rootData = asRecord(root.data);
  const rootDataData = asRecord(rootData?.data);
  const rootRecurring = asRecord(root.recurring_task);

  return firstArray(
    root.recurring_tasks,
    root.items,
    root.results,
    root.data,
    rootRecurring?.items,
    rootRecurring?.recurring_tasks,
    rootData?.recurring_tasks,
    rootData?.items,
    rootData?.results,
    rootData?.data,
    rootDataData?.recurring_tasks,
    rootDataData?.items,
    rootDataData?.results,
  );
};

const normalizeRecurringTask = (
  row: unknown,
  index: number,
): RecurringTaskItem => {
  const root = asRecord(row);
  const recurringRoot = asRecord(root?.recurring_task) ?? root;
  const recurring = unwrapEntity(recurringRoot);

  const scheduleTypeRaw =
    pickFromSources(recurring, recurringRoot, [
      "schedule_type",
      "scheduleType",
    ]) ?? "";

  const scheduleType: RecurringTaskItem["scheduleType"] =
    scheduleTypeRaw === "weekly"
      ? "weekly"
      : scheduleTypeRaw === "every_n_days"
        ? "every_n_days"
        : "";

  const activeRaw = pickFromSources(recurring, recurringRoot, ["active"]);
  const active =
    activeRaw == null ? true : activeRaw === "true" || activeRaw === "1";

  return {
    id:
      pickFromSources(recurring, recurringRoot, ["id", "recurring_task_id"]) ??
      pickFirstString(root, ["id", "recurring_task_id"]),
    name:
      pickFromSources(recurring, recurringRoot, ["name", "title"]) ??
      `周期タスク ${index + 1}`,
    point: pickFromSources(recurring, recurringRoot, [
      "point",
      "score",
      "value",
    ]),
    description: pickFromSources(recurring, recurringRoot, [
      "description",
      "detail",
      "memo",
    ]),
    scheduleType,
    dayOfWeek: pickFromSources(recurring, recurringRoot, [
      "day_of_week",
      "dayOfWeek",
    ]),
    intervalDays: pickFromSources(recurring, recurringRoot, [
      "interval_days",
      "intervalDays",
    ]),
    startsOn: pickFromSources(recurring, recurringRoot, [
      "starts_on",
      "startsOn",
    ]),
    active,
    sourceIndex: index,
  };
};

const recurringTaskToTask = (
  recurringTask: RecurringTaskItem,
  index: number,
): TaskItem => {
  const stableId =
    recurringTask.id ?? `${recurringTask.name}:${recurringTask.sourceIndex}`;

  return {
    id: `recurring:${stableId}`,
    sourceTaskId: recurringTask.id,
    name: recurringTask.name,
    point: recurringTask.point,
    description: recurringTask.description,
    createdAt: recurringTask.startsOn,
    isRecurring: true,
    sourceIndex: index,
  };
};

const normalizeTask = (row: unknown, index: number): TaskItem => {
  const root = asRecord(row);
  const taskRoot = asRecord(root?.task) ?? root;
  const task = unwrapEntity(taskRoot);

  const name =
    pickFromSources(task, taskRoot, [
      "name",
      "title",
      "task_name",
      "content",
    ]) ?? `タスク ${index + 1}`;

  return {
    id:
      pickFromSources(task, taskRoot, ["id", "task_id", "taskId"]) ??
      pickFirstString(root, ["id", "task_id", "taskId"]),
    name,
    point: pickFromSources(task, taskRoot, ["point", "score", "value"]),
    description: pickFromSources(task, taskRoot, [
      "description",
      "detail",
      "memo",
    ]),
    createdAt: pickFromSources(task, taskRoot, ["created_at", "createdAt"]),
    sourceIndex: index,
  };
};

export default async function TasksPage() {
  const session = await auth();

  if (!session) {
    redirect("/auth/timeout");
  }

  const apiUrl = process.env.API_URL;
  const idToken = (session.user as { idToken?: string } | undefined)?.idToken;
  const isGuestSession = isGuestSessionUser(session.user);

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
      if (res && isGuestSession && isGuestSessionExpiredStatus(res.status)) {
        redirect(GUEST_EXPIRED_REDIRECT_PATH);
      }

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
      <div className="prose max-w-none p-4 sm:p-6">
        <h1 className="inline-block w-full border-b-2 border-current pb-1 text-2xl font-extrabold">
          タスク一覧
        </h1>
        <div className="not-prose mt-8 space-y-4">
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
      </div>
    );
  }

  const groupsWithTasks = await Promise.all(
    groups.map(async (group) => {
      if (!group.id) {
        return {
          group,
          tasks: [] as TaskItem[],
        };
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

      const recurringCandidates = [
        `${v1Base}/groups/${encodeURIComponent(group.id)}/recurring_tasks`,
        `${base}/groups/${encodeURIComponent(group.id)}/recurring_tasks`,
      ];

      let recurringPayload: unknown | null = null;
      for (const url of recurringCandidates) {
        const data = await fetchOkJson(url);
        if (data != null) {
          recurringPayload = data;
          break;
        }
      }

      const tasks = extractTasksArray(payload)
        .map(normalizeTask)
        .sort((a, b) => {
          const aTime = a.createdAt ? Date.parse(a.createdAt) : Number.NaN;
          const bTime = b.createdAt ? Date.parse(b.createdAt) : Number.NaN;

          const aValid = Number.isFinite(aTime);
          const bValid = Number.isFinite(bTime);

          if (aValid && bValid && aTime !== bTime) {
            return aTime - bTime;
          }

          return a.sourceIndex - b.sourceIndex;
        });

      const recurringTasks = extractRecurringTasksArray(recurringPayload)
        .map(normalizeRecurringTask)
        .sort((a, b) => a.sourceIndex - b.sourceIndex);

      const mergedTasks = [
        ...tasks,
        ...recurringTasks.map((task, index) =>
          recurringTaskToTask(task, tasks.length + index),
        ),
      ];

      return { group, tasks: mergedTasks };
    }),
  );

  return (
    <div className="prose max-w-none p-4 sm:p-6">
      <h1 className="inline-block w-full border-b-2 border-current pb-1 text-2xl font-extrabold">
        タスク一覧
      </h1>

      <div className="not-prose mt-4 flex justify-end">
        <Link
          href="/tasks/recurring"
          className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200 dark:hover:bg-blue-900"
        >
          周期タスク管理へ
        </Link>
      </div>

      <div className="not-prose mt-8 space-y-5">
        {groupsWithTasks.map(({ group, tasks }) => (
          <section
            key={group.id ?? group.name}
            className="rounded-xl border bg-white p-4 shadow-sm dark:bg-slate-950 sm:p-5"
          >
            <div className="mb-4 flex flex-col items-start justify-between gap-3 border-b pb-3 sm:flex-row sm:items-center">
              <h2 className="text-lg font-bold tracking-tight">{group.name}</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                {tasks.length} 件
              </span>
            </div>

            <div className="mb-4">
              <GroupTaskCreateButton groupId={group.id} apiUrl={apiUrl} />
            </div>

            {tasks.length === 0 ? (
              <p className="text-sm text-slate-500">
                このグループのタスクはまだありません。
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="min-w-[640px] w-full border-collapse text-sm">
                  <thead className="bg-slate-50 text-left text-xs dark:bg-slate-900">
                    <tr>
                      <th className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">
                        家事の名前
                      </th>
                      <th className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">
                        負担ポイント（1〜5）
                      </th>
                      <th className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">
                        備考
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700 dark:text-slate-200">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task, index) => (
                      <tr
                        key={task.id ?? `${group.id ?? group.name}-${index}`}
                        className="border-t align-top"
                      >
                        <td className="px-3 py-2 font-medium">{task.name}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                          {task.point ?? "-"}
                        </td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                          {task.description ?? "-"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {task.isRecurring ? (
                            task.sourceTaskId ? (
                              <TaskDeleteButton
                                taskId={task.sourceTaskId}
                                groupId={group.id}
                                apiUrl={apiUrl}
                                resourceType="recurring"
                              />
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )
                          ) : (
                            <TaskDeleteButton
                              taskId={task.id}
                              groupId={group.id}
                              apiUrl={apiUrl}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
