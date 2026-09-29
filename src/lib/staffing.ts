import type { Shift } from "../types";
import { DAY_WEIGHTS, type WeekdayKey } from "./demand";
import type { DayBlocks, DayWindow } from "./workHours";

export type StaffingWindow = {
  label: string;
  startMinutes: number;
  endMinutes: number;
  minStaff: number;
  maxStaff: number;
};

/** Anfang der Hauptzeit an Werktagen (Mo–Fr): ab hier wird es voll. */
export const PEAK_START = 16 * 60;
/** Ende der Hauptzeit – danach läuft der Tag aus. */
export const PEAK_END = 19 * 60;
/** Samstags geht die Hauptzeit schon am späten Vormittag los. */
export const SATURDAY_PEAK_START = 13 * 60;
/** Samstags ebbt der Andrang vor Ladenschluss ab. */
export const SATURDAY_PEAK_END = 18 * 60;

/**
 * Eine Besetzungsregel: WO (Zeitspanne je Öffnungsblock) und WIE VIELE.
 *
 * minStaff/maxStaff sind der Wert eines Normaltags (Gewicht 1,0). Bei
 * scaled = true werden sie mit dem Tagesgewicht (DAY_WEIGHTS) multipliziert und
 * aufgerundet – starke Tage tragen so automatisch mehr.
 *
 * Einzige Quelle für Scheduler, Độ phủ-Bericht und Tab „Tài liệu": wer die
 * Besetzung eines Studios ändert, ändert nur diese Liste.
 */
export type StaffingRule = {
  label: string;
  /** Kurzbeschreibung der Zeitspanne für den Tab „Tài liệu". */
  when: string;
  minStaff: number;
  maxStaff: number;
  scaled: boolean;
  /** Nur an diesen (effektiven) Wochentagen; fehlt = an jedem offenen Tag. */
  weekdays?: readonly WeekdayKey[];
  windows: (blocks: DayBlocks) => DayWindow[];
};

/** Schneidet eine feste Uhrzeitspanne mit jedem Öffnungsblock. */
export const clip = (from: number, to: number) => (blocks: DayBlocks): DayWindow[] =>
  blocks
    .map((block) => ({ startMinutes: Math.max(from, block.startMinutes), endMinutes: Math.min(to, block.endMinutes) }))
    .filter((window) => window.endMinutes > window.startMinutes);

/** Die ganze Öffnungszeit – es ist IMMER jemand im Studio. */
export const wholeDay = (blocks: DayBlocks): DayWindow[] =>
  blocks.map((block) => ({ startMinutes: block.startMinutes, endMinutes: block.endMinutes }));

/**
 * Tage mit Hauptzeit-Doppelbesetzung. Dienstag (Gewicht 1,0, der ruhigste Tag)
 * fehlt bewusst: fünf Verträge tragen die zweite Person nur an vier Werktagen
 * plus Samstag – mit Dienstag fehlten jeden Monat rund 12 h.
 */
const WERKTAGE: readonly WeekdayKey[] = ["monday", "wednesday", "thursday", "friday"];

/**
 * J'ADEQA Nagelstudio – ein Laden, kleines Team (Inhaberin plus drei bis vier
 * Angestellte, die häufig wechseln), offen Mo–Sa 09:00–19:00.
 *
 *  - „Phủ kín giờ mở cửa" – harte Regel: nie null Personen im Studio.
 *  - Hauptzeit Mo–Fr 15:00–19:00 und Sa ab 11:00 – dort die zweite Person.
 *
 * Bewusst NICHT drei Personen am Samstag wie in der großen King-Nail-Filiale:
 * hier sind nur drei bis vier Verträge gleichzeitig aktiv, und eine
 * Untergrenze, die das Stundenbudget nicht hergibt, erzeugt nur rote Felder im
 * Bericht statt besserer Pläne. Der Deckel (max. 4) verhindert, dass an einem
 * starken Tag alle gleichzeitig im Laden stehen.
 */
export const JADEQA_STAFFING_RULES: readonly StaffingRule[] = [
  {
    label: "Trong giờ mở cửa", when: "suốt giờ mở cửa", minStaff: 1, maxStaff: Infinity, scaled: false,
    windows: wholeDay,
  },
  {
    label: "Cao điểm T2, T4–T6", when: "16:00–19:00", minStaff: 2, maxStaff: 4, scaled: false,
    weekdays: WERKTAGE, windows: clip(PEAK_START, PEAK_END),
  },
  {
    label: "Cao điểm T7", when: "13:00–18:00", minStaff: 2, maxStaff: 4, scaled: false,
    weekdays: ["saturday"], windows: clip(SATURDAY_PEAK_START, SATURDAY_PEAK_END),
  },
];

/** Rückfall für Tests und Altaufrufe. */
export const STAFFING_RULES = JADEQA_STAFFING_RULES;

/** Mindest-/Höchstzahl einer Regel an einem Wochentag (Gewicht angewandt, aufgerundet). */
export function ruleRange(rule: StaffingRule, weekday: WeekdayKey): { minStaff: number; maxStaff: number } {
  const weight = rule.scaled ? DAY_WEIGHTS[weekday] : 1;
  return {
    minStaff: Math.ceil(rule.minStaff * weight),
    maxStaff: Number.isFinite(rule.maxStaff) ? Math.ceil(rule.maxStaff * weight) : Infinity,
  };
}

export function ruleAppliesOn(rule: StaffingRule, weekday: WeekdayKey): boolean {
  return !rule.weekdays || rule.weekdays.includes(weekday);
}

export function staffingWindows(
  blocks: DayBlocks,
  weekday: WeekdayKey,
  rules: readonly StaffingRule[] = STAFFING_RULES,
): StaffingWindow[] {
  return rules.filter((rule) => ruleAppliesOn(rule, weekday)).flatMap((rule) => {
    const range = ruleRange(rule, weekday);
    return rule.windows(blocks).map((window) => ({ label: rule.label, ...window, ...range }));
  });
}

/**
 * Số GIỜ CÔNG tối thiểu một ngày cần, để mọi khung ở mục „số người tối thiểu"
 * được thoả: với từng 30 phút mở cửa, lấy mức cao nhất trong các khung phủ lên
 * nó, rồi cộng lại.
 *
 * Ví dụ Papenstieg ngày thường: phủ 09:00–19:00 với 1 người = 10h, cộng người
 * thứ hai 15:00–19:00 = 4h → 14h. Đây là phần giờ KHÔNG phụ thuộc hệ số ngày:
 * ngày vắng cũng phải phủ như ngày đông. Vì vậy nó được cấp trước, phần dư mới
 * chia theo hệ số (xem weightedDailyTargets).
 */
export function minimumStaffHours(
  blocks: DayBlocks,
  weekday: WeekdayKey,
  rules: readonly StaffingRule[] = STAFFING_RULES,
  slot = 30,
): number {
  const windows = staffingWindows(blocks, weekday, rules);
  let minutes = 0;
  for (const block of blocks) {
    for (let m = block.startMinutes; m < block.endMinutes; m += slot) {
      let need = 0;
      for (const w of windows) {
        if (m >= w.startMinutes && m < w.endMinutes) need = Math.max(need, w.minStaff);
      }
      minutes += need * slot;
    }
  }
  return minutes / 60;
}

// ── Đường nhu cầu trong ngày ────────────────────────────────────────────────
/**
 * Nhu cầu tương đối theo giờ (1,0 = bình thường) – dạng „ngọn núi": mở cửa
 * vắng, trưa nhích lên, cao điểm 15:00–19:00, cuối ngày vãn. Thuật toán chia
 * GIỜ CÔNG CỦA NGÀY (đã nhân hệ số ngày) theo đường này thành số người mục tiêu
 * cho từng 30 phút, rồi phạt độ lệch theo bình phương – nhờ vậy số người lên
 * xuống mượt, không dồn cục.
 *
 * Tiệm nail mở LIÊN TỤC cả ngày (không nghỉ trưa). Thứ Bảy khách tới sớm nên
 * cao điểm kéo dài từ 11:00 (cột phải).
 */
export type DemandBand = { startMinutes: number; endMinutes: number; level: number; label: string };

const band = (from: string, to: string, level: number, label: string): DemandBand => {
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  return { startMinutes: toMinutes(from), endMinutes: toMinutes(to), level, label };
};

export const DEMAND_PROFILE: { normal: readonly DemandBand[]; saturday: readonly DemandBand[] } = {
  normal: [
    band("09:00", "10:00", 0.7, "Mở cửa, vắng khách"),
    band("10:00", "12:00", 0.9, "Buổi sáng"),
    band("12:00", "14:00", 1.1, "Trưa"),
    band("14:00", "15:00", 1.2, "Vào cao điểm"),
    band("15:00", "17:00", 1.5, "Cao điểm chiều"),
    band("17:00", "19:00", 1.5, "Cao điểm tối, đóng cửa"),
  ],
  // Thứ Bảy: khách đi mua sắm từ trưa, cao điểm kéo dài 11:00–19:00.
  saturday: [
    band("09:00", "10:00", 0.9, "Mở cửa"),
    band("10:00", "11:00", 1.1, "Khách bắt đầu đông"),
    band("11:00", "15:00", 1.5, "Cao điểm trưa"),
    band("15:00", "19:00", 1.5, "Cao điểm chiều, đóng cửa"),
  ],
};

export function demandProfileOf(
  weekday: WeekdayKey,
  _weights: Record<WeekdayKey, number> = DAY_WEIGHTS,
): readonly DemandBand[] {
  // Chỉ thứ Bảy có đường riêng (cao điểm dài). Thứ Sáu cũng đông, nhưng đông
  // vào ĐÚNG khung cao điểm chiều – việc đó đã nằm ở hệ số ngày (2,0).
  return weekday === "saturday" ? DEMAND_PROFILE.saturday : DEMAND_PROFILE.normal;
}

/** Relative workload at a minute (1 outside all bands). */
export function workloadAt(
  minute: number,
  weekday: WeekdayKey,
  weights: Record<WeekdayKey, number> = DAY_WEIGHTS,
): number {
  return demandProfileOf(weekday, weights).find((b) => minute >= b.startMinutes && minute < b.endMinutes)?.level ?? 1;
}

/**
 * Số người mục tiêu cho từng 30 phút mở cửa:
 *   mục tiêu = giờ công của ngày × mức nhu cầu ÷ tổng mức cả ngày (tính theo phút).
 * Trả về [phút bắt đầu, số người mục tiêu].
 */
export function slotTargets(
  blocks: DayBlocks,
  weekday: WeekdayKey,
  targetHours: number,
  slot = 30,
  weights: Record<WeekdayKey, number> = DAY_WEIGHTS,
): [number, number][] {
  const slots: [number, number][] = [];
  for (const block of blocks) {
    for (let minute = block.startMinutes; minute < block.endMinutes; minute += slot) {
      slots.push([minute, workloadAt(minute, weekday, weights)]);
    }
  }
  const levelMinutes = slots.reduce((sum, [, level]) => sum + level * slot, 0);
  const scale = levelMinutes > 0 ? (targetHours * 60) / levelMinutes : 0;
  return slots.map(([minute, level]) => [minute, level * scale]);
}

export function validPause(shift: Shift): boolean {
  const start = shift.pauseStartMinutes;
  return start != null && shift.pauseMinutes > 0 && start > shift.startMinutes &&
    start + shift.pauseMinutes < shift.endMinutes && start - shift.startMinutes <= 360 &&
    shift.endMinutes - start - shift.pauseMinutes <= 360;
}

export function workingAt(shift: Shift, minute: number): boolean {
  return shift.startMinutes <= minute && shift.endMinutes > minute &&
    !(validPause(shift) && minute >= shift.pauseStartMinutes! && minute < shift.pauseStartMinutes! + shift.pauseMinutes);
}

export function coveragePoints(shifts: Shift[], from: number, to: number): number[] {
  return [...new Set([from, to, ...shifts.flatMap((s) => [s.startMinutes, s.endMinutes,
    ...(validPause(s) ? [s.pauseStartMinutes!, s.pauseStartMinutes! + s.pauseMinutes] : []),
  ]).filter((t) => t > from && t < to)])].sort((a, b) => a - b);
}

/**
 * Giờ công mục tiêu mỗi ngày, chuẩn hoá trong từng ISO-week (không mượn giữa các tuần).
 *
 * Hai bước:
 *  1. **Sàn phủ cửa** (floorOf): mỗi ngày mở phải có ít nhất 1 người suốt giờ
 *     mở, nên ngày nào cũng cần trước một số giờ CỐ ĐỊNH bằng số giờ mở cửa —
 *     không liên quan tới hệ số ngày. Bỏ qua bước này thì ngày vắng (T3) nhận
 *     quá ít giờ để phủ nổi, còn ngày đông nhận dư.
 *  2. Phần CÒN LẠI chia theo hệ số: giờ ngày = phần dư × (hệ số × phút mở) ÷ Σ(…).
 *
 * Nếu tổng giờ còn không đủ cho sàn (hợp đồng quá ít so với giờ mở), quay về
 * cách chia thuần theo hệ số. Không truyền openMinutesOf => chỉ theo hệ số.
 */
export function weightedDailyTargets(
  dates: string[],
  total: number,
  weekdayOf: (date: string) => WeekdayKey,
  openMinutesOf?: (date: string) => number,
  weights: Record<WeekdayKey, number> = DAY_WEIGHTS,
  floorOf?: (date: string) => number,
  /**
   * Kleinerer Sockel für den Fall, dass der volle nicht bezahlbar ist – in der
   * Regel „eine Person über die ganze Öffnungszeit". Im Nagelstudio wechselt
   * das Team, und in einem Monat mit nur drei Verträgen reichen die Stunden
   * nicht mehr für zwei Personen in der Hauptzeit. Ohne diese zweite Stufe
   * fällt die Verteilung auf reine Gewichtung zurück, und der schwächste Tag
   * bekommt dann weniger Stunden, als das ÖFFNEN allein kostet – der Laden
   * stünde zeitweise leer. Lieber überall offen als irgendwo voll.
   */
  fallbackFloorOf?: (date: string) => number,
): Map<string, number> {
  const factor = (date: string) => weights[weekdayOf(date)] * (openMinutesOf ? openMinutesOf(date) : 1);
  const sum = dates.reduce((acc, date) => acc + factor(date), 0);
  const share = (date: string, amount: number) => (sum > 0 ? amount * factor(date) / sum : 0);
  for (const sockel of [floorOf, fallbackFloorOf]) {
    if (!sockel) continue;
    const floors = new Map(dates.map((date) => [date, sockel(date)]));
    const floorSum = [...floors.values()].reduce((a, b) => a + b, 0);
    if (floorSum > 0 && floorSum < total) {
      const rest = total - floorSum;
      return new Map(dates.map((date) => [date, floors.get(date)! + share(date, rest)]));
    }
  }
  return new Map(dates.map((date) => [date, share(date, total)]));
}
