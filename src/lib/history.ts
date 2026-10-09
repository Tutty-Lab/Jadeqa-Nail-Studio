import type { Employee, PayrollRecord, Schedule, Vacation } from "../types";
import { datesOfMonth } from "./demand";

// Supplied by the studio on 08.10.2026. Missing months carry no inference.
const payroll: Record<string, PayrollRecord[]> = {
  "jadeqa-1": [
    { month: "2025-05", grossEuro: 900, convertedHours: 70.20 },
    { month: "2025-09", grossEuro: 900, convertedHours: 70.20 },
  ],
  "jadeqa-2": ["2025-05", "2025-06", "2025-07", "2025-08"].map((month) =>
    ({ month, grossEuro: 1120, convertedHours: 87.36 })),
  "jadeqa-3": [
    { month: "2025-05", grossEuro: 680, convertedHours: 53.04 },
    { month: "2025-06", grossEuro: 1200, convertedHours: 93.60 },
    { month: "2025-08", grossEuro: 1200, convertedHours: 93.60 },
  ],
  "jadeqa-4": [
    { month: "2025-09", grossEuro: 1500, convertedHours: 117.00 },
    { month: "2025-11", grossEuro: 1500, convertedHours: 117.00 },
    { month: "2026-02", grossEuro: 1200, convertedHours: 86.33 },
  ],
  "jadeqa-5": [{ month: "2026-03", grossEuro: 305, convertedHours: 21.94 }],
  "jadeqa-6": [{ month: "2026-03", grossEuro: 1200, convertedHours: 86.33 }],
};
const vacations: Record<string, Vacation[]> = {
  "jadeqa-1": [{ start: "2025-01-01", end: "2025-01-24" }],
  "jadeqa-4": [{ start: "2026-02-09", end: "2026-03-06" }],
};

export function withReportedHistory(employee: Employee): Employee {
  const records = new Map((employee.payrollRecords ?? []).map((r) => [r.month, r]));
  for (const record of payroll[employee.id] ?? []) records.set(record.month, { ...record });
  const leaves = new Map((employee.vacations ?? []).map((r) => [`${r.start}/${r.end}`, r]));
  for (const leave of vacations[employee.id] ?? []) leaves.set(`${leave.start}/${leave.end}`, { ...leave });
  return { ...employee,
    endDate: employee.id === "jadeqa-3" && employee.endDate === "2025-07-31" ? undefined : employee.endDate,
    payrollRecords: [...records.values()], vacations: [...leaves.values()] };
}

export function applyReportedHistory(schedule: Schedule): Schedule {
  if ((schedule.historyVersion ?? 0) >= 1) return schedule;
  const overrides = new Map(schedule.dateOverrides.map((o) => [o.date, o]));
  for (const date of [...datesOfMonth(2025, 9), ...datesOfMonth(2025, 10)]) {
    if (date < "2025-09-24" || date > "2025-10-09") continue;
    const old = overrides.get(date);
    overrides.set(date, { ...old, date, closed: true,
      note: [old?.note, "Tiệm nghỉ do ốm"].filter(Boolean).join(" · ") });
  }
  return {
    ...schedule,
    historyVersion: 1,
    dateOverrides: [...overrides.values()].sort((a, b) => a.date.localeCompare(b.date)),
    employees: schedule.employees.map(withReportedHistory),
  };
}

/** The supplied month total overrides the general contract, without prorating again. */
export function employeeForMonth(employee: Employee, month: string): Employee {
  const record = employee.payrollRecords?.find((r) => r.month === month);
  return record ? { ...employee, weeklyHours: undefined, targetMinutes: Math.round(record.convertedHours * 60) } : employee;
}

/** Eligibility for generation only; missing payroll is not an employment exit. */
export function hasMonthData(employee: Employee, month: string): boolean {
  return Boolean(employee.isOwner || employee.payrollRecords?.some((r) => r.month === month));
}
