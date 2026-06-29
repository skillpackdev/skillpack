import { describe, expect, it } from "vitest";

import {
  dateTimeLocalInputToIso,
  getApiKeyStatus,
  toDateTimeLocalInputValue,
} from "./api-key-format";

describe("API key formatting helpers", () => {
  it("reports API key status from expiration and revocation", () => {
    const now = new Date("2026-06-29T10:00:00.000Z");

    expect(getApiKeyStatus("2026-06-29T10:01:00.000Z", null, now)).toBe(
      "active"
    );
    expect(getApiKeyStatus("2026-06-29T10:00:00.000Z", null, now)).toBe(
      "expired"
    );
    expect(
      getApiKeyStatus(
        "2026-06-29T10:01:00.000Z",
        "2026-06-29T09:00:00.000Z",
        now
      )
    ).toBe("revoked");
  });

  it("converts datetime-local values through ISO strings", () => {
    const value = toDateTimeLocalInputValue(
      new Date("2026-06-29T10:00:00.000Z")
    );

    expect(dateTimeLocalInputToIso(value)).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/u
    );
  });
});
