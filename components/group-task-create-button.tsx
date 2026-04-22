"use client";

import { FormEvent, useState, useTransition } from "react";
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
  const [name, setName] = useState("");
  const [point, setPoint] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!groupId) {
      setError("グループIDがないため作成できません。");
      return;
    }

    const trimmedName = name.trim();
    const trimmedPoint = point.trim();
    const trimmedDescription = description.trim();

    if (!trimmedName || !trimmedPoint || !trimmedDescription) {
      setError("家事の名前 / 負担ポイント / 備考 は必須です。");
      return;
    }

    const parsedPoint = Number(trimmedPoint);
    if (!Number.isFinite(parsedPoint)) {
      setError("負担ポイント は数値で入力してください。");
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

      const endpoint = `${v1Base}/groups/${encodeURIComponent(groupId)}/tasks`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          task: {
            name: trimmedName,
            point: parsedPoint,
            description: trimmedDescription,
          },
        }),
      }).catch(() => null);

      if (!res) {
        setError("タスク作成に失敗しました。");
        return;
      }

      if (res.ok) {
        setName("");
        setPoint("");
        setDescription("");
        router.refresh();
        return;
      }

      const data = await res.json().catch(() => null);
      const lastMessage =
        (data as { error?: string; message?: string } | null)?.error ??
        (data as { error?: string; message?: string } | null)?.message ??
        `タスク作成に失敗しました。(status: ${res.status})`;

      setError(lastMessage);
    });
  };

  return (
    <form
      onSubmit={onCreate}
      className="w-full space-y-2 rounded-md border p-3"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="家事の名前"
          required
          disabled={isPending || !groupId}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        />
        <input
          type="number"
          value={point}
          onChange={(e) => setPoint(e.target.value)}
          placeholder=" 負担ポイント（1〜5）"
          required
          disabled={isPending || !groupId}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="備考"
          required
          disabled={isPending || !groupId}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={isPending || !groupId}
        className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        タスクを登録
      </button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </form>
  );
}
