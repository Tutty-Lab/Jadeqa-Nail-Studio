import { describe, expect, it } from "vitest";
import { clampScheduleYear, isScheduleYearAllowed, SCHEDULE_YEARS, SCHEDULE_YEAR_RANGE_LABEL } from "../years";

describe("Năm được phép xếp/in lịch (checklist G: 2024–2028)", () => {
  it("chỉ gồm 2024 đến 2028", () => {
    expect(SCHEDULE_YEARS).toEqual([2024, 2025, 2026, 2027, 2028]);
    expect(SCHEDULE_YEAR_RANGE_LABEL).toBe("2024–2028");
  });

  it("chặn năm ngoài khoảng", () => {
    expect(isScheduleYearAllowed(2024)).toBe(true);
    expect(isScheduleYearAllowed(2028)).toBe(true);
    expect(isScheduleYearAllowed(2023)).toBe(false);
    expect(isScheduleYearAllowed(2029)).toBe(false);
    expect(isScheduleYearAllowed(2025.5)).toBe(false);
  });

  it("đưa năm về khoảng cho phép", () => {
    expect(clampScheduleYear(2020)).toBe(2024);
    expect(clampScheduleYear(2026)).toBe(2026);
    expect(clampScheduleYear(2035)).toBe(2028);
    expect(clampScheduleYear(Number.NaN)).toBe(2024);
  });
});
