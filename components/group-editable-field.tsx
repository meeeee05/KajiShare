"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Pencil } from "lucide-react";
import Link from "next/link";

type EditableField = "name" | "assign_mode" | "balance_type";

type Props = {
  groupId?: string;
  shareKey?: string;
  apiUrl?: string;
  field: EditableField;
  value?: string;
  textClassName?: string;
  inputClassName?: string;
  linkHref?: string;
};

const fieldLabelMap: Record<EditableField, string> = {
  name: "グループ名",
  assign_mode: "担当割り当て",
  balance_type: "負担バランス",
};

const ASSIGN_MODE_OPTIONS = [
  { value: "manual", label: "手動で決める" },
  { value: "random", label: "ランダムで決める" },
  { value: "balanced", label: "バランスを考慮する" },
] as const;

const BALANCE_TYPE_OPTIONS = [
  { value: "more", label: "多め" },
  { value: "less", label: "少なめ" },
] as const;

const normalizeAssignMode = (value?: string) => {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) {
    return "random";
  }

  if (normalized === "manual" || normalized === "手動で決める") {
    return "manual";
  }
  if (normalized === "random" || normalized === "ランダムで決める") {
    return "random";
  }
  if (normalized === "balanced" || normalized === "バランスを考慮する") {
    return "balanced";
  }

  return "random";
};

const displayAssignMode = (value?: string) => {
  const normalized = normalizeAssignMode(value);
  const found = ASSIGN_MODE_OPTIONS.find(
    (option) => option.value === normalized,
  );
  return found?.label ?? value ?? "";
};

const normalizeBalancedType = (value?: string) => {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  if (normalized === "more" || normalized === "多め") {
    return "more";
  }
  if (normalized === "less" || normalized === "少なめ") {
    return "less";
  }

  return value ?? "";
};

const displayBalancedType = (value?: string) => {
  const normalized = normalizeBalancedType(value);
  const found = BALANCE_TYPE_OPTIONS.find(
    (option) => option.value === normalized,
  );
  return found?.label ?? value ?? "";
};

export default function GroupEditableField({
  groupId,
  shareKey,
  apiUrl,
  field,
  value,
  textClassName,
  inputClassName,
  linkHref,
}: Props) {
  const router = useRouter();
  const { data: session } = useSession();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const label = fieldLabelMap[field];
  const currentValue = useMemo(() => value ?? "", [value]);
  const displayValue = useMemo(() => {
    if (field === "assign_mode") {
      return displayAssignMode(currentValue);
    }

    if (field === "balance_type") {
      return displayBalancedType(currentValue);
    }

    return currentValue;
  }, [field, currentValue]);

  const onStartEdit = () => {
    setDraft(
      field === "assign_mode"
        ? normalizeAssignMode(currentValue)
        : field === "balance_type"
          ? normalizeBalancedType(currentValue)
          : currentValue,
    );
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

      if (!groupId) {
        setError("グループIDが取得できないため更新できません。");
        return;
      }

      const normalizedValue =
        field === "assign_mode"
          ? normalizeAssignMode(trimmed)
          : field === "balance_type"
            ? normalizeBalancedType(trimmed)
            : trimmed;

      const updateBody: { group: Record<string, string> } = {
        group: {
          [field]: normalizedValue,
        },
      };

      const endpoint = `${v1Base}/groups/${encodeURIComponent(groupId)}`;
      const attempts: Array<"PATCH" | "PUT"> = ["PATCH", "PUT"];

      let lastMessage = `${label}の更新に失敗しました。時間をおいて再度お試しください。`;

      for (const method of attempts) {
        const res = await fetch(endpoint, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateBody),
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
          {field === "assign_mode" ? (
            <select
              value={normalizeAssignMode(draft)}
              onChange={(e) => setDraft(e.target.value)}
              className={`min-w-[220px] rounded-md border bg-background px-3 py-2 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputClassName ?? ""}`}
              aria-label={`${label}入力`}
              disabled={isPending}
            >
              {ASSIGN_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : field === "balance_type" ? (
            <select
              value={normalizeBalancedType(draft)}
              onChange={(e) => setDraft(e.target.value)}
              className={`min-w-[220px] rounded-md border bg-background px-3 py-2 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputClassName ?? ""}`}
              aria-label={`${label}入力`}
              disabled={isPending}
            >
              <option value="">選択してください</option>
              {BALANCE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className={`min-w-[220px] rounded-md border bg-background px-3 py-2 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputClassName ?? ""}`}
              aria-label={`${label}入力`}
              disabled={isPending}
            />
          )}
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

  const resolvedDisplayValue =
    displayValue ||
    (field === "assign_mode" || field === "balance_type"
      ? "選択してください"
      : "-");

  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      {linkHref ? (
        <Link
          href={linkHref}
          className={`${textClassName ?? ""} min-w-0 break-all text-black hover:underline`}
        >
          {resolvedDisplayValue}
        </Link>
      ) : (
        <span className={`${textClassName ?? ""} min-w-0 break-all`}>
          {resolvedDisplayValue}
        </span>
      )}
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
