import { describe, expect, it } from "vitest";
import { generateSchedule } from "../scheduler";
import { validateSchedule } from "../validation";
import { maxConsecutiveRun } from "../consecutive";
import { SAMPLE_EMPLOYEES } from "../sampleData";
import { JADEQA_WORK_HOURS } from "../workHours";
import { calculatePause } from "../time";
import { datesOfMonth, parseIsoDate } from "../demand";
import { resolveDay } from "../workHours";
import { publicHolidays } from "../holidays";
import { monthlyTargetMinutesFor } from "../contract";

const openDatesOf = (year: number, month: number): string[] => {
  const hol = publicHolidays(year);
  return datesOfMonth(year, month).filter((d) => !resolveDay(JADEQA_WORK_HOURS, d, hol, {}).closed);
};

describe("Scheduler – August 2026 Beispieldaten (J'ADEQA)", () => {
  const shifts = generateSchedule({
    year: 2026,
    month: 8,
    workHours: JADEQA_WORK_HOURS,
    employees: SAMPLE_EMPLOYEES,
  });

  const openDates = openDatesOf(2026, 8);

  it("verteilt die Summe der Wochenstunden innerhalb des 30-Minuten-Rasters", () => {
    const soll = SAMPLE_EMPLOYEES.reduce((sum, e) => sum + monthlyTargetMinutesFor(e, openDates), 0);
    const totalMinutes = shifts.reduce((s, x) => s + x.paidMinutes, 0);
    expect(Math.abs(totalMinutes - soll)).toBeLessThan(SAMPLE_EMPLOYEES.length * 30);
  });

  it("trifft jedes Mitarbeiter-Soll bis auf die Randwochen-Rundung", () => {
    for (const emp of SAMPLE_EMPLOYEES) {
      const assigned = shifts
        .filter((s) => s.employeeId === emp.id)
        .reduce((sum, s) => sum + s.paidMinutes, 0);
      expect(Math.abs(assigned - monthlyTargetMinutesFor(emp, openDates))).toBeLessThan(30);
    }
  });

  it("hält alle harten Regeln ein (Validierung grün)", () => {
    const result = validateSchedule(SAMPLE_EMPLOYEES, shifts, 2026, openDates);
    expect(result.errors.filter((e) => e.severity !== "warning")).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("kein Mitarbeiter steht zweimal gleichzeitig im Laden", () => {
    // Zwei Dienste an einem Tag sind erlaubt (mittags und abends), solange sie
    // sich nicht überschneiden.
    const ueberlappungen: string[] = [];
    for (const a of shifts) {
      for (const b of shifts) {
        if (a === b || a.employeeId !== b.employeeId || a.date !== b.date) continue;
        if (a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes) {
          ueberlappungen.push(`${a.employeeId} ${a.date}`);
        }
      }
    }
    expect(ueberlappungen).toEqual([]);
  });

  it("nie mehr als 6 aufeinanderfolgende Arbeitstage", () => {
    for (const emp of SAMPLE_EMPLOYEES) {
      const dates = shifts.filter((s) => s.employeeId === emp.id).map((s) => s.date);
      expect(maxConsecutiveRun(dates)).toBeLessThanOrEqual(6);
    }
  });

  it("jede Schicht: paid <= 9 h und korrekte Pause", () => {
    for (const s of shifts) {
      expect(s.paidMinutes).toBeLessThanOrEqual(8 * 60);
      expect(s.pauseMinutes).toBe(calculatePause(s.paidMinutes));
      expect(s.endMinutes - s.startMinutes - s.pauseMinutes).toBe(s.paidMinutes);
      expect(s.startMinutes % 30).toBe(0);
      expect(s.endMinutes % 30).toBe(0);
    }
  });

  it("ist deterministisch (gleiche Eingabe => gleiche Ausgabe)", () => {
    const again = generateSchedule({
      year: 2026,
      month: 8,
      workHours: JADEQA_WORK_HOURS,
      employees: SAMPLE_EMPLOYEES,
    });
    expect(again.map((s) => `${s.date}|${s.employeeId}|${s.paidMinutes}|${s.shiftType}`)).toEqual(
      shifts.map((s) => `${s.date}|${s.employeeId}|${s.paidMinutes}|${s.shiftType}`),
    );
  });

  it("keeps individual contracts while weighting busy days (T6/T7 = 2,0)", () => {
    // Monatsvertrag (87,4 h) wird auf dem 30-Minuten-Raster eingehalten.
    const own = shifts.filter((shift) => shift.employeeId === "jadeqa-2");
    expect(Math.abs(own.reduce((sum, shift) => sum + shift.paidMinutes, 0) - 87.4 * 60)).toBeLessThanOrEqual(30);
    // Tab „Tài liệu": Freitag und Samstag (Gewicht 2,0) tragen je Tag deutlich
    // mehr Stunden als ein normaler Tag.
    const proTag = (weekdays: number[]) => {
      const days = new Map<string, number>();
      for (const shift of shifts) {
        if (!weekdays.includes(parseIsoDate(shift.date).getDay())) continue;
        days.set(shift.date, (days.get(shift.date) ?? 0) + shift.paidMinutes);
      }
      return [...days.values()].reduce((sum, m) => sum + m, 0) / days.size;
    };
    const stark = proTag([5, 6]); // Fr, Sa
    const normal = proTag([1, 2, 3, 4]); // Mo–Do
    // Kleines Team: der Abstand fällt geringer aus als bei einer großen
    // Filiale, weil jeder Tag zuerst die Mindestbesetzung tragen muss.
    expect(stark / normal).toBeGreaterThanOrEqual(1.1);
    expect(stark / normal).toBeLessThanOrEqual(2.2);
  });
});

describe("Scheduler – weitere Monate robust", () => {
  it("erzeugt gültige Pläne für Februar (28 Tage)", () => {
    const shifts = generateSchedule({
      year: 2026,
      month: 2,
      workHours: JADEQA_WORK_HOURS,
      employees: SAMPLE_EMPLOYEES,
    });
    const result = validateSchedule(SAMPLE_EMPLOYEES, shifts, 2026, openDatesOf(2026, 2));
    expect(result.valid).toBe(true);
  });
});
