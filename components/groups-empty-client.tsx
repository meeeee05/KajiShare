"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

type Props = {
  apiUrl?: string;
};

type AnyRecord = Record<string, unknown>;

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

const extractGroups = (payload: unknown): AnyRecord[] => {
  if (Array.isArray(payload)) {
    return payload.map((v) => asRecord(v)).filter((v): v is AnyRecord => !!v);
  }

  const root = asRecord(payload);
  if (!root) {
    return [];
  }

  const candidates = [
    root.data,
    root.groups,
    root.items,
    root.results,
    root.rows,
    root.list,
    asRecord(root.data)?.groups,
    asRecord(root.data)?.items,
    asRecord(root.data)?.results,
    asRecord(root.data)?.rows,
    asRecord(root.data)?.list,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    return candidate
      .map((v) => {
        const rootItem = asRecord(v);
        return (
          asRecord(rootItem?.group) ??
          asRecord(rootItem?.data) ??
          asRecord(rootItem?.attributes) ??
          rootItem
        );
      })
      .filter((v): v is AnyRecord => !!v);
  }

  return [];
};

export default function GroupsEmptyClient({ apiUrl }: Props) {
  const [groupName, setGroupName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const router = useRouter();
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const showBackLink = searchParams.get("from") === "groups";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = groupName.trim();
    if (!trimmed) {
      setError("グループ名を入力してください。");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const token = (session?.user as any)?.idToken as string | undefined;
      const base = apiUrl?.replace(/\/+$/, "");
      const v1Base = base?.endsWith("/api/v1") ? base : `${base}/api/v1`;

      if (!base || !v1Base || !token) {
        setError("認証情報またはAPI設定が不足しています。");
        return;
      }

      const endpoints = Array.from(
        new Set([`${base}/groups`, `${v1Base}/groups`]),
      );

      let created = false;
      let lastError =
        "グループの登録に失敗しました。時間をおいて再度お試しください。";

      for (const endpoint of endpoints) {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name: trimmed }),
        }).catch(() => null);

        if (!res) {
          continue;
        }

        const data = await res.json().catch(() => null);

        if (res.ok) {
          created = true;
          break;
        }

        lastError =
          (data as any)?.error ??
          (data as any)?.message ??
          `グループの登録に失敗しました。(status: ${res.status})`;
      }

      if (!created) {
        setError(lastError);
        return;
      }

      // 正常に登録できたらトップページへ遷移
      router.push("/");
    } catch (e) {
      setError("グループの登録中にエラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = inviteCode.trim();
    if (!trimmed) {
      setJoinError("招待IDを入力してください。");
      return;
    }

    setIsJoining(true);
    setJoinError(null);

    try {
      const token = (session?.user as any)?.idToken as string | undefined;
      const base = apiUrl?.replace(/\/+$/, "");
      const v1Base = base?.endsWith("/api/v1") ? base : `${base}/api/v1`;

      if (!base || !v1Base || !token) {
        setJoinError("認証情報またはAPI設定が不足しています。");
        return;
      }

      const groupsRes = await fetch(`${v1Base}/groups`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      }).catch(() => null);

      if (!groupsRes?.ok) {
        const groupsError = await groupsRes?.json().catch(() => null);
        setJoinError(
          (groupsError as any)?.error ??
            (groupsError as any)?.message ??
            "グループ一覧の取得に失敗しました。",
        );
        return;
      }

      const groupsPayload = await groupsRes.json().catch(() => null);
      const groups = extractGroups(groupsPayload);

      const matched = groups.some((group) => {
        const shareKey =
          pickFirstString(group, ["share_key", "shareKey"]) ??
          pickFirstString(asRecord(group.attributes), [
            "share_key",
            "shareKey",
          ]) ??
          pickFirstString(asRecord(group.data), ["share_key", "shareKey"]);
        return shareKey === trimmed;
      });

      if (!matched) {
        setJoinError("招待IDが見つかりません。入力内容をご確認ください。");
        return;
      }

      const res = await fetch(`${v1Base}/groups/join`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ share_key: trimmed }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setJoinError(
          (data as any)?.error ??
            "グループ参加に失敗しました。招待IDをご確認ください。",
        );
        return;
      }

      router.push("/");
    } catch (e) {
      setJoinError("グループ参加中にエラーが発生しました。");
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <div className="flex justify-center items-center gap-0.5 mb-6">
        <span className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-none">
          Kaji
        </span>
        <span className="text-3xl font-extrabold tracking-tight text-blue-600 leading-none ml-0">
          Share
        </span>
        <span className="text-xl font-bold ml-2">へようこそ！</span>
      </div>
      <p className="mb-6 text-gray-600 max-w-md">
        早速グループを作成しましょう！
      </p>
      <p className="mb-6 text-gray-600 max-w-md whitespace-nowrap text-left -ml-4">
        グループを登録すると、家事やタスクの進捗を共有できるようになります。
      </p>
      <div className="w-full max-w-md flex flex-col gap-8 items-center mx-auto">
        <div className="w-full flex flex-col items-center">
          {error && (
            <p className="mb-2 text-sm text-red-600 text-left">{error}</p>
          )}
          <form
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row gap-0 items-center justify-center w-full"
          >
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="グループ名を入力"
              className="w-full sm:w-64 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mx-auto"
            />
            <Button type="submit" variant="default" disabled={isSubmitting}>
              {isSubmitting ? "登録中..." : "作成"}
            </Button>
          </form>
        </div>
        <div className="w-full flex flex-col items-center">
          <p className="mb-3 text-sm text-gray-600">
            招待IDをお持ちの方はこちら
          </p>
          {joinError && (
            <p className="mb-2 text-sm text-red-600">{joinError}</p>
          )}
          <form
            onSubmit={handleJoin}
            className="flex flex-col sm:flex-row gap-0 items-center justify-center w-full"
          >
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="招待IDを入力"
              className="w-full sm:w-64 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mx-auto"
            />
            <Button type="submit" variant="outline" disabled={isJoining}>
              {isJoining ? "参加中..." : "参加"}
            </Button>
          </form>
        </div>
      </div>
      <p className="mt-10 text-sm text-gray-600 text-center">
        既にグループを登録済みの方は再度サインインして下さい
      </p>
      {showBackLink ? (
        <Link
          href="/groups"
          className="mt-3 text-sm font-semibold text-blue-600 hover:underline"
        >
          戻る
        </Link>
      ) : null}
    </div>
  );
}
