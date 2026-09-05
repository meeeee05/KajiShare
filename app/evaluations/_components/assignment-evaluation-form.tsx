"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEvaluationAction } from "@/app/actions";

type Props = {
  assignmentId?: string;
  taskId?: string;
};

const defaultError = "評価の登録に失敗しました。";

// APIからのエラーメッセージを取得
const pickErrorMessage = (payload: unknown, status: number) => {
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
  return `${defaultError}(status: ${status})`;
};

const removeEvaluationRow = (
  formElement: HTMLFormElement,
  taskId?: string,
) => {
  const normalizedTaskId = taskId?.trim();

  if (normalizedTaskId) {
    const rows = document.querySelectorAll(
      `tr[data-task-id="${CSS.escape(normalizedTaskId)}"]`,
    );
    rows.forEach((row) => row.remove());
    return;
  }

  formElement.closest("tr")?.remove();
};

export default function AssignmentEvaluationForm({
  assignmentId,
  taskId,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [score, setScore] = useState("3");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;

    if (!assignmentId) {
      setError("assignment_id がないため評価できません。");
      return;
    }

    const parsedScore = Number(score);
    if (!Number.isFinite(parsedScore) || parsedScore < 1 || parsedScore > 5) {
      setError("評価は1〜5で入力してください。");
      return;
    }

    const ok = window.confirm("この内容で評価を登録します。よろしいですか？");
    if (!ok) {
      return;
    }

    startTransition(async () => {
      setError(null);
      setInfo(null);

      const result = await createEvaluationAction({
        assignmentId,
        score: parsedScore,
        comment: comment.trim(),
      });

      if (result.redirectTo) {
        router.replace(result.redirectTo);
        return;
      }

      if (result.ok) {
        setComment("");
        setScore("3");
        removeEvaluationRow(formElement, taskId);
        return;
      }

      if (result.status === 422) {
        setInfo("評価済み");
        setTimeout(() => {
          removeEvaluationRow(formElement, taskId);
        }, 300);
        return;
      }

      setError(
        result.error ??
          pickErrorMessage(result.payload, result.status || 500),
      );
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <select
        value={score}
        onChange={(e) => setScore(e.target.value)}
        disabled={isPending || !assignmentId}
        className="rounded-md border bg-background px-2 py-1 text-xs"
      >
        <option value="5">5</option>
        <option value="4">4</option>
        <option value="3">3</option>
        <option value="2">2</option>
        <option value="1">1</option>
      </select>
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="フィードバックコメント"
        disabled={isPending || !assignmentId}
        className="w-40 rounded-md border bg-background px-2 py-1 text-xs"
      />
      <button
        type="submit"
        disabled={isPending || !assignmentId}
        className="rounded-md border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950"
      >
        {isPending ? "送信中..." : "評価する"}
      </button>
      {error ? <span className="text-[10px] text-red-600">{error}</span> : null}
      {info ? <span className="text-[10px] text-slate-500">{info}</span> : null}
    </form>
  );
}
