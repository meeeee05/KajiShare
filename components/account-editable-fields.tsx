"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

type EditableKey = "name" | "email" | "account_type";

type Props = {
  initialName?: string | null;
  initialEmail?: string | null;
  initialAccountType?: string | null;
};

export default function AccountEditableFields({
  initialName,
  initialEmail,
  initialAccountType,
}: Props) {
  const [values, setValues] = useState<Record<EditableKey, string>>({
    name: initialName ?? "",
    email: initialEmail ?? "",
    account_type: initialAccountType ?? "",
  });
  const [editingKey, setEditingKey] = useState<EditableKey | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = (key: EditableKey) => {
    setError(null);
    setEditingKey(key);
    setDraftValue(values[key] ?? "");
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setDraftValue("");
    setError(null);
  };

  const saveEdit = async () => {
    if (!editingKey) {
      return;
    }

    const nextValue = draftValue.trim();
    if (!nextValue) {
      setError("値を入力してください。");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          [editingKey]: nextValue,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError((data as any)?.error ?? "更新に失敗しました。");
        return;
      }

      setValues((prev) => ({
        ...prev,
        [editingKey]: nextValue,
      }));
      setEditingKey(null);
      setDraftValue("");
    } catch (e) {
      setError("更新中にエラーが発生しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const rows: Array<{ key: EditableKey; label: string }> = [
    { key: "name", label: "名前" },
    { key: "email", label: "メール" },
    // 権限（account_type）は表示しない
  ];

  return (
    <div className="not-prose mt-8 space-y-6">
      {rows.map((row) => {
        const isEditing = editingKey === row.key;

        return (
          <div
            key={row.key}
            className="grid grid-cols-[140px_1fr_auto] items-center gap-3 text-base sm:text-lg"
          >
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              {row.label}
            </span>

            {isEditing ? (
              <input
                type="text"
                value={draftValue}
                onChange={(e) => setDraftValue(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <span className="font-medium break-all">
                {values[row.key] || "未設定"}
              </span>
            )}

            {isEditing ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={isSaving}
                  className="text-sm font-semibold text-blue-600 hover:underline disabled:opacity-50"
                >
                  保存
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={isSaving}
                  className="text-sm text-slate-500 hover:underline disabled:opacity-50"
                >
                  キャンセル
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => startEdit(row.key)}
                className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label={`${row.label}を編集`}
                title={`${row.label}を編集`}
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
