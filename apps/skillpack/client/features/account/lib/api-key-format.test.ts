import { describe, expect, it } from "vitest";

import {
  dateInputToIso,
  formatApiKeyDate,
  formatApiKeyExpirationDate,
  toDateInputValue,
} from "./api-key-format";

describe("API key formatting helpers", () => {
  it("converts date values to local midnight ISO strings", () => {
    const value = toDateInputValue(new Date("2026-06-29T10:00:00.000Z"));

    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(dateInputToIso(value)).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
  });

  it("formats dates as relative human readable text", () => {
    expect(
      formatApiKeyDate(new Date(Date.now() - 2 * 86_400_000).toISOString())
    ).toContain("ago");
    expect(formatApiKeyDate(null)).toBe("Never");
  });

  it("formats expiration dates with year only outside this year", () => {
    const thisYear = new Date().getFullYear();

    expect(formatApiKeyExpirationDate(`${thisYear}-06-29T00:00:00.000Z`)).toBe(
      "Jun 29"
    );
    expect(
      formatApiKeyExpirationDate(`${thisYear + 1}-06-29T00:00:00.000Z`)
    ).toBe(`Jun 29, ${thisYear + 1}`);
  });
});
