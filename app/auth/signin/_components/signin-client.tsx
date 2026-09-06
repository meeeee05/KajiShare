"use client";

import Image from "next/image";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { GUEST_EXPIRED_MESSAGE } from "@/lib/guest-session";
import { clearGuestLocalData } from "@/lib/guest-session-client";

export default function SignInClient() {
  const searchParams = useSearchParams();
  const guestExpired = searchParams.get("guestExpired") === "1";

  useEffect(() => {
    if (!guestExpired) {
      return;
    }

    clearGuestLocalData();
  }, [guestExpired]);

  return (
    <div className="flex min-h-[calc(100dvh-6rem)] items-center justify-center px-3 py-4 sm:min-h-[60vh] sm:px-4 sm:py-6">
      <div className="w-full max-w-[390px] space-y-5 rounded-2xl border bg-background p-5 shadow-sm sm:space-y-6 sm:p-8">
        <div className="flex flex-col items-center gap-3 text-center sm:gap-4">
          <Image
            src="https://next-auth.js.org/img/logo/logo-sm.png"
            alt="KajiShare"
            width={56}
            height={56}
            className="h-12 w-12 sm:h-14 sm:w-14"
            priority
          />
          <div>
            {guestExpired ? (
              <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {GUEST_EXPIRED_MESSAGE}
              </p>
            ) : null}
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              Googleアカウントからサインインできます
            </p>
          </div>
        </div>
        <Button
          size="lg"
          className="flex min-h-11 w-full items-center justify-center gap-2 text-sm sm:min-h-12 sm:text-base"
          onClick={() => signIn("google", { callbackUrl: "/" })}
        >
          <span>Googleでサインイン</span>
          <Image
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google"
            width={20}
            height={20}
            style={{ display: "inline-block" }}
          />
        </Button>
        <button
          type="button"
          className="w-full text-center text-sm text-blue-600 hover:underline"
          onClick={() =>
            signIn("guest", {
              mode: "guest",
              callbackUrl: "/",
            })
          }
        >
          ゲストログイン
        </button>
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          個人情報の取り扱いについては、
          <Link href="/privacy" className="text-blue-600 hover:underline">
            プライバシーポリシー
          </Link>
          をご確認ください。
        </p>
      </div>
    </div>
  );
}
