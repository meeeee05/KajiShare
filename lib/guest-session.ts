export const GUEST_EXPIRED_MESSAGE =
  "ゲスト利用期限が切れました。再度ログインしてください。";

export const GUEST_EXPIRED_REDIRECT_PATH = "/auth/signin?guestExpired=1";

export const isGuestSessionUser = (user: unknown): boolean => {
  if (!user || typeof user !== "object") {
    return false;
  }

  const record = user as Record<string, unknown>;
  return record.isGuest === true || record.account_type === "guest";
};

export const isGuestSessionExpiredStatus = (status: number): boolean =>
  status === 401 || status === 404;
