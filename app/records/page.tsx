import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AssignmentStatusButton from "./_components/assignment-status-button";
import {
  GUEST_EXPIRED_REDIRECT_PATH,
  isGuestSessionExpiredStatus,
  isGuestSessionUser,
} from "@/lib/guest-session";
import { backendOrigin } from "@/lib/backend-origin";
import { backendServerHeaders } from "@/lib/backend-server-headers";

// 型定義
type GroupItem = {
  id?: string;
  name: string;
  shareKey?: string;
  assignMode: "manual" | "random" | "balanced" | "";
  balanceType: "more" | "less" | "";
};
type MemberItem = { id?: string; name?: string; email?: string };
type MembershipItem = {
  id?: string;
  groupId?: string;
  member: MemberItem;
};
type TaskItem = {
  id?: string;
  name: string;
  point?: string;
  description?: string;
  createdAt?: string;
  assignmentId?: string;
  assignmentStatus?: string;
  isRecurring?: boolean;
  sourceIndex: number;
};
type AnyRecord = Record<string, unknown>;
type RecurringTaskItem = {
  id?: string;
  name: string;
  description?: string;
  point?: string;
  scheduleType: "weekly" | "biweekly" | "";
  dayOfWeek?: string;
  startsOn?: string;
  active: boolean;
  sourceIndex: number;
};
type AssignmentItem = {
  id?: string;
  taskId?: string;
  status?: string;
  assigneeId?: string;
  assigneeName?: string;
  targetDate?: string;
};

const APP_TIME_ZONE = process.env.APP_TIME_ZONE ?? "Asia/Tokyo";

// 比較用に文字列を正規化
const normalizeText = (value?: string) => (value ?? "").trim().toLowerCase();

// nullでないか
const asRecord = (value: unknown): AnyRecord | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyRecord)
    : null;

const pickFirstString = (
  obj: AnyRecord | null,
  keys: string[],
): string | undefined => {
  if (!obj) return undefined;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return undefined;
};

// JSON読み取り
const unwrapEntity = (value: AnyRecord | null) =>
  asRecord(value?.attributes) ?? asRecord(value?.data) ?? value;

const dataArray = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  const root = asRecord(payload);
  return Array.isArray(root?.data) ? root.data : [];
};

const topLevelArray = (payload: unknown): unknown[] =>
  Array.isArray(payload) ? payload : [];

const pickRelationshipId = (row: unknown, key: string) => {
  const resource = asRecord(row);
  const relationships = asRecord(resource?.relationships);
  const relationship = asRecord(relationships?.[key]);
  const data = asRecord(relationship?.data);
  return pickFirstString(data, ["id"]);
};

// タスクの割当
const normalizeAssignMode = (value?: string): GroupItem["assignMode"] => {
  const normalized = normalizeText(value);
  return normalized === "manual" ||
    normalized === "random" ||
    normalized === "balanced"
    ? normalized
    : "";
};

// 負担バランス設定
const normalizeBalanceType = (value?: string): GroupItem["balanceType"] => {
  const normalized = normalizeText(value);
  return normalized === "more" || normalized === "less" ? normalized : "";
};

// グループ一覧の取得
const normalizeGroups = (payload: unknown): GroupItem[] =>
  dataArray(payload).flatMap((row) => {
    const resource = asRecord(row);
    const group = unwrapEntity(resource);
    const name = pickFirstString(group, ["name"]);
    return name
      ? [
          {
            id:
              pickFirstString(resource, ["id"]) ??
              pickFirstString(group, ["id"]),
            name,
            shareKey: pickFirstString(group, ["share_key"]),
            assignMode: normalizeAssignMode(
              pickFirstString(group, ["assign_mode"]),
            ),
            balanceType: normalizeBalanceType(
              pickFirstString(group, ["balance_type"]),
            ),
          },
        ]
      : [];
  });

// メンバーシップ一覧の取得
const normalizeMemberships = (payload: unknown): MembershipItem[] =>
  dataArray(payload).map((row) => {
    const resource = asRecord(row);
    const membership = unwrapEntity(resource);
    return {
      id: pickFirstString(resource, ["id"]),
      groupId: pickFirstString(membership, ["group_id"]),
      member: {
        id:
          pickRelationshipId(row, "user") ??
          pickFirstString(membership, ["user_id"]),
        name: pickFirstString(membership, ["user_name"]),
      },
    };
  });

// タスク一覧の取得
const normalizeTask = (row: unknown, index: number): TaskItem => {
  const resource = asRecord(row);
  const task = unwrapEntity(resource);
  return {
    id: pickFirstString(resource, ["id"]),
    name: pickFirstString(task, ["name"]) ?? `タスク ${index + 1}`,
    point: pickFirstString(task, ["point"]),
    description: pickFirstString(task, ["description"]),
    createdAt: pickFirstString(task, ["scheduled_for"]),
    sourceIndex: index,
  };
};

// 周期タスクの取得
const normalizeRecurringTask = (
  row: unknown,
  index: number,
): RecurringTaskItem => {
  const root = asRecord(row);
  const scheduleTypeRaw = normalizeText(
    pickFirstString(root, ["schedule_type"]),
  );
  const activeRaw = root?.active;
  return {
    id: pickFirstString(root, ["id"]),
    name: pickFirstString(root, ["name"]) ?? `周期タスク ${index + 1}`,
    description: pickFirstString(root, ["description"]),
    point: pickFirstString(root, ["point"]),
    scheduleType:
      scheduleTypeRaw === "weekly" || scheduleTypeRaw === "biweekly"
        ? scheduleTypeRaw
        : "",
    dayOfWeek: pickFirstString(root, ["day_of_week"]),
    startsOn: pickFirstString(root, ["starts_on"]),
    active:
      activeRaw == null ||
      activeRaw === true ||
      activeRaw === "true" ||
      activeRaw === "1",
    sourceIndex: index,
  };
};

// 日付取得
const dateFromYmd = (value?: string) => {
  if (!value) return undefined;
  const ymd = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return undefined;
  const date = new Date(`${ymd}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? date : undefined;
};

// 周期タスクの曜日を数値にする
const parseRecurringDayOfWeek = (value?: string) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 && numeric <= 6
    ? numeric
    : undefined;
};

// 周期タスクが指定日に実行対象か判定
const recurringTaskRunsOnDate = (task: RecurringTaskItem, ymd: string) => {
  if (!task.active || !task.startsOn) return false;
  const targetDate = dateFromYmd(ymd);
  const startDate = dateFromYmd(task.startsOn);
  if (!targetDate || !startDate) return false;

  const diffDays = Math.floor(
    (targetDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays < 0) return false;
  if (diffDays === 0) return true;
  if (task.scheduleType === "biweekly") return diffDays % 14 === 0;

  const day = parseRecurringDayOfWeek(task.dayOfWeek);
  return task.scheduleType === "weekly"
    ? day == null
      ? diffDays % 7 === 0
      : targetDate.getUTCDay() === day
    : false;
};

// 周期タスクを通常タスク表示用に変換
const recurringTaskToTask = (
  task: RecurringTaskItem,
  sourceIndex: number,
): TaskItem => {
  const stableId = task.id ?? `${task.name}:${task.sourceIndex}`;
  return {
    id: `recurring:${stableId}`,
    name: task.name,
    point: task.point,
    description: task.description,
    createdAt: task.startsOn,
    isRecurring: true,
    sourceIndex,
  };
};

// アサインメントの正規化
const normalizeAssignment = (
  row: unknown,
  membershipById: Map<string, MembershipItem>,
): AssignmentItem => {
  const resource = asRecord(row);
  const assignment = unwrapEntity(resource);
  const membershipId =
    pickRelationshipId(row, "membership") ??
    pickFirstString(assignment, ["membership_id"]);
  const membership = membershipId
    ? membershipById.get(membershipId)
    : undefined;
  return {
    id: pickFirstString(resource, ["id"]),
    taskId:
      pickRelationshipId(row, "task") ??
      pickFirstString(assignment, ["task_id"]),
    status: pickFirstString(assignment, ["status"]),
    assigneeId:
      membership?.member.id ?? pickFirstString(assignment, ["assigned_to_id"]),
    assigneeName:
      membership?.member.name ??
      pickFirstString(assignment, ["assigned_to_name"]),
    targetDate: pickFirstString(assignment, ["due_date"]),
  };
};

// 同じ日付か判定
const isSameDay = (isoLike?: string, ymd?: string) =>
  Boolean(isoLike && ymd && isoLike.slice(0, 10) === ymd);

// タスクを割当判定用に並べる
const sortTasksForAssignment = (tasks: TaskItem[]) =>
  [...tasks].sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : Number.NaN;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : Number.NaN;
    return Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime
      ? aTime - bTime
      : a.sourceIndex - b.sourceIndex;
  });

// タスクに紐づく最新のアサインメントを選ぶ
const selectLatestAssignmentForTask = (
  task: TaskItem,
  assignments: AssignmentItem[],
  membersForAssign: MemberItem[],
  todayKey: string,
) => {
  const taskIdNormalized = normalizeText(task.id);
  if (!taskIdNormalized) return undefined;

  const candidates = assignments
    .filter(
      (assignment) => normalizeText(assignment.taskId) === taskIdNormalized,
    )
    .map((assignment) => ({
      assignment,
      assigneeIndex: membersForAssign.findIndex((member) =>
        isSameMember(member, {
          id: assignment.assigneeId,
          name: assignment.assigneeName,
        }),
      ),
    }))
    .filter((row) => row.assigneeIndex >= 0);

  return candidates.sort((a, b) => {
    const aToday = isSameDay(a.assignment.targetDate, todayKey) ? 1 : 0;
    const bToday = isSameDay(b.assignment.targetDate, todayKey) ? 1 : 0;
    return bToday - aToday;
  })[0];
};

// メンバーの並び
const sortMembersStable = (members: MemberItem[]) =>
  [...members].sort((a, b) =>
    `${normalizeText(a.id)}|${normalizeText(a.email)}|${normalizeText(a.name)}`.localeCompare(
      `${normalizeText(b.id)}|${normalizeText(b.email)}|${normalizeText(b.name)}`,
      "ja",
    ),
  );

// ランダム割当用のハッシュ値を作成
const hashString = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

// 配列をシャッフルする
const shuffleWithSeed = <T,>(items: T[], seedKey: string): T[] => {
  const next = [...items];
  let x = hashString(seedKey) || 1;
  for (let i = next.length - 1; i > 0; i -= 1) {
    x = (Math.imul(1664525, x) + 1013904223) >>> 0;
    const j = Math.floor((x / 4294967296) * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

// アサインメントがない時の担当者を決める
const fallbackAssigneeIndexForTask = (
  task: TaskItem,
  memberCount: number,
  mode: GroupItem["assignMode"],
  groupKey: string,
  todayKey: string,
) => {
  if (memberCount <= 0) return 0;
  const taskKey = task.id ?? `${task.name}:${task.sourceIndex}`;
  const seedKey =
    mode === "random"
      ? `${todayKey}:${groupKey}:${taskKey}`
      : `${groupKey}:${taskKey}`;
  return hashString(seedKey) % memberCount;
};

// 同じメンバーか判定
const isSameMember = (a: MemberItem, b: MemberItem) => {
  const pairs = [
    [normalizeText(a.id), normalizeText(b.id)],
    [normalizeText(a.email), normalizeText(b.email)],
    [normalizeText(a.name), normalizeText(b.name)],
  ];
  return pairs.some(([left, right]) => left && right && left === right);
};

// メンバーの重複を除く
const uniqueMembers = (members: MemberItem[]) =>
  members.reduce<MemberItem[]>(
    (result, member) =>
      result.some((existing) => isSameMember(existing, member))
        ? result
        : [...result, member],
    [],
  );

// メンバーシップが対象グループに属しているか判定
const membershipBelongsToGroup = (
  membership: MembershipItem,
  group: GroupItem,
) => {
  const membershipGroupId = normalizeText(membership.groupId);
  const groupId = normalizeText(group.id);
  return Boolean(membershipGroupId && groupId && membershipGroupId === groupId);
};

// ログイン中ユーザー情報を取り出す
const extractCurrentUserIdentity = (payload: unknown): MemberItem => {
  const root = asRecord(payload);
  const resource = asRecord(root?.data);
  const user = unwrapEntity(resource);
  return {
    id: pickFirstString(resource, ["id"]),
    name: pickFirstString(user, ["name"]),
    email: pickFirstString(user, ["email"]),
  };
};

// 割当モードの表示ラベル
const assignmentModeLabel = (mode: GroupItem["assignMode"]) =>
  mode === "manual"
    ? "手動で決める"
    : mode === "balanced"
      ? "バランスを考慮する"
      : "ランダムで決める";

// 負担バランスの表示ラベル
const balanceTypeLabel = (value: GroupItem["balanceType"]) =>
  value === "more" ? "多め" : value === "less" ? "少なめ" : "未設定";

// 完了済みステータスか判定
const isCompletedStatus = (value?: string) =>
  normalizeText(value) === "completed";

export default async function RecordsPage() {
  const session = await auth();
  if (!session) redirect("/auth/signin");

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

  const [groupsPayload, membershipsPayload, mePayload] = await Promise.all([
    fetchOkJson(`${v1Base}/groups`),
    fetchOkJson(`${v1Base}/memberships`),
    fetchOkJson(`${v1Base}/users/me`),
  ]);

  const groups = normalizeGroups(groupsPayload);
  if (groups.length === 0) {
    return (
      <div className="prose max-w-none p-4 sm:p-6">
        <div className="not-prose mb-2 flex items-center justify-between gap-3 border-b-2 border-current pb-1">
          <h1 className="text-2xl font-extrabold">担当のタスク</h1>
        </div>
        <div className="not-prose mt-8 space-y-4">
          <p className="text-slate-600 dark:text-slate-300">
            参加中のグループがありません。
          </p>
          <p className="text-slate-600 dark:text-slate-300">
            グループに参加することで担当タスクを確認できます。
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

  const memberships = normalizeMemberships(membershipsPayload);
  const membershipById = new Map<string, MembershipItem>();
  for (const membership of memberships) {
    if (membership.id) membershipById.set(membership.id, membership);
  }

  const currentUserFromApi = extractCurrentUserIdentity(mePayload);
  const currentUser: MemberItem = {
    id:
      currentUserFromApi.id ??
      (session.user as { id?: string } | undefined)?.id ??
      (session.user as { userId?: string } | undefined)?.userId,
    name: currentUserFromApi.name ?? session.user?.name ?? undefined,
    email: currentUserFromApi.email ?? session.user?.email ?? undefined,
  };
  const todayKey = new Intl.DateTimeFormat("sv-SE", {
    timeZone: APP_TIME_ZONE,
  }).format(new Date());

  const groupsWithAssignments = await Promise.all(
    groups.map(async (group) => {
      const membersInGroup = uniqueMembers(
        memberships
          .filter((membership) => membershipBelongsToGroup(membership, group))
          .map((membership) => membership.member),
      );
      const members = uniqueMembers(
        membersInGroup.length > 0
          ? [...membersInGroup, currentUser]
          : [currentUser],
      );

      if (!group.id) return { group, assignedTasks: [] as TaskItem[] };

      const groupId = encodeURIComponent(group.id);
      const [tasksPayload, assignmentsPayload, recurringPayload] =
        await Promise.all([
          fetchOkJson(`${v1Base}/groups/${groupId}/tasks`),
          fetchOkJson(`${v1Base}/groups/${groupId}/assignments`),
          fetchOkJson(`${v1Base}/groups/${groupId}/recurring_tasks`),
        ]);

      const assignments = dataArray(assignmentsPayload).map((assignment) =>
        normalizeAssignment(assignment, membershipById),
      );
      const normalTasks = dataArray(tasksPayload).map(normalizeTask);
      const recurringTasks = topLevelArray(recurringPayload)
        .map(normalizeRecurringTask)
        .filter((task) => recurringTaskRunsOnDate(task, todayKey))
        .map((task, index) =>
          recurringTaskToTask(task, normalTasks.length + index),
        );
      const tasks = sortTasksForAssignment([...normalTasks, ...recurringTasks]);
      if (tasks.length === 0) return { group, assignedTasks: [] as TaskItem[] };

      const sortedMembers = sortMembersStable(members);
      const membersForAssign =
        group.assignMode === "random"
          ? shuffleWithSeed(sortedMembers, `${todayKey}:members:${group.id}`)
          : sortedMembers;
      const tasksForAssign =
        group.assignMode === "random"
          ? shuffleWithSeed(tasks, `${todayKey}:tasks:${group.id}`)
          : tasks;
      const currentUserIndex = membersForAssign.findIndex((member) =>
        isSameMember(member, currentUser),
      );
      if (currentUserIndex < 0) {
        return { group, assignedTasks: [] as TaskItem[] };
      }

      const assignedTasks = tasksForAssign.flatMap((task, index) => {
        const selected = selectLatestAssignmentForTask(
          task,
          assignments,
          membersForAssign,
          todayKey,
        );
        const finalAssigneeIndex =
          selected?.assigneeIndex ??
          fallbackAssigneeIndexForTask(
            task,
            membersForAssign.length,
            group.assignMode,
            group.id ?? group.name,
            todayKey,
          );

        if (finalAssigneeIndex !== currentUserIndex) return [];
        return [
          {
            ...task,
            assignmentId: selected?.assignment.id ?? task.assignmentId,
            assignmentStatus:
              selected?.assignment.status ?? task.assignmentStatus,
          },
        ];
      });

      return { group, assignedTasks };
    }),
  );

  const totalAssigned = groupsWithAssignments.reduce(
    (sum, row) =>
      sum +
      row.assignedTasks.filter(
        (task) => !isCompletedStatus(task.assignmentStatus),
      ).length,
    0,
  );

  return (
    <div className="prose max-w-none p-4 sm:p-6">
      <div className="not-prose mb-2 flex items-center justify-between gap-3 border-b-2 border-current pb-1">
        <h1 className="text-2xl font-extrabold">担当のタスク</h1>
      </div>

      <p className="mt-6 text-sm text-slate-600 dark:text-slate-300">
        今日のあなたの担当は {totalAssigned} 件です。
      </p>

      <div className="not-prose mt-8 space-y-6">
        {groupsWithAssignments.map(({ group, assignedTasks }) => (
          <section
            key={group.id ?? group.name}
            className="rounded-lg border bg-card p-4 sm:p-5"
          >
            <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <h2 className="text-lg font-bold">{group.name}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                  {assignmentModeLabel(group.assignMode)}
                </span>
                {group.assignMode === "balanced" ? (
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-200">
                    {balanceTypeLabel(group.balanceType)}
                  </span>
                ) : null}
              </div>
            </div>

            {assignedTasks.length === 0 ? (
              <p className="text-sm text-slate-500">本日の担当はありません。</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="min-w-[720px] w-full border-collapse text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                    <tr>
                      <th className="px-3 py-2 font-semibold">家事の名前</th>
                      <th className="px-3 py-2 font-semibold">負担ポイント</th>
                      <th className="px-3 py-2 font-semibold">備考</th>
                      <th className="px-3 py-2 font-semibold">進捗状況</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignedTasks.map((task, index) => (
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
                        <td className="px-3 py-2">
                          {task.isRecurring ? (
                            <AssignmentStatusButton
                              taskId={task.id}
                              groupId={group.id}
                              currentStatus={task.assignmentStatus}
                              showDeleteWhenCompleted
                              localOnly
                            />
                          ) : (
                            <AssignmentStatusButton
                              assignmentId={task.assignmentId}
                              taskId={task.id}
                              groupId={group.id}
                              currentStatus={task.assignmentStatus}
                              showDeleteWhenCompleted
                              localOnly={!task.assignmentId}
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
