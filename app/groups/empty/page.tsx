"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function EmptyGroupsPage() {
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
      <div className="flex flex-col sm:flex-row gap-3">
        <Button asChild variant="default">
          <Link href="/groups">グループを登録する</Link>
        </Button>
      </div>
    </div>
  );
}
