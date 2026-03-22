"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type Props = {
  assignmentId?: string;
  taskId?: string;
  groupId?: string;
  currentStatus?: string;
  apiUrl?: string;
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
    normalized === "未着手" ||
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

const todayYmd = () => new Date().toISOString().slice(0, 10);

const buildAssignmentPayload = (status: CanonicalStatus) => {
  const dueDate = todayYmd();
  const completedDate = status === "completed" ? dueDate : null;

  return {
    assignment: {
      due_date: dueDate,
      completed_date: completedDate,
      comment: status,
    },
  };
};

export default function AssignmentStatusButton({
  assignmentId,
  taskId,
  groupId,
  currentStatus,
  apiUrl,
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
      const base = apiUrl?.replace(/\/+$/, "");
      const v1Base = base?.endsWith("/api/v1") ? base : `${base}/api/v1`;

      if (!base || !v1Base || !token) {
        setError("認証情報またはAPI設定が不足しています。");
        return;
      }

      let currentAssignmentId = resolveAssignmentId();

      const findExistingAssignmentId = async (nextTaskId: string) => {
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
          const directId = pickAssignmentId(data);
          if (directId) {
            return directId;
          }

          const rows = extractAssignmentsArray(data);
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
        ];

        for (const endpoint of createEndpoints) {
          const createRes = await fetch(endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(buildAssignmentPayload("not_started")),
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

        if (!currentAssignmentId) {
          setError("assignment の作成に失敗したため更新できません。");
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
    <div className="flex flex-col items-start gap-1">
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
      {error ? <span className="text-[10px] text-red-600">{error}</span> : null}
    </div>
  );
}
