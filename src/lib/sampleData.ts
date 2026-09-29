// ============================================================================
// Startbelegschaft des Studios, abgelesen aus den Lohnabrechnungen (DATEV).
//
// Umrechnung Lohn -> Stunden, wenn auf der Abrechnung KEINE Wochenstundenzahl
// steht: Brutto ÷ Mindestlohn. 2025 = 12,82 EUR, 2026 = 13,90 EUR.
// Steht „Wöch.Arb.Zt." auf der Abrechnung, gilt DIESE Zahl (sie ist die
// vertraglich vereinbarte, nicht gerechnet).
//
//   Thi Kim Oanh Pham   Eintritt 01.11.2024              900 EUR  -> 70,2 h/Monat
//   Tri Duc Nguyen      Eintritt 01.05.2025            1.120 EUR  -> 87,4 h/Monat
//   Dinh Hai Le         15.05.2025 bis 31.07.2025      1.200 EUR  -> 93,6 h/Monat
//                       (Mai nur 680 EUR = halber Monat -> das rechnet die App
//                        aus dem Eintrittsdatum selbst aus)
//   Quynh Nhu Nguyen    Eintritt 01.09.2025            Wöch.Arb.Zt. 19,50 h
//   Van Anh Nguyen      Eintritt 01.11.2025            Wöch.Arb.Zt. 5,00 h
//   Thuy Linh Tran      Eintritt 15.01.2026            Wöch.Arb.Zt. 19,50 h
//
// ACHTUNG, zwei Annahmen, die der Betrieb bestätigen muss:
//  1. Die INHABERIN steht als „Chu tiem" mit 169 h im Plan – sie ist laut
//     Angabe immer im Laden, hat aber keine Lohnabrechnung. Name und Stunden
//     im Tab „Nhân viên" anpassen.
//  2. Wer seine Stunden im Lauf der Zeit geändert hat, steht mit dem ZULETZT
//     belegten Wert hier (Quynh Nhu Nguyen: 117 h im September 2025, dann
//     27 h/Woche, seit Februar 2026 19,5 h/Woche). Für einen älteren Monat die
//     Stundenzahl vor dem Erzeugen des Plans umstellen.
// ============================================================================

import type { Employee, Schedule } from "../types";
import { JADEQA_WORK_HOURS } from "./workHours";

export function makeEmployee(
  id: string,
  name: string,
  employmentType: Employee["employmentType"],
  targetHours: number,
): Employee {
  return { id, name, employmentType, targetMinutes: Math.round(targetHours * 60) };
}

/** Mitarbeiter mit WOCHENvertrag – auf der Abrechnung als „Wöch.Arb.Zt.". */
export function makeWeekly(
  id: string,
  name: string,
  employmentType: Employee["employmentType"],
  weeklyHours: number,
): Employee {
  return { id, name, employmentType, targetMinutes: 0, weeklyHours };
}

/**
 * J'ADEQA Nagelstudio, Südring 2, 67240 Bobenheim-Roxheim.
 *
 * Jede Person hat Eintritt (und, wo bekannt, Austritt). Dadurch plant die App
 * einen beliebigen Monat richtig: wer damals noch nicht da war oder schon
 * gegangen ist, taucht nicht auf, und das Monats-Soll wird anteilig gerechnet.
 *
 * Anstellungsart aus den Stunden abgeleitet (nur Beschriftung des
 * Stundenzettels): ab 130 h Vollzeit, 60–130 h Teilzeit, darunter Minijob.
 * Alle höchstens fünf Tage je Woche, damit jede Person einen freien Tag neben
 * dem Sonntag hat.
 */
export function jadeqaEmployees(): Employee[] {
  return [
    {
      // ANNAHME: Inhaberin, immer im Laden. Ohne sie reichen die Verträge nicht,
      // um 09:00–19:00 an 26 Tagen zu besetzen.
      //
      // Als EINZIGE ohne Fünf-Tage-Grenze: 169 h passen in einem kurzen Monat
      // (Februar, 24 offene Tage) sonst nicht in fünf Tage je Woche – 20 Tage
      // mal höchstens 8 h sind nur 160 h. Sie ist ohnehin jeden Tag im Laden.
      ...makeEmployee("jadeqa-0", "Chu tiem", "VOLLZEIT", 169),
    },
    {
      ...makeEmployee("jadeqa-1", "Thi Kim Oanh Pham", "TEILZEIT", 70.2),
      startDate: "2024-11-01",
      maxDaysPerWeek: 5,
    },
    {
      ...makeEmployee("jadeqa-2", "Tri Duc Nguyen", "TEILZEIT", 87.4),
      startDate: "2025-05-01",
      maxDaysPerWeek: 5,
    },
    {
      ...makeEmployee("jadeqa-3", "Dinh Hai Le", "TEILZEIT", 93.6),
      startDate: "2025-05-15",
      endDate: "2025-07-31",
      maxDaysPerWeek: 5,
    },
    {
      ...makeWeekly("jadeqa-4", "Quynh Nhu Nguyen", "TEILZEIT", 19.5),
      startDate: "2025-09-01",
      maxDaysPerWeek: 5,
    },
    {
      ...makeWeekly("jadeqa-5", "Van Anh Nguyen", "MINIJOB", 5),
      startDate: "2025-11-01",
      maxDaysPerWeek: 5,
    },
    {
      ...makeWeekly("jadeqa-6", "Thuy Linh Tran", "TEILZEIT", 19.5),
      startDate: "2026-01-15",
      maxDaysPerWeek: 5,
    },
  ];
}

/** Belegschaft für Tests und Altaufrufe. */
export const SAMPLE_EMPLOYEES: Employee[] = jadeqaEmployees();

export function createSampleSchedule(): Schedule {
  return {
    companyName: "J'ADEQA Nagelstudio",
    address: "Südring 2, 67240 Bobenheim-Roxheim",
    year: 2026,
    month: 3,
    workHours: structuredClone(JADEQA_WORK_HOURS),
    dateOverrides: [],
    employees: jadeqaEmployees(),
    shifts: [],
  };
}
