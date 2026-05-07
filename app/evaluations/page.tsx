import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AssignmentEvaluationForm from "@/components/assignment-evaluation-form";
import {
  GUEST_EXPIRED_REDIRECT_PATH,
  isGuestSessionExpiredStatus,
  isGuestSessionUser,
} from "@/lib/guest-session";

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
  taskName?: string;
  taskPoint?: string;
  taskDescription?: string;
  membershipId?: string;
  status?: string;
  completedDate?: string;
  completedByUserId?: string;
  assigneeId?: string;
  assigneeName?: string;
  assigneeEmail?: string;
};
type EvaluationItem = {
  assignmentId?: string;
  taskId?: string;
  evaluatorId?: string;
};
type GroupRow = { assignment: AssignmentItem; task: TaskItem };

const normalizeText = (value?: string) => (value ?? "").trim().toLowerCase();

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

const getEntity = (value: unknown) => {
  const entity = asRecord(value);
  const attributes = asRecord(entity?.attributes);
  return { entity, attributes };
};

const pickFromEntity = (value: unknown, keys: string[]) => {
  const { entity, attributes } = getEntity(value);
  return pickFirstString(attributes, keys) ?? pickFirstString(entity, keys);
};

const pickRelationshipId = (value: unknown, key: string) => {
  const entity = asRecord(value);
  const relationships = asRecord(entity?.relationships);
  const relationship = asRecord(relationships?.[key]);
  const data = asRecord(relationship?.data);
  return pickFirstString(data, ["id"]);
};

const toArray = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }
  const root = asRecord(payload);
  if (!root) {
    return [];
  }
  return Array.isArray(root.data) ? root.data : [];
};

const normalizeGroup = (row: unknown): GroupItem => ({
  id: pickFromEntity(row, ["id"]),
  name: pickFromEntity(row, ["name"]) ?? "",
});

const normalizeMembership = (row: unknown): MembershipItem => ({
  id: pickFromEntity(row, ["id"]),
  groupId: pickFromEntity(row, ["group_id"]),
  member: {
    id: pickFromEntity(row, ["user_id"]) ?? pickRelationshipId(row, "user"),
    name: undefined,
    email: undefined,
  },
});

const normalizeTask = (row: unknown, index: number): TaskItem => ({
  id: pickFromEntity(row, ["id"]),
  name: pickFromEntity(row, ["name"]) ?? `タスク ${index + 1}`,
  point: pickFromEntity(row, ["point"]),
  description: pickFromEntity(row, ["description"]),
});

const normalizeTaskDetail = (
  payload: unknown,
  fallbackTaskId?: string,
): TaskItem => {
  const root = asRecord(payload);
  const row = asRecord(root?.data) ?? root;
  return {
    id: pickFromEntity(row, ["id"]) ?? fallbackTaskId,
    name: pickFromEntity(row, ["name"]) ?? "タスク",
    point: pickFromEntity(row, ["point"]),
    description: pickFromEntity(row, ["description"]),
  };
};

const normalizeAssignment = (row: unknown): AssignmentItem => ({
  id: pickFromEntity(row, ["id"]),
  groupId: pickFromEntity(row, ["group_id"]),
  taskId: pickFromEntity(row, ["task_id"]) ?? pickRelationshipId(row, "task"),
  taskName: pickFromEntity(row, ["assignment_task_name"]),
  taskPoint: pickFromEntity(row, ["task_point"]),
  taskDescription: pickFromEntity(row, ["task_description"]),
  membershipId:
    pickFromEntity(row, ["membership_id"]) ??
    pickRelationshipId(row, "membership"),
  status: pickFromEntity(row, ["status"]),
  completedDate: pickFromEntity(row, ["completed_date"]),
  completedByUserId: pickFromEntity(row, ["completed_by_user_id"]),
  assigneeId: pickFromEntity(row, ["assigned_to_id"]),
  assigneeName: pickFromEntity(row, ["assigned_to_name"]),
  assigneeEmail: pickFromEntity(row, ["assigned_to_email"]),
});

const normalizeEvaluation = (row: unknown): EvaluationItem => ({
  assignmentId:
    pickFromEntity(row, ["assignment_id"]) ??
    pickRelationshipId(row, "assignment"),
  taskId: pickFromEntity(row, ["task_id"]) ?? pickRelationshipId(row, "task"),
  evaluatorId:
    pickFromEntity(row, ["evaluator_id"]) ??
    pickRelationshipId(row, "evaluator"),
});

const extractCurrentUserIdentity = (payload: unknown): MemberItem => {
  const root = asRecord(payload);
  const row = asRecord(root?.data) ?? root;
  return {
    id: pickFromEntity(row, ["id"]),
    name: pickFromEntity(row, ["name"]),
    email: pickFromEntity(row, ["email"]),
  };
};

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

const isCompletedStatus = (value?: string) => {
  const normalized = normalizeText(value);
  return (
    normalized === "completed" ||
    normalized === "complete" ||
    normalized === "完了済み" ||
    normalized === "済" ||
    normalized === "done" ||
    normalized === "finished" ||
    normalized === "完了"
  );
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

const shuffleArray = <T,>(items: T[]): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const membershipBelongsToGroup = (
  membership: MembershipItem,
  group: GroupItem,
) => {
  const membershipGroupId = normalizeText(membership.groupId);
  const groupId = normalizeText(group.id);
  return Boolean(membershipGroupId && groupId && membershipGroupId === groupId);
};

const evaluationsStrictAssignee =
  process.env.EVALUATIONS_STRICT_ASSIGNEE === "1";

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

  const sessionUserId =
    (session.user as { id?: string } | undefined)?.id ??
    (session.user as { userId?: string } | undefined)?.userId;

  const [
    groupsPayload,
    membershipsPayload,
    evaluationsPayload,
    mePayload,
    meById,
  ] = await Promise.all([
    fetchOkJson(`${v1Base}/groups`),
    fetchOkJson(`${v1Base}/memberships`),
    fetchOkJson(`${v1Base}/evaluations`),
    fetchOkJson(`${v1Base}/users/me`),
    sessionUserId
      ? fetchOkJson(`${v1Base}/users/${encodeURIComponent(sessionUserId)}`)
      : Promise.resolve(null),
  ]);

  const groups = Array.from(
    new Map(
      toArray(groupsPayload)
        .map((row) => normalizeGroup(row))
        .filter((group) => group.name.trim().length > 0)
        .map((group) => [
          group.id ? `id:${group.id}` : `name:${group.name}`,
          group,
        ]),
    ).values(),
  );

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

  const memberships = toArray(membershipsPayload).map((row) =>
    normalizeMembership(row),
  );
  const normalizedEvaluations = toArray(evaluationsPayload).map((row) =>
    normalizeEvaluation(row),
  );

  const meFromV1 = extractCurrentUserIdentity(mePayload);
  const meFromById = extractCurrentUserIdentity(meById);
  const currentUserFromApi = hasMemberIdentity(meFromV1)
    ? meFromV1
    : meFromById;
  const currentUser: MemberItem = {
    id:
      currentUserFromApi.id ??
      (session.user as { id?: string } | undefined)?.id ??
      (session.user as { userId?: string } | undefined)?.userId,
    name: currentUserFromApi.name ?? session.user?.name ?? undefined,
    email: currentUserFromApi.email ?? session.user?.email ?? undefined,
  };

  const normalizedCurrentUserId = normalizeText(currentUser.id);
  const selfUserIds = new Set(
    [currentUser.id, sessionUserId]
      .map((value) => normalizeText(value))
      .filter((value) => value.length > 0),
  );
  const selfEmails = new Set(
    [currentUser.email, session.user?.email]
      .map((value) => (typeof value === "string" ? normalizeText(value) : ""))
      .filter((value) => value.length > 0),
  );
  const isSelfUserId = (value?: string) => {
    const normalized = normalizeText(value);
    return Boolean(normalized && selfUserIds.has(normalized));
  };
  const isSelfEmail = (value?: string) => {
    const normalized = normalizeText(value);
    return Boolean(normalized && selfEmails.has(normalized));
  };

  const evaluatedAssignmentIds = new Set(
    normalizedEvaluations
      .map((evaluation) => normalizeText(evaluation.assignmentId))
      .filter((id) => id.length > 0),
  );

  const evaluatedTaskIdsWithoutAssignment = new Set(
    normalizedEvaluations
      .filter((evaluation) => !normalizeText(evaluation.assignmentId))
      .map((evaluation) => normalizeText(evaluation.taskId))
      .filter((id) => id.length > 0),
  );

  const globalMemberByMembershipId = new Map(
    memberships
      .filter((membership) => membership.id)
      .map((membership) => [normalizeText(membership.id), membership.member]),
  );

  const globalMemberByUserId = new Map(
    memberships
      .filter((membership) => membership.member.id)
      .map((membership) => [
        normalizeText(membership.member.id),
        membership.member,
      ]),
  );

  const myMembershipIdsGlobal = new Set(
    memberships
      .filter((membership) => isSameMember(membership.member, currentUser))
      .map((membership) => normalizeText(membership.id))
      .filter((id) => id.length > 0),
  );

  const groupsWithEvaluations = await Promise.all(
    groups.map(async (group) => {
      if (!group.id) {
        return { group, rows: [] as GroupRow[] };
      }

      const tasksPayload = await fetchOkJson(
        `${v1Base}/groups/${encodeURIComponent(group.id)}/tasks`,
      );

      const tasks = toArray(tasksPayload).map((row, index) =>
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

      const parsedAssignments = assignmentPayloadsByTask.flatMap(
        ({ taskId, payload }) => {
          const rows = toArray(payload);
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

      const uniqueAssignments = Array.from(
        new Map(
          parsedAssignments.map((assignment, index) => [
            normalizeText(assignment.id) ||
              `${normalizeText(assignment.taskId)}:${normalizeText(assignment.assigneeId)}:${index}`,
            assignment,
          ]),
        ).values(),
      );

      const completedAssignments = uniqueAssignments.filter((assignment) =>
        isCompletedAssignment(assignment),
      );

      const missingTaskIds = Array.from(
        new Set(
          completedAssignments
            .map((assignment) => assignment.taskId)
            .filter((taskId): taskId is string => {
              if (!taskId) {
                return false;
              }
              const existing = taskById.get(normalizeText(taskId));
              if (!existing) {
                return true;
              }
              const normalizedName = normalizeText(existing.name);
              return (
                normalizedName === "タスク" ||
                normalizedName.startsWith("タスク ")
              );
            }),
        ),
      );

      const missingTaskDetails = await Promise.all(
        missingTaskIds.map(async (taskId) => {
          const detail = await fetchOkJson(
            `${v1Base}/tasks/${encodeURIComponent(taskId)}`,
          );
          if (detail == null) {
            return null;
          }
          return { taskId, task: normalizeTaskDetail(detail, taskId) };
        }),
      );

      const taskByIdWithDetails = new Map(taskById);
      for (const detail of missingTaskDetails) {
        if (detail?.taskId) {
          taskByIdWithDetails.set(normalizeText(detail.taskId), detail.task);
        }
      }

      const membershipsInGroup = memberships.filter((membership) =>
        membershipBelongsToGroup(membership, group),
      );

      const memberByMembershipId = new Map(
        membershipsInGroup
          .filter((membership) => membership.id)
          .map((membership) => [
            normalizeText(membership.id),
            membership.member,
          ]),
      );

      const memberByUserId = new Map(
        membershipsInGroup
          .filter((membership) => membership.member.id)
          .map((membership) => [
            normalizeText(membership.member.id),
            membership.member,
          ]),
      );

      const myMembershipIds = new Set(
        membershipsInGroup
          .filter((membership) => isSameMember(membership.member, currentUser))
          .map((membership) => normalizeText(membership.id))
          .filter((id) => id.length > 0),
      );

      const rows = completedAssignments
        .map((assignment): GroupRow | null => {
          const normalizedAssignmentId = normalizeText(assignment.id);
          const normalizedTaskId = normalizeText(assignment.taskId);
          const assignmentMembershipId = normalizeText(assignment.membershipId);

          if (
            (!normalizedAssignmentId &&
              normalizedTaskId &&
              evaluatedTaskIdsWithoutAssignment.has(normalizedTaskId)) ||
            (normalizedAssignmentId &&
              evaluatedAssignmentIds.has(normalizedAssignmentId)) ||
            isSelfUserId(assignment.completedByUserId) ||
            (assignmentMembershipId &&
              myMembershipIds.has(assignmentMembershipId))
          ) {
            return null;
          }

          const memberFromMembership = assignment.membershipId
            ? (memberByMembershipId.get(
                normalizeText(assignment.membershipId),
              ) ??
              globalMemberByMembershipId.get(
                normalizeText(assignment.membershipId),
              ))
            : undefined;

          const memberFromAssigneeId = assignment.assigneeId
            ? (memberByUserId.get(normalizeText(assignment.assigneeId)) ??
              globalMemberByUserId.get(normalizeText(assignment.assigneeId)))
            : undefined;

          const assignee: MemberItem = {
            id:
              assignment.assigneeId ??
              memberFromMembership?.id ??
              memberFromAssigneeId?.id,
            name:
              assignment.assigneeName ??
              memberFromMembership?.name ??
              memberFromAssigneeId?.name,
            email:
              assignment.assigneeEmail ??
              memberFromMembership?.email ??
              memberFromAssigneeId?.email,
          };

          const normalizedAssigneeId = normalizeText(assignment.assigneeId);
          if (
            (evaluationsStrictAssignee && !hasMemberIdentity(assignee)) ||
            (hasMemberIdentity(assignee) &&
              isSameMember(assignee, currentUser)) ||
            (normalizedCurrentUserId &&
              normalizedAssigneeId &&
              normalizedCurrentUserId === normalizedAssigneeId) ||
            (assignmentMembershipId &&
              myMembershipIdsGlobal.has(assignmentMembershipId)) ||
            isSelfUserId(assignee.id) ||
            isSelfEmail(assignee.email)
          ) {
            return null;
          }

          const task = taskByIdWithDetails.get(
            normalizeText(assignment.taskId),
          ) ?? {
            id: assignment.taskId,
            name: assignment.taskName ?? "タスク",
            point: assignment.taskPoint ?? "-",
            description: assignment.taskDescription ?? "-",
          };

          return { assignment, task };
        })
        .filter((row): row is GroupRow => row !== null);

      return { group, rows: shuffleArray(rows) };
    }),
  );

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
