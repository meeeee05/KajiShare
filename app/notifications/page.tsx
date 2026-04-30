"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { GUEST_EXPIRED_MESSAGE } from "@/lib/guest-session";
import { handleGuestSessionExpiryResponse } from "@/lib/guest-session-client";

type NotificationType = "member_joined" | "task_assigned" | "task_evaluated";

type NotificationItem = {
  type: string;
  title: string;
  message: string;
  occurredAt: string;
  sourceIndex: number;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const POLLING_INTERVAL_MS = 45_000;

const parseLimit = (rawLimit: string | null): number => {
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.floor(parsed), MAX_LIMIT);
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const pickString = (record: Record<string, unknown> | null, key: string) => {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
};

const normalizeNotifications = (payload: unknown): NotificationItem[] => {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const list = data?.notifications;

  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((item, index) => {
      const row = asRecord(item);
      if (!row) {
        return null;
      }

      return {
        type: pickString(row, "type"),
        title: pickString(row, "title") || "タイトルなし",
        message: pickString(row, "message") || "",
        occurredAt: pickString(row, "occurred_at"),
        sourceIndex: index,
      };
    })
    .filter((item): item is NotificationItem => item !== null)
    .sort((a, b) => {
      const aTime = Date.parse(a.occurredAt);
      const bTime = Date.parse(b.occurredAt);
      const aValid = Number.isFinite(aTime);
      const bValid = Number.isFinite(bTime);

      if (aValid && bValid && aTime !== bTime) {
        return bTime - aTime;
      }

      if (aValid && !bValid) {
        return -1;
      }

      if (!aValid && bValid) {
        return 1;
      }

      return a.sourceIndex - b.sourceIndex;
    });
};

const typeMeta: Record<NotificationType, { label: string; className: string }> =
  {
    member_joined: {
      label: "参加",
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
    },
    task_assigned: {
      label: "割当",
      className:
        "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
    },
    task_evaluated: {
      label: "評価",
      className:
        "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
    },
  };

const getTypeMeta = (type: string) => {
  if (type in typeMeta) {
    return typeMeta[type as NotificationType];
  }

  return {
    label: "通知",
    className:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
  };
};

const formatOccurredAt = (raw: string) => {
  const time = Date.parse(raw);
  if (!Number.isFinite(time)) {
    return "日時不明";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
};

export default function NotificationsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const limit = useMemo(
    () => parseLimit(searchParams.get("limit")),
    [searchParams],
  );

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await fetch(`/api/notifications?limit=${limit}`, {
        cache: "no-store",
      });

      if (
        await handleGuestSessionExpiryResponse({
          response,
          sessionUser: session?.user,
          onRedirect: (path) => router.replace(path),
        })
      ) {
        setError(GUEST_EXPIRED_MESSAGE);
        return;
      }

      if (!response.ok) {
        throw new Error("notify fetch failed");
      }

      const payload = (await response.json()) as unknown;
      setNotifications(normalizeNotifications(payload));
      setError(null);
    } catch {
      setError("通知の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [limit, router, session?.user]);

  useEffect(() => {
    setLoading(true);
    void fetchNotifications();

    const timer = window.setInterval(() => {
      void fetchNotifications();
    }, POLLING_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [fetchNotifications]);

  return (
    <div className="prose max-w-none p-4 sm:p-6">
      <h1 className="inline-block w-full border-b-2 border-current pb-1 text-2xl font-extrabold">
        通知
      </h1>

      <div className="not-prose mt-6 space-y-3">
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            通知の取得に失敗しました
          </div>
        ) : null}

        {loading && notifications.length === 0 ? (
          <div className="rounded-md border bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
            読み込み中...
          </div>
        ) : null}

        {!loading && notifications.length === 0 ? (
          <div className="rounded-md border bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
            通知はありません
          </div>
        ) : null}

        {notifications.map((notification, index) => {
          const meta = getTypeMeta(notification.type);

          return (
            <article
              key={`${notification.occurredAt}-${notification.title}-${index}`}
              className="rounded-lg border bg-white px-4 py-3 shadow-sm dark:bg-slate-950"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {notification.title}
                </h2>
                <span
                  className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${meta.className}`}
                >
                  {meta.label}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                {notification.message}
              </p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {formatOccurredAt(notification.occurredAt)}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
