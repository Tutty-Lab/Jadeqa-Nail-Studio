// Kiểm tra độc lập lịch J'ADEQA: xếp lịch nhiều seed cho mỗi tháng rồi soát
// từng luật bằng code riêng (không dùng validation.ts của app), sau đó đối
// chiếu thêm với validateSchedule. Chạy: npx vite-node scripts/audit-schedule.mts [seeds]
import { generateSchedule } from "../src/lib/scheduler";
import { storeById } from "../src/lib/stores";
import { publicHolidays } from "../src/lib/holidays";
import { datesOfMonth, parseIsoDate, weekdayKeyOf } from "../src/lib/demand";
import { resolveDay } from "../src/lib/workHours";
import { staffingWindows, validPause, workingAt } from "../src/lib/staffing";
import { monthlyTargetMinutesFor } from "../src/lib/contract";
import { validateSchedule } from "../src/lib/validation";
import type { Employee, Shift } from "../src/types";

const SEEDS = Number(process.argv[2] ?? 5);
const store = storeById("jadeqa");
const OWNER = (e: Employee) => e.weeklyHours == null && e.targetMinutes >= 160 * 60;

const months: [number, number][] = [];
for (let y = 2025, m = 5; y < 2027 || (y === 2027 && m <= 1); m === 12 ? (y++, (m = 1)) : m++) months.push([y, m]);

const problems: Record<string, string[]> = {};
const add = (k: string, s: string) => (problems[k] ??= []).push(s);
let empty = 0;
let peakShort = 0;
let overMax = 0;
let runs = 0;
const peakByMonth: Record<string, number> = {};
const emptyByMonth: Record<string, number> = {};
const capByMonth: Record<string, string> = {};
const hoursDev: string[] = [];

const isoWeek = (d: Date) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${Math.ceil(((+t - +y0) / 864e5 + 1) / 7)}`;
};

for (const [year, month] of months) {
  const holidays = publicHolidays(year);
  const employees = store.sampleEmployees();
  const dates = datesOfMonth(year, month);
  const open = dates.filter((d) => !resolveDay(store.workHours, d, holidays, {}).closed);
  const cap = employees.reduce((a, e) => a + monthlyTargetMinutesFor(e, open, store.workHours), 0) / 60;
  const openH = open.reduce((a, d) => a + resolveDay(store.workHours, d, holidays, {}).blocks.reduce((b, x) => b + x.endMinutes - x.startMinutes, 0), 0) / 60;
  capByMonth[`${year}-${String(month).padStart(2, "0")}`] = `HĐ ${cap.toFixed(0)}h / mở ${openH}h`;
  for (let seed = 0; seed < SEEDS; seed++) {
    runs++;
    const tag = `${year}-${String(month).padStart(2, "0")}#${seed}`;
    let shifts: Shift[];
    try {
      shifts = generateSchedule({
        year, month, workHours: store.workHours, overrides: {}, employees,
        rules: store.staffingRules, weights: store.dayWeights, storeTag: store.id, seed: `audit-${tag}`,
      });
    } catch (e) {
      add("Lỗi khi xếp lịch", `${tag}: ${(e as Error).message}`);
      continue;
    }
    const byEmp = new Map<string, Shift[]>();
    for (const s of shifts) (byEmp.get(s.employeeId) ?? byEmp.set(s.employeeId, []).get(s.employeeId)!).push(s);

    for (const s of shifts) {
      const e = employees.find((x) => x.id === s.employeeId);
      const who = `${tag} ${e?.name ?? s.employeeId} ${s.date}`;
      if (!e) { add("Ca của người không tồn tại", who); continue; }
      const day = resolveDay(store.workHours, s.date, holidays, {});
      if (day.closed) add("Ca vào ngày đóng cửa (CN/lễ)", who);
      else if (!day.blocks.some((b) => s.startMinutes >= b.startMinutes && s.endMinutes <= b.endMinutes))
        add("Ca ngoài giờ mở cửa 09–19", `${who} ${s.startMinutes / 60}-${s.endMinutes / 60}`);
      if (e.startDate && s.date < e.startDate) add("Ca trước ngày vào làm", who);
      if (e.endDate && s.date > e.endDate) add("Ca sau ngày thôi làm", who);
      if (s.startMinutes % 30 || s.endMinutes % 30) add("Không theo lưới 30'", who);
      const presence = s.endMinutes - s.startMinutes;
      if (s.paidMinutes !== presence - s.pauseMinutes) add("paidMinutes sai", who);
      const needPause = s.paidMinutes > 8 * 60 ? 60 : s.paidMinutes > 6 * 60 ? 30 : 0;
      if (s.pauseMinutes < needPause) add("Thiếu pause (§4 ArbZG)", `${who} paid ${s.paidMinutes}' pause ${s.pauseMinutes}'`);
      if (s.pauseMinutes > 0 && !validPause(s)) add("Pause đặt sai (>6h liền không nghỉ)", who);
      if (s.pauseMinutes === 0 && presence > 360) add("Làm >6h liền không nghỉ", who);
    }

    for (const e of employees) {
      const list = (byEmp.get(e.id) ?? []).sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes);
      const perDay = new Map<string, number>();
      for (const s of list) perDay.set(s.date, (perDay.get(s.date) ?? 0) + s.paidMinutes);
      for (const [d, m] of perDay) if (m > 480) add("Quá 8h/ngày", `${tag} ${e.name} ${d} ${m / 60}h`);
      for (let i = 1; i < list.length; i++)
        if (list[i].date === list[i - 1].date && list[i].startMinutes < list[i - 1].endMinutes) add("Ca chồng nhau", `${tag} ${e.name} ${list[i].date}`);
      // ngày liên tiếp
      const days = [...perDay.keys()].sort();
      let run = 1;
      for (let i = 1; i < days.length; i++) {
        const gap = (+parseIsoDate(days[i]) - +parseIsoDate(days[i - 1])) / 864e5;
        run = Math.round(gap) === 1 ? run + 1 : 1;
        if (run > 6) add("Quá 6 ngày liên tiếp", `${tag} ${e.name} tới ${days[i]}`);
      }
      if (!OWNER(e)) {
        const perWeek = new Map<string, number>();
        for (const d of days) perWeek.set(isoWeek(parseIsoDate(d)), (perWeek.get(isoWeek(parseIsoDate(d))) ?? 0) + 1);
        for (const [w, n] of perWeek) if (n > 5) add("Nhân viên >5 ngày/tuần", `${tag} ${e.name} ${w}: ${n}`);
      }
      const soll = monthlyTargetMinutesFor(e, open, store.workHours);
      const ist = list.reduce((a, s) => a + s.paidMinutes, 0);
      if (Math.abs(ist - soll) > 30) hoursDev.push(`${tag} ${e.name}: kế hoạch ${ist / 60}h / hợp đồng ${soll / 60}h`);
    }

    for (const d of open) {
      const day = resolveDay(store.workHours, d, holidays, {});
      const onDay = shifts.filter((s) => s.date === d);
      const windows = staffingWindows(day.blocks, weekdayKeyOf(parseIsoDate(d)), store.staffingRules);
      for (const b of day.blocks)
        for (let m = b.startMinutes; m < b.endMinutes; m += 30) {
          const have = new Set(onDay.filter((s) => workingAt(s, m)).map((s) => s.employeeId)).size;
          let need = 0, max = Infinity;
          for (const w of windows) if (m >= w.startMinutes && m < w.endMinutes) { need = Math.max(need, w.minStaff); max = Math.min(max, w.maxStaff); }
          if (have === 0) { empty++; emptyByMonth[tag.slice(0, 7)] = (emptyByMonth[tag.slice(0, 7)] ?? 0) + 1; add("Tiệm trống người", `${tag} ${d} ${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`); }
          if (have < need) { peakShort++; const k = tag.slice(0, 7); peakByMonth[k] = (peakByMonth[k] ?? 0) + 1; }
          if (have > max) overMax++;
        }
    }

    const v = validateSchedule(employees, shifts, year, open, store.workHours);
    for (const err of v.errors) if (err.severity !== "warning") add("validateSchedule báo lỗi", `${tag} ${err.message}`);
  }
}

console.log(`Đã chạy ${runs} lịch (${months.length} tháng × ${SEEDS} seed)`);
console.log(`Ô 30' tiệm trống: ${empty} · thiếu người cao điểm: ${peakShort} (TB ${(peakShort / runs).toFixed(1)}/tháng) · vượt tối đa 4: ${overMax}`);
console.log(`  theo tháng (TB mỗi lịch):`, Object.entries(peakByMonth).map(([k, n]) => `${k}: ${n / SEEDS}`).join(" · "));
for (const k of Object.keys(capByMonth)) console.log(`  ${k}: ${capByMonth[k]} · trống ${(emptyByMonth[k] ?? 0) / SEEDS / 2}h · thiếu cao điểm ${(peakByMonth[k] ?? 0) / SEEDS}`);
console.log(`Lệch giờ hợp đồng >30': ${hoursDev.length}`);
for (const h of hoursDev.slice(0, 15)) console.log("  ", h);
const keys = Object.keys(problems);
if (!keys.length) console.log("VI PHẠM LUẬT: không có");
for (const k of keys) {
  console.log(`VI PHẠM – ${k}: ${problems[k].length}`);
  for (const s of problems[k].slice(0, 8)) console.log("   ", s);
}
