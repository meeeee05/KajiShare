"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

const getErrorMessage = (code: string | null) => {
  switch (code) {
    case "Configuration":
      return "認証設定でエラーが発生しました。時間をおいて再度ログインしてください。";
    case "AccessDenied":
      return "アクセスが拒否されました。アカウント設定をご確認ください。";
    case "Verification":
      return "認証リンクの検証に失敗しました。もう一度ログインしてください。";
    default:
      return "ログイン中にエラーが発生しました。もう一度お試しください。";
  }
};

export default function AuthErrorClient() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error");
  const message = getErrorMessage(errorCode);

  return (
    <div className="flex min-h-[calc(100dvh-6rem)] items-center justify-center px-3 py-4 sm:min-h-[60vh] sm:px-4 sm:py-6">
      <div className="w-full max-w-[420px] space-y-5 rounded-2xl border bg-background p-5 shadow-sm sm:space-y-6 sm:p-8">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-bold">ログインエラー</h1>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
            {message}
          </p>
          {errorCode ? (
            <p className="text-xs text-slate-500">error: {errorCode}</p>
          ) : null}
        </div>

        <Button asChild size="lg" className="w-full">
          <Link href="/auth/signin">ログイン画面に戻る</Link>
        </Button>
      </div>
    </div>
  );
}
