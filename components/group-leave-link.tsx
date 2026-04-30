"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { handleGuestSessionExpiryResponse } from "@/lib/guest-session-client";

type Props = {
  groupId?: string;
  shareKey?: string;
  groupName: string;
  apiUrl?: string;
};

export default function GroupLeaveLink({
  groupId,
  shareKey,
  groupName,
  apiUrl,
}: Props) {
  const router = useRouter();
  const { data: session } = useSession();
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

    const token = (session?.user as any)?.idToken as string | undefined;
    const base = apiUrl?.replace(/\/+$/, "");
    const v1Base = base?.endsWith("/api/v1") ? base : `${base}/api/v1`;

    if (!base || !v1Base || !token) {
      window.alert("認証情報またはAPI設定が不足しています。");
      setIsLeaving(false);
      return;
    }

    let targetGroupId = groupId;

    if (!targetGroupId && shareKey) {
      const groupsRes = await fetch(`${v1Base}/groups`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      }).catch(() => null);

      if (
        await handleGuestSessionExpiryResponse({
          response: groupsRes,
          sessionUser: session?.user,
          onRedirect: (path) => router.replace(path),
        })
      ) {
        setIsLeaving(false);
        return;
      }

      const groupsPayload = await groupsRes?.json().catch(() => null);
      const groups = Array.isArray((groupsPayload as any)?.data)
        ? (groupsPayload as any).data
        : Array.isArray(groupsPayload)
          ? groupsPayload
          : [];

      const found = groups.find((g: any) => {
        const row = g?.group ?? g?.data ?? g;
        return (row?.share_key ?? row?.shareKey) === shareKey;
      });

      const foundRow = found?.group ?? found?.data ?? found;
      targetGroupId = foundRow?.id != null ? String(foundRow.id) : undefined;
    }

    if (!targetGroupId) {
      window.alert("退会対象のグループIDを取得できませんでした。");
      setIsLeaving(false);
      return;
    }

    const res = await fetch(
      `${v1Base}/groups/${encodeURIComponent(targetGroupId)}/leave`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    ).catch(() => null);

    if (
      await handleGuestSessionExpiryResponse({
        response: res,
        sessionUser: session?.user,
        onRedirect: (path) => router.replace(path),
      })
    ) {
      setIsLeaving(false);
      return;
    }

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
