"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import TaskResourceDeleteButton from "@/components/task-resource-delete-button";
import { handleGuestSessionExpiryResponse } from "@/lib/guest-session-client";

//　型定義
type Props = {
  assignmentId?: string;
  taskId?: string;
  groupId?: string;
  currentStatus?: string;
  apiUrl?: string;
  showDeleteWhenCompleted?: boolean;
  localOnly?: boolean;
};
type CanonicalStatus = "not_started" | "in_progress" | "completed";

const statusLabels: Record<CanonicalStatus, string> = {
  not_started: "着手前",
  in_progress: "進行中",
  completed: "完了",
};

const normalizeStatus = (value?: string) => (value ?? "").trim().toLowerCase();

// ステータスを正規化して、完了・進行中・着手前のいずれかに変換
const toCanonicalStatus = (value?: string): CanonicalStatus => {
  const normalized = normalizeStatus(value);

  if (normalized === "completed" || normalized === "完了") {
    return "completed";
  }
  if (normalized === "in_progress" || normalized === "進行中") {
    return "in_progress";
  }
  return "not_started";
};

// 次のステータスへ遷移
const nextStatus = (current?: string): CanonicalStatus => {
  const canonical = toCanonicalStatus(current);
  if (canonical === "not_started") {
    return "in_progress";
  }
  if (canonical === "in_progress") {
    return "completed";
  }
  return "not_started";
};

const displayStatus = (value?: string) => statusLabels[toCanonicalStatus(value)];

const todayYmd = () => new Date().toISOString().slice(0, 10);

const buildAssignmentStatusPayload = (status: CanonicalStatus) => ({
  assignment: {
    completed_date: status === "completed" ? todayYmd() : null,
    status,
  },
});

const pickErrorMessage = (payload: unknown, status: number) => {
  const data =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null;

  if (typeof data?.error === "string" && data.error) {
    return data.error;
  }
  if (typeof data?.message === "string" && data.message) {
    return data.message;
  }
  return `ステータス更新に失敗しました。(status: ${status})`;
};

// status更新
export default function AssignmentStatusButton({
  assignmentId,
  taskId,
  groupId,
  currentStatus,
  apiUrl,
  showDeleteWhenCompleted,
  localOnly,
}: Props) {
  const router = useRouter();
  const { data: session } = useSession();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<string | undefined>(
    currentStatus,
  );

  const statusStorageKey = `assignment-status:${groupId ?? ""}:${taskId ?? ""}`;
  const effectiveStatus = localStatus ?? currentStatus;
  const isCompleted = toCanonicalStatus(effectiveStatus) === "completed";

  useEffect(() => {
    if (!localOnly) {
      return;
    }

    try {
      const saved = window.localStorage.getItem(statusStorageKey);
      if (saved) {
        setLocalStatus(saved);
      }
    } catch {
      return;
    }
  }, [localOnly, statusStorageKey]);

  const saveLocalStatus = (status: CanonicalStatus) => {
    setLocalStatus(status);
    try {
      window.localStorage.setItem(statusStorageKey, status);
    } catch {
      return;
    }
  };

  const updateAssignmentStatus = async (status: CanonicalStatus) => {
    const token = (session?.user as { idToken?: string } | undefined)?.idToken;
    const base = apiUrl?.replace(/\/+$/, "");
    const v1Base = base?.endsWith("/api/v1") ? base : `${base}/api/v1`;

    if (!base || !token) {
      setError("認証情報またはAPI設定が不足しています。");
      return false;
    }

    if (!assignmentId) {
      setError("assignment が未作成のため更新できません。");
      return false;
    }
    let lastError = "ステータス更新に失敗しました。";

    for (const method of ["PATCH", "PUT"] as const) {
      const res = await fetch(
        `${v1Base}/assignments/${encodeURIComponent(assignmentId)}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildAssignmentStatusPayload(status)),
        },
      ).catch(() => null);

      if (
        await handleGuestSessionExpiryResponse({
          response: res,
          sessionUser: session?.user,
          onRedirect: (path) => router.replace(path),
        })
      ) {
        return false;
      }
      if (!res) {
        continue;
      }
      if (res.ok) {
        return true;
      }
      const data = await res.json().catch(() => null);
      lastError = pickErrorMessage(data, res.status);
    }
    setError(lastError);
    return false;
  };

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

      if (localOnly) {
        saveLocalStatus(targetStatus);
        return;
      }

      const ok = await updateAssignmentStatus(targetStatus);
      if (!ok) {
        return;
      }
      setLocalStatus(targetStatus);
      router.refresh();
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
            <TaskResourceDeleteButton
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
