import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

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
  sourceIndex: number;
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
      const base = unwrapEntity(root);

      const id = pickFromSources(group, base, ["id", "group_id", "groupId"]);
      const name =
        pickFromSources(group, base, ["name"]) ??
        pickFromSources(source, root, ["name"]);

      if (!name) {
        continue;
      }

      const assignMode = normalizeAssignMode(
        pickFromSources(group, base, ["assign_mode"]),
      );
      const balanceType = normalizeBalanceType(
        pickFromSources(group, base, ["balance_type"]),
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

      normalized.push({
        groupId,
        member,
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
    sourceIndex: index,
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

const buildRoundRobinOrder = (counts: number[]) => {
  const remain = [...counts];
  const order: number[] = [];

  while (true) {
    let pushed = false;

    for (let index = 0; index < remain.length; index += 1) {
      if (remain[index] > 0) {
        order.push(index);
        remain[index] -= 1;
        pushed = true;
      }
    }

    if (!pushed) {
      break;
    }
  }

  return order;
};

const calculateBalancedCounts = (
  memberCount: number,
  taskCount: number,
  currentUserIndex: number,
  balanceType: "more" | "less" | "",
) => {
  if (memberCount <= 0) {
    return [] as number[];
  }

  const counts = new Array(memberCount).fill(0);
  const base = Math.floor(taskCount / memberCount);
  const remainder = taskCount % memberCount;

  for (let index = 0; index < memberCount; index += 1) {
    counts[index] = base + (index < remainder ? 1 : 0);
  }

  if (
    memberCount === 1 ||
    currentUserIndex < 0 ||
    currentUserIndex >= memberCount
  ) {
    return counts;
  }

  if (balanceType === "more") {
    while (true) {
      const maxOther = counts.reduce((max, count, index) => {
        if (index === currentUserIndex) {
          return max;
        }
        return Math.max(max, count);
      }, -Infinity);

      if (counts[currentUserIndex] > maxOther) {
        break;
      }

      let donorIndex = -1;
      let donorCount = -1;

      for (let index = 0; index < counts.length; index += 1) {
        if (index === currentUserIndex) {
          continue;
        }
        if (counts[index] > donorCount) {
          donorCount = counts[index];
          donorIndex = index;
        }
      }

      if (donorIndex < 0 || counts[donorIndex] <= 0) {
        break;
      }

      counts[donorIndex] -= 1;
      counts[currentUserIndex] += 1;
    }
  }

  if (balanceType === "less") {
    while (true) {
      const minOther = counts.reduce((min, count, index) => {
        if (index === currentUserIndex) {
          return min;
        }
        return Math.min(min, count);
      }, Infinity);

      if (counts[currentUserIndex] < minOther) {
        break;
      }

      if (counts[currentUserIndex] <= 0) {
        break;
      }

      let recipientIndex = -1;
      let recipientCount = Infinity;

      for (let index = 0; index < counts.length; index += 1) {
        if (index === currentUserIndex) {
          continue;
        }
        if (counts[index] < recipientCount) {
          recipientCount = counts[index];
          recipientIndex = index;
        }
      }

      if (recipientIndex < 0) {
        break;
      }

      counts[currentUserIndex] -= 1;
      counts[recipientIndex] += 1;
    }
  }

  return counts;
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

      let tasksPayload: unknown | null = null;
      for (const url of taskCandidates) {
        const data = await fetchOkJson(url);
        if (data != null) {
          tasksPayload = data;
          break;
        }
      }

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

      const currentUserIndex = membersForAssign.findIndex((member) =>
        isSameMember(member, currentUser),
      );

      const assignedToCurrent: TaskItem[] = [];

      if (group.assignMode === "balanced") {
        const counts = calculateBalancedCounts(
          membersForAssign.length,
          tasksForAssign.length,
          currentUserIndex,
          group.balanceType,
        );
        const assigneeOrder = buildRoundRobinOrder(counts);

        for (
          let taskIndex = 0;
          taskIndex < tasksForAssign.length && taskIndex < assigneeOrder.length;
          taskIndex += 1
        ) {
          if (assigneeOrder[taskIndex] === currentUserIndex) {
            assignedToCurrent.push(tasksForAssign[taskIndex]);
          }
        }
      } else {
        for (let index = 0; index < tasksForAssign.length; index += 1) {
          const assignee = membersForAssign[index % membersForAssign.length];
          if (isSameMember(assignee, currentUser)) {
            assignedToCurrent.push(tasksForAssign[index]);
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
