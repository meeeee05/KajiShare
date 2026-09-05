"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { updateGroupFieldAction } from "@/app/actions";

type EditableField = "name" | "assign_mode" | "balance_type";
type Props = {
  groupId?: string;
  shareKey?: string;
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

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm sm:min-w-[220px] sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500";

// APIからのエラーメッセージを取得
const pickErrorMessage = (payload: unknown, label: string, status: number) => {
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
  return `${label}の更新に失敗しました。(status: ${status})`;
};

const normalizeAssignMode = (value?: string) => {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) {
    return "random";
  }
  if (normalized === "manual") {
    return "manual";
  }
  if (normalized === "random") {
    return "random";
  }
  if (normalized === "balanced") {
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
  if (normalized === "more") {
    return "more";
  }
  if (normalized === "less") {
    return "less";
  }
  return value ?? "";
};

// 表示用に日本語へ変換
const displayBalancedType = (value?: string) => {
  const normalized = normalizeBalancedType(value);
  const found = BALANCE_TYPE_OPTIONS.find(
    (option) => option.value === normalized,
  );
  return found?.label ?? value ?? "";
};

const normalizeDraftValue = (field: EditableField, value: string) => {
  if (field === "assign_mode") {
    return normalizeAssignMode(value);
  }
  if (field === "balance_type") {
    return normalizeBalancedType(value);
  }
  return value;
};

// 編集
export default function GroupEditableField({
  groupId,
  shareKey,
  field,
  value,
  textClassName,
  inputClassName,
  linkHref,
}: Props) {
  const router = useRouter();
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
    setDraft(normalizeDraftValue(field, currentValue));
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

      if (!groupId) {
        setError("グループIDが取得できないため更新できません。");
        return;
      }

      const result = await updateGroupFieldAction({
        groupId,
        field,
        value: normalizeDraftValue(field, trimmed),
      });

      if (result.redirectTo) {
        router.replace(result.redirectTo);
        return;
      }

      if (result.ok) {
        setEditing(false);
        router.refresh();
        return;
      }

      setError(
        result.error ??
          pickErrorMessage(result.payload, label, result.status || 500),
      );
      return;
    });
  };

  if (editing) {
    const fieldClassName = `${inputClass} ${inputClassName ?? ""}`;

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {field === "assign_mode" ? (
            <select
              value={normalizeAssignMode(draft)}
              onChange={(e) => setDraft(e.target.value)}
              className={fieldClassName}
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
              className={fieldClassName}
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
              className={fieldClassName}
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
          className={`${textClassName ?? ""} min-w-0 break-all text-black hover:underline dark:text-white`}
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
