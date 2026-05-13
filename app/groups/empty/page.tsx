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
    redirect("/auth/timeout");
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
      const memberships = await res.json();
      if (Array.isArray(memberships) && memberships.length > 0) {
        redirect("/");
      }
    }
  }

  return <GroupsEmptyClient apiUrl={apiUrl} />;
}
