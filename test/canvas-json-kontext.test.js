"use strict";
// Fix-Runde 1 (I2): canvas.json (nur lesend, geht an KI-Agenten) zeigt den Kontext ohne Markenzeile der Huelle;
// context.md bleibt roh (die Huelle braucht Inhalt und Hash fuer ihren Patch), ebenso die gespeicherten Metadaten.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const QUELLE = fs.readFileSync(path.join(__dirname, "..", "src", "client", "app", "canvas-documents.js"), "utf8");

// Eine Funktion samt Rumpf aus der Quelle schneiden (Klammern zaehlen; die beiden Funktionen enthalten keine
// Klammern in Zeichenketten ausser ausbalancierten ${...}).
function funktion(name) {
  const anfang = QUELLE.indexOf(`function ${name}(`);
  assert.ok(anfang >= 0, `${name} nicht gefunden`);
  let tiefe = 0;
  for (let i = QUELLE.indexOf("{", anfang); i < QUELLE.length; i += 1) {
    if (QUELLE[i] === "{") tiefe += 1;
    else if (QUELLE[i] === "}" && --tiefe === 0) return QUELLE.slice(anfang, i + 1);
  }
  throw new Error(`${name} ohne Ende`);
}

function lade() {
  const ctx = vm.createContext({
    LernflaecheKern: require("../src/shared/lernflaeche-kern.js"),
    canvasDocumentsPath: (p) => p,
    canvasDocumentsIsActive: () => false,
    SIZE: 20000,
  });
  vm.runInContext(`${funktion("canvasDocumentsMetadata")}\n${funktion("canvasDocumentsFile")}\n`
    + "this.__datei = canvasDocumentsFile; this.__metadaten = canvasDocumentsMetadata;", ctx);
  return { datei: ctx.__datei, metadaten: ctx.__metadaten };
}

const MARKE = "<!-- lernflaeche-bereiche: [[100,100,1760,800],[100,950,1760,800]] -->";
const KONTEXT = `Aufgabe 1 und 2\n${MARKE}\n`;
const doc = { id: "doc-1", title: "Probe", context: KONTEXT, bindings: [], locators: [], revision: 3 };

test("canvas.json zeigt den Kontext ohne Markenzeile", () => {
  const { datei } = lade();
  const canvas = JSON.parse(datei(doc, "canvas.json"));
  assert.equal(canvas.context, "Aufgabe 1 und 2\n");
  assert.ok(!datei(doc, "canvas.json").includes("lernflaeche-bereiche"));
  assert.equal(canvas.documentId, "doc-1");
});

test("context.md und die gespeicherten Metadaten bleiben roh", () => {
  const { datei, metadaten } = lade();
  assert.equal(datei(doc, "context.md"), KONTEXT);
  assert.equal(metadaten(doc).context, KONTEXT);
});
