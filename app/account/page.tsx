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

  return (
    <div className="prose max-w-none p-6">
      <h1 className="inline-block w-full border-b-2 border-current pb-1 text-2xl font-extrabold">
        アカウント設定
      </h1>

      <div className="not-prose mt-8 space-y-6">
        <div className="grid grid-cols-[140px_1fr] items-center gap-3 text-base sm:text-lg">
          <span className="font-semibold text-slate-600 dark:text-slate-300">
            名前
          </span>
          <span className="font-medium break-all">
            {user?.name || "未設定"}
          </span>
        </div>

        <div className="grid grid-cols-[140px_1fr] items-center gap-3 text-base sm:text-lg">
          <span className="font-semibold text-slate-600 dark:text-slate-300">
            メール
          </span>
          <span className="font-medium break-all">
            {user?.email || "未設定"}
          </span>
        </div>
      </div>

      <AccountDeleteButton apiUrl={apiUrl} />
    </div>
  );
}
