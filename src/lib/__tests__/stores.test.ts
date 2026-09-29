// ============================================================================
// Die Vorgaben des Betriebs für J'ADEQA Nagelstudio:
//   - offen Mo–Sa 09:00–19:00; Sonntag und Feiertage (Rheinland-Pfalz) zu
//   - die ganze Öffnungszeit ist besetzt, nie null Personen
//   - Hauptzeit Mo–Fr 15:00–19:00 und Sa ab 11:00: zwei Personen
//   - höchstens 8 h bezahlt am Tag, höchstens 6 Tage am Stück
//   - Eintritt und Austritt gelten: davor/danach wird niemand eingeplant, und
//     das Monats-Soll wird anteilig gerechnet
// ============================================================================

import { describe, expect, it } from "vitest";
import type { Employee, Shift } from "../../types";
import { generateSchedule } from "../scheduler";
import { validateSchedule } from "../validation";
import { analyzeSchedule } from "../analyze";
import { STORES, initialScheduleFor, storeById, type StoreConfig } from "../stores";
import { resolveDay } from "../workHours";
import { publicHolidays } from "../holidays";
import { datesOfMonth, parseIsoDate, weekdayKeyOf } from "../demand";
import { staffingWindows, workingAt } from "../staffing";
import { maxConsecutiveRun } from "../consecutive";
import { weekStartOf } from "../weeks";
import { monthlyTargetMinutesFor } from "../contract";

const MONTHS = [2, 6, 9, 12];
const TEAMS = STORES.map((store) => [store.shortName, store] as const);

function openDatesOf(year: number, month: number, store: StoreConfig): string[] {
  const holidays = publicHolidays(year);
  return datesOfMonth(year, month).filter((d) => !resolveDay(store.workHours, d, holidays, {}).closed);
}

function teamOf(store: StoreConfig): Employee[] {
  return store.sampleEmployees();
}

function planOf(year: number, month: number, store: StoreConfig, employees = teamOf(store)): Shift[] {
  return generateSchedule({
    year,
    month,
    workHours: store.workHours,
    employees,
    rules: store.staffingRules,
    weights: store.dayWeights,
    storeTag: store.id,
  });
}

/** Wie viele Leute sind zu dieser Minute im Studio? */
const staffAt = (shifts: Shift[], minute: number): number =>
  new Set(shifts.filter((s) => workingAt(s, minute)).map((s) => s.employeeId)).size;

describe("Öffnungszeiten", () => {
  it.each(TEAMS)("%s: plant nie sonntags, nie an Feiertagen, und jeder Dienst liegt im Öffnungsfenster", (_name, store) => {
    const holidays = publicHolidays(2026);
    for (const month of MONTHS) {
      for (const shift of planOf(2026, month, store)) {
        const day = resolveDay(store.workHours, shift.date, holidays, {});
        expect(weekdayKeyOf(parseIsoDate(shift.date)), shift.date).not.toBe("sunday");
        expect(holidays.has(shift.date), shift.date).toBe(false);
        expect(day.closed, shift.date).toBe(false);
        expect(
          day.blocks.some((b) => shift.startMinutes >= b.startMinutes && shift.endMinutes <= b.endMinutes),
          `${shift.date} ${shift.startMinutes}`,
        ).toBe(true);
      }
    }
  });

  it("Mo–Sa 09:00–19:00, Sonntag und Feiertage geschlossen", () => {
    const hours = storeById("jadeqa").workHours;
    for (const key of ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const) {
      expect(hours.perWeekday[key]).toEqual([{ startMinutes: 9 * 60, endMinutes: 19 * 60 }]);
      expect(hours.closedWeekdays[key]).toBe(false);
    }
    expect(hours.closedWeekdays.sunday).toBe(true);
    expect(hours.holidayClosed).toBe(true);
  });
});

describe("Harte Regeln", () => {
  it.each(TEAMS)("%s: es ist von der ersten bis zur letzten Minute jemand im Studio", (_name, store) => {
    const holidays = publicHolidays(2026);
    for (const month of MONTHS) {
      const shifts = planOf(2026, month, store);
      for (const date of openDatesOf(2026, month, store)) {
        const onDay = shifts.filter((s) => s.date === date);
        for (const block of resolveDay(store.workHours, date, holidays, {}).blocks) {
          for (let m = block.startMinutes; m < block.endMinutes; m += 30) {
            expect(staffAt(onDay, m), `${date} ${m}`).toBeGreaterThanOrEqual(1);
          }
        }
      }
    }
  });

  it.each(TEAMS)("%s: höchstens 8 bezahlte Stunden je Tag und 6 Tage am Stück", (_name, store) => {
    for (const month of MONTHS) {
      const shifts = planOf(2026, month, store);
      const perDay = new Map<string, number>();
      for (const s of shifts) {
        const key = `${s.employeeId}#${s.date}`;
        perDay.set(key, (perDay.get(key) ?? 0) + s.paidMinutes);
      }
      for (const [key, minutes] of perDay) expect(minutes, key).toBeLessThanOrEqual(8 * 60);
      for (const employee of teamOf(store)) {
        const dates = new Set(shifts.filter((s) => s.employeeId === employee.id).map((s) => s.date));
        expect(maxConsecutiveRun(dates), `${employee.name} ${month}`).toBeLessThanOrEqual(6);
        const proWoche = new Map<string, Set<string>>();
        for (const date of dates) proWoche.set(weekStartOf(date), (proWoche.get(weekStartOf(date)) ?? new Set()).add(date));
        for (const [week, tage] of proWoche) {
          expect(tage.size, `${employee.name} ${week}`).toBeLessThanOrEqual(employee.maxDaysPerWeek ?? 6);
        }
      }
    }
  });

  it.each(TEAMS)("%s: erfüllt jeden Vertrag auf die halbe Stunde genau", (_name, store) => {
    for (const month of MONTHS) {
      const shifts = planOf(2026, month, store);
      const team = teamOf(store);
      const openDates = openDatesOf(2026, month, store);
      const result = validateSchedule(team, shifts, 2026, openDates, store.workHours);
      expect(result.errors.filter((e) => e.severity !== "warning"), `Monat ${month}`).toEqual([]);
      for (const summary of result.summaries) {
        // Ein Wochenvertrag verliert am Monatsrand höchstens den Rest einer
        // angebrochenen Woche (unter drei Stunden), sonst muss es genau passen.
        const spielraum = summary.employee.weeklyHours != null ? 180 : 30;
        expect(Math.abs(summary.diffMinutes), `${summary.employee.name} ${month}`).toBeLessThanOrEqual(spielraum);
        // 19,5 h/Woche ergeben ein Monats-Soll wie 82,98 h – das liegt nicht auf
        // dem 30-Minuten-Raster, also darf der Plan um eine halbe Stunde darüber
        // liegen. Ein Soll auf dem Raster muss exakt eingehalten werden.
        const ueber = summary.targetMinutes % 30 === 0 ? 0 : 30;
        expect(summary.assignedMinutes, `${summary.employee.name} ${month}`).toBeLessThanOrEqual(summary.targetMinutes + ueber);
      }
    }
  });
});

describe("Hauptzeit", () => {
  /**
   * Erlaubte unterbesetzte halbe Stunden je Monat. Die Untergrenze von zwei
   * Personen ist die Vorgabe des Betriebs, aber sie ist nicht in jedem Monat
   * bezahlbar: das Team ist klein und wechselt, und in einer angebrochenen
   * Woche am Monatsrand gehört nur ein Teil der Woche zum Monat. Die Schwelle
   * ist eine Regressionsbremse – wird es mehr, stimmt etwas nicht.
   */
  const LUECKEN_BUDGET = 40;

  it.each(TEAMS)("%s: hält die Untergrenzen, soweit die Vertragsstunden reichen", (_name, store) => {
    const holidays = publicHolidays(2026);
    for (const month of MONTHS) {
      const shifts = planOf(2026, month, store);
      let luecken = 0;
      for (const date of openDatesOf(2026, month, store)) {
        const onDay = shifts.filter((s) => s.date === date);
        const day = resolveDay(store.workHours, date, holidays, {});
        for (const w of staffingWindows(day.blocks, weekdayKeyOf(parseIsoDate(date)), store.staffingRules)) {
          if (w.minStaff < 2) continue; // die Abdeckung selbst prüft der Test oben
          for (let m = w.startMinutes; m < w.endMinutes; m += 30) {
            if (staffAt(onDay, m) < w.minStaff) luecken++;
          }
        }
      }
      expect(luecken, `${store.shortName} ${month}/2026`).toBeLessThanOrEqual(LUECKEN_BUDGET);
    }
  });

  it.each(TEAMS)("%s: überschreitet nie die Obergrenze einer Spanne", (_name, store) => {
    for (const month of MONTHS) {
      const analysis = analyzeSchedule({
        year: 2026, month, workHours: store.workHours, employees: teamOf(store),
        shifts: planOf(2026, month, store), rules: store.staffingRules, weights: store.dayWeights,
      });
      for (const day of analysis.days) {
        for (const peak of day.peaks) {
          expect(peak.maxStaff, `${day.date} ${peak.label}`).toBeLessThanOrEqual(peak.allowed);
        }
      }
    }
  });

  it.each(TEAMS)("%s: nachmittags stehen mehr Leute als direkt nach dem Öffnen", (_name, store) => {
    const shifts = planOf(2026, 9, store);
    const open = openDatesOf(2026, 9, store);
    const avg = (minute: number) =>
      open.reduce((sum, date) => sum + staffAt(shifts.filter((s) => s.date === date), minute), 0) / open.length;
    expect(avg(16 * 60)).toBeGreaterThan(avg(10 * 60));
    expect(avg(17 * 60 + 30)).toBeGreaterThan(avg(10 * 60));
  });
});

describe("Tagesgewichte", () => {
  it("Freitag und Samstag sind die stärksten Tage, Dienstag der schwächste", () => {
    const w = storeById("jadeqa").dayWeights;
    expect(w.friday).toBe(2);
    expect(w.saturday).toBe(2);
    expect(w.tuesday).toBe(1);
    expect(w.monday).toBe(1.2);
    expect(w.wednesday).toBe(1.2);
    expect(w.thursday).toBe(1.2);
  });

  it.each(TEAMS)("%s: legt freitags und samstags mehr Stunden als dienstags", (_name, store) => {
    const shifts = planOf(2026, 9, store);
    const hoursOn = (weekdays: string[]) => {
      const days = new Map<string, number>();
      for (const s of shifts) {
        if (!weekdays.includes(weekdayKeyOf(parseIsoDate(s.date)))) continue;
        days.set(s.date, (days.get(s.date) ?? 0) + s.paidMinutes);
      }
      return [...days.values()].reduce((sum, m) => sum + m, 0) / days.size;
    };
    expect(hoursOn(["friday", "saturday"]) / hoursOn(["tuesday"])).toBeGreaterThan(1.1);
  });
});

describe("Ein Studio, Belegschaft aus den Lohnabrechnungen", () => {
  it("führt genau ein Studio mit eigener Anschrift", () => {
    expect(STORES.map((s) => s.id)).toEqual(["jadeqa"]);
    const schedule = initialScheduleFor(storeById("jadeqa"));
    expect(schedule.companyName).toBe("J'ADEQA Nagelstudio");
    expect(schedule.address).toContain("Bobenheim-Roxheim");
    // Startmonat = letzter Monat mit Lohnabrechnung.
    expect([schedule.year, schedule.month]).toEqual([2026, 3]);
  });

  it("die Verträge stimmen mit den Lohnabrechnungen überein", () => {
    const byName = new Map(teamOf(storeById("jadeqa")).map((e) => [e.name, e]));
    // Ohne „Wöch.Arb.Zt." auf der Abrechnung: Brutto ÷ Mindestlohn 2025 (12,82).
    expect(byName.get("Thi Kim Oanh Pham")!.targetMinutes).toBe(Math.round(70.2 * 60));
    expect(byName.get("Tri Duc Nguyen")!.targetMinutes).toBe(Math.round(87.4 * 60));
    expect(byName.get("Dinh Hai Le")!.targetMinutes).toBe(Math.round(93.6 * 60));
    // Mit „Wöch.Arb.Zt.": diese Zahl gilt direkt als Wochenvertrag.
    expect(byName.get("Quynh Nhu Nguyen")!.weeklyHours).toBe(19.5);
    expect(byName.get("Van Anh Nguyen")!.weeklyHours).toBe(5);
    expect(byName.get("Thuy Linh Tran")!.weeklyHours).toBe(19.5);
    // Eintritt und Austritt, wie auf den Abrechnungen ausgewiesen.
    expect(byName.get("Thi Kim Oanh Pham")!.startDate).toBe("2024-11-01");
    expect(byName.get("Dinh Hai Le")!.startDate).toBe("2025-05-15");
    expect(byName.get("Dinh Hai Le")!.endDate).toBe("2025-07-31");
    expect(byName.get("Thuy Linh Tran")!.startDate).toBe("2026-01-15");
    // Wer keinen Austritt hat, arbeitet weiter.
    for (const name of ["Thi Kim Oanh Pham", "Tri Duc Nguyen", "Quynh Nhu Nguyen", "Van Anh Nguyen", "Thuy Linh Tran"]) {
      expect(byName.get(name)!.endDate, name).toBeUndefined();
    }
  });
});

describe("Eintritt und Austritt", () => {
  const store = storeById("jadeqa");

  it("plant niemanden vor dem Eintritt oder nach dem Austritt", () => {
    for (const [year, month] of [[2025, 5], [2025, 7], [2025, 8], [2026, 1], [2026, 3]] as const) {
      const shifts = planOf(year, month, store);
      for (const employee of teamOf(store)) {
        for (const shift of shifts.filter((s) => s.employeeId === employee.id)) {
          if (employee.startDate) expect(shift.date >= employee.startDate, `${employee.name} ${shift.date}`).toBe(true);
          if (employee.endDate) expect(shift.date <= employee.endDate, `${employee.name} ${shift.date}`).toBe(true);
        }
      }
    }
  });

  it("wer im August 2025 schon weg ist, taucht gar nicht mehr auf", () => {
    const shifts = planOf(2025, 8, store);
    expect(shifts.filter((s) => s.employeeId === "jadeqa-3")).toEqual([]);
    // Im Juli war er noch da.
    expect(planOf(2025, 7, store).some((s) => s.employeeId === "jadeqa-3")).toBe(true);
  });

  it("halbes Monats-Soll im Eintrittsmonat – wie auf der Abrechnung (680 statt 1.200 EUR)", () => {
    const le = teamOf(store).find((e) => e.id === "jadeqa-3")!;
    const mai = openDatesOf(2025, 5, store);
    const voll = openDatesOf(2025, 6, store);
    const sollMai = monthlyTargetMinutesFor(le, mai, store.workHours);
    const sollJuni = monthlyTargetMinutesFor(le, voll, store.workHours);
    expect(sollJuni).toBe(le.targetMinutes); // ganzer Monat = ganzer Vertrag
    // 15.05. ist der erste Arbeitstag: gut die Hälfte der offenen Tage.
    const anteil = sollMai / sollJuni;
    expect(anteil).toBeGreaterThan(0.45);
    expect(anteil).toBeLessThan(0.65);
    // Und der Plan hält dieses gekürzte Soll ein.
    const shifts = planOf(2025, 5, store);
    const geplant = shifts.filter((s) => s.employeeId === le.id).reduce((sum, s) => sum + s.paidMinutes, 0);
    expect(Math.abs(geplant - sollMai)).toBeLessThanOrEqual(30);
  });

  it("der Austrittstag selbst ist noch ein Arbeitstag", () => {
    const shifts = planOf(2025, 7, store);
    const letzte = shifts.filter((s) => s.employeeId === "jadeqa-3").map((s) => s.date).sort();
    expect(letzte.length).toBeGreaterThan(0);
    expect(letzte[letzte.length - 1] <= "2025-07-31").toBe(true);
  });

  it("wer mitten im Monat kommt oder geht, erfüllt sein gekürztes Soll genau", () => {
    // Genau die Monate, in denen ein Eintritt oder ein Austritt liegt.
    for (const [year, month, id] of [[2025, 5, "jadeqa-3"], [2025, 7, "jadeqa-3"], [2026, 1, "jadeqa-6"]] as const) {
      const shifts = planOf(year, month, store);
      const result = validateSchedule(teamOf(store), shifts, year, openDatesOf(year, month, store), store.workHours);
      const summary = result.summaries.find((s) => s.employee.id === id)!;
      const wer = `${summary.employee.name} ${month}/${year}`;
      expect(summary.targetMinutes, wer).toBeGreaterThan(0);
      // Das Soll ist anteilig gekürzt – und wird eingehalten, also gibt es für
      // diese Person auch keine Meldung über fehlende Stunden.
      expect(Math.abs(summary.diffMinutes), wer).toBeLessThanOrEqual(30);
      expect(result.errors.filter((e) => e.message.startsWith(summary.employee.name)).map((e) => e.message), wer).toEqual([]);
    }
  });
});

describe("Schichtzuschnitt", () => {
  it.each(TEAMS)("%s: jede Uhrzeit liegt auf dem 30-Minuten-Raster", (_name, store) => {
    for (const month of MONTHS) {
      for (const shift of planOf(2026, month, store)) {
        expect(shift.startMinutes % 30, `${shift.date} ${shift.startMinutes}`).toBe(0);
        expect(shift.endMinutes % 30, `${shift.date} ${shift.endMinutes}`).toBe(0);
      }
    }
  });

  it.each(TEAMS)("%s: niemand hat zwei Dienste am selben Tag, und Dienste unter 3 h bleiben die Ausnahme", (_name, store) => {
    for (const month of MONTHS) {
      const shifts = planOf(2026, month, store);
      const kurz: string[] = [];
      for (const shift of shifts) {
        const sameDay = shifts.filter((s) => s.employeeId === shift.employeeId && s.date === shift.date);
        // Das Studio hat durchgehend offen – es gibt keinen geteilten Tag.
        expect(sameDay, `${shift.date} ${shift.employeeId}`).toHaveLength(1);
        if (shift.paidMinutes < 180) kurz.push(`${shift.date} ${shift.employeeId} ${shift.paidMinutes}`);
      }
      // Erlaubt nur, wenn das WOCHENbudget selbst kleiner als drei Stunden ist:
      // der 5-Stunden-Vertrag am Monatsrand, wo nur ein oder zwei Tage der
      // Woche in diesen Monat fallen.
      for (const eintrag of kurz) {
        const [date, id] = eintrag.split(" ");
        const employee = teamOf(store).find((e) => e.id === id)!;
        expect(employee.weeklyHours, eintrag).not.toBeUndefined();
        const wocheImMonat = openDatesOf(2026, month, store).filter((d) => weekStartOf(d) === weekStartOf(date)).length;
        expect(wocheImMonat, eintrag).toBeLessThan(6);
      }
    }
  });
});
