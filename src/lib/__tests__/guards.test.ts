// ============================================================================
// Unterbesetzung muss sichtbar werden statt still zu passieren – egal ob sie
// vom Scheduler kommt oder von einer Änderung im Plan von Hand.
//
// J'ADEQA: offen 09:00–19:00, in der Hauptzeit 15:00–19:00 sollen mindestens
// 2 Leute da sein (samstags ab 11:00) – und zu jeder Öffnungsminute mindestens
// eine Person.
// ============================================================================

import { describe, expect, it } from "vitest";
import { analyzeSchedule } from "../analyze";
import { JADEQA_WORK_HOURS } from "../workHours";
import { JADEQA_STAFFING_RULES } from "../staffing";
import type { Employee, Shift } from "../../types";

const emp = (id: string): Employee => ({
  id,
  name: id,
  employmentType: "TEILZEIT",
  targetMinutes: 60 * 60,
});

/** Nachmittagsdienst 15:00–19:00 (4 h bezahlt, keine Pause nötig). */
const peak = (id: string, date = "2026-09-01"): Shift => ({
  id: `shift-${id}`,
  employeeId: id,
  date,
  startMinutes: 15 * 60,
  endMinutes: 19 * 60,
  pauseMinutes: 0,
  paidMinutes: 4 * 60,
  shiftType: "LATE",
  generated: true,
});

/** Ganzer Tag 09:00–19:00 ist mit einer 8-h-Schicht nicht zu schaffen … */
const frueh = (id: string, date = "2026-09-01"): Shift => ({
  id: `shift-frueh-${id}`,
  employeeId: id,
  date,
  startMinutes: 9 * 60,
  endMinutes: 15 * 60,
  pauseMinutes: 0,
  paidMinutes: 6 * 60,
  shiftType: "EARLY",
  generated: true,
});

const spaet = (id: string, date = "2026-09-01"): Shift => ({
  id: `shift-spaet-${id}`,
  employeeId: id,
  date,
  startMinutes: 15 * 60,
  endMinutes: 19 * 60,
  pauseMinutes: 0,
  paidMinutes: 4 * 60,
  shiftType: "LATE",
  generated: true,
});

const analyse = (employees: Employee[], shifts: Shift[], month = 9) =>
  analyzeSchedule({
    year: 2026, month, workHours: JADEQA_WORK_HOURS, employees, shifts,
    rules: JADEQA_STAFFING_RULES,
  });

describe("Zu wenige Leute in der Hauptzeit", () => {
  // 2026-09-01 ist ein Dienstag; hier steht nur EINE Person, und die auch nur
  // von 15 bis 19 Uhr.
  const analysis = analyse([emp("a")], [peak("a")]);

  it("meldet den unterbesetzten Tag, statt ihn zu verschweigen", () => {
    const tag = analysis.peakViolations.find((d) => d.date === "2026-09-01");
    expect(tag).toBeDefined();
    expect(tag!.peaks.some((p) => !p.ok)).toBe(true);
  });

  it("nennt die tatsächliche Personenzahl und die geforderte", () => {
    const hauptzeit = analysis.peakViolations
      .find((d) => d.date === "2026-09-01")!
      .peaks.find((p) => p.label === "Cao điểm T2–T6" && !p.ok)!;
    expect(hauptzeit.minStaff).toBe(1); // so viele stehen wirklich da
    expect(hauptzeit.required).toBe(2); // Vorgabe: zwei in der Hauptzeit
  });

  it("meldet die Lücke am Vormittag – von 09:00 an ist niemand da", () => {
    const day = analysis.days.find((d) => d.date === "2026-09-01")!;
    const offen = day.peaks.find((p) => p.label === "Trong giờ mở cửa")!;
    expect(offen.minStaff).toBe(0);
    expect(offen.ok).toBe(false);
  });

  it("akzeptiert zwei Leute, die zusammen den ganzen Tag abdecken", () => {
    const report = analyse([emp("a"), emp("b")], [frueh("a"), spaet("b"), peak("c-nicht")].slice(0, 2));
    const day = report.days.find((d) => d.date === "2026-09-01")!;
    expect(day.peaks.find((p) => p.label === "Trong giờ mở cửa")?.ok).toBe(true);
  });

  it("zählt eine konkrete Pause als abwesend", () => {
    const report = analyse(
      [emp("a"), emp("b"), emp("c")],
      [
        frueh("a"),
        spaet("b"),
        // 15:00–19:00 mit 30 min Pause ab 16:00 – in der Hauptzeit fehlt sie.
        { ...peak("c"), pauseMinutes: 30, paidMinutes: 3 * 60 + 30, endMinutes: 19 * 60, pauseStartMinutes: 16 * 60 },
      ],
    );
    const day = report.days.find((d) => d.date === "2026-09-01")!;
    const hauptzeit = day.peaks.find((p) => p.label === "Cao điểm T2–T6")!;
    // 15:00–19:00 sind b und c da – ausser von 16:00 bis 16:30, da hat c Pause.
    expect(hauptzeit.maxStaff).toBe(2);
    expect(hauptzeit.minStaff).toBe(1);
    expect(hauptzeit.ok).toBe(false);
  });

  it("samstags verlangt das Studio zwei Leute ab 11:00", () => {
    // 2026-09-05 ist ein Samstag.
    // Nur EINE Person am Samstag: die Untergrenze von zwei ist verletzt.
    const report = analyse([emp("a")], [frueh("a", "2026-09-05")]);
    const day = report.days.find((d) => d.date === "2026-09-05")!;
    const samstag = day.peaks.find((p) => p.label === "Cao điểm T7")!;
    expect(samstag.required).toBe(2);
    expect(samstag.startMinutes).toBe(11 * 60);
    expect(samstag.ok).toBe(false);
  });
});
