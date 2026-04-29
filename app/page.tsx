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
  isRecurring?: boolean;
  notStartedAssignments?: number;
  inProgressAssignments?: number;
  completedAssignments?: number;
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

const firstArray = (...values: unknown[]): unknown[] => {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
};

const toNonNegativeInt = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.trunc(parsed));
    }
  }
  return undefined;
};

const collectObjectRecords = (value: unknown, bucket: AnyRecord[]) => {
  const record = asRecord(value);
  if (!record) {
    return;
  }

  bucket.push(record);
  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        collectObjectRecords(item, bucket);
      }
      continue;
    }
    collectObjectRecords(child, bucket);
  }
};

const normalizeCountKey = (key: string) =>
  normalizeText(key).replace(/[\s-]/g, "");

const extractTaskStatusCounts = (payload: unknown): TaskStatusCounts | null => {
  const records: AnyRecord[] = [];
  collectObjectRecords(payload, records);

  let best: (TaskStatusCounts & { score: number; sum: number }) | null = null;

  for (const record of records) {
    let notStarted = 0;
    let inProgress = 0;
    let completed = 0;
    let score = 0;

    for (const [key, rawValue] of Object.entries(record)) {
      const value = toNonNegativeInt(rawValue);
      if (value === undefined) {
        continue;
      }

      const normalizedKey = normalizeCountKey(key);

      if (
        normalizedKey === "not_started" ||
        normalizedKey === "not_started_assignments" ||
        normalizedKey === "notstartedassignment" ||
        normalizedKey === "notstartedassignments" ||
        normalizedKey === "not_started_count" ||
        normalizedKey === "notstartedcount" ||
        normalizedKey === "notstarted" ||
        normalizedKey === "todo" ||
        normalizedKey === "todocount" ||
        normalizedKey === "pending" ||
        normalizedKey === "unstarted" ||
        normalizedKey === "着手前"
      ) {
        notStarted = value;
        score += 1;
        continue;
      }

      if (
        normalizedKey === "in_progress" ||
        normalizedKey === "in_progress_assignments" ||
        normalizedKey === "inprogressassignment" ||
        normalizedKey === "inprogressassignments" ||
        normalizedKey === "in_progress_count" ||
        normalizedKey === "inprogresscount" ||
        normalizedKey === "inprogress" ||
        normalizedKey === "doing" ||
        normalizedKey === "working" ||
        normalizedKey === "進行中"
      ) {
        inProgress = value;
        score += 1;
        continue;
      }

      if (
        normalizedKey === "completed" ||
        normalizedKey === "completed_assignments" ||
        normalizedKey === "completedassignment" ||
        normalizedKey === "completedassignments" ||
        normalizedKey === "completed_count" ||
        normalizedKey === "completedcount" ||
        normalizedKey === "complete" ||
        normalizedKey === "done" ||
        normalizedKey === "finished" ||
        normalizedKey === "完了" ||
        normalizedKey === "完了済み" ||
        normalizedKey === "済"
      ) {
        completed = value;
        score += 1;
      }
    }

    if (score === 0) {
      continue;
    }

    const candidate = {
      notStarted,
      inProgress,
      completed,
      score,
      sum: notStarted + inProgress + completed,
    };

    if (
      !best ||
      candidate.score > best.score ||
      (candidate.score === best.score && candidate.sum > best.sum)
    ) {
      best = candidate;
    }
  }

  if (!best) {
    return null;
  }

  return {
    notStarted: best.notStarted,
    inProgress: best.inProgress,
    completed: best.completed,
  };
};

const toTimestamp = (value?: string) => {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

const todayYmd = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: APP_TIME_ZONE,
  }).format(new Date());

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

const taskAssignmentKey = (task: TaskItem) =>
  normalizeText(task.id ?? `${task.name}:${task.sourceIndex}`);

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
      const membershipSource = membershipRoot ?? membership;
      const group =
        unwrapEntity(asRecord(membershipRoot?.group)) ??
        unwrapEntity(asRecord(membership?.group));

      const groupId =
        pickFromSources(group, membership, ["id", "group_id", "groupId"]) ??
        pickRelationshipId(membershipSource, ["group", "groups"]) ??
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
            pickRelationshipId(membershipSource, [
              "member",
              "user",
              "account",
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
    notStartedAssignments:
      toNonNegativeInt(
        pickFromSources(task, taskRoot, [
          "not_started_assignments",
          "notStartedAssignments",
          "not_started_count",
          "notStartedCount",
        ]),
      ) ??
      toNonNegativeInt(
        pickFirstString(root, [
          "not_started_assignments",
          "notStartedAssignments",
          "not_started_count",
          "notStartedCount",
        ]),
      ),
    inProgressAssignments:
      toNonNegativeInt(
        pickFromSources(task, taskRoot, [
          "in_progress_assignments",
          "inProgressAssignments",
          "in_progress_count",
          "inProgressCount",
        ]),
      ) ??
      toNonNegativeInt(
        pickFirstString(root, [
          "in_progress_assignments",
          "inProgressAssignments",
          "in_progress_count",
          "inProgressCount",
        ]),
      ),
    completedAssignments:
      toNonNegativeInt(
        pickFromSources(task, taskRoot, [
          "completed_assignments",
          "completedAssignments",
          "completed_count",
          "completedCount",
        ]),
      ) ??
      toNonNegativeInt(
        pickFirstString(root, [
          "completed_assignments",
          "completedAssignments",
          "completed_count",
          "completedCount",
        ]),
      ),
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
    pickFromSources(recurring, recurringRoot, ["schedule_type", "scheduleType"])
    ?? "";
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
  const active = activeRaw == null ? true : activeRaw === "true" || activeRaw === "1";

  return {
    id:
      pickFromSources(recurring, recurringRoot, ["id", "recurring_task_id"]) ??
      pickFirstString(root, ["id", "recurring_task_id"]),
    name:
      pickFromSources(recurring, recurringRoot, ["name", "title"]) ??
      `周期タスク ${index + 1}`,
    point: pickFromSources(recurring, recurringRoot, ["point", "score", "value"]),
    description: pickFromSources(recurring, recurringRoot, [
      "description",
      "detail",
      "memo",
    ]),
    scheduleType,
    dayOfWeek: pickFromSources(recurring, recurringRoot, ["day_of_week", "dayOfWeek"]),
    intervalDays: pickFromSources(recurring, recurringRoot, [
      "interval_days",
      "intervalDays",
    ]),
    startsOn: pickFromSources(recurring, recurringRoot, ["starts_on", "startsOn"]),
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
    "日": 0,
    mon: 1,
    monday: 1,
    "月": 1,
    tue: 2,
    tuesday: 2,
    "火": 2,
    wed: 3,
    wednesday: 3,
    "水": 3,
    thu: 4,
    thursday: 4,
    "木": 4,
    fri: 5,
    friday: 5,
    "金": 5,
    sat: 6,
    saturday: 6,
    "土": 6,
  };

  return map[normalized];
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

  const singleData =
    asRecord(root.data) ??
    asRecord(rootData?.data) ??
    asRecord(rootDataData?.data);
  if (singleData) {
    return [singleData];
  }

  const singleResource =
    asRecord(root.assignment) ??
    asRecord(rootData?.assignment) ??
    asRecord(rootDataData?.assignment);
  if (singleResource) {
    return [singleResource];
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
  const assignmentSource = assignmentRoot ?? root;

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
      pickRelationshipId(assignmentSource, ["group", "groups"]) ??
      pickFirstString(root, ["group_id", "groupId"]),
    taskId:
      pickFromSources(task, assignment, ["id", "task_id", "taskId"]) ??
      pickFromSources(assignment, assignmentRoot, ["task_id", "taskId"]) ??
      pickRelationshipId(assignmentSource, ["task", "tasks"]) ??
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
        "group_membership_id",
        "groupMembershipId",
      ]) ??
      pickFromSources(membership, membershipRoot, ["id", "membership_id"]) ??
      pickRelationshipId(assignmentSource, [
        "membership",
        "group_membership",
      ]) ??
      pickFirstString(root, [
        "membership_id",
        "membershipId",
        "group_membership_id",
        "groupMembershipId",
      ]),
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
      ]) ??
      pickRelationshipId(assignmentSource, [
        "assignee",
        "user",
        "member",
        "executor",
        "completed_by",
      ]),
    assigneeName:
      pickFromSources(assignee, assignment, ["name"]) ??
      pickFromSources(membershipMember, membership, ["name"]),
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
    evaluationScore:
      pickFromSources(evaluation, evaluationRoot, [
        "score",
        "point",
        "rating",
      ]) ??
      pickFromSources(assignment, assignmentRoot, [
        "evaluation_score",
        "evaluationScore",
        "score",
        "point",
        "rating",
      ]),
    evaluationComment:
      pickFromSources(evaluation, evaluationRoot, [
        "feedback",
        "comment",
        "body",
        "memo",
      ]) ??
      pickFromSources(assignment, assignmentRoot, [
        "feedback",
        "evaluation_comment",
        "evaluationComment",
        "comment",
        "body",
        "memo",
      ]),
    evaluatedAt:
      pickFromSources(evaluation, evaluationRoot, [
        "created_at",
        "createdAt",
        "evaluated_at",
        "evaluatedAt",
        "updated_at",
        "updatedAt",
      ]) ??
      pickFromSources(assignment, assignmentRoot, [
        "evaluated_at",
        "evaluatedAt",
        "evaluation_created_at",
        "evaluationCreatedAt",
        "evaluation_updated_at",
        "evaluationUpdatedAt",
      ]),
  };
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

  const directArray = firstArray(
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

  if (directArray.length > 0) {
    return directArray;
  }

  const singleData =
    asRecord(root.data) ??
    asRecord(rootData?.data) ??
    asRecord(rootDataData?.data);
  if (singleData) {
    return [singleData];
  }

  const singleEvaluation =
    asRecord(root.evaluation) ??
    asRecord(rootData?.evaluation) ??
    asRecord(rootDataData?.evaluation);
  if (singleEvaluation) {
    return [singleEvaluation];
  }

  return [];
};

const extractAssignmentsFromTaskRows = (
  taskRows: unknown[],
  groupId?: string,
): AssignmentItem[] => {
  const collected: AssignmentItem[] = [];

  for (const row of taskRows) {
    const root = asRecord(row);
    const taskRoot = asRecord(root?.task) ?? root;
    const task = unwrapEntity(taskRoot);

    const taskId =
      pickFromSources(task, taskRoot, ["id", "task_id", "taskId"]) ??
      pickFirstString(root, ["id", "task_id", "taskId"]);
    const taskName =
      pickFromSources(task, taskRoot, ["name", "title", "task_name"]) ??
      pickFirstString(root, ["name", "title", "task_name"]);

    const nestedAssignments = firstArray(
      root?.assignments,
      taskRoot?.assignments,
      task?.assignments,
      asRecord(root?.data)?.assignments,
      asRecord(taskRoot?.data)?.assignments,
    );

    const nestedSingleAssignment =
      asRecord(root?.assignment) ??
      asRecord(taskRoot?.assignment) ??
      asRecord(task?.assignment) ??
      asRecord(asRecord(root?.data)?.assignment) ??
      asRecord(asRecord(taskRoot?.data)?.assignment);

    const rawAssignments = [...nestedAssignments];
    if (nestedSingleAssignment) {
      rawAssignments.push(nestedSingleAssignment);
    }

    for (const rawAssignment of rawAssignments) {
      const normalized = normalizeAssignment(rawAssignment);
      collected.push({
        ...normalized,
        groupId: normalized.groupId ?? groupId,
        taskId: normalized.taskId ?? taskId,
        taskName: normalized.taskName ?? taskName,
      });
    }
  }

  return collected;
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

const isInProgressStatus = (status?: string) => {
  const normalized = normalizeText(status);
  return (
    normalized === "in_progress" ||
    normalized === "in progress" ||
    normalized === "doing" ||
    normalized === "working" ||
    normalized === "進行中"
  );
};

const isNotStartedStatus = (status?: string) => {
  const normalized = normalizeText(status);
  return (
    normalized === "not_started" ||
    normalized === "not started" ||
    normalized === "todo" ||
    normalized === "pending" ||
    normalized === "unstarted" ||
    normalized === "着手前"
  );
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
  const hasSerializerCounts =
    typeof task.notStartedAssignments === "number" ||
    typeof task.inProgressAssignments === "number" ||
    typeof task.completedAssignments === "number";

  if (hasSerializerCounts) {
    return {
      notStarted: task.notStartedAssignments ?? 0,
      inProgress: task.inProgressAssignments ?? 0,
      completed: task.completedAssignments ?? 0,
    };
  }

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
    name: pickFromSources(user, userRoot, ["name"]),
    email: pickFromSources(user, userRoot, ["email", "mail", "member_email"]),
  };
};

const fetchFirstOkJson = async (
  urls: string[],
  fetchOkJson: (url: string) => Promise<unknown | null>,
) => {
  const uniqueUrls = Array.from(new Set(urls));

  for (const url of uniqueUrls) {
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
    redirect("/auth/timeout");
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
    }).catch((error) => {
      console.error("[dashboard] fetch failed", {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });

    if (!res?.ok) {
      console.warn("[dashboard] fetch non-ok", {
        url,
        status: res?.status ?? "no-response",
      });
      return null;
    }

    const data = await res.json().catch((error) => {
      console.error("[dashboard] json parse failed", {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });

    if (
      url.includes("/tasks") ||
      url.includes("/assignments") ||
      url.includes("/memberships")
    ) {
      const root = asRecord(data);
      console.log("[dashboard] fetch ok", {
        url,
        topLevelKeys: root ? Object.keys(root).slice(0, 10) : [],
        isArray: Array.isArray(data),
      });
    }

    return data;
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
    evaluationsV1,
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
    fetchOkJson(`${v1Base}/evaluations`),
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
    serializerStatusCounts: TaskStatusCounts | null;
    taskCards: TaskCardItem[];
  }[] = await Promise.all(
    groups.map(async (group) => {
      if (!group.id) {
        return {
          rows: [] as DashboardTaskRow[],
          assignedToCurrentCount: 0,
          serializerStatusCounts: null as TaskStatusCounts | null,
          taskCards: [] as TaskCardItem[],
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

      const recurringPayload = await fetchFirstOkJson(
        [
          `${v1Base}/groups/${encodeURIComponent(group.id)}/recurring_tasks`,
          `${base}/groups/${encodeURIComponent(group.id)}/recurring_tasks`,
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
      const taskIdList = tasks
        .filter((task) => !task.isRecurring)
        .map((task) => task.id)
        .filter((taskId): taskId is string => Boolean(taskId));

      const taskAssignmentsPayloads = await Promise.all(
        taskIdList.map((taskId) =>
          fetchFirstOkJson(
            [
              `${v1Base}/tasks/${encodeURIComponent(taskId)}/assignments`,
              `${base}/tasks/${encodeURIComponent(taskId)}/assignments`,
            ],
            fetchOkJson,
          ),
        ),
      );
      const completedAssignmentsFromTaskRows: number = taskRows.reduce<number>(
        (sum, row) => {
          const root = asRecord(row);
          const taskRoot = asRecord(root?.task) ?? root;
          const task = unwrapEntity(taskRoot);

          const value =
            toNonNegativeInt(
              pickFromSources(task, taskRoot, [
                "completed_assignments",
                "completedAssignments",
                "completed_count",
                "completedCount",
              ]),
            ) ??
            toNonNegativeInt(
              pickFirstString(root, [
                "completed_assignments",
                "completedAssignments",
                "completed_count",
                "completedCount",
              ]),
            ) ??
            0;

          return sum + value;
        },
        0,
      );

      const notStartedAssignmentsFromTaskRows: number = taskRows.reduce<number>(
        (sum, row) => {
          const root = asRecord(row);
          const taskRoot = asRecord(root?.task) ?? root;
          const task = unwrapEntity(taskRoot);

          const value =
            toNonNegativeInt(
              pickFromSources(task, taskRoot, [
                "not_started_assignments",
                "notStartedAssignments",
                "not_started_count",
                "notStartedCount",
                "着手前_assignments",
                "着手前_count",
              ]),
            ) ??
            toNonNegativeInt(
              pickFirstString(root, [
                "not_started_assignments",
                "notStartedAssignments",
                "not_started_count",
                "notStartedCount",
                "着手前_assignments",
                "着手前_count",
              ]),
            ) ??
            0;

          return sum + value;
        },
        0,
      );

      const inProgressAssignmentsFromTaskRows: number = taskRows.reduce<number>(
        (sum, row) => {
          const root = asRecord(row);
          const taskRoot = asRecord(root?.task) ?? root;
          const task = unwrapEntity(taskRoot);

          const value =
            toNonNegativeInt(
              pickFromSources(task, taskRoot, [
                "in_progress_assignments",
                "inProgressAssignments",
                "in_progress_count",
                "inProgressCount",
              ]),
            ) ??
            toNonNegativeInt(
              pickFirstString(root, [
                "in_progress_assignments",
                "inProgressAssignments",
                "in_progress_count",
                "inProgressCount",
              ]),
            ) ??
            0;

          return sum + value;
        },
        0,
      );

      const serializerStatusBase = extractTaskStatusCounts(tasksPayload);
      const serializerStatusCounts: TaskStatusCounts | null =
        serializerStatusBase
          ? {
              ...serializerStatusBase,
              notStarted: Math.max(
                serializerStatusBase.notStarted,
                notStartedAssignmentsFromTaskRows,
              ),
              inProgress: Math.max(
                serializerStatusBase.inProgress,
                inProgressAssignmentsFromTaskRows,
              ),
              completed: Math.max(
                serializerStatusBase.completed,
                completedAssignmentsFromTaskRows,
              ),
            }
          : completedAssignmentsFromTaskRows > 0 ||
              notStartedAssignmentsFromTaskRows > 0 ||
              inProgressAssignmentsFromTaskRows > 0
            ? {
                notStarted: notStartedAssignmentsFromTaskRows,
                inProgress: inProgressAssignmentsFromTaskRows,
                completed: completedAssignmentsFromTaskRows,
              }
            : null;

      const assignmentsFromTaskEndpoints = taskAssignmentsPayloads.flatMap(
        (payload, index) => {
          const taskId = taskIdList[index];
          const task = tasks.find(
            (taskItem) => normalizeText(taskItem.id) === normalizeText(taskId),
          );

          return extractAssignmentsArray(payload)
            .map(normalizeAssignment)
            .map((assignment) => ({
              ...assignment,
              groupId: assignment.groupId ?? group.id,
              taskId: assignment.taskId ?? taskId,
              taskName: assignment.taskName ?? task?.name,
            }));
        },
      );

      const tasksForAssignBase = sortTasksForAssignment(tasks);
      const assignments = uniqueAssignmentsByKey([
        ...extractAssignmentsArray(assignmentsPayload).map(normalizeAssignment),
        ...assignmentsFromTaskEndpoints,
        ...extractAssignmentsFromTaskRows(taskRows, group.id),
      ]);
      console.log("[dashboard] group assignment extracted", {
        groupId: group.id,
        tasks: tasks.length,
        fromGroupAssignmentsEndpoint:
          extractAssignmentsArray(assignmentsPayload).length,
        fromTaskAssignmentsEndpoints: assignmentsFromTaskEndpoints.length,
        fromTaskRowsEmbedded: extractAssignmentsFromTaskRows(taskRows, group.id)
          .length,
        mergedUnique: assignments.length,
      });
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
        const isAssignedByFallback = assignedTaskKeys.has(taskAssignmentKey(task));

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
              : getMyTaskStatus(task, myMembershipIdInGroup, assignmentsByTaskId),
        };
      });

      return {
        rows,
        assignedToCurrentCount,
        serializerStatusCounts,
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
    .slice(0, 8);

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

      const assignmentRoot =
        asRecord(evaluationRoot?.assignment) ??
        asRecord(evaluation?.assignment) ??
        asRecord(asRecord(evaluationRoot?.data)?.assignment) ??
        asRecord(asRecord(evaluation?.data)?.assignment);
      const assignment = normalizeAssignment(assignmentRoot ?? row);

      const taskId =
        pickFromSources(evaluation, evaluationRoot, ["task_id", "taskId"]) ??
        pickFromSources(unwrapEntity(assignmentRoot), assignmentRoot, [
          "task_id",
          "taskId",
        ]) ??
        assignment.taskId;

      const assignmentStatus =
        pickFromSources(evaluation, evaluationRoot, [
          "assignment_status",
          "assignmentStatus",
        ]) ??
        pickFromSources(unwrapEntity(assignmentRoot), assignmentRoot, [
          "status",
          "state",
        ]) ??
        assignment.status;

      const evaluatedUserId = pickFromSources(evaluation, evaluationRoot, [
        "evaluated_user_id",
        "evaluatedUserId",
      ]);

      const assignmentEntity = unwrapEntity(assignmentRoot);
      const membershipRoot =
        asRecord(assignmentRoot?.membership) ??
        asRecord(assignmentEntity?.membership);
      const membership = unwrapEntity(membershipRoot);
      const membershipUserRoot =
        asRecord(membershipRoot?.user) ??
        asRecord(membership?.user) ??
        asRecord(membershipRoot?.member) ??
        asRecord(membership?.member);
      const membershipUser = unwrapEntity(membershipUserRoot);

      const assignmentUserId =
        pickFromSources(membershipUser, membership, [
          "user_id",
          "userId",
          "id",
        ]) ?? pickFirstString(evaluationRoot, ["user_id", "userId"]);

      const evaluatorId =
        pickFromSources(evaluation, evaluationRoot, [
          "evaluator_id",
          "evaluatorId",
        ]) ??
        pickRelationshipId(evaluationRoot, ["evaluator", "user", "member"]);

      return {
        assignment: {
          ...assignment,
          taskId,
          status: assignmentStatus,
          evaluationId:
            assignment.evaluationId ??
            pickFromSources(evaluation, evaluationRoot, [
              "id",
              "evaluation_id",
              "evaluationId",
            ]),
          evaluationScore:
            assignment.evaluationScore ??
            pickFromSources(evaluation, evaluationRoot, [
              "score",
              "evaluation_score",
              "evaluationScore",
              "point",
              "rating",
            ]) ??
            pickFromSources(assignmentEntity, assignmentRoot, [
              "evaluation_score",
              "evaluationScore",
              "score",
              "point",
              "rating",
            ]),
          evaluationComment:
            assignment.evaluationComment ??
            pickFromSources(evaluation, evaluationRoot, [
              "feedback",
              "comment",
              "evaluation_comment",
              "evaluationComment",
              "body",
              "memo",
            ]) ??
            pickFromSources(assignmentEntity, assignmentRoot, [
              "feedback",
              "evaluation_comment",
              "evaluationComment",
              "comment",
              "body",
              "memo",
            ]),
          evaluatedAt:
            assignment.evaluatedAt ??
            pickFromSources(evaluation, evaluationRoot, [
              "evaluated_at",
              "evaluatedAt",
              "created_at",
              "createdAt",
              "updated_at",
              "updatedAt",
            ]) ??
            pickFromSources(assignmentEntity, assignmentRoot, [
              "evaluated_at",
              "evaluatedAt",
              "evaluation_created_at",
              "evaluationCreatedAt",
              "evaluation_updated_at",
              "evaluationUpdatedAt",
            ]),
        },
        assignmentUserId: evaluatedUserId ?? assignmentUserId,
        evaluatorId,
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
      return bTime - aTime;
    });

  const uniqueEvaluationsByTaskId = new Map<string, AssignmentItem>();
  for (const row of evaluations) {
    const taskIdKey = normalizeText(row.assignment.taskId);
    if (!taskIdKey || uniqueEvaluationsByTaskId.has(taskIdKey)) {
      continue;
    }
    uniqueEvaluationsByTaskId.set(taskIdKey, row.assignment);
  }

  const evaluatedMyExecutedTasks = Array.from(
    uniqueEvaluationsByTaskId.values(),
  )
    .map((assignment) => {
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
    .slice(0, 6);

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
