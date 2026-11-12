"use strict";
// Abnahme C, Befund 2: In der Statusleiste stand im Lernmodus "Hand mode pauses Auto AI · Use the AI button…".
// Alles, was ueber die Statusleiste (setStatusKey, showHandStatusHint) oder die Hinweiszeile (canvasHint*) zu
// Lernenden kommt, braucht einen deutschen Lerntext; t() nimmt ihn im Lernmodus zuerst.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const LK = require("../src/shared/lernflaeche-kern.js");

const APP = path.join(__dirname, "..", "src", "client", "app");
const quelle = (datei) => fs.readFileSync(path.join(APP, datei), "utf8");

function englischeTexte() {
  const core = quelle("core.js");
  const start = core.indexOf("const I18N = {");
  const en = core.indexOf("en:", start);
  const zh = core.indexOf("\n    zh:", en);
  const texte = {};
  for (const m of core.slice(en, zh).matchAll(/^\s*([A-Za-z0-9_]+):\s*("(?:[^"\\]|\\.)*")/gm)) texte[m[1]] = JSON.parse(m[2]);
  return texte;
}

// Alle Schluessel, die als Literal in setStatusKey(...) oder showHandStatusHint(..., [...]) stehen.
function statusSchluessel() {
  const keys = new Set();
  for (const datei of fs.readdirSync(APP).filter((f) => f.endsWith(".js"))) {
    const q = quelle(datei);
    for (const m of q.matchAll(/setStatusKey\(([^;\n]*?)\)\s*[;\n]/g)) for (const s of m[1].matchAll(/"([A-Za-z0-9_]+)"/g)) keys.add(s[1]);
    for (const m of q.matchAll(/showHandStatusHint\("[^"]+",\s*\[([^\]]+)\]/g)) for (const s of m[1].matchAll(/"([A-Za-z0-9_]+)"/g)) keys.add(s[1]);
  }
  // Ueber Hilfsfunktionen gesetzt: selectionAIStatusKey, canvasAgentAutomaticAIStatusKey; Bild-Hinweise im Hand-Modus.
  for (const k of ["selectionTypesetting", "observing", "canvasAgentExternalAIPaused", "canvasAgentAutoAIFocusPaused",
    "handImageConfirmedHint", "handImageMergedHint"]) keys.add(k);
  return keys;
}

test("der Hand-Modus-Hinweis aus der Abnahme ist deutsch", () => {
  assert.equal(LK.LERN_DE.handAutoAIManual, "Im Hand-Modus pausiert die automatische KI · Mit dem KI-Knopf starten Sie sie von Hand.");
  assert.ok(LK.LERN_DE.handAutoAIResume);
});

test("jeder Text der Statusleiste hat im Lernmodus einen deutschen Lerntext", () => {
  const en = englischeTexte();
  const keys = statusSchluessel();
  assert.ok(keys.size >= 60, `nur ${keys.size} Schluessel gefunden`);
  const fehlt = [...keys].filter((k) => k in en && !LK.LERN_DE[k]);
  assert.deepEqual(fehlt, [], `ohne deutschen Text: ${fehlt.join(", ")}`);
});

test("jeder Hinweis der Hinweiszeile (canvasHint*) hat im Lernmodus einen deutschen Lerntext", () => {
  const en = englischeTexte();
  const keys = Object.keys(en).filter((k) => k.startsWith("canvasHint"));
  assert.ok(keys.length >= 25, `nur ${keys.length} Hinweise gefunden`);
  const fehlt = keys.filter((k) => !LK.LERN_DE[k]);
  assert.deepEqual(fehlt, [], `ohne deutschen Text: ${fehlt.join(", ")}`);
});

test("der Anmelde-Knopf im Gast-Hinweis spricht im Lernmodus deutsch", () => {
  const core = quelle("core.js");
  const zeile = core.slice(core.indexOf("signIn.textContent ="), core.indexOf("\n", core.indexOf("signIn.textContent =")));
  assert.match(zeile, /LERN_SPRACHE\s*\?\s*"Anmelden"/);
});
