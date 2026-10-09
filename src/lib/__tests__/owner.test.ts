import { expect, it } from "vitest";
import { initialScheduleFor, storeById } from "../stores";
import { withOwner } from "../owner";
import { generateSchedule } from "../scheduler";
import { analyzeSchedule } from "../analyze";
import { validateSchedule } from "../validation";
it("owner covers opening hours and improves employee peak coverage without payroll hours", () => {
  const store = storeById("jadeqa");
  const schedule = withOwner({ ...initialScheduleFor(store), year: 2025, month: 5 });
  expect(schedule.employees.filter((e) => e.isOwner)).toHaveLength(1);
  expect(withOwner(schedule).shifts).toHaveLength(schedule.shifts.length);
  const input = { year: 2025, month: 5, workHours: schedule.workHours, employees: schedule.employees, rules: store.staffingRules, weights: store.dayWeights };
  const shifts = generateSchedule(input);
  const analysis = analyzeSchedule({ ...input, shifts });
  const open = analysis.days.filter((d) => !d.closed);
  expect(open.every((d) => d.peaks[0].minStaff >= 1)).toBe(true);
  expect(shifts.filter((s) => s.employeeId === "jadeqa-owner")).toHaveLength(25);
  expect(shifts.filter((s) => s.employeeId === "jadeqa-owner").every((s) => s.paidMinutes === 0)).toBe(true);
  expect(open.filter((d) => d.peaks.length > 1 && d.peaks.slice(1).every((p) => p.ok)).length).toBeGreaterThan(10);
  const checked = validateSchedule(schedule.employees, shifts, 2025, open.map((d) => d.date), schedule.workHours);
  expect(checked.valid, JSON.stringify(checked.errors)).toBe(true);
  expect(checked.summaries.some((s) => s.employee.isOwner)).toBe(false);
  // May 5–10 and May 19–24 are full six-day weeks for Oanh and Tri.
  for (const id of ["jadeqa-1", "jadeqa-2"]) {
    const sum = (first: string, last: string) => shifts.filter((s) => s.employeeId === id && s.date >= first && s.date <= last).reduce((total, s) => total + s.paidMinutes, 0);
    expect(Math.abs(sum("2025-05-05", "2025-05-10") - sum("2025-05-19", "2025-05-24"))).toBeLessThanOrEqual(60);
  }
}, 60000);
