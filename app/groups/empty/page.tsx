import { redirect } from "next/navigation";
import { auth } from "@/auth";
import GroupsEmptyClient from "@/components/groups-empty-client";

export default async function EmptyGroupsPage() {
  const session = await auth();

  if (!session) {
    redirect("/auth/timeout");
  }

  const apiUrl = process.env.API_URL;
  const idToken = (session.user as any)?.idToken as string | undefined;

  if (apiUrl && idToken) {
    const res = await fetch(`${apiUrl}/memberships`, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      cache: "no-store",
    }).catch(() => null);

    if (res?.ok) {
      const memberships = await res.json();
      if (Array.isArray(memberships) && memberships.length > 0) {
        redirect("/");
      }
    }
  }

  return <GroupsEmptyClient apiUrl={apiUrl} />;
}
