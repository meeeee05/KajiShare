"use client";

import Image from "next/image";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export default function SessionTimeoutPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border bg-background p-8 shadow-sm">
        <div className="flex flex-col items-center gap-4 text-center">
          <Image
            src="https://next-auth.js.org/img/logo/logo-sm.png"
            alt="KajiShare"
            width={56}
            height={56}
            priority
          />
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">セッションの有効期限が切れました</h1>
            <p className="text-base text-muted-foreground">
              お手数ですが、もう一度サインインしてください。
            </p>
          </div>
        </div>

        <Button
          size="lg"
          className="w-full text-base flex items-center justify-center gap-2"
          onClick={() => signIn("google", { callbackUrl: "/" })}
        >
          <span>Googleで再サインイン</span>
          <Image
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google"
            width={20}
            height={20}
            style={{ display: "inline-block" }}
          />
        </Button>
      </div>
    </div>
  );
}
