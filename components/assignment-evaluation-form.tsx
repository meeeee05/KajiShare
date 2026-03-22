"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type Props = {
  assignmentId?: string;
  apiUrl?: string;
};

export default function AssignmentEvaluationForm({ assignmentId, apiUrl }: Props) {
  const router = useRouter();
  const { data: session } = useSession();
  const [isPending, startTransition] = useTransition();
  const [score, setScore] = useState("3");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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

      const token = (session?.user as { idToken?: string } | undefined)?.idToken;
      const base = apiUrl?.replace(/\/+$/, "");
      const v1Base = base?.endsWith("/api/v1") ? base : `${base}/api/v1`;

      if (!base || !v1Base || !token) {
        setError("認証情報またはAPI設定が不足しています。");
        return;
      }

      const endpoints = [
        `${v1Base}/assignments/${encodeURIComponent(assignmentId)}/evaluations`,
        `${v1Base}/evaluations`,
      ];

      const payloads = [
        {
          evaluation: {
            score: parsedScore,
            comment: comment.trim(),
          },
        },
        {
          evaluation: {
            point: parsedScore,
            comment: comment.trim(),
          },
        },
        {
          assignment_id: assignmentId,
          score: parsedScore,
          comment: comment.trim(),
        },
      ];

      let lastError = "評価の登録に失敗しました。";

      for (const endpoint of endpoints) {
        for (const payload of payloads) {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }).catch(() => null);

          if (!res) {
            continue;
          }

          if (res.ok) {
            setComment("");
            setScore("3");
            router.refresh();
            return;
          }

          const data = await res.json().catch(() => null);
          lastError =
            (data as { error?: string; message?: string } | null)?.error ??
            (data as { error?: string; message?: string } | null)?.message ??
            `評価の登録に失敗しました。(status: ${res.status})`;
        }
      }

      setError(lastError);
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
        placeholder="コメント"
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
    </form>
  );
}
