import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AssignmentStatusButton from "@/components/assignment-status-button";

type AnyRecord = Record<string, unknown>;

type GroupItem = {
  id?: string;
  name: string;
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
        pickFirstString(membershipRoot, ["group_id", "groupId"]);

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

      normalized.push({ groupId, member });
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
    ]),
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
    status: pickFromSources(assignment, assignmentRoot, ["status", "state"]),
    assigneeId:
      pickFromSources(assignee, assignment, ["id", "user_id", "userId"]) ??
      pickFromSources(assigneeRoot, assignmentRoot, ["assignee_id", "member_id"]),
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

  const candidates = assignments.filter((assignment) => {
    return (
      normalizeText(assignment.taskId) === taskIdNormalized &&
      assignmentBelongsToCurrentUser(assignment, currentUser)
    );
  });

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

const assignmentModeLabel = (mode: GroupItem["assignMode"]) => {
  if (mode === "manual") {
    return "manual";
  }
  if (mode === "random") {
    return "random";
  }
  if (mode === "balanced") {
    return "balanced";
  }
  return "未設定";
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

export default async function RecordsPage() {
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

  const [groupsV1, groupsLegacy, membershipsV1, membershipsLegacy] =
    await Promise.all([
      fetchOkJson(`${v1Base}/groups`),
      fetchOkJson(`${base}/groups`),
      fetchOkJson(`${v1Base}/memberships`),
      fetchOkJson(`${base}/memberships`),
    ]);

  const groups = normalizeGroups([
    groupsV1,
    groupsLegacy,
    membershipsV1,
    membershipsLegacy,
  ]);

  if (groups.length === 0) {
    return (
      <div className="prose max-w-none p-6">
        <div className="not-prose mb-2 flex items-center justify-between gap-3 border-b-2 border-current pb-1">
          <h1 className="text-2xl font-extrabold">担当のタスク</h1>
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

  const currentUser: MemberItem = {
    id:
      (session.user as { id?: string } | undefined)?.id ??
      (session.user as { userId?: string } | undefined)?.userId,
    name: session.user?.name ?? undefined,
    email: session.user?.email ?? undefined,
  };

  const todayKey = new Date().toISOString().slice(0, 10);

  const groupsWithAssignments = await Promise.all(
    groups.map(async (group) => {
      const membersInGroup = uniqueMembers(
        memberships
          .filter((membership) => {
            if (!group.id) {
              return false;
            }
            return (
              normalizeText(membership.groupId) === normalizeText(group.id)
            );
          })
          .map((membership) => membership.member),
      );

      const members = uniqueMembers(
        membersInGroup.length > 0
          ? [...membersInGroup, currentUser]
          : [currentUser],
      );

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

      const assignments = extractAssignmentsArray(assignmentsPayload).map(
        normalizeAssignment,
      );

      const tasks = sortTasksForAssignment(
        extractTasksArray(tasksPayload).map(normalizeTask),
      );

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

      const tasksWithAssignment = tasksForAssign.map((task) =>
        mergeAssignmentToTask(task, assignments, currentUser, todayKey),
      );

      const currentUserIndex = membersForAssign.findIndex((member) =>
        isSameMember(member, currentUser),
      );

      const assignedToCurrent: TaskItem[] = [];

      if (group.assignMode === "balanced") {
        const assigneeByTaskIndex = assignTasksBalancedByPoints(
          tasksWithAssignment,
          membersForAssign.length,
          currentUserIndex,
          group.balanceType,
        );

        for (
          let taskIndex = 0;
          taskIndex < tasksWithAssignment.length;
          taskIndex += 1
        ) {
          if (assigneeByTaskIndex[taskIndex] === currentUserIndex) {
            assignedToCurrent.push(tasksWithAssignment[taskIndex]);
          }
        }
      } else {
        for (let index = 0; index < tasksWithAssignment.length; index += 1) {
          const assignee = membersForAssign[index % membersForAssign.length];
          if (isSameMember(assignee, currentUser)) {
            assignedToCurrent.push(tasksWithAssignment[index]);
          }
        }
      }

      return {
        group,
        assignedTasks: assignedToCurrent,
      };
    }),
  );

  const totalAssigned = groupsWithAssignments.reduce(
    (sum, row) => sum + row.assignedTasks.length,
    0,
  );

  return (
    <div className="prose max-w-none p-6">
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
            className="rounded-lg border bg-card p-5"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">{group.name}</h2>
              <div className="flex items-center gap-2">
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
              <p className="text-sm text-slate-500">
                本日の担当タスクはありません。
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                    <tr>
                      <th className="px-3 py-2 font-semibold">name</th>
                      <th className="px-3 py-2 font-semibold">point</th>
                      <th className="px-3 py-2 font-semibold">description</th>
                      <th className="px-3 py-2 font-semibold">status</th>
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
                          <AssignmentStatusButton
                            assignmentId={task.assignmentId}
                            currentStatus={task.assignmentStatus}
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
