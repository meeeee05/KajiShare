"use client";
import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteRecurringTaskAction,
  getRecurringTaskAction,
  saveRecurringTaskAction,
} from "@/app/actions";

type Props = {
  groupId?: string;
  canManage: boolean;
  initialRows: RecurringTask[];
};
type RecurringTask = { id: string; name: string; description?: string; point: number; day_of_week?: number; starts_on: string };
type FormValues = { name: string; description: string; point: string; starts_on: string; day_of_week: string };

type FormErrors = Partial<Record<keyof FormValues | "base", string>>;

const dayOptions = [["日", "0"], ["月", "1"], ["火", "2"], ["水", "3"], ["木", "4"], ["金", "5"], ["土", "6"]];

const defaultFormValues = (): FormValues => ({ name: "", description: "", point: "", starts_on: "", day_of_week: "1" });

// APIレスポンスの正規化
const normalizeRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

// APIからのエラーメッセージを取得
const toStringValue = (value: unknown) =>
  typeof value === "string" && value.trim()
    ? value
    : typeof value === "number"
      ? String(value)
      : "";

const toInt = (value: unknown) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
};

const pickErrorMessage = (payload: unknown, fallback: string, status: number) => {
  const data = normalizeRecord(payload);
  if (typeof data?.message === "string" && data.message) {
    return data.message;
  }
  if (typeof data?.error === "string" && data.error) {
    return data.error;
  }
  return `${fallback}(status: ${status})`;
};

//　APIレスポンスの正規化
const normalizeRow = (row: unknown): RecurringTask | null => {
  const record = normalizeRecord(row);
  if (!record) {
    return null;
  }

  const id = toStringValue(record.id);
  const name = toStringValue(record.name);
  const point = toInt(record.point);
  const startsOn = toStringValue(record.starts_on);

  if (!id || !name || point == null || !startsOn) {
    return null;
  }
  return {
    id,
    name,
    description: toStringValue(record.description) || undefined,
    point,
    day_of_week: toInt(record.day_of_week),
    starts_on: startsOn,
  };
};

const normalizeRows = (payload: unknown): RecurringTask[] =>
  Array.isArray(payload) ? payload.flatMap((row) => normalizeRow(row) ?? []) : [];

// バリデーションエラー
const mapApiErrors = (payload: unknown): FormErrors => {
  const errorsRaw = normalizeRecord(payload)?.errors;
  if (!Array.isArray(errorsRaw)) {
    return {};
  }

  const output: FormErrors = {};
  for (const item of errorsRaw) {
    const text = typeof item === "string" ? item : "";
    const lowered = text.toLowerCase();
    if (!text) {
      continue;
    }
    if (lowered.includes("name")) {
      output.name ??= text;
    } else if (lowered.includes("point")) {
      output.point ??= text;
    } else if (lowered.includes("starts_on")) {
      output.starts_on ??= text;
    } else if (lowered.includes("day_of_week")) {
      output.day_of_week ??= text;
    } else {
      output.base ??= text;
    }
  }
  return output;
};

const buildPayload = (values: FormValues) => ({
  recurring_task: {
    name: values.name.trim(),
    description: values.description.trim() || null,
    point: Number(values.point),
    schedule_type: "weekly",
    starts_on: values.starts_on,
    active: true,
    day_of_week: Number(values.day_of_week),
  },
});

// タスク作成
const validateValues = (values: FormValues): FormErrors => {
  const errors: FormErrors = {};
  const point = Number(values.point);
  const day = Number(values.day_of_week);
  const name = values.name.trim();

  if (!name) errors.name = "家事の名前は必須です。";
  else if (name.length > 50) errors.name = "家事の名前は50文字以内で入力してください。";
  if (!Number.isInteger(point) || point < 1 || point > 5) errors.point = "負担ポイントは1〜5の整数で入力してください。";
  if (!values.starts_on) errors.starts_on = "開始日は必須です。";
  if (!Number.isInteger(day) || day < 0 || day > 6) errors.day_of_week = "開始曜日は0〜6で選択してください。";
  return errors;
};

const toFormValues = (task: RecurringTask): FormValues => ({ name: task.name, description: task.description ?? "", point: String(task.point), starts_on: task.starts_on, day_of_week: String(task.day_of_week ?? 1) });

function FieldError({ message }: { message?: string }) {
  return message ? <span className="text-xs text-red-600">{message}</span> : null;
}

export default function RecurringTaskManager({
  groupId,
  canManage,
  initialRows,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<RecurringTask[]>(initialRows);
  const [showForm, setShowForm] = useState(false);
  const [formValues, setFormValues] = useState<FormValues>(defaultFormValues);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const requireConfig = () => {
    if (groupId) return true;
    setNotice("グループIDが取得できません。");
    return false;
  };

  const closeForm = () => {
    setShowForm(false); setEditingId(null); setFormErrors({}); setNotice(null);
  };

  const startCreate = () => {
    setEditingId(null); setShowForm(true); setFormValues(defaultFormValues()); setFormErrors({}); setNotice(null);
  };

  const startEdit = (id: string) => {
    setNotice(null);
    setFormErrors({});
    startTransition(async () => {
      const result = await getRecurringTaskAction({ id });
      if (result.redirectTo) {
        router.replace(result.redirectTo);
        return;
      }
      if (!result.ok) {
        setNotice(
          result.error ??
            pickErrorMessage(
              result.payload,
              "周期タスク詳細の取得に失敗しました。",
              result.status || 500,
            ),
        );
        return;
      }

      const row = normalizeRow(result.payload);
      if (!row) return setNotice("周期タスク詳細の取得に失敗しました。");
      setEditingId(id);
      setShowForm(true);
      setFormValues(toFormValues(row));
    });
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireConfig()) return;

    const errors = validateValues(formValues);
    setFormErrors(errors);
    setNotice(null);
    if (Object.keys(errors).length > 0) return;
    if (editingId && !canManage) {
      setNotice("管理者のみ操作できます。");
      return;
    }

    startTransition(async () => {
      const result = await saveRecurringTaskAction({
        groupId: groupId!,
        editingId,
        body: buildPayload(formValues),
      });

      if (result.redirectTo) {
        router.replace(result.redirectTo);
        return;
      }
      if (result.status === 422) {
        setFormErrors(mapApiErrors(result.payload));
        setNotice("入力内容を確認してください。");
        return;
      }
      if (result.status === 403) {
        setNotice(
          result.error ??
            pickErrorMessage(result.payload, "操作権限がありません。", result.status),
        );
        return;
      }
      if (!result.ok) {
        setNotice(
          result.error ??
            pickErrorMessage(
              result.payload,
              "周期タスクの保存に失敗しました。",
              result.status || 500,
            ),
        );
        return;
      }

      setFormErrors({});
      setNotice(editingId ? "周期タスクを更新しました。" : "周期タスクを作成しました。");
      setEditingId(null);
      setShowForm(false);
      setFormValues(defaultFormValues());
      const saved = normalizeRow(result.payload);
      if (saved) {
        setRows((prev) =>
          editingId
            ? prev.map((row) => (row.id === saved.id ? saved : row))
            : [...prev, saved],
        );
      }
      router.refresh();
    });
  };

  const onDelete = (id: string) => {
    if (!canManage) return setNotice("管理者のみ操作できます。");
    if (!window.confirm("この周期タスクを削除しますか？")) return;

    startTransition(async () => {
      const result = await deleteRecurringTaskAction({ id });
      if (result.redirectTo) {
        router.replace(result.redirectTo);
        return;
      }
      if (result.status === 403) {
        setNotice(
          result.error ??
            pickErrorMessage(result.payload, "操作権限がありません。", result.status),
        );
        return;
      }
      if (!result.ok) {
        setNotice(
          result.error ??
            pickErrorMessage(
              result.payload,
              "周期タスク削除に失敗しました。",
              result.status || 500,
            ),
        );
        return;
      }

      setNotice("周期タスクを削除しました。");
      setRows((prev) => prev.filter((row) => row.id !== id));
      if (editingId === id) {
        setEditingId(null); setShowForm(false); setFormValues(defaultFormValues());
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-900/40">
      <div className="mb-3 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <h3 className="text-sm font-semibold sm:text-base">周期タスク</h3>
        <div className="flex items-center gap-3">
          {showForm && (
            <button type="button" onClick={closeForm} className="text-xs font-semibold text-slate-500 hover:underline disabled:opacity-60" disabled={isPending}>
              フォームを閉じる
            </button>
          )}
          <button type="button" onClick={startCreate} className="text-xs font-semibold text-blue-600 hover:underline disabled:opacity-60" disabled={isPending}>
            新規作成
          </button>
        </div>
      </div>

      {!canManage && (
        <p className="mb-2 text-xs text-slate-500">編集・削除は管理者のみ操作できます。</p>
      )}
      {rows.length === 0 && (
        <p className="mb-3 text-xs text-slate-500">周期タスクはまだありません。</p>
      )}

      {rows.length > 0 && (
        <div className="mb-4 overflow-x-auto rounded-md border">
          <table className="min-w-[640px] w-full border-collapse text-xs sm:text-sm">
            <thead className="bg-slate-50 text-left text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              <tr>
                {["家事の名前", "周期", "開始日", "操作"].map((label) => <th key={label} className="px-2 py-2 font-semibold">{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t align-top">
                  <td className="px-2 py-2">{row.name}</td>
                  <td className="px-2 py-2">毎週</td>
                  <td className="px-2 py-2">{row.starts_on}</td>
                  <td className="px-2 py-2">
                    {canManage ? (
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => startEdit(row.id)} className="rounded-md border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60" disabled={isPending}>
                          編集
                        </button>
                        <button type="button" onClick={() => onDelete(row.id)} className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60" disabled={isPending}>
                          削除
                        </button>
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <form onSubmit={onSubmit} className="space-y-3 rounded-md border p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs sm:text-sm">
              <span className="mb-1 block font-semibold">家事の名前</span>
              <input value={formValues.name} onChange={(e) => setFormValues((prev) => ({ ...prev, name: e.target.value }))} className="w-full rounded-md border bg-background px-2 py-1" maxLength={50} disabled={isPending} required />
              <FieldError message={formErrors.name} />
            </label>

            <div className="text-xs sm:text-sm">
              <span className="mb-1 block font-semibold">周期タイプ</span>
              <div className="rounded-md border bg-muted/40 px-2 py-1 text-slate-700 dark:text-slate-200">毎週</div>
            </div>

            <label className="text-xs sm:text-sm">
              <span className="mb-1 block font-semibold">開始曜日</span>
              <select value={formValues.day_of_week} onChange={(e) => setFormValues((prev) => ({ ...prev, day_of_week: e.target.value }))} className="w-full rounded-md border bg-background px-2 py-1" disabled={isPending}>
                {dayOptions.map(([label, value]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <FieldError message={formErrors.day_of_week} />
            </label>

            <label className="text-xs sm:text-sm">
              <span className="mb-1 block font-semibold">負担ポイント（1〜5）</span>
              <input type="number" min={1} max={5} value={formValues.point} onChange={(e) => setFormValues((prev) => ({ ...prev, point: e.target.value }))} className="w-full rounded-md border bg-background px-2 py-1" disabled={isPending} required />
              <FieldError message={formErrors.point} />
            </label>

            <label className="text-xs sm:text-sm">
              <span className="mb-1 block font-semibold">開始日</span>
              <input type="date" value={formValues.starts_on} onChange={(e) => setFormValues((prev) => ({ ...prev, starts_on: e.target.value }))} className="w-full rounded-md border bg-background px-2 py-1" disabled={isPending} required />
              <FieldError message={formErrors.starts_on} />
            </label>
          </div>

          <label className="text-xs sm:text-sm">
            <span className="mb-1 block font-semibold">説明（任意）</span>
            <textarea value={formValues.description} onChange={(e) => setFormValues((prev) => ({ ...prev, description: e.target.value }))} className="min-h-20 w-full rounded-md border bg-background px-2 py-1" disabled={isPending} />
          </label>

          <FieldError message={formErrors.base} />
          {notice && (
            <p className="text-xs text-slate-600 dark:text-slate-300">{notice}</p>
          )}

          <div className="flex items-center gap-3">
            <button type="submit" className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60" disabled={isPending}>
              {editingId ? "更新する" : "作成する"}
            </button>
            {editingId && (
              <button type="button" onClick={startCreate} className="text-xs font-semibold text-slate-500 hover:underline disabled:opacity-60" disabled={isPending}>
                編集をキャンセル
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
