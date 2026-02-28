"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

type EditableField = "name" | "assign_mode" | "balance_type";

type Props = {
  groupId?: string;
  shareKey?: string;
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
  field,
  value,
  textClassName,
  inputClassName,
}: Props) {
  const router = useRouter();
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
      const res = await fetch("/api/groups/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          groupId,
          shareKey,
          [field]: trimmed,
        }),
      }).catch(() => null);

      if (!res?.ok) {
        const data = await res?.json().catch(() => null);
        setError(
          data?.error ??
            `${label}の更新に失敗しました。時間をおいて再度お試しください。`,
        );
        return;
      }

      setEditing(false);
      router.refresh();
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
