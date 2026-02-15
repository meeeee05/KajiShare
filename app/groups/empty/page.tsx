"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function EmptyGroupsPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <h1 className="mb-4 flex justify-center items-center gap-0">
        <span className="text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-none">
          Kaji
        </span>
        <span className="text-5xl font-extrabold tracking-tight text-blue-600 leading-none ml-0.5">
          Share
        </span>
        へようこそ！
      </h1>
      <p className="mb-6 text-gray-600 max-w-md">
        早速グループを作成しましょう！
      </p>
      <p className="mb-6 text-gray-600 max-w-md">
        グループを作成すると、家事やタスクの進捗を共有できるようになります。グループに参加して、みんなで家事を効率的に管理しましょう。
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button asChild variant="default">
          <Link href="/help">ヘルプを確認する</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">トップに戻る</Link>
        </Button>
      </div>
    </div>
  );
}
