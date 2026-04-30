"use client";

import { signOut } from "next-auth/react";
import {
  GUEST_EXPIRED_REDIRECT_PATH,
  isGuestSessionExpiredStatus,
  isGuestSessionUser,
} from "@/lib/guest-session";

const PRESERVE_LOCAL_STORAGE_KEYS = new Set(["theme"]);

const removeGuestLikeKeys = (storage: Storage) => {
  const targets: string[] = [];

  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key) {
      continue;
    }

    if (PRESERVE_LOCAL_STORAGE_KEYS.has(key)) {
      continue;
    }

    const lowered = key.toLowerCase();
    if (
      lowered.includes("guest") ||
      lowered.includes("token") ||
      lowered.includes("user") ||
      lowered.includes("group") ||
      lowered.includes("assignment-status") ||
      lowered.includes("nextauth")
    ) {
      targets.push(key);
    }
  }

  for (const key of targets) {
    storage.removeItem(key);
  }
};

export const clearGuestLocalData = () => {
  try {
    removeGuestLikeKeys(window.localStorage);
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

  clearGuestLocalData();
  await signOut({ redirect: false }).catch(() => undefined);
  onRedirect(GUEST_EXPIRED_REDIRECT_PATH);
  return true;
};
