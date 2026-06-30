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

export const toDateInputValue = (date: Date): string => {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  const localDate = new Date(date.getTime() - offsetMs);

  return localDate.toISOString().slice(0, 10);
};

export const getMinApiKeyExpirationInput = (now = new Date()): string =>
  toDateInputValue(now);

export const getDefaultApiKeyExpirationInput = (now = new Date()): string => {
  const expiresAt = new Date(now);
  expiresAt.setMonth(expiresAt.getMonth() + 3);

  return toDateInputValue(expiresAt);
};

export const getMaxApiKeyExpirationInput = (now = new Date()): string => {
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  return toDateInputValue(expiresAt);
};

export const dateInputToIso = (value: string): string =>
  new Date(`${value}T00:00:00`).toISOString();
