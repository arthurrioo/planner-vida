import { describe, expect, it } from "vitest";

import {
  addMonthsClamped,
  compareLocalDate,
  createLocalDate,
  getMonthBounds,
  parseLocalDate,
  parseTimestampWithTimeZone,
} from "./local-date";

describe("LocalDate and timezone primitives", () => {
  it("parses date-only financial dates without timezone conversion", () => {
    expect(parseLocalDate("2026-09-15")).toBe("2026-09-15");
    expect(
      compareLocalDate(
        parseLocalDate("2026-09-15"),
        parseLocalDate("2026-09-16"),
      ),
    ).toBe(-1);
  });

  it("handles month boundaries and leap years deterministically", () => {
    expect(getMonthBounds(2028, 2)).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
    });
    expect(addMonthsClamped(parseLocalDate("2026-01-31"), 1)).toBe(
      "2026-02-28",
    );
    expect(addMonthsClamped(parseLocalDate("2028-01-31"), 1)).toBe(
      "2028-02-29",
    );
    expect(createLocalDate(2026, 12, 31)).toBe("2026-12-31");
  });

  it("rejects invalid calendar dates", () => {
    expect(() => parseLocalDate("2026-02-29")).toThrow("day");
    expect(() => parseLocalDate("2026-13-01")).toThrow("month");
    expect(() => parseLocalDate("15/09/2026")).toThrow("YYYY-MM-DD");
  });

  it("requires timed events to carry explicit timezone offset plus app timezone", () => {
    expect(
      parseTimestampWithTimeZone(
        "2026-09-15T15:30:00-03:00",
        "America/Sao_Paulo",
      ),
    ).toEqual({
      instant: "2026-09-15T18:30:00.000Z",
      timeZone: "America/Sao_Paulo",
    });
    expect(() => parseTimestampWithTimeZone("2026-09-15T15:30:00")).toThrow(
      "timezone offset",
    );
    expect(() =>
      parseTimestampWithTimeZone("2026-09-15T15:30:00Z", "Not/AZone"),
    ).toThrow("Unsupported");
  });
});
