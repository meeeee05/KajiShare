"use client";
import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTaskAction } from "@/app/actions";

type Props = {
  groupId?: string;
};

const pickNameErrors = (payload: unknown) => {
  const data =
    payload && typeof payload === "object"
      ? (payload as { errors?: Record<string, unknown> })
      : null;
  const nameErrors = data?.errors?.name;

  return Array.isArray(nameErrors)
    ? nameErrors.filter((item): item is string => typeof item === "string")
    : [];
};

// タスク作成と割り振り作成
export default function GroupTaskCreateButton({ groupId }: Props) {
  const router = useRouter();
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

    if (!trimmedName || !trimmedPoint) {
      setError("家事の名前 / 負担ポイント は必須です。");
      return;
    }

    const parsedPoint = Number(trimmedPoint);
    if (!Number.isInteger(parsedPoint) || parsedPoint < 1 || parsedPoint > 5) {
      setError("負担ポイント は1〜5の整数で選択してください。");
      return;
    }

    startTransition(async () => {
      setError(null);

      const result = await createTaskAction({
        groupId,
        name: trimmedName,
        point: parsedPoint,
        description: trimmedDescription || null,
      });

      if (result.redirectTo) {
        router.replace(result.redirectTo);
        return;
      }

      if (result.ok) {
        window.dispatchEvent(new CustomEvent("kajishare:task-assigned"));

        setName("");
        setPoint("");
        setDescription("");
        router.refresh();
        return;
      }

      const nameErrors = pickNameErrors(result.payload);

      if (result.status === 422 && nameErrors.length > 0) {
        setError(`家事の名前: ${nameErrors.join(" / ")}`);
        return;
      }

      setError(result.error ?? "タスク作成に失敗しました。");
    });
  };

  return (
    <form onSubmit={onCreate} className="w-full rounded-md border p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_minmax(0,2.2fr)_auto] sm:items-center">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="家事の名前"
          required
          disabled={isPending || !groupId}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        />
        <select
          value={point}
          onChange={(e) => setPoint(e.target.value)}
          required
          disabled={isPending || !groupId}
          className={`rounded-md border bg-background px-2 py-1 text-sm ${
            point === "" ? "text-slate-400" : "text-foreground"
          }`}
        >
          <option value="" disabled>
            負担ポイント（1〜5）
          </option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5</option>
        </select>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="備考"
          disabled={isPending || !groupId}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={isPending || !groupId}
          className="inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:whitespace-nowrap"
        >
          タスクを登録
        </button>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </form>
  );
}
