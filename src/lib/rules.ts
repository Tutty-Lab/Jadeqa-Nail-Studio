// ============================================================================
// Welche Regeln HART sind und welche WEICH – eine Liste für Anzeige, Prüfung
// und Vorschläge.
//
// Luật cứng: der Planer bricht sie nie. Steht trotzdem etwas im Plan, das sie
// verletzt (Hand-Änderung, unmögliche Vorgabe), ist das ein Fehler.
// Luật mềm: der Planer versucht es; geht es nicht, bleibt der Plan brauchbar,
// die Abweichung wird gemeldet und „Tìm cách xếp khác" sucht eine Änderung.
// ============================================================================

export type RuleKind = "hard" | "soft";

export type RuleId =
  // hart
  | "open-hours"
  | "closing"
  | "shift-length"
  | "max-days"
  | "days-off"
  | "employment-period"
  | "two-stores"
  | "contract-max"
  | "fixed-shift"
  | "holiday-duty"
  // weich
  | "contract-hours"
  | "peak-staff"
  | "day-weights"
  | "own-shift-length"
  | "spread-evenly"
  | "preferred-windows";

export type Rule = { id: RuleId; kind: RuleKind; title: string; detail: string };

// J'ADEQA: ein Studio (keine Regel „zwei Läden" in der Liste), die Inhaberin ist
// immer da und zählt bei der Besetzung mit.
export const RULES: readonly Rule[] = [
  { id: "open-hours", kind: "hard", title: "Chỉ trong giờ mở cửa", detail: "T2–T7 09:00–19:00. Chủ nhật và ngày lễ tiệm đóng cửa, không xếp ca." },
  { id: "closing", kind: "hard", title: "Phủ kín giờ mở cửa", detail: "Từ lúc mở tới lúc đóng luôn có ít nhất 1 người. Chủ tiệm luôn có mặt và được tính." },
  { id: "shift-length", kind: "hard", title: "Ca 3–8 giờ, nghỉ đúng luật", detail: "Mỗi ca ít nhất 3 giờ, tối đa 8 giờ công một ngày; giờ nghỉ theo luật lao động." },
  { id: "max-days", kind: "hard", title: "Tối đa 5 ngày/tuần, 6 ngày liên tiếp", detail: "Nhân viên làm tối đa 5 ngày mỗi tuần (hoặc „Số ngày làm / tuần\" đã đặt), không quá 6 ngày liên tiếp." },
  { id: "days-off", kind: "hard", title: "Ngày nghỉ cố định", detail: "Không xếp ca vào ngày nghỉ cố định của người đó." },
  { id: "employment-period", kind: "hard", title: "Ngày vào làm / nghỉ việc", detail: "Không xếp ca trước ngày vào làm hoặc sau ngày nghỉ việc." },
  { id: "contract-max", kind: "hard", title: "Không quá giờ hợp đồng", detail: "Không xếp quá giờ tháng (hoặc giờ tuần với hợp đồng theo tuần)." },
  { id: "fixed-shift", kind: "hard", title: "Ca cố định", detail: "Người có ca cố định chỉ làm đúng khung giờ đó." },
  { id: "holiday-duty", kind: "hard", title: "Trực ngày lễ", detail: "Ngày lễ tiệm mở thì người trực ngày lễ phải có ca." },
  { id: "contract-hours", kind: "soft", title: "Đủ giờ định mức", detail: "Xếp đủ giờ hợp đồng; tháng không đủ ngày (nghỉ, giới hạn ngày) thì báo thiếu." },
  { id: "peak-staff", kind: "soft", title: "Số người giờ cao điểm", detail: "Cao điểm T2, T4–T6 16:00–19:00 và T7 13:00–18:00: 2 người (tính cả chủ; đông hơn thì không sao)." },
  { id: "day-weights", kind: "soft", title: "Ngày đông nhiều giờ hơn", detail: "Thứ Sáu và Thứ Bảy (hệ số 2,0) nhận nhiều giờ hơn ngày thường." },
  { id: "own-shift-length", kind: "soft", title: "Độ dài ca riêng", detail: "Mỗi ngày làm nằm trong khoảng giờ đã đặt cho người đó." },
  { id: "spread-evenly", kind: "soft", title: "Rải đều trong tháng", detail: "Giờ chia đều theo tuần; có Độ dài ca thì nhiều ca ngắn hơn." },
  { id: "preferred-windows", kind: "soft", title: "Khung giờ ưu tiên", detail: "Xếp vào ngày và giờ người đó muốn, nếu số người và giờ định mức cho phép." },
];

export const ruleById = (id: RuleId): Rule =>
  RULES.find((r) => r.id === id) ?? { id, kind: "hard", title: id, detail: "" };

/** Besetzungsregeln (staffing.ts) nach Label: „Cao điểm …" weich, „Trong giờ mở cửa" hart. */
export function staffingRuleId(label: string): RuleId {
  return label.startsWith("Cao điểm") ? "peak-staff" : "closing";
}
