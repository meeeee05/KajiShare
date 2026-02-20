"use client";

import React from "react";
import { Button } from "./ui/button";
import { DropdownMenuItem } from "./ui/dropdown-menu";
import { signIn, signOut } from "next-auth/react";

export function SignIn({
  provider,
  ...props
}: { provider?: string } & React.ComponentPropsWithRef<typeof Button>) {
  const providerId = provider ?? "google";
  return (
    <Button
      type="button"
      {...props}
      onClick={() => {
        signIn(providerId, { callbackUrl: "/groups" });
      }}
    >
      サインイン
    </Button>
  );
}

export function SignOutMenuItem() {
  return (
    <DropdownMenuItem
      className="justify-start text-xs text-red-600 transition-colors hover:bg-red-50 hover:text-red-600 focus:bg-red-100 focus:text-red-700"
      onSelect={(event) => {
        event.preventDefault();
        signOut({ callbackUrl: "/auth/signin" });
      }}
    >
      サインアウト
    </DropdownMenuItem>
  );
}
