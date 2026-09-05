"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTaskResourceAction } from "@/app/actions";

type Props = {
  taskId?: string;
  groupId?: string;
  textOnly?: boolean;
  resourceType?: "task" | "recurring";
};

export default function TaskResourceDeleteButton({
  taskId,
  groupId,
  textOnly,
  resourceType = "task",
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onDelete = () => {
    if (!taskId) {
      setError("タスクIDがないため削除できません。");
      return;
    }

    const label = resourceType === "recurring" ? "周期タスク" : "タスク";
    const ok = window.confirm(`この${label}を削除しますか？`);
    if (!ok) {
      return;
    }

    startTransition(async () => {
      setError(null);

      const result = await deleteTaskResourceAction({ taskId, resourceType });
      if (result.redirectTo) {
        router.replace(result.redirectTo);
        return;
      }

      if (result.ok) {
        router.refresh();
        return;
      }

      setError(result.error ?? `${label}削除に失敗しました。`);
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onDelete}
        disabled={isPending || !taskId}
        className={
          textOnly
            ? "text-xs font-semibold text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            : "rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        削除
      </button>
      {error ? <span className="text-[10px] text-red-600">{error}</span> : null}
    </div>
  );
}
