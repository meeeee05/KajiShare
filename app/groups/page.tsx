import { redirect } from "next/navigation";
import { auth } from "@/auth";

type AnyRecord = Record<string, unknown>;

type GroupListItem = {
  id?: string;
  name: string;
  shareKey?: string;
  role?: string;
};

const asRecord = (value: unknown): AnyRecord | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as AnyRecord;
};

const pickFirstString = (
  obj: AnyRecord | null,
  keys: string[],
): string | undefined => {
  if (!obj) {
    return undefined;
  }

  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
  }

  return undefined;
};

const normalizeMemberships = (memberships: unknown): GroupListItem[] => {
  if (!Array.isArray(memberships)) {
    return [];
  }

  return memberships.map((item, index) => {
    const membership = asRecord(item);
    const group = asRecord(membership?.group);

    const id =
      pickFirstString(group, ["id", "group_id", "groupId"]) ??
      pickFirstString(membership, ["group_id", "groupId", "id"]);

    const name =
      pickFirstString(group, ["name", "group_name", "title"]) ??
      pickFirstString(membership, ["group_name", "name", "title"]) ??
      `グループ ${index + 1}`;

    const shareKey =
      pickFirstString(group, ["share_key", "shareKey"]) ??
      pickFirstString(membership, ["share_key", "shareKey"]);

    const role = pickFirstString(membership, ["role", "member_role", "type"]);

    return {
      id,
      name,
      shareKey,
      role,
    };
  });
};

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

  const res = await fetch(`${apiUrl}/memberships`, {
    headers: {
      Authorization: `Bearer ${(session.user as any).idToken}`,
    },
    cache: "no-store",
  }).catch(() => null);

  if (res?.ok) {
    memberships = await res.json();
  }

  // memberships が null または空配列などの場合は /groups/empty へ
  if (
    memberships == null ||
    (Array.isArray(memberships) && memberships.length === 0)
  ) {
    redirect("/groups/empty");
  }

  const groupList = normalizeMemberships(memberships);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">所属グループ一覧</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        あなたが参加しているグループは {groupList.length} 件です。
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groupList.map((group, index) => (
          <div
            key={group.id ?? `${group.name}-${index}`}
            className="rounded-lg border bg-white p-4 shadow-sm dark:bg-slate-900"
          >
            <p className="text-base font-semibold">{group.name}</p>
            <div className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
              <p>グループID: {group.id ?? "-"}</p>
              <p>招待ID: {group.shareKey ?? "-"}</p>
              <p>権限: {group.role ?? "-"}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
