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

  return (
    <div className="prose max-w-none p-6">
      <h1 className="inline-block w-full border-b-2 border-current pb-1 text-2xl font-extrabold">
        アカウント設定
      </h1>

      <AccountEditableFields
        initialName={user?.name}
        initialEmail={user?.email}
      />

      <AccountDeleteButton />
    </div>
  );
}
