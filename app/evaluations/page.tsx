import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AssignmentEvaluationForm from "@/components/assignment-evaluation-form";

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
  membershipId?: string;
  status?: string;
  assigneeId?: string;
  assigneeName?: string;
  assigneeEmail?: string;
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
    id: pickFromSources(assignment, assignmentRoot, ["id", "assignment_id"]),
    groupId:
      pickFromSources(assignment, assignmentRoot, ["group_id", "groupId"]) ??
      pickFirstString(root, ["group_id", "groupId"]),
    taskId:
      pickFromSources(assignment, assignmentRoot, ["task_id", "taskId"]) ??
      pickFirstString(root, ["task_id", "taskId"]),
    membershipId:
      pickFromSources(assignment, assignmentRoot, [
        "membership_id",
        "membershipId",
      ]) ?? pickFirstString(root, ["membership_id", "membershipId"]),
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
    normalized === "done" ||
    normalized === "finished" ||
    normalized === "完了"
  );
};

export default async function EvaluationsPage() {
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
          <h1 className="text-2xl font-extrabold">評価</h1>
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
  const membershipById = new Map(
    memberships
      .filter((membership) => membership.id)
      .map((membership) => [normalizeText(membership.id), membership]),
  );

  const currentUser: MemberItem = {
    id:
      (session.user as { id?: string } | undefined)?.id ??
      (session.user as { userId?: string } | undefined)?.userId,
    name: session.user?.name ?? undefined,
    email: session.user?.email ?? undefined,
  };

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

      const taskCandidates = [
        `${v1Base}/groups/${encodeURIComponent(group.id)}/tasks`,
        `${base}/groups/${encodeURIComponent(group.id)}/tasks`,
        `${v1Base}/tasks?group_id=${encodeURIComponent(group.id)}`,
        `${base}/tasks?group_id=${encodeURIComponent(group.id)}`,
      ];

      const assignmentCandidates = [
        `${v1Base}/groups/${encodeURIComponent(group.id)}/assignments`,
        `${v1Base}/assignments?group_id=${encodeURIComponent(group.id)}`,
        `${base}/groups/${encodeURIComponent(group.id)}/assignments`,
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

      const tasks = extractTasksArray(tasksPayload).map(normalizeTask);
      const taskById = new Map(
        tasks
          .filter((task) => task.id)
          .map((task) => [normalizeText(task.id), task]),
      );

      const assignments =
        extractAssignmentsArray(assignmentsPayload).map(normalizeAssignment);

      const rows = assignments
        .filter((assignment) => isCompletedStatus(assignment.status))
        .map((assignment) => {
          const membership = assignment.membershipId
            ? membershipById.get(normalizeText(assignment.membershipId))
            : undefined;

          const assignee: MemberItem = {
            id: assignment.assigneeId ?? membership?.member.id,
            name: assignment.assigneeName ?? membership?.member.name,
            email: assignment.assigneeEmail ?? membership?.member.email,
          };

          if (isSameMember(assignee, currentUser)) {
            return null;
          }

          const task = taskById.get(normalizeText(assignment.taskId)) ?? {
            id: assignment.taskId,
            name: "タスク",
            point: "-",
            description: "-",
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
        rows,
      };
    }),
  );

  const totalRows = groupsWithEvaluations.reduce(
    (sum, group) => sum + group.rows.length,
    0,
  );

  return (
    <div className="prose max-w-none p-6">
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
            className="rounded-lg border bg-card p-5"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
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
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                    <tr>
                      <th className="px-3 py-2 font-semibold">name</th>
                      <th className="px-3 py-2 font-semibold">point</th>
                      <th className="px-3 py-2 font-semibold">description</th>
                      <th className="px-3 py-2 font-semibold">実施者</th>
                      <th className="px-3 py-2 font-semibold">status</th>
                      <th className="px-3 py-2 font-semibold">評価</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ assignment, task, assigneeLabel }, index) => (
                      <tr
                        key={
                          assignment.id ?? `${group.id ?? group.name}-${index}`
                        }
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
