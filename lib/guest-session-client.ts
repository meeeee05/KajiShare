// ゲストユーザーリダイレクト管理
"use client";

import { signOut } from "next-auth/react";
import {
  GUEST_EXPIRED_REDIRECT_PATH,
  isGuestSessionExpiredMessage,
  isGuestSessionExpiredStatus,
  isGuestSessionUser,
} from "@/lib/guest-session";

// ストレージクリアエラーを報告
const reportStorageClearError = (
  storageName: "localStorage" | "sessionStorage",
  error: unknown,
) => {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[guest-session] Failed to clear ${storageName}`, error);
  }
};

// ゲストユーザーデータをクリア
export const clearGuestLocalData = () => {
  try {
    window.localStorage.clear();
  } catch (error) {
    reportStorageClearError("localStorage", error);
  }

  try {
    window.sessionStorage.clear();
  } catch (error) {
    reportStorageClearError("sessionStorage", error);
  }
};

// ゲストセッション期限切れレスポンスを処理
export const handleGuestSessionExpiryResponse = async (params: {
  response: Response | null;
  sessionUser: unknown;
  onRedirect: (path: string) => void;
}): Promise<boolean> => {
  const { response, sessionUser, onRedirect } = params;

  if (!response) {
    return false;
  }

  if (!isGuestSessionUser(sessionUser)) {
    return false;
  }

  if (!isGuestSessionExpiredStatus(response.status)) {
    return false;
  }

  const payload = await response
    .clone()
    .json()
    .catch(async () => {
      const text = await response
        .clone()
        .text()
        .catch(() => "");
      return text || null;
    });

  if (!isGuestSessionExpiredMessage(payload)) {
    return false;
  }

  clearGuestLocalData();
  await signOut({ redirect: false }).catch(() => undefined);
  onRedirect(GUEST_EXPIRED_REDIRECT_PATH);
  return true;
};
