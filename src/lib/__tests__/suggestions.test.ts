import { describe, expect, it } from "vitest";
import { STORES, initialScheduleFor } from "../stores";
import { better, findFixes, openDatesOf, planAll, scoreOf, type TrialStore } from "../suggestions";
import { explainShortfall } from "../shortfall";
import { RULES } from "../rules";

/** J'ADEQA, September 2026 (alle sechs Angestellten bis auf Dinh Hai Le aktiv). */
const trialStores = (): TrialStore[] =>
  STORES.map((store) => ({
    storeId: store.id,
    shortName: store.shortName,
    schedule: { ...initialScheduleFor(store), year: 2026, month: 9, shifts: [] },
    rules: store.staffingRules,
    weights: store.dayWeights,
  }));

/** Tri Duc Nguyen (87,4 h/Monat) darf nur Di + Mi – das Soll passt dann nicht. */
const onlyTueWed = (): TrialStore[] => {
  const stores = trialStores();
  stores[0].schedule = {
    ...stores[0].schedule,
    employees: stores[0].schedule.employees.map((e) =>
      e.id === "jadeqa-2" ? { ...e, availableWeekdays: ["tuesday", "wednesday"] } : e,
    ),
  };
  return stores;
};

describe("Luật cứng / luật mềm", () => {
  it("jede Regel ist genau einer Art zugeordnet", () => {
    expect(RULES.filter((r) => r.kind === "hard").length).toBeGreaterThan(0);
    expect(RULES.filter((r) => r.kind === "soft").length).toBeGreaterThan(0);
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
  });

  it("der Planer bricht keine harte Regel (Startbelegschaft mit Inhaberin, September)", () => {
    const stores = trialStores();
    expect(scoreOf(stores, planAll(stores)).hard).toBe(0);
  });
});

describe("Tìm cách xếp khác", () => {
  it("Teilzeit nur Di+Mi: Soll passt nicht – Vorschlag: einen Ruhetag freigeben, danach mehr geplant", async () => {
    const result = await findFixes(onlyTueWed());
    expect(result.baseline.missingMinutes).toBeGreaterThan(0);
    expect(result.options.length).toBeGreaterThan(0);
    for (const option of result.options) expect(better(option.score, result.baseline)).toBe(true);
    const top = result.options[0];
    expect(top.changes[0].label).toMatch(/^Tri Duc Nguyen.*bỏ ngày nghỉ cố định/);
    expect(top.score.missingMinutes).toBeLessThan(result.baseline.missingMinutes);
    // An der Inhaberin gibt es nichts zu lockern.
    expect(result.options.some((o) => o.changes.some((c) => c.employeeId === "jadeqa-0"))).toBe(false);
  }, 120_000);
});

describe("Vì sao thiếu giờ", () => {
  it("nennt die freien Tage und schlägt vor, Ruhetage freizugeben", () => {
    const stores = onlyTueWed();
    const plans = planAll(stores);
    const triDuc = stores[0].schedule.employees.find((e) => e.id === "jadeqa-2")!;
    const assigned = plans.get("jadeqa")!.filter((s) => s.employeeId === triDuc.id).reduce((sum, s) => sum + s.paidMinutes, 0);
    const { reasons, fixes } = explainShortfall(
      triDuc, assigned, triDuc.targetMinutes, openDatesOf(stores[0].schedule), [], stores[0].shortName,
    );
    expect(reasons.join(" ")).toMatch(/ngày nghỉ cố định/);
    expect(fixes.join(" ")).toContain("Bỏ bớt ngày nghỉ cố định");
  }, 60_000);
});
