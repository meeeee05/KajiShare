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

const toBackendStatusValue = (status: CanonicalStatus) => {
  if (status === "not_started") {
    return "着手前";
  }
  if (status === "in_progress") {
    return "in_progress";
  }
  return "completed";
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

  const resolveAssignmentId = () => localAssignmentId ?? assignmentId;

  const onToggle = () => {
    const targetStatus = nextStatus(currentStatus);
    const ok = window.confirm(
      `ステータスを「${displayStatus(currentStatus)}」から「${displayStatus(targetStatus)}」へ変更します。よろしいですか？`,
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

      if (!currentAssignmentId) {
        if (!taskId) {
          setError("assignment が未作成で task_id も無いため更新できません。");
          return;
        }

        const createEndpoints = [
          groupId
            ? `${v1Base}/groups/${encodeURIComponent(groupId)}/assignments`
            : null,
          `${v1Base}/assignments`,
          groupId
            ? `${base}/groups/${encodeURIComponent(groupId)}/assignments`
            : null,
          `${base}/assignments`,
        ].filter(Boolean) as string[];

        const createBodies = [
          {
            assignment: {
              task_id: taskId,
              status: "着手前",
            },
          },
          {
            assignment: {
              task_id: taskId,
              status: "not_started",
            },
          },
          {
            task_id: taskId,
            status: "着手前",
          },
        ];

        for (const endpoint of createEndpoints) {
          for (const body of createBodies) {
            const createRes = await fetch(endpoint, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(body),
            }).catch(() => null);

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
        `${base}/assignments/${encodeURIComponent(currentAssignmentId)}`,
      ];

      const methods: Array<"PATCH" | "PUT"> = ["PATCH", "PUT"];
      const statusCandidates = [
        targetStatus,
        toBackendStatusValue(targetStatus),
      ];

      let lastError = "ステータス更新に失敗しました。";

      for (const endpoint of endpoints) {
        for (const method of methods) {
          for (const statusValue of statusCandidates) {
            const res = await fetch(endpoint, {
              method,
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                assignment: {
                  status: statusValue,
                },
              }),
            }).catch(() => null);

            if (!res) {
              continue;
            }

            if (res.ok) {
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
      }

      setError(lastError);
    });
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={onToggle}
        disabled={isPending}
        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {isPending ? "更新中..." : displayStatus(currentStatus)}
      </button>
      {error ? <span className="text-[10px] text-red-600">{error}</span> : null}
    </div>
  );
}
