"use strict";
// Abnahme C, Befund 1 (Teil Ansicht): Nach dem Neuladen stand die Ansicht nicht auf der eigenen Mappe (PenEcho mittelt
// beim Start auf die Flaechenmitte; die Huelle zeigt erst nach "Flaeche verbinden" per MCP eine Aufgabe). Jetzt rahmt
// die Flaeche nach dem ersten angewendeten Gruppenstand einmal die eigene Mappe: eigene Objekte (Karten der Huelle)
// und eigene Ergebnisfelder. Fremde Objekte zaehlen nicht, und spaeter springt die Ansicht nie ungefragt.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const gruppeKern = require("../src/shared/gruppe-kern.js");

const gruppe = fs.readFileSync(path.join(__dirname, "..", "src", "client", "app", "gruppe.js"), "utf8");
function funktion(text, name) {
  const start = text.search(new RegExp(`function ${name}\\s*\\(`));
  assert.ok(start >= 0, `${name} fehlt`);
  const auf = text.indexOf("{", text.indexOf(")", start));
  let tiefe = 0, i = auf;
  for (; i < text.length; i++) {
    if (text[i] === "{") tiefe++;
    else if (text[i] === "}" && --tiefe === 0) break;
  }
  return text.slice(start, i + 1);
}
const bauen = (name, kontext) => new Function(...Object.keys(kontext), `${funktion(gruppe, name)}; return ${name};`)(...Object.values(kontext));

test("mappeBereich vereinigt eigene Kaesten und eigene Ergebnisfelder", () => {
  const { mappeBereich } = gruppeKern;
  assert.deepEqual(mappeBereich([{ x: 100, y: 200, w: 300, h: 50 }, { x: 150, y: 600, w: 400, h: 100 }], [[120, 900, 500, 200]]),
    { x: 100, y: 200, w: 520, h: 900 });
  assert.deepEqual(mappeBereich([], [[10, 20, 30, 40]]), { x: 10, y: 20, w: 30, h: 40 });
  assert.equal(mappeBereich([], undefined), null);
  assert.equal(mappeBereich([{ x: NaN, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 0, h: 5 }], null), null, "ungueltige und leere Kaesten zaehlen nicht");
});

test("mappeAnsicht nimmt nur den oberen Teil einer hohen Mappe (hoechstens so hoch wie breit)", () => {
  const { mappeAnsicht } = gruppeKern;
  // 16 Aufgaben: Mappe 2100 x 15200. Ganz gerahmt waere der Zoom ~5 % und nichts lesbar.
  assert.deepEqual(mappeAnsicht({ x: 2400, y: 100, w: 2100, h: 15200 }), { x: 2400, y: 100, w: 2100, h: 2100 });
  // flache Mappe bleibt ganz
  assert.deepEqual(mappeAnsicht({ x: 10, y: 20, w: 5000, h: 3000 }), { x: 10, y: 20, w: 5000, h: 3000 });
  assert.equal(mappeAnsicht(null), null);
});

function kontext({ eigen = [], fremd = [], schutz = new Map() } = {}) {
  const aufrufe = { rahmen: [], koordinaten: 0 };
  const k = {
    state: { textBoxes: [...eigen, ...fremd], images: [], widgets: [], viewInitialized: false },
    gruppeLage: { schutz, ansichtGesetzt: false },
    gruppeZiel: { gruppe: "g", person: "anna" },
    gruppeKern,
    gruppeObjektFremd: (item) => Boolean(item?.gruppeAutor),
    canvasAgentFrameRegion: (bereich, rand) => aufrufe.rahmen.push({ bereich, rand }),
    updateCoordinates: () => { aufrufe.koordinaten++; },
  };
  return { k, aufrufe };
}

test("gruppeAnsichtAufMappe rahmt nur die eigene Mappe, und nur einmal", () => {
  const { k, aufrufe } = kontext({
    eigen: [{ id: "text-box-1", x: 5000, y: 300, w: 800, h: 100 }, { id: "text-box-2", x: 5000, y: 1500, w: 900, h: 200 }],
    fremd: [{ id: "ben~text-box-1", gruppeAutor: "ben", x: 200, y: 300, w: 800, h: 100 }],
    schutz: new Map([["anna", [[5100, 1800, 700, 300]]], ["ben", [[300, 1800, 700, 300]]]]),
  });
  const zeigen = bauen("gruppeAnsichtAufMappe", k);
  assert.equal(zeigen(), true);
  assert.equal(aufrufe.rahmen.length, 1);
  // Mappe 900 x 1800: gerahmt wird der obere Teil (Namensschild, erste Aufgabe), hoechstens so hoch wie breit
  assert.deepEqual(aufrufe.rahmen[0].bereich, { x: 5000, y: 300, w: 900, h: 900 });
  assert.equal(aufrufe.koordinaten, 1);
  assert.equal(k.state.viewInitialized, true);
  // ein spaeterer Stand (Wiederverbinden, Neuaufbau) springt nicht noch einmal
  assert.equal(zeigen(), false);
  assert.equal(aufrufe.rahmen.length, 1);
});

test("ohne eigene Mappe bleibt die Ansicht, wie sie ist", () => {
  const { k, aufrufe } = kontext({ fremd: [{ id: "ben~text-box-1", gruppeAutor: "ben", x: 200, y: 300, w: 800, h: 100 }] });
  assert.equal(bauen("gruppeAnsichtAufMappe", k)(), false);
  assert.equal(aufrufe.rahmen.length, 0);
});

test("der erste Stand ruft die Mappen-Ansicht nach 'bereit', der Neuaufbau nie", () => {
  const laden = funktion(gruppe, "gruppeStandLaden");
  const bereit = laden.indexOf("gruppeLage.bereit = true;");
  const ansicht = laden.indexOf("gruppeAnsichtAufMappe()");
  assert.ok(bereit > 0 && ansicht > bereit, "gruppeAnsichtAufMappe fehlt nach bereit");
  assert.doesNotMatch(funktion(gruppe, "gruppeNeuAufbau"), /gruppeAnsichtAufMappe/);
  assert.doesNotMatch(funktion(gruppe, "gruppeEmpfangen"), /gruppeAnsichtAufMappe/);
});
