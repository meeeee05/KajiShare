import { redirect } from "next/navigation";
import { auth } from "@/auth";
import NotificationsClient from "./_components/notifications-client";
import {
  GUEST_EXPIRED_REDIRECT_PATH,
  isGuestSessionExpiredStatus,
  isGuestSessionUser,
} from "@/lib/guest-session";
import { backendOrigin } from "@/lib/backend-origin";
import { backendServerHeaders } from "@/lib/backend-server-headers";

const NOTIFICATIONS_LIMIT = 100;
const FETCH_ERROR_MESSAGE = "通知の取得に失敗しました";

type NotificationsPageProps = {
  searchParams?: {
    debug?: string;
  };
};

const maskAuthorization = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.length <= 18) {
    return "Bearer ***";
  }

  return `${trimmed.slice(0, 14)}...${trimmed.slice(-4)}`;
};

const parseJsonSafely = async (res: Response) => {
  return res.json().catch(() => null);
};

export default async function NotificationsPage({
  searchParams,
}: NotificationsPageProps) {
  const session = await auth();

  if (!session) {
    redirect("/auth/signin");
  }

  const apiUrl = process.env.API_URL;
  const idToken = (session.user as { idToken?: string } | undefined)?.idToken;
  const currentUserId =
    (session.user as { id?: string } | undefined)?.id ??
    session.user?.email ??
    "";
  const debugMode = searchParams?.debug === "1";

  if (!apiUrl || !idToken) {
    return (
      <NotificationsClient
        initialPayload={null}
        initialError={FETCH_ERROR_MESSAGE}
        initialUserId={currentUserId}
        initialDebugInfo={null}
      />
    );
  }

  const base = apiUrl.replace(/\/+$/, "");
  const v1Base = base.endsWith("/api/v1") ? base : `${base}/api/v1`;
  const backendParams = new URLSearchParams({
    limit: String(NOTIFICATIONS_LIMIT),
  });
  const endpoint = `${v1Base}/notifications?${backendParams.toString()}`;

  const res = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${idToken}`,
      Origin: backendOrigin(),
      ...backendServerHeaders(),
    },
    cache: "no-store",
  }).catch(() => null);

  if (!res) {
    return (
      <NotificationsClient
        initialPayload={null}
        initialError={FETCH_ERROR_MESSAGE}
        initialUserId={currentUserId}
        initialDebugInfo={null}
      />
    );
  }

  if (isGuestSessionUser(session.user) && isGuestSessionExpiredStatus(res.status)) {
    redirect(GUEST_EXPIRED_REDIRECT_PATH);
  }

  const payload = await parseJsonSafely(res);
  const debugInfo = debugMode
    ? {
        request: {
          endpoint,
          headers: {
            Authorization: maskAuthorization(`Bearer ${idToken}`),
          },
        },
        response: {
          status: res.status,
          ok: res.ok,
          headers: {
            "content-type": res.headers.get("content-type") ?? "",
          },
        },
      }
    : null;

  return (
    <NotificationsClient
      initialPayload={debugMode ? { debug: debugInfo, data: payload } : payload}
      initialError={res.ok ? null : FETCH_ERROR_MESSAGE}
      initialUserId={currentUserId}
      initialDebugInfo={debugInfo}
    />
  );
}
