"use client";
import { Button } from "./ui/button";
import { Bell, Settings, Sun } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { SignIn, SignOutMenuItem } from "./auth-components";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";

const POLLING_INTERVAL_MS = 7_000;
const NOTIFICATIONS_LIMIT = 100;

const getSeenKey = (user: { id?: string | null; email?: string | null }) => {
  const stableId = user.id ?? user.email ?? "anonymous";
  return `notifications:lastSeen:${stableId}`;
};

const getSeenFingerprintKey = (user: {
  id?: string | null;
  email?: string | null;
}) => {
  const stableId = user.id ?? user.email ?? "anonymous";
  return `notifications:lastSeenFingerprint:${stableId}`;
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
    const tz =
      tzRaw === "Z" ? "Z" : tzRaw.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
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

const pickFirstString = (
  row: Record<string, unknown>,
  keys: string[],
): string => {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return "";
};

const extractNotifications = (payload: unknown): unknown[] => {
  const root = asRecord(payload);
  if (!root) {
    return [];
  }

  const data = asRecord(root.data);
  const list = data?.notifications;

  return Array.isArray(list) ? list : [];
};

const extractViewerUserId = (payload: unknown): string => {
  const root = asRecord(payload);
  const data = asRecord(root?.data);

  const candidate =
    data?.viewer_user_id ??
    data?.viewerUserId ??
    root?.viewer_user_id ??
    root?.viewerUserId;

  if (typeof candidate === "string") {
    return candidate;
  }
  if (typeof candidate === "number") {
    return String(candidate);
  }

  return "";
};

const unwrapNotificationRow = (
  row: unknown,
): Record<string, unknown> | null => {
  const root = asRecord(row);
  if (!root) {
    return null;
  }

  const rootAttributes = asRecord(root.attributes);
  if (rootAttributes) {
    return {
      ...root,
      ...rootAttributes,
    };
  }

  const notification = asRecord(root.notification);
  const notificationAttributes = asRecord(notification?.attributes);
  if (notificationAttributes) {
    return {
      ...notification,
      ...notificationAttributes,
      id:
        notification?.id ??
        (typeof root.id === "string" || typeof root.id === "number"
          ? root.id
          : undefined),
    };
  }

  const rowData = asRecord(root.data);
  const rowDataAttributes = asRecord(rowData?.attributes);
  if (rowDataAttributes) {
    return {
      ...rowData,
      ...rowDataAttributes,
      id:
        rowData?.id ??
        (typeof root.id === "string" || typeof root.id === "number"
          ? root.id
          : undefined),
    };
  }

  return notification ?? rowData ?? root;
};

const pickTimestamp = (row: Record<string, unknown>): string | null => {
  const keys = ["occurred_at", "occurredAt", "created_at", "createdAt"];

  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
};

const buildNotificationFingerprint = (
  row: Record<string, unknown>,
  occurredAt: string,
): string => {
  const id = pickFirstString(row, ["id"]);
  const type = pickFirstString(row, ["type"]);
  const title = pickFirstString(row, ["title"]);
  const message = pickFirstString(row, ["message"]);

  return [id, type, title, message, occurredAt].join("|");
};

const extractLatestNotificationMeta = (
  payload: unknown,
): { occurredAt: string; fingerprint: string } | null => {
  const notifications = extractNotifications(payload);

  if (!Array.isArray(notifications) || notifications.length === 0) {
    return null;
  }

  let latest: { occurredAt: string; fingerprint: string } | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const row of notifications) {
    const item = unwrapNotificationRow(row);
    if (!item) {
      continue;
    }

    const occurredAt = pickTimestamp(item);
    if (!occurredAt) {
      continue;
    }

    const fingerprint = buildNotificationFingerprint(item, occurredAt);

    const time = parseOccurredAtMs(occurredAt);
    if (!Number.isFinite(time)) {
      continue;
    }

    if (time > latestTime) {
      latestTime = time;
      latest = { occurredAt, fingerprint };
      continue;
    }

    if (time === latestTime && latest && latest.fingerprint !== fingerprint) {
      latest = { occurredAt, fingerprint };
    }
  }

  return latest;
};

const extractLatestTaskAssignedEventId = (payload: unknown): string => {
  const root = asRecord(payload);
  const data = asRecord(root?.data);

  const candidate =
    data?.latest_task_assigned_event_id ?? data?.latestTaskAssignedEventId;

  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }
  if (typeof candidate === "number") {
    return String(candidate);
  }

  return "";
};

export default function UserButton() {
  // クライアント側でセッション取得
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const isGuest = (session?.user as { isGuest?: boolean } | undefined)?.isGuest;
  const secondaryLabel = (session?.user as any)?.account_type
    ? (session?.user as any)?.account_type
    : isGuest
      ? ""
      : session?.user?.email;
  const [hasNewNotification, setHasNewNotification] = useState(false);
  const [latestOccurredAt, setLatestOccurredAt] = useState<string | null>(null);
  const [latestFingerprint, setLatestFingerprint] = useState<string | null>(
    null,
  );
  const requestSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const sinceIdRef = useRef<string | null>(null);
  const inFlightCountRef = useRef(0);

  const seenKey = useMemo(
    () =>
      getSeenKey({
        id: (session?.user as { id?: string | null } | undefined)?.id ?? null,
        email: session?.user?.email ?? null,
      }),
    [session?.user],
  );

  const seenFingerprintKey = useMemo(
    () =>
      getSeenFingerprintKey({
        id: (session?.user as { id?: string | null } | undefined)?.id ?? null,
        email: session?.user?.email ?? null,
      }),
    [session?.user],
  );

  const markNotificationsSeen = useCallback(() => {
    if (!latestOccurredAt || !latestFingerprint) {
      return;
    }

    try {
      window.localStorage.setItem(seenKey, latestOccurredAt);
      window.localStorage.setItem(seenFingerprintKey, latestFingerprint);
    } catch {
      // ignore localStorage errors
    }
    setHasNewNotification(false);
  }, [latestFingerprint, latestOccurredAt, seenFingerprintKey, seenKey]);

  const fetchLatestNotification = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!session) {
      if (seq === requestSeqRef.current) {
        setHasNewNotification(false);
        setLatestOccurredAt(null);
        setLatestFingerprint(null);
      }
      return;
    }

    const params = new URLSearchParams({
      type: "task_assigned",
      limit: String(NOTIFICATIONS_LIMIT),
    });
    if (pathname === "/records") {
      params.set("for_records", "true");
    }
    if (sinceIdRef.current != null) {
      params.set("since_id", sinceIdRef.current);
    }

    inFlightCountRef.current += 1;
    console.log("[notifications-bell-inflight]", {
      count: inFlightCountRef.current,
    });

    try {
      const res = await fetch(`/api/notifications?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      }).catch((error) => {
        if ((error as { name?: string } | null)?.name === "AbortError") {
          return null;
        }

        return null;
      });

      if (!res?.ok) {
        const detail = await res?.json().catch(() => null);
        console.warn("[notifications-bell] fetch failed", {
          status: res?.status ?? "no-response",
          detail,
        });
        return;
      }

      const payload = (await res.json().catch(() => null)) as unknown;

      const viewerUserId = extractViewerUserId(payload);
      const sessionUserId =
        (session?.user as { id?: string } | undefined)?.id ?? "";
      if (viewerUserId && sessionUserId && viewerUserId !== sessionUserId) {
        return;
      }

      const latestTaskAssignedEventId =
        extractLatestTaskAssignedEventId(payload);
      if (latestTaskAssignedEventId) {
        sinceIdRef.current = latestTaskAssignedEventId;
      }

      if (seq !== requestSeqRef.current) {
        return;
      }

      const latest = extractLatestNotificationMeta(payload);

      if (!latest) {
        return;
      }

      setLatestOccurredAt(latest.occurredAt);
      setLatestFingerprint(latest.fingerprint);

      let seen = "";
      let seenFingerprint = "";
      try {
        seen = window.localStorage.getItem(seenKey) ?? "";
        seenFingerprint = window.localStorage.getItem(seenFingerprintKey) ?? "";
      } catch {
        seen = "";
        seenFingerprint = "";
      }

      if (!seen || !seenFingerprint) {
        setHasNewNotification(true);
        return;
      }

      const latestTime = parseOccurredAtMs(latest.occurredAt);
      const seenTime = parseOccurredAtMs(seen);
      const isNewByTime = Number.isFinite(latestTime) && latestTime > seenTime;
      const isNewByFingerprint = latest.fingerprint !== seenFingerprint;

      setHasNewNotification(isNewByTime || isNewByFingerprint);
    } finally {
      if (inFlightCountRef.current > 0) {
        inFlightCountRef.current -= 1;
      }
      console.log("[notifications-bell-inflight]", {
        count: inFlightCountRef.current,
      });
    }
  }, [pathname, seenFingerprintKey, seenKey, session]);

  useEffect(() => {
    void fetchLatestNotification();

    const timer = window.setInterval(() => {
      void fetchLatestNotification();
    }, POLLING_INTERVAL_MS);

    const onTaskAssigned = () => {
      void fetchLatestNotification();
    };

    const onFocus = () => {
      void fetchLatestNotification();
    };

    window.addEventListener("kajishare:task-assigned", onTaskAssigned);
    window.addEventListener("focus", onFocus);

    return () => {
      abortRef.current?.abort();
      window.clearInterval(timer);
      window.removeEventListener("kajishare:task-assigned", onTaskAssigned);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchLatestNotification]);

  useEffect(() => {
    setHasNewNotification(false);
    setLatestOccurredAt(null);
    setLatestFingerprint(null);
    sinceIdRef.current = null;
  }, [pathname, seenKey, seenFingerprintKey]);

  useEffect(() => {
    if (pathname === "/notifications") {
      markNotificationsSeen();
    }
  }, [markNotificationsSeen, pathname]);

  return (
    <div className="flex gap-0 items-center">
      <button
        type="button"
        className="p-1 rounded-full hover:bg-accent focus:outline-none focus:ring-2 focus:ring-blue-400 mr-1"
        onClick={() => {
          if (typeof window === "undefined") {
            return;
          }

          const el = document.documentElement;
          if (el.classList.contains("dark")) {
            el.classList.remove("dark");
            localStorage.setItem("theme", "light");
          } else {
            el.classList.add("dark");
            localStorage.setItem("theme", "dark");
          }
        }}
      >
        <Sun className="w-6 h-6 text-slate-500" aria-label="ダークモード切替" />
      </button>
      <Link
        href="/notifications"
        className="relative p-1 rounded-full hover:bg-accent focus:outline-none focus:ring-2 focus:ring-blue-400 mr-1"
        aria-label="通知"
        onClick={markNotificationsSeen}
      >
        <Bell className="w-6 h-6 text-slate-500" aria-label="通知" />
        {hasNewNotification ? (
          <span className="absolute right-1 top-1 inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
        ) : null}
      </Link>
      {session ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="p-1 rounded-full hover:bg-accent focus:outline-none focus:ring-2 focus:ring-blue-400 mr-6"
            >
              <Settings
                className="w-6 h-6 text-slate-500"
                aria-label="ダークモード切替"
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48" align="end" forceMount>
            <AccountMenuButtons />
            <GroupMenuButtons />
            <HelpMenuButtons />
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button
          type="button"
          className="p-1 rounded-full hover:bg-accent focus:outline-none focus:ring-2 focus:ring-blue-400 mr-6"
        >
          <Settings className="w-6 h-6 text-slate-500" aria-label="設定" />
        </button>
      )}
      {status === "loading" ? (
        <div className="w-10 h-10 rounded-full bg-muted/50 border-2 border-border animate-pulse" />
      ) : session ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative w-10 h-10 rounded-full">
              <Avatar className="w-10 h-10">
                {session.user?.image && (
                  <AvatarImage
                    src={session.user?.image}
                    alt={session.user.name ?? ""}
                  />
                )}
                <AvatarFallback>
                  <div className="w-10 h-10 rounded-full bg-muted/50 border-2 border-border" />
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {session.user?.name}
                </p>
                {secondaryLabel ? (
                  <p className="text-xs leading-none text-muted-foreground">
                    {secondaryLabel}
                  </p>
                ) : null}
              </div>
            </DropdownMenuLabel>
            <SignOutMenuItem />
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <SignIn />
      )}
    </div>
  );
}

function AccountMenuButtons(
  props: React.ComponentPropsWithoutRef<typeof DropdownMenuItem>,
) {
  return (
    <DropdownMenuItem asChild>
      <Link
        href="/account"
        className="block w-full justify-start text-base px-2 py-1.5 transition-colors hover:bg-blue-50 hover:text-blue-700 focus:bg-blue-100 focus:text-blue-800"
        {...(props as any)}
      >
        アカウント設定
      </Link>
    </DropdownMenuItem>
  );
}

function GroupMenuButtons(
  props: React.ComponentPropsWithoutRef<typeof DropdownMenuItem>,
) {
  return (
    <DropdownMenuItem asChild>
      <Link
        href="/groups"
        className="block w-full justify-start text-base px-2 py-1.5 transition-colors hover:bg-blue-50 hover:text-blue-700 focus:bg-blue-100 focus:text-blue-800"
        {...(props as any)}
      >
        グループ設定
      </Link>
    </DropdownMenuItem>
  );
}

function HelpMenuButtons(
  props: React.ComponentPropsWithoutRef<typeof DropdownMenuItem>,
) {
  return (
    <DropdownMenuItem asChild>
      <Link
        href="/help"
        className="block w-full justify-start text-base px-2 py-1.5 transition-colors hover:bg-blue-50 hover:text-blue-700 focus:bg-blue-100 focus:text-blue-800"
        {...(props as any)}
      >
        ヘルプ
      </Link>
    </DropdownMenuItem>
  );
}
