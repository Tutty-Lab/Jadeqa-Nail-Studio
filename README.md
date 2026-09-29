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
- **Hauptzeit:** Mo–Fr 15:00–19:00, Sa ab 11:00 – dort sollen **2 Personen**
  da sein, höchstens 4.
- **Tagesgewichte:** Mo 1,2 · Di 1,0 · Mi 1,2 · Do 1,2 · **Fr 2,0 · Sa 2,0**.
- **Höchstens 8 bezahlte Stunden am Tag**, höchstens 6 Tage am Stück, alle
  Zeiten auf dem 30-Minuten-Raster. Pause: über 6 h 30 Minuten, über 8 h 60
  Minuten – und nach § 4 ArbZG nie mehr als 6 Stunden am Stück ohne Pause.
- **Höchstens 5 Arbeitstage je Woche** für die Angestellten. Die Inhaberin ist
  ausgenommen: 169 h passen in einem kurzen Monat sonst nicht (20 Tage × 8 h).

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
| Chu tiem (Inhaberin) | — | — | 169 h/Monat *(Annahme)* |
| Thi Kim Oanh Pham | 01.11.2024 | — | 70,2 h/Monat (900 €) |
| Tri Duc Nguyen | 01.05.2025 | — | 87,4 h/Monat (1.120 €) |
| Dinh Hai Le | 15.05.2025 | **31.07.2025** | 93,6 h/Monat (1.200 €) |
| Quynh Nhu Nguyen | 01.09.2025 | — | 19,5 h/Woche |
| Van Anh Nguyen | 01.11.2025 | — | 5 h/Woche (Minijob) |
| Thuy Linh Tran | 15.01.2026 | — | 19,5 h/Woche |

Zwei Dinge muss der Betrieb bestätigen:

1. **Die Inhaberin** steht mit Namen „Chu tiem" und 169 h im Plan. Sie hat
   keine Lohnabrechnung; ohne sie reichen die Verträge nicht, um 09:00–19:00 an
   26 Tagen zu besetzen. Name und Stunden im Tab „Nhân viên" anpassen.
2. **Geänderte Stunden:** Quynh Nhu Nguyen hatte 117 h (09/2025), dann
   27 h/Woche, seit 02/2026 19,5 h/Woche. Hinterlegt ist der letzte Stand – für
   einen älteren Monat vor dem Erzeugen umstellen.

## Was der Plan leistet

Gerechnet über alle 11 Monate mit Lohnabrechnung (05/2025–03/2026):

| | Ergebnis |
|---|---|
| Verträge | eingehalten, Abweichung höchstens eine halbe Stunde |
| Arbeitsrecht (8 h, 6 Tage, Pausen, Raster) | keine Verstöße |
| Laden unbesetzt | **keine einzige halbe Stunde** im ganzen Zeitraum |
| Hauptzeit unterbesetzt | 210 halbe Stunden, davon 130 allein im August 2025 |

Der August 2025 ist der Engpass: da hatte das Studio nur **drei Verträge**
(Inhaberin, 70,2 h, 87,4 h). Die Stunden reichen für die volle Abdeckung der
Öffnungszeit, aber nicht für zwei Personen in der Hauptzeit. Der Rest verteilt
sich auf 05/2025 (43) und 07/2025 (24) – ebenfalls schwach besetzte Monate –
sowie einzelne halbe Stunden in 09/2025 (5) und 10/2025 (8). Ab November 2025
(fünf Verträge) ist der Plan sauber, 11/2025–03/2026 ohne jede Lücke.

Nachgerechnet mit `npx vite-node scripts/coverage-check.mts`.

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
