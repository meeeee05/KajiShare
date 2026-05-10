"use client";

import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { handleGuestSessionExpiryResponse } from "@/lib/guest-session-client";

type Props = {
  apiUrl?: string;
};
type SessionUser = {
  id?: string | number;
  idToken?: string;
};
type DeleteResult = {
  ok: boolean;
  error?: string;
};

const defaultError = "アカウント削除に失敗しました。";

// APIからのエラーメッセージを取得
const pickErrorMessage = (payload: unknown, status: number): string => {
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

export default function AccountDeleteButton({ apiUrl }: Props) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: session } = useSession();
  const sessionUser = session?.user as SessionUser | undefined;

  const callDeleteApi = async (): Promise<DeleteResult> => {
    const token = sessionUser?.idToken;
    const userId = sessionUser?.id;
    const base = apiUrl?.replace(/\/+$/, "");

    if (!base || !token) {
      return { ok: false, error: "認証情報が不足しています。" };
    }

    const endpoints = [
      `${base}/users/me`,
      userId != null
        ? `${base}/users/${encodeURIComponent(String(userId))}`
        : undefined,
    ].filter((url): url is string => Boolean(url));
    let lastError = defaultError;

    for (const endpoint of endpoints) {
      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }).catch(() => null);

      if (
        await handleGuestSessionExpiryResponse({
          response: res,
          sessionUser,
          onRedirect: (path) => {
            window.location.replace(path);
          },
        })
      ) {
        return { ok: false };
      }

      if (!res) {
        continue;
      }

      const data = await res.json().catch(() => null);

      if (res.ok) {
        return { ok: true };
      }
      lastError = pickErrorMessage(data, res.status);
    }
    return { ok: false, error: lastError };
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      "本当にアカウントを削除しますか？この操作は取り消せません。",
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const result = await callDeleteApi();
      if (!result.ok) {
        setError(result.error ?? defaultError);
        return;
      }

      await signOut({ callbackUrl: "/auth/signin" });
    } catch {
      setError("アカウント削除中にエラーが発生しました。");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="mt-10 flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        className="text-sm font-semibold text-red-600 hover:underline disabled:opacity-50"
      >
        {isDeleting ? "削除中..." : "アカウントを削除する"}
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
