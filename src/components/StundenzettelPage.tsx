import type { ReactElement } from "react";
import type { Employee, Schedule } from "../types";
import { datesOfMonth } from "../lib/demand";
import { monthLabelDe, paintStundenzettel, SZ_PAGE_H, SZ_PAGE_W, type SzPainter } from "../lib/pdf";

// pt -> mm (jsPDF-Schriftgrößen sind in pt, die Seite rechnet in mm).
const PT = 25.4 / 72;
const FONT = {
  helvetica: "Arimo, Helvetica, Arial, sans-serif",
  courier: "Cousine, 'Courier New', Courier, monospace",
};
const ANCHOR = { left: "start", center: "middle", right: "end" } as const;

/**
 * Bildschirm-Vorschau des Stundenzettels. Zeichnet mit DERSELBEN Funktion wie
 * die PDF (paintStundenzettel), nur als SVG – Vorschau und PDF sind dadurch
 * immer identisch.
 */
export function StundenzettelPage({
  schedule,
  employee,
  dates,
  periodLabel,
}: {
  schedule: Schedule;
  employee: Employee;
  /** Nur diese Tage zeigen (Wochen-Stundenzettel); fehlend => ganzer Monat. */
  dates?: string[];
  /** Zeitraum-Text; fehlend => Monat/Jahr. */
  periodLabel?: string;
}) {
  const items: ReactElement[] = [];
  const painter: SzPainter = {
    text(text, x, y, o) {
      if (!text) return;
      items.push(
        <text
          key={items.length}
          x={x}
          y={y}
          fontFamily={FONT[o.font]}
          fontWeight={o.bold ? 700 : 400}
          fontSize={o.fs * PT}
          textAnchor={ANCHOR[o.align]}
          style={{ whiteSpace: "pre" }}
        >
          {text}
        </text>,
      );
    },
    line(x0, y0, x1, y1, width, gray = 0) {
      items.push(
        <line
          key={items.length}
          x1={x0}
          y1={y0}
          x2={x1}
          y2={y1}
          stroke={`rgb(${gray},${gray},${gray})`}
          strokeWidth={width}
        />,
      );
    },
  };
  paintStundenzettel(
    painter,
    schedule,
    employee,
    dates ?? datesOfMonth(schedule.year, schedule.month),
    periodLabel ?? monthLabelDe(schedule.year, schedule.month),
  );

  return (
    <div className="mx-auto max-w-[210mm] bg-white">
      <svg
        viewBox={`0 0 ${SZ_PAGE_W} ${SZ_PAGE_H}`}
        className="block w-full min-w-[560px] h-auto"
        fill="black"
        role="img"
        aria-label={`Arbeitszeitnachweis ${employee.name}`}
      >
        <rect width={SZ_PAGE_W} height={SZ_PAGE_H} fill="white" />
        {items}
      </svg>
    </div>
  );
}
