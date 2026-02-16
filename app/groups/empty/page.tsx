"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function EmptyGroupsPage() {
  const [groupName, setGroupName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
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

      // 正常に登録できたらグループ設定ページへ遷移
      router.push("/groups");
    } catch (e) {
      setError("グループの登録中にエラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = inviteCode.trim();
    if (!trimmed) {
      setJoinError("招待IDを入力してください。");
      return;
    }

    setJoinError(null);
    router.push(`/groups?invite=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <div className="flex justify-center items-center gap-2 mb-6">
        <span className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-none">
          Kaji
        </span>
        <span className="text-3xl font-extrabold tracking-tight text-blue-600 leading-none ml-0.5">
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
      {error && (
        <p className="mb-2 text-sm text-red-600 max-w-md text-left">{error}</p>
      )}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center"
      >
        <input
          type="text"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="グループ名を入力"
          className="w-full sm:w-64 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <Button type="submit" variant="default" disabled={isSubmitting}>
          {isSubmitting ? "登録中..." : "グループを登録する"}
        </Button>
      </form>
      <div className="mt-8 w-full max-w-md text-left">
        <p className="mb-3 text-sm text-gray-600">招待IDをお持ちの方はこちら</p>
        {joinError && <p className="mb-2 text-sm text-red-600">{joinError}</p>}
        <form
          onSubmit={handleJoin}
          className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center"
        >
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="招待IDを入力"
            className="w-full sm:w-64 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <Button type="submit" variant="outline">
            グループに参加する
          </Button>
        </form>
      </div>
    </div>
  );
}
