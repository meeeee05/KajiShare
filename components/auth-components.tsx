import React from "react";
import { Button } from "./ui/button";
import { DropdownMenuItem } from "./ui/dropdown-menu";
import { signIn, signOut } from "next-auth/react";

export function SignIn({
  provider,
  ...props
}: { provider?: string } & React.ComponentPropsWithRef<typeof Button>) {
  return (
    <form
      action={async () => {
        "useserver";
        await signIn(provider);
      }}
    >
      <Button {...props}>サインイン</Button>
    </form>
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
