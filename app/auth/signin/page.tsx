import { Suspense } from "react";
import SignInClient from "./_components/signin-client";

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInClient />
    </Suspense>
  );
}
