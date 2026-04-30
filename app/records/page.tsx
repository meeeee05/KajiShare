import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AssignmentStatusButton from "@/components/assignment-status-button";

type AnyRecord = Record<string, unknown>;

type GroupItem = {
  id?: string;
  name: string;
  shareKey?: string;
  assignMode: "manual" | "random" | "balanced" | "";
  balanceType: "more" | "less" | "";
};

type MemberItem = {
  id?: string;
  name?: string;
  email?: string;
};

type MembershipItem = {
  groupId?: string;
  groupName?: string;
  groupShareKey?: string;
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

type RecurringTaskItem = {
  id?: string;
  name: string;
  description?: string;
  point?: string;
  scheduleType: "weekly" | "every_n_days" | "";
  dayOfWeek?: string;
  intervalDays?: string;
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
  assigneeEmail?: string;
  targetDate?: string;
  updatedAt?: string;
};

const normalizeText = (value?: string) => (value ?? "").trim().toLowerCase();

const APP_TIME_ZONE = process.env.APP_TIME_ZONE ?? "Asia/Tokyo";

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

const normalizeBalanceType = (value?: string): "more" | "less" | "" => {
  const normalized = normalizeText(value);

  if (!normalized) {
    return "";
  }

  if (normalized.includes("more") || normalized.includes("多め")) {
    return "more";
  }
  if (normalized.includes("less") || normalized.includes("少なめ")) {
    return "less";
  }

  return "";
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
    const prev = map.get(key);

    if (!prev) {
      map.set(key, group);
      return;
    }

    map.set(key, {
      ...prev,
      ...group,
      assignMode: group.assignMode || prev.assignMode,
      balanceType: group.balanceType || prev.balanceType,
    });
  };

  for (const payload of payloads) {
    const rows = extractGroupsArray(payload);

    for (const row of rows) {
      const root = asRecord(row);
      const source = asRecord(root?.group) ?? root;
      const group = unwrapEntity(source);
      const baseObj = unwrapEntity(root);

      const id = pickFromSources(group, baseObj, ["id", "group_id", "groupId"]);
      const name =
        pickFromSources(group, baseObj, ["name"]) ??
        pickFromSources(source, root, ["name"]);
      const shareKey = pickFromSources(group, baseObj, [
        "share_key",
        "shareKey",
      ]);

      if (!name) {
        continue;
      }

      const assignMode = normalizeAssignMode(
        pickFromSources(group, baseObj, ["assign_mode"]),
      );
      const balanceType = normalizeBalanceType(
        pickFromSources(group, baseObj, ["balance_type"]),
      );

      put({
        id,
        name,
        shareKey,
        assignMode,
        balanceType,
      });
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
        pickFirstString(membershipRoot, ["group_id", "groupId", "gid"]);
      const groupName = pickFromSources(group, membership, [
        "name",
        "group_name",
      ]);
      const groupShareKey = pickFromSources(group, membership, [
        "share_key",
        "shareKey",
      ]);

      const candidateMember =
        unwrapEntity(asRecord(membershipRoot?.member)) ??
        unwrapEntity(asRecord(membershipRoot?.user)) ??
        unwrapEntity(asRecord(membership?.member)) ??
        unwrapEntity(asRecord(membership?.user)) ??
        unwrapEntity(asRecord(membershipRoot?.account)) ??
        unwrapEntity(asRecord(membership?.account));

      const member: MemberItem = {
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
      };

      normalized.push({ groupId, groupName, groupShareKey, member });
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

const normalizeTask = (row: unknown, index: number): TaskItem => {
  const root = asRecord(row);
  const taskRoot = asRecord(root?.task) ?? root;
  const task = unwrapEntity(taskRoot);
  const assignmentRoot = asRecord(root?.assignment);
  const assignment = unwrapEntity(assignmentRoot);

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
    assignmentId: pickFromSources(assignment, assignmentRoot, [
      "id",
      "assignment_id",
      "assignmentId",
    ]),
    assignmentStatus: pickFromSources(assignment, assignmentRoot, [
      "status",
      "state",
      "comment",
    ]),
    sourceIndex: index,
  };
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

  const scheduleTypeNormalized = normalizeText(scheduleTypeRaw);
  const scheduleType: RecurringTaskItem["scheduleType"] =
    scheduleTypeNormalized === "weekly" ||
    scheduleTypeNormalized === "week" ||
    scheduleTypeNormalized === "every_week"
      ? "weekly"
      : scheduleTypeNormalized === "every_n_days" ||
          scheduleTypeNormalized === "everyndays"
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
    description: pickFromSources(recurring, recurringRoot, [
      "description",
      "detail",
      "memo",
    ]),
    point: pickFromSources(recurring, recurringRoot, [
      "point",
      "score",
      "value",
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

  const normalized = normalizeText(value).replace("曜日", "");

  const numeric = Number(normalized);
  if (Number.isInteger(numeric)) {
    if (numeric >= 0 && numeric <= 6) {
      return numeric;
    }

    if (numeric >= 1 && numeric <= 7) {
      return numeric % 7;
    }
  }

  const map: Record<string, number> = {
    sun: 0,
    sunday: 0,
    日: 0,
    mon: 1,
    monday: 1,
    月: 1,
    tue: 2,
    tuesday: 2,
    火: 2,
    wed: 3,
    wednesday: 3,
    水: 3,
    thu: 4,
    thursday: 4,
    木: 4,
    fri: 5,
    friday: 5,
    金: 5,
    sat: 6,
    saturday: 6,
    土: 6,
  };

  return map[normalized];
};

const recurringTaskRunsOnDate = (task: RecurringTaskItem, ymd: string) => {
  if (!task.active) {
    return false;
  }

  if (!task.startsOn) {
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

  // A recurring task should always run on its start date.
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

  if (task.scheduleType === "every_n_days") {
    const interval = Number(task.intervalDays);
    if (!Number.isInteger(interval) || interval <= 0) {
      return false;
    }

    return diffDays % interval === 0;
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
};

const normalizeAssignment = (row: unknown): AssignmentItem => {
  const root = asRecord(row);
  const assignmentRoot = asRecord(root?.assignment) ?? root;
  const assignment = unwrapEntity(assignmentRoot);

  const assigneeRoot =
    asRecord(assignmentRoot?.assignee) ??
    asRecord(assignmentRoot?.user) ??
    asRecord(assignment?.assignee) ??
    asRecord(assignment?.user);
  const assignee = unwrapEntity(assigneeRoot);

  return {
    id: pickFromSources(assignment, assignmentRoot, [
      "id",
      "assignment_id",
      "assignmentId",
    ]),
    taskId:
      pickFromSources(assignment, assignmentRoot, ["task_id", "taskId"]) ??
      pickFirstString(root, ["task_id", "taskId"]),
    status: pickFromSources(assignment, assignmentRoot, [
      "status",
      "state",
      "comment",
    ]),
    assigneeId:
      pickFromSources(assignee, assignment, ["id", "user_id", "userId"]) ??
      pickFromSources(assigneeRoot, assignmentRoot, [
        "assignee_id",
        "member_id",
      ]),
    assigneeName: pickFromSources(assignee, assignment, ["name", "user_name"]),
    assigneeEmail: pickFromSources(assignee, assignment, ["email", "mail"]),
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
  };
};

const isSameDay = (isoLike?: string, ymd?: string) => {
  if (!isoLike || !ymd) {
    return false;
  }
  return isoLike.slice(0, 10) === ymd;
};

const assignmentBelongsToCurrentUser = (
  assignment: AssignmentItem,
  currentUser: MemberItem,
) => {
  const assignmentUser: MemberItem = {
    id: assignment.assigneeId,
    name: assignment.assigneeName,
    email: assignment.assigneeEmail,
  };

  return isSameMember(assignmentUser, currentUser);
};

const mergeAssignmentToTask = (
  task: TaskItem,
  assignments: AssignmentItem[],
  currentUser: MemberItem,
  todayKey: string,
) => {
  const taskIdNormalized = normalizeText(task.id);
  if (!taskIdNormalized) {
    return task;
  }

  const sameTaskAssignments = assignments.filter((assignment) => {
    return normalizeText(assignment.taskId) === taskIdNormalized;
  });

  const candidates =
    sameTaskAssignments.filter((assignment) =>
      assignmentBelongsToCurrentUser(assignment, currentUser),
    ).length > 0
      ? sameTaskAssignments.filter((assignment) =>
          assignmentBelongsToCurrentUser(assignment, currentUser),
        )
      : sameTaskAssignments;

  if (candidates.length === 0) {
    return task;
  }

  const sorted = [...candidates].sort((a, b) => {
    const aToday = isSameDay(a.targetDate, todayKey) ? 1 : 0;
    const bToday = isSameDay(b.targetDate, todayKey) ? 1 : 0;
    if (aToday !== bToday) {
      return bToday - aToday;
    }

    const aTime = a.updatedAt ? Date.parse(a.updatedAt) : Number.NaN;
    const bTime = b.updatedAt ? Date.parse(b.updatedAt) : Number.NaN;
    const aValid = Number.isFinite(aTime);
    const bValid = Number.isFinite(bTime);

    if (aValid && bValid && aTime !== bTime) {
      return bTime - aTime;
    }

    return 0;
  });

  const latest = sorted[0];

  return {
    ...task,
    assignmentId: latest.id ?? task.assignmentId,
    assignmentStatus: latest.status ?? task.assignmentStatus,
  };
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

  const membershipShare = normalizeText(membership.groupShareKey);
  const groupShare = normalizeText(group.shareKey);
  if (membershipShare && groupShare && membershipShare === groupShare) {
    return true;
  }

  const membershipName = normalizeText(membership.groupName);
  const groupName = normalizeText(group.name);
  if (membershipName && groupName && membershipName === groupName) {
    return true;
  }

  return false;
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

const taskPointValue = (task: TaskItem) => {
  const parsed = Number(task.point);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, parsed);
};

const assignTasksBalancedByPoints = (
  tasks: TaskItem[],
  memberCount: number,
  currentUserIndex: number,
  balanceType: "more" | "less" | "",
) => {
  if (memberCount <= 0) {
    return [] as number[];
  }

  const assignment = new Array<number>(tasks.length).fill(0);
  const totals = new Array<number>(memberCount).fill(0);
  const buckets: number[][] = new Array(memberCount)
    .fill(null)
    .map(() => [] as number[]);

  const sortedTaskIndices = Array.from(
    { length: tasks.length },
    (_, i) => i,
  ).sort((a, b) => {
    const diff = taskPointValue(tasks[b]) - taskPointValue(tasks[a]);
    if (diff !== 0) {
      return diff;
    }
    return tasks[a].sourceIndex - tasks[b].sourceIndex;
  });

  for (const taskIndex of sortedTaskIndices) {
    let assigneeIndex = 0;

    for (let memberIndex = 1; memberIndex < memberCount; memberIndex += 1) {
      const betterTotal = totals[memberIndex] < totals[assigneeIndex];
      const tieTotal = totals[memberIndex] === totals[assigneeIndex];
      const betterCount =
        tieTotal && buckets[memberIndex].length < buckets[assigneeIndex].length;

      if (betterTotal || betterCount) {
        assigneeIndex = memberIndex;
      }
    }

    assignment[taskIndex] = assigneeIndex;
    buckets[assigneeIndex].push(taskIndex);
    totals[assigneeIndex] += taskPointValue(tasks[taskIndex]);
  }

  if (
    memberCount === 1 ||
    currentUserIndex < 0 ||
    currentUserIndex >= memberCount ||
    balanceType === ""
  ) {
    return assignment;
  }

  const epsilon = 1e-9;
  const relationSatisfied = () => {
    const current = totals[currentUserIndex];
    if (balanceType === "more") {
      const maxOther = totals.reduce((max, value, index) => {
        if (index === currentUserIndex) {
          return max;
        }
        return Math.max(max, value);
      }, -Infinity);
      return current > maxOther + epsilon;
    }

    const minOther = totals.reduce((min, value, index) => {
      if (index === currentUserIndex) {
        return min;
      }
      return Math.min(min, value);
    }, Infinity);
    return current + epsilon < minOther;
  };

  const moveTask = (taskIndex: number, fromIndex: number, toIndex: number) => {
    const fromBucket = buckets[fromIndex];
    const at = fromBucket.indexOf(taskIndex);
    if (at < 0) {
      return false;
    }

    fromBucket.splice(at, 1);
    buckets[toIndex].push(taskIndex);
    assignment[taskIndex] = toIndex;

    const point = taskPointValue(tasks[taskIndex]);
    totals[fromIndex] -= point;
    totals[toIndex] += point;
    return true;
  };

  let guard = tasks.length * memberCount * 4;

  while (!relationSatisfied() && guard > 0) {
    guard -= 1;

    if (balanceType === "more") {
      let donorIndex = -1;

      for (let index = 0; index < memberCount; index += 1) {
        if (index === currentUserIndex) {
          continue;
        }
        if (
          donorIndex < 0 ||
          totals[index] > totals[donorIndex] ||
          (totals[index] === totals[donorIndex] &&
            buckets[index].length > buckets[donorIndex].length)
        ) {
          donorIndex = index;
        }
      }

      if (donorIndex < 0 || buckets[donorIndex].length === 0) {
        break;
      }

      const candidate = [...buckets[donorIndex]].sort(
        (a, b) => taskPointValue(tasks[b]) - taskPointValue(tasks[a]),
      )[0];

      if (candidate === undefined || taskPointValue(tasks[candidate]) <= 0) {
        break;
      }

      if (!moveTask(candidate, donorIndex, currentUserIndex)) {
        break;
      }
    } else {
      if (buckets[currentUserIndex].length === 0) {
        break;
      }

      let recipientIndex = -1;

      for (let index = 0; index < memberCount; index += 1) {
        if (index === currentUserIndex) {
          continue;
        }
        if (
          recipientIndex < 0 ||
          totals[index] < totals[recipientIndex] ||
          (totals[index] === totals[recipientIndex] &&
            buckets[index].length < buckets[recipientIndex].length)
        ) {
          recipientIndex = index;
        }
      }

      if (recipientIndex < 0) {
        break;
      }

      const candidate = [...buckets[currentUserIndex]].sort(
        (a, b) => taskPointValue(tasks[b]) - taskPointValue(tasks[a]),
      )[0];

      if (candidate === undefined || taskPointValue(tasks[candidate]) <= 0) {
        break;
      }

      if (!moveTask(candidate, currentUserIndex, recipientIndex)) {
        break;
      }
    }
  }

  return assignment;
};

const assignTasksBalancedGlobally = (
  tasks: TaskItem[],
  memberCount: number,
) => {
  if (memberCount <= 0) {
    return [] as number[];
  }

  const assignment = new Array<number>(tasks.length).fill(0);
  const totals = new Array<number>(memberCount).fill(0);
  const buckets: number[][] = new Array(memberCount)
    .fill(null)
    .map(() => [] as number[]);

  const sortedTaskIndices = Array.from(
    { length: tasks.length },
    (_, i) => i,
  ).sort((a, b) => {
    const diff = taskPointValue(tasks[b]) - taskPointValue(tasks[a]);
    if (diff !== 0) {
      return diff;
    }
    return tasks[a].sourceIndex - tasks[b].sourceIndex;
  });

  for (const taskIndex of sortedTaskIndices) {
    let assigneeIndex = 0;

    for (let memberIndex = 1; memberIndex < memberCount; memberIndex += 1) {
      const betterTotal = totals[memberIndex] < totals[assigneeIndex];
      const tieTotal = totals[memberIndex] === totals[assigneeIndex];
      const betterCount =
        tieTotal && buckets[memberIndex].length < buckets[assigneeIndex].length;

      if (betterTotal || betterCount) {
        assigneeIndex = memberIndex;
      }
    }

    assignment[taskIndex] = assigneeIndex;
    buckets[assigneeIndex].push(taskIndex);
    totals[assigneeIndex] += taskPointValue(tasks[taskIndex]);
  }

  return assignment;
};

const assignmentModeLabel = (mode: GroupItem["assignMode"]) => {
  if (mode === "manual") {
    return "手動で決める";
  }
  if (mode === "random") {
    return "ランダムで決める";
  }
  if (mode === "balanced") {
    return "バランスを考慮する";
  }
  return "ランダムで決める";
};

const balanceTypeLabel = (value: GroupItem["balanceType"]) => {
  if (value === "more") {
    return "多め";
  }
  if (value === "less") {
    return "少なめ";
  }
  return "未設定";
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

const recordsDebugEnabled = process.env.RECORDS_DEBUG === "1";

const recordsDebugLog = (label: string, payload: unknown) => {
  if (!recordsDebugEnabled) {
    return;
  }

  console.info(`[records-debug] ${label}`, payload);
};

export default async function RecordsPage() {
  const session = await auth();

  if (!session) {
    redirect("/auth/timeout");
  }

  const isGuest = (session.user as { isGuest?: boolean } | undefined)?.isGuest;

  if (isGuest) {
    return (
      <div className="prose max-w-none p-4 sm:p-6">
        <div className="not-prose mb-2 flex items-center justify-between gap-3 border-b-2 border-current pb-1">
          <h1 className="text-2xl font-extrabold">担当の家事</h1>
        </div>

        <p className="mt-6 text-sm text-slate-600 dark:text-slate-300">
          今日のあなたの担当は 1 件です。
        </p>

        <div className="not-prose mt-8 space-y-6">
          <section className="rounded-lg border bg-card p-4 sm:p-5">
            <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <h2 className="text-lg font-bold">サンプルグループ</h2>
            </div>

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
                  <tr className="border-t align-top">
                    <td className="px-3 py-2 font-medium">サンプル: 食器洗い</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">2</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                      毎日夜に実施する想定です。
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-200">
                        着手前
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    );
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

  const [
    groupsV1,
    groupsLegacy,
    membershipsV1,
    membershipsLegacy,
    meV1,
    meLegacy,
  ] = await Promise.all([
    fetchOkJson(`${v1Base}/groups`),
    fetchOkJson(`${base}/groups`),
    fetchOkJson(`${v1Base}/memberships`),
    fetchOkJson(`${base}/memberships`),
    fetchOkJson(`${v1Base}/users/me`),
    fetchOkJson(`${base}/users/me`),
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
          <h1 className="text-2xl font-extrabold">担当の家事</h1>
        </div>
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

  const memberships = normalizeMemberships([membershipsV1, membershipsLegacy]);

  const meFromV1 = extractCurrentUserIdentity(meV1);
  const meFromLegacy = extractCurrentUserIdentity(meLegacy);
  const currentUserFromApi = hasMemberIdentity(meFromV1)
    ? meFromV1
    : meFromLegacy;

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

      recordsDebugLog("group-members", {
        groupId: group.id,
        groupName: group.name,
        membersInGroupCount: membersInGroup.length,
        membersCount: members.length,
        members: members.map((member) => ({
          id: member.id,
          name: member.name,
          email: member.email,
        })),
      });

      if (!group.id) {
        return {
          group,
          assignedTasks: [] as TaskItem[],
        };
      }

      const taskCandidates = [
        `${v1Base}/groups/${encodeURIComponent(group.id)}/tasks`,
        `${base}/groups/${encodeURIComponent(group.id)}/tasks`,
        `${v1Base}/tasks?group_id=${encodeURIComponent(group.id)}`,
        `${base}/tasks?group_id=${encodeURIComponent(group.id)}`,
      ];

      const recurringCandidates = [
        `${v1Base}/groups/${encodeURIComponent(group.id)}/recurring_tasks`,
        `${base}/groups/${encodeURIComponent(group.id)}/recurring_tasks`,
      ];

      const assignmentCandidates = [
        `${v1Base}/groups/${encodeURIComponent(group.id)}/assignments`,
        `${base}/groups/${encodeURIComponent(group.id)}/assignments`,
        `${v1Base}/assignments?group_id=${encodeURIComponent(group.id)}`,
        `${base}/assignments?group_id=${encodeURIComponent(group.id)}`,
      ];

      let tasksPayload: unknown | null = null;
      for (const url of taskCandidates) {
        const data = await fetchOkJson(url);
        if (data != null) {
          tasksPayload = data;
          break;
        }
      }

      let assignmentsPayload: unknown | null = null;
      for (const url of assignmentCandidates) {
        const data = await fetchOkJson(url);
        if (data != null) {
          assignmentsPayload = data;
          break;
        }
      }

      let recurringPayload: unknown | null = null;
      for (const url of recurringCandidates) {
        const data = await fetchOkJson(url);
        if (data != null) {
          recurringPayload = data;
          break;
        }
      }

      const assignments =
        extractAssignmentsArray(assignmentsPayload).map(normalizeAssignment);

      const normalTasks = extractTasksArray(tasksPayload).map(normalizeTask);
      const recurringTasks = extractRecurringTasksArray(recurringPayload)
        .map(normalizeRecurringTask)
        .filter((task) => recurringTaskRunsOnDate(task, todayKey))
        .map((task, index) =>
          recurringTaskToTask(task, normalTasks.length + index),
        );

      const tasks = sortTasksForAssignment([...normalTasks, ...recurringTasks]);

      recordsDebugLog("group-source-counts", {
        groupId: group.id,
        groupName: group.name,
        tasksCount: tasks.length,
        normalTasksCount: normalTasks.length,
        recurringTasksCount: recurringTasks.length,
        assignmentsCount: assignments.length,
      });

      if (tasks.length === 0) {
        return {
          group,
          assignedTasks: [] as TaskItem[],
        };
      }

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
              tasks,
              `${todayKey}:tasks:${group.id ?? group.name}`,
            )
          : tasks;

      const currentUserIndex = membersForAssign.findIndex((member) =>
        isSameMember(member, currentUser),
      );

      if (currentUserIndex < 0) {
        return {
          group,
          assignedTasks: [] as TaskItem[],
        };
      }

      const tasksWithAssignment = tasksForAssign.map((task) => {
        const selected = selectLatestAssignmentForTask(
          task,
          assignments,
          membersForAssign,
          todayKey,
        );

        if (!selected) {
          return task;
        }

        return {
          ...task,
          assignmentId: selected.assignment.id ?? task.assignmentId,
          assignmentStatus: selected.assignment.status ?? task.assignmentStatus,
        };
      });

      const assignedToCurrent: TaskItem[] = [];
      const groupKey = group.id ?? group.name;

      const debugResolved: Array<{
        taskId?: string;
        taskName: string;
        selectedAssignmentId?: string;
        selectedAssigneeId?: string;
        selectedAssigneeEmail?: string;
        fallbackAssigneeIndex: number;
      }> = [];

      for (
        let taskIndex = 0;
        taskIndex < tasksWithAssignment.length;
        taskIndex += 1
      ) {
        const task = tasksWithAssignment[taskIndex];
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

        debugResolved.push({
          taskId: task.id,
          taskName: task.name,
          selectedAssignmentId: selected?.assignment.id,
          selectedAssigneeId: selected?.assignment.assigneeId,
          selectedAssigneeEmail: selected?.assignment.assigneeEmail,
          fallbackAssigneeIndex,
        });

        if (finalAssigneeIndex !== currentUserIndex) {
          continue;
        }

        assignedToCurrent.push(task);
      }

      recordsDebugLog("group-resolved-assignment", {
        groupId: group.id,
        groupName: group.name,
        assignMode: group.assignMode,
        balanceType: group.balanceType,
        currentUserIndex,
        membersForAssign: membersForAssign.map((member, index) => ({
          index,
          id: member.id,
          name: member.name,
          email: member.email,
        })),
        resolved: debugResolved,
        assignedToCurrentCount: assignedToCurrent.length,
        assignedToCurrentTaskIds: assignedToCurrent.map((task) => task.id),
      });

      return {
        group,
        assignedTasks: assignedToCurrent,
      };
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
        <h1 className="text-2xl font-extrabold">担当の家事</h1>
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
                              apiUrl={apiUrl}
                              localOnly
                            />
                          ) : (
                            <AssignmentStatusButton
                              assignmentId={task.assignmentId}
                              taskId={task.id}
                              groupId={group.id}
                              currentStatus={task.assignmentStatus}
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
