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
  status === 401;

const extractMessageFromRecord = (
  record: Record<string, unknown> | null,
): string | undefined => {
  if (!record) {
    return undefined;
  }

  const message = record.message ?? record.error;
  if (typeof message === "string" && message.trim()) {
    return message;
  }

  const data = record.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return undefined;
  }

  const dataRecord = data as Record<string, unknown>;
  const nestedMessage = dataRecord.message ?? dataRecord.error;
  if (typeof nestedMessage === "string" && nestedMessage.trim()) {
    return nestedMessage;
  }

  return undefined;
};

export const isGuestSessionExpiredMessage = (payload: unknown): boolean => {
  if (typeof payload === "string") {
    return payload.trim() === GUEST_EXPIRED_MESSAGE;
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }

  return (
    extractMessageFromRecord(payload as Record<string, unknown>) ===
    GUEST_EXPIRED_MESSAGE
  );
};
