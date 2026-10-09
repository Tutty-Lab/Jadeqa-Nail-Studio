# Dienstplan & Stundenzettel — J'ADEQA Nagelstudio

App für das Nagelstudio **J'ADEQA**, Südring 2, 67240 Bobenheim-Roxheim
(Rheinland-Pfalz). Oberfläche auf Vietnamesisch. Ein Laden, ein Team, ein
Passwort, eine Zeile in Supabase (`store_id = "jadeqa"`).

## Öffnungszeiten

- **Mo–Sa 09:00–19:00**, durchgehend (keine Mittagspause des Ladens).
- **Sonntag geschlossen**, ebenso an **gesetzlichen Feiertagen**
  (Rheinland-Pfalz, 11 Tage: mit Fronleichnam und Allerheiligen, ohne
  Reformationstag – `src/lib/holidays.ts`).

## Vorgaben des Betriebs

- **Die ganze Öffnungszeit ist besetzt** – von der ersten bis zur letzten
  Minute mindestens eine Person. Im Planer ist ein leerer Laden zehnmal so
  teuer wie eine fehlende zweite Person, und die Strafe zählt einmal je halbe
  Stunde (nicht je Regel, sonst schiebt der Planer das Loch an den Rand).
- **Hauptzeit:** Mo, Mi–Fr 16:00–19:00, Sa 13:00–18:00 – dort sollen
  **2 Personen** da sein, höchstens 4. Dienstag (ruhigster Tag) ohne
  Doppelbesetzung: mehr tragen die fünf Verträge nicht.
- **Tagesgewichte:** Mo 1,2 · Di 1,0 · Mi 1,2 · Do 1,2 · **Fr 2,0 · Sa 2,0**.
- **Höchstens 8 bezahlte Stunden am Tag**, höchstens 6 Tage am Stück, alle
  Zeiten auf dem 30-Minuten-Raster. Pause: über 6 h 30 Minuten, über 8 h 60
  Minuten – und nach § 4 ArbZG nie mehr als 6 Stunden am Stück ohne Pause.
- **Höchstens 5 Arbeitstage je Woche** für alle.
- **Die Inhaberin ist während der gesamten Öffnungszeit anwesend.** Sie zählt
  zur Besetzung, aber nicht zu den Lohnstunden der Angestellten. Die Planung
  berücksichtigt diese Anwesenheit zuerst und priorisiert Mitarbeiter in Spitzenzeiten.
- Freitag und Samstag: weiches Ziel von 3 anwesenden Personen einschließlich
  Inhaberin während der Öffnung. Kein zusätzlicher Vertragsbedarf und kein
  Validierungsfehler allein wegen Unterschreitung dieses Wunschziels.

## Eintritt und Austritt (neu gegenüber den anderen Studio-Apps)

Im Nagelstudio wechselt das Team häufig. Jede Person hat im Tab „Nhân viên"
ein **Ngày vào làm** (Eintritt) und ein **Ngày thôi làm** (Austritt):

- Vor dem Eintritt und nach dem Austritt wird niemand eingeplant; der
  Austrittstag selbst ist noch ein Arbeitstag.
- Das **Monats-Soll wird anteilig** über die offenen Tage gerechnet. Wer am
  15. anfängt, bekommt im ersten Monat rund das halbe Soll – genau wie auf der
  Lohnabrechnung (680 € statt 1.200 € im Eintrittsmonat).
- Kein Austritt eingetragen = die Person arbeitet weiter.

Damit plant dieselbe App jeden Monat richtig: oben in der Kopfzeile den Monat
wählen, und es erscheinen nur die Leute, die damals da waren.

## Belegschaft (aus den Lohnabrechnungen)

Ohne „Wöch.Arb.Zt." auf der Abrechnung: **Brutto ÷ Mindestlohn**
(2025 = 12,82 €, 2026 = 13,90 €). Steht eine Wochenstundenzahl drauf, gilt die.

| Person | Eintritt | Austritt | Vertrag |
|---|---|---|---|
| Thi Kim Oanh Pham | 01.11.2024 | — | 70,2 h/Monat (900 €) |
| Tri Duc Nguyen | 01.05.2025 | — | 87,4 h/Monat (1.120 €) |
| Dinh Hai Le | 15.05.2025 | unbekannt | 93,6 h/Monat (1.200 €) |
| Quynh Nhu Nguyen | 01.09.2025 | — | 19,5 h/Woche |
| Van Anh Nguyen | 01.11.2025 | — | 5 h/Woche (Minijob) |
| Thuy Linh Tran | 15.01.2026 | — | 19,5 h/Woche |

## Nachmeldung vom 08.10.2026

Die 14 gelieferten Brutto-/Stundenwerte stehen in `src/lib/history.ts` und im
Tab „Nhân viên“. Auf ausdrücklichen Wunsch gelten die umgerechneten Stunden
als Planungsziel nur für den jeweiligen Monat, auch bei Wochenverträgen.
Diese Monatswerte werden nicht nochmals wegen Eintritt oder Schließtagen
gekürzt. Nur Personen mit einem gelieferten Monatswert sowie die Inhaberin
werden für den gewählten Monat eingeplant. Bei fehlenden Monatswerten bleiben
Personalakte und allgemeiner Vertrag erhalten; daraus wird kein Austritt abgeleitet. Tri Nguyen und Tri Duc Nguyen werden
als dieselbe vorhandene Person geführt. Hai hat einen August-Wert; der alte
Austritt 31.07.2025 wurde entfernt, der tatsächliche Austritt ist unbekannt.

- Studio geschlossen: 24.09.–09.10.2025 einschließlich, wegen Krankheit.
- Quynh Nhu Nguyen: Urlaub 09.02.–06.03.2026 einschließlich.
- Thi Kim Oanh Pham: Urlaub 01.01.–24.01.2025 einschließlich.

Urlaub sperrt die Tage für die Planung und ist im Mitarbeitereditor änderbar.
Das gewünschte Stunden-Soll bleibt bestehen; nicht planbare Stunden werden
als Fehlstunden gewarnt. Die App rechnet in ganzen Minuten und plant im
30-Minuten-Raster. Die gelieferten Dezimalstunden bleiben in der Tabelle
unverändert erhalten. Bestehende Schichten werden nicht automatisch neu erzeugt;
Konflikte mit Urlaub oder Schließtagen werden in der Prüfung angezeigt.
Eine versionierte Migration übernimmt die Angaben auch in gespeicherte Stände.

## Was der Plan leistet

Historischer Prüfstand **vor der Nachmeldung**, ohne die neuen Urlaubstage,
Schließtage und Monatswerte (kein Nachweis für den aktuellen Datenstand).
Nur mit den Angestellten (ohne Inhaberin), 05/2025–01/2027, geprüft mit
`npx vite-node scripts/audit-schedule.mts`:

| | Ergebnis |
|---|---|
| Verträge | eingehalten, Abweichung höchstens eine halbe Stunde |
| Arbeitsrecht (8 h, 5 Tage/Woche, 6 Tage am Stück, Pausen, Raster) | keine Verstöße |
| Laden unbesetzt, wenn die Vertragsstunden reichen | 0 h – einzige Ausnahme 12/2025: 1 h (256 h Vertrag für 250 h Öffnung) |
| Laden unbesetzt, wenn sie NICHT reichen | 05/2025 41 h · 07/2025 20 h · 08/2025 103 h · 09/2025 und 10/2025 je 20 h |

Die Lücken 2025 sind echter Personalmangel: in diesen Monaten liegen die
Verträge zusammen unter der Öffnungszeit (08/2025: 158 h für 260 h). Ab 11/2025
ist der Laden (bis auf einzelne halbe Stunden) immer besetzt. Die zweite Person
in der Hauptzeit fehlt ab 02/2026 nur noch in 0–16 halben Stunden je Monat,
fast nur in der Woche am Monatswechsel.

## PDF

Stundenzettel und Dienstplan werden als **Vektor-PDF** gezeichnet (jsPDF) –
kein html2canvas. Eine A4-Seite je Mitarbeiter, deutsche Dezimalzahlen,
vietnamesische Namen ohne Diakritika (Helvetica), ä/ö/ü/ß bleiben korrekt.

## Entwicklung

```bash
npm install
npm run dev
npm run test
npm run build
```

Persistenz über LocalStorage und optional Supabase (`store_data`, Zeile
`jadeqa`), konfiguriert mit `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`.
Die Passwortsperre im Client ersetzt keine Zugriffskontrolle.
