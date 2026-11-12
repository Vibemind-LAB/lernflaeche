import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import WebSocket from "ws";
import hilfe from "./abgleich-hilfe.cjs";
import { starteDienst } from "../abgleich/dienst.mjs";
import { stelleAusweis } from "../abgleich/ausweis.mjs";
import { MAX_OBJEKT_TIEFE } from "../abgleich/protokoll.mjs";

const { png64, pngEcht64 } = hilfe;
const HINWEIS = "Diese Fläche ist in einem anderen Fenster geöffnet. Arbeiten Sie dort weiter.";
let fensterZaehler = 0;
const neuesFenster = () => `fenster-${++fensterZaehler}`;

function mitDienst(fn, optionen = {}) {
  return async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "abgleich-dienst-"));
    const speicherPfad = path.join(dir, "t.sqlite");
    const offen = [];
    const dienst = { aktuell: null };
    const start = async () => (dienst.aktuell = await starteDienst({ port: 0, host: "127.0.0.1", speicherPfad, offen: true, ...optionen }));
    await start();
    const verbinde = (flaeche, person, fenster = neuesFenster(), wsOptionen = {}, abfrage = "") => {
      const c = client(dienst.aktuell.port, flaeche, person, fenster, wsOptionen, abfrage);
      offen.push(c);
      return c;
    };
    try {
      await fn({
        port: () => dienst.aktuell.port,
        protokoll: () => dienst.aktuell.protokoll,
        verbinde,
        speicherPfad,
        neustart: async () => {
          await dienst.aktuell.schliessen();
          await start();
        },
      });
    } finally {
      for (const c of offen) c.ws.terminate();
      await dienst.aktuell.schliessen();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

function client(port, flaeche, person, fenster, wsOptionen, abfrage = "") {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?flaeche=${flaeche}&person=${person}&fenster=${fenster}${abfrage}`, wsOptionen);
  const nachrichten = [];
  const wartende = [];
  let zu = null;
  const zuWartende = [];
  ws.on("message", (d) => {
    const m = JSON.parse(d.toString());
    const i = wartende.findIndex((w) => w.pred(m));
    if (i >= 0) wartende.splice(i, 1)[0].res(m);
    else nachrichten.push(m);
  });
  ws.on("close", (code, grund) => {
    zu = { code, grund: grund.toString("utf8") };
    zuWartende.splice(0).forEach((r) => r(zu));
  });
  ws.on("error", () => {});
  return {
    ws,
    fenster,
    offen: () =>
      new Promise((res, rej) => {
        if (ws.readyState === WebSocket.OPEN) return res();
        ws.once("open", res);
        ws.once("close", () => rej(new Error("zu vor open")));
      }),
    senden: (o) => ws.send(typeof o === "string" ? o : JSON.stringify(o)),
    warte: (typ, ms = 3000) => {
      const pred = (m) => m.typ === typ;
      const i = nachrichten.findIndex(pred);
      if (i >= 0) return Promise.resolve(nachrichten.splice(i, 1)[0]);
      return new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error(`Timeout: ${typ}`)), ms);
        wartende.push({
          pred,
          res: (m) => {
            clearTimeout(t);
            res(m);
          },
        });
      });
    },
    nichts: async (typ, ms = 150) => {
      await new Promise((r) => setTimeout(r, ms));
      return !nachrichten.some((m) => m.typ === typ);
    },
    istZu: () => zu,
    geschlossen: (ms = 3000) =>
      zu ? Promise.resolve(zu) : new Promise((r, rej) => {
        const t = setTimeout(() => rej(new Error("Timeout: close")), ms);
        zuWartende.push((z) => { clearTimeout(t); r(z); });
      }),
  };
}

async function bereit(...cs) {
  let st;
  for (const c of cs) {
    await c.offen();
    c.senden({ typ: "hallo", seit: null });
    st = await c.warte("stand");
  }
  return st;
}

async function standVon(verbinde, flaeche, person) {
  const c = verbinde(flaeche, person);
  await c.offen();
  c.senden({ typ: "hallo", seit: null });
  return c.warte("stand");
}

test("Kachel von anna erreicht ben, nicht anna selbst", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  const ben = verbinde("g", "ben");
  await bereit(anna, ben);
  anna.senden({ typ: "kachel", kachel: "1,2", png: png64("x") });
  const e = await ben.warte("eintrag");
  assert.equal(e.kachel, "1,2");
  assert.equal(e.png, png64("x"));
  assert.equal(e.autor, "anna");
  assert.ok(Number.isInteger(e.seq) && e.seq > 0);
  assert.equal(await anna.nichts("eintrag"), true);
}));

test("ok bestaetigt dem Absender jede gespeicherte Kachel mit kachel, seq und nr", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  const ben = verbinde("g", "ben");
  await bereit(anna, ben);
  anna.senden({ typ: "kachel", kachel: "1,2", png: png64("x"), nr: 7 });
  anna.senden({ typ: "kachel", kachel: "1,2", png: null, nr: 8 });
  anna.senden({ typ: "kachel", kachel: "3,3", png: png64("y") });
  const ok1 = await anna.warte("ok");
  const ok2 = await anna.warte("ok");
  const ok3 = await anna.warte("ok");
  const e1 = await ben.warte("eintrag");
  assert.deepEqual(ok1, { typ: "ok", kachel: "1,2", seq: e1.seq, nr: 7 });
  assert.deepEqual(ok2, { typ: "ok", kachel: "1,2", seq: e1.seq + 1, nr: 8 });
  assert.deepEqual(ok3, { typ: "ok", kachel: "3,3", seq: e1.seq + 2 });
  assert.equal(await ben.nichts("ok"), true, "ok geht nur an den Absender");
}));

test("abgelehnte Kachel: fehler mit nr, kein ok", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  await bereit(anna);
  anna.senden({ typ: "kachel", kachel: "1,1", png: png64("x", 600, 600), nr: 3 });
  const f = await anna.warte("fehler");
  assert.equal(f.nr, 3);
  assert.equal(await anna.nichts("ok"), true);
}));

test("Kachel erreicht nur dieselbe Flaeche", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  const ben = verbinde("g", "ben");
  const fremd = verbinde("andere", "ben");
  await bereit(anna, ben, fremd);
  anna.senden({ typ: "kachel", kachel: "0,0", png: png64("x") });
  await ben.warte("eintrag");
  assert.equal(await fremd.nichts("eintrag"), true);
}));

test("Autor kommt aus der Verbindung", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  const ben = verbinde("g", "ben");
  await bereit(anna, ben);
  anna.senden({ typ: "kachel", autor: "ben", kachel: "3,4", png: png64("y") });
  const e = await ben.warte("eintrag");
  assert.equal(e.autor, "anna");
}));

test("stand nach Neuverbindung enthaelt alle Kacheln und die Protokoll-Kennung", mitDienst(async ({ verbinde, protokoll }) => {
  const anna = verbinde("g", "anna");
  const ben = verbinde("g", "ben");
  await bereit(anna, ben);
  anna.senden({ typ: "kachel", kachel: "1,1", png: png64("a1") });
  anna.senden({ typ: "kachel", kachel: "1,1", png: png64("a2") });
  anna.senden({ typ: "kachel", kachel: "2,2", png: png64("a3") });
  ben.senden({ typ: "kachel", kachel: "1,1", png: png64("b1") });
  for (let i = 0; i < 3; i++) await ben.warte("eintrag");
  await anna.warte("eintrag");
  const st = await standVon(verbinde, "g", "carla");
  assert.equal(st.protokoll, protokoll());
  assert.match(st.protokoll, /^[a-z0-9-]{1,40}$/);
  assert.equal(st.kacheln.length, 3);
  assert.equal(st.seq, 4);
  const a11 = st.kacheln.find((k) => k.autor === "anna" && k.kachel === "1,1");
  assert.equal(a11.png, png64("a2"));
  assert.ok(st.kacheln.find((k) => k.autor === "ben" && k.kachel === "1,1"));
  assert.ok(st.kacheln.find((k) => k.autor === "anna" && k.kachel === "2,2"));
}));

test("seit liefert nur Fehlendes", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  const zuschauer = verbinde("g", "ben");
  const st = await bereit(anna, zuschauer);
  for (const k of ["0,0", "0,1", "0,2"]) anna.senden({ typ: "kachel", kachel: k, png: png64(k) });
  const e1 = await zuschauer.warte("eintrag");
  await zuschauer.warte("eintrag");
  await zuschauer.warte("eintrag");
  const neu = verbinde("g", "carla");
  await neu.offen();
  neu.senden({ typ: "hallo", seit: e1.seq, protokoll: st.protokoll });
  const a = await neu.warte("eintrag");
  const b = await neu.warte("eintrag");
  assert.deepEqual([a.kachel, b.kachel], ["0,1", "0,2"]);
  assert.ok(a.seq < b.seq && a.seq > e1.seq);
  assert.equal(await neu.nichts("eintrag"), true);
  assert.equal(await neu.nichts("stand"), true);
}));

test("Neuverbindung: angenommen mit seq kommt nach der Nachholung, auch wenn nichts fehlt", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  const st = await bereit(anna);
  anna.senden({ typ: "kachel", kachel: "0,0", png: png64("a"), nr: 1 });
  anna.senden({ typ: "kachel", kachel: "0,1", png: png64("b"), nr: 2 });
  const ok1 = await anna.warte("ok");
  await anna.warte("ok");
  // nichts fehlt: trotzdem eine Antwort, sonst wartet der Browser vergeblich
  const ben = verbinde("g", "ben");
  await ben.offen();
  ben.senden({ typ: "hallo", seit: ok1.seq + 1, protokoll: st.protokoll });
  const a1 = await ben.warte("angenommen");
  assert.deepEqual(a1, { typ: "angenommen", seq: ok1.seq + 1, schutz: [] });
  // mit Nachholung: angenommen erst nach dem letzten nachgeholten Eintrag
  const carla = verbinde("g", "carla");
  const reihenfolge = [];
  carla.ws.on("message", (d) => reihenfolge.push(JSON.parse(d.toString()).typ));
  await carla.offen();
  carla.senden({ typ: "hallo", seit: 0, protokoll: st.protokoll });
  await carla.warte("angenommen");
  assert.deepEqual(reihenfolge.filter((t) => t !== "anwesend"), ["eintrag", "eintrag", "angenommen"]);
  // frisches Fenster und ersetztes Protokoll: Antwort ist stand, kein angenommen
  const dora = verbinde("g", "dora");
  await dora.offen();
  dora.senden({ typ: "hallo", seit: null });
  await dora.warte("stand");
  assert.equal(await dora.nichts("angenommen"), true);
}));

test("Protokoll-Kennung passt nicht: frischer stand statt Nachholung", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  const st0 = await bereit(anna);
  anna.senden({ typ: "kachel", kachel: "0,0", png: png64("a") });
  anna.senden({ typ: "kachel", kachel: "0,1", png: png64("b") });
  await anna.warte("ok");
  await anna.warte("ok");
  for (const protokoll of ["anderes-protokoll", undefined, null, 5]) {
    const ben = verbinde("g", "ben", "fenster-ben"); // dasselbe Fenster verbindet sich neu
    await ben.offen();
    ben.senden({ typ: "hallo", seit: 1, protokoll });
    const st = await ben.warte("stand");
    assert.equal(st.protokoll, st0.protokoll, String(protokoll));
    assert.equal(st.seq, 2);
    assert.equal(st.kacheln.length, 2);
    assert.equal(await ben.nichts("eintrag"), true, "keine Nachholung zusaetzlich zum stand");
    ben.ws.close();
    await ben.geschlossen();
  }
}));

test("seit liegt hinter dem Protokoll: frischer stand", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  const st0 = await bereit(anna);
  anna.senden({ typ: "kachel", kachel: "0,0", png: png64("a") });
  await anna.warte("ok");
  const ben = verbinde("g", "ben");
  await ben.offen();
  ben.senden({ typ: "hallo", seit: 99, protokoll: st0.protokoll });
  const st = await ben.warte("stand");
  assert.equal(st.seq, 1);
  assert.equal(st.kacheln.length, 1);
  // gleiche Kennung und seit = Hoechststand: keine Antwort ausser der leeren Nachholung
  const carla = verbinde("g", "carla");
  await carla.offen();
  carla.senden({ typ: "hallo", seit: 1, protokoll: st0.protokoll });
  assert.equal(await carla.nichts("stand", 200), true);
  assert.equal(await carla.nichts("eintrag", 10), true);
}));

test("hallo mit ungueltigem seit: fehler", mitDienst(async ({ verbinde }) => {
  const c = verbinde("g", "anna");
  await c.offen();
  for (const seit of ["1", 1.5, -1, {}, undefined]) {
    c.senden({ typ: "hallo", seit });
    await c.warte("fehler");
  }
  assert.equal(await c.nichts("stand"), true);
}));

test("frisch geladenes Fenster derselben Person schliesst das erste mit 4409", mitDienst(async ({ verbinde }) => {
  const alt = verbinde("g", "anna");
  await bereit(alt);
  const geschlossen = alt.geschlossen();
  const neu = verbinde("g", "anna");
  await bereit(neu);
  const z = await geschlossen;
  assert.equal(z.code, 4409);
  assert.equal(z.grund, HINWEIS);
  const ben = verbinde("g", "ben");
  await bereit(ben);
  neu.senden({ typ: "kachel", kachel: "5,5", png: png64("n") });
  assert.equal((await ben.warte("eintrag")).autor, "anna");
}));

test("veraltetes Fenster: Neuverbindung nach Uebernahme wird mit 4409 abgewiesen, nichts gespeichert", mitDienst(async ({ verbinde }) => {
  const ben = verbinde("g", "ben");
  await bereit(ben);
  const a = verbinde("g", "anna", "fenster-a");
  const st = await bereit(a);
  a.ws.terminate(); // Funkloch: A ist weg, ohne beendet zu sein
  await a.geschlossen();
  const a2 = verbinde("g", "anna", "fenster-a2");
  await bereit(a2);
  a2.senden({ typ: "kachel", kachel: "2,2", png: png64("frisch") });
  await a2.warte("ok");
  const frisch = await ben.warte("eintrag");
  // A kommt zurueck und schickt sofort seine veralteten Kacheln hinterher
  const aWieder = verbinde("g", "anna", "fenster-a");
  await aWieder.offen();
  aWieder.senden({ typ: "hallo", seit: st.seq, protokoll: st.protokoll });
  aWieder.senden({ typ: "kachel", kachel: "2,2", png: png64("alt"), nr: 1 });
  const z = await aWieder.geschlossen();
  assert.equal(z.code, 4409);
  assert.equal(z.grund, HINWEIS);
  assert.equal(await ben.nichts("eintrag", 200), true, "nichts von A verteilt");
  assert.equal(a2.istZu(), null, "das aktuelle Fenster bleibt verbunden");
  const stand = await standVon(verbinde, "g", "carla");
  assert.equal(stand.seq, frisch.seq);
  assert.deepEqual(stand.kacheln.map((k) => [k.autor, k.kachel, k.png]), [["anna", "2,2", png64("frisch")]]);
  // A2 schreibt weiter
  a2.senden({ typ: "kachel", kachel: "3,3", png: png64("weiter") });
  assert.equal((await a2.warte("ok")).kachel, "3,3");
}));

test("Neuverbindung des aktuellen Fensters wird angenommen", mitDienst(async ({ verbinde }) => {
  const ben = verbinde("g", "ben");
  await bereit(ben);
  const a = verbinde("g", "anna", "fenster-a");
  const st = await bereit(a);
  a.ws.terminate();
  await a.geschlossen();
  ben.senden({ typ: "kachel", kachel: "1,1", png: png64("b") });
  await ben.warte("ok");
  const aWieder = verbinde("g", "anna", "fenster-a");
  await aWieder.offen();
  aWieder.senden({ typ: "hallo", seit: st.seq, protokoll: st.protokoll });
  aWieder.senden({ typ: "kachel", kachel: "2,2", png: png64("a"), nr: 4 });
  assert.equal((await aWieder.warte("eintrag")).kachel, "1,1");
  assert.equal((await aWieder.warte("ok")).nr, 4);
  assert.equal((await ben.warte("eintrag")).autor, "anna");
}));

test("veraltetes Fenster bleibt veraltet ueber einen Neustart des Dienstes", mitDienst(async ({ verbinde, neustart }) => {
  const a = verbinde("g", "anna", "fenster-a");
  const st = await bereit(a);
  const a2 = verbinde("g", "anna", "fenster-a2");
  await bereit(a2);
  await a.geschlossen();
  await neustart();
  const aWieder = verbinde("g", "anna", "fenster-a");
  await aWieder.offen();
  aWieder.senden({ typ: "hallo", seit: st.seq, protokoll: st.protokoll });
  assert.equal((await aWieder.geschlossen()).code, 4409);
  const a2Wieder = verbinde("g", "anna", "fenster-a2");
  await a2Wieder.offen();
  a2Wieder.senden({ typ: "hallo", seit: st.seq, protokoll: st.protokoll });
  a2Wieder.senden({ typ: "kachel", kachel: "1,1", png: png64("x") });
  await a2Wieder.warte("ok");
}));

test("ungueltige Kennung wird mit 1008 geschlossen", mitDienst(async ({ verbinde, port }) => {
  for (const [f, p, w] of [["G", "anna", "w"], ["g", "an na", "w"], ["g", "", "w"], ["", "anna", "w"], ["g", "x".repeat(41), "w"], ["g%00", "anna", "w"],
    ["g", "anna", ""], ["g", "anna", "W1"], ["g", "anna", "x".repeat(41)]]) {
    const c = verbinde(f, p, w);
    const z = await c.geschlossen();
    assert.equal(z.code, 1008, `${f}/${p}/${w}`);
  }
  const ohne = new WebSocket(`ws://127.0.0.1:${port()}/?flaeche=g&person=anna`);
  const code = await new Promise((res) => { ohne.on("close", (c) => res(c)); ohne.on("error", () => {}); });
  assert.equal(code, 1008, "fenster fehlt");
}));

test("ungueltige Nachricht: fehler, nichts gespeichert", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  const ben = verbinde("g", "ben");
  await bereit(anna, ben);
  const schlecht = [
    { typ: "kachel", kachel: "40,0", png: png64("x") },
    { typ: "kachel", kachel: "01,2", png: png64("x") },
    { typ: "kachel", kachel: "1,1", png: Buffer.from("kein png").toString("base64") },
    { typ: "kachel", kachel: "1,1", png: png64("x", 600, 600) },
    { typ: "kachel", kachel: "1,1", png: png64("x", 30000, 30000) },
    { typ: "kachel", kachel: "1,1", png: "" },
    { typ: "kachel", kachel: "1,1" },
    { typ: "kachel", kachel: "1,1", png: "A".repeat(800000) },
    { typ: "unbekannt" },
    [1, 2],
    "irgendwas",
    "{kaputt",
  ];
  for (const s of schlecht) {
    anna.senden(typeof s === "string" ? s : JSON.stringify(s));
    const f = await anna.warte("fehler");
    assert.equal(typeof f.grund, "string");
  }
  assert.equal(await ben.nichts("eintrag"), true);
  assert.equal(await anna.nichts("ok", 10), true);
  const st = await standVon(verbinde, "g", "carla");
  assert.deepEqual(st.kacheln, []);
  assert.equal(st.seq, 0);
}));

test("Kachel mit png null (Loeschen) wird verteilt", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  const ben = verbinde("g", "ben");
  await bereit(anna, ben);
  anna.senden({ typ: "kachel", kachel: "1,1", png: png64("x") });
  await ben.warte("eintrag");
  anna.senden({ typ: "kachel", kachel: "1,1", png: null });
  const e = await ben.warte("eintrag");
  assert.equal(e.png, null);
  const st = await standVon(verbinde, "g", "carla");
  assert.deepEqual(st.kacheln, []);
}));

test("Kachel vor hallo: fehler, nichts gespeichert oder verteilt", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  const ben = verbinde("g", "ben");
  await anna.offen();
  await bereit(ben);
  anna.senden({ typ: "kachel", kachel: "7,7", png: png64("v"), nr: 1 });
  const f = await anna.warte("fehler");
  assert.match(f.grund, /hallo/);
  assert.equal(f.nr, 1);
  assert.equal(await ben.nichts("eintrag"), true);
  assert.equal(await anna.nichts("ok", 10), true);
  const st = await standVon(verbinde, "g", "carla");
  assert.equal(st.kacheln.length, 0);
  assert.equal(st.seq, 0);
  // nach hallo wird angenommen
  anna.senden({ typ: "hallo", seit: null });
  await anna.warte("stand");
  anna.senden({ typ: "kachel", kachel: "7,7", png: png64("v") });
  await anna.warte("ok");
}));

test("ueberlebt Neustart", mitDienst(async ({ verbinde, neustart, protokoll }) => {
  const anna = verbinde("g", "anna");
  const ben = verbinde("g", "ben");
  await bereit(anna, ben);
  anna.senden({ typ: "kachel", kachel: "1,1", png: png64("p1") });
  anna.senden({ typ: "kachel", kachel: "2,3", png: png64("p2") });
  await ben.warte("eintrag");
  await ben.warte("eintrag");
  const vorher = await standVon(verbinde, "g", "carla");
  const kennung = protokoll();
  await neustart();
  assert.equal(protokoll(), kennung, "Protokoll-Kennung bleibt ueber den Neustart");
  const nachher = await standVon(verbinde, "g", "dora");
  assert.deepEqual(nachher, vorher);
  assert.equal(nachher.kacheln.length, 2);
}));

test("alte Verbindung nach Uebernahme: spaete Kachel wird ignoriert", mitDienst(async ({ verbinde }) => {
  const ben = verbinde("g", "ben");
  await bereit(ben);
  const alt = verbinde("g", "anna");
  await bereit(alt);
  alt.ws._socket.pause(); // alt hat den Close-Rahmen noch nicht gesehen
  const neu = verbinde("g", "anna");
  await bereit(neu);
  alt.senden({ typ: "kachel", kachel: "1,1", png: png64("spaet") });
  assert.equal(await ben.nichts("eintrag", 300), true);
  assert.equal(await neu.nichts("eintrag", 10), true);
  const st = await standVon(verbinde, "g", "carla");
  assert.deepEqual(st.kacheln, []);
  assert.equal(st.seq, 0);
}));

test("Eintraege vor hallo kommen genau einmal, im stand", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  const ben = verbinde("g", "ben");
  await anna.offen();
  await bereit(ben);
  ben.senden({ typ: "kachel", kachel: "1,1", png: png64("b1") });
  ben.senden({ typ: "kachel", kachel: "2,2", png: png64("b2") });
  await ben.warte("ok");
  await ben.warte("ok");
  const st0 = await standVon(verbinde, "g", "carla");
  assert.equal(st0.kacheln.length, 2);
  anna.senden({ typ: "hallo", seit: null });
  const st = await anna.warte("stand");
  assert.equal(st.kacheln.length, 2);
  assert.equal(await anna.nichts("eintrag"), true);
}));

test("seit: streng steigende seq ohne Doppelte bei gleichzeitigem Schreiben", mitDienst(async ({ verbinde, protokoll }) => {
  const ben = verbinde("g", "ben");
  await bereit(ben);
  const anna = verbinde("g", "anna");
  await anna.offen();
  const N = 40;
  for (let i = 0; i < 10; i++) ben.senden({ typ: "kachel", kachel: `${i},0`, png: png64(`v${i}`) });
  for (let i = 0; i < 10; i++) await ben.warte("ok");
  anna.senden({ typ: "hallo", seit: 0, protokoll: protokoll() });
  for (let i = 10; i < N; i++) ben.senden({ typ: "kachel", kachel: `${i % 40},1`, png: png64(`n${i}`) });
  const seqs = [];
  while (seqs.length < N) seqs.push((await anna.warte("eintrag")).seq);
  assert.deepEqual(seqs, Array.from({ length: N }, (_, i) => i + 1));
  assert.equal(await anna.nichts("eintrag"), true);
}));

test("anderer Pfad als / wird mit 1008 geschlossen", mitDienst(async ({ port }) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port()}/x?flaeche=g&person=anna&fenster=w`);
  const code = await new Promise((res) => { ws.on("close", (c) => res(c)); ws.on("error", () => {}); });
  assert.equal(code, 1008);
}));

test("Herzschlag: Verbindung ohne pong wird beendet, lebende bleibt", mitDienst(async ({ verbinde }) => {
  const tot = verbinde("g", "anna", "fenster-tot", { autoPong: false });
  const lebt = verbinde("g", "ben");
  await bereit(tot, lebt);
  const z = await tot.geschlossen(2000);
  assert.equal(z.code, 1006, "terminate ohne Close-Rahmen");
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(lebt.istZu(), null);
  // der beendete Platz ist frei: anna kann frisch laden, ohne dass jemand 4409 bekommt
  const neu = verbinde("g", "anna");
  await bereit(neu);
  assert.equal(neu.istZu(), null);
}, { herzschlagMs: 60 }));

// Live-Zeiger und Anwesenheit: fluechtig, nie gespeichert.
test("Zeiger von anna erreicht ben mit Autor aus der Verbindung, nicht anna, nichts gespeichert", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  const ben = verbinde("g", "ben");
  await bereit(anna, ben);
  anna.senden({ typ: "zeiger", autor: "ben", x: 1200.5, y: 33 });
  assert.deepEqual(await ben.warte("zeiger"), { typ: "zeiger", autor: "anna", x: 1200.5, y: 33 });
  assert.equal(await anna.nichts("zeiger"), true);
  assert.equal(await anna.nichts("fehler"), true);
  const st = await standVon(verbinde, "g", "carl");
  assert.deepEqual(st.kacheln, []);
}));

test("Zeiger weg wird verteilt", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  const ben = verbinde("g", "ben");
  await bereit(anna, ben);
  // weg direkt nach einem Punkt: wird nicht gedrosselt, sonst bliebe der Zeiger drueben stehen
  anna.senden({ typ: "zeiger", x: 7, y: 7 });
  anna.senden({ typ: "zeiger", weg: true });
  assert.equal((await ben.warte("zeiger")).x, 7);
  assert.deepEqual(await ben.warte("zeiger"), { typ: "zeiger", autor: "anna", weg: true });
}));

test("ungueltiger Zeiger wird nicht verteilt", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  const ben = verbinde("g", "ben");
  await bereit(anna, ben);
  for (const schlecht of [{ x: "1", y: 2 }, { x: 1 }, { x: -1, y: 2 }, { x: 1, y: 20481 }, { x: null, y: 1 }, { weg: false }]) {
    anna.senden({ typ: "zeiger", ...schlecht });
  }
  anna.senden({ typ: "zeiger", x: 20480, y: 0 });
  assert.deepEqual(await ben.warte("zeiger"), { typ: "zeiger", autor: "anna", x: 20480, y: 0 });
  assert.equal(await ben.nichts("zeiger"), true);
}));

test("Zeiger vor hallo und von anderer Flaeche wird nicht verteilt", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  const ben = verbinde("g", "ben");
  const fremd = verbinde("andere", "carl");
  await bereit(ben, fremd);
  await anna.offen();
  anna.senden({ typ: "zeiger", x: 5, y: 5 });
  fremd.senden({ typ: "zeiger", x: 6, y: 6 });
  assert.equal(await ben.nichts("zeiger"), true);
}));

test("Zeiger: hoechstens einer je 25 ms und Verbindung wird verteilt", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  const ben = verbinde("g", "ben");
  await bereit(anna, ben);
  anna.senden({ typ: "zeiger", x: 1, y: 1 });
  anna.senden({ typ: "zeiger", x: 2, y: 2 });
  assert.equal((await ben.warte("zeiger")).x, 1);
  assert.equal(await ben.nichts("zeiger", 60), true);
  anna.senden({ typ: "zeiger", x: 3, y: 3 });
  assert.equal((await ben.warte("zeiger")).x, 3);
}));

test("anwesend: nach hallo und nach dem Trennen an alle der Flaeche, sortiert", mitDienst(async ({ verbinde }) => {
  const ben = verbinde("g", "ben");
  await bereit(ben);
  assert.deepEqual((await ben.warte("anwesend")).personen, ["ben"]);
  const anna = verbinde("g", "anna");
  await bereit(anna);
  assert.deepEqual((await ben.warte("anwesend")).personen, ["anna", "ben"]);
  assert.deepEqual((await anna.warte("anwesend")).personen, ["anna", "ben"]);
  const fremd = verbinde("andere", "carl");
  await bereit(fremd);
  assert.deepEqual((await fremd.warte("anwesend")).personen, ["carl"]);
  assert.equal(await ben.nichts("anwesend"), true);
  anna.ws.close();
  assert.deepEqual((await ben.warte("anwesend")).personen, ["ben"]);
}));

test("anwesend: Uebernahme durch ein neues Fenster laesst die Person anwesend", mitDienst(async ({ verbinde }) => {
  const ben = verbinde("g", "ben");
  const anna1 = verbinde("g", "anna");
  await bereit(ben, anna1);
  await ben.warte("anwesend");
  assert.deepEqual((await ben.warte("anwesend")).personen, ["anna", "ben"]);
  const anna2 = verbinde("g", "anna");
  await bereit(anna2);
  await anna1.geschlossen();
  assert.deepEqual((await anna2.warte("anwesend")).personen, ["anna", "ben"]);
  assert.deepEqual((await ben.warte("anwesend")).personen, ["anna", "ben"]);
  assert.equal(await ben.nichts("anwesend"), true, "das Schliessen des alten Fensters meldet niemanden ab");
}));

// ---------------------------------------------------------------- Ausweis, Namen, Plaetze, Schutzfelder
const SCHLUESSEL = "testschluessel-nur-fuer-den-test-0123456789abcdef-xyz";
const GRUPPE = "g-7";
const ANNA = "p0123456789abcdef01234567";
const BEN = "pfedcba9876543210fedcba98";
const dienstKopf = createHash("sha256").update(`abgleich-dienst:${SCHLUESSEL}`).digest("hex");
const mitSchluessel = (fn) => mitDienst(fn, { schluessel: SCHLUESSEL, offen: false });
const jetztS = () => Math.floor(Date.now() / 1000);
const ausweisQuery = (flaeche, person, name, ablauf = jetztS() + 120) =>
  `&ausweis=${encodeURIComponent(stelleAusweis(SCHLUESSEL, flaeche, person, name, ablauf))}`;
const http = (port, methode, pfad, koerper, kopf = {}) =>
  fetch(`http://127.0.0.1:${port}${pfad}`, {
    method: methode,
    headers: { "content-type": "application/json", ...kopf },
    body: koerper === undefined ? undefined : JSON.stringify(koerper),
  });
const mitKopf = { "x-abgleich-dienst": dienstKopf };

test("ohne_ausweis_1008_mit_schluessel", mitSchluessel(async ({ verbinde }) => {
  const c = verbinde(GRUPPE, ANNA);
  assert.equal((await c.geschlossen()).code, 1008);
  const falsch = verbinde(GRUPPE, ANNA, neuesFenster(), {}, "&ausweis=quatsch.quatsch");
  assert.equal((await falsch.geschlossen()).code, 1008);
  const abgelaufen = verbinde(GRUPPE, ANNA, neuesFenster(), {}, ausweisQuery(GRUPPE, ANNA, "Anna", jetztS() - 5));
  assert.equal((await abgelaufen.geschlossen()).code, 1008);
}));

test("ausweis_fremde_person_1008", mitSchluessel(async ({ verbinde }) => {
  const c = verbinde(GRUPPE, BEN, neuesFenster(), {}, ausweisQuery(GRUPPE, ANNA, "Anna"));
  assert.equal((await c.geschlossen()).code, 1008);
  const andere = verbinde("g-8", ANNA, neuesFenster(), {}, ausweisQuery(GRUPPE, ANNA, "Anna"));
  assert.equal((await andere.geschlossen()).code, 1008);
}));

test("mit_schluessel_nur_gruppen_und_personen_kennung", mitSchluessel(async ({ verbinde }) => {
  const c = verbinde("gruppe", "anna", neuesFenster(), {}, ausweisQuery("gruppe", "anna", "Anna"));
  assert.equal((await c.geschlossen()).code, 1008);
}));

test("anwesend_mit_namen", mitSchluessel(async ({ verbinde }) => {
  const anna = verbinde(GRUPPE, ANNA, neuesFenster(), {}, ausweisQuery(GRUPPE, ANNA, "Anna Ä."));
  const ben = verbinde(GRUPPE, BEN, neuesFenster(), {}, ausweisQuery(GRUPPE, BEN, "Ben"));
  await bereit(anna, ben);
  const a = await ben.warte("anwesend");
  assert.deepEqual(a.personen, [ANNA, BEN].sort());
  assert.equal(a.namen[ANNA], "Anna Ä.");
  assert.equal(a.namen[BEN], "Ben");
}));

test("ohne_schluessel_ist_der_name_die_person", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  await bereit(anna);
  assert.deepEqual((await anna.warte("anwesend")).namen, { anna: "anna" });
}));

test("platz_ist_je_person_fest", mitSchluessel(async ({ port, neustart }) => {
  const platz = async (person) => {
    const r = await http(port(), "POST", "/platz", { flaeche: GRUPPE, person }, mitKopf);
    assert.equal(r.status, 200);
    return (await r.json()).platz;
  };
  assert.equal(await platz(ANNA), 0);
  assert.equal(await platz(ANNA), 0);
  assert.equal(await platz(BEN), 1);
  const andere = await http(port(), "POST", "/platz", { flaeche: "g-8", person: BEN }, mitKopf);
  assert.equal((await andere.json()).platz, 0, "Plaetze zaehlen je Flaeche");
  await neustart();
  assert.equal(await platz(ANNA), 0);
  assert.equal(await platz(BEN), 1);
  const ungueltig = await http(port(), "POST", "/platz", { flaeche: "x y", person: ANNA }, mitKopf);
  assert.equal(ungueltig.status, 400);
}));

test("http_ohne_dienstkopf_403", mitSchluessel(async ({ port }) => {
  assert.equal((await http(port(), "POST", "/platz", { flaeche: GRUPPE, person: ANNA })).status, 403);
  assert.equal((await http(port(), "POST", "/platz", { flaeche: GRUPPE, person: ANNA }, { "x-abgleich-dienst": "00" })).status, 403);
  assert.equal((await http(port(), "PUT", "/schutz", { flaeche: GRUPPE, person: ANNA, felder: [] })).status, 403);
  assert.equal((await http(port(), "GET", "/irgendwas")).status, 403);
}));

test("healthz_ohne_kopf_200", mitSchluessel(async ({ port }) => {
  const r = await http(port(), "GET", "/healthz");
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
}));

test("schutz_ungueltig_400", mitSchluessel(async ({ port }) => {
  const put = (felder) => http(port(), "PUT", "/schutz", { flaeche: GRUPPE, person: BEN, felder }, mitKopf);
  assert.equal((await put([[0, 0, 10, 10]])).status, 204);
  assert.equal((await put([[0, 0, 10]])).status, 400);
  assert.equal((await put([[0, 0, 10, 1.5]])).status, 400);
  assert.equal((await put([[-1, 0, 10, 10]])).status, 400);
  assert.equal((await put([[0, 0, 20481, 10]])).status, 400);
  assert.equal((await put(Array.from({ length: 201 }, () => [0, 0, 1, 1]))).status, 400);
  assert.equal((await put(Array.from({ length: 200 }, () => [0, 0, 1, 1]))).status, 204);
  assert.equal((await put("nein")).status, 400);
  assert.equal((await http(port(), "PUT", "/schutz", { flaeche: "!", person: BEN, felder: [] }, mitKopf)).status, 400);
}));

async function mitSchutzfeldVonBen({ port, verbinde }) {
  const r = await http(port(), "PUT", "/schutz", { flaeche: GRUPPE, person: BEN, felder: [[1024, 0, 200, 200]] }, mitKopf);
  assert.equal(r.status, 204);
  const anna = verbinde(GRUPPE, ANNA, neuesFenster(), {}, ausweisQuery(GRUPPE, ANNA, "Anna"));
  const ben = verbinde(GRUPPE, BEN, neuesFenster(), {}, ausweisQuery(GRUPPE, BEN, "Ben"));
  await bereit(anna, ben);
  return { anna, ben };
}

test("fremde_tinte_im_schutzfeld_abgelehnt", mitSchluessel(async (ctx) => {
  const { anna } = await mitSchutzfeldVonBen(ctx);
  anna.senden({ typ: "kachel", kachel: "2,0", png: pngEcht64([[10, 10]]), nr: 5 });
  const f = await anna.warte("fehler");
  assert.equal(f.grund, "fremdes_ergebnisfeld");
  assert.equal(f.nr, 5);
  const db = new DatabaseSync(ctx.speicherPfad);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM eintraege").get().n, 0);
  db.close();
  anna.senden({ typ: "kachel", kachel: "2,0", png: pngEcht64([[400, 400]]), nr: 6 });
  assert.equal((await anna.warte("ok")).nr, 6);
}));

test("png_null_und_andere_kachel_sind_erlaubt", mitSchluessel(async (ctx) => {
  const { anna } = await mitSchutzfeldVonBen(ctx);
  anna.senden({ typ: "kachel", kachel: "2,0", png: null, nr: 1 });
  assert.equal((await anna.warte("ok")).nr, 1);
  anna.senden({ typ: "kachel", kachel: "3,0", png: pngEcht64([[10, 10]]), nr: 2 });
  assert.equal((await anna.warte("ok")).nr, 2);
}));

test("eigene_tinte_im_eigenen_schutzfeld_ok", mitSchluessel(async (ctx) => {
  const { ben } = await mitSchutzfeldVonBen(ctx);
  ben.senden({ typ: "kachel", kachel: "2,0", png: pngEcht64([[10, 10]]), nr: 1 });
  assert.equal((await ben.warte("ok")).nr, 1);
}));

test("schutz_gilt_nach_neustart_und_juengster_eintrag_zaehlt", mitSchluessel(async (ctx) => {
  await mitSchutzfeldVonBen(ctx);
  await ctx.neustart();
  const anna = ctx.verbinde(GRUPPE, ANNA, neuesFenster(), {}, ausweisQuery(GRUPPE, ANNA, "Anna"));
  await bereit(anna);
  anna.senden({ typ: "kachel", kachel: "2,0", png: pngEcht64([[10, 10]]), nr: 1 });
  assert.equal((await anna.warte("fehler")).grund, "fremdes_ergebnisfeld");
  const r = await http(ctx.port(), "PUT", "/schutz", { flaeche: GRUPPE, person: BEN, felder: [] }, mitKopf);
  assert.equal(r.status, 204);
  anna.senden({ typ: "kachel", kachel: "2,0", png: pngEcht64([[10, 10]]), nr: 2 });
  assert.equal((await anna.warte("ok")).nr, 2);
}));

test("stand_traegt_die_schutzfelder_der_flaeche", mitSchluessel(async (ctx) => {
  const r = await http(ctx.port(), "PUT", "/schutz", { flaeche: GRUPPE, person: BEN, felder: [[1024, 0, 200, 200]] }, mitKopf);
  assert.equal(r.status, 204);
  await http(ctx.port(), "PUT", "/schutz", { flaeche: "g-8", person: ANNA, felder: [[0, 0, 5, 5]] }, mitKopf);
  const anna = ctx.verbinde(GRUPPE, ANNA, neuesFenster(), {}, ausweisQuery(GRUPPE, ANNA, "Anna"));
  const st = await bereit(anna);
  assert.deepEqual(st.schutz, [{ person: BEN, felder: [[1024, 0, 200, 200]] }], "nur die Felder dieser Flaeche");
}));

test("put_schutz_geht_an_alle_fenster_der_flaeche", mitSchluessel(async (ctx) => {
  const { anna, ben } = await mitSchutzfeldVonBen(ctx);
  const andere = ctx.verbinde("g-8", ANNA, neuesFenster(), {}, ausweisQuery("g-8", ANNA, "Anna"));
  await bereit(andere);
  const felder = [[0, 0, 300, 300], [2048, 2048, 10, 10]];
  const r = await http(ctx.port(), "PUT", "/schutz", { flaeche: GRUPPE, person: BEN, felder }, mitKopf);
  assert.equal(r.status, 204);
  for (const c of [anna, ben]) {
    const m = await c.warte("schutz");
    assert.deepEqual(m, { typ: "schutz", person: BEN, felder });
  }
  assert.equal(await andere.nichts("schutz"), true, "andere Flaechen bekommen nichts");
  await http(ctx.port(), "PUT", "/schutz", { flaeche: GRUPPE, person: BEN, felder: [] }, mitKopf);
  assert.deepEqual(await anna.warte("schutz"), { typ: "schutz", person: BEN, felder: [] }, "auch das Aufheben");
}));

test("angenommen_traegt_die_schutzfelder_fuer_wiederverbundene_fenster", mitSchluessel(async (ctx) => {
  const anna = ctx.verbinde(GRUPPE, ANNA, neuesFenster(), {}, ausweisQuery(GRUPPE, ANNA, "Anna"));
  const st = await bereit(anna);
  anna.ws.terminate();
  // waehrend anna weg ist, bekommt ben ein Ergebnisfeld: die Meldung schutz erreicht anna nicht
  await http(ctx.port(), "PUT", "/schutz", { flaeche: GRUPPE, person: BEN, felder: [[0, 0, 64, 64]] }, mitKopf);
  const wieder = ctx.verbinde(GRUPPE, ANNA, anna.fenster, {}, ausweisQuery(GRUPPE, ANNA, "Anna"));
  await wieder.offen();
  wieder.senden({ typ: "hallo", seit: st.seq, protokoll: st.protokoll });
  const a = await wieder.warte("angenommen");
  assert.deepEqual(a.schutz, [{ person: BEN, felder: [[0, 0, 64, 64]] }]);
}));

test("start_ohne_schluessel_und_ohne_offen_exit_1", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "abgleich-start-"));
  try {
    const env = { ...process.env, ABGLEICH_DB: path.join(dir, "t.sqlite"), ABGLEICH_PORT: "0" };
    delete env.ABGLEICH_SCHLUESSEL;
    delete env.ABGLEICH_OFFEN;
    const kind = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "abgleich/dienst.mjs"], { env, stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    kind.stderr.on("data", (d) => { err += d; });
    const code = await new Promise((res) => {
      const t = setTimeout(() => { kind.kill(); res("haengt"); }, 10000);
      kind.on("exit", (c) => { clearTimeout(t); res(c); });
    });
    assert.equal(code, 1);
    assert.match(err, /ABGLEICH_SCHLUESSEL/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- Objekte und Live-Striche
const text = (extra = {}) => ({ art: "text", x: 10, y: 20, w: 100, h: 40, text: "Hallo", ...extra });

test("objekt_wird_verteilt_und_gespeichert", mitDienst(async ({ verbinde, speicherPfad }) => {
  const anna = verbinde("g", "anna");
  const ben = verbinde("g", "ben");
  await bereit(anna, ben);
  anna.senden({ typ: "objekt", id: "t-1", daten: text(), nr: 3 });
  const ok = await anna.warte("ok");
  assert.equal(ok.objekt, "t-1");
  assert.equal(ok.nr, 3);
  assert.ok(ok.seq > 0);
  const o = await ben.warte("objekt");
  assert.deepEqual(o, { typ: "objekt", seq: ok.seq, autor: "anna", id: "t-1", daten: text() });
  assert.equal(await anna.nichts("objekt"), true);
  const db = new DatabaseSync(speicherPfad);
  const z = db.prepare("SELECT art, kachel, daten FROM eintraege").get();
  assert.equal(z.art, "objekt");
  assert.equal(z.kachel, "t-1");
  assert.deepEqual(JSON.parse(z.daten), text());
  db.close();
  const spaet = await standVon(verbinde, "g", "carl");
  assert.deepEqual(spaet.objekte, [{ autor: "anna", id: "t-1", seq: ok.seq, daten: text() }]);
}));

test("objekt_geloescht_fehlt_im_stand", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  const ben = verbinde("g", "ben");
  await bereit(anna, ben);
  anna.senden({ typ: "objekt", id: "t-1", daten: text() });
  await anna.warte("ok");
  anna.senden({ typ: "objekt", id: "t-1", daten: null, nr: 2 });
  assert.equal((await anna.warte("ok")).nr, 2);
  await ben.warte("objekt");
  const geloescht = await ben.warte("objekt");
  assert.equal(geloescht.daten, null);
  assert.deepEqual((await standVon(verbinde, "g", "carl")).objekte, []);
}));

test("objekt_fremder_autor_nicht_ueberschreibbar", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  const ben = verbinde("g", "ben");
  await bereit(anna, ben);
  anna.senden({ typ: "objekt", id: "x", daten: text({ text: "anna" }) });
  ben.senden({ typ: "objekt", id: "x", daten: text({ text: "ben" }) });
  await anna.warte("ok");
  await ben.warte("ok");
  ben.senden({ typ: "objekt", id: "x", daten: null });
  await ben.warte("ok");
  const st = await standVon(verbinde, "g", "carl");
  assert.deepEqual(st.objekte.map((o) => [o.autor, o.id, o.daten.text]), [["anna", "x", "anna"]]);
}));

test("objekt_ungueltig_abgelehnt", mitDienst(async ({ verbinde, speicherPfad }) => {
  const anna = verbinde("g", "anna");
  await bereit(anna);
  const bad = [
    { id: "a b", daten: text() },
    { id: "", daten: text() },
    { id: "x".repeat(81), daten: text() },
    { id: "x" },
    { id: "x", daten: [] },
    { id: "x", daten: "text" },
    { id: "x", daten: { x: 1, y: 1, w: 1, h: 1 } },
    { id: "x", daten: text({ x: "1" }) },
    { id: "x", daten: text({ w: null }) },
    { id: "x", daten: text({ art: 5 }) },
  ];
  let nr = 1;
  for (const b of bad) {
    anna.senden({ typ: "objekt", nr, ...b });
    const f = await anna.warte("fehler");
    assert.equal(f.nr, nr, JSON.stringify(b));
    nr++;
  }
  const db = new DatabaseSync(speicherPfad);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM eintraege").get().n, 0);
  db.close();
}));

test("objekt_zu_gross_abgelehnt", mitDienst(async ({ verbinde, speicherPfad }) => {
  const anna = verbinde("g", "anna");
  await bereit(anna);
  anna.senden({ typ: "objekt", id: "gross", daten: text({ bild: "a".repeat(900001) }), nr: 1 });
  assert.equal((await anna.warte("fehler")).nr, 1);
  anna.senden({ typ: "objekt", id: "knapp", daten: text({ bild: "a".repeat(890000) }), nr: 2 });
  assert.equal((await anna.warte("ok")).nr, 2);
  const db = new DatabaseSync(speicherPfad);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM eintraege").get().n, 1);
  db.close();
}));

test("objekt_vor_hallo_fehler", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  await anna.offen();
  anna.senden({ typ: "objekt", id: "x", daten: text(), nr: 1 });
  assert.equal((await anna.warte("fehler")).nr, 1);
}));

test("fremdes_objekt_im_schutzfeld_abgelehnt", mitSchluessel(async (ctx) => {
  const { anna, ben } = await mitSchutzfeldVonBen(ctx);
  // Bens Feld: x 1024..1224, y 0..200
  anna.senden({ typ: "objekt", id: "t", daten: text({ x: 1100, y: 100, w: 50, h: 50 }), nr: 1 });
  const f = await anna.warte("fehler");
  assert.equal(f.grund, "fremdes_ergebnisfeld");
  assert.equal(f.nr, 1);
  anna.senden({ typ: "objekt", id: "t", daten: text({ x: 900, y: 150, w: 200, h: 100 }), nr: 2 }); // Rand ragt hinein
  assert.equal((await anna.warte("fehler")).grund, "fremdes_ergebnisfeld");
  anna.senden({ typ: "objekt", id: "t", daten: text({ x: 1224, y: 0, w: 50, h: 50 }), nr: 3 }); // beruehrt nur
  assert.equal((await anna.warte("ok")).nr, 3);
  anna.senden({ typ: "objekt", id: "t", daten: null, nr: 4 }); // Loeschen bleibt erlaubt
  assert.equal((await anna.warte("ok")).nr, 4);
  ben.senden({ typ: "objekt", id: "b", daten: text({ x: 1100, y: 100, w: 50, h: 50 }), nr: 5 });
  assert.equal((await ben.warte("ok")).nr, 5);
}));

test("nachholung_mischt_kacheln_und_objekte_in_seq", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  const ben = verbinde("g", "ben");
  const st = await bereit(anna, ben);
  const seqStand = st.seq;
  anna.senden({ typ: "kachel", kachel: "1,1", png: png64("a"), nr: 1 });
  const s1 = (await anna.warte("ok")).seq;
  anna.senden({ typ: "objekt", id: "t", daten: text(), nr: 2 });
  const s2 = (await anna.warte("ok")).seq;
  anna.senden({ typ: "kachel", kachel: "2,2", png: png64("b"), nr: 3 });
  const s3 = (await anna.warte("ok")).seq;
  ben.ws.terminate();
  const ben2 = verbinde("g", "ben", ben.fenster);
  await ben2.offen();
  const empfangen = [];
  ben2.ws.on("message", (d) => empfangen.push(JSON.parse(d.toString())));
  ben2.senden({ typ: "hallo", seit: seqStand, protokoll: st.protokoll });
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(empfangen.some((m) => m.typ === "angenommen"));
  const folge = empfangen.filter((m) => m.typ === "eintrag" || m.typ === "objekt").map((m) => [m.typ, m.seq]);
  assert.deepEqual(folge, [["eintrag", s1], ["objekt", s2], ["eintrag", s3]]);
  assert.deepEqual(empfangen.find((m) => m.typ === "objekt").daten, text());
}));

test("live_wird_weitergereicht_nicht_gespeichert", mitDienst(async ({ verbinde, speicherPfad }) => {
  const anna = verbinde("g", "anna");
  const ben = verbinde("g", "ben");
  await bereit(anna, ben);
  const punkte = [[1, 2, 0.5], [3, 4, 0.6]];
  anna.senden({ typ: "live", strich: "s1", punkte, farbe: "#ff0000", staerke: 3, autor: "ben" });
  const l = await ben.warte("live");
  assert.deepEqual(l, { typ: "live", autor: "anna", strich: "s1", punkte, farbe: "#ff0000", staerke: 3 });
  assert.equal(await anna.nichts("live"), true);
  const db = new DatabaseSync(speicherPfad);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM eintraege").get().n, 0);
  db.close();
}));

test("live_ungueltig_wird_verworfen", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  const ben = verbinde("g", "ben");
  await bereit(anna, ben);
  const ok = { typ: "live", strich: "s", punkte: [[1, 2, 3]], farbe: "red", staerke: 2 };
  const bad = [
    { ...ok, strich: "s".repeat(41) }, { ...ok, strich: 5 }, { ...ok, punkte: Array.from({ length: 201 }, () => [1, 2, 3]) },
    { ...ok, punkte: [[1, 2]] }, { ...ok, punkte: [[1, "2", 3]] }, { ...ok, punkte: "x" },
    { ...ok, farbe: "f".repeat(33) }, { ...ok, farbe: 1 }, { ...ok, staerke: "3" }, { ...ok, staerke: Infinity },
  ];
  for (const b of bad) anna.senden(b);
  assert.equal(await ben.nichts("live", 300), true);
  anna.senden(ok);
  assert.equal((await ben.warte("live")).strich, "s");
}));

test("live_gedrosselt_ende_nicht", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  const ben = verbinde("g", "ben");
  await bereit(anna, ben);
  const empfangen = [];
  ben.ws.on("message", (d) => { const m = JSON.parse(d.toString()); if (m.typ === "live") empfangen.push(m); });
  const live = (extra) => ({ typ: "live", strich: "s", punkte: [[1, 2, 3]], farbe: "#000", staerke: 2, ...extra });
  for (let i = 0; i < 5; i++) anna.senden(live({ punkte: [[i, i, 1]] }));
  anna.senden(live({ punkte: [], ende: true }));
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(empfangen.filter((m) => !m.ende).length, 1, "Burst wird auf eine Nachricht gedrosselt");
  assert.equal(empfangen.at(-1).ende, true);
  await new Promise((r) => setTimeout(r, 60));
  anna.senden(live());
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(empfangen.filter((m) => !m.ende).length, 2, "nach 40 ms geht wieder eine durch");
}));

test("live_vor_hallo_und_andere_flaeche_nicht_verteilt", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  const ben = verbinde("g", "ben");
  const carl = verbinde("h", "carl");
  await bereit(ben, carl);
  await anna.offen();
  anna.senden({ typ: "live", strich: "s", punkte: [[1, 2, 3]], farbe: "#000", staerke: 2 });
  assert.equal(await ben.nichts("live", 200), true);
  assert.equal(await carl.nichts("live", 50), true);
}));

test("schluessel_mit_crlf_wird_getrimmt", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "abgleich-trim-"));
  try {
    const d = await starteDienst({ port: 0, host: "127.0.0.1", speicherPfad: path.join(dir, "t.sqlite"), schluessel: `${SCHLUESSEL}\r\n` });
    const r = await http(d.port, "POST", "/platz", { flaeche: GRUPPE, person: ANNA }, mitKopf);
    assert.equal(r.status, 200, "Kopf aus dem getrimmten Schluessel");
    const c = client(d.port, GRUPPE, ANNA, neuesFenster(), {}, ausweisQuery(GRUPPE, ANNA, "Anna"));
    await c.offen();
    c.senden({ typ: "hallo", seit: null });
    await c.warte("stand");
    c.ws.terminate();
    await d.schliessen();
    await assert.rejects(starteDienst({ port: 0, host: "127.0.0.1", speicherPfad: path.join(dir, "u.sqlite"), schluessel: `${"k".repeat(31)}\r\n` }), /mindestens 32/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- tief verschachtelte Objektdaten
const verschachtelt = (stufen) => {
  let w = 1;
  for (let i = 0; i < stufen; i++) w = [w];
  return w;
};

test("objekt_tief_verschachtelt_abgelehnt_dienst_lebt", mitDienst(async ({ verbinde, port }) => {
  const anna = verbinde("g", "anna");
  await bereit(anna);
  for (const [i, tiefe] of [5000, 20000, 200000].entries()) {
    // als Rohtext gebaut: kein rekursives stringify im Test
    const roh = `{"typ":"objekt","id":"t","nr":${i + 1},"daten":{"art":"text","x":1,"y":1,"w":1,"h":1,"n":${"[".repeat(tiefe)}1${"]".repeat(tiefe)}}}`;
    anna.senden(roh);
    const f = await anna.warte("fehler");
    assert.equal(f.nr, i + 1);
  }
  anna.senden({ typ: "objekt", id: "ok", daten: text(), nr: 9 });
  assert.equal((await anna.warte("ok")).nr, 9);
  assert.equal((await fetch(`http://127.0.0.1:${port()}/healthz`)).status, 200);
}));

test("objekt_zu_viele_werte_abgelehnt", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  await bereit(anna);
  anna.senden({ typ: "objekt", id: "t", daten: text({ n: Array.from({ length: 20001 }, () => 1) }), nr: 1 });
  assert.equal((await anna.warte("fehler")).nr, 1);
  anna.senden({ typ: "objekt", id: "t", daten: text({ n: Array.from({ length: 5000 }, () => 1) }), nr: 2 });
  assert.equal((await anna.warte("ok")).nr, 2);
}));

test("objekt_tiefe_am_limit_ok_und_im_stand_nach_neuverbindung", mitDienst(async ({ verbinde }) => {
  const anna = verbinde("g", "anna");
  await bereit(anna);
  // daten = Ebene 1, das Feld n traegt die uebrigen Ebenen bis MAX_OBJEKT_TIEFE
  const am = text({ n: verschachtelt(MAX_OBJEKT_TIEFE - 1) });
  anna.senden({ typ: "objekt", id: "t", daten: am, nr: 1 });
  assert.equal((await anna.warte("ok")).nr, 1);
  anna.senden({ typ: "objekt", id: "u", daten: text({ n: verschachtelt(MAX_OBJEKT_TIEFE) }), nr: 2 });
  assert.equal((await anna.warte("fehler")).nr, 2);
  const st = await standVon(verbinde, "g", "ben");
  assert.deepEqual(st.objekte.map((o) => o.id), ["t"]);
  assert.deepEqual(st.objekte[0].daten, am);
}));

test("fehler_im_nachrichtenhandler_toetet_den_prozess_nicht", mitDienst(async ({ verbinde, port }) => {
  const anna = verbinde("g", "anna");
  await bereit(anna);
  const roh1 = JSON.stringify({ typ: "objekt", id: "t", daten: text(), nr: 1 });
  const orig = JSON.stringify;
  // eine Nachricht, deren Verarbeitung wirft, darf den Dienst nicht beenden
  let aufrufe = 0;
  JSON.stringify = (...a) => {
    // 1. Aufruf: Pruefung der Daten (laeuft durch), 2.: Antwort an den Absender (wirft)
    if (++aufrufe < 2) return orig(...a);
    JSON.stringify = orig;
    throw new RangeError("Maximum call stack size exceeded");
  };
  anna.senden(roh1);
  const f = await anna.warte("fehler");
  JSON.stringify = orig;
  assert.equal(f.grund, "Nachricht nicht verarbeitbar");
  anna.senden({ typ: "objekt", id: "t", daten: text(), nr: 2 });
  assert.equal((await anna.warte("ok")).nr, 2);
  assert.equal((await fetch(`http://127.0.0.1:${port()}/healthz`)).status, 200);
}));
