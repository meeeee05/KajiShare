import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import TaskResourceDeleteButton from "@/components/task-resource-delete-button";
import GroupTaskCreateButton from "./_components/group-task-create-button";
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
  scheduleType: "weekly" | "biweekly" | "";
  startsOn?: string;
  active: boolean;
  sourceIndex: number;
};

// nullでないか
const asRecord = (value: unknown): AnyRecord | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as AnyRecord;
};

// 文字列へ変換
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

// APIのattributesを取り出す
const unwrapEntity = (value: AnyRecord | null) =>
  asRecord(value?.attributes) ?? asRecord(value?.data) ?? value;

// data配列を取り出す
const dataArray = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }
  const root = asRecord(payload);
  return Array.isArray(root?.data) ? root.data : [];
};

const topLevelArray = (payload: unknown): unknown[] =>
  Array.isArray(payload) ? payload : [];

// グループ一覧の正規化
const normalizeGroups = (payload: unknown): GroupItem[] =>
  dataArray(payload)
    .map((row): GroupItem | null => {
      const group = asRecord(row);
      const name = pickFirstString(group, ["name"]);
      if (!name) {
        return null;
      }
      return { id: pickFirstString(group, ["id"]), name };
    })
    .filter((group): group is GroupItem => Boolean(group));

// 周期タスクの正規化
const normalizeRecurringTask = (
  row: unknown,
  index: number,
): RecurringTaskItem => {
  const root = asRecord(row);
  const scheduleTypeRaw = pickFirstString(root, ["schedule_type"]) ?? "";

  const scheduleType: RecurringTaskItem["scheduleType"] =
    scheduleTypeRaw === "weekly"
      ? "weekly"
      : scheduleTypeRaw === "biweekly"
        ? "biweekly"
        : "";
  return {
    id: pickFirstString(root, ["id"]),
    name: pickFirstString(root, ["name"]) ?? "",
    point: pickFirstString(root, ["point"]),
    description: pickFirstString(root, ["description"]),
    scheduleType,
    startsOn: pickFirstString(root, ["starts_on"]),
    active: root?.active === true,
    sourceIndex: index,
  };
};

// 周期タスクを通常タスクと同じ表示形式に揃える
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

// タスク一覧の正規化
const normalizeTask = (row: unknown, index: number): TaskItem => {
  const resource = asRecord(row);
  const task = unwrapEntity(resource);
  return {
    id: pickFirstString(resource, ["id"]),
    name: pickFirstString(task, ["name"]) ?? "",
    point: pickFirstString(task, ["point"]),
    description: pickFirstString(task, ["description"]),
    createdAt: pickFirstString(task, ["scheduled_for"]),
    sourceIndex: index,
  };
};

export default async function TasksPage() {
  const session = await auth();

  // 未サインインならセッション切れページへ
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

  // APIからJSONを取得する
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

  const groups = normalizeGroups(await fetchOkJson(`${v1Base}/groups`));

  // グループがない場合は案内を表示
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
          <p className="text-slate-600 dark:text-slate-300">
            グループを追加することでグループ内でタスクを管理できます。
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

  // グループごとに通常タスクと周期タスクを取得
  const groupsWithTasks = await Promise.all(
    groups.map(async (group) => {
      if (!group.id) {
        return {
          group,
          tasks: [] as TaskItem[],
        };
      }

      const groupId = encodeURIComponent(group.id);
      const [payload, recurringPayload] = await Promise.all([
        fetchOkJson(`${v1Base}/groups/${groupId}/tasks`),
        fetchOkJson(`${v1Base}/groups/${groupId}/recurring_tasks`),
      ]);

      const tasks = dataArray(payload)
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

      const recurringTasks = topLevelArray(recurringPayload)
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
                              <TaskResourceDeleteButton
                                taskId={task.sourceTaskId}
                                groupId={group.id}
                                apiUrl={apiUrl}
                                resourceType="recurring"
                              />
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )
                          ) : (
                            <TaskResourceDeleteButton
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
