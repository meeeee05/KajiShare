import { redirect } from "next/navigation";
import { auth } from "@/auth";
import GroupsEmptyClient from "./_components/groups-empty-client";
import {
  GUEST_EXPIRED_REDIRECT_PATH,
  isGuestSessionExpiredStatus,
  isGuestSessionUser,
} from "@/lib/guest-session";
import { backendOrigin } from "@/lib/backend-origin";
import { backendServerHeaders } from "@/lib/backend-server-headers";

export default async function EmptyGroupsPage() {
  const session = await auth();

  if (!session) {
    redirect("/auth/signin");
  }

  // APIリクエスト前のゲストセッション期限切れチェック
  const apiUrl = process.env.API_URL;
  const idToken = (session.user as any)?.idToken as string | undefined;
  const isGuestSession = isGuestSessionUser(session.user);

  if (apiUrl && idToken) {
    const res = await fetch(`${apiUrl}/memberships`, {
      headers: {
        Authorization: `Bearer ${idToken}`,
        Origin: backendOrigin(),
        ...backendServerHeaders(),
      },
      cache: "no-store",
    }).catch(() => null);

    if (
      res &&
      !res.ok &&
      isGuestSession &&
      isGuestSessionExpiredStatus(res.status)
    ) {
      redirect(GUEST_EXPIRED_REDIRECT_PATH);
    }

    if (res?.ok) {
      const payload: unknown = await res.json();
      const root =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : null;
      const memberships = Array.isArray(payload)
        ? payload
        : Array.isArray(root?.data)
          ? root.data
          : [];

      if (memberships.length > 0) {
        redirect("/");
      }
    }
  }

  return <GroupsEmptyClient />;
}
