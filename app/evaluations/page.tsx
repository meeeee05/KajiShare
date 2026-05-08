import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AssignmentEvaluationForm from "@/components/assignment-evaluation-form";
import {
  GUEST_EXPIRED_REDIRECT_PATH,
  isGuestSessionExpiredStatus,
  isGuestSessionUser,
} from "@/lib/guest-session";

// 型定義
type AnyRecord = Record<string, unknown>;
type GroupItem = { id?: string; name: string };
type MemberItem = { id?: string; name?: string; email?: string };
type MembershipItem = { id?: string; groupId?: string; member: MemberItem };
type TaskItem = {
  id?: string;
  name: string;
  point?: string;
  description?: string;
};
type AssignmentItem = {
  id?: string;
  groupId?: string;
  taskId?: string;
  membershipId?: string;
  status?: string;
  completedDate?: string;
  assigneeId?: string;
};
type EvaluationItem = {
  assignmentId?: string;
  evaluatorId?: string;
};
type GroupRow = { assignment: AssignmentItem; task: TaskItem };

// 文字列を正規化
const normalizeText = (value?: string) => (value ?? "").trim().toLowerCase();

// 利用可否判定
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

//　Jsonから必要な情報を抽出
const pickResourceId = (value: unknown) => {
  return pickFirstString(asRecord(value), ["id"]);
};

const pickAttribute = (value: unknown, keys: string[]) => {
  const entity = asRecord(value);
  const attributes = asRecord(entity?.attributes);
  return pickFirstString(attributes, keys);
};

const pickTopLevelString = (value: unknown, keys: string[]) => {
  return pickFirstString(asRecord(value), keys);
};

const pickRelationshipId = (value: unknown, key: string) => {
  const entity = asRecord(value);
  const relationships = asRecord(entity?.relationships);
  const relationship = asRecord(relationships?.[key]);
  const data = asRecord(relationship?.data);
  return pickFirstString(data, ["id"]);
};

const toTopLevelArray = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  return [];
};

const toJsonApiDataArray = (payload: unknown): unknown[] => {
  const root = asRecord(payload);
  if (!root) {
    return [];
  }
  return Array.isArray(root.data) ? root.data : [];
};

const normalizeGroup = (row: unknown): GroupItem => ({
  id: pickTopLevelString(row, ["id"]),
  name: pickTopLevelString(row, ["name"]) ?? "",
});

const normalizeMembership = (row: unknown): MembershipItem => ({
  id: pickResourceId(row),
  groupId: pickAttribute(row, ["group_id"]),
  member: {
    id: pickRelationshipId(row, "user"),
    name: undefined,
    email: undefined,
  },
});

// 評価登録
const normalizeTask = (row: unknown, index: number): TaskItem => ({
  id: pickResourceId(row),
  name: pickAttribute(row, ["name"]) ?? `タスク ${index + 1}`,
  point: pickAttribute(row, ["point"]),
  description: pickAttribute(row, ["description"]),
});

const normalizeAssignment = (row: unknown): AssignmentItem => ({
  id: pickResourceId(row),
  groupId: pickAttribute(row, ["group_id"]),
  taskId: pickRelationshipId(row, "task"),
  membershipId: pickRelationshipId(row, "membership"),
  status: pickAttribute(row, ["status"]),
  completedDate: pickAttribute(row, ["completed_date"]),
  assigneeId: pickAttribute(row, ["assigned_to_id"]),
});

const normalizeEvaluation = (row: unknown): EvaluationItem => ({
  assignmentId: pickRelationshipId(row, "assignment"),
  evaluatorId: pickRelationshipId(row, "evaluator"),
});

const extractCurrentUserIdentity = (payload: unknown): MemberItem => {
  const root = asRecord(payload);
  const row = asRecord(root?.data) ?? root;
  return {
    id: pickResourceId(row),
    name: pickAttribute(row, ["name"]),
    email: pickAttribute(row, ["email"]),
  };
};

// メンバーが同じでないか判定
const isSameMember = (a: MemberItem, b: MemberItem) => {
  const aId = normalizeText(a.id);
  const bId = normalizeText(b.id);
  if (aId && bId) {
    return aId === bId;
  }
  const aEmail = normalizeText(a.email);
  const bEmail = normalizeText(b.email);
  if (aEmail && bEmail) {
    return aEmail === bEmail;
  }
  const aName = normalizeText(a.name);
  const bName = normalizeText(b.name);
  return Boolean(aName && bName && aName === bName);
};

// タスク完了とみなすステータスか判定
const isCompletedStatus = (value?: string) => {
  const normalized = normalizeText(value);
  return normalized === "completed";
};

const isCompletedAssignment = (assignment: AssignmentItem) => {
  if (isCompletedStatus(assignment.status)) {
    return true;
  }
  return Boolean((assignment.completedDate ?? "").trim());
};

const hasMemberIdentity = (member: MemberItem) => {
  return Boolean(member.id || member.email || member.name);
};

//　配列をシャッフル(評価対象はランダムに表示)
const shuffleArray = <T,>(items: T[]): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

// グループに所属しているか判定
const membershipBelongsToGroup = (
  membership: MembershipItem,
  group: GroupItem,
) => {
  const membershipGroupId = normalizeText(membership.groupId);
  const groupId = normalizeText(group.id);
  return Boolean(membershipGroupId && groupId && membershipGroupId === groupId);
};

// APIリクエスト前のゲストセッション期限切れチェック
export default async function EvaluationsPage() {
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

  // APIリクエスト（認証情報付き）
  const fetchOkJson = async (url: string): Promise<unknown | null> => {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` },
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

  // グループ、権限、評価、ユーザ情報の取得
  const [groupsPayload, membershipsPayload, evaluationsPayload, mePayload] =
    await Promise.all([
      fetchOkJson(`${v1Base}/groups`),
      fetchOkJson(`${v1Base}/memberships`),
      fetchOkJson(`${v1Base}/evaluations`),
      fetchOkJson(`${v1Base}/users/me`),
    ]);

  const groups = Array.from(
    new Map(
      toTopLevelArray(groupsPayload)
        .map((row) => normalizeGroup(row))
        .filter((group) => group.name.trim().length > 0)
        .map((group) => [
          group.id ? `id:${group.id}` : `name:${group.name}`,
          group,
        ]),
    ).values(),
  );

  // グループがない場合
  if (groups.length === 0) {
    return (
      <div className="prose max-w-none p-4 sm:p-6">
        <div className="not-prose mb-2 flex items-center justify-between gap-3 border-b-2 border-current pb-1">
          <h1 className="text-2xl font-extrabold">評価</h1>
        </div>
        <div className="not-prose mt-8 space-y-4">
          <p className="text-slate-600 dark:text-slate-300">
            参加中のグループがありません。
          </p>
          <p className="text-slate-600 dark:text-slate-300">
            同じグループの参加者が実施したタスクを評価することができます。
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

  // グループごとの評価対象タスクの取得と評価登録フォームの表示
  const memberships = toJsonApiDataArray(membershipsPayload).map((row) =>
    normalizeMembership(row),
  );
  const normalizedEvaluations =
    toJsonApiDataArray(evaluationsPayload).map((row) =>
      normalizeEvaluation(row),
    );

  // 評価対象から自分自身を除外
  const apiUser = extractCurrentUserIdentity(mePayload);
  const su = session.user as {
    id?: string;
    userId?: string;
    name?: string | null;
    email?: string | null;
  };
  const currentUser: MemberItem = {
    id:
      apiUser.id ??
      su.id ??
      su.userId,
    name: apiUser.name ?? su.name ?? undefined,
    email: apiUser.email ?? su.email ?? undefined,
  };

  // 評価の重複排除
  const evaluatedAssignmentIds = new Set(
    normalizedEvaluations
      .map((evaluation) => normalizeText(evaluation.assignmentId))
      .filter((id) => id.length > 0),
  );

  //　グループごとに評価対象タスクを取得
  const groupsWithEvaluations = await Promise.all(
    groups.map(async (group) => {
      if (!group.id) {
        return { group, rows: [] as GroupRow[] };
      }

      // グループに所属しているか判定
      const tasksPayload = await fetchOkJson(
        `${v1Base}/groups/${encodeURIComponent(group.id)}/tasks`,
      );

      const tasks = toJsonApiDataArray(tasksPayload).map((row, index) =>
        normalizeTask(row, index),
      );
      const uniqueTasks = Array.from(
        new Map(
          tasks.map((task, index) => [
            normalizeText(task.id) || `row:${index}:${task.name}`,
            task,
          ]),
        ).values(),
      );

      // タスクに紐づくアサインメントを取得
      const taskById = new Map(
        uniqueTasks
          .filter((task) => task.id)
          .map((task) => [normalizeText(task.id), task]),
      );

      const taskIds = uniqueTasks
        .map((task) => task.id)
        .filter((id): id is string => Boolean(id));

      const assignmentPayloadsByTask = (
        await Promise.all(
          taskIds.map(async (taskId) => ({
            taskId,
            payload: await fetchOkJson(
              `${v1Base}/tasks/${encodeURIComponent(taskId)}/assignments`,
            ),
          })),
        )
      ).filter(
        (row): row is { taskId: string; payload: unknown } =>
          row.payload != null,
      );

      // 評価対象を選別
      const parsedAssignments = assignmentPayloadsByTask.flatMap(
        ({ taskId, payload }) => {
          const rows = toJsonApiDataArray(payload);
          return rows
            .map((row) => {
              const normalized = normalizeAssignment(row);
              return { ...normalized, taskId: normalized.taskId ?? taskId };
            })
            .filter((assignment) =>
              Boolean(
                assignment.id ||
                assignment.taskId ||
                assignment.status ||
                assignment.completedDate,
              ),
            );
        },
      );

      // statusが完了のタスクを選別
      const uniqueAssignments = Array.from(
        new Map(
          parsedAssignments.map((assignment, index) => [
            normalizeText(assignment.id) ||
              `${normalizeText(assignment.taskId)}:${normalizeText(assignment.assigneeId)}:${index}`,
            assignment,
          ]),
        ).values(),
      );

      // タスクのstatusを選別
      const completedAssignments = uniqueAssignments.filter((assignment) =>
        isCompletedAssignment(assignment),
      );

      const membershipsInGroup = memberships.filter((membership) =>
        membershipBelongsToGroup(membership, group),
      );

      // アサインメントの担当者がグループに所属しているか判定
      const memberByMembershipId = new Map(
        membershipsInGroup
          .filter((membership) => membership.id)
          .map((membership) => [
            normalizeText(membership.id),
            membership.member,
          ]),
      );

      // 自分が担当のタスクを評価対象から除外するためのIDセット
      const myMembershipIds = new Set(
        membershipsInGroup
          .filter((membership) => isSameMember(membership.member, currentUser))
          .map((membership) => normalizeText(membership.id))
          .filter((id) => id.length > 0),
      );

      const rows = completedAssignments
        .map((assignment): GroupRow | null => {
          const normalizedAssignmentId = normalizeText(assignment.id);
          const assignmentMembershipId = normalizeText(assignment.membershipId);

          if (
            (normalizedAssignmentId &&
              evaluatedAssignmentIds.has(normalizedAssignmentId)) ||
            (assignmentMembershipId &&
              myMembershipIds.has(assignmentMembershipId))
          ) {
            return null;
          }

          // タスクの担当者がグループに所属していない場合は評価対象外とする
          const memberFromMembership = assignment.membershipId
            ? memberByMembershipId.get(normalizeText(assignment.membershipId))
            : undefined;

          if (!hasMemberIdentity(memberFromMembership ?? {})) {
            return null;
          }

          const task = taskById.get(normalizeText(assignment.taskId));
          if (!task) {
            return null;
          }

          return { assignment, task };
        })
        .filter((row): row is GroupRow => row !== null);

      return { group, rows: shuffleArray(rows) };
    }),
  );

  // 評価対象がない場合
  const totalRows = groupsWithEvaluations.reduce(
    (sum, group) => sum + group.rows.length,
    0,
  );

  return (
    <div className="prose max-w-none p-4 sm:p-6">
      <div className="not-prose mb-2 flex items-center justify-between gap-3 border-b-2 border-current pb-1">
        <h1 className="text-2xl font-extrabold">評価</h1>
      </div>
      <p className="mt-6 text-sm text-slate-600 dark:text-slate-300">
        他ユーザが完了したタスクは {totalRows} 件です。
      </p>
      <div className="not-prose mt-8 space-y-6">
        {groupsWithEvaluations.map(({ group, rows }) => (
          <section
            key={group.id ?? group.name}
            className="rounded-lg border bg-card p-4 sm:p-5"
          >
            <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <h2 className="text-lg font-bold">{group.name}</h2>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {rows.length} 件
              </span>
            </div>
            {rows.length === 0 ? (
              <p className="text-sm text-slate-500">
                評価できる完了タスクはありません。
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="min-w-[860px] w-full border-collapse text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                    <tr>
                      <th className="px-3 py-2 font-semibold">家事</th>
                      <th className="px-3 py-2 font-semibold">負担ポイント</th>
                      <th className="px-3 py-2 font-semibold">備考</th>
                      <th className="px-3 py-2 font-semibold">評価</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ assignment, task }, index) => (
                      <tr
                        key={
                          assignment.id ?? `${group.id ?? group.name}-${index}`
                        }
                        data-task-id={task.id ?? assignment.taskId ?? ""}
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
                          <AssignmentEvaluationForm
                            assignmentId={assignment.id}
                            taskId={task.id ?? assignment.taskId}
                            apiUrl={apiUrl}
                          />
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
