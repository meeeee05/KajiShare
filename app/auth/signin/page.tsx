"use client";

import Image from "next/image";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export default function SignInPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border bg-background p-8 shadow-sm">
        <div className="flex flex-col items-center gap-4 text-center">
          <Image
            src="https://next-auth.js.org/img/logo/logo-sm.png"
            alt="KajiShare ロゴ"
            width={56}
            height={56}
            priority
          />
          <div>
            <p className="text-base text-muted-foreground">
              Googleアカウントからサインインできます
            </p>
          </div>
        </div>
        <Button
          size="lg"
          className="w-full text-base flex items-center justify-center gap-2"
          onClick={() => signIn("google", { callbackUrl: "/groups" })}
        >
          <span>Googleでサインイン</span>
          <Image
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google ロゴ"
            width={20}
            height={20}
            style={{ display: "inline-block" }}
          />
        </Button>
        <button
          type="button"
          className="w-full text-center text-sm text-blue-600 hover:underline"
        >
          ゲストログイン
        </button>
      </div>
    </div>
  );
}
