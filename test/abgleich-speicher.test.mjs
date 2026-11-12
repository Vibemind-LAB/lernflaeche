import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { oeffneSpeicher } from "../abgleich/speicher.mjs";

const png = (s) => new Uint8Array(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Buffer.from(s)]));

function mitSpeicher(fn) {
  return async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "abgleich-"));
    const pfad = path.join(dir, "t.sqlite");
    try { await fn(pfad); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };
}

test("stand liefert letzten Eintrag je Autor und Kachel", mitSpeicher((pfad) => {
  const s = oeffneSpeicher(pfad);
  s.anfuegen({ flaeche: "g", autor: "anna", kachel: "1,1", png: png("a1") });
  s.anfuegen({ flaeche: "g", autor: "ben", kachel: "1,1", png: png("b1") });
  const letzte = s.anfuegen({ flaeche: "g", autor: "anna", kachel: "1,1", png: png("a2") });
  const st = s.stand("g");
  assert.equal(st.seq, letzte);
  assert.equal(st.kacheln.length, 2);
  const anna = st.kacheln.find((k) => k.autor === "anna");
  assert.equal(anna.seq, letzte);
  assert.deepEqual([...anna.png], [...png("a2")]);
  assert.ok(anna.png instanceof Uint8Array);
  s.schliessen();
}));
test("geloeschte Kachel fehlt im Stand", mitSpeicher((pfad) => {
  const s = oeffneSpeicher(pfad);
  s.anfuegen({ flaeche: "g", autor: "anna", kachel: "2,2", png: png("x") });
  const q = s.anfuegen({ flaeche: "g", autor: "anna", kachel: "2,2", png: null });
  const st = s.stand("g");
  assert.equal(st.kacheln.length, 0);
  assert.equal(st.seq, q);
  s.schliessen();
}));
test("seit liefert nur spaetere Eintraege aufsteigend", mitSpeicher((pfad) => {
  const s = oeffneSpeicher(pfad);
  const a = s.anfuegen({ flaeche: "g", autor: "anna", kachel: "1,1", png: png("1") });
  const b = s.anfuegen({ flaeche: "g", autor: "ben", kachel: "2,1", png: png("2") });
  const c = s.anfuegen({ flaeche: "g", autor: "anna", kachel: "1,1", png: null });
  assert.ok(a < b && b < c);
  const r = s.seit("g", a);
  assert.deepEqual(r.map((e) => e.seq), [b, c]);
  assert.equal(r[1].png, null);
  assert.equal(r[0].autor, "ben");
  assert.equal(r[0].kachel, "2,1");
  assert.deepEqual(s.seit("g", c), []);
  assert.equal(s.seit("g", 0).length, 3);
  s.schliessen();
}));
test("Flaechen sind getrennt", mitSpeicher((pfad) => {
  const s = oeffneSpeicher(pfad);
  s.anfuegen({ flaeche: "g1", autor: "anna", kachel: "1,1", png: png("1") });
  const q = s.anfuegen({ flaeche: "g2", autor: "anna", kachel: "1,1", png: png("2") });
  assert.equal(s.stand("g1").kacheln.length, 1);
  assert.equal(s.stand("g2").seq, q);
  assert.equal(s.stand("g1").seq < q, true);
  assert.equal(s.seit("g1", 0).length, 1);
  assert.deepEqual(s.stand("leer"), { seq: 0, kacheln: [], objekte: [] });
  s.schliessen();
}));
test("ueberlebt Schliessen und Oeffnen", mitSpeicher((pfad) => {
  const s = oeffneSpeicher(pfad);
  const q = s.anfuegen({ flaeche: "g", autor: "anna", kachel: "3,3", png: png("z") });
  s.schliessen();
  const s2 = oeffneSpeicher(pfad);
  const st = s2.stand("g");
  assert.equal(st.seq, q);
  assert.equal(st.kacheln.length, 1);
  assert.deepEqual([...st.kacheln[0].png], [...png("z")]);
  assert.equal(s2.anfuegen({ flaeche: "g", autor: "anna", kachel: "3,3", png: null }) > q, true);
  s2.schliessen();
}));
test("Protokoll-Kennung: einmal angelegt, bleibt beim Wiederoeffnen, neue Datei = neue Kennung", mitSpeicher((pfad) => {
  const s = oeffneSpeicher(pfad);
  const kennung = s.protokoll;
  assert.equal(typeof kennung, "string");
  assert.match(kennung, /^[a-z0-9-]{1,40}$/);
  s.schliessen();
  const s2 = oeffneSpeicher(pfad);
  assert.equal(s2.protokoll, kennung);
  s2.schliessen();
  const s3 = oeffneSpeicher(`${pfad}.zwei`);
  assert.notEqual(s3.protokoll, kennung);
  s3.schliessen();
}));
test("hoechsteSeq je Flaeche", mitSpeicher((pfad) => {
  const s = oeffneSpeicher(pfad);
  assert.equal(s.hoechsteSeq("g"), 0);
  const a = s.anfuegen({ flaeche: "g", autor: "anna", kachel: "1,1", png: png("1") });
  s.anfuegen({ flaeche: "h", autor: "anna", kachel: "1,1", png: png("2") });
  assert.equal(s.hoechsteSeq("g"), a);
  s.schliessen();
}));
test("aktuelles Fenster je Flaeche und Person, ueberlebt Wiederoeffnen", mitSpeicher((pfad) => {
  const s = oeffneSpeicher(pfad);
  assert.equal(s.fenster("g", "anna"), null);
  s.fensterSetzen("g", "anna", "f1");
  s.fensterSetzen("g", "anna", "f2");
  s.fensterSetzen("g", "ben", "f9");
  s.fensterSetzen("h", "anna", "f7");
  assert.equal(s.fenster("g", "anna"), "f2");
  assert.equal(s.fenster("g", "ben"), "f9");
  assert.equal(s.fenster("h", "anna"), "f7");
  s.schliessen();
  const s2 = oeffneSpeicher(pfad);
  assert.equal(s2.fenster("g", "anna"), "f2");
  s2.schliessen();
}));

test("plaetze: fortlaufend je Flaeche, fest, ueberleben Wiederoeffnen", mitSpeicher((pfad) => {
  const s = oeffneSpeicher(pfad);
  assert.equal(s.platz("g-1", "anna"), 0);
  assert.equal(s.platz("g-1", "ben"), 1);
  assert.equal(s.platz("g-1", "anna"), 0);
  assert.equal(s.platz("g-2", "ben"), 0);
  s.schliessen();
  const s2 = oeffneSpeicher(pfad);
  assert.equal(s2.platz("g-1", "ben"), 1);
  assert.equal(s2.platz("g-1", "carl"), 2);
  s2.schliessen();
}));

test("schutz: nur anfuegen, juengster Eintrag je Flaeche und Person gilt", mitSpeicher((pfad) => {
  const s = oeffneSpeicher(pfad);
  s.schutzSetzen("g-1", "ben", [[0, 0, 5, 5]]);
  s.schutzSetzen("g-1", "ben", [[1, 2, 3, 4]]);
  s.schutzSetzen("g-1", "anna", []);
  const alle = s.schutzAlle();
  assert.deepEqual(alle.find((z) => z.person === "ben").felder, [[1, 2, 3, 4]]);
  assert.deepEqual(alle.find((z) => z.person === "anna").felder, []);
  assert.equal(alle.length, 2);
  s.schliessen();
}));

test("alte_db_ohne_art_spalte_wird_nachgeruestet", mitSpeicher((pfad) => {
  const alt = new DatabaseSync(pfad);
  alt.exec(`CREATE TABLE eintraege (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, flaeche TEXT NOT NULL, autor TEXT NOT NULL,
    kachel TEXT NOT NULL, png BLOB, zeit TEXT NOT NULL)`);
  alt.prepare("INSERT INTO eintraege (flaeche, autor, kachel, png, zeit) VALUES (?, ?, ?, ?, ?)")
    .run("g", "anna", "1,1", png("alt"), "2026-01-01T00:00:00.000Z");
  alt.close();
  const s = oeffneSpeicher(pfad);
  const st = s.stand("g");
  assert.equal(st.kacheln.length, 1);
  assert.deepEqual([...st.kacheln[0].png], [...png("alt")]);
  assert.deepEqual(st.objekte, []);
  assert.equal(s.seit("g", 0)[0].art, "kachel");
  const seq = s.anfuegen({ flaeche: "g", autor: "anna", art: "objekt", kachel: "t1", daten: { art: "text", x: 1, y: 2, w: 3, h: 4 } });
  assert.equal(s.stand("g").objekte[0].seq, seq);
  s.schliessen();
  oeffneSpeicher(pfad).schliessen(); // zweites Oeffnen: Spalten sind schon da
}));

test("objekt_stand_juengster_je_autor_und_id_geloeschte_weg", mitSpeicher((pfad) => {
  const s = oeffneSpeicher(pfad);
  const o = (autor, id, daten) => s.anfuegen({ flaeche: "g", autor, art: "objekt", kachel: id, daten });
  o("anna", "x", { art: "text", v: 1 });
  const a2 = o("anna", "x", { art: "text", v: 2 });
  const b1 = o("ben", "x", { art: "text", v: 3 });
  o("anna", "y", { art: "text" });
  o("anna", "y", null);
  const st = s.stand("g");
  assert.deepEqual(st.objekte.map((e) => [e.autor, e.id, e.seq, e.daten.v]), [["anna", "x", a2, 2], ["ben", "x", b1, 3]]);
  assert.equal(st.kacheln.length, 0);
  assert.equal(s.seit("g", a2)[0].art, "objekt");
  s.schliessen();
}));
