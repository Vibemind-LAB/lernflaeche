// Speicher des Abgleichs: SQLite, nur anfuegen (INSERT), nie UPDATE oder DELETE.
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export function oeffneSpeicher(pfad) {
  const db = new DatabaseSync(pfad);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = FULL");
  db.exec(`CREATE TABLE IF NOT EXISTS eintraege (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    flaeche TEXT NOT NULL,
    autor TEXT NOT NULL,
    kachel TEXT NOT NULL,
    png BLOB,
    zeit TEXT NOT NULL
  )`);
  // Objekte (Texte, Bilder, Widgets) liegen in derselben Tabelle: eine gemeinsame seq-Reihenfolge.
  // Bei art='objekt' steht in kachel die Objekt-Id, daten ist JSON oder NULL (geloescht).
  const spalten = new Set(db.prepare("PRAGMA table_info(eintraege)").all().map((z) => z.name));
  if (!spalten.has("art")) db.exec("ALTER TABLE eintraege ADD COLUMN art TEXT NOT NULL DEFAULT 'kachel'");
  if (!spalten.has("daten")) db.exec("ALTER TABLE eintraege ADD COLUMN daten TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS eintraege_flaeche_seq ON eintraege (flaeche, seq)");
  db.exec("CREATE INDEX IF NOT EXISTS eintraege_schluessel ON eintraege (flaeche, autor, kachel, seq)");
  // Kennung dieses Protokolls: einmal zufaellig angelegt, nie geaendert. Ein Client, der eine
  // andere Kennung kennt, hat ein frueheres (zurueckgesetztes oder ersetztes) Protokoll gesehen.
  db.exec("CREATE TABLE IF NOT EXISTS meta (schluessel TEXT PRIMARY KEY, wert TEXT NOT NULL)");
  db.prepare("INSERT OR IGNORE INTO meta (schluessel, wert) VALUES ('protokoll', ?)").run(randomUUID());
  const protokoll = String(db.prepare("SELECT wert FROM meta WHERE schluessel = 'protokoll'").get().wert);
  // Aktuelles Fenster je Flaeche und Person (das zuletzt frisch geladene); auch nur angefuegt.
  db.exec(`CREATE TABLE IF NOT EXISTS fenster (
    nr INTEGER PRIMARY KEY AUTOINCREMENT,
    flaeche TEXT NOT NULL,
    person TEXT NOT NULL,
    fenster TEXT NOT NULL,
    zeit TEXT NOT NULL
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS fenster_person ON fenster (flaeche, person, nr)");

  // Mappe-Plaetze (0, 1, 2 ...) je Flaeche in Reihenfolge der ersten Anfrage; bleiben fuer immer.
  db.exec(`CREATE TABLE IF NOT EXISTS plaetze (
    flaeche TEXT NOT NULL,
    person TEXT NOT NULL,
    platz INTEGER NOT NULL,
    zeit TEXT NOT NULL,
    UNIQUE (flaeche, person),
    UNIQUE (flaeche, platz)
  )`);
  // Schutzfelder (Ergebnisfelder je Person) als JSON-Liste [[x,y,w,h], ...]; nur angefuegt, der juengste Eintrag gilt.
  db.exec(`CREATE TABLE IF NOT EXISTS schutz (
    nr INTEGER PRIMARY KEY AUTOINCREMENT,
    flaeche TEXT NOT NULL,
    person TEXT NOT NULL,
    felder TEXT NOT NULL,
    zeit TEXT NOT NULL
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS schutz_person ON schutz (flaeche, person, nr)");
  const platzLesen = db.prepare("SELECT platz FROM plaetze WHERE flaeche = ? AND person = ?");
  const platzNeu = db.prepare(`INSERT INTO plaetze (flaeche, person, platz, zeit)
    VALUES (?, ?, (SELECT COUNT(*) FROM plaetze WHERE flaeche = ?), ?)`);
  const schutzNeu = db.prepare("INSERT INTO schutz (flaeche, person, felder, zeit) VALUES (?, ?, ?, ?)");
  const schutzAlle = db.prepare(`SELECT s.flaeche, s.person, s.felder FROM schutz s
    WHERE s.nr = (SELECT MAX(x.nr) FROM schutz x WHERE x.flaeche = s.flaeche AND x.person = s.person)`);

  const einfuegen = db.prepare("INSERT INTO eintraege (flaeche, autor, art, kachel, png, daten, zeit) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const hoechste = db.prepare("SELECT COALESCE(MAX(seq), 0) AS seq FROM eintraege WHERE flaeche = ?");
  const letzte = db.prepare(`SELECT e.seq, e.autor, e.kachel, e.png FROM eintraege e
    WHERE e.flaeche = ? AND e.seq = (
      SELECT MAX(x.seq) FROM eintraege x WHERE x.flaeche = e.flaeche AND x.autor = e.autor AND x.art = 'kachel' AND x.kachel = e.kachel)
    AND e.art = 'kachel' AND e.png IS NOT NULL ORDER BY e.seq`);
  const letzteObjekte = db.prepare(`SELECT e.seq, e.autor, e.kachel, e.daten FROM eintraege e
    WHERE e.flaeche = ? AND e.art = 'objekt' AND e.seq = (
      SELECT MAX(x.seq) FROM eintraege x WHERE x.flaeche = e.flaeche AND x.autor = e.autor AND x.art = 'objekt' AND x.kachel = e.kachel)
    AND e.daten IS NOT NULL ORDER BY e.seq`);
  const spaeter = db.prepare("SELECT seq, autor, art, kachel, png, daten FROM eintraege WHERE flaeche = ? AND seq > ? ORDER BY seq");
  const fensterNeu = db.prepare("INSERT INTO fenster (flaeche, person, fenster, zeit) VALUES (?, ?, ?, ?)");
  const fensterAktuell = db.prepare("SELECT fenster FROM fenster WHERE flaeche = ? AND person = ? ORDER BY nr DESC LIMIT 1");

  const bytes = (b) => (b === null || b === undefined ? null : new Uint8Array(b.buffer, b.byteOffset, b.byteLength));

  return {
    protokoll,
    anfuegen({ flaeche, autor, art = "kachel", kachel, png = null, daten = null }) {
      const r = einfuegen.run(flaeche, autor, art, kachel, png, daten === null ? null : JSON.stringify(daten), new Date().toISOString());
      return Number(r.lastInsertRowid);
    },
    hoechsteSeq(flaeche) {
      return Number(hoechste.get(flaeche).seq);
    },
    stand(flaeche) {
      const seq = Number(hoechste.get(flaeche).seq);
      const kacheln = letzte.all(flaeche).map((z) => ({ autor: z.autor, kachel: z.kachel, seq: Number(z.seq), png: bytes(z.png) }));
      const objekte = letzteObjekte.all(flaeche).map((z) => ({ autor: z.autor, id: z.kachel, seq: Number(z.seq), daten: JSON.parse(z.daten) }));
      return { seq, kacheln, objekte };
    },
    seit(flaeche, seq) {
      return spaeter.all(flaeche, seq).map((z) => ({
        seq: Number(z.seq), autor: z.autor, art: z.art, kachel: z.kachel, png: bytes(z.png),
        daten: z.daten === null ? null : JSON.parse(z.daten),
      }));
    },
    fenster(flaeche, person) {
      const z = fensterAktuell.get(flaeche, person);
      return z ? String(z.fenster) : null;
    },
    fensterSetzen(flaeche, person, fenster) {
      fensterNeu.run(flaeche, person, fenster, new Date().toISOString());
    },
    platz(flaeche, person) {
      let z = platzLesen.get(flaeche, person);
      if (!z) {
        platzNeu.run(flaeche, person, flaeche, new Date().toISOString());
        z = platzLesen.get(flaeche, person);
      }
      return Number(z.platz);
    },
    schutzSetzen(flaeche, person, felder) {
      schutzNeu.run(flaeche, person, JSON.stringify(felder), new Date().toISOString());
    },
    // Alle geltenden Schutzfelder: [{flaeche, person, felder}]
    schutzAlle() {
      return schutzAlle.all().map((z) => ({ flaeche: z.flaeche, person: z.person, felder: JSON.parse(z.felder) }));
    },
    schliessen() {
      db.close();
    },
  };
}
