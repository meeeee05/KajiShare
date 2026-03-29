import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

type AnyRecord = Record<string, unknown>;

type GroupItem = {
  id?: string;
  name: string;
  createdAt?: string;
  assignMode: "manual" | "random" | "balanced" | "";
};

type MemberItem = {
  id?: string;
  name?: string;
  email?: string;
};

type MembershipItem = {
  id?: string;
  groupId?: string;
  groupName?: string;
  member: MemberItem;
};

type TaskItem = {
  id?: string;
  name: string;
  point?: string;
  description?: string;
  createdAt?: string;
  sourceIndex: number;
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
  createdAt?: string;
  completedDate?: string;
  completedByUserId?: string;
  assigneeId?: string;
  assigneeName?: string;
  assigneeEmail?: string;
  targetDate?: string;
  updatedAt?: string;
  evaluationId?: string;
  evaluationScore?: string;
  evaluationComment?: string;
  evaluatedAt?: string;
};

type DashboardTaskRow = {
  group: GroupItem;
  assignment: AssignmentItem;
  task: TaskItem;
  assignee: MemberItem;
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

const toTimestamp = (value?: string) => {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

const todayYmd = () => new Date().toISOString().slice(0, 10);

const normalizeAssignMode = (
  value?: string,
): "manual" | "random" | "balanced" | "" => {
  const normalized = normalizeText(value);

  if (!normalized) {
    return "";
  }

  if (normalized.includes("バランス") || normalized.includes("balanced")) {
    return "balanced";
  }
  if (normalized.includes("random") || normalized.includes("ランダム")) {
    return "random";
  }
  if (normalized.includes("manual") || normalized.includes("手動")) {
    return "manual";
  }

  return "";
};

const isSameDay = (isoLike?: string, ymd?: string) => {
  if (!isoLike || !ymd) {
    return false;
  }
  return isoLike.slice(0, 10) === ymd;
};

const sortTasksForAssignment = (tasks: TaskItem[]) => {
  return [...tasks].sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : Number.NaN;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : Number.NaN;

    const aValid = Number.isFinite(aTime);
    const bValid = Number.isFinite(bTime);

    if (aValid && bValid && aTime !== bTime) {
      return aTime - bTime;
    }

    return a.sourceIndex - b.sourceIndex;
  });
};

const selectLatestAssignmentForTask = (
  task: TaskItem,
  assignments: AssignmentItem[],
  membersForAssign: MemberItem[],
  todayKey: string,
) => {
  const taskIdNormalized = normalizeText(task.id);
  if (!taskIdNormalized) {
    return undefined;
  }

  const candidates = assignments
    .filter(
      (assignment) => normalizeText(assignment.taskId) === taskIdNormalized,
    )
    .map((assignment) => {
      const assigneeIndex = membersForAssign.findIndex((member) =>
        isSameMember(member, {
          id: assignment.assigneeId,
          name: assignment.assigneeName,
          email: assignment.assigneeEmail,
        }),
      );

      return {
        assignment,
        assigneeIndex,
      };
    })
    .filter((row) => row.assigneeIndex >= 0);

  if (candidates.length === 0) {
    return undefined;
  }

  const sorted = [...candidates].sort((a, b) => {
    const aToday = isSameDay(a.assignment.targetDate, todayKey) ? 1 : 0;
    const bToday = isSameDay(b.assignment.targetDate, todayKey) ? 1 : 0;
    if (aToday !== bToday) {
      return bToday - aToday;
    }

    const aTime = a.assignment.updatedAt
      ? Date.parse(a.assignment.updatedAt)
      : Number.NaN;
    const bTime = b.assignment.updatedAt
      ? Date.parse(b.assignment.updatedAt)
      : Number.NaN;
    const aValid = Number.isFinite(aTime);
    const bValid = Number.isFinite(bTime);

    if (aValid && bValid && aTime !== bTime) {
      return bTime - aTime;
    }

    return 0;
  });

  return sorted[0];
};

const sortMembersStable = (members: MemberItem[]) => {
  return [...members].sort((a, b) => {
    const aKey = `${normalizeText(a.id)}|${normalizeText(a.email)}|${normalizeText(a.name)}`;
    const bKey = `${normalizeText(b.id)}|${normalizeText(b.email)}|${normalizeText(b.name)}`;
    return aKey.localeCompare(bKey, "ja");
  });
};

const hashString = (value: string) => {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const createRng = (seed: number) => {
  let x = seed || 1;

  return () => {
    x = (Math.imul(1664525, x) + 1013904223) >>> 0;
    return x / 4294967296;
  };
};

const shuffleWithSeed = <T,>(items: T[], seedKey: string): T[] => {
  const next = [...items];
  const rng = createRng(hashString(seedKey));

  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }

  return next;
};

const fallbackAssigneeIndexForTask = (
  task: TaskItem,
  memberCount: number,
  mode: GroupItem["assignMode"],
  groupKey: string,
  todayKey: string,
) => {
  if (memberCount <= 0) {
    return 0;
  }

  const taskKey = task.id ?? `${task.name}:${task.sourceIndex}`;
  const seedKey =
    mode === "random"
      ? `${todayKey}:${groupKey}:${taskKey}`
      : `${groupKey}:${taskKey}`;

  return hashString(seedKey) % memberCount;
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
    for (const row of extractGroupsArray(payload)) {
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

      const createdAt = pickFromSources(group, base, [
        "created_at",
        "createdAt",
      ]);

      const key = id ? `id:${id}` : `name:${name}`;
      if (!map.has(key)) {
        map.set(key, {
          id,
          name,
          createdAt,
          assignMode: normalizeAssignMode(
            pickFromSources(group, base, ["assign_mode", "assignMode", "mode"]),
          ),
        });
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
    for (const row of extractMembershipsArray(payload)) {
      const membershipRoot = asRecord(row);
      const membership = unwrapEntity(membershipRoot);
      const group =
        unwrapEntity(asRecord(membershipRoot?.group)) ??
        unwrapEntity(asRecord(membership?.group));

      const groupId =
        pickFromSources(group, membership, ["id", "group_id", "groupId"]) ??
        pickFirstString(membershipRoot, ["group_id", "groupId"]);
      const groupName =
        pickFromSources(group, membership, ["name", "group_name"]) ??
        pickFirstString(membershipRoot, ["group_name", "name"]);

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
          "membershipId",
        ]),
        groupId,
        groupName,
        member: {
          id:
            pickFromSources(candidateMember, membership, [
              "id",
              "member_id",
              "user_id",
              "userId",
            ]) ??
            pickFirstString(membershipRoot, ["member_id", "user_id", "userId"]),
          name:
            pickFromSources(candidateMember, membership, [
              "name",
              "member_name",
              "user_name",
              "display_name",
              "displayName",
              "nickname",
            ]) ??
            pickFirstString(membershipRoot, [
              "name",
              "member_name",
              "user_name",
              "display_name",
              "displayName",
              "nickname",
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
    createdAt: pickFromSources(task, taskRoot, ["created_at", "createdAt"]),
    sourceIndex: index,
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

  return firstArray(
    root.assignment,
    rootData?.assignment,
    rootDataData?.assignment,
  );
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
    asRecord(membership?.user);
  const membershipMember = unwrapEntity(membershipMemberRoot);

  const evaluationArray = firstArray(
    assignmentRoot?.evaluations,
    assignment?.evaluations,
    root?.evaluations,
  );
  const evaluationRoot =
    asRecord(assignmentRoot?.evaluation) ??
    asRecord(assignment?.evaluation) ??
    asRecord(root?.evaluation) ??
    asRecord(evaluationArray[0]);
  const evaluation = unwrapEntity(evaluationRoot);

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
      pickFromSources(membership, membershipRoot, ["id", "membership_id"]),
    status: pickFromSources(assignment, assignmentRoot, ["status", "state"]),
    createdAt: pickFromSources(assignment, assignmentRoot, [
      "created_at",
      "createdAt",
      "assigned_at",
      "assignedAt",
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
      ]),
    assigneeName:
      pickFromSources(assignee, assignment, [
        "name",
      ]) ??
      pickFromSources(membershipMember, membership, [
        "name",
      ]),
    assigneeEmail:
      pickFromSources(assignee, assignment, ["email", "mail"]) ??
      pickFromSources(membershipMember, membership, ["email", "mail"]),
    targetDate: pickFromSources(assignment, assignmentRoot, [
      "date",
      "target_date",
      "assigned_date",
      "work_date",
    ]),
    updatedAt: pickFromSources(assignment, assignmentRoot, [
      "updated_at",
      "updatedAt",
      "created_at",
      "createdAt",
    ]),
    evaluationId: pickFromSources(evaluation, evaluationRoot, [
      "id",
      "evaluation_id",
    ]),
    evaluationScore: pickFromSources(evaluation, evaluationRoot, [
      "score",
      "point",
      "rating",
    ]),
    evaluationComment: pickFromSources(evaluation, evaluationRoot, [
      "comment",
      "body",
      "memo",
    ]),
    evaluatedAt: pickFromSources(evaluation, evaluationRoot, [
      "created_at",
      "createdAt",
      "evaluated_at",
      "evaluatedAt",
      "updated_at",
      "updatedAt",
    ]),
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

  return normalizeText(a.name) === normalizeText(b.name);
};

const hasMemberIdentity = (member: MemberItem) => {
  return Boolean(member.id || member.email || member.name);
};

const uniqueMembers = (members: MemberItem[]) => {
  const result: MemberItem[] = [];
  for (const member of members) {
    if (!result.some((existing) => isSameMember(existing, member))) {
      result.push(member);
    }
  }
  return result;
};

const membershipBelongsToGroup = (
  membership: MembershipItem,
  group: GroupItem,
) => {
  const membershipGroupId = normalizeText(membership.groupId);
  const groupId = normalizeText(group.id);
  if (membershipGroupId && groupId && membershipGroupId === groupId) {
    return true;
  }

  const membershipGroupName = normalizeText(membership.groupName);
  const groupName = normalizeText(group.name);
  return Boolean(
    membershipGroupName && groupName && membershipGroupName === groupName,
  );
};

const isCompletedStatus = (status?: string) => {
  const normalized = normalizeText(status);
  return (
    normalized === "completed" ||
    normalized === "complete" ||
    normalized === "done" ||
    normalized === "finished" ||
    normalized === "完了" ||
    normalized === "完了済み" ||
    normalized === "済"
  );
};

const isCompletedAssignment = (assignment: AssignmentItem) => {
  return (
    isCompletedStatus(assignment.status) ||
    Boolean((assignment.completedDate ?? "").trim())
  );
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
    name: pickFromSources(user, userRoot, [
      "name",
    ]),
    email: pickFromSources(user, userRoot, ["email", "mail", "member_email"]),
  };
};

const fetchFirstOkJson = async (
  urls: string[],
  fetchOkJson: (url: string) => Promise<unknown | null>,
) => {
  for (const url of urls) {
    const data = await fetchOkJson(url);
    if (data != null) {
      return data;
    }
  }
  return null;
};

export default async function Home() {
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

  const sessionUserId =
    (session.user as { id?: string } | undefined)?.id ??
    (session.user as { userId?: string } | undefined)?.userId;

  const [
    groupsV1,
    groupsLegacy,
    membershipsV1,
    membershipsLegacy,
    meV1,
    meLegacy,
    meById,
  ] = await Promise.all([
    fetchOkJson(`${v1Base}/groups`),
    fetchOkJson(`${base}/groups`),
    fetchOkJson(`${v1Base}/memberships`),
    fetchOkJson(`${base}/memberships`),
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

  const myMembershipIds = new Set(
    memberships
      .filter((membership) => isSameMember(membership.member, currentUser))
      .map((membership) => normalizeText(membership.id))
      .filter((value) => value.length > 0),
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

  const groupTaskRows = await Promise.all(
    groups.map(async (group) => {
      if (!group.id) {
        return {
          rows: [] as DashboardTaskRow[],
          assignedToCurrentCount: 0,
        };
      }

      const tasksPayload = await fetchFirstOkJson(
        [
          `${v1Base}/groups/${encodeURIComponent(group.id)}/tasks`,
          `${base}/groups/${encodeURIComponent(group.id)}/tasks`,
          `${v1Base}/tasks?group_id=${encodeURIComponent(group.id)}`,
          `${base}/tasks?group_id=${encodeURIComponent(group.id)}`,
        ],
        fetchOkJson,
      );

      const assignmentsPayload = await fetchFirstOkJson(
        [
          `${v1Base}/groups/${encodeURIComponent(group.id)}/assignments`,
          `${base}/groups/${encodeURIComponent(group.id)}/assignments`,
          `${v1Base}/assignments?group_id=${encodeURIComponent(group.id)}`,
          `${base}/assignments?group_id=${encodeURIComponent(group.id)}`,
        ],
        fetchOkJson,
      );

      const tasks = extractTasksArray(tasksPayload).map(normalizeTask);
      const tasksForAssignBase = sortTasksForAssignment(tasks);
      const assignments =
        extractAssignmentsArray(assignmentsPayload).map(normalizeAssignment);
      const taskById = new Map(
        tasks
          .filter((task) => task.id)
          .map((task) => [normalizeText(task.id), task]),
      );

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
      const todayKey = todayYmd();
      const sortedMembers = sortMembersStable(members);
      const membersForAssign =
        group.assignMode === "random"
          ? shuffleWithSeed(
              sortedMembers,
              `${todayKey}:members:${group.id ?? group.name}`,
            )
          : sortedMembers;
      const tasksForAssign =
        group.assignMode === "random"
          ? shuffleWithSeed(
              tasksForAssignBase,
              `${todayKey}:tasks:${group.id ?? group.name}`,
            )
          : tasksForAssignBase;
      const currentUserIndex = membersForAssign.findIndex((member) =>
        isSameMember(member, currentUser),
      );
      const groupKey = group.id ?? group.name;
      const assignedToCurrentCount =
        currentUserIndex < 0
          ? 0
          : tasksForAssign.reduce((count, task) => {
              const selected = selectLatestAssignmentForTask(
                task,
                assignments,
                membersForAssign,
                todayKey,
              );
              const fallbackAssigneeIndex = fallbackAssigneeIndexForTask(
                task,
                membersForAssign.length,
                group.assignMode,
                groupKey,
                todayKey,
              );
              const finalAssigneeIndex =
                selected?.assigneeIndex ?? fallbackAssigneeIndex;
              return finalAssigneeIndex === currentUserIndex
                ? count + 1
                : count;
            }, 0);

      const groupMemberships = memberships.filter((membership) =>
        membershipBelongsToGroup(membership, group),
      );
      const memberByMembershipId = new Map(
        groupMemberships
          .filter((membership) => membership.id)
          .map((membership) => [
            normalizeText(membership.id),
            membership.member,
          ]),
      );
      const memberByUserId = new Map(
        groupMemberships
          .filter((membership) => membership.member.id)
          .map((membership) => [
            normalizeText(membership.member.id),
            membership.member,
          ]),
      );

      const rows = assignments.map((assignment): DashboardTaskRow => {
        const memberFromMembership = assignment.membershipId
          ? (memberByMembershipId.get(normalizeText(assignment.membershipId)) ??
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

        const task = taskById.get(normalizeText(assignment.taskId)) ?? {
          id: assignment.taskId,
          name: assignment.taskName ?? "タスク",
          point: assignment.taskPoint,
          description: assignment.taskDescription,
          sourceIndex: -1,
        };

        return {
          group,
          assignment,
          task,
          assignee,
        };
      });

      return {
        rows,
        assignedToCurrentCount,
      };
    }),
  );

  const allRows = groupTaskRows.flatMap((group) => group.rows);
  const totalAssigned = groupTaskRows.reduce(
    (sum, group) => sum + group.assignedToCurrentCount,
    0,
  );

  const myRows = allRows.filter(({ assignment, assignee }) => {
    const membershipId = normalizeText(assignment.membershipId);
    if (membershipId && myMembershipIds.has(membershipId)) {
      return true;
    }

    const assigneeId = normalizeText(assignment.assigneeId ?? assignee.id);
    if (assigneeId && selfUserIds.has(assigneeId)) {
      return true;
    }

    const assigneeEmail = normalizeText(
      assignment.assigneeEmail ?? assignee.email,
    );
    if (assigneeEmail && selfEmails.has(assigneeEmail)) {
      return true;
    }

    return isSameMember(assignee, currentUser);
  });

  const recentAssignedTasks = [...myRows]
    .sort((a, b) => {
      const bTime = Math.max(
        toTimestamp(b.assignment.createdAt),
        toTimestamp(b.task.createdAt),
      );
      const aTime = Math.max(
        toTimestamp(a.assignment.createdAt),
        toTimestamp(a.task.createdAt),
      );
      return bTime - aTime;
    })
    .slice(0, 8);

  const evaluatedMyExecutedTasks = [...myRows]
    .filter(({ assignment }) => {
      const completedBy = normalizeText(assignment.completedByUserId);
      const executedByMe = completedBy
        ? selfUserIds.has(completedBy)
        : isCompletedAssignment(assignment);
      const hasEvaluation = Boolean(
        assignment.evaluationId ||
        assignment.evaluationScore ||
        assignment.evaluationComment ||
        assignment.evaluatedAt,
      );
      return executedByMe && hasEvaluation;
    })
    .sort((a, b) => {
      const bTime = Math.max(
        toTimestamp(b.assignment.evaluatedAt),
        toTimestamp(b.assignment.completedDate),
      );
      const aTime = Math.max(
        toTimestamp(a.assignment.evaluatedAt),
        toTimestamp(a.assignment.completedDate),
      );
      return bTime - aTime;
    })
    .slice(0, 8);

  const recentGroups = [...groups]
    .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))
    .slice(0, 4)
    .map((group) => ({
      group,
      members: uniqueMembers(
        memberships
          .filter((membership) => membershipBelongsToGroup(membership, group))
          .map((membership) => membership.member),
      ),
    }));

  const totalMine = totalAssigned;
  const completedMine = myRows.filter(({ assignment }) =>
    isCompletedAssignment(assignment),
  ).length;
  const inProgressMine = myRows.filter(({ assignment }) => {
    const status = normalizeText(assignment.status);
    return (
      !isCompletedAssignment(assignment) &&
      (status === "in_progress" ||
        status === "in progress" ||
        status === "doing" ||
        status === "進行中")
    );
  }).length;
  const todoMine = Math.max(0, totalMine - completedMine - inProgressMine);
  const completionRate =
    totalMine > 0 ? Math.round((completedMine / totalMine) * 100) : 0;

  return (
    <div className="space-y-8 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            KajiShare
          </h1>
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
          <p className="text-xs text-slate-500">未着手</p>
          <p className="mt-2 text-3xl font-bold text-amber-600">{todoMine}</p>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
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
            { label: "未着手", value: todoMine, color: "bg-amber-500" },
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

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-5">
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
                      members.slice(0, 8).map((member, index) => (
                        <span
                          key={`${group.id ?? group.name}-${member.id ?? member.email ?? index}`}
                          className="rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800"
                        >
                          {member.name ?? member.email ?? member.id ?? "member"}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-lg font-bold">
            最近自分に割り当てられたタスク
          </h2>
          {recentAssignedTasks.length === 0 ? (
            <p className="text-sm text-slate-500">担当タスクはありません。</p>
          ) : (
            <div className="space-y-3">
              {recentAssignedTasks.map(({ group, assignment, task }, index) => (
                <div
                  key={
                    assignment.id ??
                    `${group.id ?? group.name}-${task.id ?? index}`
                  }
                  className="rounded-lg border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{task.name}</p>
                    <span className="text-xs text-slate-500">{group.name}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    status: {assignment.status ?? "未設定"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card p-5 lg:col-span-2">
          <h2 className="mb-4 text-lg font-bold">
            評価された自分が実行したタスク
          </h2>
          {evaluatedMyExecutedTasks.length === 0 ? (
            <p className="text-sm text-slate-500">
              まだ評価済みタスクはありません。
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {evaluatedMyExecutedTasks.map(
                ({ group, assignment, task }, index) => (
                  <div
                    key={
                      assignment.evaluationId ??
                      assignment.id ??
                      `${task.id ?? "task"}-${index}`
                    }
                    className="rounded-lg border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{task.name}</p>
                      <span className="text-xs text-slate-500">
                        {group.name}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      評価: {assignment.evaluationScore ?? "-"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {assignment.evaluationComment ?? "コメントなし"}
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
