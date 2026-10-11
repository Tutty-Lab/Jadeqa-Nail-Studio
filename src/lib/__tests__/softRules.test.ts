// Weiche Regeln je Mitarbeiter (aus Thienlong / Shin Coco übernommen):
// „Độ dài ca", „Rải đều trong tháng", „Khung giờ ưu tiên" – mit dem J'ADEQA-Team
// (Inhaberin immer da) im September 2026.
import { describe, expect, it } from "vitest";
import type { Employee, Shift } from "../../types";
import { generateSchedule } from "../scheduler";
import { storeById } from "../stores";
import { minutesOutsidePreferred, ownShiftRangeMinutes } from "../preferredWindows";
import { datesOfMonth, parseIsoDate, weekdayKeyOf } from "../demand";
import { resolveDay } from "../workHours";
import { publicHolidays } from "../holidays";
import { monthlyTargetMinutesFor } from "../contract";

const store = storeById("jadeqa");
const openDates = datesOfMonth(2026, 9).filter((d) => !resolveDay(store.workHours, d, publicHolidays(2026), {}).closed);
/** Tri Duc Nguyen: Monatsvertrag 87,4 h, höchstens 5 Tage je Woche. */
const TRI_DUC = "jadeqa-2";

function planWith(id: string, patch: Partial<Employee>): { shifts: Shift[]; soll: number } {
  const employees = store.sampleEmployees().map((e) => (e.id === id ? { ...e, ...patch } : e));
  const shifts = generateSchedule({
    year: 2026, month: 9, workHours: store.workHours, employees,
    rules: store.staffingRules, weights: store.dayWeights, storeTag: store.id,
  });
  const employee = employees.find((e) => e.id === id)!;
  return { shifts: shifts.filter((s) => s.employeeId === id), soll: monthlyTargetMinutesFor(employee, openDates, store.workHours) };
}

const paidByDay = (shifts: Shift[]) => {
  const map = new Map<string, number>();
  for (const s of shifts) map.set(s.date, (map.get(s.date) ?? 0) + s.paidMinutes);
  return map;
};
const total = (shifts: Shift[]) => shifts.reduce((sum, s) => sum + s.paidMinutes, 0);

describe("Độ dài ca", () => {
  const someone = store.sampleEmployees().find((e) => e.id === TRI_DUC)!;

  it("rundet auf das Raster und die Grenzen 3–8 h", () => {
    expect(ownShiftRangeMinutes({ ...someone, shiftHours: { min: 2, max: 3.2 } })).toEqual({ min: 180, max: 180 });
    expect(ownShiftRangeMinutes({ ...someone, shiftHours: { min: 5, max: 10 } })).toEqual({ min: 300, max: 480 });
    expect(ownShiftRangeMinutes(someone)).toBeNull();
  });

  it("Teilzeit 87,4 h mit 4–5 h: fast jeder Arbeitstag liegt darin, Soll bleibt erreicht", () => {
    const { shifts, soll } = planWith(TRI_DUC, { shiftHours: { min: 4, max: 5 } });
    const days = [...paidByDay(shifts)];
    const outside = days.filter(([, paid]) => paid < 240 || paid > 300);
    expect(outside.length, JSON.stringify(outside)).toBeLessThanOrEqual(2);
    expect(Math.abs(total(shifts) - soll)).toBeLessThanOrEqual(30);
  });

  it("ist weich: nur 3 h je Tag passt nicht ins Soll (5 Tage/Woche) – es wird trotzdem voll geplant", () => {
    const { shifts, soll } = planWith(TRI_DUC, { shiftHours: { min: 3, max: 3 } });
    expect(Math.abs(total(shifts) - soll)).toBeLessThanOrEqual(30);
  });
});

describe("Rải đều trong tháng", () => {
  it("mit Độ dài ca: mehr, dafür kürzere Arbeitstage", () => {
    const normal = planWith(TRI_DUC, { shiftHours: { min: 3, max: 6 } });
    const spread = planWith(TRI_DUC, { shiftHours: { min: 3, max: 6 }, spreadEvenly: true });
    expect(paidByDay(spread.shifts).size).toBeGreaterThan(paidByDay(normal.shifts).size);
    expect(total(spread.shifts)).toBe(total(normal.shifts));
  });
});

describe("Khung giờ ưu tiên", () => {
  const outsideOf = (windows: Employee["preferredWindows"] & object, shifts: Shift[]) =>
    shifts.reduce((sum, s) => sum + minutesOutsidePreferred(windows, weekdayKeyOf(parseIsoDate(s.date)), s), 0);
  const afternoons: Employee["preferredWindows"] & object = [
    { days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"], startMinutes: 13 * 60, endMinutes: 19 * 60 },
  ];

  it("nur nachmittags: deutlich weniger außerhalb des Fensters, Stunden bleiben gleich", () => {
    const before = planWith(TRI_DUC, {});
    const after = planWith(TRI_DUC, { preferredWindows: afternoons });
    expect(outsideOf(afternoons, before.shifts)).toBeGreaterThan(0);
    expect(outsideOf(afternoons, after.shifts)).toBeLessThan(outsideOf(afternoons, before.shifts) / 2);
    expect(total(after.shifts)).toBe(total(before.shifts));
  });

  it("das Soll geht vor: passt es nicht ins Fenster, wird trotzdem voll geplant", () => {
    // Nur Fr+Sa 15–19 h: höchstens ~8 h je Woche, das Soll braucht ~20 h.
    const windows: Employee["preferredWindows"] & object = [
      { days: ["friday", "saturday"], startMinutes: 15 * 60, endMinutes: 19 * 60 },
    ];
    const { shifts, soll } = planWith(TRI_DUC, { preferredWindows: windows });
    expect(Math.abs(total(shifts) - soll)).toBeLessThanOrEqual(30);
  });
});
