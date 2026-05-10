"use client";
import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { handleGuestSessionExpiryResponse } from "@/lib/guest-session-client";

type Props = {
  groupId?: string;
  apiUrl?: string;
};
type AnyRecord = Record<string, unknown>;

const asRecord = (value: unknown): AnyRecord | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as AnyRecord;
};

// タスク作成後のレスポンスから task_id を抽出
const extractCreatedTaskId = (payload: unknown): string | undefined => {
  const root = asRecord(payload);
  if (!root) {
    return undefined;
  }

  const task =
    asRecord(root.task) ?? asRecord(root.data) ?? asRecord(asRecord(root.data)?.task);
  const source = task ?? root;
  const id = source.id ?? source.task_id;

  if (typeof id === "string" && id.trim()) {
    return id;
  }
  if (typeof id === "number") {
    return String(id);
  }
  return undefined;
};

// APIからのエラーメッセージを取得
const pickErrorMessage = (payload: unknown, fallback: string, status?: number) => {
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
  return status ? `${fallback}(status: ${status})` : fallback;
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
export default function GroupTaskCreateButton({ groupId, apiUrl }: Props) {
  const router = useRouter();
  const { data: session } = useSession();
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

      const token = (session?.user as { idToken?: string } | undefined)
        ?.idToken;
      const base = apiUrl?.replace(/\/+$/, "");
      const v1Base = base?.endsWith("/api/v1") ? base : `${base}/api/v1`;

      if (!base || !token) {
        setError("認証情報またはAPI設定が不足しています。");
        return;
      }

      const endpoint = `${v1Base}/groups/${encodeURIComponent(groupId)}/tasks`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          task: {
            name: trimmedName,
            point: parsedPoint,
            description: trimmedDescription || null,
          },
        }),
      }).catch(() => null);

      if (!res) {
        setError("タスク作成に失敗しました。");
        return;
      }

      if (
        await handleGuestSessionExpiryResponse({
          response: res,
          sessionUser: session?.user,
          onRedirect: (path) => router.replace(path),
        })
      ) {
        return;
      }

      if (res.ok) {
        const created = (await res.json().catch(() => null)) as unknown;
        const createdTaskId = extractCreatedTaskId(created);

        if (!createdTaskId) {
          setError("タスクは作成されましたが task_id を取得できませんでした。");
          router.refresh();
          return;
        }

        const assignmentEndpoint = `${v1Base}/tasks/${encodeURIComponent(
          createdTaskId,
        )}/assignments`;
        const assignmentRes = await fetch(assignmentEndpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            assignment: {
              status: "not_started",
            },
          }),
        }).catch(() => null);

        if (
          await handleGuestSessionExpiryResponse({
            response: assignmentRes,
            sessionUser: session?.user,
            onRedirect: (path) => router.replace(path),
          })
        ) {
          return;
        }

        if (assignmentRes?.status === 201) {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("kajishare:task-assigned"));
          }
        } else {
          const assignmentError = await assignmentRes?.json().catch(() => null);
          const message = pickErrorMessage(
            assignmentError,
            `割り振り作成に失敗しました。(status: ${
              assignmentRes?.status ?? "network"
            })`,
          );
          setError(`タスク作成後の割り振り作成に失敗: ${message}`);
        }

        setName("");
        setPoint("");
        setDescription("");
        router.refresh();
        return;
      }

      const data = await res.json().catch(() => null);
      const nameErrors = pickNameErrors(data);

      if (res.status === 422 && nameErrors.length > 0) {
        setError(`家事の名前: ${nameErrors.join(" / ")}`);
        return;
      }

      setError(pickErrorMessage(data, "タスク作成に失敗しました。", res.status));
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
