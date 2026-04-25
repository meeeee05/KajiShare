"use client";

import Image from "next/image";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export default function SessionTimeoutPage() {
  return (
    <div className="flex min-h-[calc(100dvh-6rem)] items-center justify-center px-3 py-4 sm:min-h-[60vh] sm:px-4 sm:py-6">
      <div className="w-full max-w-[390px] space-y-5 rounded-2xl border bg-background p-4 shadow-sm sm:space-y-6 sm:p-8">
        <div className="flex flex-col items-center gap-3 text-center sm:gap-4">
          <Image
            src="https://next-auth.js.org/img/logo/logo-sm.png"
            alt="KajiShare"
            width={56}
            height={56}
            className="h-12 w-12 sm:h-14 sm:w-14"
            priority
          />
          <div className="space-y-2">
            <h1 className="text-lg font-semibold leading-snug sm:text-xl">
              セッションの有効期限が切れました
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              お手数ですが、もう一度サインインしてください。
            </p>
          </div>
        </div>

        <Button
          size="lg"
          className="flex min-h-11 w-full items-center justify-center gap-2 text-sm sm:min-h-12 sm:text-base"
          onClick={() => signIn("google", { callbackUrl: "/" })}
        >
          <span className="whitespace-normal text-center">
            Googleで再サインイン
          </span>
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
