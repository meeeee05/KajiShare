"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  groupId?: string;
  shareKey?: string;
  groupName: string;
};

export default function GroupLeaveLink({
  groupId,
  shareKey,
  groupName,
}: Props) {
  const router = useRouter();
  const [isLeaving, setIsLeaving] = useState(false);

  const canLeave = Boolean(groupId || shareKey);

  const onLeave = async () => {
    if (!canLeave || isLeaving) {
      return;
    }

    const ok = window.confirm(
      `「${groupName}」から退会しますか？\nグループ自体は削除されず、あなたのみ退会します。`,
    );

    if (!ok) {
      return;
    }

    setIsLeaving(true);

    const res = await fetch("/api/groups/leave", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ groupId, shareKey }),
    }).catch(() => null);

    if (!res?.ok) {
      const data = await res?.json().catch(() => null);
      window.alert(
        (data as any)?.error ??
          "退会に失敗しました。時間をおいて再度お試しください。",
      );
      setIsLeaving(false);
      return;
    }

    router.refresh();
  };

  if (!canLeave) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onLeave}
      disabled={isLeaving}
      className="text-sm font-semibold text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isLeaving ? "退会中..." : "退会"}
    </button>
  );
}
