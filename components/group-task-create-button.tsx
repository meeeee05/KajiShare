"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type Props = {
  groupId?: string;
  apiUrl?: string;
};

export default function GroupTaskCreateButton({ groupId, apiUrl }: Props) {
  const router = useRouter();
  const { data: session } = useSession();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onCreate = () => {
    if (!groupId) {
      setError("グループIDがないため作成できません。");
      return;
    }

    const title = window.prompt("タスク名を入力してください");
    const trimmed = (title ?? "").trim();
    if (!trimmed) {
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

      const candidates: Array<{ url: string; body: Record<string, unknown> }> =
        [
          {
            url: `${v1Base}/groups/${encodeURIComponent(groupId)}/tasks`,
            body: {
              task: {
                title: trimmed,
              },
            },
          },
          {
            url: `${base}/groups/${encodeURIComponent(groupId)}/tasks`,
            body: {
              task: {
                title: trimmed,
              },
            },
          },
          {
            url: `${v1Base}/tasks`,
            body: {
              task: {
                title: trimmed,
                group_id: groupId,
              },
            },
          },
          {
            url: `${base}/tasks`,
            body: {
              task: {
                title: trimmed,
                group_id: groupId,
              },
            },
          },
        ];

      let lastMessage = "タスク作成に失敗しました。";

      for (const candidate of candidates) {
        const res = await fetch(candidate.url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(candidate.body),
        }).catch(() => null);

        if (!res) {
          continue;
        }

        if (res.ok) {
          router.refresh();
          return;
        }

        const data = await res.json().catch(() => null);
        lastMessage =
          (data as { error?: string; message?: string } | null)?.error ??
          (data as { error?: string; message?: string } | null)?.message ??
          `タスク作成に失敗しました。(status: ${res.status})`;
      }

      setError(lastMessage);
    });
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onCreate}
        disabled={isPending || !groupId}
        className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        タスクを作成
      </button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
