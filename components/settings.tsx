"use client";
import { Button } from "./ui/button";
import { Bell, Settings, Sun } from "lucide-react";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { getNotificationsAction } from "@/app/actions";

//　ユーザーメニューと通知アイコンを表示
const POLLING_INTERVAL_MS = 7_000;
const NOTIFICATIONS_LIMIT = 100;
const menuItemClass =
  "block w-full justify-start text-base px-2 py-1.5 transition-colors hover:bg-blue-50 hover:text-blue-700 focus:bg-blue-100 focus:text-blue-800";
type SessionUser = {
  id?: string | null;
  email?: string | null;
  account_type?: string | null;
  isGuest?: boolean;
};

// 通知の既読管理のためのキーを生成
const getSeenKey = (
  user: { id?: string | null; email?: string | null },
  type: "time" | "fingerprint",
) => `notifications:lastSeen${type === "fingerprint" ? "Fingerprint" : ""}:${user.id ?? user.email ?? "anonymous"}`;

const parseOccurredAtMs = (raw: string): number => Date.parse(raw);

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

// 通知の発生日時と内容から一意の識別子を生成
const pickString = (row: Record<string, unknown>, key: string): string => {
  const value = row[key];
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return "";
};

// 地位通知欄取得
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
  return data ? pickString(data, "viewer_user_id") : "";
};

//　同じ日時でも中身が違う通知が来た場合に識別
const buildNotificationFingerprint = (
  row: Record<string, unknown>,
  occurredAt: string,
): string => {
  return [
    pickString(row, "id"),
    pickString(row, "type"),
    pickString(row, "title"),
    pickString(row, "message"),
    occurredAt,
  ].join("|");
};

// APIからのレスポンスを処理して、ゲストセッションの有効期限切れを検出
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
    const item = asRecord(row);
    if (!item) {
      continue;
    }

    const occurredAt = pickString(item, "occurred_at");
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

export default function UserButton() {
  // クライアント側でセッション取得
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const sessionUser = session?.user as SessionUser | undefined;
  const secondaryLabel = sessionUser?.account_type ?? (sessionUser?.isGuest ? "" : sessionUser?.email);
  const [hasNewNotification, setHasNewNotification] = useState(false);
  const [latestOccurredAt, setLatestOccurredAt] = useState<string | null>(null);
  const [latestFingerprint, setLatestFingerprint] = useState<string | null>(
    null,
  );
  const requestSeqRef = useRef(0);

  // 通知の既読管理
  const seenKey = useMemo(
    () =>
      getSeenKey(
        {
          id: sessionUser?.id ?? null,
          email: sessionUser?.email ?? null,
        },
        "time",
      ),
    [sessionUser?.email, sessionUser?.id],
  );

  // ユーザ別の通知の識別管理
  const seenFingerprintKey = useMemo(
    () =>
      getSeenKey(
        {
          id: sessionUser?.id ?? null,
          email: sessionUser?.email ?? null,
        },
        "fingerprint",
      ),
    [sessionUser?.email, sessionUser?.id],
  );

  // ゲストセッションの有効期限切れを検出
  const markNotificationsSeen = useCallback(() => {
    if (!latestOccurredAt || !latestFingerprint) {
      return;
    }

    try {
      window.localStorage.setItem(seenKey, latestOccurredAt);
      window.localStorage.setItem(seenFingerprintKey, latestFingerprint);
    } catch {
      return;
    }
    setHasNewNotification(false);
  }, [latestFingerprint, latestOccurredAt, seenFingerprintKey, seenKey]);

  // 通知の新着判定
  const fetchLatestNotification = useCallback(async () => {
    const seq = ++requestSeqRef.current;

    if (!session) {
      if (seq === requestSeqRef.current) {
        setHasNewNotification(false);
        setLatestOccurredAt(null);
        setLatestFingerprint(null);
      }
      return;
    }

    const result = await getNotificationsAction({ limit: NOTIFICATIONS_LIMIT });
    if (result.redirectTo || !result.ok) return;

    const payload = result.payload;
    const viewerUserId = extractViewerUserId(payload);
    if (viewerUserId && sessionUser?.id && viewerUserId !== sessionUser.id) return;
    if (seq !== requestSeqRef.current) return;

    const latest = extractLatestNotificationMeta(payload);
    if (!latest) return;

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
    setHasNewNotification(
      (Number.isFinite(latestTime) && latestTime > seenTime) ||
        latest.fingerprint !== seenFingerprint,
    );
  }, [seenFingerprintKey, seenKey, session, sessionUser?.id]);

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
      window.clearInterval(timer);
      window.removeEventListener("kajishare:task-assigned", onTaskAssigned);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchLatestNotification]);

  useEffect(() => {
    setHasNewNotification(false);
    setLatestOccurredAt(null);
    setLatestFingerprint(null);
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
            <MenuLink href="/account">アカウント設定</MenuLink>
            <MenuLink href="/groups">グループ設定</MenuLink>
            <MenuLink href="/help">ヘルプ</MenuLink>
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

function MenuLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <DropdownMenuItem asChild>
      <Link href={href} className={menuItemClass}>{children}</Link>
    </DropdownMenuItem>
  );
}
