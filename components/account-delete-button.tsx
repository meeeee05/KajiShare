"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useSession } from "next-auth/react";
import { handleGuestSessionExpiryResponse } from "@/lib/guest-session-client";

type Props = {
  apiUrl?: string;
};

export default function AccountDeleteButton({ apiUrl }: Props) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: session } = useSession();

  const callDeleteApi = async () => {
    const token = (session?.user as any)?.idToken as string | undefined;
    const userId = (session?.user as any)?.id as string | number | undefined;
    const base = apiUrl?.replace(/\/+$/, "");

    if (!base || !token) {
      return { ok: false, error: "認証情報が不足しています。" };
    }

    const endpoints: Array<{ method: "DELETE"; url: string }> = [
      { method: "DELETE", url: `${base}/users/me` },
    ];

    if (userId != null) {
      endpoints.push({
        method: "DELETE",
        url: `${base}/users/${encodeURIComponent(String(userId))}`,
      });
    }

    let lastError = "アカウント削除に失敗しました。";

    for (const endpoint of endpoints) {
      const res = await fetch(endpoint.url, {
        method: endpoint.method,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }).catch(() => null);

      if (
        await handleGuestSessionExpiryResponse({
          response: res,
          sessionUser: session?.user,
          onRedirect: (path) => {
            window.location.replace(path);
          },
        })
      ) {
        return { ok: false, error: undefined };
      }

      if (!res) {
        continue;
      }

      const data = await res.json().catch(() => null);

      if (res.ok) {
        return { ok: true };
      }

      lastError =
        (data as any)?.error ??
        (data as any)?.message ??
        `アカウント削除に失敗しました。(status: ${res.status})`;
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
        setError(result.error ?? "アカウント削除に失敗しました。");
        return;
      }

      await signOut({ callbackUrl: "/auth/signin" });
    } catch (e) {
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
