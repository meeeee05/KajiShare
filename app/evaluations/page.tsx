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

type GroupItem = {
  id?: string;
  name: string;
};

type MemberItem = {
  id?: string;
  name?: string;
  email?: string;
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
  evaluatorEmail?: string;
  evaluatorName?: string;
};

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

const pickRelationshipId = (
  obj: AnyRecord | null,
  relationshipKeys: string[],
): string | undefined => {
  if (!obj) {
    return undefined;
  }

  for (const key of relationshipKeys) {
    const rel = asRecord(obj[key]);
    const relData = asRecord(rel?.data);
    const direct = pickFirstString(relData, ["id"]);
    if (direct) {
      return direct;
    }

    const nested = asRecord(relData?.attributes) ?? asRecord(relData?.data);
    const nestedId = pickFirstString(nested, ["id"]);
    if (nestedId) {
      return nestedId;
    }
  }

  return undefined;
};

const extractEvaluationsArray = (payload: unknown): unknown[] => {
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
    root.evaluations,
    root.items,
    root.results,
    root.data,
    rootData?.evaluations,
    rootData?.items,
    rootData?.results,
    rootData?.data,
    rootDataData?.evaluations,
    rootDataData?.items,
    rootDataData?.results,
  );
};

const normalizeEvaluation = (row: unknown): EvaluationItem => {
  const root = asRecord(row);
  const evaluationRoot = asRecord(root?.evaluation) ?? root;
  const evaluation = unwrapEntity(evaluationRoot);

  const evaluatorRoot =
    asRecord(evaluationRoot?.evaluator) ??
    asRecord(evaluationRoot?.user) ??
    asRecord(evaluation?.evaluator) ??
    asRecord(evaluation?.user);
  const evaluator = unwrapEntity(evaluatorRoot);

  return {
    assignmentId:
      pickFromSources(evaluation, evaluationRoot, [
        "assignment_id",
        "assignmentId",
        "assignment",
      ]) ??
      pickRelationshipId(evaluationRoot, ["assignment", "task_assignment"]) ??
      pickRelationshipId(evaluation, ["assignment", "task_assignment"]),
    taskId:
      pickFromSources(evaluation, evaluationRoot, [
        "task_id",
        "taskId",
        "task",
      ]) ??
      pickRelationshipId(evaluationRoot, ["task"]) ??
      pickRelationshipId(evaluation, ["task"]),
    evaluatorId:
      pickFromSources(evaluator, evaluation, ["id", "user_id", "userId"]) ??
      pickFromSources(evaluation, evaluationRoot, [
        "evaluator_id",
        "evaluatorId",
        "user_id",
        "userId",
      ]) ??
      pickRelationshipId(evaluationRoot, ["evaluator", "user", "member"]),
    evaluatorEmail:
      pickFromSources(evaluator, evaluation, ["email", "mail"]) ??
      pickFromSources(evaluation, evaluationRoot, ["evaluator_email", "email"]),
    evaluatorName:
      pickFromSources(evaluator, evaluation, ["name", "user_name"]) ??
      pickFromSources(evaluation, evaluationRoot, ["evaluator_name", "name"]),
  };
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

  for (const payload of payloads) {
    const rows = extractGroupsArray(payload);
    for (const row of rows) {
      const root = asRecord(row);
      const source = asRecord(root?.group) ?? root;
      const group = unwrapEntity(source);
      const base = unwrapEntity(root);

      const id = pickFromSources(group, base, ["id", "group_id", "groupId"]);
      const name =
        pickFromSources(group, base, ["name"]) ??
        pickFromSources(source, root, ["name"]);

      if (!name) {
        continue;
      }

      const key = id ? `id:${id}` : `name:${name}`;
      if (!map.has(key)) {
        map.set(key, { id, name });
      }
    }
  }

  return Array.from(map.values());
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
    root.data,
    root.items,
    root.results,
    root.rows,
    root.list,
    rootData?.memberships,
    rootData?.groups,
    rootData?.data,
    rootData?.items,
    rootData?.results,
    rootData?.rows,
    rootData?.list,
    rootDataData?.memberships,
    rootDataData?.groups,
    rootDataData?.items,
    rootDataData?.results,
    rootDataData?.rows,
    rootDataData?.list,
  );
};

const normalizeMemberships = (payloads: unknown[]): MembershipItem[] => {
  const normalized: MembershipItem[] = [];

  for (const payload of payloads) {
    const rows = extractMembershipsArray(payload);

    for (const row of rows) {
      const membershipRoot = asRecord(row);
      const membership = unwrapEntity(membershipRoot);
      const group =
        unwrapEntity(asRecord(membershipRoot?.group)) ??
        unwrapEntity(asRecord(membership?.group));

      const groupId =
        pickFromSources(group, membership, ["id", "group_id", "groupId"]) ??
        pickFirstString(membershipRoot, ["group_id", "groupId"]);

      const candidateMember =
        unwrapEntity(asRecord(membershipRoot?.member)) ??
        unwrapEntity(asRecord(membershipRoot?.user)) ??
        unwrapEntity(asRecord(membership?.member)) ??
        unwrapEntity(asRecord(membership?.user)) ??
        unwrapEntity(asRecord(membershipRoot?.account)) ??
        unwrapEntity(asRecord(membership?.account));

      normalized.push({
        id: pickFromSources(membership, membershipRoot, [
          "id",
          "membership_id",
        ]),
        groupId,
        member: {
          id:
            pickFromSources(candidateMember, membership, [
              "id",
              "member_id",
              "user_id",
              "userId",
            ]) ??
            pickFirstString(membershipRoot, ["member_id", "user_id", "userId"]),
          name: pickFromSources(candidateMember, membership, [
            "name",
            "member_name",
          ]),
          email: pickFromSources(candidateMember, membership, [
            "email",
            "mail",
            "member_email",
          ]),
        },
      });
    }
  }

  return normalized;
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
  const taskRoot = asRecord(root?.task) ?? root;
  const task = unwrapEntity(taskRoot);

  return {
    id:
      pickFromSources(task, taskRoot, ["id", "task_id", "taskId"]) ??
      pickFirstString(root, ["id", "task_id", "taskId"]),
    name:
      pickFromSources(task, taskRoot, ["name", "title", "task_name"]) ??
      `タスク ${index + 1}`,
    point: pickFromSources(task, taskRoot, ["point", "score", "value"]),
    description: pickFromSources(task, taskRoot, [
      "description",
      "detail",
      "memo",
    ]),
  };
};

const normalizeTaskDetail = (
  payload: unknown,
  fallbackTaskId?: string,
): TaskItem => {
  const root = asRecord(payload);
  const taskRoot =
    asRecord(root?.task) ??
    asRecord(root?.data) ??
    asRecord(root?.item) ??
    root;
  const task = unwrapEntity(taskRoot);

  return {
    id:
      pickFromSources(task, taskRoot, ["id", "task_id", "taskId"]) ??
      fallbackTaskId,
    name:
      pickFromSources(task, taskRoot, ["name", "title", "task_name"]) ??
      "タスク",
    point: pickFromSources(task, taskRoot, ["point", "score", "value"]),
    description: pickFromSources(task, taskRoot, [
      "description",
      "detail",
      "memo",
    ]),
  };
};

const extractAssignmentsArray = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  const root = asRecord(payload);
  if (!root) {
    return [];
  }

  const rootData = asRecord(root.data);
  const rootDataData = asRecord(rootData?.data);

  const directArray = firstArray(
    root.assignments,
    root.items,
    root.results,
    root.data,
    rootData?.assignments,
    rootData?.items,
    rootData?.results,
    rootData?.data,
    rootDataData?.assignments,
    rootDataData?.items,
    rootDataData?.results,
  );

  if (directArray.length > 0) {
    return directArray;
  }

  const singleCandidates = [
    asRecord(root.assignment),
    asRecord(rootData?.assignment),
    asRecord(rootDataData?.assignment),
    asRecord(rootData?.data),
    root,
  ];

  for (const candidate of singleCandidates) {
    if (!candidate) {
      continue;
    }

    const maybeTaskId = pickFirstString(candidate, ["task_id", "taskId"]);
    const maybeStatus = pickFirstString(candidate, [
      "status",
      "state",
      "comment",
    ]);
    const maybeId = pickFirstString(candidate, ["id", "assignment_id"]);

    if (maybeTaskId || maybeStatus || maybeId) {
      return [candidate];
    }
  }

  return [];
};

const normalizeAssignment = (row: unknown): AssignmentItem => {
  const root = asRecord(row);
  const assignmentRoot = asRecord(root?.assignment) ?? root;
  const assignment = unwrapEntity(assignmentRoot);
  const taskRoot =
    asRecord(assignmentRoot?.task) ??
    asRecord(assignment?.task) ??
    asRecord(root?.task);
  const task = unwrapEntity(taskRoot);

  const assigneeRoot =
    asRecord(assignmentRoot?.assignee) ??
    asRecord(assignmentRoot?.user) ??
    asRecord(assignment?.assignee) ??
    asRecord(assignment?.user);
  const assignee = unwrapEntity(assigneeRoot);

  const membershipRoot =
    asRecord(assignmentRoot?.membership) ??
    asRecord(assignment?.membership) ??
    asRecord(root?.membership);
  const membership = unwrapEntity(membershipRoot);

  const membershipMemberRoot =
    asRecord(membershipRoot?.member) ??
    asRecord(membershipRoot?.user) ??
    asRecord(membership?.member) ??
    asRecord(membership?.user) ??
    asRecord(membershipRoot?.account) ??
    asRecord(membership?.account);
  const membershipMember = unwrapEntity(membershipMemberRoot);

  return {
    id: pickFromSources(assignment, assignmentRoot, ["id", "assignment_id"]),
    groupId:
      pickFromSources(assignment, assignmentRoot, ["group_id", "groupId"]) ??
      pickFirstString(root, ["group_id", "groupId"]),
    taskId:
      pickFromSources(task, assignment, ["id", "task_id", "taskId"]) ??
      pickFromSources(assignment, assignmentRoot, ["task_id", "taskId"]) ??
      pickFirstString(root, ["task_id", "taskId"]),
    taskName: pickFromSources(task, taskRoot, ["name", "title", "task_name"]),
    taskPoint: pickFromSources(task, taskRoot, ["point", "score", "value"]),
    taskDescription: pickFromSources(task, taskRoot, [
      "description",
      "detail",
      "memo",
    ]),
    membershipId:
      pickFromSources(assignment, assignmentRoot, [
        "membership_id",
        "membershipId",
      ]) ??
      pickFromSources(membership, membershipRoot, ["id", "membership_id"]) ??
      pickFirstString(root, ["membership_id", "membershipId"]),
    status: pickFromSources(assignment, assignmentRoot, [
      "status",
      "state",
      "comment",
    ]),
    completedDate: pickFromSources(assignment, assignmentRoot, [
      "completed_date",
      "completedDate",
      "done_at",
      "doneAt",
      "finished_at",
      "finishedAt",
    ]),
    completedByUserId:
      pickFromSources(assignment, assignmentRoot, [
        "completed_by_user_id",
        "completedByUserId",
      ]) ??
      pickFirstString(root, ["completed_by_user_id", "completedByUserId"]),
    assigneeId:
      pickFromSources(assignee, assignment, ["id", "user_id", "userId"]) ??
      pickFromSources(membershipMember, membership, [
        "id",
        "user_id",
        "userId",
      ]) ??
      pickFromSources(assigneeRoot, assignmentRoot, [
        "assignee_id",
        "member_id",
        "executor_id",
        "done_by",
      ]),
    assigneeName:
      pickFromSources(assignee, assignment, ["name", "user_name"]) ??
      pickFromSources(membershipMember, membership, ["name", "user_name"]),
    assigneeEmail:
      pickFromSources(assignee, assignment, ["email", "mail"]) ??
      pickFromSources(membershipMember, membership, ["email", "mail"]),
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
  if (aName && bName) {
    return aName === bName;
  }

  return false;
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

const extractCurrentUserIdentity = (payload: unknown): MemberItem => {
  const root = asRecord(payload);
  const userRoot =
    asRecord(root?.user) ??
    asRecord(root?.member) ??
    asRecord(root?.account) ??
    asRecord(root?.data) ??
    root;
  const user = unwrapEntity(userRoot);

  return {
    id: pickFromSources(user, userRoot, [
      "id",
      "user_id",
      "userId",
      "member_id",
    ]),
    name: pickFromSources(user, userRoot, ["name", "user_name", "member_name"]),
    email: pickFromSources(user, userRoot, ["email", "mail", "member_email"]),
  };
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

const evaluationsDebugEnabled = process.env.EVALUATIONS_DEBUG === "1";
const evaluationsStrictAssignee =
  process.env.EVALUATIONS_STRICT_ASSIGNEE === "1";

const evaluationsDebugLog = (label: string, payload: unknown) => {
  if (!evaluationsDebugEnabled) {
    return;
  }

  console.info(`[evaluations-debug] ${label}`, payload);
};

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

  const sessionUserId =
    (session.user as { id?: string } | undefined)?.id ??
    (session.user as { userId?: string } | undefined)?.userId;

  const [
    groupsV1,
    groupsLegacy,
    membershipsV1,
    membershipsLegacy,
    evaluationsV1,
    evaluationsLegacy,
    meV1,
    meLegacy,
    meById,
  ] = await Promise.all([
    fetchOkJson(`${v1Base}/groups`),
    fetchOkJson(`${base}/groups`),
    fetchOkJson(`${v1Base}/memberships`),
    fetchOkJson(`${base}/memberships`),
    fetchOkJson(`${v1Base}/evaluations`),
    fetchOkJson(`${base}/evaluations`),
    fetchOkJson(`${v1Base}/users/me`),
    fetchOkJson(`${base}/users/me`),
    sessionUserId
      ? fetchOkJson(`${v1Base}/users/${encodeURIComponent(sessionUserId)}`)
      : Promise.resolve(null),
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

  const memberships = normalizeMemberships([membershipsV1, membershipsLegacy]);

  const meFromV1 = extractCurrentUserIdentity(meV1);
  const meFromLegacy = extractCurrentUserIdentity(meLegacy);
  const meFromById = extractCurrentUserIdentity(meById);
  const currentUserFromApi = hasMemberIdentity(meFromV1)
    ? meFromV1
    : hasMemberIdentity(meFromLegacy)
      ? meFromLegacy
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

  const isEvaluationByMe = (evaluation: EvaluationItem) => {
    const evaluatorId = normalizeText(evaluation.evaluatorId);
    if (evaluatorId && selfUserIds.has(evaluatorId)) {
      return true;
    }

    const evaluatorEmail = normalizeText(evaluation.evaluatorEmail);
    if (evaluatorEmail && selfEmails.has(evaluatorEmail)) {
      return true;
    }

    return false;
  };

  const normalizedEvaluations = [
    ...extractEvaluationsArray(evaluationsV1),
    ...extractEvaluationsArray(evaluationsLegacy),
  ].map((row) => normalizeEvaluation(row));

  const evaluatedAssignmentIdsByMe = new Set(
    normalizedEvaluations
      .filter((evaluation) => isEvaluationByMe(evaluation))
      .map((evaluation) => normalizeText(evaluation.assignmentId))
      .filter((assignmentId) => assignmentId.length > 0),
  );

  const evaluatedAssignmentIds = new Set(
    normalizedEvaluations
      .map((evaluation) => normalizeText(evaluation.assignmentId))
      .filter((assignmentId) => assignmentId.length > 0),
  );

  const evaluatedTaskIds = new Set(
    normalizedEvaluations
      .map((evaluation) => normalizeText(evaluation.taskId))
      .filter((taskId) => taskId.length > 0),
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
        return {
          group,
          rows: [] as Array<{
            assignment: AssignmentItem;
            task: TaskItem;
            assigneeLabel: string;
          }>,
        };
      }

      const tasksPayload = await fetchOkJson(
        `${v1Base}/groups/${encodeURIComponent(group.id)}/tasks`,
      );

      const tasks = extractTasksArray(tasksPayload).map(normalizeTask);

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

      const parsedAssignmentsByTask = assignmentPayloadsByTask.flatMap(
        ({ taskId, payload }) => {
          const extracted = extractAssignmentsArray(payload);
          const sourceRows = extracted.length > 0 ? extracted : [payload];

          return sourceRows
            .map((row) => {
              const normalized = normalizeAssignment(row);
              return {
                ...normalized,
                taskId: normalized.taskId ?? taskId,
              };
            })
            .filter((assignment) => {
              return Boolean(
                assignment.id ||
                assignment.taskId ||
                assignment.status ||
                assignment.completedDate,
              );
            });
        },
      );

      const uniqueAssignments = Array.from(
        new Map(
          parsedAssignmentsByTask.map((assignment, index) => [
            normalizeText(assignment.id) ||
              `${normalizeText(assignment.taskId)}:${normalizeText(assignment.assigneeId)}:${index}`,
            assignment,
          ]),
        ).values(),
      );

      evaluationsDebugLog("group-data", {
        groupId: group.id,
        groupName: group.name,
        taskPayloadsCount: tasksPayload ? 1 : 0,
        assignmentPayloadsCount: assignmentPayloadsByTask.length,
        tasksCount: uniqueTasks.length,
        assignmentsCount: uniqueAssignments.length,
        completedCount: uniqueAssignments.filter((assignment) =>
          isCompletedAssignment(assignment),
        ).length,
        sampleStatuses: uniqueAssignments.slice(0, 10).map((assignment) => ({
          id: assignment.id,
          taskId: assignment.taskId,
          status: assignment.status,
          completedDate: assignment.completedDate,
          assigneeId: assignment.assigneeId,
        })),
      });

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
          const detailCandidates = [
            `${v1Base}/tasks/${encodeURIComponent(taskId)}`,
          ];

          for (const url of detailCandidates) {
            const detail = await fetchOkJson(url);
            if (detail == null) {
              continue;
            }

            return {
              taskId,
              task: normalizeTaskDetail(detail, taskId),
            };
          }

          return null;
        }),
      );

      const taskByIdWithDetails = new Map(taskById);
      for (const detail of missingTaskDetails) {
        if (!detail?.taskId) {
          continue;
        }
        taskByIdWithDetails.set(normalizeText(detail.taskId), detail.task);
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
        .map((assignment) => {
          const normalizedAssignmentId = normalizeText(assignment.id);
          const normalizedTaskId = normalizeText(assignment.taskId);

          if (normalizedTaskId && evaluatedTaskIds.has(normalizedTaskId)) {
            return null;
          }

          if (
            normalizedAssignmentId &&
            evaluatedAssignmentIds.has(normalizedAssignmentId)
          ) {
            return null;
          }

          if (
            normalizedAssignmentId &&
            evaluatedAssignmentIdsByMe.has(normalizedAssignmentId)
          ) {
            return null;
          }

          const completedByUserId = normalizeText(assignment.completedByUserId);
          if (completedByUserId && selfUserIds.has(completedByUserId)) {
            return null;
          }

          const assignmentMembershipId = normalizeText(assignment.membershipId);
          if (
            assignmentMembershipId &&
            myMembershipIds.has(assignmentMembershipId)
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

          if (evaluationsStrictAssignee && !hasMemberIdentity(assignee)) {
            return null;
          }

          if (
            hasMemberIdentity(assignee) &&
            isSameMember(assignee, currentUser)
          ) {
            return null;
          }

          const normalizedAssigneeId = normalizeText(assignment.assigneeId);
          if (
            normalizedCurrentUserId &&
            normalizedAssigneeId &&
            normalizedCurrentUserId === normalizedAssigneeId
          ) {
            return null;
          }

          if (
            assignmentMembershipId &&
            myMembershipIdsGlobal.has(assignmentMembershipId)
          ) {
            return null;
          }

          const normalizedResolvedAssigneeId = normalizeText(assignee.id);
          if (
            normalizedResolvedAssigneeId &&
            selfUserIds.has(normalizedResolvedAssigneeId)
          ) {
            return null;
          }

          const normalizedResolvedAssigneeEmail = normalizeText(assignee.email);
          if (
            normalizedResolvedAssigneeEmail &&
            selfEmails.has(normalizedResolvedAssigneeEmail)
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

          return {
            assignment,
            task,
            assigneeLabel:
              assignee.name ?? assignee.email ?? assignee.id ?? "他のユーザ",
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      return {
        group,
        rows: shuffleArray(rows),
      };
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
                      <th className="px-3 py-2 font-semibold">実施者</th>
                      <th className="px-3 py-2 font-semibold">進捗状況</th>
                      <th className="px-3 py-2 font-semibold">評価</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ assignment, task, assigneeLabel }, index) => (
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
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                          {assigneeLabel}
                        </td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                          完了
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
