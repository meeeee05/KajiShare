"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { handleGuestSessionExpiryResponse } from "@/lib/guest-session-client";

type Props = {
  taskId?: string;
  groupId?: string;
  apiUrl?: string;
  textOnly?: boolean;
  resourceType?: "task" | "recurring";
};

export default function TaskResourceDeleteButton({
  taskId,
  groupId,
  apiUrl,
  textOnly,
  resourceType = "task",
}: Props) {
  const router = useRouter();
  const { data: session } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onDelete = () => {
    if (!taskId) {
      setError("タスクIDがないため削除できません。");
      return;
    }

    const label = resourceType === "recurring" ? "周期タスク" : "タスク";
    const ok = window.confirm(`この${label}を削除しますか？`);
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

      const resourcePath =
        resourceType === "recurring" ? "recurring_tasks" : "tasks";
      const endpoints = [
        `${v1Base}/${resourcePath}/${encodeURIComponent(taskId)}`,
      ];

      let lastError = `${label}削除に失敗しました。`;

      for (const endpoint of endpoints) {
        const res = await fetch(endpoint, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        }).catch(() => null);

        if (!res) {
          continue;
        }

        if (
          await handleGuestSessionExpiryResponse({
            response: res,
            sessionUser: session?.user,
            onRedirect: (path) => router.replace(path),
          })
        ) {
          return;
        }

        if (res.ok) {
          router.refresh();
          return;
        }

        const data = await res.json().catch(() => null);
        lastError =
          (data as { error?: string; message?: string } | null)?.error ??
          (data as { error?: string; message?: string } | null)?.message ??
          `${label}削除に失敗しました。(status: ${res.status})`;
      }

      setError(lastError);
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onDelete}
        disabled={isPending || !taskId}
        className={
          textOnly
            ? "text-xs font-semibold text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            : "rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        削除
      </button>
      {error ? <span className="text-[10px] text-red-600">{error}</span> : null}
    </div>
  );
}
