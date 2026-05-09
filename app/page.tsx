import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  GUEST_EXPIRED_REDIRECT_PATH,
  isGuestSessionExpiredStatus,
  isGuestSessionUser,
} from "@/lib/guest-session";

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
  isRecurring?: boolean;
  sourceIndex: number;
};

type RecurringTaskItem = {
  id?: string;
  name: string;
  point?: string;
  description?: string;
  scheduleType: "weekly" | "biweekly" | "";
  dayOfWeek?: string;
  startsOn?: string;
  active: boolean;
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

const normalizeText = (value?: string) => (value ?? "").trim().toLowerCase();

const APP_TIME_ZONE = process.env.APP_TIME_ZONE ?? "Asia/Tokyo";
const RECENT_EVALUATED_TASK_LIMIT = 6;

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

const pickRelationshipId = (
  source: AnyRecord | null,
  relationshipNames: string[],
): string | undefined => {
  const relationships = asRecord(source?.relationships);
  if (!relationships) {
    return undefined;
  }

  for (const relationshipName of relationshipNames) {
    const relationship = asRecord(relationships[relationshipName]);
    if (!relationship) {
      continue;
    }

    const relationshipData = relationship.data;
    if (Array.isArray(relationshipData)) {
      for (const item of relationshipData) {
        const id = pickFirstString(asRecord(item), ["id"]);
        if (id) {
          return id;
        }
      }
      continue;
    }

    const id = pickFirstString(asRecord(relationshipData), ["id"]);
    if (id) {
      return id;
    }
  }

  return undefined;
};

const dataArray = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  const root = asRecord(payload);
  return Array.isArray(root?.data) ? root.data : [];
};

const topLevelArray = (payload: unknown): unknown[] =>
  Array.isArray(payload) ? payload : [];

const toTimestamp = (value?: string) => {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

const toNumericId = (value?: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

const todayYmd = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: APP_TIME_ZONE,
  }).format(new Date());

const normalizeAssignMode = (
  value?: string,
): "manual" | "random" | "balanced" | "" => {
  return value === "manual" || value === "random" || value === "balanced"
    ? value
    : "";
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

const taskAssignmentKey = (task: TaskItem) =>
  normalizeText(task.id ?? `${task.name}:${task.sourceIndex}`);

const extractGroupsArray = (payload: unknown): unknown[] => {
  return dataArray(payload);
};

const normalizeGroups = (payloads: unknown[]): GroupItem[] => {
  const map = new Map<string, GroupItem>();

  for (const payload of payloads) {
    for (const row of extractGroupsArray(payload)) {
      const root = asRecord(row);
      const group = unwrapEntity(root);
      const id = pickFirstString(group, ["id"]);
      const name = pickFirstString(group, ["name"]);

      if (!name) {
        continue;
      }

      const key = id ? `id:${id}` : `name:${name}`;
      if (!map.has(key)) {
        map.set(key, {
          id,
          name,
          createdAt: pickFirstString(group, ["created_at"]),
          assignMode: normalizeAssignMode(
            pickFirstString(group, ["assign_mode"]),
          ),
        });
      }
    }
  }

  return Array.from(map.values());
};

const extractMembershipsArray = (payload: unknown): unknown[] => {
  return dataArray(payload);
};

const normalizeMemberships = (payloads: unknown[]): MembershipItem[] => {
  const normalized: MembershipItem[] = [];

  for (const payload of payloads) {
    for (const row of extractMembershipsArray(payload)) {
      const membershipRoot = asRecord(row);
      const membership = unwrapEntity(membershipRoot);

      normalized.push({
        id: pickFirstString(membershipRoot, ["id"]),
        groupId:
          pickFirstString(membership, ["group_id"]) ??
          pickRelationshipId(membershipRoot, ["group"]),
        member: {
          id:
            pickRelationshipId(membershipRoot, ["user"]) ??
            pickFirstString(membership, ["user_id"]),
          name: pickFirstString(membership, ["user_name"]),
        },
      });
    }
  }

  return normalized;
};

const extractTasksArray = (payload: unknown): unknown[] => {
  return dataArray(payload);
};

const extractRecurringTasksArray = (payload: unknown): unknown[] => {
  return topLevelArray(payload);
};

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

const normalizeRecurringTask = (
  row: unknown,
  index: number,
): RecurringTaskItem => {
  const recurring = asRecord(row);
  const scheduleTypeRaw = pickFirstString(recurring, ["schedule_type"]) ?? "";

  const scheduleType: RecurringTaskItem["scheduleType"] =
    scheduleTypeRaw === "weekly"
      ? "weekly"
      : scheduleTypeRaw === "biweekly"
        ? "biweekly"
        : "";

  return {
    id: pickFirstString(recurring, ["id"]),
    name: pickFirstString(recurring, ["name"]) ?? `周期タスク ${index + 1}`,
    point: pickFirstString(recurring, ["point"]),
    description: pickFirstString(recurring, ["description"]),
    scheduleType,
    dayOfWeek: pickFirstString(recurring, ["day_of_week"]),
    startsOn: pickFirstString(recurring, ["starts_on"]),
    active: recurring?.active === true,
    sourceIndex: index,
  };
};

const dateFromYmd = (value?: string) => {
  if (!value) {
    return undefined;
  }

  const ymd = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    return undefined;
  }

  const date = new Date(`${ymd}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) {
    return undefined;
  }

  return date;
};

const parseRecurringDayOfWeek = (value?: string) => {
  if (!value) {
    return undefined;
  }

  const day = Number(value);
  return Number.isInteger(day) && day >= 0 && day <= 6 ? day : undefined;
};

const recurringTaskRunsOnDate = (task: RecurringTaskItem, ymd: string) => {
  if (!task.active || !task.startsOn) {
    return false;
  }

  const targetDate = dateFromYmd(ymd);
  const startDate = dateFromYmd(task.startsOn);
  if (!targetDate || !startDate) {
    return false;
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor(
    (targetDate.getTime() - startDate.getTime()) / msPerDay,
  );

  if (diffDays < 0) {
    return false;
  }

  if (diffDays === 0) {
    return true;
  }

  if (task.scheduleType === "weekly") {
    const day = parseRecurringDayOfWeek(task.dayOfWeek);
    if (day == null) {
      return diffDays % 7 === 0;
    }
    return targetDate.getUTCDay() === day;
  }

  if (task.scheduleType === "biweekly") {
    return diffDays % 14 === 0;
  }

  return false;
};

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

const extractAssignmentsArray = (payload: unknown): unknown[] => {
  return dataArray(payload);
};

const normalizeAssignment = (row: unknown): AssignmentItem => {
  const resource = asRecord(row);
  const assignment = unwrapEntity(resource);

  return {
    id: pickFirstString(resource, ["id"]),
    groupId: pickFirstString(assignment, ["group_id"]),
    taskId:
      pickRelationshipId(resource, ["task"]) ??
      pickFirstString(assignment, ["task_id"]),
    taskName: pickFirstString(assignment, ["task_name"]),
    membershipId:
      pickRelationshipId(resource, ["membership"]) ??
      pickFirstString(assignment, ["membership_id"]),
    status: pickFirstString(assignment, ["status"]),
    createdAt: pickFirstString(assignment, ["assigned_at"]),
    completedDate: pickFirstString(assignment, ["completed_date"]),
    completedByUserId: pickFirstString(assignment, ["completed_by_user_id"]),
    assigneeId: pickFirstString(assignment, ["assigned_to_id"]),
    assigneeName: pickFirstString(assignment, ["assigned_to_name"]),
    targetDate: pickFirstString(assignment, ["due_date"]),
    updatedAt: pickFirstString(assignment, ["updated_at", "assigned_at"]),
  };
};

const extractEvaluationsArray = (payload: unknown): unknown[] => {
  return dataArray(payload);
};

const uniqueAssignmentsByKey = (assignments: AssignmentItem[]) => {
  const map = new Map<string, AssignmentItem>();

  for (const assignment of assignments) {
    const key =
      normalizeText(assignment.id) ||
      [
        normalizeText(assignment.groupId),
        normalizeText(assignment.taskId),
        normalizeText(assignment.membershipId),
        normalizeText(assignment.assigneeId),
        normalizeText(assignment.createdAt),
        normalizeText(assignment.status),
      ].join("|");

    if (!key) {
      continue;
    }

    if (!map.has(key)) {
      map.set(key, assignment);
    }
  }

  return Array.from(map.values());
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
  return normalized === "completed";
};

const isInProgressStatus = (status?: string) => {
  const normalized = normalizeText(status);
  return normalized === "in_progress";
};

const isNotStartedStatus = (status?: string) => {
  const normalized = normalizeText(status);
  return normalized === "着手前" || normalized === "not_started";
};

const isCompletedAssignment = (assignment: AssignmentItem) => {
  return (
    isCompletedStatus(assignment.status) ||
    Boolean((assignment.completedDate ?? "").trim())
  );
};

const toGroupKey = (groupId?: string, groupName?: string) => {
  const normalizedId = normalizeText(groupId);
  if (normalizedId) {
    return `id:${normalizedId}`;
  }
  return `name:${normalizeText(groupName)}`;
};

const isSameTask = (a: TaskItem, b: TaskItem) => {
  const aId = normalizeText(a.id);
  const bId = normalizeText(b.id);
  if (aId && bId) {
    return aId === bId;
  }

  const aName = normalizeText(a.name);
  const bName = normalizeText(b.name);
  return Boolean(aName && bName && aName === bName);
};

const getTaskSummary = (
  task: TaskItem,
  assignmentsByTaskId: Map<string, AssignmentItem[]>,
): TaskStatusCounts => {
  const taskIdKey = normalizeText(task.id);
  const taskNameKey = normalizeText(task.name);
  const assignments =
    (taskIdKey ? assignmentsByTaskId.get(`id:${taskIdKey}`) : undefined) ??
    (taskNameKey
      ? assignmentsByTaskId.get(`name:${taskNameKey}`)
      : undefined) ??
    [];

  return assignments.reduce(
    (sum, assignment) => {
      if (isCompletedAssignment(assignment)) {
        return { ...sum, completed: sum.completed + 1 };
      }
      if (isInProgressStatus(assignment.status)) {
        return { ...sum, inProgress: sum.inProgress + 1 };
      }
      return { ...sum, notStarted: sum.notStarted + 1 };
    },
    { notStarted: 0, inProgress: 0, completed: 0 },
  );
};

const getMyAssignment = (
  task: TaskItem,
  myMembershipId: string | undefined,
  assignmentsByTaskId: Map<string, AssignmentItem[]>,
): AssignmentItem | undefined => {
  const taskIdKey = normalizeText(task.id);
  const taskNameKey = normalizeText(task.name);
  const membershipKey = normalizeText(myMembershipId);

  if (!membershipKey) {
    return undefined;
  }

  const assignments =
    (taskIdKey ? assignmentsByTaskId.get(`id:${taskIdKey}`) : undefined) ??
    (taskNameKey
      ? assignmentsByTaskId.get(`name:${taskNameKey}`)
      : undefined) ??
    [];

  const mine = assignments.filter(
    (assignment) => normalizeText(assignment.membershipId) === membershipKey,
  );

  if (mine.length === 0) {
    return undefined;
  }

  return [...mine].sort((a, b) => {
    const bTime = Math.max(toTimestamp(b.updatedAt), toTimestamp(b.createdAt));
    const aTime = Math.max(toTimestamp(a.updatedAt), toTimestamp(a.createdAt));
    return bTime - aTime;
  })[0];
};

const getMyTaskStatus = (
  task: TaskItem,
  myMembershipId: string | undefined,
  assignmentsByTaskId: Map<string, AssignmentItem[]>,
): MyTaskStatus => {
  const myAssignment = getMyAssignment(
    task,
    myMembershipId,
    assignmentsByTaskId,
  );

  if (!myAssignment) {
    return "未アサイン";
  }
  if (isCompletedAssignment(myAssignment)) {
    return "完了";
  }
  if (isInProgressStatus(myAssignment.status)) {
    return "進行中";
  }
  if (isNotStartedStatus(myAssignment.status)) {
    return "着手前";
  }
  return "着手前";
};

const extractCurrentUserIdentity = (payload: unknown): MemberItem => {
  const root = asRecord(payload);
  const user = unwrapEntity(asRecord(root?.data) ?? root);

  return {
    id:
      pickFirstString(asRecord(root?.data), ["id"]) ??
      pickFirstString(user, ["id"]),
    name: pickFirstString(user, ["name"]),
    email: pickFirstString(user, ["email"]),
  };
};

export default async function Home() {
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

  const [groupsV1, membershipsV1, meV1, evaluationsV1] = await Promise.all([
    fetchOkJson(`${v1Base}/groups`),
    fetchOkJson(`${v1Base}/memberships`),
    fetchOkJson(`${v1Base}/users/me`),
    fetchOkJson(`${v1Base}/evaluations`),
  ]);

  const groups = normalizeGroups([groupsV1]);
  const memberships = normalizeMemberships([membershipsV1]);

  const meFromV1 = extractCurrentUserIdentity(meV1);
  const currentUserFromApi = meFromV1;

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

  const membershipsByGroupId = memberships.reduce((map, membership) => {
    const key = toGroupKey(membership.groupId, membership.groupName);
    const current = map.get(key) ?? [];
    current.push(membership);
    map.set(key, current);
    return map;
  }, new Map<string, MembershipItem[]>());

  const myMembershipIdByGroup = new Map<string, string>();
  membershipsByGroupId.forEach((groupMemberships, groupKey) => {
    const mine = groupMemberships.find((membership: MembershipItem) =>
      isSameMember(membership.member, currentUser),
    );
    const membershipId = normalizeText(mine?.id);
    if (membershipId) {
      myMembershipIdByGroup.set(groupKey, membershipId);
    }
  });

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

  const groupTaskRows: {
    rows: DashboardTaskRow[];
    assignedToCurrentCount: number;
    taskCards: TaskCardItem[];
  }[] = await Promise.all(
    groups.map(async (group) => {
      if (!group.id) {
        return {
          rows: [] as DashboardTaskRow[],
          assignedToCurrentCount: 0,
          taskCards: [] as TaskCardItem[],
        };
      }

      const groupId = encodeURIComponent(group.id);
      const [tasksPayload, recurringPayload, assignmentsPayload] =
        await Promise.all([
          fetchOkJson(`${v1Base}/groups/${groupId}/tasks`),
          fetchOkJson(`${v1Base}/groups/${groupId}/recurring_tasks`),
          fetchOkJson(`${v1Base}/groups/${groupId}/assignments`),
        ]);

      const taskRows = extractTasksArray(tasksPayload);
      const todayKey = todayYmd();
      const normalTasks = taskRows.map(normalizeTask);
      const recurringTasks = extractRecurringTasksArray(recurringPayload)
        .map(normalizeRecurringTask)
        .filter((task) => recurringTaskRunsOnDate(task, todayKey))
        .map((task, index) =>
          recurringTaskToTask(task, normalTasks.length + index),
        );
      const tasks = sortTasksForAssignment([...normalTasks, ...recurringTasks]);

      const tasksForAssignBase = sortTasksForAssignment(tasks);
      const assignments = uniqueAssignmentsByKey([
        ...extractAssignmentsArray(assignmentsPayload).map(normalizeAssignment),
      ]);
      const taskById = new Map(
        tasks
          .filter((task) => task.id)
          .map((task) => [normalizeText(task.id), task]),
      );

      const assignmentsByTaskId = assignments.reduce((map, assignment) => {
        const idKey = normalizeText(assignment.taskId);
        const nameKey = normalizeText(assignment.taskName);
        if (!idKey && !nameKey) {
          return map;
        }
        if (idKey) {
          const idBucket = map.get(`id:${idKey}`) ?? [];
          idBucket.push(assignment);
          map.set(`id:${idKey}`, idBucket);
        }
        if (nameKey) {
          const nameBucket = map.get(`name:${nameKey}`) ?? [];
          nameBucket.push(assignment);
          map.set(`name:${nameKey}`, nameBucket);
        }
        return map;
      }, new Map<string, AssignmentItem[]>());

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
      const assignedTaskKeys = new Set<string>();
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
              if (finalAssigneeIndex === currentUserIndex) {
                const key = taskAssignmentKey(task);
                if (key) {
                  assignedTaskKeys.add(key);
                }
                return count + 1;
              }
              return count;
            }, 0);

      const groupMemberships = memberships.filter((membership) =>
        membershipBelongsToGroup(membership, group),
      );
      const groupLookupKey = toGroupKey(group.id, group.name);
      const myMembershipIdInGroup = myMembershipIdByGroup.get(groupLookupKey);
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

      const taskCandidates = [...tasks];
      for (const row of rows) {
        if (
          !taskCandidates.some((candidate) => isSameTask(candidate, row.task))
        ) {
          taskCandidates.push(row.task);
        }
      }

      const taskCards: TaskCardItem[] = taskCandidates.map((task) => {
        const summaryFromNormalized = getTaskSummary(task, assignmentsByTaskId);
        const rowsForTask = rows.filter((row) => isSameTask(row.task, task));
        const summaryFromRows = rowsForTask.reduce(
          (sum, row) => {
            if (isCompletedAssignment(row.assignment)) {
              return { ...sum, completed: sum.completed + 1 };
            }
            if (isInProgressStatus(row.assignment.status)) {
              return { ...sum, inProgress: sum.inProgress + 1 };
            }
            return { ...sum, notStarted: sum.notStarted + 1 };
          },
          { notStarted: 0, inProgress: 0, completed: 0 },
        );

        const summaryHasValue =
          summaryFromNormalized.notStarted > 0 ||
          summaryFromNormalized.inProgress > 0 ||
          summaryFromNormalized.completed > 0;

        const rowsHasValue =
          summaryFromRows.notStarted > 0 ||
          summaryFromRows.inProgress > 0 ||
          summaryFromRows.completed > 0;

        const summary = summaryHasValue
          ? summaryFromNormalized
          : summaryFromRows;

        const myAssignmentFromNormalized = getMyAssignment(
          task,
          myMembershipIdInGroup,
          assignmentsByTaskId,
        );
        const myMembershipKey = normalizeText(myMembershipIdInGroup);
        const myAssignmentFromRows = myMembershipKey
          ? rowsForTask
              .filter(
                ({ assignment, assignee }) =>
                  normalizeText(assignment.membershipId) === myMembershipKey ||
                  (normalizeText(assignment.assigneeId ?? assignee.id) !== "" &&
                    selfUserIds.has(
                      normalizeText(assignment.assigneeId ?? assignee.id),
                    )) ||
                  (normalizeText(assignment.assigneeEmail ?? assignee.email) !==
                    "" &&
                    selfEmails.has(
                      normalizeText(assignment.assigneeEmail ?? assignee.email),
                    )) ||
                  isSameMember(assignee, currentUser),
              )
              .map((row) => row.assignment)
              .sort((a, b) => {
                const bTime = Math.max(
                  toTimestamp(b.updatedAt),
                  toTimestamp(b.createdAt),
                );
                const aTime = Math.max(
                  toTimestamp(a.updatedAt),
                  toTimestamp(a.createdAt),
                );
                return bTime - aTime;
              })[0]
          : undefined;

        const myAssignment = myAssignmentFromNormalized ?? myAssignmentFromRows;
        const isAssignedByFallback = assignedTaskKeys.has(
          taskAssignmentKey(task),
        );

        return {
          group,
          task,
          summary,
          myAssignment,
          myStatus: myAssignment
            ? isCompletedAssignment(myAssignment)
              ? "完了"
              : isInProgressStatus(myAssignment.status)
                ? "進行中"
                : "着手前"
            : isAssignedByFallback
              ? "着手前"
              : getMyTaskStatus(
                  task,
                  myMembershipIdInGroup,
                  assignmentsByTaskId,
                ),
        };
      });

      return {
        rows,
        assignedToCurrentCount,
        taskCards,
      };
    }),
  );

  const allRows = groupTaskRows.flatMap((group) => group.rows);

  const taskCards = groupTaskRows
    .flatMap((group) => group.taskCards)
    .sort(
      (a, b) => toTimestamp(b.task.createdAt) - toTimestamp(a.task.createdAt),
    );

  const myTaskCards = taskCards.filter(
    ({ myStatus, myAssignment }) =>
      myStatus !== "未アサイン" || Boolean(myAssignment),
  );

  const totalAssigned = groupTaskRows.reduce(
    (sum, group) => sum + group.assignedToCurrentCount,
    0,
  );

  const recentAssignedTasks = [...myTaskCards]
    .sort((a, b) => {
      const bTime = Math.max(
        toTimestamp(b.myAssignment?.createdAt),
        toTimestamp(b.task.createdAt),
      );
      const aTime = Math.max(
        toTimestamp(a.myAssignment?.createdAt),
        toTimestamp(a.task.createdAt),
      );
      return bTime - aTime;
    })
    .slice(0, 5);

  const taskGroupByTaskId = new Map<
    string,
    { task: TaskItem; group: GroupItem }
  >();
  for (const row of allRows) {
    const taskIdKey = normalizeText(row.task.id);
    if (!taskIdKey || taskGroupByTaskId.has(taskIdKey)) {
      continue;
    }
    taskGroupByTaskId.set(taskIdKey, { task: row.task, group: row.group });
  }

  const currentUserIdKey = normalizeText(currentUser.id ?? sessionUserId);
  const evaluations = extractEvaluationsArray(evaluationsV1)
    .map((row) => {
      const evaluationRoot = asRecord(row);
      const evaluation = unwrapEntity(evaluationRoot);
      const assignment: AssignmentItem = {
        id: pickRelationshipId(evaluationRoot, ["assignment"]),
        taskId: pickFirstString(evaluation, ["task_id"]),
        taskName: pickFirstString(evaluation, ["assignment_task_name"]),
        status: pickFirstString(evaluation, ["assignment_status"]),
        evaluationId: pickFirstString(evaluationRoot, ["id"]),
        evaluationScore: pickFirstString(evaluation, ["score"]),
        evaluationComment: pickFirstString(evaluation, ["feedback"]),
        evaluatedAt: pickFirstString(evaluation, ["created_at"]),
      };

      return {
        assignment,
        assignmentUserId: pickFirstString(evaluation, ["evaluated_user_id"]),
        evaluatorId: pickFirstString(evaluation, ["evaluator_id"]),
      };
    })
    .filter(({ assignment, assignmentUserId, evaluatorId }) => {
      const assignmentUserKey = normalizeText(assignmentUserId);
      const evaluatorKey = normalizeText(evaluatorId);
      const statusKey = normalizeText(assignment.status);

      if (!assignment.taskId) {
        return false;
      }

      return (
        assignmentUserKey.length > 0 &&
        currentUserIdKey.length > 0 &&
        assignmentUserKey === currentUserIdKey &&
        statusKey === "completed" &&
        evaluatorKey.length > 0 &&
        evaluatorKey !== currentUserIdKey
      );
    })
    .sort((a, b) => {
      const bTime = Math.max(
        toTimestamp(b.assignment.evaluatedAt),
        toTimestamp(b.assignment.updatedAt),
      );
      const aTime = Math.max(
        toTimestamp(a.assignment.evaluatedAt),
        toTimestamp(a.assignment.updatedAt),
      );
      if (aTime !== bTime) {
        return bTime - aTime;
      }
      return (
        toNumericId(b.assignment.evaluationId) -
        toNumericId(a.assignment.evaluationId)
      );
    });

  const evaluatedMyExecutedTasks = evaluations
    .map(({ assignment }) => {
      const taskIdKey = normalizeText(assignment.taskId);
      const matched = taskGroupByTaskId.get(taskIdKey);

      const task: TaskItem = matched?.task ?? {
        id: assignment.taskId,
        name: assignment.taskName ?? "タスク",
        point: assignment.taskPoint,
        description: assignment.taskDescription,
        sourceIndex: -1,
      };

      const group: GroupItem = matched?.group ?? {
        id: assignment.groupId,
        name: "グループ",
        assignMode: "",
      };

      return {
        group,
        assignment,
        task,
      };
    })
    .slice(0, RECENT_EVALUATED_TASK_LIMIT);

  const recentGroups = [...groups]
    .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))
    .slice(0, 5)
    .map((group) => ({
      group,
      members: uniqueMembers(
        memberships
          .filter((membership) => membershipBelongsToGroup(membership, group))
          .map((membership) => membership.member),
      ),
    }));

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
