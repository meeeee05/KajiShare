import { redirect } from "next/navigation";
import { auth } from "@/auth";
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
type MemberItem = {
  id?: string;
  name?: string;
};
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
  scheduledFor?: string;
  sourceIndex: number;
};
type AssignmentItem = {
  id?: string;
  taskId?: string;
  membershipId?: string;
  status?: string;
  dueDate?: string;
  completedDate?: string;
};
type TaskStatusCounts = {
  notStarted: number;
  inProgress: number;
  completed: number;
};
type MyTaskStatus = "未アサイン" | "着手前" | "進行中" | "完了";
type TaskCardItem = {
  group: GroupItem;
  task: TaskItem;
  summary: TaskStatusCounts;
  myStatus: MyTaskStatus;
  myAssignment?: AssignmentItem;
};
type EvaluatedTaskItem = {
  group: GroupItem;
  task: TaskItem;
  evaluationId?: string;
  score?: string;
  feedback?: string;
};

const RECENT_ASSIGNED_TASK_LIMIT = 5;
const RECENT_EVALUATED_TASK_LIMIT = 6;

const normalizeText = (value?: string) => (value ?? "").trim().toLowerCase();

// nullでないか
const asRecord = (value: unknown): AnyRecord | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as AnyRecord;
};

// 文字列へ変換
const pickString = (
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
const attributesOf = (value: unknown) => {
  const row = asRecord(value);
  return asRecord(row?.attributes) ?? row;
};

// APIのrelationshipIDを取り出す
const relationshipId = (value: unknown, key: string) => {
  const row = asRecord(value);
  const relationships = asRecord(row?.relationships);
  const relationship = asRecord(relationships?.[key]);
  return pickString(asRecord(relationship?.data), ["id"]);
};

// data配列を取り出す
const dataArray = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }
  const root = asRecord(payload);
  return Array.isArray(root?.data) ? root.data : [];
};

// 日時比較用の数値へ変換
const toTimestamp = (value?: string) => {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

// ID比較用の数値へ変換
const toNumericId = (value?: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

// グループ一覧の正規化
const normalizeGroups = (payload: unknown): GroupItem[] =>
  dataArray(payload)
    .map((row): GroupItem | null => {
      const group = attributesOf(row);
      const name = pickString(group, ["name"]);
      if (!name) {
        return null;
      }
      return {
        id: pickString(group, ["id"]),
        name,
      };
    })
    .filter((group): group is GroupItem => Boolean(group));

// メンバーシップ一覧の正規化
const normalizeMemberships = (payload: unknown): MembershipItem[] =>
  dataArray(payload).map((row) => {
    const membership = attributesOf(row);
    return {
      id: pickString(asRecord(row), ["id"]),
      groupId:
        pickString(membership, ["group_id"]) ?? relationshipId(row, "group"),
      member: {
        id: relationshipId(row, "user") ?? pickString(membership, ["user_id"]),
        name: pickString(membership, ["user_name"]),
      },
    };
  });

// タスク一覧の正規化
const normalizeTask = (row: unknown, index: number): TaskItem => {
  const task = attributesOf(row);
  return {
    id: pickString(asRecord(row), ["id"]),
    name: pickString(task, ["name"]) ?? `タスク ${index + 1}`,
    point: pickString(task, ["point"]),
    description: pickString(task, ["description"]),
    scheduledFor: pickString(task, ["scheduled_for"]),
    sourceIndex: index,
  };
};

// アサインメントの正規化
const normalizeAssignment = (row: unknown): AssignmentItem => {
  const assignment = attributesOf(row);
  return {
    id: pickString(asRecord(row), ["id"]),
    taskId: relationshipId(row, "task") ?? pickString(assignment, ["task_id"]),
    membershipId:
      relationshipId(row, "membership") ??
      pickString(assignment, ["membership_id"]),
    status: pickString(assignment, ["status"]),
    dueDate: pickString(assignment, ["due_date"]),
    completedDate: pickString(assignment, ["completed_date"]),
  };
};

// ログインユーザー情報の正規化
const currentUserFromPayload = (payload: unknown): MemberItem => {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const user = attributesOf(data ?? root);
  return {
    id: pickString(data, ["id"]) ?? pickString(user, ["id"]),
    name: pickString(user, ["name"]),
  };
};

// アサインメントの表示ステータスを決める
const statusOf = (assignment?: AssignmentItem): MyTaskStatus => {
  if (!assignment) {
    return "未アサイン";
  }
  if (assignment.status === "completed" || assignment.completedDate) {
    return "完了";
  }
  if (assignment.status === "in_progress") {
    return "進行中";
  }
  return "着手前";
};

// タスクごとの進捗数を集計
const summarizeAssignments = (
  assignments: AssignmentItem[],
): TaskStatusCounts => {
  return assignments.reduce(
    (sum, assignment) => {
      const status = statusOf(assignment);
      if (status === "完了") {
        return { ...sum, completed: sum.completed + 1 };
      }
      if (status === "進行中") {
        return { ...sum, inProgress: sum.inProgress + 1 };
      }
      return { ...sum, notStarted: sum.notStarted + 1 };
    },
    { notStarted: 0, inProgress: 0, completed: 0 },
  );
};

// 表示用に最新のアサインメントを選ぶ
const latestAssignment = (assignments: AssignmentItem[]) => {
  return [...assignments].sort((a, b) => {
    const bTime = Math.max(toTimestamp(b.dueDate), toTimestamp(b.completedDate));
    const aTime = Math.max(toTimestamp(a.dueDate), toTimestamp(a.completedDate));
    return bTime - aTime;
  })[0];
};

// 評価一覧の正規化
const normalizeEvaluation = (row: unknown) => {
  const evaluation = attributesOf(row);
  return {
    id: pickString(asRecord(row), ["id"]),
    assignmentId: relationshipId(row, "assignment"),
    taskId: pickString(evaluation, ["task_id"]),
    taskName: pickString(evaluation, ["assignment_task_name"]),
    status: pickString(evaluation, ["assignment_status"]),
    evaluatedUserId: pickString(evaluation, ["evaluated_user_id"]),
    evaluatorId: pickString(evaluation, ["evaluator_id"]),
    score: pickString(evaluation, ["score"]),
    feedback: pickString(evaluation, ["feedback"]),
    createdAt: pickString(evaluation, ["created_at"]),
  };
};

export default async function Home() {
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

  // 認証確認
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

  // ダッシュボードに必要な基本データを取得
  const sessionUserId =
    (session.user as { id?: string } | undefined)?.id ??
    (session.user as { userId?: string } | undefined)?.userId;

  const [groupsPayload, membershipsPayload, mePayload, evaluationsPayload] =
    await Promise.all([
      fetchOkJson(`${v1Base}/groups`),
      fetchOkJson(`${v1Base}/memberships`),
      fetchOkJson(`${v1Base}/users/me`),
      fetchOkJson(`${v1Base}/evaluations`),
    ]);

  const groups = normalizeGroups(groupsPayload);
  const memberships = normalizeMemberships(membershipsPayload);
  const apiUser = currentUserFromPayload(mePayload);

  // 表示中ユーザーを特定
  const currentUser: MemberItem = {
    id: apiUser.id ?? sessionUserId,
    name: apiUser.name ?? session.user?.name ?? undefined,
  };
  const currentUserId = normalizeText(currentUser.id);

  const membershipsByGroupId = new Map<string, MembershipItem[]>();
  const myMembershipIdByGroupId = new Map<string, string>();
  const memberByMembershipId = new Map<string, MemberItem>();

  // グループ別にメンバーシップを整理
  for (const membership of memberships) {
    const groupId = normalizeText(membership.groupId);
    const membershipId = normalizeText(membership.id);
    const userId = normalizeText(membership.member.id);

    if (groupId) {
      membershipsByGroupId.set(groupId, [
        ...(membershipsByGroupId.get(groupId) ?? []),
        membership,
      ]);
    }
    if (membershipId) {
      memberByMembershipId.set(membershipId, membership.member);
    }
    if (groupId && membershipId && userId === currentUserId) {
      myMembershipIdByGroupId.set(groupId, membershipId);
    }
  }

  // グループごとのタスクと担当情報を取得
  const groupResults = await Promise.all(
    groups.map(async (group) => {
      if (!group.id) {
        return {
          taskCards: [] as TaskCardItem[],
          taskContexts: [] as { group: GroupItem; task: TaskItem }[],
        };
      }

      const groupId = encodeURIComponent(group.id);
      const [tasksPayload, assignmentsPayload] = await Promise.all([
        fetchOkJson(`${v1Base}/groups/${groupId}/tasks`),
        fetchOkJson(`${v1Base}/groups/${groupId}/assignments`),
      ]);

      const tasks = dataArray(tasksPayload).map(normalizeTask);
      const taskById = new Map(
        tasks
          .filter((task) => task.id)
          .map((task) => [normalizeText(task.id), task]),
      );
      const assignments = dataArray(assignmentsPayload).map(normalizeAssignment);
      const assignmentsByTaskId = new Map<string, AssignmentItem[]>();

      // タスクIDごとにアサインメントをまとめる
      for (const assignment of assignments) {
        const taskId = normalizeText(assignment.taskId);
        if (!taskId) {
          continue;
        }
        assignmentsByTaskId.set(taskId, [
          ...(assignmentsByTaskId.get(taskId) ?? []),
          assignment,
        ]);
      }

      const myMembershipId = myMembershipIdByGroupId.get(normalizeText(group.id));

      // 表示用
      const taskCards = tasks.map((task) => {
        const taskAssignments =
          assignmentsByTaskId.get(normalizeText(task.id)) ?? [];
        const myAssignment = latestAssignment(
          taskAssignments.filter(
            (assignment) =>
              normalizeText(assignment.membershipId) === myMembershipId,
          ),
        );
        return {
          group,
          task,
          summary: summarizeAssignments(taskAssignments),
          myAssignment,
          myStatus: statusOf(myAssignment),
        };
      });

      return {
        taskCards,
        taskContexts: tasks.map((task) => ({ group, task })),
      };
    }),
  );

  const taskCards = groupResults.flatMap((group) => group.taskCards);
  const myTaskCards = taskCards.filter((card) => card.myAssignment);
  const totalAssigned = myTaskCards.length;

  // 自分の担当タスクの進捗を集計
  const completedMine = myTaskCards.filter(
    ({ myStatus }) => myStatus === "完了",
  ).length;
  const inProgressMine = myTaskCards.filter(
    ({ myStatus }) => myStatus === "進行中",
  ).length;
  const todoMine = Math.max(totalAssigned - completedMine - inProgressMine, 0);
  const totalMine = completedMine + inProgressMine + todoMine;
  const completionRate =
    totalMine > 0 ? Math.round((completedMine / totalMine) * 100) : 0;

  // 最近自分に割り当てられたタスクを取り出す
  const recentAssignedTasks = [...myTaskCards]
    .sort((a, b) => {
      const bTime = Math.max(
        toTimestamp(b.myAssignment?.dueDate),
        toTimestamp(b.myAssignment?.completedDate),
        toTimestamp(b.task.scheduledFor),
      );
      const aTime = Math.max(
        toTimestamp(a.myAssignment?.dueDate),
        toTimestamp(a.myAssignment?.completedDate),
        toTimestamp(a.task.scheduledFor),
      );
      return bTime - aTime;
    })
    .slice(0, RECENT_ASSIGNED_TASK_LIMIT);

  const taskContextByTaskId = new Map(
    groupResults
      .flatMap((group) => group.taskContexts)
      .filter(({ task }) => task.id)
      .map(({ group, task }) => [normalizeText(task.id), { group, task }]),
  );

  // 自分が評価されたタスクを最新順に取り出す
  const evaluatedMyExecutedTasks: EvaluatedTaskItem[] = dataArray(
    evaluationsPayload,
  )
    .map(normalizeEvaluation)
    .filter((evaluation) => {
      return (
        normalizeText(evaluation.evaluatedUserId) === currentUserId &&
        normalizeText(evaluation.evaluatorId) !== currentUserId &&
        evaluation.status === "completed" &&
        Boolean(evaluation.taskId)
      );
    })
    .sort((a, b) => {
      const byTime = toTimestamp(b.createdAt) - toTimestamp(a.createdAt);
      if (byTime !== 0) {
        return byTime;
      }
      return toNumericId(b.id) - toNumericId(a.id);
    })
    .slice(0, RECENT_EVALUATED_TASK_LIMIT)
    .map((evaluation) => {
      const context = taskContextByTaskId.get(normalizeText(evaluation.taskId));
      return {
        group: context?.group ?? { name: "グループ" },
        task: context?.task ?? {
          id: evaluation.taskId,
          name: evaluation.taskName ?? "タスク",
          sourceIndex: -1,
        },
        evaluationId: evaluation.id,
        score: evaluation.score,
        feedback: evaluation.feedback,
      };
    });

  // グループとメンバーを表示用にまとめる
  const recentGroups = groups.slice(0, 5).map((group) => ({
    group,
    members: membershipsByGroupId.get(normalizeText(group.id)) ?? [],
  }));

  return (
    <div className="space-y-6 p-4 sm:space-y-8 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">KajiShare</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            こんにちは、{currentUser.name ?? "メンバー"} さん
          </p>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-slate-500">自分の担当タスク</p>
          <p className="mt-2 text-3xl font-bold">{totalAssigned}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-slate-500">完了</p>
          <p className="mt-2 text-3xl font-bold text-emerald-600">
            {completedMine}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-slate-500">進行中</p>
          <p className="mt-2 text-3xl font-bold text-blue-600">
            {inProgressMine}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-slate-500">着手前</p>
          <p className="mt-2 text-3xl font-bold text-amber-600">{todoMine}</p>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">自分に振られたタスク進捗</h2>
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            {completionRate}%
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${completionRate}%` }}
          />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            { label: "完了", value: completedMine, color: "bg-emerald-500" },
            { label: "進行中", value: inProgressMine, color: "bg-blue-500" },
            { label: "着手前", value: todoMine, color: "bg-amber-500" },
          ].map((item) => {
            const ratio =
              totalMine > 0 ? Math.round((item.value / totalMine) * 100) : 0;
            return (
              <div key={item.label} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span>{item.label}</span>
                  <span className="font-semibold">{item.value}件</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={`h-full ${item.color}`}
                    style={{ width: `${ratio}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-4 sm:p-5">
          <h2 className="mb-4 text-lg font-bold">
            最近登録したグループとメンバー
          </h2>
          {recentGroups.length === 0 ? (
            <p className="text-sm text-slate-500">
              表示できるグループがありません。
            </p>
          ) : (
            <div className="space-y-4">
              {recentGroups.map(({ group, members }) => (
                <div
                  key={group.id ?? group.name}
                  className="rounded-lg border p-3"
                >
                  <p className="font-semibold">{group.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    メンバー {members.length} 人
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {members.length === 0 ? (
                      <span className="text-xs text-slate-500">
                        メンバー情報なし
                      </span>
                    ) : (
                      members.slice(0, 8).map((membership, index) => (
                        <span
                          key={`${group.id ?? group.name}-${membership.id ?? index}`}
                          className="rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800"
                        >
                          {membership.member.name ??
                            membership.member.id ??
                            "member"}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card p-4 sm:p-5">
          <h2 className="mb-4 text-lg font-bold">
            最近自分に割り当てられたタスク
          </h2>
          {recentAssignedTasks.length === 0 ? (
            <p className="text-sm text-slate-500">担当タスクはありません。</p>
          ) : (
            <div className="space-y-3">
              {recentAssignedTasks.map(
                ({ group, task, myStatus, myAssignment }, index) => (
                  <div
                    key={
                      myAssignment?.id ??
                      `${group.id ?? group.name}-${task.id ?? index}`
                    }
                    className="rounded-lg border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{task.name}</p>
                      <span className="text-xs text-slate-500">
                        {group.name}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      自分の進行: {myStatus}
                    </p>
                  </div>
                ),
              )}
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card p-5 lg:col-span-2">
          <h2 className="mb-4 text-lg font-bold">評価されたタスク</h2>
          {evaluatedMyExecutedTasks.length === 0 ? (
            <p className="text-sm text-slate-500">
              他メンバーからの評価はまだありません
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {evaluatedMyExecutedTasks.map(
                ({ group, evaluationId, score, feedback, task }, index) => (
                  <div
                    key={evaluationId ?? `${task.id ?? "task"}-${index}`}
                    className="rounded-lg border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{task.name}</p>
                      <span className="text-xs text-slate-500">
                        {group.name}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      評価: {score ?? "-"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {feedback ?? "コメントなし"}
                    </p>
                  </div>
                ),
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
