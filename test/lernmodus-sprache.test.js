"use strict";
// Abnahme A2, Befund 7: Die Oberflaeche der Lernflaeche war im Lernmodus englisch. Im Lernmodus gelten fuer die
// Werkzeugleiste, den Entwurfsablauf und die Statusmeldungen deutsche Texte (Sie-Form, Umlaute); Einstellungs-
// dialoge, Agent-Panel und MCP-Einrichtung bleiben englisch (Lernende sehen sie nicht).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const LK = require("../src/shared/lernflaeche-kern.js");

const quelle = (datei) => fs.readFileSync(path.join(__dirname, "..", "src", "client", "app", datei), "utf8");

function englischeTexte() {
  const core = quelle("core.js");
  const start = core.indexOf("const I18N = {");
  const en = core.indexOf("en:", start);
  const zh = core.indexOf("\n    zh:", en);
  const texte = {};
  for (const m of core.slice(en, zh).matchAll(/^\s*([A-Za-z0-9_]+):\s*("(?:[^"\\]|\\.)*")/gm)) texte[m[1]] = JSON.parse(m[2]);
  return texte;
}

const platzhalter = (text) => [...text.matchAll(/\{[a-zA-Z]+\}/g)].map((m) => m[0]).sort();

test("jeder deutsche Lerntext ersetzt einen vorhandenen englischen Schluessel mit denselben Platzhaltern", () => {
  const en = englischeTexte();
  const schluessel = Object.keys(LK.LERN_DE);
  assert.ok(schluessel.length >= 40, `nur ${schluessel.length} Texte`);
  for (const k of schluessel) {
    assert.ok(k in en, `Schluessel ${k} gibt es nicht`);
    assert.ok(LK.LERN_DE[k].trim(), `leerer Text fuer ${k}`);
    assert.deepEqual(platzhalter(LK.LERN_DE[k]), platzhalter(en[k]), `Platzhalter fuer ${k}`);
  }
});

test("die sichtbare Werkzeugleiste ist abgedeckt", () => {
  for (const k of ["pen", "eraser", "hand", "text", "undo", "redo", "addImage", "penSize", "inkColor", "autoAI",
    "autoEnabled", "triggerAutoAI", "canvasZoomIn", "canvasZoomOut", "canvasZoomReset", "canvasFitContents",
    "canvasLockNavigation", "lassoToolPurpose", "assistTools", "settingsTitle", "title"]) {
    assert.ok(LK.LERN_DE[k], `${k} fehlt`);
  }
  assert.equal(LK.LERN_DE.undo, "Rückgängig");
  assert.equal(LK.LERN_DE.autoEnabled, "Auto ({delay} s)");
});

test("Lerntexte siezen und sprechen nicht englisch", () => {
  for (const [k, v] of Object.entries(LK.LERN_DE)) {
    assert.doesNotMatch(v, /\b(du|dein|deine|dich|dir)\b/i, `${k} duzt`);
    assert.doesNotMatch(v, /\b(the|and|your|first|draft|canvas)\b/i, `${k} ist englisch: ${v}`);
  }
});

test("MCP-Kurztexte haben deutsche Entsprechungen", () => {
  assert.equal(LK.LERN_DE_MCP.Off, "Aus");
  assert.equal(LK.LERN_DE_MCP["MCP connection details"], "MCP-Verbindung");
  // Live 09.11.: die Statuszeile oben in der Fläche stand noch englisch da.
  assert.equal(LK.LERN_DE_MCP["Discoverable · AI can connect"], "Bereit · die Lernhilfe ist verbunden");
});

test("t() und mcpUiText nehmen im Lernmodus die deutschen Texte", () => {
  const core = quelle("core.js");
  const zeile = core.slice(core.indexOf("const t = (key) =>"), core.indexOf("\n", core.indexOf("const t = (key) =>")));
  assert.match(zeile, /LERN_SPRACHE\s*&&\s*LernflaecheKern\.LERN_DE\[key\]/);
  assert.match(core, /const LERN_SPRACHE = LernflaecheKern\.lernmodusAktiv\(location\.search\)/);
  const mcp = quelle("mcp-runtime.js");
  const rumpf = mcp.slice(mcp.indexOf("function mcpUiText("), mcp.indexOf("\n", mcp.indexOf("function mcpUiText(")));
  assert.match(rumpf, /LernflaecheKern\.LERN_DE_MCP\[en\]/);
  assert.match(rumpf, /lernmodusAktiv\(location\.search\)/);
  // mcpText (Tabelle mcpCopy) laeuft ueber mcpUiText, sonst bliebe z. B. die Statuszeile englisch.
  const text = mcp.slice(mcp.indexOf("function mcpText("), mcp.indexOf("\n", mcp.indexOf("function mcpText(")));
  assert.match(text, /mcpUiText\(paar\[0\], paar\[1\]\)/);
});

test("live 09.11. englisch gebliebene Knoepfe und Meldungen haben deutsche Texte", () => {
  for (const k of ["answer", "selectionTypeset", "cancel", "selectionCancel", "selectionDelete", "selectionDownload",
    "widgetAccept", "copyText", "textCopyFailed", "smartSuggestDismiss", "aiCancelled", "snapshotSaved", "saveCanvas",
    "boardTools", "assistGraph", "assistGraph3d", "snapshotOverwritten", "snapshotSaving", "snapshotSavingShort",
    "effortNone", "effortLow", "effortMedium", "effortMediumShort", "effortHigh"]) {
    assert.ok(LK.LERN_DE[k], `${k} fehlt`);
  }
  assert.equal(LK.LERN_DE.cancel, "Abbrechen");
  assert.equal(LK.LERN_DE.effortMediumShort, "Mittel");
  // MCP-Knopf zeigt die Zahl verbundener KI-Sitzungen ("1 AI").
  const mcp = quelle("mcp-runtime.js");
  const zeile = mcp.slice(mcp.lastIndexOf("\n", mcp.indexOf("sessions.length} ")), mcp.indexOf("\n", mcp.indexOf("sessions.length} ")));
  assert.match(zeile, /LERN_SPRACHE\s*\?\s*"KI"\s*:\s*"AI"/);
});

test("jede Vorschlagsaktion der Hilfsleiste hat im Lernmodus eine deutsche Beschriftung", () => {
  const SS = require("../public/smart-suggest.js");
  const ids = SS.ACTIONS.map((a) => a.id);
  assert.ok(ids.includes("finish_drawing") && ids.includes("typeset"));
  for (const id of ids) {
    const de = LK.LERN_DE_AKTION[id];
    assert.ok(de && de.trim(), `Aktion ${id} ohne deutsche Beschriftung`);
    assert.doesNotMatch(de, /\b(the|and|your|draw|drawing|widget|graph)\b/i, `${id} ist englisch: ${de}`);
  }
  const ss = quelle("smart-suggestions.js");
  const rumpf = ss.slice(ss.indexOf("function assistLabel("), ss.indexOf("\n  }", ss.indexOf("function assistLabel(")));
  assert.match(rumpf, /LERN_SPRACHE\s*&&\s*LernflaecheKern\.LERN_DE_AKTION\[item\.id\]/);
  const notizen = ss.slice(ss.indexOf("const library = assistButton("), ss.indexOf("\n", ss.indexOf("const library = assistButton(")));
  assert.match(notizen, /LernflaecheKern\.LERN_DE_FEST/);
});

test("feste Fenstertexte ohne Schluessel (Werkzeugleiste, Flaechenliste) gehen im Lernmodus auf Deutsch", () => {
  assert.equal(LK.LERN_DE_FEST["Canvas tools"], "Werkzeuge");
  assert.ok(LK.LERN_DE_FEST["Canvases have new updates"]);
  for (const [datei, fn] of [["ui-bootstrap.js", "canvasCompanionCopy"], ["canvas-documents.js", "canvasDocumentsCopy"]]) {
    const q = quelle(datei);
    const i = q.indexOf(`function ${fn}(`);
    assert.ok(i >= 0, `${fn} fehlt in ${datei}`);
    const rumpf = q.slice(i, q.indexOf("\n", i));
    assert.match(rumpf, /LERN_SPRACHE[\s\S]*LernflaecheKern\.LERN_DE_FEST\[en\]/, `${fn} nutzt die Lerntexte nicht`);
  }
});

test("feste Beschriftungen ohne Schluessel werden im Lernmodus beim Sprachwechsel deutsch", () => {
  const core = quelle("core.js");
  assert.match(core, /if \(LERN_SPRACHE\) lernSpracheFesteTexte\(\);/);
  const rumpf = core.slice(core.indexOf("function lernSpracheFesteTexte("), core.indexOf("\n  }", core.indexOf("function lernSpracheFesteTexte(")));
  assert.match(rumpf, /documentElement\.lang = "de"/);
  assert.match(rumpf, /aiToolbarRun[\s\S]*"KI"/);
  assert.match(rumpf, /cloudAccountBtn[\s\S]*Lernfläche-Cloud/);
  assert.ok(LK.LERN_DE.tip.startsWith("Verschieben"));
});
