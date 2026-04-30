"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { handleGuestSessionExpiryResponse } from "@/lib/guest-session-client";

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

        if (
          await handleGuestSessionExpiryResponse({
            response: res,
            sessionUser: session?.user,
            onRedirect: (path) => router.replace(path),
          })
        ) {
          return;
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

      const endpoints = [`${v1Base}/groups/join`, `${base}/groups/join`];

      let joined = false;
      let lastError = "グループ参加に失敗しました。招待IDをご確認ください。";

      for (const endpoint of endpoints) {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ share_key: trimmed }),
        }).catch(() => null);

        if (!res) {
          continue;
        }

        if (
          await handleGuestSessionExpiryResponse({
            response: res,
            sessionUser: session?.user,
            onRedirect: (path) => router.replace(path),
          })
        ) {
          return;
        }

        const data = await res.json().catch(() => null);

        if (res.ok) {
          joined = true;
          break;
        }

        lastError =
          (data as any)?.error ??
          (data as any)?.message ??
          `グループ参加に失敗しました。(status: ${res.status})`;
      }

      if (!joined) {
        setJoinError(lastError);
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
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-3 text-center sm:px-4">
      <div className="mb-6 flex flex-wrap items-center justify-center gap-0.5">
        <span className="text-3xl font-extrabold tracking-tight leading-none text-slate-900 dark:text-white sm:text-4xl">
          Kaji
        </span>
        <span className="ml-0 text-3xl font-extrabold tracking-tight leading-none text-blue-600 sm:text-4xl">
          Share
        </span>
        <span className="ml-2 text-lg font-bold sm:text-xl">へようこそ！</span>
      </div>
      <p className="mb-6 max-w-[390px] text-gray-600">
        早速グループを作成しましょう！
      </p>
      <p className="mb-6 max-w-[390px] text-left text-gray-600">
        グループを登録すると、家事やタスクの進捗を共有できるようになります。
      </p>
      <div className="mx-auto flex w-full max-w-[390px] flex-col items-center gap-8">
        <div className="flex w-full flex-col items-center">
          {error && (
            <p className="mb-2 text-sm text-red-600 text-left">{error}</p>
          )}
          <form
            onSubmit={handleSubmit}
            className="flex w-full flex-col items-center justify-center gap-2 sm:flex-row sm:gap-0"
          >
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="グループ名を入力"
              className="w-full sm:w-64 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mx-auto"
            />
            <Button
              type="submit"
              variant="default"
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              {isSubmitting ? "登録中..." : "作成"}
            </Button>
          </form>
        </div>
        <div className="flex w-full flex-col items-center">
          <p className="mb-3 text-sm text-gray-600">
            招待IDをお持ちの方はこちら
          </p>
          {joinError && (
            <p className="mb-2 text-sm text-red-600">{joinError}</p>
          )}
          <form
            onSubmit={handleJoin}
            className="flex w-full flex-col items-center justify-center gap-2 sm:flex-row sm:gap-0"
          >
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="招待IDを入力"
              className="w-full sm:w-64 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mx-auto"
            />
            <Button
              type="submit"
              variant="outline"
              disabled={isJoining}
              className="w-full sm:w-auto"
            >
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
