// Phân tích phủ ca 11 tháng có phiếu lương (05/2025–03/2026) với giờ 09:00–19:00.
import { generateSchedule } from "../src/lib/scheduler";
import { storeById } from "../src/lib/stores";
import { publicHolidays } from "../src/lib/holidays";
import { datesOfMonth, parseIsoDate, weekdayKeyOf } from "../src/lib/demand";
import { resolveDay } from "../src/lib/workHours";
import { staffingWindows, workingAt } from "../src/lib/staffing";
import type { Shift } from "../src/types";

const store = storeById("jadeqa");
const staffAt = (shifts: Shift[], m: number) =>
  new Set(shifts.filter((s) => workingAt(s, m)).map((s) => s.employeeId)).size;

const months: [number, number][] = [
  [2025, 5], [2025, 6], [2025, 7], [2025, 8], [2025, 9], [2025, 10],
  [2025, 11], [2025, 12], [2026, 1], [2026, 2], [2026, 3],
];

let emptyTotal = 0, peakTotal = 0;
const emptyWhere: string[] = [];
const peakByMonth: Record<string, number> = {};

for (const [year, month] of months) {
  const holidays = publicHolidays(year);
  const employees = store.sampleEmployees();
  const shifts = generateSchedule({
    year, month, workHours: store.workHours, employees,
    rules: store.staffingRules, weights: store.dayWeights, storeTag: store.id,
  });
  const key = `${year}-${String(month).padStart(2, "0")}`;
  for (const date of datesOfMonth(year, month)) {
    const day = resolveDay(store.workHours, date, holidays, {});
    if (day.closed) continue;
    const onDay = shifts.filter((s) => s.date === date);
    const wk = weekdayKeyOf(parseIsoDate(date));
    const windows = staffingWindows(day.blocks, wk, store.staffingRules);
    for (const block of day.blocks) {
      for (let m = block.startMinutes; m < block.endMinutes; m += 30) {
        const have = staffAt(onDay, m);
        if (have === 0) { emptyTotal++; emptyWhere.push(`${date} ${Math.floor(m/60)}:${String(m%60).padStart(2,"0")}`); }
        let need = 0;
        for (const w of windows) if (m >= w.startMinutes && m < w.endMinutes) need = Math.max(need, w.minStaff);
        if (have < need) { peakTotal++; peakByMonth[key] = (peakByMonth[key] ?? 0) + 1; }
      }
    }
  }
}

console.log("Giờ:", JSON.stringify(store.workHours.perWeekday.monday));
console.log("Laden unbesetzt (ô 30' trống):", emptyTotal);
if (emptyWhere.length) console.log("  ->", emptyWhere.join(" | "));
console.log("Hauptzeit unterbesetzt (ô 30' thiếu người cao điểm):", peakTotal);
console.log("  theo tháng:", JSON.stringify(peakByMonth));
