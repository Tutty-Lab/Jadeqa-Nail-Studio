import type { Employee, Schedule, Shift } from "../types";
import { datesOfMonth } from "./demand";
import { publicHolidays } from "./holidays";
import { resolveDay, type WorkHoursConfig, type OverrideMap } from "./workHours";

export const OWNER: Employee = { id: "jadeqa-owner", name: "Chủ tiệm", isOwner: true, employmentType: "VOLLZEIT", targetMinutes: 0 };

/** Presence for staffing only; never employee payroll hours. */
export function ownerPresence(year: number, month: number, workHours: WorkHoursConfig, overrides: OverrideMap = {}, owners: Employee[] = [OWNER], holidays = publicHolidays(year)): Shift[] {
  return owners.flatMap((owner) => datesOfMonth(year, month).flatMap((date) => {
    const day = resolveDay(workHours, date, holidays, overrides);
    return day.closed ? [] : day.blocks.map((block, i) => ({
      id: `owner-${owner.id}-${date}-${i}`, employeeId: owner.id, date,
      startMinutes: block.startMinutes, endMinutes: block.endMinutes,
      pauseMinutes: 0, paidMinutes: 0, shiftType: "CUSTOM" as const, generated: true,
    }));
  }));
}

export function withOwner(schedule: Schedule): Schedule {
  const employees = schedule.employees.some((e) => e.isOwner) ? schedule.employees : [...schedule.employees, { ...OWNER }];
  const owners = employees.filter((e) => e.isOwner);
  return { ...schedule, employees, shifts: [
    ...schedule.shifts.filter((s) => !owners.some((e) => e.id === s.employeeId)),
    ...ownerPresence(schedule.year, schedule.month, schedule.workHours, Object.fromEntries(schedule.dateOverrides.map((o) => [o.date, o])), owners),
  ] };
}
