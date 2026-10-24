import { describe, expect, it } from "vitest";
import { dateOf, dateRange, dateWithYear, dayInfo, longDate, shortDate } from "../dates";

// 28 Sep 2026, the dataset's as-of date, is a Monday.
const AS_OF = "2026-09-28";

describe("calendar dates", () => {
  it("counts days from the as-of date in UTC", () => {
    expect(dateOf(AS_OF, 0).toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(dateOf(AS_OF, 30).toISOString()).toBe("2026-10-28T00:00:00.000Z");
    expect(dateOf(AS_OF, -75).toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });

  it("writes short, long and year dates", () => {
    expect(shortDate(AS_OF, 30)).toBe("28 Oct");
    expect(longDate(AS_OF, 0)).toBe("Mon 28 Sep 2026");
    expect(dateWithYear(AS_OF, 185)).toBe("1 Apr 2027");
  });

  it("writes a range inside one month with the month once", () => {
    expect(dateRange(AS_OF, 14, 16)).toBe("12–14 Oct");
  });

  it("writes a range across months with both months", () => {
    expect(dateRange(AS_OF, 32, 34)).toBe("30 Oct–1 Nov");
  });

  it("writes a one-day range as a single date", () => {
    expect(dateRange(AS_OF, 3, 3)).toBe("1 Oct");
  });

  it("marks Mondays, month starts and ISO weeks", () => {
    expect(dayInfo(AS_OF, 0)).toMatchObject({ dayOfMonth: 28, month: "Sep", year: 2026, monday: true, firstOfMonth: false, isoWeek: 40 });
    expect(dayInfo(AS_OF, 3)).toMatchObject({ dayOfMonth: 1, month: "Oct", monday: false, firstOfMonth: true });
  });

  it("puts the first days of January in the last ISO week of the year before when they fall before Thursday", () => {
    // 1 Jan 2027 is a Friday, so it belongs to week 53 of 2026.
    expect(dayInfo("2027-01-01", 0).isoWeek).toBe(53);
    expect(dayInfo("2027-01-04", 0).isoWeek).toBe(1);
  });
});
