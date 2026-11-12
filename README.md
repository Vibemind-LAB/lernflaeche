<p align="center"><img src="public/lernflaeche-favicon.png" alt="" width="96" height="96"></p>

<h1 align="center">Lernfläche</h1>

> **English:** Lernfläche is a handwriting and drawing canvas with AI for learning, with a learning mode and a group mode. It is a modified version of PenEcho (AGPL-3.0-only) and not an official PenEcho release.

Die Lernfläche ist eine Fläche zum Zeichnen und Schreiben mit KI. Man schreibt oder skizziert mit Stift, Maus
oder Finger, und die KI antwortet direkt auf der Fläche: mit gesetzter Schrift, Formeln, Skizzen, Diagrammen
oder kleinen interaktiven Widgets.

## Was die Lernfläche kann

- **Fläche mit KI:** unendliche Fläche für Handschrift, Formeln, Text und Bilder. Die KI läuft über einen
  eigenen API-Schlüssel (OpenAI- oder Anthropic-kompatibel) oder über eine angemeldete Codex-, Claude-Code-
  oder Kimi-CLI. Agenten können die Fläche auch über MCP nutzen (`docs/mcp-setup.md`).
- **Lernmodus** (`?lernen=1`): Die KI gibt Hinweise statt fertiger Lösungen, die Oberfläche spricht Deutsch,
  offene Eingaben werden bereichsweise nacheinander beantwortet.
- **Gruppenmodus** (`?gruppe=<gruppe>&person=<person>`): Mehrere Personen arbeiten gleichzeitig auf einer
  gemeinsamen Fläche. Striche, Texte, Bilder und Widgets werden abgeglichen; Zeiger und Live-Striche sind
  sichtbar, eigene Ergebnisfelder lassen sich gegen fremde Änderungen schützen.
- **Abgleichdienst** (`abgleich/`): kleiner WebSocket-Dienst (Node.js, SQLite, nur anfügen), der die
  Gruppenflächen verteilt. Er ist optional und wird nur für den Gruppenmodus gebraucht. Protokoll und
  Betrieb: [`abgleich/README.md`](abgleich/README.md).

## Lokal starten

Voraussetzung: Node.js 22.19 oder neuer.

```bash
npm ci
npm start                          # http://localhost:3888
```

Beim ersten Start legt man einen sechsstelligen Zugangscode fest und richtet unter
**Einstellungen → AI & connections** eine KI-Verbindung ein. Weitere Optionen zeigt `npm start -- --help`,
zum Beispiel einen anderen Port (`--port 3999`) oder eine angemeldete CLI (`--claude`, `--codex`, `--kimi`).
Zustand und Einstellungen liegen standardmäßig unter `~/.penecho`; mit `PENECHO_STATE_DIR` lässt sich ein
eigener Zustandsordner wählen.

### Gruppenmodus mit Abgleichdienst (optional)

Für einen lokalen Versuch auf einem Rechner:

```bash
# 1. Abgleichdienst ohne Schlüssel (nur für Tests; lauscht auf 127.0.0.1:8160)
ABGLEICH_OFFEN=1 ABGLEICH_DB=./abgleich.sqlite node abgleich/dienst.mjs

# 2. Lernfläche mit Verbindung zum Dienst
LERNFLAECHE_ABGLEICH_URL=ws://127.0.0.1:8160 npm start
```

Danach `http://localhost:3888/?gruppe=<gruppe>&person=<person>` in mehreren Fenstern öffnen, je Fenster eine
andere Person. Im Betrieb läuft der Dienst mit `ABGLEICH_SCHLUESSEL` (mindestens 32 Zeichen); dann braucht jede
Verbindung einen signierten, kurzlebigen Ausweis, den ein vorgeschalteter Dienst ausstellt (Format in
`abgleich/ausweis.mjs`). Der Dienst lässt sich auch als Container bauen (`docker build -t abgleich abgleich`).

### Entwicklung

```bash
npm test                 # Tests der Fläche
npm run test:abgleich    # Tests des Abgleichdienstes und des Gruppenkerns
npm run build:client     # baut public/app.js aus src/client und src/shared
npm run check:client     # prüft, dass public/app.js zum Quelltext passt
```

`public/app.js` ist ein Build-Ergebnis: nach Änderungen unter `src/client/` oder `src/shared/` neu bauen.
Architektur und Renderer sind unter [`docs/`](docs/) beschrieben (aus PenEcho übernommen, englisch).

## Lizenz und Quelltext

Die Lernfläche steht unter der **GNU Affero General Public License v3.0 only** (`AGPL-3.0-only`), siehe
[`LICENSE`](LICENSE) und [`NOTICE`](NOTICE). Wer eine veränderte Fassung über ein Netzwerk für andere
betreibt, muss diesen Personen den passenden Quelltext anbieten (AGPL-3.0 §13). Dafür liefert jede Instanz
unter `/quelltext` ein Archiv des laufenden Stands aus; es wird beim Ausliefern mit
`node scripts/quelltext-paket.mjs` gebaut. Der Hinweis mit Link steht in den Einstellungen und auf der
Zugangsseite.

Mitgelieferte Fremdkomponenten behalten ihre eigenen Lizenzen (Übersicht in [`NOTICE`](NOTICE)).

## Basiert auf PenEcho

Die Lernfläche basiert auf [PenEcho](https://github.com/penecho/penecho) 1.4.2 (AGPL-3.0-only) und ist eine
veränderte Fassung, **keine offizielle PenEcho-Fassung**. Der Name PenEcho bezeichnet hier nur die Herkunft.
Die PenEcho-Zeichen sind durch das VibeMind-Logo ersetzt; die Markenregeln des Ursprungsprojekts stehen
unverändert in [`TRADEMARKS.md`](TRADEMARKS.md). `CONTRIBUTING.md`, `CONTRIBUTOR-LICENSE-AGREEMENT.md` und
`COMMERCIAL-LICENSE.md` sind Dokumente des Ursprungsprojekts und beziehen sich auf PenEcho.

Wesentliche Änderungen gegenüber PenEcho 1.4.2 (ab 2026-11-07):

- eigener Name, eigenes Paket (`lernflaeche`) und VibeMind-Logo statt der PenEcho-Zeichen;
- Lernmodus und Gruppenmodus mit Abgleichdienst (`abgleich/`, `src/shared/`, `src/client/app/gruppe.js`);
- keine Telemetrie, Cloud-Vorschläge ab Werk aus, kein automatischer npm-Update-Check;
- Quelltext-Angebot unter `/quelltext`;
- getrennter MCP-Zustand und -Port per `LERNFLAECHE_MCP_ZUSTAND` / `LERNFLAECHE_MCP_PORT`;
- Windows-Korrektur beim Speichern der Notizbibliothek (`src/server/note-library.js`, Original daneben als
  `note-library.js.orig-1.4.2`).

Interne Kennungen wie `penecho-*`-Klassen, `PENECHO_*`-Variablen oder der Zustandsordner `~/.penecho`
bleiben aus technischen Gründen erhalten.
