"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { GUEST_EXPIRED_MESSAGE } from "@/lib/guest-session";
import { handleGuestSessionExpiryResponse } from "@/lib/guest-session-client";

type NotificationType = "member_joined" | "task_assigned" | "task_evaluated";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  occurredAt: string;
};

type DebugEnvelope = {
  debug?: {
    request?: {
      endpoint?: string;
      headers?: {
        Authorization?: string;
      };
    };
    response?: {
      status?: number;
    };
  };
  data?: unknown;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const parseLimit = (rawLimit: string | null): number => {
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.floor(parsed), MAX_LIMIT);
};

const parseOccurredAtMs = (raw: string): number => {
  const direct = Date.parse(raw);
  if (Number.isFinite(direct)) {
    return direct;
  }

  const trimmed = raw.trim();
  const match = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?(?:\s*(Z|[+-]\d{2}:?\d{2}))?$/,
  );

  if (!match) {
    return Number.NaN;
  }

  const [, y, m, d, hh, mm, ssRaw, msRaw, tzRaw] = match;
  const ss = ssRaw ?? "00";
  const ms = msRaw ? msRaw.slice(0, 3).padEnd(3, "0") : "000";

  if (tzRaw) {
    const tz = tzRaw === "Z" ? "Z" : tzRaw.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
    return Date.parse(`${y}-${m}-${d}T${hh}:${mm}:${ss}.${ms}${tz}`);
  }

  return new Date(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(hh),
    Number(mm),
    Number(ss),
    Number(ms),
  ).getTime();
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const unwrapDebugPayload = (payload: unknown): unknown => {
  const root = asRecord(payload);
  if (!root) {
    return payload;
  }

  if ("debug" in root && "data" in root) {
    return root.data;
  }

  return payload;
};

const extractDataNotifications = (payload: unknown): unknown[] => {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const list = data?.notifications;
  return Array.isArray(list) ? list : [];
};

const normalizeNotifications = (payload: unknown): NotificationItem[] => {
  const rows = extractDataNotifications(payload);
  const deduped = new Map<string, NotificationItem>();
  const withoutId: NotificationItem[] = [];

  for (const row of rows) {
    const item = asRecord(row);
    if (!item) {
      continue;
    }

    const rawId = item.id;
    const id =
      typeof rawId === "string"
        ? rawId
        : typeof rawId === "number"
          ? String(rawId)
          : "";

    const type = typeof item.type === "string" ? item.type : "";
    const title = typeof item.title === "string" ? item.title : "";
    const message = typeof item.message === "string" ? item.message : "";
    const occurredAt =
      typeof item.occurred_at === "string" ? item.occurred_at : "";

    const normalized: NotificationItem = {
      id,
      type,
      title,
      message,
      occurredAt,
    };

    if (id) {
      if (!deduped.has(id)) {
        deduped.set(id, normalized);
      }
      continue;
    }

    withoutId.push(normalized);
  }

  return [...deduped.values(), ...withoutId].sort((a, b) => {
    const aTime = parseOccurredAtMs(a.occurredAt);
    const bTime = parseOccurredAtMs(b.occurredAt);
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

    return 0;
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
  const time = parseOccurredAtMs(raw);
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
  const debugMode = searchParams.get("debug") === "1";
  const currentUserId =
    (session?.user as { id?: string } | undefined)?.id ?? session?.user?.email ?? "";

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugPayload, setDebugPayload] = useState<unknown | null>(null);
  const [debugInfo, setDebugInfo] = useState<DebugEnvelope["debug"] | null>(
    null,
  );

  const requestSeqRef = useRef(0);
  const activeUserRef = useRef(currentUserId);

  const fetchNotifications = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    const requestUser = currentUserId;

    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (debugMode) {
        params.set("debug", "1");
      }

      const response = await fetch(`/api/notifications?${params.toString()}`, {
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

      if (seq !== requestSeqRef.current || requestUser !== activeUserRef.current) {
        return;
      }

      const backendPayload = unwrapDebugPayload(payload);
      const normalized = normalizeNotifications(backendPayload);

      console.log("[notifications-debug]", {
        currentUserId: requestUser,
        "notifications.length": normalized.length,
        "notifications.map": normalized.map((n) => ({
          id: n.id,
          type: n.type,
          occurred_at: n.occurredAt,
        })),
      });

      setNotifications(normalized);
      setDebugPayload(payload);
      setDebugInfo(asRecord(payload)?.debug as DebugEnvelope["debug"]);
      setError(null);
    } catch {
      if (seq !== requestSeqRef.current || requestUser !== activeUserRef.current) {
        return;
      }
      setError("通知の取得に失敗しました");
    } finally {
      if (seq === requestSeqRef.current && requestUser === activeUserRef.current) {
        setLoading(false);
      }
    }
  }, [currentUserId, debugMode, limit, router, session?.user]);

  useEffect(() => {
    activeUserRef.current = currentUserId;
    setNotifications([]);
    setLoading(true);
    setError(null);
    void fetchNotifications();
  }, [currentUserId, fetchNotifications]);

  useEffect(() => {
    const onGroupJoined = () => {
      void fetchNotifications();
    };

    const onFocus = () => {
      void fetchNotifications();
    };

    window.addEventListener("kajishare:group-joined", onGroupJoined);
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("kajishare:group-joined", onGroupJoined);
      window.removeEventListener("focus", onFocus);
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

        {debugMode ? (
          <div className="rounded-md border border-slate-300 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <p className="font-semibold">Debug</p>
            <p>source: data.notifications (fixed)</p>
            <p>normalized count: {notifications.length}</p>
            <p>
              task_assigned count: {
                notifications.filter((item) => item.type === "task_assigned").length
              }
            </p>
            <p>
              member_joined count: {
                notifications.filter((item) => item.type === "member_joined").length
              }
            </p>
            <p>status: {String(debugInfo?.response?.status ?? "(unknown)")}</p>
            <details className="mt-2">
              <summary className="cursor-pointer font-medium">response body</summary>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-200 bg-white p-2 text-[11px] dark:border-slate-700 dark:bg-slate-950">
                {JSON.stringify(debugPayload, null, 2)}
              </pre>
            </details>
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
              key={notification.id || `${notification.occurredAt}-${index}`}
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
