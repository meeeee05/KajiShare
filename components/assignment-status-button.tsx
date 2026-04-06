"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import TaskDeleteButton from "@/components/task-delete-button";

type Props = {
  assignmentId?: string;
  taskId?: string;
  groupId?: string;
  currentStatus?: string;
  apiUrl?: string;
  showDeleteWhenCompleted?: boolean;
};

type AssignmentRow = {
  id?: string;
  taskId?: string;
  assigneeId?: string;
  assigneeName?: string;
  assigneeEmail?: string;
};

type UserIdentity = {
  id?: string;
  name?: string;
  email?: string;
};

type AnyRecord = Record<string, unknown>;

const normalizeStatus = (value?: string) => (value ?? "").trim().toLowerCase();

type CanonicalStatus = "not_started" | "in_progress" | "completed";

const toCanonicalStatus = (value?: string): CanonicalStatus => {
  const normalized = normalizeStatus(value);

  if (
    normalized === "completed" ||
    normalized === "complete" ||
    normalized === "done" ||
    normalized === "finished" ||
    normalized === "完了"
  ) {
    return "completed";
  }

  if (
    normalized === "in_progress" ||
    normalized === "in-progress" ||
    normalized === "progress" ||
    normalized === "進行中"
  ) {
    return "in_progress";
  }

  if (
    normalized === "not_started" ||
    normalized === "pending" ||
    normalized === "todo" ||
    normalized === "open" ||
    normalized === "着手前" ||
    normalized === ""
  ) {
    return "not_started";
  }

  return "not_started";
};

const nextStatus = (current?: string) => {
  const canonical = toCanonicalStatus(current);

  if (canonical === "not_started") {
    return "in_progress" as const;
  }
  if (canonical === "in_progress") {
    return "completed" as const;
  }

  return "not_started" as const;
};

const displayStatus = (value?: string) => {
  const canonical = toCanonicalStatus(value);

  if (canonical === "completed") {
    return "完了";
  }

  if (canonical === "in_progress") {
    return "進行中";
  }

  return "着手前";
};

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

const normalizeIdentityText = (value?: string) =>
  (value ?? "").trim().toLowerCase();

const isSameUser = (a: UserIdentity, b: UserIdentity) => {
  const aId = normalizeIdentityText(a.id);
  const bId = normalizeIdentityText(b.id);
  if (aId && bId) {
    return aId === bId;
  }

  const aEmail = normalizeIdentityText(a.email);
  const bEmail = normalizeIdentityText(b.email);
  if (aEmail && bEmail) {
    return aEmail === bEmail;
  }

  const aName = normalizeIdentityText(a.name);
  const bName = normalizeIdentityText(b.name);
  if (aName && bName) {
    return aName === bName;
  }

  return false;
};

const firstArray = (...values: unknown[]): unknown[] => {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
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

const pickAssignmentId = (payload: unknown): string | undefined => {
  const root = asRecord(payload);
  const assignment = asRecord(root?.assignment) ?? root;
  const id = assignment?.id ?? assignment?.assignment_id;

  if (typeof id === "string" || typeof id === "number") {
    return String(id);
  }

  return undefined;
};

const normalizeAssignmentRow = (payload: unknown): AssignmentRow => {
  const root = asRecord(payload);
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

const todayYmd = () => new Date().toISOString().slice(0, 10);

const buildAssignmentPayload = (status: CanonicalStatus) => {
  const dueDate = todayYmd();
  const completedDate = status === "completed" ? dueDate : null;

  return {
    assignment: {
      due_date: dueDate,
      completed_date: completedDate,
      status,
    },
  };
};

const buildAssignmentCreatePayloads = (
  taskId: string,
  status: CanonicalStatus,
) => {
  const base = buildAssignmentPayload(status);

  return [
    base,
    {
      assignment: {
        ...(base.assignment as Record<string, unknown>),
        task_id: taskId,
      },
    },
    {
      task_id: taskId,
      status,
    },
  ];
};

export default function AssignmentStatusButton({
  assignmentId,
  taskId,
  groupId,
  currentStatus,
  apiUrl,
  showDeleteWhenCompleted,
}: Props) {
  const router = useRouter();
  const { data: session } = useSession();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [localAssignmentId, setLocalAssignmentId] = useState<
    string | undefined
  >(assignmentId);
  const [localStatus, setLocalStatus] = useState<string | undefined>(
    currentStatus,
  );

  const statusStorageKey = `assignment-status:${groupId ?? ""}:${taskId ?? ""}`;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(statusStorageKey);
      if (saved) {
        setLocalStatus(saved);
      }
    } catch {
      // ignore localStorage access errors
    }
  }, [statusStorageKey]);

  const resolveAssignmentId = () => localAssignmentId ?? assignmentId;
  const effectiveStatus = localStatus ?? currentStatus;
  const isCompleted = toCanonicalStatus(effectiveStatus) === "completed";

  const onToggle = () => {
    const targetStatus = nextStatus(effectiveStatus);
    const ok = window.confirm(
      `ステータスを「${displayStatus(effectiveStatus)}」から「${displayStatus(targetStatus)}」へ変更します。よろしいですか？`,
    );

    if (!ok) {
      return;
    }

    startTransition(async () => {
      setError(null);

      const token = (session?.user as { idToken?: string } | undefined)
        ?.idToken;
      const currentUser: UserIdentity = {
        id:
          (session?.user as { id?: string } | undefined)?.id ??
          (session?.user as { userId?: string } | undefined)?.userId,
        name: session?.user?.name ?? undefined,
        email: session?.user?.email ?? undefined,
      };
      const base = apiUrl?.replace(/\/+$/, "");
      const v1Base = base?.endsWith("/api/v1") ? base : `${base}/api/v1`;

      if (!base || !v1Base || !token) {
        setError("認証情報またはAPI設定が不足しています。");
        return;
      }

      let currentAssignmentId = resolveAssignmentId();

      const findExistingAssignmentId = async (nextTaskId: string) => {
        const taskKey = normalizeIdentityText(nextTaskId);
        const endpoints = [
          `${v1Base}/tasks/${encodeURIComponent(nextTaskId)}/assignments`,
          `${v1Base}/assignments?task_id=${encodeURIComponent(nextTaskId)}`,
        ];

        for (const endpoint of endpoints) {
          const res = await fetch(endpoint, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }).catch(() => null);

          if (!res?.ok) {
            continue;
          }

          const data = await res.json().catch(() => null);
          const directRow = normalizeAssignmentRow(data);
          if (
            directRow.id &&
            normalizeIdentityText(directRow.taskId) === taskKey &&
            isSameUser(
              {
                id: directRow.assigneeId,
                name: directRow.assigneeName,
                email: directRow.assigneeEmail,
              },
              currentUser,
            )
          ) {
            return directRow.id;
          }

          const rows = extractAssignmentsArray(data);
          const normalizedRows = rows.map(normalizeAssignmentRow);

          const ownRow = normalizedRows.find((row) => {
            if (!row.id || normalizeIdentityText(row.taskId) !== taskKey) {
              return false;
            }

            return isSameUser(
              {
                id: row.assigneeId,
                name: row.assigneeName,
                email: row.assigneeEmail,
              },
              currentUser,
            );
          });

          if (ownRow?.id) {
            return ownRow.id;
          }

          for (const row of rows) {
            const rowId = pickAssignmentId(row);
            if (rowId) {
              return rowId;
            }
          }
        }

        return undefined;
      };

      if (!currentAssignmentId) {
        if (!taskId) {
          setError("assignment が未作成で task_id も無いため更新できません。");
          return;
        }

        const existingId = await findExistingAssignmentId(taskId);
        if (existingId) {
          currentAssignmentId = existingId;
          setLocalAssignmentId(existingId);
        }
      }

      if (!currentAssignmentId) {
        if (!taskId) {
          setError("assignment が未作成で task_id も無いため更新できません。");
          return;
        }

        const createEndpoints = [
          `${v1Base}/tasks/${encodeURIComponent(taskId)}/assignments`,
          `${v1Base}/assignments`,
        ];
        const createPayloads = buildAssignmentCreatePayloads(
          taskId,
          "not_started",
        );
        let createLastError = "assignment の作成に失敗しました。";

        for (const endpoint of createEndpoints) {
          for (const payload of createPayloads) {
            const createRes = await fetch(endpoint, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(payload),
            }).catch(() => null);

            if (createRes?.status === 422) {
              const existingId = await findExistingAssignmentId(taskId);
              if (existingId) {
                currentAssignmentId = existingId;
                setLocalAssignmentId(existingId);
                break;
              }
            }

            if (!createRes?.ok) {
              const failed = await createRes?.json().catch(() => null);
              createLastError =
                (failed as { error?: string; message?: string } | null)
                  ?.error ??
                (failed as { error?: string; message?: string } | null)
                  ?.message ??
                `assignment の作成に失敗しました。(status: ${createRes?.status ?? "network"})`;
              continue;
            }

            const created = await createRes.json().catch(() => null);
            const createdRoot =
              (created as { assignment?: Record<string, unknown> } | null)
                ?.assignment ?? (created as Record<string, unknown> | null);
            const createdId =
              (createdRoot?.id as string | number | undefined) ??
              (createdRoot?.assignment_id as string | number | undefined);

            if (createdId != null) {
              currentAssignmentId = String(createdId);
              setLocalAssignmentId(currentAssignmentId);
              break;
            }

            if (currentAssignmentId) {
              break;
            }
          }

          if (currentAssignmentId) {
            break;
          }
        }

        if (!currentAssignmentId) {
          setError(createLastError);
          return;
        }
      }

      const endpoints = [
        `${v1Base}/assignments/${encodeURIComponent(currentAssignmentId)}`,
      ];

      const methods: Array<"PATCH" | "PUT"> = ["PATCH", "PUT"];

      let lastError = "ステータス更新に失敗しました。";

      for (const endpoint of endpoints) {
        for (const method of methods) {
          const res = await fetch(endpoint, {
            method,
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(buildAssignmentPayload(targetStatus)),
          }).catch(() => null);

          if (!res) {
            continue;
          }

          if (res.ok) {
            setLocalStatus(targetStatus);
            try {
              window.localStorage.setItem(statusStorageKey, targetStatus);
            } catch {
              // ignore localStorage access errors
            }
            router.refresh();
            return;
          }

          const data = await res.json().catch(() => null);
          lastError =
            (data as { error?: string; message?: string } | null)?.error ??
            (data as { error?: string; message?: string } | null)?.message ??
            `ステータス更新に失敗しました。(status: ${res.status})`;
        }
      }

      setError(lastError);
    });
  };

  return (
    <div className="flex w-full flex-col items-start gap-1">
      <div className="flex w-full items-center gap-2">
        {isCompleted ? (
          <span className="px-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
            {displayStatus(effectiveStatus)}
          </span>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            disabled={isPending}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {isPending ? "更新中..." : displayStatus(effectiveStatus)}
          </button>
        )}

        {showDeleteWhenCompleted && isCompleted ? (
          <div className="ml-auto">
            <TaskDeleteButton
              taskId={taskId}
              groupId={groupId}
              apiUrl={apiUrl}
              textOnly
            />
          </div>
        ) : null}
      </div>
      {error ? <span className="text-[10px] text-red-600">{error}</span> : null}
    </div>
  );
}
