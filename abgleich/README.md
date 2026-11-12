# Abgleichdienst (Lernflaeche, Gruppenflaeche)

Verteilt Kacheln, Objekte (Texte, Bilder, Widgets), Zeiger und Live-Striche einer Gruppenflaeche
ueber WebSocket. Gespeichert wird in SQLite (nur anfuegen); Zeiger und Live-Striche sind fluechtig.

## Betrieb

| Variable | Bedeutung |
|---|---|
| `ABGLEICH_SCHLUESSEL` | Pflicht, mindestens 32 Zeichen (Leerraum am Rand, auch CRLF, wird entfernt). Signiert Ausweise und Dienstkopf. |
| `ABGLEICH_DB` | Pfad der SQLite-Datei (Container: `/daten/abgleich.sqlite`, Volume `/daten`). |
| `ABGLEICH_HOST` / `ABGLEICH_PORT` | Lauschadresse (Container: `0.0.0.0` / `8160`). |
| `ABGLEICH_OFFEN=1` | Nur Tests und Probe: Start ohne Schluessel. Dann gibt es keinen Ausweis, und die HTTP-Routen verlangen den Kopf `X-Abgleich-Dienst` nicht. |
| `ABGLEICH_PROTOKOLL=1` | Eine Logzeile je Verbindungsereignis, nie Inhalte. |

Container: `docker build -t abgleich abgleich`; Healthcheck auf `GET /healthz`.
Ein Prozess je Datenbank, die Datei nie von zwei Prozessen oeffnen.

## HTTP (gleicher Port)

- `GET /healthz` frei.
- `POST /platz {flaeche, person}` und `PUT /schutz {flaeche, person, felder}` nur mit Kopf `X-Abgleich-Dienst`
  (SHA-256 von `abgleich-dienst:<schluessel>`, hex).

## WebSocket `/?flaeche=&person=&fenster=&ausweis=`

Browser zuerst `hallo {seit, protokoll}`; Antwort `stand` oder Nachholung plus `angenommen`.

- Browser nach Dienst: `kachel {kachel, png|null, nr}`, `objekt {id, daten|null, nr}`, `zeiger`, `live`.
- Dienst nach Browser: `ok {kachel|objekt, seq, nr}`, `fehler {grund, nr}`, `eintrag`, `objekt {seq, autor, id, daten}`,
  `zeiger {autor, ...}`, `live {autor, ...}`, `anwesend {personen, namen}`, `stand {seq, kacheln, objekte, schutz}`, `angenommen {seq, schutz}`,
  `schutz {person, felder}`.
- Schutzfelder: `stand.schutz` (ebenso `angenommen.schutz`) ist `[{person, felder}]` der Flaeche; jedes `PUT /schutz` geht als `schutz {person, felder}` an alle
  angenommenen Verbindungen der Flaeche (`felder: []` = aufgehoben). Der Browser entfernt eigene Tinte in fremden Feldern vor dem
  Senden; eine trotzdem abgelehnte Kachel (`fehler fremdes_ergebnisfeld`) setzt er auf ihren zuletzt bestaetigten Stand zurueck.
- Objekt: Schluessel (Autor der Verbindung, `id`); `id` passt auf `^[A-Za-z0-9_-]{1,80}$`; `daten` hoechstens 900 000 Bytes JSON mit
  `art` und Zahlen `x, y, w, h`; `null` loescht. Schneidet das Rechteck ein Schutzfeld einer anderen Person: `fehler fremdes_ergebnisfeld`.
- Live: `{strich<=40, punkte<=200 mal [x,y,d], farbe<=32, staerke, ende?}`; je Verbindung hoechstens alle 40 ms, `ende` nie gedrosselt.
