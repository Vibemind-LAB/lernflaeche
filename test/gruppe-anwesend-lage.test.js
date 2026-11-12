"use strict";
// Abnahme C, Befund 3: Die Anwesenheitsanzeige (#lernflaecheAnwesend) stand rechts oben (top 64px) und lag unter dem
// Knopf "Speichern" der Huelle. Die Huelle legt ihre Leiste (Speichern, Abgeben, nach einer Bewertung bis zu fuenf
// Knoepfe, umbrechend) rechts oben ueber die Flaeche, schmal sogar ueber die ganze Breite; unten liegt bei ihr nichts.
// Die Anzeige sitzt darum links unten, direkt ueber PenEchos Zoom-Knoepfen, und haelt rechts Abstand.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { anwesendLage } = require("../src/shared/gruppe-kern.js");

const rect = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top });

test("breit: links unten ueber den Zoom-Knoepfen, nie in der oberen Haelfte", () => {
  const lage = anwesendLage({ breite: 1280, hoehe: 800 }, rect(0, 48, 1280, 800), rect(16, 742, 205, 782));
  assert.equal(lage.left, 16);
  assert.equal(lage.bottom, 800 - 742 + 8);
  assert.ok(lage.maxWidth <= 360);
  assert.ok(800 - lage.bottom > 400, "Unterkante in der unteren Haelfte");
});

test("schmal: ueber dem Einpassen-Knopf, rechts frei fuer PenEchos Knoepfe", () => {
  const lage = anwesendLage({ breite: 420, hoehe: 700 }, rect(0, 42, 420, 674), rect(10, 638, 30, 668));
  assert.equal(lage.left, 12);
  assert.equal(lage.bottom, 700 - 638 + 8);
  assert.ok(lage.left + lage.maxWidth <= 420 - 64, `rechte Kante ${lage.left + lage.maxWidth}`);
  assert.ok(lage.maxWidth >= 120);
});

test("ohne Zoom-Knoepfe: ueber der Unterkante der Flaeche; ohne Flaeche: am Fenster", () => {
  assert.deepEqual(anwesendLage({ breite: 1000, hoehe: 700 }, rect(0, 48, 1000, 650), null), { left: 12, bottom: 700 - 650 + 12, maxWidth: 360 });
  const ohne = anwesendLage({ breite: 300, hoehe: 500 }, null, null);
  assert.equal(ohne.left, 12);
  assert.equal(ohne.bottom, 12);
  assert.ok(ohne.left + ohne.maxWidth <= 300 - 64);
});

test("Zoom-Knoepfe in der oberen Haelfte (z. B. Sperre oben links) zaehlen nicht", () => {
  const lage = anwesendLage({ breite: 420, hoehe: 700 }, rect(0, 42, 420, 674), rect(10, 94, 38, 122));
  assert.equal(lage.bottom, 700 - 674 + 12);
});

test("die Anzeige setzt ihre Lage ueber anwesendLage (el.style, kein top/right mehr)", () => {
  const gruppe = fs.readFileSync(path.join(__dirname, "..", "src", "client", "app", "gruppe.js"), "utf8");
  const start = gruppe.indexOf("function anwesendZeigen(");
  const rumpf = gruppe.slice(start, gruppe.indexOf("\n  }", start));
  assert.doesNotMatch(rumpf, /right:"12px"|top:"64px"/);
  assert.match(gruppe, /gruppeKern\.anwesendLage\(/);
  // schmal steht "Alles einpassen" allein (Live 12.11.: die Anzeige lag zuerst darueber)
  assert.match(gruppe, /#canvasZoomControls, #canvasFitContents/);
  assert.match(gruppe, /addEventListener\("resize", anwesendNachGroesse/);
  // PenEchos Leisten gleiten nach der Groessenaenderung (Live 12.11.: zuerst 70 px daneben gemessen)
  assert.match(gruppe, /setTimeout\(anwesendPlatzieren, 400\)/);
});
