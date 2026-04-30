"use client";
import { Button } from "./ui/button";
import { Bell, Settings, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { SignIn, SignOutMenuItem } from "./auth-components";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useSession } from "next-auth/react";
import Link from "next/link";

export default function UserButton() {
  // クライアント側でセッション取得
  const { data: session, status } = useSession();
  const isGuest = (session?.user as { isGuest?: boolean } | undefined)?.isGuest;
  const secondaryLabel = (session?.user as any)?.account_type
    ? (session?.user as any)?.account_type
    : isGuest
      ? ""
      : session?.user?.email;

  return (
    <div className="flex gap-0 items-center">
      <button
        type="button"
        className="p-1 rounded-full hover:bg-accent focus:outline-none focus:ring-2 focus:ring-blue-400 mr-1"
        onClick={() => {
          if (typeof window === "undefined") {
            return;
          }

          const el = document.documentElement;
          if (el.classList.contains("dark")) {
            el.classList.remove("dark");
            localStorage.setItem("theme", "light");
          } else {
            el.classList.add("dark");
            localStorage.setItem("theme", "dark");
          }
        }}
      >
        <Sun className="w-6 h-6 text-slate-500" aria-label="ダークモード切替" />
      </button>
      <Link
        href="/notifications"
        className="p-1 rounded-full hover:bg-accent focus:outline-none focus:ring-2 focus:ring-blue-400 mr-1"
        aria-label="通知"
      >
        <Bell className="w-6 h-6 text-slate-500" aria-label="通知" />
      </Link>
      {session ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="p-1 rounded-full hover:bg-accent focus:outline-none focus:ring-2 focus:ring-blue-400 mr-6"
            >
              <Settings
                className="w-6 h-6 text-slate-500"
                aria-label="ダークモード切替"
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48" align="end" forceMount>
            <AccountMenuButtons />
            <GroupMenuButtons />
            <HelpMenuButtons />
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button
          type="button"
          className="p-1 rounded-full hover:bg-accent focus:outline-none focus:ring-2 focus:ring-blue-400 mr-6"
        >
          <Settings className="w-6 h-6 text-slate-500" aria-label="設定" />
        </button>
      )}
      {status === "loading" ? (
        <div className="w-10 h-10 rounded-full bg-muted/50 border-2 border-border animate-pulse" />
      ) : session ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative w-10 h-10 rounded-full">
              <Avatar className="w-10 h-10">
                {session.user?.image && (
                  <AvatarImage
                    src={session.user?.image}
                    alt={session.user.name ?? ""}
                  />
                )}
                <AvatarFallback>
                  <div className="w-10 h-10 rounded-full bg-muted/50 border-2 border-border" />
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {session.user?.name}
                </p>
                {secondaryLabel ? (
                  <p className="text-xs leading-none text-muted-foreground">
                    {secondaryLabel}
                  </p>
                ) : null}
              </div>
            </DropdownMenuLabel>
            <SignOutMenuItem />
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <SignIn />
      )}
    </div>
  );
}

function AccountMenuButtons(
  props: React.ComponentPropsWithoutRef<typeof DropdownMenuItem>,
) {
  return (
    <DropdownMenuItem asChild>
      <Link
        href="/account"
        className="block w-full justify-start text-base px-2 py-1.5 transition-colors hover:bg-blue-50 hover:text-blue-700 focus:bg-blue-100 focus:text-blue-800"
        {...(props as any)}
      >
        アカウント設定
      </Link>
    </DropdownMenuItem>
  );
}

function GroupMenuButtons(
  props: React.ComponentPropsWithoutRef<typeof DropdownMenuItem>,
) {
  return (
    <DropdownMenuItem asChild>
      <Link
        href="/groups"
        className="block w-full justify-start text-base px-2 py-1.5 transition-colors hover:bg-blue-50 hover:text-blue-700 focus:bg-blue-100 focus:text-blue-800"
        {...(props as any)}
      >
        グループ設定
      </Link>
    </DropdownMenuItem>
  );
}

function HelpMenuButtons(
  props: React.ComponentPropsWithoutRef<typeof DropdownMenuItem>,
) {
  return (
    <DropdownMenuItem asChild>
      <Link
        href="/help"
        className="block w-full justify-start text-base px-2 py-1.5 transition-colors hover:bg-blue-50 hover:text-blue-700 focus:bg-blue-100 focus:text-blue-800"
        {...(props as any)}
      >
        ヘルプ
      </Link>
    </DropdownMenuItem>
  );
}
