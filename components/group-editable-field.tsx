"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Pencil } from "lucide-react";

type EditableField = "name" | "assign_mode" | "balance_type";

type Props = {
  groupId?: string;
  shareKey?: string;
  apiUrl?: string;
  field: EditableField;
  value?: string;
  textClassName?: string;
  inputClassName?: string;
};

const fieldLabelMap: Record<EditableField, string> = {
  name: "グループ名",
  assign_mode: "担当割り当て",
  balance_type: "負担バランス",
};

export default function GroupEditableField({
  groupId,
  shareKey,
  apiUrl,
  field,
  value,
  textClassName,
  inputClassName,
}: Props) {
  const router = useRouter();
  const { data: session } = useSession();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const label = fieldLabelMap[field];
  const currentValue = useMemo(() => value ?? "", [value]);

  const onStartEdit = () => {
    setDraft(currentValue);
    setError(null);
    setEditing(true);
  };

  const onCancel = () => {
    setDraft(currentValue);
    setError(null);
    setEditing(false);
  };

  const onSave = () => {
    const trimmed = draft.trim();

    if (!trimmed) {
      setError(`${label}は必須です。`);
      return;
    }

    startTransition(async () => {
      setError(null);
      const token = (session?.user as any)?.idToken as string | undefined;
      const base = apiUrl?.replace(/\/+$/, "");
      const v1Base = base?.endsWith("/api/v1") ? base : `${base}/api/v1`;

      if (!base || !v1Base || !token) {
        setError("認証情報またはAPI設定が不足しています。");
        return;
      }

      const updateBody: Record<string, string> = {
        [field]: trimmed,
      };

      const attempts: Array<{
        method: "PATCH" | "PUT" | "POST";
        url: string;
        body: Record<string, unknown>;
      }> = [];

      if (groupId) {
        attempts.push(
          {
            method: "PATCH",
            url: `${base}/groups/${encodeURIComponent(groupId)}`,
            body: updateBody,
          },
          {
            method: "PUT",
            url: `${base}/groups/${encodeURIComponent(groupId)}`,
            body: updateBody,
          },
          {
            method: "PATCH",
            url: `${v1Base}/groups/${encodeURIComponent(groupId)}`,
            body: updateBody,
          },
          {
            method: "PUT",
            url: `${v1Base}/groups/${encodeURIComponent(groupId)}`,
            body: updateBody,
          },
        );
      }

      if (shareKey) {
        attempts.push(
          {
            method: "PATCH",
            url: `${base}/groups/update`,
            body: {
              share_key: shareKey,
              ...updateBody,
            },
          },
          {
            method: "POST",
            url: `${base}/groups/update`,
            body: {
              share_key: shareKey,
              ...updateBody,
            },
          },
          {
            method: "PATCH",
            url: `${v1Base}/groups/update`,
            body: {
              share_key: shareKey,
              ...updateBody,
            },
          },
          {
            method: "POST",
            url: `${v1Base}/groups/update`,
            body: {
              share_key: shareKey,
              ...updateBody,
            },
          },
        );
      }

      if (groupId || shareKey) {
        attempts.push(
          {
            method: "PATCH",
            url: `${base}/groups`,
            body: {
              group_id: groupId,
              share_key: shareKey,
              ...updateBody,
            },
          },
          {
            method: "PATCH",
            url: `${v1Base}/groups`,
            body: {
              group_id: groupId,
              share_key: shareKey,
              ...updateBody,
            },
          },
        );
      }

      let lastMessage = `${label}の更新に失敗しました。時間をおいて再度お試しください。`;

      for (const attempt of attempts) {
        const res = await fetch(attempt.url, {
          method: attempt.method,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(attempt.body),
        }).catch(() => null);

        if (!res) {
          continue;
        }

        if (res.ok) {
          setEditing(false);
          router.refresh();
          return;
        }

        const data = await res.json().catch(() => null);
        lastMessage =
          (data as any)?.error ??
          (data as any)?.message ??
          `${label}の更新に失敗しました。(status: ${res.status})`;
      }

      setError(lastMessage);
      return;
    });
  };

  if (editing) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={`min-w-[220px] rounded-md border bg-background px-3 py-2 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputClassName ?? ""}`}
            aria-label={`${label}入力`}
            disabled={isPending}
          />
          <button
            type="button"
            onClick={onSave}
            disabled={isPending}
            className="text-sm font-semibold text-blue-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            保存
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="text-sm text-slate-500 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            キャンセル
          </button>
        </div>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <span className={`${textClassName ?? ""} min-w-0 break-all`}>
        {currentValue || "-"}
      </span>
      <button
        type="button"
        onClick={onStartEdit}
        className="inline-flex shrink-0 items-center rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        aria-label={`${label}を編集`}
        title={`${label}を編集`}
      >
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  );
}
