// Sinh PDF Stundenzettel mẫu (tháng 3/2026) để xem thử thiết kế DATEV mới.
import { writeFileSync } from "node:fs";
import { generateSchedule } from "../src/lib/scheduler";
import { storeById, initialScheduleFor } from "../src/lib/stores";
import { buildStundenzettelPdfFor } from "../src/lib/pdf";

const store = storeById("jadeqa");
const schedule = initialScheduleFor(store); // 3/2026
schedule.shifts = generateSchedule({
  year: schedule.year, month: schedule.month, workHours: store.workHours,
  employees: schedule.employees, rules: store.staffingRules,
  weights: store.dayWeights, storeTag: store.id,
});

const doc = await buildStundenzettelPdfFor([{ schedule, employees: schedule.employees }]);
const buf = Buffer.from(doc.output("arraybuffer"));
const out = process.argv[2] ?? "sample-stundenzettel.pdf";
writeFileSync(out, buf);
console.log(`OK ${out} · ${buf.length} bytes · ${schedule.employees.length} Seiten`);
