"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useSession } from "next-auth/react";

type Props = {
  groupId?: string;
  apiUrl?: string;
  canManage: boolean;
};

type ScheduleType = "weekly" | "every_n_days";

type RecurringTask = {
  id: string;
  group_id?: string;
  created_by_id?: string;
  name: string;
  description?: string;
  point: number;
  schedule_type: ScheduleType;
  day_of_week?: number;
  interval_days?: number;
  starts_on: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

type FormValues = {
  name: string;
  description: string;
  point: string;
  schedule_type: ScheduleType;
  starts_on: string;
  day_of_week: string;
  interval_days: string;
};

type FormErrors = Partial<Record<keyof FormValues | "base", string>>;

const defaultFormValues = (): FormValues => ({
  name: "",
  description: "",
  point: "",
  schedule_type: "weekly",
  starts_on: "",
  day_of_week: "1",
  interval_days: "",
});

const dayOptions = [
  { label: "日", value: "0" },
  { label: "月", value: "1" },
  { label: "火", value: "2" },
  { label: "水", value: "3" },
  { label: "木", value: "4" },
  { label: "金", value: "5" },
  { label: "土", value: "6" },
];

const scheduleTypeLabel = (value: ScheduleType) =>
  value === "weekly" ? "毎週" : "N日おき";

const normalizeRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const extractRows = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  const root = normalizeRecord(payload);
  if (!root) {
    return [];
  }

  const fromRoot = root.recurring_tasks;
  if (Array.isArray(fromRoot)) {
    return fromRoot;
  }

  const rootData = normalizeRecord(root.data);
  if (Array.isArray(rootData?.recurring_tasks)) {
    return rootData.recurring_tasks as unknown[];
  }

  if (Array.isArray(root.data)) {
    return root.data as unknown[];
  }

  return [];
};

const pickString = (
  obj: Record<string, unknown> | null,
  keys: string[],
): string | undefined => {
  if (!obj) {
    return undefined;
  }

  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
  }

  return undefined;
};

const unwrapEntity = (value: Record<string, unknown> | null) =>
  normalizeRecord(value?.attributes) ?? normalizeRecord(value?.data) ?? value;

const pickFromSources = (
  sourceA: Record<string, unknown> | null,
  sourceB: Record<string, unknown> | null,
  keys: string[],
) => pickString(sourceA, keys) ?? pickString(sourceB, keys);

const toInt = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return undefined;
  }
  return parsed;
};

const normalizeRow = (row: unknown, index: number): RecurringTask => {
  const root = normalizeRecord(row);
  const nested = normalizeRecord(root?.recurring_task);
  const recordRoot = nested ?? root;
  const record = unwrapEntity(recordRoot);

  const id =
    pickFromSources(record, recordRoot, ["id"]) ??
    pickString(root, ["id"]) ??
    `fallback-${index}`;

  const scheduleTypeRaw =
    pickFromSources(record, recordRoot, ["schedule_type", "scheduleType"]) ??
    "weekly";

  const scheduleType: ScheduleType =
    scheduleTypeRaw === "every_n_days" ? "every_n_days" : "weekly";

  const activeRaw = pickString(record, ["active"]);

  return {
    id,
    group_id: pickFromSources(record, recordRoot, ["group_id", "groupId"]),
    created_by_id: pickFromSources(record, recordRoot, [
      "created_by_id",
      "createdById",
    ]),
    name: pickFromSources(record, recordRoot, ["name"]) ?? "(名称未設定)",
    description: pickFromSources(record, recordRoot, ["description"]),
    point: toInt(pickFromSources(record, recordRoot, ["point"])) ?? 1,
    schedule_type: scheduleType,
    day_of_week: toInt(
      pickFromSources(record, recordRoot, ["day_of_week", "dayOfWeek"]),
    ),
    interval_days: toInt(
      pickFromSources(record, recordRoot, ["interval_days", "intervalDays"]),
    ),
    starts_on:
      pickFromSources(record, recordRoot, ["starts_on", "startsOn"]) ?? "",
    active:
      activeRaw == null ? true : activeRaw === "true" || activeRaw === "1",
    created_at: pickFromSources(record, recordRoot, [
      "created_at",
      "createdAt",
    ]),
    updated_at: pickFromSources(record, recordRoot, [
      "updated_at",
      "updatedAt",
    ]),
  };
};

const mapApiErrors = (payload: unknown): FormErrors => {
  const root = normalizeRecord(payload);
  const errorsRaw = root?.errors;

  if (!Array.isArray(errorsRaw)) {
    return {};
  }

  const output: FormErrors = {};
  for (const item of errorsRaw) {
    const text = typeof item === "string" ? item : "";
    if (!text) {
      continue;
    }

    const lowered = text.toLowerCase();
    if (lowered.includes("name")) {
      output.name = output.name ?? text;
      continue;
    }
    if (lowered.includes("point")) {
      output.point = output.point ?? text;
      continue;
    }
    if (lowered.includes("schedule_type")) {
      output.schedule_type = output.schedule_type ?? text;
      continue;
    }
    if (lowered.includes("starts_on")) {
      output.starts_on = output.starts_on ?? text;
      continue;
    }
    if (lowered.includes("day_of_week")) {
      output.day_of_week = output.day_of_week ?? text;
      continue;
    }
    if (lowered.includes("interval_days")) {
      output.interval_days = output.interval_days ?? text;
      continue;
    }
    output.base = output.base ?? text;
  }

  return output;
};

const buildPayload = (values: FormValues) => {
  const point = Number(values.point);
  const recurringTask: Record<string, unknown> = {
    name: values.name.trim(),
    description: values.description.trim() || null,
    point,
    schedule_type: "weekly",
    starts_on: values.starts_on,
    active: true,
    day_of_week: Number(values.day_of_week),
  };

  return { recurring_task: recurringTask };
};

const validateValues = (values: FormValues): FormErrors => {
  const errors: FormErrors = {};

  const trimmedName = values.name.trim();
  if (!trimmedName) {
    errors.name = "家事の名前は必須です。";
  } else if (trimmedName.length > 50) {
    errors.name = "家事の名前は50文字以内で入力してください。";
  }

  const point = Number(values.point);
  if (!Number.isInteger(point) || point < 1 || point > 5) {
    errors.point = "負担ポイントは1〜5の整数で入力してください。";
  }

  if (!values.starts_on) {
    errors.starts_on = "開始日は必須です。";
  }

  const day = Number(values.day_of_week);
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    errors.day_of_week = "開始曜日は0〜6で選択してください。";
  }

  return errors;
};

const recurringTaskToFormValues = (task: RecurringTask): FormValues => ({
  name: task.name,
  description: task.description ?? "",
  point: String(task.point),
  schedule_type: "weekly",
  starts_on: task.starts_on,
  day_of_week: String(task.day_of_week ?? 1),
  interval_days: "",
});

export default function RecurringTaskManager({
  groupId,
  apiUrl,
  canManage,
}: Props) {
  const { data: session } = useSession();
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<RecurringTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formValues, setFormValues] = useState<FormValues>(defaultFormValues);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const token = (session?.user as { idToken?: string } | undefined)?.idToken;
  const base = useMemo(() => apiUrl?.replace(/\/+$/, ""), [apiUrl]);
  const v1Base = useMemo(() => {
    if (!base) {
      return undefined;
    }
    return base.endsWith("/api/v1") ? base : `${base}/api/v1`;
  }, [base]);

  const loadRows = () => {
    if (!groupId || !v1Base || !token) {
      return;
    }

    setLoading(true);
    setNotice(null);

    fetch(`${v1Base}/groups/${encodeURIComponent(groupId)}/recurring_tasks`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          const message =
            (data as { message?: string; error?: string } | null)?.message ??
            (data as { message?: string; error?: string } | null)?.error ??
            `周期タスク一覧の取得に失敗しました。(status: ${res.status})`;
          throw new Error(message);
        }

        const payload = await res.json().catch(() => null);
        const normalized = extractRows(payload).map(normalizeRow);
        setRows(normalized);
      })
      .catch((error) => {
        setNotice(
          error instanceof Error ? error.message : "一覧取得に失敗しました。",
        );
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadRows();
  }, [groupId, v1Base, token]);

  const startCreate = () => {
    setEditingId(null);
    setShowForm(true);
    setFormValues(defaultFormValues());
    setFormErrors({});
    setNotice(null);
  };

  const startEdit = (id: string) => {
    if (!v1Base || !token) {
      setNotice("認証情報またはAPI設定が不足しています。");
      return;
    }

    setNotice(null);
    setFormErrors({});

    startTransition(async () => {
      const res = await fetch(
        `${v1Base}/recurring_tasks/${encodeURIComponent(id)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        },
      ).catch(() => null);

      if (!res) {
        setNotice("周期タスク詳細の取得に失敗しました。");
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message =
          (data as { message?: string; error?: string } | null)?.message ??
          (data as { message?: string; error?: string } | null)?.error ??
          `周期タスク詳細の取得に失敗しました。(status: ${res.status})`;
        setNotice(message);
        return;
      }

      const payload = await res.json().catch(() => null);
      const row = normalizeRow(payload, 0);
      setEditingId(id);
      setShowForm(true);
      setFormValues(recurringTaskToFormValues(row));
    });
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!groupId || !v1Base || !token) {
      setNotice("認証情報またはAPI設定が不足しています。");
      return;
    }

    const errors = validateValues(formValues);
    setFormErrors(errors);
    setNotice(null);

    if (Object.keys(errors).length > 0) {
      return;
    }

    if (editingId && !canManage) {
      setNotice("管理者のみ操作できます。");
      return;
    }

    const payload = buildPayload(formValues);

    startTransition(async () => {
      const endpoint = editingId
        ? `${v1Base}/recurring_tasks/${encodeURIComponent(editingId)}`
        : `${v1Base}/groups/${encodeURIComponent(groupId)}/recurring_tasks`;

      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }).catch(() => null);

      if (!res) {
        setNotice("周期タスクの保存に失敗しました。");
        return;
      }

      if (res.status === 422) {
        const data = await res.json().catch(() => null);
        setFormErrors(mapApiErrors(data));
        setNotice("入力内容を確認してください。");
        return;
      }

      if (res.status === 403) {
        const data = await res.json().catch(() => null);
        const message =
          (data as { message?: string; error?: string } | null)?.message ??
          (data as { message?: string; error?: string } | null)?.error ??
          "操作権限がありません。";
        setNotice(message);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message =
          (data as { message?: string; error?: string } | null)?.message ??
          (data as { message?: string; error?: string } | null)?.error ??
          `周期タスクの保存に失敗しました。(status: ${res.status})`;
        setNotice(message);
        return;
      }

      setFormErrors({});
      setNotice(
        editingId ? "周期タスクを更新しました。" : "周期タスクを作成しました。",
      );
      setEditingId(null);
      setShowForm(false);
      setFormValues(defaultFormValues());
      loadRows();
    });
  };

  const onDelete = (id: string) => {
    if (!v1Base || !token) {
      setNotice("認証情報またはAPI設定が不足しています。");
      return;
    }

    if (!canManage) {
      setNotice("管理者のみ操作できます。");
      return;
    }

    const ok = window.confirm("この周期タスクを削除しますか？");
    if (!ok) {
      return;
    }

    startTransition(async () => {
      const res = await fetch(
        `${v1Base}/recurring_tasks/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      ).catch(() => null);

      if (!res) {
        setNotice("周期タスク削除に失敗しました。");
        return;
      }

      if (res.status === 403) {
        const data = await res.json().catch(() => null);
        const message =
          (data as { message?: string; error?: string } | null)?.message ??
          (data as { message?: string; error?: string } | null)?.error ??
          "操作権限がありません。";
        setNotice(message);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message =
          (data as { message?: string; error?: string } | null)?.message ??
          (data as { message?: string; error?: string } | null)?.error ??
          `周期タスク削除に失敗しました。(status: ${res.status})`;
        setNotice(message);
        return;
      }

      setNotice("周期タスクを削除しました。");
      setRows((prev) => prev.filter((row) => row.id !== id));
      if (editingId === id) {
        setEditingId(null);
        setShowForm(false);
        setFormValues(defaultFormValues());
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-900/40">
      <div className="mb-3 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <h3 className="text-sm font-semibold sm:text-base">周期タスク</h3>
        <div className="flex items-center gap-3">
          {showForm ? (
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setFormErrors({});
                setNotice(null);
              }}
              className="text-xs font-semibold text-slate-500 hover:underline disabled:opacity-60"
              disabled={isPending}
            >
              フォームを閉じる
            </button>
          ) : null}
          <button
            type="button"
            onClick={startCreate}
            className="text-xs font-semibold text-blue-600 hover:underline disabled:opacity-60"
            disabled={isPending}
          >
            新規作成
          </button>
        </div>
      </div>

      {!canManage ? (
        <p className="mb-2 text-xs text-slate-500">
          新規作成は可能です。編集・削除は管理者のみ操作できます。
        </p>
      ) : null}

      {loading ? <p className="text-xs text-slate-500">読み込み中...</p> : null}

      {!loading && rows.length === 0 ? (
        <p className="mb-3 text-xs text-slate-500">
          周期タスクはまだありません。
        </p>
      ) : null}

      {rows.length > 0 ? (
        <div className="mb-4 overflow-x-auto rounded-md border">
          <table className="min-w-[640px] w-full border-collapse text-xs sm:text-sm">
            <thead className="bg-slate-50 text-left text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              <tr>
                <th className="px-2 py-2 font-semibold">家事の名前</th>
                <th className="px-2 py-2 font-semibold">周期</th>
                <th className="px-2 py-2 font-semibold">開始日</th>
                <th className="px-2 py-2 font-semibold">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t align-top">
                  <td className="px-2 py-2">{row.name}</td>
                  <td className="px-2 py-2">
                    {scheduleTypeLabel(row.schedule_type)}
                  </td>
                  <td className="px-2 py-2">{row.starts_on}</td>
                  <td className="px-2 py-2">
                    {canManage ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(row.id)}
                          className="rounded-md border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isPending}
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(row.id)}
                          className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isPending}
                        >
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
      ) : null}

      {showForm ? (
        <form onSubmit={onSubmit} className="space-y-3 rounded-md border p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs sm:text-sm">
              <span className="mb-1 block font-semibold">家事の名前</span>
              <input
                value={formValues.name}
                onChange={(e) =>
                  setFormValues((prev) => ({ ...prev, name: e.target.value }))
                }
                className="w-full rounded-md border bg-background px-2 py-1"
                maxLength={50}
                disabled={isPending}
                required
              />
              {formErrors.name ? (
                <span className="text-xs text-red-600">{formErrors.name}</span>
              ) : null}
            </label>

            <div className="text-xs sm:text-sm">
              <span className="mb-1 block font-semibold">周期タイプ</span>
              <div className="rounded-md border bg-muted/40 px-2 py-1 text-slate-700 dark:text-slate-200">
                毎週
              </div>
            </div>

            <label className="text-xs sm:text-sm">
              <span className="mb-1 block font-semibold">開始曜日</span>
              <select
                value={formValues.day_of_week}
                onChange={(e) =>
                  setFormValues((prev) => ({
                    ...prev,
                    day_of_week: e.target.value,
                  }))
                }
                className="w-full rounded-md border bg-background px-2 py-1"
                disabled={isPending}
              >
                {dayOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {formErrors.day_of_week ? (
                <span className="text-xs text-red-600">
                  {formErrors.day_of_week}
                </span>
              ) : null}
            </label>

            <label className="text-xs sm:text-sm">
              <span className="mb-1 block font-semibold">
                負担ポイント（1〜5）
              </span>
              <input
                type="number"
                min={1}
                max={5}
                value={formValues.point}
                onChange={(e) =>
                  setFormValues((prev) => ({ ...prev, point: e.target.value }))
                }
                className="w-full rounded-md border bg-background px-2 py-1"
                disabled={isPending}
                required
              />
              {formErrors.point ? (
                <span className="text-xs text-red-600">{formErrors.point}</span>
              ) : null}
            </label>

            <label className="text-xs sm:text-sm">
              <span className="mb-1 block font-semibold">開始日</span>
              <input
                type="date"
                value={formValues.starts_on}
                onChange={(e) =>
                  setFormValues((prev) => ({
                    ...prev,
                    starts_on: e.target.value,
                  }))
                }
                className="w-full rounded-md border bg-background px-2 py-1"
                disabled={isPending}
                required
              />
              {formErrors.starts_on ? (
                <span className="text-xs text-red-600">
                  {formErrors.starts_on}
                </span>
              ) : null}
            </label>

            {formErrors.schedule_type ? (
              <p className="text-xs text-red-600">{formErrors.schedule_type}</p>
            ) : null}

          </div>

          <label className="text-xs sm:text-sm">
            <span className="mb-1 block font-semibold">説明（任意）</span>
            <textarea
              value={formValues.description}
              onChange={(e) =>
                setFormValues((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              className="min-h-20 w-full rounded-md border bg-background px-2 py-1"
              disabled={isPending}
            />
          </label>

          {formErrors.base ? (
            <p className="text-xs text-red-600">{formErrors.base}</p>
          ) : null}
          {notice ? (
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {notice}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={isPending}
            >
              {editingId ? "更新する" : "作成する"}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={startCreate}
                className="text-xs font-semibold text-slate-500 hover:underline disabled:opacity-60"
                disabled={isPending}
              >
                編集をキャンセル
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {!showForm ? (
        <p className="text-xs text-slate-500">
          {canManage
            ? "「新規作成」または一覧の「編集」からフォームを開けます。"
            : "「新規作成」から登録できます。"}
        </p>
      ) : null}
    </div>
  );
}
