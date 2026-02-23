import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AccountDeleteButton from "@/components/account-delete-button";

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
      <h1>アカウント設定</h1>
      <p>サインイン中のアカウント情報です。</p>

      <div className="not-prose mt-6 rounded-lg border bg-white p-5 shadow-sm dark:bg-slate-900">
        <div className="grid gap-3 text-sm">
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              名前
            </span>
            <span>{user?.name ?? "未設定"}</span>
          </div>
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              メール
            </span>
            <span>{user?.email ?? "未設定"}</span>
          </div>
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              account_type
            </span>
            <span>{accountType ?? "未設定"}</span>
          </div>
        </div>
      </div>

      <AccountDeleteButton />
    </div>
  );
}
