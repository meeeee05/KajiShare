import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AccountDeleteButton from "@/components/account-delete-button";
import AccountEditableFields from "@/components/account-editable-fields";

export default async function AccountPage() {
  const session = await auth();

  if (!session) {
    redirect("/auth/signin");
  }

  const user = session.user;
  const apiUrl = process.env.API_URL;
  const idToken = user?.idToken as string | undefined;

  let accountType = (user as any)?.account_type as string | undefined;

  if (apiUrl && idToken) {
    try {
      const res = await fetch(`${apiUrl}/users`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === "object") {
          accountType = (data as any)?.account_type ?? accountType;
        }
      }
    } catch (error) {
      // account_type 取得失敗時はセッション値を使用
    }
  }

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
