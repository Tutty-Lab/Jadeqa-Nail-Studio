import { describe, expect, it } from "vitest";
import { easterSunday, publicHolidays, publicHolidayNames } from "../holidays";
import { generateSchedule } from "../scheduler";
import { validateSchedule } from "../validation";
import { datesOfMonth } from "../demand";
import { resolveDay } from "../workHours";
import { JADEQA_WORK_HOURS } from "../workHours";
import { SAMPLE_EMPLOYEES } from "../sampleData";
import { format } from "date-fns";

describe("Feiertage (Rheinland-Pfalz)", () => {
  it("berechnet Ostersonntag korrekt", () => {
    expect(format(easterSunday(2026), "yyyy-MM-dd")).toBe("2026-04-05");
    expect(format(easterSunday(2024), "yyyy-MM-dd")).toBe("2024-03-31");
  });

  it("enthält die festen und beweglichen Feiertage 2026", () => {
    const h = publicHolidays(2026);
    expect(h.has("2026-01-01")).toBe(true); // Neujahr
    expect(h.has("2026-04-03")).toBe(true); // Karfreitag
    expect(h.has("2026-04-06")).toBe(true); // Ostermontag
    expect(h.has("2026-05-01")).toBe(true); // Tag der Arbeit
    expect(h.has("2026-05-14")).toBe(true); // Christi Himmelfahrt
    expect(h.has("2026-05-25")).toBe(true); // Pfingstmontag
    expect(h.has("2026-10-03")).toBe(true); // Deutsche Einheit
    expect(h.has("2026-06-04")).toBe(true); // Fronleichnam (Ostern + 60)
    expect(h.has("2026-11-01")).toBe(true); // Allerheiligen
    expect(h.has("2026-12-25")).toBe(true);
    expect(h.has("2026-12-26")).toBe(true);
    expect(h.size).toBe(11);
  });

  it("enthält KEINE Feiertage anderer Bundesländer", () => {
    const h = publicHolidays(2026);
    expect(h.has("2026-01-06")).toBe(false); // Heilige Drei Könige – BW/BY/ST
    expect(h.has("2026-10-31")).toBe(false); // Reformationstag – nicht in Rheinland-Pfalz
    expect(h.has("2026-08-15")).toBe(false); // Mariä Himmelfahrt – BY/SL
    expect(h.has("2026-11-18")).toBe(false); // Buß- und Bettag – nur Sachsen
    expect(h.has("2026-04-05")).toBe(false); // Ostersonntag – nur Brandenburg
  });

  it("Set und Namen bleiben deckungsgleich", () => {
    for (const year of [2024, 2026, 2027]) {
      expect(publicHolidays(year).size).toBe(publicHolidayNames(year).size);
    }
  });
});

describe("Scheduler mit Feiertagen (Dezember 2026)", () => {
  const holidays = publicHolidays(2026);
  const openDates = datesOfMonth(2026, 12).filter(
    (d) => !resolveDay(JADEQA_WORK_HOURS, d, holidays, {}).closed,
  );
  const shifts = generateSchedule({
    year: 2026,
    month: 12, // enthält 1. und 2. Weihnachtstag
    workHours: JADEQA_WORK_HOURS,
    employees: SAMPLE_EMPLOYEES,
  });

  it("bleibt gültig (harte Fehler = 0)", () => {
    const result = validateSchedule(SAMPLE_EMPLOYEES, shifts, 2026, openDates);
    expect(result.errors.filter((e) => e.severity !== "warning")).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("plant an Feiertagen niemanden – das Studio ist zu", () => {
    for (const [date] of publicHolidayNames(2026)) {
      expect(shifts.filter((s) => s.date === date), date).toEqual([]);
    }
    // 25./26.12. sind zu, der 24.12. (Donnerstag) ist ein normaler Arbeitstag.
    expect(openDates).not.toContain("2026-12-25");
    expect(openDates).toContain("2026-12-24");
    expect(shifts.some((s) => s.date === "2026-12-24")).toBe(true);
  });
});
