"use strict";
// Gruppenflaeche, Abschlusspruefung A (Wichtig 2): fremde Ergebnisfelder sperren die eigene Kachel nicht mehr.
// 1. Verhindern: vor dem Kodieren wird eigene Tinte in fremden Schutzfeldern entfernt (eigene Felder bleiben).
// 2. Sicherheitsnetz: lehnt der Dienst trotzdem ab (fremdes_ergebnisfeld), geht die Kachel auf den zuletzt bestaetigten Stand.
// Die Funktionen werden aus gruppe.js geholt und gegen Fakes ausgefuehrt (kein DOM).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const gruppeKern = require("../src/shared/gruppe-kern.js");

const quelle = fs.readFileSync(path.join(__dirname, "..", "src", "client", "app", "gruppe.js"), "utf8");
function funktion(text, name) {
  const start = text.search(new RegExp(`function ${name}\\s*\\(`));
  assert.ok(start >= 0, `${name} fehlt`);
  const auf = text.indexOf("{", text.indexOf(")", start));
  let tiefe = 0, i = auf;
  for (; i < text.length; i++) {
    if (text[i] === "{") tiefe++;
    else if (text[i] === "}" && --tiefe === 0) break;
  }
  const kopf = text.slice(Math.max(0, start - 6), start) === "async " ? "async " : "";
  return kopf + text.slice(start, i + 1);
}
const bauen = (name, kontext) => new Function(...Object.keys(kontext), `${funktion(quelle, name)}; return ${name};`)(...Object.values(kontext));
const konstante = name => {
  const m = new RegExp(`const ${name} = "([^"]+)"`).exec(quelle);
  assert.ok(m, `${name} fehlt`);
  return m[1];
};

const STRICH_ENTFERNT = "Dieser Strich lag im Ergebnisfeld einer anderen Person und wurde entfernt.";

// Eine Kachel als Fake: getImageData meldet Tinte (Alpha) ueberall ausser in leer, clearRect wird mitgeschrieben.
function fakeKachel(protokoll, { leer = false } = {}) {
  const ctx = {
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(leer ? 0 : 255) }),
    clearRect: (...r) => protokoll.push(["clearRect", ...r]),
  };
  return { width: 512, height: 512, getContext: () => ctx };
}

function kodierKontext({ leer = false } = {}) {
  const protokoll = [], hinweise = [];
  const kachel = fakeKachel(protokoll, { leer });
  const kontext = {
    TILE: 512, SIZE: 20000, gruppeKern,
    tiles: new Map([["2,0", kachel]]),
    state: { inkBounds: new Map([["2,0", {}]]) },
    gruppeLage: { schutz: new Map([["ben", [[1024, 0, 200, 200]]], ["anna", [[1300, 0, 50, 50]]]]) },
    gruppeZiel: { person: "anna" },
    requestRender: () => protokoll.push(["render"]),
    gruppeKurzHinweis: text => hinweise.push(text),
    inkBox: () => ({ x: 0, y: 0, w: 1, h: 1 }),
    canvasBlob: async () => { protokoll.push(["kodiert"]); return { arrayBuffer: async () => new ArrayBuffer(1) }; },
    gruppeBase64: () => "B64",
    GRUPPE_STRICH_ENTFERNT: konstante("GRUPPE_STRICH_ENTFERNT"),
  };
  kontext.gruppeSchutzBereinigen = bauen("gruppeSchutzBereinigen", kontext);
  return { kontext, protokoll, hinweise, kodieren: bauen("gruppeKodieren", kontext) };
}

test("Verhindern: eigene Tinte in einem fremden Ergebnisfeld wird vor dem Kodieren entfernt, eigene Felder bleiben", async () => {
  const { kontext, protokoll, hinweise, kodieren } = kodierKontext();
  assert.equal(await kodieren("2,0"), "B64");
  const geloescht = protokoll.filter(p => p[0] === "clearRect");
  assert.deepEqual(geloescht, [["clearRect", 0, 0, 200, 200]], "nur bens Feld, nie annas eigenes (276, 0, 50, 50)");
  assert.ok(protokoll.findIndex(p => p[0] === "clearRect") < protokoll.findIndex(p => p[0] === "kodiert"), "erst entfernen, dann kodieren");
  assert.equal(kontext.state.inkBounds.has("2,0"), false, "Tintengrenzen der Kachel neu berechnen");
  assert.deepEqual(hinweise, [STRICH_ENTFERNT]);
});

test("Verhindern: ohne Tinte im fremden Feld kein Hinweis; ohne fremde Felder nichts geloescht", async () => {
  const leer = kodierKontext({ leer: true });
  await leer.kodieren("2,0");
  assert.deepEqual(leer.hinweise, []);
  const ohne = kodierKontext();
  ohne.kontext.gruppeLage.schutz = new Map();
  await ohne.kodieren("2,0");
  assert.deepEqual(ohne.protokoll.filter(p => p[0] === "clearRect"), []);
  assert.deepEqual(ohne.hinweise, []);
});

function empfangsKontext() {
  const hinweise = [], zurueck = [];
  const kontext = {
    gruppeKern,
    gruppeLage: { ausstehend: new gruppeKern.Ausstehend(), objAusstehend: new gruppeKern.Ausstehend(), bestaetigt: new Map() },
    gruppeAckFrist: () => {}, gruppeAusstehendSenden: () => {}, debug: () => {},
    gruppeKurzHinweis: text => hinweise.push(text),
    gruppeKachelZuruecksetzen: k => { zurueck.push(k); },
    GRUPPE_FREMDES_FELD: konstante("GRUPPE_FREMDES_FELD"),
    GRUPPE_STRICH_ENTFERNT: konstante("GRUPPE_STRICH_ENTFERNT"),
  };
  kontext.gruppeAbgelehnt = bauen("gruppeAbgelehnt", kontext);
  return { kontext, hinweise, zurueck, empfangen: m => bauen("gruppeEmpfangen", kontext)(JSON.stringify(m)) };
}

test("Sicherheitsnetz: ok merkt den bestaetigten Stand je Kachel, eine Ablehnung setzt die Kachel darauf zurueck", () => {
  const { kontext, hinweise, zurueck, empfangen } = empfangsKontext();
  const { ausstehend, objAusstehend, bestaetigt } = kontext.gruppeLage;
  assert.equal(kontext.GRUPPE_STRICH_ENTFERNT, STRICH_ENTFERNT);
  ausstehend.setzen("2,0", "P1"); ausstehend.gesendet("2,0", 1);
  empfangen({ typ: "ok", kachel: "2,0", seq: 1, nr: 1 });
  assert.equal(bestaetigt.get("2,0"), "P1");
  ausstehend.setzen("3,0", null); ausstehend.gesendet("3,0", 2);
  bestaetigt.set("3,0", "alt");
  empfangen({ typ: "ok", kachel: "3,0", seq: 2, nr: 2 });
  assert.equal(bestaetigt.has("3,0"), false, "leere Kachel bestaetigt");

  ausstehend.setzen("2,0", "P2-mit-fremder-Tinte"); ausstehend.gesendet("2,0", 3);
  empfangen({ typ: "fehler", grund: "fremdes_ergebnisfeld", nr: 3 });
  assert.deepEqual(zurueck, ["2,0"]);
  assert.equal(ausstehend.hat("2,0"), false, "die abgelehnte Sendung wird nicht wiederholt");
  assert.equal(bestaetigt.get("2,0"), "P1", "der bestaetigte Stand bleibt");
  assert.deepEqual(hinweise, [STRICH_ENTFERNT]);

  objAusstehend.setzen("text-box-1", { art: "text" }); objAusstehend.gesendet("text-box-1", 4);
  empfangen({ typ: "fehler", grund: "fremdes_ergebnisfeld", nr: 4 });
  assert.deepEqual(zurueck, ["2,0"], "ein abgelehntes Objekt setzt keine Kachel zurueck");
  assert.equal(objAusstehend.hat("text-box-1"), false);
  assert.equal(hinweise[1], konstante("GRUPPE_FREMDES_FELD"));

  ausstehend.setzen("4,0", "Q"); ausstehend.gesendet("4,0", 5);
  empfangen({ typ: "fehler", grund: "Ungueltiger Kachelschluessel", nr: 5 });
  assert.deepEqual(zurueck, ["2,0"], "andere Ablehnungen setzen nichts zurueck");
  assert.equal(hinweise.length, 2);
});

function zuruecksetzKontext() {
  const protokoll = [];
  const kontext = {
    TILE: 512, debug: () => {}, requestRender: () => {},
    tiles: new Map([["2,0", fakeKachel(protokoll)]]),
    state: { inkBounds: new Map([["2,0", {}]]) },
    gruppeLage: { bestaetigt: new Map(), eigen: new Map([["2,0", "abgelehnt"]]), schmutzig: new Set(), ausstehend: new gruppeKern.Ausstehend(), beendet: false },
    gruppeInAenderung: () => false,
    gruppeDekodieren: async png => ({ dekodiert: png, width: 512, height: 512 }),
  };
  return { kontext, protokoll, zuruecksetzen: bauen("gruppeKachelZuruecksetzen", kontext) };
}

test("gruppeKachelZuruecksetzen: zurueck auf den bestaetigten Stand, ohne einen auf leer", async () => {
  const mit = zuruecksetzKontext();
  mit.kontext.gruppeLage.bestaetigt.set("2,0", "P1");
  await mit.zuruecksetzen("2,0");
  assert.equal(mit.kontext.tiles.get("2,0").dekodiert, "P1");
  assert.equal(mit.kontext.gruppeLage.eigen.get("2,0"), "P1");
  assert.equal(mit.kontext.state.inkBounds.has("2,0"), false);

  const ohne = zuruecksetzKontext();
  await ohne.zuruecksetzen("2,0");
  assert.deepEqual(ohne.protokoll, [["clearRect", 0, 0, 512, 512]]);
  assert.equal(ohne.kontext.gruppeLage.eigen.has("2,0"), false);
});

test("gruppeKachelZuruecksetzen: inzwischen neu gezeichnet, dann bleibt die Kachel (der neue Stand geht bereinigt raus)", async () => {
  const z = zuruecksetzKontext();
  z.kontext.gruppeLage.bestaetigt.set("2,0", "P1");
  z.kontext.gruppeLage.schmutzig.add("2,0");
  const vorher = z.kontext.tiles.get("2,0");
  await z.zuruecksetzen("2,0");
  assert.equal(z.kontext.tiles.get("2,0"), vorher);
  assert.equal(z.kontext.gruppeLage.eigen.get("2,0"), "abgelehnt");
});

test("Schutzfelder kommen aus dem Stand und aus der Nachricht schutz", () => {
  const kontext = { gruppeKern, gruppeLage: { schutz: new Map() } };
  const setzen = bauen("gruppeSchutzEmpfangen", kontext);
  setzen([{ person: "ben", felder: [[0, 0, 10, 10]] }], true);
  assert.deepEqual([...kontext.gruppeLage.schutz], [["ben", [[0, 0, 10, 10]]]]);
  setzen([{ person: "cem", felder: [[5, 5, 1, 1]] }], false);
  assert.deepEqual([...kontext.gruppeLage.schutz.keys()].sort(), ["ben", "cem"], "einzelne Meldung ergaenzt");
  setzen([{ person: "ben", felder: [] }], false);
  assert.deepEqual([...kontext.gruppeLage.schutz.keys()], ["cem"], "leere Liste hebt auf");
  setzen([], true);
  assert.equal(kontext.gruppeLage.schutz.size, 0, "ein Stand ersetzt alles");
  assert.match(quelle, /m\.typ === "schutz"/);
  assert.match(quelle, /gruppeSchutzEmpfangen\(m\.schutz, true\)/);
});

test("Wiederverbunden (angenommen): die Schutzfelder des Dienstes ersetzen die alten, ohne Feld bleibt alles", () => {
  const kontext = { gruppeKern, gruppeLage: { schutz: new Map([["cem", [[1, 1, 1, 1]]]]) }, gruppeAusstehendSenden: () => {}, gruppeAckFrist: () => {} };
  kontext.gruppeSchutzEmpfangen = bauen("gruppeSchutzEmpfangen", kontext);
  const empfangen = m => bauen("gruppeEmpfangen", kontext)(JSON.stringify(m));
  empfangen({ typ: "angenommen", seq: 3 });
  assert.deepEqual([...kontext.gruppeLage.schutz.keys()], ["cem"], "aelterer Dienst ohne schutz: nichts verwerfen");
  empfangen({ typ: "angenommen", seq: 4, schutz: [{ person: "ben", felder: [[0, 0, 64, 64]] }] });
  assert.deepEqual([...kontext.gruppeLage.schutz], [["ben", [[0, 0, 64, 64]]]]);
});
