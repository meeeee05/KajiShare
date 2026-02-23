"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

export default function AccountDeleteButton() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const res = await fetch("/api/account", { method: "DELETE" });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError((data as any)?.error ?? "アカウント削除に失敗しました。");
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
