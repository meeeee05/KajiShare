import { redirect } from "next/navigation";
import { auth } from "@/auth";
import Link from "next/link";
import GroupEditableField from "./_components/group-editable-field";
import GroupLeaveLink from "./_components/group-leave-link";
import {
  GUEST_EXPIRED_REDIRECT_PATH,
  isGuestSessionExpiredStatus,
  isGuestSessionUser,
} from "@/lib/guest-session";
import { backendOrigin } from "@/lib/backend-origin";
import { backendServerHeaders } from "@/lib/backend-server-headers";

// 型定義
type AnyRecord = Record<string, unknown>;
type GroupListItem = {
  id?: string;
  name: string;
  share_key?: string;
  assign_mode?: string;
  balancedType?: string;
  adminName?: string;
  role?: string;
};
type MembershipItem = {
  groupId?: string;
  role?: string;
  userName?: string;
};

// 担当者割り当て
const normalizeAssignMode = (value?: string) => {
  const normalized = normalizeText(value);

  if (normalized === "balanced") {
    return "balanced";
  }
  if (normalized === "random") {
    return "random";
  }
  if (normalized === "manual") {
    return "manual";
  }
  return "random";
};

// 負担バランス
const isBalancedAssignMode = (value?: string) => {
  return normalizeAssignMode(value) === "balanced";
};

const normalizeText = (value?: string) => (value ?? "").trim().toLowerCase();

// グループ表示順の正規化
const compareStableGroupOrder = (a: GroupListItem, b: GroupListItem) => {
  const aId = (a.id ?? "").trim();
  const bId = (b.id ?? "").trim();

  if (aId && bId) {
    const aNum = Number(aId);
    const bNum = Number(bId);
    const aIsNum = Number.isFinite(aNum);
    const bIsNum = Number.isFinite(bNum);

    if (aIsNum && bIsNum && aNum !== bNum) {
      return aNum - bNum;
    }

    const byIdText = aId.localeCompare(bId, "ja");
    if (byIdText !== 0) {
      return byIdText;
    }
  }

  const aShare = (a.share_key ?? "").trim();
  const bShare = (b.share_key ?? "").trim();
  if (aShare && bShare) {
    const byShare = aShare.localeCompare(bShare, "ja");
    if (byShare !== 0) {
      return byShare;
    }
  }
  return 0;
};

// 戻り値判定
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

// APIレスポンスをデータ配列として取り出す
const toDataArray = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  const root = asRecord(payload);
  if (!root) {
    return [];
  }
  return Array.isArray(root.data) ? root.data : [];
};

const unwrapJsonApiResource = (item: unknown) => {
  const resource = asRecord(item);
  return asRecord(resource?.attributes) ?? resource;
};

const normalizeGroup = (item: unknown, index: number): GroupListItem => {
  const resource = asRecord(item);
  const group = unwrapJsonApiResource(item);

  return {
    id: pickFirstString(resource, ["id"]) ?? pickFirstString(group, ["id"]),
    name: pickFirstString(group, ["name"]) ?? `グループ ${index + 1}`,
    share_key: pickFirstString(group, ["share_key"]),
    assign_mode: normalizeAssignMode(pickFirstString(group, ["assign_mode"])),
    balancedType: pickFirstString(group, ["balance_type"]),
  };
};

const normalizeMembership = (item: unknown): MembershipItem => {
  const membership = unwrapJsonApiResource(item);

  return {
    groupId: pickFirstString(membership, ["group_id"]),
    role: pickFirstString(membership, ["role"]),
    userName: pickFirstString(membership, ["user_name"]),
  };
};

const normalizeGroups = (groupsPayload: unknown): GroupListItem[] =>
  toDataArray(groupsPayload).map((item, index) => normalizeGroup(item, index));

export default async function GroupsPage() {
  const session = await auth();

  // 未サインインならサインインページへ
  if (!session) {
    redirect("/auth/signin");
  }

  const apiUrl = process.env.API_URL;
  const idToken = (session.user as any)?.idToken as string | undefined;
  const isGuestSession = isGuestSessionUser(session.user);

  if (!apiUrl || !idToken) {
    throw new Error(
      !apiUrl ? "API_URL is not configured" : "ID token is missing",
    );
  }

  const trimmedApiUrl = apiUrl.replace(/\/+$/, "");
  const v1ApiUrl = trimmedApiUrl.endsWith("/api/v1")
    ? trimmedApiUrl
    : `${trimmedApiUrl}/api/v1`;

  // 成功したらJSONを返す
  const fetchOkJson = async (url: string): Promise<unknown | null> => {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${idToken}`,
        Origin: backendOrigin(),
        ...backendServerHeaders(),
      },
      cache: "no-store",
    }).catch(() => null);

    if (!res?.ok) {
      if (res && isGuestSession && isGuestSessionExpiredStatus(res.status)) {
        redirect(GUEST_EXPIRED_REDIRECT_PATH);
      }
      return null;
    }
    return res.json().catch(() => null);
  };

  // グループ一覧と所属情報を取得
  const [groupsPayload, membershipsPayload] = await Promise.all([
    fetchOkJson(`${v1ApiUrl}/groups`),
    fetchOkJson(`${v1ApiUrl}/memberships`),
  ]);

  const memberships = toDataArray(membershipsPayload).map(normalizeMembership);

  const roleByGroupId = new Map<string, string>();
  const adminNameByGroupId = new Map<string, string>();

  for (const membership of memberships) {
    if (!membership.groupId) {
      continue;
    }

    if (membership.role) {
      roleByGroupId.set(membership.groupId, membership.role);
    }

    if (membership.role === "admin" && membership.userName) {
      adminNameByGroupId.set(membership.groupId, membership.userName);
    }
  }

  // グループ一覧に役割と管理者名を紐付け
  const groupList = normalizeGroups(groupsPayload)
    .map((group) => ({
      ...group,
      role: group.id ? roleByGroupId.get(group.id) : undefined,
      adminName: group.id ? adminNameByGroupId.get(group.id) : undefined,
    }))
    .map((group, index) => ({ group, index }))
    .sort((a, b) => {
      const byStable = compareStableGroupOrder(a.group, b.group);
      if (byStable !== 0) {
        return byStable;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.group);

  if (groupList.length === 0) {
    redirect("/groups/empty");
  }

  return (
    <div className="prose max-w-none p-4 sm:p-6">
      <div className="not-prose mb-2 flex flex-col items-start justify-between gap-3 border-b-2 border-current pb-1 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-extrabold">グループ設定</h1>
        <Link
          href="/groups/empty?from=groups"
          className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
        >
          グループ追加
        </Link>
      </div>

      <p className="mt-6 text-sm text-slate-600 dark:text-slate-300">
        あなたが参加しているグループは {groupList.length} 件です。
      </p>

      <div className="not-prose mt-8 space-y-6">
        {groupList.map((group, index) => (
          <section
            key={group.id ?? `${group.name}-${index}`}
            className="rounded-lg border bg-card p-4 sm:p-5"
          >
            <GroupEditableField
              groupId={group.id}
              shareKey={group.share_key}
              field="name"
              value={group.name}
              textClassName="text-lg font-bold"
              inputClassName="text-base"
              linkHref="/tasks"
            />

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-1 items-start gap-2 text-base sm:grid-cols-[140px_1fr] sm:items-center sm:gap-3 sm:text-lg">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  招待コード
                </span>
                <span className="font-medium break-all">
                  {group.share_key ?? "-"}
                </span>
              </div>

              <div className="grid grid-cols-1 items-start gap-2 text-base sm:grid-cols-[140px_1fr] sm:items-center sm:gap-3 sm:text-lg">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  担当割り当て
                </span>
                <GroupEditableField
                  groupId={group.id}
                  shareKey={group.share_key}
                  field="assign_mode"
                  value={group.assign_mode}
                  textClassName="font-medium text-sm sm:text-base break-all"
                />
              </div>

              {isBalancedAssignMode(group.assign_mode) ? (
                <div className="grid grid-cols-1 items-start gap-2 text-base sm:grid-cols-[140px_1fr] sm:items-center sm:gap-3 sm:text-lg">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    負担バランス
                  </span>
                  <GroupEditableField
                    groupId={group.id}
                    shareKey={group.share_key}
                    field="balance_type"
                    value={group.balancedType}
                    textClassName="font-medium break-all"
                  />
                </div>
              ) : null}

              <div className="grid grid-cols-1 items-start gap-2 text-base sm:grid-cols-[140px_1fr] sm:items-center sm:gap-3 sm:text-lg">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  管理者
                </span>
                <span className="font-semibold break-all">
                  {group.adminName ?? "-"}
                </span>
              </div>

              <div className="grid grid-cols-1 items-start gap-2 text-base sm:grid-cols-[140px_1fr] sm:items-center sm:gap-3 sm:text-lg">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  あなたの権限
                </span>
                <span className="font-semibold break-all">
                  {group.role === "admin" ? "管理者" : "メンバー"}
                </span>
              </div>
              <div className="pt-2">
                <GroupLeaveLink
                  groupId={group.id}
                  shareKey={group.share_key}
                  groupName={group.name}
                />
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
