import React from "react";
import { Button } from "./ui/button";
import { sign } from "crypto";
import { signIn } from "next-auth/react";
import { signOut } from "next-auth/react";

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

export function SignOut({
  provider,
  ...props
}: { provider?: string } & React.ComponentPropsWithRef<typeof Button>) {
  return (
    <Button variant="ghost" className="w-full p-0" 
    {...props} onClick={() => signOut()}
      >
      ログアウト
    </Button>
  );
}
