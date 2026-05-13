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
type SessionUser = {
  idToken?: string;
};
type PostRequest = {
  endpoint: string;
  body: unknown;
  token: string;
  sessionUser: unknown;
  onRedirect: (path: string) => void;
  fallbackError: string;
};

const formClass =
  "flex w-full flex-col items-center justify-center gap-2 sm:flex-row sm:gap-0";
const inputClass =
  "w-full sm:w-64 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mx-auto";

// APIからのエラーメッセージを取得
const pickErrorMessage = (payload: unknown, fallback: string, status: number) => {
  const data =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null;

  if (typeof data?.error === "string" && data.error) {
    return data.error;
  }
  if (typeof data?.message === "string" && data.message) {
    return data.message;
  }
  return `${fallback}(status: ${status})`;
};

// JSONをPOST
const postJson = async ({
  endpoint,
  body,
  token,
  sessionUser,
  onRedirect,
  fallbackError,
}: PostRequest) => {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).catch(() => null);

  if (!res) {
    return { ok: false, redirected: false, error: fallbackError };
  }

  if (
    await handleGuestSessionExpiryResponse({
      response: res,
      sessionUser,
      onRedirect,
    })
  ) {
    return { ok: false, redirected: true, error: undefined };
  }

  const data = await res.json().catch(() => null);

  if (res.ok) {
    return { ok: true, redirected: false, error: undefined };
  }
  return {
    ok: false,
    redirected: false,
    error: pickErrorMessage(data, fallbackError, res.status),
  };
};

// トークン取得
export default function GroupsEmptyClient({ apiUrl }: Props) {
  const [groupName, setGroupName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const router = useRouter();
  const { data: session } = useSession();
  const sessionUser = session?.user as SessionUser | undefined;
  const searchParams = useSearchParams();
  const showBackLink = searchParams.get("from") === "groups";
  const base = apiUrl?.replace(/\/+$/, "");
  const v1Base = base?.endsWith("/api/v1") ? base : `${base}/api/v1`;
  const token = sessionUser?.idToken;

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
      if (!base || !token) {
        setError("認証情報またはAPI設定が不足しています。");
        return;
      }

      const result = await postJson({
        endpoint: `${v1Base}/groups`,
        body: { group: { name: trimmed } },
        token,
        sessionUser,
        onRedirect: (path) => router.replace(path),
        fallbackError:
          "グループの登録に失敗しました。時間をおいて再度お試しください。",
      });

      if (result.redirected) {
        return;
      }
      if (!result.ok) {
        setError(result.error ?? "グループの登録に失敗しました。");
        return;
      }

      // 正常に登録できたらトップページへ遷移
      router.push("/");
    } catch {
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
      if (!base || !token) {
        setJoinError("認証情報またはAPI設定が不足しています。");
        return;
      }

      const result = await postJson({
        endpoint: `${v1Base}/groups/join`,
        body: { share_key: trimmed },
        token,
        sessionUser,
        onRedirect: (path) => router.replace(path),
        fallbackError: "グループ参加に失敗しました。招待IDをご確認ください。",
      });

      if (result.redirected) {
        return;
      }
      if (!result.ok) {
        setJoinError(result.error ?? "グループ参加に失敗しました。");
        return;
      }

      window.dispatchEvent(new CustomEvent("kajishare:group-joined"));

      router.push("/");
    } catch {
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
          <form onSubmit={handleSubmit} className={formClass}>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="グループ名を入力"
              className={inputClass}
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
          <form onSubmit={handleJoin} className={formClass}>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="招待IDを入力"
              className={inputClass}
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
        既にグループを登録済みの方は再度
        <Link href="/auth/signin" className="text-blue-600 hover:underline">
          サインイン
        </Link>
        して下さい
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
