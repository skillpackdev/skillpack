import { format, formatDistanceToNow, isThisYear } from "date-fns";

export const formatApiKeyDate = (value: string | null): string => {
  if (!value) {
    return "Never";
  }

  return formatDistanceToNow(new Date(value), { addSuffix: true });
};

export const formatApiKeyExpirationDate = (value: string): string => {
  const date = new Date(value);

  return format(date, isThisYear(date) ? "MMM d" : "MMM d, yyyy");
};

export const getApiKeyStatus = (
  expiresAt: string,
  revokedAt: string | null,
  now = new Date()
): "active" | "expired" | "revoked" => {
  if (revokedAt) {
    return "revoked";
  }

  if (new Date(expiresAt) <= now) {
    return "expired";
  }

  return "active";
};

export const toDateInputValue = (date: Date): string => {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  const localDate = new Date(date.getTime() - offsetMs);

  return localDate.toISOString().slice(0, 10);
};

export const getDefaultApiKeyExpirationInput = (now = new Date()): string => {
  const expiresAt = new Date(now);
  expiresAt.setMonth(expiresAt.getMonth() + 3);

  return toDateInputValue(expiresAt);
};

export const dateInputToIso = (value: string): string =>
  new Date(`${value}T00:00:00`).toISOString();
