const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export const formatApiKeyDate = (value: string | null): string => {
  if (!value) {
    return "Never";
  }

  return dateTimeFormatter.format(new Date(value));
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

export const toDateTimeLocalInputValue = (date: Date): string => {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  const localDate = new Date(date.getTime() - offsetMs);

  return localDate.toISOString().slice(0, 16);
};

export const getDefaultApiKeyExpirationInput = (now = new Date()): string => {
  const expiresAt = new Date(now);
  expiresAt.setMonth(expiresAt.getMonth() + 3);
  expiresAt.setMinutes(0, 0, 0);

  return toDateTimeLocalInputValue(expiresAt);
};

export const dateTimeLocalInputToIso = (value: string): string =>
  new Date(value).toISOString();
