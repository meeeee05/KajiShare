import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function GroupsPage() {
  const session = await auth();

  // 未サインインならサインインページへ
  if (!session) {
    redirect("/auth/signin");
  }

  const apiUrl = process.env.API_URL;

  // API_URL が未設定の場合は従来の説明だけ表示
  if (!apiUrl) {
    return (
      <div className="prose max-w-none p-6">
        <h1>グループ設定</h1>
        <p>所属グループの確認・切り替え・管理を行うページです。</p>
      </div>
    );
  }

  let memberships: any = null;

  try {
    const res = await fetch(`${apiUrl}/api/v1/memberships`, {
      headers: {
        Authorization: `Bearer ${(session.user as any).idToken}`,
      },
      cache: "no-store",
    });

    if (res.ok) {
      memberships = await res.json();
    }
  } catch (e) {
    // 通信エラー時は memberships をそのまま null として扱う
  }

  // memberships が null または空配列などの場合は /groups/empty へ
  if (
    memberships == null ||
    (Array.isArray(memberships) && memberships.length === 0)
  ) {
    redirect("/groups/empty");
  }

  // グループがある場合の表示（必要に応じて memberships を使って拡張可能）
  return (
    <div className="prose max-w-none p-6">
      <h1>グループ設定</h1>
      <p>所属グループの確認・切り替え・管理を行うページです。</p>
    </div>
  );
}
