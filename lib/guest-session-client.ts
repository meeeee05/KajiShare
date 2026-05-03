"use client";

import { signOut } from "next-auth/react";
import {
  GUEST_EXPIRED_REDIRECT_PATH,
  isGuestSessionExpiredMessage,
  isGuestSessionExpiredStatus,
  isGuestSessionUser,
} from "@/lib/guest-session";

export const clearGuestLocalData = () => {
  try {
    window.localStorage.clear();
  } catch {
    // ignore storage errors
  }

  try {
    window.sessionStorage.clear();
  } catch {
    // ignore storage errors
  }
};

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
