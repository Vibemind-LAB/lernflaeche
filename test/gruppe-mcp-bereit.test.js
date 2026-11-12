"use strict";
// Gruppenflaeche, Abschlusspruefung A (Wichtig 3): MCP handelt erst, wenn der Gruppenstand geladen ist.
// (a) Veraendernde Werkzeuge und Aufnahmen lehnen vor "bereit" wiederholbar mit GROUP_NOT_READY ab: die Huelle behandelt
//     einen unbekannten Code wie "nicht verbunden" (penecho_mcp.py _werkzeug -> PenEchoNichtErreichbar("werkzeug")).
// (b) Die id-Zaehler stehen schon synchron nach dem Stand hinter den gespeicherten eigenen Objekten.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const LernflaecheGruppeKern = require("../src/shared/gruppe-kern.js");

const lies = datei => fs.readFileSync(path.join(__dirname, "..", "src", "client", "app", datei), "utf8");
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
const bauen = (text, name, kontext) => new Function(...Object.keys(kontext), `${funktion(text, name)}; return ${name};`)(...Object.values(kontext));

const dokumente = lies("canvas-documents.js");
const canvasDocumentsError = bauen(dokumente, "canvasDocumentsError", {});
function ausfuehren({ gruppe, bereit }) {
  return bauen(dokumente, "canvasDocumentsExecute", {
    GRUPPE_IM_URL: gruppe, gruppeLage: { bereit }, LernflaecheGruppeKern, canvasDocumentsError,
    mcpRuntime: { sessions: new Map() }, canvasDocuments: { records: new Map() },
  });
}
const code = async versprechen => {
  try { await versprechen; } catch (error) { return error; }
  assert.fail("hat nicht abgelehnt");
};

test("Gruppe noch nicht bereit: Bearbeiten und Aufnehmen lehnen mit GROUP_NOT_READY ab (wiederholbar, deutsch)", async () => {
  const execute = ausfuehren({ gruppe: true, bereit: false });
  for (const [name, args] of [["mcp_edit_canvas", { sessionId: "s", action: "create_text" }], ["mcp_capture_canvas", { sessionId: "s", target: "region" }],
    ["mcp_draw", { sessionId: "s" }], ["mcp_present_widget", { sessionId: "s" }], ["mcp_place_image", { sessionId: "s" }]]) {
    const fehler = await code(execute(name, args, {}));
    assert.equal(fehler.code, "GROUP_NOT_READY", name);
    assert.match(fehler.message, /Gruppenfläche/);
    assert.equal(fehler.details?.retryable, true);
  }
});

test("Lesen geht auch vor bereit durch; nach bereit und ohne Gruppe greift die Sperre nie", async () => {
  assert.equal((await code(ausfuehren({ gruppe: true, bereit: false })("mcp_list_files", { sessionId: "s" }, {}))).code, "SESSION_EXPIRED");
  assert.equal((await code(ausfuehren({ gruppe: true, bereit: true })("mcp_edit_canvas", { sessionId: "s" }, {}))).code, "SESSION_EXPIRED");
  assert.equal((await code(ausfuehren({ gruppe: false, bereit: false })("mcp_capture_canvas", { sessionId: "s" }, {}))).code, "SESSION_EXPIRED");
});

const gruppe = lies("gruppe.js");
function standKontext(state) {
  const kontext = {
    state, gruppeKern: LernflaecheGruppeKern, gruppeZiel: { person: "anna" },
    gruppeLage: { objFremd: new Map(), objVorher: new Map() },
    GRUPPE_OBJEKT_ARTEN: { text: "textBoxes", bild: "images", widget: "widgets" },
    gruppeObjektEmpfangen: () => {},
    gruppeObjektBauen: () => new Promise(() => {}), // der asynchrone Aufbau ist noch lange nicht fertig
    gruppeObjektEinsetzen: () => {}, requestRender: () => {},
  };
  kontext.gruppeObjektGueltig = bauen(gruppe, "gruppeObjektGueltig", kontext);
  return bauen(gruppe, "gruppeObjekteAusStand", kontext);
}
const objekte = [
  { autor: "anna", id: "text-box-3", seq: 1, daten: { art: "text", x: 0, y: 0, w: 10, h: 10 } },
  { autor: "anna", id: "image-7", seq: 2, daten: { art: "bild", x: 0, y: 0, w: 10, h: 10 } },
  { autor: "anna", id: "widget-2", seq: 3, daten: { art: "widget", x: 0, y: 0, w: 10, h: 10 } },
  { autor: "anna", id: "notiz-x", seq: 4, daten: { art: "text", x: 0, y: 0, w: 10, h: 10 } },
  { autor: "ben", id: "text-box-40", seq: 5, daten: { art: "text", x: 0, y: 0, w: 10, h: 10 } },
  { autor: "anna", id: "text-box-9", seq: 6, daten: null },
];

test("Stand: id-Zaehler werden synchron aus den eigenen ids angehoben, bevor etwas asynchron aufgebaut ist", () => {
  const state = { nextTextBoxId: 1, nextImageId: 1, nextWidgetId: 5, textBoxes: [], images: [], widgets: [] };
  standKontext(state)(objekte, true);
  assert.equal(state.nextTextBoxId, 4, "text-box-3 ist belegt, fremde und geloeschte ids zaehlen nicht");
  assert.equal(state.nextImageId, 8);
  assert.equal(state.nextWidgetId, 5, "nie zurueck");
});

test("Neuaufbau (nicht erstmals): Zaehler ebenfalls hinter den eigenen ids des Stands", () => {
  const state = { nextTextBoxId: 2, nextImageId: 1, nextWidgetId: 1, textBoxes: [], images: [], widgets: [] };
  standKontext(state)(objekte, false);
  assert.deepEqual([state.nextTextBoxId, state.nextImageId, state.nextWidgetId], [4, 8, 3]);
});
