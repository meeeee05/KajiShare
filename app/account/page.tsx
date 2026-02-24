import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AccountDeleteButton from "@/components/account-delete-button";
import AccountEditableFields from "@/components/account-editable-fields";

async function fetchAccountType(
  apiUrl: string | undefined,
  idToken: string | undefined,
  fallback: string | undefined,
) {
  if (!apiUrl || !idToken) {
    return fallback;
  }

  const res = await fetch(`${apiUrl}/users`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
    cache: "no-store",
  }).catch(() => null);

  if (!res?.ok) {
    return fallback;
  }

  const data = await res.json().catch(() => null);

  if (!data || typeof data !== "object") {
    return fallback;
  }

  return ((data as any)?.account_type as string | undefined) ?? fallback;
}

export default async function AccountPage() {
  const session = await auth();

  if (!session) {
    redirect("/auth/signin");
  }

  const user = session.user;
  const apiUrl = process.env.API_URL;
  const idToken = user?.idToken as string | undefined;
  const sessionAccountType = (user as any)?.account_type as string | undefined;
  const accountType = await fetchAccountType(
    apiUrl,
    idToken,
    sessionAccountType,
  );

  return (
    <div className="prose max-w-none p-6">
      <h1 className="inline-block w-full border-b-2 border-current pb-1 text-2xl font-extrabold">
        アカウント設定
      </h1>

      <AccountEditableFields
        initialName={user?.name}
        initialEmail={user?.email}
        initialAccountType={accountType}
      />

      <AccountDeleteButton />
    </div>
  );
}
