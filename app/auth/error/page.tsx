import { Suspense } from "react";
import AuthErrorClient from "./_components/auth-error-client";

export default function AuthErrorPage() {
  return (
    <Suspense fallback={null}>
      <AuthErrorClient />
    </Suspense>
  );
}
