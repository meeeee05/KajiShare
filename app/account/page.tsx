import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AccountDeleteButton from "./_components/account-delete-button";

export default async function AccountPage() {
  const session = await auth();

  if (!session) {
    redirect("/auth/signin");
  }

  const user = session.user;
  const isGuest = (session.user as { isGuest?: boolean } | undefined)?.isGuest;

  return (
    <div className="prose max-w-none p-4 sm:p-6">
      <h1 className="inline-block w-full border-b-2 border-current pb-1 text-2xl font-extrabold">
        アカウント設定
      </h1>

      <div className="not-prose mt-8 space-y-6">
        <div className="grid grid-cols-1 items-start gap-2 text-base sm:grid-cols-[140px_1fr] sm:items-center sm:gap-3 sm:text-lg">
          <span className="font-semibold text-slate-600 dark:text-slate-300">
            名前
          </span>
          <span className="font-medium break-all">
            {user?.name || "未設定"}
          </span>
        </div>

        {!isGuest ? (
          <div className="grid grid-cols-1 items-start gap-2 text-base sm:grid-cols-[140px_1fr] sm:items-center sm:gap-3 sm:text-lg">
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              メール
            </span>
            <span className="font-medium break-all">
              {user?.email || "未設定"}
            </span>
          </div>
        ) : null}
      </div>

      {!isGuest ? <AccountDeleteButton /> : null}
    </div>
  );
}
