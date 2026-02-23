"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function GroupsEmptyClient() {
  const [groupName, setGroupName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const router = useRouter();

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
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: trimmed }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(
          (data as any)?.error ??
            "グループの登録に失敗しました。時間をおいて再度お試しください。",
        );
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
      const res = await fetch("/api/groups/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inviteCode: trimmed }),
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
    </div>
  );
}
