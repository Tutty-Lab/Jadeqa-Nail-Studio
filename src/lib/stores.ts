// ============================================================================
// Der Betrieb hat EIN Studio. Die Struktur mit einer Liste bleibt trotzdem –
// so lässt sich später ein zweiter Laden anhängen, ohne die Oberfläche
// umzubauen (jede Filiale hat eigene Zeile in Supabase, eigenen
// LocalStorage-Schlüssel, eigene Belegschaft).
// ============================================================================

import type { Employee, Schedule } from "../types";
import { jadeqaEmployees } from "./sampleData";
import { DAY_WEIGHTS, type WeekdayKey } from "./demand";
import { JADEQA_STAFFING_RULES, type StaffingRule } from "./staffing";
import { JADEQA_WORK_HOURS, type WorkHoursConfig } from "./workHours";

export type StoreConfig = {
  /** Schlüssel der Zeile in store_data – nach dem Anlegen NICHT mehr ändern. */
  id: string;
  name: string;
  /** Kurzname für Überschriften. */
  shortName: string;
  address: string;
  /** Telefon des Studios (nur Anzeige/Dokumentation). */
  phone: string;
  /** Öffnungszeiten dieses Studios. */
  workHours: WorkHoursConfig;
  /** Belegschaft beim allerersten Öffnen. */
  sampleEmployees: () => Employee[];
  /** Welche Wochentage stark sind (Kundenandrang) – steuert die Stundenverteilung. */
  dayWeights: Record<WeekdayKey, number>;
  /** Wie viele Leute wann im Studio sein sollen. */
  staffingRules: readonly StaffingRule[];
};

export const STORES: StoreConfig[] = [
  {
    id: "jadeqa",
    name: "J'ADEQA Nagelstudio",
    shortName: "J'ADEQA",
    address: "Südring 2, 67240 Bobenheim-Roxheim",
    phone: "",
    workHours: JADEQA_WORK_HOURS,
    sampleEmployees: jadeqaEmployees,
    dayWeights: DAY_WEIGHTS,
    staffingRules: JADEQA_STAFFING_RULES,
  },
];

export const DEFAULT_STORE_ID = STORES[0].id;

/** Merkt sich die zuletzt gewählte Filiale auf diesem Gerät. */
const STORE_KEY = "stundenzettel-app:store";

export function loadStoreId(): string {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved && STORES.some((s) => s.id === saved)) return saved;
  } catch {
    /* ignorieren */
  }
  return DEFAULT_STORE_ID;
}

export function saveStoreId(id: string): void {
  try {
    localStorage.setItem(STORE_KEY, id);
  } catch {
    /* ignorieren */
  }
}

export function storeById(id: string): StoreConfig {
  return STORES.find((s) => s.id === id) ?? STORES[0];
}

/**
 * Startstand: März 2026 – der letzte Monat, für den Lohnabrechnungen
 * vorliegen. Ältere Monate lassen sich oben in der Kopfzeile wählen; die App
 * rechnet sie über Eintritt/Austritt richtig.
 */
export function initialScheduleFor(store: StoreConfig): Schedule {
  return {
    companyName: store.name,
    address: store.address,
    year: 2026,
    month: 3,
    workHours: structuredClone(store.workHours),
    dateOverrides: [],
    employees: store.sampleEmployees(),
    shifts: [],
  };
}
