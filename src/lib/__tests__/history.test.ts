import { describe, expect, it } from "vitest";
import { applyReportedHistory, employeeForMonth, hasMonthData } from "../history";
import { initialScheduleFor, storeById } from "../stores";
import { mayWorkOn } from "../availability";
import { monthlyTargetMinutesFor } from "../contract";
import { generateSchedule } from "../scheduler";
import { validateSchedule } from "../validation";
import { datesOfMonth } from "../demand";
import { publicHolidays } from "../holidays";
import { resolveDay } from "../workHours";

const store = storeById("jadeqa");
const schedule = initialScheduleFor(store);
const overrides = Object.fromEntries(schedule.dateOverrides.map((o) => [o.date, o]));
const openDates = (year: number, month: number) => datesOfMonth(year, month).filter((d) => !resolveDay(store.workHours, d, publicHolidays(year), overrides).closed);

describe("studio history reported 08.10.2026", () => {
  it("July includes only Tri and the owner for generation without deleting employee records", () => {
    expect(schedule.employees.filter((e) => hasMonthData(e, "2025-07")).map((e) => e.id)).toEqual(["jadeqa-2"]);
    expect(schedule.employees).toHaveLength(6);
  });
  it("imports all 14 month records and the inclusive closure, without resetting existing data", () => {
    expect(schedule.employees.flatMap((e) => e.payrollRecords ?? [])).toHaveLength(14);
    expect(schedule.dateOverrides).toHaveLength(16);
    expect(schedule.dateOverrides[0].date).toBe("2025-09-24");
    expect(schedule.dateOverrides[schedule.dateOverrides.length - 1]?.date).toBe("2025-10-09");
    const old = { ...schedule, historyVersion: undefined, lockedAt: "locked", printedWeeks: ["2025-09-01"],
      employees: schedule.employees.map((e) => e.id === "jadeqa-3" ? { ...e, endDate: "2025-07-31" } : e) };
    const migrated = applyReportedHistory(old);
    expect(migrated.employees.find((e) => e.id === "jadeqa-3")?.endDate).toBeUndefined();
    expect(migrated.shifts).toBe(old.shifts);
    expect(migrated.lockedAt).toBe("locked");
    expect(migrated.printedWeeks).toEqual(["2025-09-01"]);
    expect(applyReportedHistory(migrated)).toBe(migrated);
  });

  it("uses supplied month totals exactly once, with no second entry-date proration", () => {
    const hai = schedule.employees.find((e) => e.id === "jadeqa-3")!;
    expect(monthlyTargetMinutesFor(hai, openDates(2025, 5), store.workHours)).toBe(Math.round(53.04 * 60));
    expect(monthlyTargetMinutesFor(hai, openDates(2025, 8), store.workHours)).toBe(5616);
    const nhu = schedule.employees.find((e) => e.id === "jadeqa-4")!;
    expect(employeeForMonth(nhu, "2025-09").weeklyHours).toBeUndefined();
    expect(monthlyTargetMinutesFor(nhu, openDates(2025, 9), store.workHours)).toBe(7020);
    expect(employeeForMonth(nhu, "2025-10")).toBe(nhu);
    expect(monthlyTargetMinutesFor(nhu, openDates(2025, 10), store.workHours)).toBeGreaterThan(0);
  });

  it("blocks both ends of each vacation, but allows work afterwards", () => {
    const oanh = schedule.employees.find((e) => e.id === "jadeqa-1")!;
    const nhu = schedule.employees.find((e) => e.id === "jadeqa-4")!;
    for (const date of ["2025-01-01", "2025-01-24"]) expect(mayWorkOn(oanh, date)).toBe(false);
    expect(mayWorkOn(oanh, "2025-01-25")).toBe(true);
    for (const date of ["2026-02-09", "2026-02-28", "2026-03-06"]) expect(mayWorkOn(nhu, date)).toBe(false);
    expect(mayWorkOn(nhu, "2026-03-07")).toBe(true);
  });

  it.each([[2025, 1], [2025, 5], [2025, 9], [2025, 10], [2026, 2], [2026, 3]])("never generates shifts during closures or vacation: %i/%i", (year, month) => {
    const shifts = generateSchedule({ year, month, employees: schedule.employees, workHours: store.workHours, overrides, rules: store.staffingRules, weights: store.dayWeights });
    expect(shifts.length).toBeGreaterThan(0);
    const open = openDates(year, month);
    for (const shift of shifts) {
      expect(open).toContain(shift.date);
      expect(mayWorkOn(schedule.employees.find((e) => e.id === shift.employeeId)!, shift.date)).toBe(true);
    }
    const checked = validateSchedule(schedule.employees, shifts, year, open, store.workHours);
    expect(checked.valid, JSON.stringify(checked.errors)).toBe(true);
    if (year === 2026 && month === 2) {
      const nhu = checked.summaries.find((s) => s.employee.id === "jadeqa-4")!;
      expect(nhu.targetMinutes).toBe(Math.round(86.33 * 60));
      expect(nhu.assignedMinutes).toBeLessThan(nhu.targetMinutes);
      expect(checked.errors.some((e) => e.employeeId === "jadeqa-4" && e.severity === "warning")).toBe(true);
    }
  }, 20000);
});
