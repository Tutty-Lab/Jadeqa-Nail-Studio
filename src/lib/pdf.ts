// ============================================================================
// PDF-Export – ECHTES Vektor-PDF (Text + Linien), nicht mehr als Screenshot.
//
// Frühere Versionen haben die HTML-Seite mit html2canvas "abfotografiert" und
// das Bild in die PDF geklebt. Das war fragil: ob eine Seite sauber wird, hing
// an Font-Laden, Stylesheet-Laden, Klon-Timing, Browser und Speicher – die
// erste Seite kam z. B. gelegentlich ganz ohne Styles heraus. Deshalb musste
// man auf jedem Gerät nachkontrollieren.
//
// Jetzt zeichnen wir die PDF direkt mit jsPDF + autoTable: reiner Text und
// echte Tabellenlinien. Das Ergebnis ist DETERMINISTISCH – auf jedem Handy,
// Browser und In-App-Webview identisch, die Linien können nie "verschwinden",
// die Datei ist winzig, und es gibt kein Timing/keine Schrift zum Abwarten.
//
// Schrift: die eingebaute Helvetica (Standard-14, kein Nachladen). Sie deckt
// Deutsch inkl. Umlaute/ß ab. Vietnamesische Namen werden auf ASCII übertragen
// (siehe T()) – bewusst ohne Diakritika, so gewünscht.
// ============================================================================

import { jsPDF } from "jspdf";
import type { Employee, Schedule, Shift } from "../types";
import {
  datesOfMonth,
  parseIsoDate,
  WEEKDAY_LABELS_DE,
  WEEKDAY_SHORT_DE,
  weekdayKeyOf,
} from "./demand";
import { minutesToDecimalHours, minutesToTime } from "./time";
import { MONTH_NAMES_DE } from "./dateFormat";
import { employmentLabelDe } from "./employment";
import { publicHolidayNames, publicHolidays } from "./holidays";
import { isDayClosed } from "./workHours";
import { format } from "date-fns";

/** Dateiname säubern: Umlaute/Akzente weg, nur unbedenkliche Zeichen behalten. */
export function safeFileName(text: string): string {
  const plain = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // Akzente entfernen: "Tuấn" -> "Tuan"
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
  return plain.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "Stundenzettel";
}

// ── Text für die eingebaute Schrift aufbereiten ────────────────────────────
// Helvetica kann Latin-1 (inkl. ä ö ü ß). Alles darüber (vietnamesische
// Diakritika, Typo-Anführungszeichen, Gedankenstrich) wird auf ein passendes
// ASCII/Latin-1-Zeichen abgebildet, damit nie ein Kästchen/"?" erscheint.
const PUNCT: Record<string, string> = {
  "–": "-", // – en dash
  "—": "-", // — em dash
  "‘": "'",
  "’": "'",
  "‚": ",",
  "“": '"',
  "”": '"',
  "„": '"',
  "…": "...",
  " ": " ", // geschütztes Leerzeichen
};

function T(input: string | undefined | null): string {
  if (!input) return "";
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (PUNCT[ch]) {
      out += PUNCT[ch];
    } else if (code <= 0xff) {
      // Latin-1: Deutsch inkl. Umlaute/ß bleibt erhalten.
      out += ch;
    } else if (ch === "đ" || ch === "Đ") {
      out += ch === "đ" ? "d" : "D";
    } else {
      // z. B. vietnamesische Vokale: zerlegen und Diakritika entfernen.
      const stripped = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      out += /^[\x20-\xff]*$/.test(stripped) ? stripped : "";
    }
  }
  return out;
}

// ── gemeinsame Farb-/Maß-Konstanten ────────────────────────────────────────
const INK: [number, number, number] = [15, 23, 42]; // slate-900
const MUTED: [number, number, number] = [100, 116, 139]; // slate-500
const LINE: [number, number, number] = [71, 85, 105]; // slate-600
const GRID: [number, number, number] = [148, 163, 184]; // slate-400
const HEAD_FILL: [number, number, number] = [241, 245, 249]; // slate-100
const SHADE_FILL: [number, number, number] = [248, 250, 252]; // slate-50

const MARGIN = 14; // mm

export function monthLabelDe(year: number, month: number): string {
  return `${MONTH_NAMES_DE[month - 1]} ${year}`;
}

/** Kopfzeile (Titel links, Zeitraum rechts) + Trennlinie. Gibt neues Y zurück. */
function drawHeader(
  doc: jsPDF,
  title: string,
  schedule: Schedule,
  periodLabel: string,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  let y = MARGIN + 1;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  doc.text(T(title), MARGIN, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...LINE);
  doc.text(T(periodLabel), pageW - MARGIN, y, { align: "right" });

  y += 4.5;
  doc.setFontSize(9);
  doc.setTextColor(...LINE);
  doc.text(T(schedule.companyName || "—"), MARGIN, y);
  if (schedule.address) {
    y += 3.6;
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(T(schedule.address), MARGIN, y);
  }

  y += 2.4;
  doc.setDrawColor(30, 41, 59); // slate-800
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, pageW - MARGIN, y);
  return y + 4;
}

/** Unterschriftszeilen am Seitenende. */
function drawSignatures(doc: jsPDF, labels: string[], y: number): void {
  const pageW = doc.internal.pageSize.getWidth();
  const gap = (pageW - 2 * MARGIN) / labels.length;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...LINE);
  labels.forEach((label, i) => {
    const x0 = MARGIN + i * gap;
    const x1 = x0 + gap - 10;
    doc.line(x0, y, x1, y);
    doc.text(T(label), x0, y + 4);
  });
}

// ── Stundenzettel ──────────────────────────────────────────────────────────

type DayRow = {
  shaded: boolean;
  shiftCount: number;
  cells: string[]; // [datum/wd, beginn, ende, pause, arbeitszeit, bemerkung]
};

function stundenzettelRowsFor(
  schedule: Schedule,
  employee: Employee,
  dates: string[],
): { rows: DayRow[]; totalMinutes: number } {
  const byDate = new Map<string, Shift[]>();
  for (const s of schedule.shifts) {
    if (s.employeeId !== employee.id) continue;
    const list = byDate.get(s.date);
    if (list) list.push(s);
    else byDate.set(s.date, [s]);
  }
  for (const list of byDate.values()) list.sort((a, b) => a.startMinutes - b.startMinutes);

  const holidayNames = publicHolidayNames(schedule.year);
  const closedByDate = new Map(
    schedule.dateOverrides.filter((o) => o.closed).map((o) => [o.date, o] as const),
  );

  let totalMinutes = 0;
  const rows: DayRow[] = dates.map((d) => {
    const dienste = byDate.get(d) ?? [];
    totalMinutes += dienste.reduce((a, s) => a + s.paidMinutes, 0);
    const wdKey = weekdayKeyOf(parseIsoDate(d));
    const wd = WEEKDAY_LABELS_DE[wdKey];
    const holiday = holidayNames.get(d);
    const closed = closedByDate.get(d);
    const isWeekend = wd === "Samstag" || wd === "Sonntag";
    const shaded = Boolean(isWeekend || holiday || closed);
    // Datum + Wochentag auf EINER Zeile (wie im DATEV-Formular) – so bleibt jede
    // Tageszeile einzeilig und der ganze Monat passt sicher auf eine Seite.
    const datum = `${format(parseIsoDate(d), "dd.MM.yyyy")}  ${WEEKDAY_SHORT_DE[wdKey]}`;

    if (dienste.length === 0) {
      const bemerkung = closed
        ? closed.note || "Betriebsruhe"
        : holiday
          ? `Frei (Feiertag: ${holiday})`
          : "Frei";
      return { shaded, shiftCount: 0, cells: [datum, "", "", "", "0,00", bemerkung] };
    }

    const beginn = dienste.map((x) => minutesToTime(x.startMinutes)).join("\n");
    const ende = dienste.map((x) => minutesToTime(x.endMinutes)).join("\n");
    const pause = dienste.map((x) => `${x.pauseMinutes} Min`).join("\n");
    const arbeitszeit = dienste.map((x) => minutesToDecimalHours(x.paidMinutes)).join("\n");
    const bemerkung = holiday ? `Feiertag: ${holiday}` : "";
    return {
      shaded,
      shiftCount: dienste.length,
      cells: [datum, beginn, ende, pause, arbeitszeit, bemerkung],
    };
  });

  return { rows, totalMinutes };
}

// ── Layout nach dem Muster der Lohnabrechnung (Brutto/Netto-Bezüge) ────────
// Nachbau des Aufbaus der Abrechnungen, die der Betrieb vom Steuerbüro bekommt:
// kleine Helvetica-Beschriftungen mit Unterstrich + kurzen Trennstrichen,
// Werte in Courier, Firmenzeile "Name*Straße*PLZ Ort", Anschriftenblock,
// breite Positionsspalte links und Summenspalte rechts. Inhalt ist die
// ARBEITSZEIT – ohne Fremd-Logo, ohne Formular-/Mandantennummern.
//
// Gezeichnet wird über einen kleinen "Painter": die PDF nutzt jsPDF, die
// Bildschirm-Vorschau (StundenzettelPage) nutzt SVG – mit DENSELBEN
// Koordinaten, damit Vorschau und PDF nie auseinanderlaufen.
const P_L = 14; // linke Kante
const P_R = 198; // rechte Kante
const P_SPLIT = 164; // Beginn der rechten Summenspalte
const P_TOPR = 139; // Beginn des rechten Kopfblocks
export const SZ_PAGE_W = 210;
export const SZ_PAGE_H = 297;

/** ISO-Datum -> ddMMyy (wie "Eintritt 011124" in der Abrechnung). */
const dShort = (iso?: string): string => (iso ? format(parseIsoDate(iso), "ddMMyy") : "");
/** Stunden mit deutschem Dezimalkomma (leer bei null). */
const commaHours = (h?: number): string =>
  h == null ? "" : h.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type SzAlign = "left" | "right" | "center";

/** Zeichenfläche in mm (A4 hochkant); `fs` in pt, `y` = Grundlinie. */
export interface SzPainter {
  text(
    text: string,
    x: number,
    y: number,
    o: { font: "helvetica" | "courier"; bold: boolean; fs: number; align: SzAlign },
  ): void;
  /** `gray` 0 = schwarz … 255 = weiß. */
  line(x0: number, y0: number, x1: number, y1: number, width: number, gray?: number): void;
}

function jsPdfPainter(doc: jsPDF): SzPainter {
  return {
    text(text, x, y, o) {
      doc.setFont(o.font, o.bold ? "bold" : "normal");
      doc.setFontSize(o.fs);
      doc.setTextColor(0, 0, 0);
      doc.text(text, x, y, { align: o.align });
    },
    line(x0, y0, x1, y1, width, gray = 0) {
      doc.setDrawColor(gray, gray, gray);
      doc.setLineWidth(width);
      doc.line(x0, y0, x1, y1);
    },
  };
}

type TextOpts = { bold?: boolean; align?: SzAlign; fs?: number };

/** Kleine Feldbeschriftung (Helvetica). */
function label(p: SzPainter, text: string, x: number, y: number, opts: TextOpts = {}): void {
  p.text(T(text), x, y, { font: "helvetica", bold: !!opts.bold, fs: opts.fs ?? 5.6, align: opts.align ?? "left" });
}

/** Feldwert (Courier, standardmäßig fett – wie der Druck der Abrechnung). */
function value(p: SzPainter, text: string, x: number, y: number, opts: TextOpts = {}): void {
  p.text(T(text), x, y, { font: "courier", bold: opts.bold !== false, fs: opts.fs ?? 9.5, align: opts.align ?? "left" });
}

function hline(p: SzPainter, x0: number, x1: number, y: number, w = 0.2): void {
  p.line(x0, y, x1, y, w);
}

function vline(p: SzPainter, x: number, y0: number, y1: number, w = 0.2): void {
  p.line(x, y0, x, y1, w);
}

type Field = { x: number; w: number; label: string; value?: string; align?: SzAlign };

/**
 * Eine Beschriftungszeile wie in der Abrechnung: Labels mit Linie darunter,
 * darunter der Wert und eine zweite Linie mit kurzen Trennstrichen.
 */
function labelRow(p: SzPainter, y: number, fields: Field[], lineTo?: number): void {
  const last = fields[fields.length - 1];
  const x0 = fields[0].x;
  const x1 = lineTo ?? last.x + last.w;
  fields.forEach((f, i) => {
    if (i > 0) vline(p, f.x, y - 2.6, y + 1, 0.15);
    label(p, f.label, f.x + 0.6, y);
    if (f.value) {
      const align = f.align ?? "left";
      const vx = align === "right" ? f.x + f.w - 0.8 : align === "center" ? f.x + f.w / 2 : f.x + 0.3;
      value(p, f.value, vx, y + 4.6, { align });
    }
  });
  hline(p, x0, x1, y + 1, 0.2);
  hline(p, x0, x1, y + 6.2, 0.2);
  fields.forEach((f, i) => {
    if (i > 0) vline(p, f.x, y + 5.3, y + 6.2, 0.15);
  });
}

/**
 * Zeichnet EINEN Stundenzettel (eine A4-Seite) – Aufbau wie die
 * Lohnabrechnung: Kopf, Feldzeilen, Firmenzeile, Anschrift, Positionsteil mit
 * Summenspalte, Zusammenfassung, Unterschriften.
 */
export function paintStundenzettel(
  p: SzPainter,
  schedule: Schedule,
  employee: Employee,
  dates: string[],
  periodLabel: string,
): void {
  const pageH = SZ_PAGE_H;
  const { rows, totalMinutes } = stundenzettelRowsFor(schedule, employee, dates);
  const workDays = rows.filter((r) => r.shiftCount > 0).length;

  // ── Kopf ────────────────────────────────────────────────────────────────
  value(p, format(new Date(), "dd.MM.yyyy"), P_R - 12, 16, { fs: 10, align: "right" });
  label(p, "Blatt:", P_R - 9, 16, { fs: 6 });
  value(p, "1", P_R, 16, { fs: 10, align: "right" });

  label(p, "Arbeitszeitnachweis", P_L, 17, { bold: true, fs: 11.5 });
  value(p, `für ${periodLabel}`, P_L + 62, 17, { fs: 10.5 });

  // ── Feldzeilen links ────────────────────────────────────────────────────
  labelRow(
    p,
    20.5,
    [
      { x: P_L, w: 20, label: "Personal-Nr." },
      { x: P_L + 20, w: 20, label: "Geburtsdatum" },
      { x: P_L + 40, w: 32, label: "Beschäftigungsart", value: employmentLabelDe(employee.employmentType) },
      { x: P_L + 72, w: 20, label: "Wöch.Arb.Zt.", value: commaHours(employee.weeklyHours), align: "right" },
      { x: P_L + 92, w: 15, label: "Eintritt", value: dShort(employee.startDate) },
      { x: P_L + 107, w: 14, label: "Austritt", value: dShort(employee.endDate) },
    ],
    P_TOPR - 4,
  );
  labelRow(
    p,
    30,
    [
      { x: P_L, w: 60, label: "SV-Nummer" },
      { x: P_L + 60, w: 61, label: "Krankenkasse" },
    ],
    P_TOPR - 4,
  );

  // ── Feldblock rechts (Tage / Stunden) ───────────────────────────────────
  labelRow(p, 20.5, [
    { x: P_TOPR, w: 15, label: "Arb. Tage", value: String(workDays), align: "right" },
    { x: P_TOPR + 15, w: 15, label: "Urlaub Tg." },
    { x: P_TOPR + 30, w: 15, label: "Krankh. Tg." },
    { x: P_TOPR + 45, w: 14, label: "Fehlz. Tg." },
  ]);
  labelRow(p, 30, [
    { x: P_TOPR, w: 15, label: "Ist Std.", value: minutesToDecimalHours(totalMinutes), align: "right" },
    { x: P_TOPR + 15, w: 15, label: "Urlaub Std." },
    { x: P_TOPR + 30, w: 15, label: "Krankh. Std." },
    { x: P_TOPR + 45, w: 14, label: "Überstd." },
  ]);

  // ── Firmenzeile + Pers.-Nr. ─────────────────────────────────────────────
  const firma = [schedule.companyName, ...(schedule.address ? schedule.address.split(/,\s*/) : [])].join("*");
  value(p, firma, P_L + 4, 45, { fs: 5 });
  value(p, "*Pers.-Nr. ______*", P_L + 30, 53, { fs: 6.5 });

  label(p, "Hinweise zum Nachweis", P_TOPR - 4, 50, { bold: true });
  hline(p, P_TOPR - 4, P_R, 51.5, 0.35);
  value(p, "Pause unbezahlt, Zeiten in Std.", P_TOPR - 4, 56, { fs: 7, bold: false });

  // ── Anschriftenblock (Anschrift von Hand) ───────────────────────────────
  value(p, employee.name, P_L + 6, 68, { fs: 11 });
  p.line(P_L + 6, 73.5, P_L + 70, 73.5, 0.15, 150);
  p.line(P_L + 6, 78.5, P_L + 70, 78.5, 0.15, 150);

  // ── Positionsteil „Arbeitszeiten" mit Summenspalte ──────────────────────
  const top = 92;
  label(p, "Arbeitszeiten", P_L, top - 2, { bold: true });
  const cols = [
    { x: P_L, label: "Datum" },
    { x: P_L + 32, label: "Beginn" },
    { x: P_L + 54, label: "Ende" },
    { x: P_L + 76, label: "Pause" },
    { x: P_L + 98, label: "Bemerkung" },
  ];
  hline(p, P_L, P_SPLIT - 3, top - 1, 0.35);
  cols.forEach((c, i) => {
    if (i > 0) vline(p, c.x, top - 1, top + 2.3, 0.15);
    label(p, c.label, c.x + 0.6, top + 1.4);
  });
  hline(p, P_SPLIT, P_R, top - 1, 0.35);
  label(p, "Stunden", P_R - 0.5, top + 1.4, { bold: true, align: "right" });

  const bodyTop = top + 3;
  const bodyBottom = pageH - 68;
  const lineCount = rows.reduce((a, r) => a + Math.max(1, r.shiftCount), 0);
  const LH = Math.min(4.2, (bodyBottom - bodyTop - 2) / lineCount);
  const FS = Math.min(8.5, LH * 2.2);
  let y = bodyTop + LH;
  for (const r of rows) {
    const [datum, beginn, ende, pause, stunden, bemerkung] = r.cells.map((c) => T(c).split("\n"));
    const n = Math.max(1, r.shiftCount);
    for (let k = 0; k < n; k++) {
      if (k === 0) value(p, datum[0], P_L, y, { fs: FS, bold: r.shiftCount > 0 });
      if (r.shiftCount > 0) {
        value(p, beginn[k] ?? "", cols[1].x + 1, y, { fs: FS, bold: false });
        value(p, ende[k] ?? "", cols[2].x + 1, y, { fs: FS, bold: false });
        value(p, pause[k] ?? "", cols[3].x + 1, y, { fs: FS, bold: false });
        value(p, stunden[k] ?? "", P_R - 0.5, y, { fs: FS, align: "right" });
      }
      if (k === 0 && bemerkung[0]) {
        value(p, bemerkung[0].slice(0, 32), cols[4].x + 1, y, { fs: FS * 0.85, bold: false });
      }
      y += LH;
    }
  }
  vline(p, P_SPLIT - 1.5, top - 1, bodyBottom + 10, 0.35);

  // ── Summe rechts (Stelle von „Gesamt-Brutto") ───────────────────────────
  hline(p, P_SPLIT, P_R, bodyBottom, 0.35);
  label(p, "Gesamtstunden", P_R - 0.5, bodyBottom + 2.6, { bold: true, align: "right" });
  value(p, minutesToDecimalHours(totalMinutes), P_R - 0.5, bodyBottom + 7.5, { fs: 11, align: "right" });
  hline(p, P_L, P_R, bodyBottom + 10, 0.35);

  // ── Zusammenfassung links (Stelle der „Verdienstbescheinigung") ─────────
  let sy = bodyBottom + 15;
  label(p, "Zusammenfassung", P_L, sy, { bold: true });
  hline(p, P_L, P_L + 90, sy + 1, 0.35);
  const summary: Array<[string, string]> = [
    ["Arbeitstage", String(workDays)],
    ["Ist-Stunden", minutesToDecimalHours(totalMinutes)],
    ["Soll-Stunden", ""],
    ["Differenz", ""],
  ];
  for (const [l, v] of summary) {
    sy += 4.6;
    label(p, l, P_L, sy, { fs: 6 });
    if (v) value(p, v, P_L + 55, sy, { fs: 9.5, align: "right" });
  }
  vline(p, P_L + 58, bodyBottom + 16, sy + 1.5, 0.15);
  hline(p, P_L, P_L + 90, sy + 1.5, 0.35);

  // ── Unterschriften (Stelle von „Betrag erhalten") ───────────────────────
  const sigY = pageH - 17;
  value(p, "Bestätigt:", P_L + 8, sigY - 5, { fs: 10.5 });
  hline(p, P_L, P_L + 85, sigY, 0.35);
  hline(p, P_L + 95, P_R, sigY, 0.35);
  label(p, "Unterschrift Mitarbeiter / Datum", P_L, sigY + 2.8, { fs: 6 });
  label(p, "Unterschrift Arbeitgeber / Datum", P_L + 95, sigY + 2.8, { fs: 6 });

  label(p, "- Aufzeichnung der Arbeitszeit nach § 17 Abs. 1 MiLoG -", (P_L + P_R) / 2, pageH - 7, {
    fs: 5.2,
    align: "center",
  });
}

/** Zeichnet EINEN Stundenzettel auf die aktuelle PDF-Seite. */
function drawStundenzettel(
  doc: jsPDF,
  schedule: Schedule,
  employee: Employee,
  dates: string[],
  periodLabel: string,
): void {
  paintStundenzettel(jsPdfPainter(doc), schedule, employee, dates, periodLabel);
}

/**
 * Baut die Stundenzettel-PDF: eine A4-Seite je Mitarbeiter.
 * `dates` fehlt => ganzer Monat; `periodLabel` fehlt => Monat/Jahr.
 *
 * async + kurzer Yield je Seite: der Fortschritt (X/N) kann gerendert werden
 * und der Haupt-Thread bleibt auch auf schwachen Handys frei. Die Ausgabe
 * selbst ist trotzdem rein deterministisch – der Yield ändert nichts am Inhalt.
 */
export async function buildStundenzettelPdf(
  schedule: Schedule,
  employees: Employee[],
  opts: { dates?: string[]; periodLabel?: string } = {},
  onProgress?: (current: number, total: number) => void,
): Promise<jsPDF> {
  return buildStundenzettelPdfFor([{ schedule, employees }], opts, onProgress);
}

/** Eine Filiale mit den Mitarbeitern, die in die PDF sollen. */
export type StundenzettelJob = { schedule: Schedule; employees: Employee[] };

/**
 * Stundenzettel-PDF über MEHRERE Filialen: alle Seiten landen in EINER Datei,
 * in der Reihenfolge der Filialen. Der Betrieb druckt beide Läden zusammen aus,
 * deshalb ist ein einziges Dokument richtig – nicht zwei Downloads.
 */
export async function buildStundenzettelPdfFor(
  jobs: StundenzettelJob[],
  opts: { dates?: string[]; periodLabel?: string } = {},
  onProgress?: (current: number, total: number) => void,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const total = jobs.reduce((sum, job) => sum + job.employees.length, 0);
  let done = 0;

  for (const job of jobs) {
    const dates = opts.dates ?? datesOfMonth(job.schedule.year, job.schedule.month);
    const periodLabel = opts.periodLabel ?? monthLabelDe(job.schedule.year, job.schedule.month);
    for (const employee of job.employees) {
      if (done > 0) doc.addPage();
      drawStundenzettel(doc, job.schedule, employee, dates, periodLabel);
      // Zähler NICHT im optionalen Aufruf hochzählen: ohne onProgress würde
      // onProgress?.(++done) gar nicht ausgewertet – dann lägen alle Seiten
      // übereinander auf Seite 1.
      done += 1;
      onProgress?.(done, total);
      if (total > 1) await new Promise((r) => setTimeout(r, 0));
    }
  }

  return doc;
}

// ── Datei ausliefern ─────────────────────────────────────────────────────────

/**
 * PDF-Blob direkt als Datei herunterladen. MIME application/octet-stream +
 * .pdf-Name => auch iOS Safari / In-App-Browser speichern die Datei, statt sie
 * in einen neuen Tab zu öffnen und dort hängen zu bleiben.
 */
export function deliver(blob: Blob, filename: string): void {
  if (typeof document === "undefined") return;
  const octet = new Blob([blob], { type: "application/octet-stream" });
  const url = URL.createObjectURL(octet);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (document.body.contains(a)) document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 60_000);
}

/** jsPDF-Dokument als Datei speichern. */
export function savePdf(doc: jsPDF, filename: string): void {
  deliver(doc.output("blob"), filename);
}

// ── Dienstplan (Lịch làm việc, zum Aushang im Laden) ────────────────────────
//
// Auch hier echtes Vektor-PDF statt Screenshot. Zwei Ausrichtungen, genau wie
// der Ausdruck am Bildschirm:
//   "byEmployee" – Mitarbeiter als Zeilen, Tage als Spalten (eine Woche).
//   "byDate"     – Tage als Zeilen, Mitarbeiter als Spalten (ganzer Monat);
//                  quer, weil ein Monat mit vielen Leuten hochkant nicht passt.

export type SchedulePdfLayout = "byEmployee" | "byDate";

type GridColumn = { w: number; align: "left" | "center" | "right" };
type GridRow = { cells: string[][]; shaded: boolean; strong?: boolean };

/**
 * Zeichnet ein Gitter mit festen Spaltenbreiten und gibt die Unterkante zurück.
 * Eine Zelle ist eine Liste von Textzeilen; die erste Zeile ist die „starke".
 */
function drawGrid(
  doc: jsPDF,
  x0: number,
  y0: number,
  columns: GridColumn[],
  head: string[],
  body: GridRow[],
  fontSize: number,
  rowH: number,
): number {
  const width = columns.reduce((sum, c) => sum + c.w, 0);
  const xs: number[] = [];
  let cursor = x0;
  for (const col of columns) {
    xs.push(cursor);
    cursor += col.w;
  }
  const LH = fontSize * 0.36; // mm je Textzeile

  const put = (
    text: string,
    ci: number,
    y: number,
    style: "normal" | "bold",
    color: [number, number, number],
  ) => {
    if (!text) return;
    const col = columns[ci];
    doc.setFont("helvetica", style);
    doc.setTextColor(color[0], color[1], color[2]);
    const tx =
      col.align === "center"
        ? xs[ci] + col.w / 2
        : col.align === "right"
          ? xs[ci] + col.w - 1.5
          : xs[ci] + 1.5;
    doc.text(text, tx, y, { align: col.align });
  };

  doc.setFontSize(fontSize);
  let y = y0;
  doc.setFillColor(HEAD_FILL[0], HEAD_FILL[1], HEAD_FILL[2]);
  doc.rect(x0, y, width, rowH, "F");
  head.forEach((h, ci) => put(T(h), ci, y + rowH / 2 + LH * 0.35, "bold", INK));
  y += rowH;

  const tops: number[] = [];
  for (const row of body) {
    tops.push(y);
    if (row.shaded) {
      doc.setFillColor(SHADE_FILL[0], SHADE_FILL[1], SHADE_FILL[2]);
      doc.rect(x0, y, width, rowH, "F");
    }
    row.cells.forEach((lines, ci) => {
      const used = lines.filter(Boolean);
      const offset = ((used.length - 1) * LH) / 2;
      used.forEach((line, j) => {
        const yy = y + rowH / 2 - offset + j * LH + LH * 0.35;
        const first = j === 0;
        put(T(line), ci, yy, first && (row.strong || ci === 0) ? "bold" : "normal", first ? INK : MUTED);
      });
    });
    y += rowH;
  }

  doc.setDrawColor(GRID[0], GRID[1], GRID[2]);
  doc.setLineWidth(0.2);
  for (const hy of [y0, ...tops, y]) doc.line(x0, hy, x0 + width, hy);
  for (const vx of [...xs, x0 + width]) doc.line(vx, y0, vx, y);
  return y;
}

/** Eine Schicht als zwei Textzeilen: Zeitspanne und Stunden/Pause. */
function shiftLines(shift: Shift | undefined, closed: boolean): string[] {
  if (!shift) return [closed ? "-" : "frei"];
  const hours = minutesToDecimalHours(shift.paidMinutes, 2).replace(",00", "");
  return [
    `${minutesToTime(shift.startMinutes)}-${minutesToTime(shift.endMinutes)}`,
    `${hours}h${shift.pauseMinutes > 0 ? ` · P${shift.pauseMinutes}` : ""}`,
  ];
}

/**
 * Dienstplan-PDF für einen Zeitraum (eine Seite). Spaltenbreite, Schriftgröße
 * und Zeilenhöhe richten sich nach der Menge, damit alles auf das Blatt passt.
 */
export function buildDienstplanPdf(
  schedule: Schedule,
  opts: { dates: string[]; title: string; layout: SchedulePdfLayout; employeeIds?: string[] },
): jsPDF {
  const doc = newDienstplanDoc(opts.layout);
  drawDienstplan(doc, schedule, opts);
  return doc;
}

/** Eine Filiale mit dem Zeitraum, der auf ihre Dienstplan-Seite soll. */
export type DienstplanJob = {
  schedule: Schedule;
  dates: string[];
  title: string;
  employeeIds?: string[];
};

/** Dienstplan-PDF über MEHRERE Filialen: je Filiale eine Seite, eine Datei. */
export function buildDienstplanPdfFor(jobs: DienstplanJob[], layout: SchedulePdfLayout): jsPDF {
  const doc = newDienstplanDoc(layout);
  jobs.forEach((job, index) => {
    if (index > 0) doc.addPage();
    drawDienstplan(doc, job.schedule, { ...job, layout });
  });
  return doc;
}

/** Leeres Dokument im passenden Format: der Monat liegt quer, die Woche hoch. */
function newDienstplanDoc(layout: SchedulePdfLayout): jsPDF {
  return new jsPDF({
    unit: "mm",
    format: "a4",
    orientation: layout === "byDate" ? "landscape" : "portrait",
    compress: true,
  });
}

/** Zeichnet EINEN Dienstplan auf die aktuelle Seite. */
function drawDienstplan(
  doc: jsPDF,
  schedule: Schedule,
  opts: { dates: string[]; title: string; layout: SchedulePdfLayout; employeeIds?: string[] },
): void {
  const employees =
    opts.employeeIds && opts.employeeIds.length
      ? schedule.employees.filter((e) => opts.employeeIds!.includes(e.id))
      : schedule.employees;
  const byKey = new Map<string, Shift>();
  for (const s of schedule.shifts) byKey.set(`${s.employeeId}#${s.date}`, s);

  const holidays = publicHolidays(schedule.year);
  const holidayNames = publicHolidayNames(schedule.year);
  const overrides = Object.fromEntries(schedule.dateOverrides.map((o) => [o.date, o]));
  const closedOn = (date: string) => isDayClosed(schedule.workHours, date, holidays, overrides);

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const startY = drawHeader(doc, "Dienstplan", schedule, opts.title);
  const usableW = pageW - 2 * MARGIN;
  // Unteres Band für die Unterschriften bleibt frei.
  const usableH = pageH - startY - 24;

  if (opts.layout === "byEmployee") {
    const nameW = 32;
    const sumW = 16;
    const dayW = (usableW - nameW - sumW) / Math.max(1, opts.dates.length);
    const columns: GridColumn[] = [
      { w: nameW, align: "left" },
      ...opts.dates.map(() => ({ w: dayW, align: "center" as const })),
      { w: sumW, align: "right" },
    ];
    const head = [
      "Mitarbeiter",
      ...opts.dates.map(
        (d) => `${WEEKDAY_SHORT_DE[weekdayKeyOf(parseIsoDate(d))]} ${format(parseIsoDate(d), "dd.MM.")}`,
      ),
      "Summe",
    ];
    const body: GridRow[] = employees.map((employee) => {
      const own = opts.dates.map((d) => byKey.get(`${employee.id}#${d}`));
      const total = own.reduce((sum, s) => sum + (s?.paidMinutes ?? 0), 0);
      return {
        shaded: false,
        cells: [
          [employee.name],
          ...opts.dates.map((d, i) => shiftLines(own[i], closedOn(d))),
          [`${minutesToDecimalHours(total, 2).replace(",00", "")}h`],
        ],
      };
    });
    body.push({
      shaded: true,
      strong: true,
      cells: [
        ["Besetzung"],
        ...opts.dates.map((d) => [
          closedOn(d) ? "-" : String(employees.filter((e) => byKey.has(`${e.id}#${d}`)).length),
        ]),
        [""],
      ],
    });
    const rowH = Math.min(9, Math.max(5, usableH / (body.length + 1)));
    drawGrid(doc, MARGIN, startY, columns, head, body, 7, rowH);
  } else {
    const dateW = 20;
    const weekdayW = 26;
    const empW = (usableW - dateW - weekdayW) / Math.max(1, employees.length);
    const columns: GridColumn[] = [
      { w: dateW, align: "left" },
      { w: weekdayW, align: "left" },
      ...employees.map(() => ({ w: empW, align: "center" as const })),
    ];
    const head = ["Datum", "Wochentag", ...employees.map((e) => e.name)];
    const body: GridRow[] = opts.dates.map((d) => {
      const closed = closedOn(d);
      const holiday = holidayNames.get(d);
      return {
        shaded: closed,
        cells: [
          [format(parseIsoDate(d), "dd.MM.yyyy")],
          [WEEKDAY_LABELS_DE[weekdayKeyOf(parseIsoDate(d))] + (holiday ? ` · ${holiday}` : "")],
          ...employees.map((e) => shiftLines(byKey.get(`${e.id}#${d}`), closed)),
        ],
      };
    });
    const rowH = Math.min(8, Math.max(4.2, usableH / (body.length + 1)));
    const fontSize = employees.length > 9 ? 5.5 : employees.length > 6 ? 6 : 6.5;
    drawGrid(doc, MARGIN, startY, columns, head, body, fontSize, rowH);
  }

  drawSignatures(doc, ["Unterschrift Arbeitgeber", "Datum"], pageH - 14);
}

export type ShareResult = "shared" | "cancelled" | "unsupported" | "failed";

/**
 * Bảng Chia sẻ của hệ thống („Lưu vào Tệp", gửi qua Zalo …) cho trình duyệt nhúng.
 * Phải gọi TRỰC TIẾP trong lúc người dùng bấm nút: tạo PDF mất vài giây, gọi
 * share sau đó thì trình duyệt coi như không có thao tác người dùng và từ chối.
 */
export async function sharePdf(blob: Blob, filename: string): Promise<ShareResult> {
  if (typeof navigator === "undefined" || typeof File === "undefined") return "unsupported";
  const file = new File([blob], filename, { type: "application/pdf" });
  if (!navigator.canShare?.({ files: [file] })) return "unsupported";
  try {
    await navigator.share({ files: [file], title: filename });
    return "shared";
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return "cancelled";
    return "failed";
  }
}
