"use strict";
// Fremde Objekte der Gruppenflaeche (gruppeAutor) sind fuer KI-Werkzeuge (MCP) und Dokument-Pfade unsichtbar
// und lokal nicht aenderbar. Die Funktionen werden aus dem Quelltext geholt und gegen einen Fake-State ausgefuehrt.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const WURZEL = process.env.FREMDE_OBJEKTE_WURZEL || path.join(__dirname, "..", "src", "client", "app");
const quelle = datei => fs.readFileSync(path.join(WURZEL, datei), "utf8");

// Schneidet "function name(...) { ... }" per Klammerzaehlung aus dem Quelltext.
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
const bauen = (text, name, kontext) => new Function(...Object.keys(kontext), `${funktion(text, name)}; return ${name};`)(...Object.values(kontext));

const fremdText = { id:"ben~text-box-1", gruppeAutor:"ben", gruppeId:"text-box-1", x:1, y:1, w:10, h:10, text:"fremd" };
const eigenText = { id:"text-box-1", x:5, y:5, w:10, h:10, text:"eigen" };
const fremdWidget = { id:"ben~widget-1", gruppeAutor:"ben", gruppeId:"widget-1", x:0, y:0, w:300, h:200 };
const fremdBild = { id:"ben~image-1", gruppeAutor:"ben", gruppeId:"image-1", x:0, y:0, w:10, h:10 };
const state = () => ({ widgets:[fremdWidget], textBoxes:[fremdText, eigenText], images:[fremdBild] });

test("KI: canvasAgentObject findet fremde Objekte nicht, eigene schon", () => {
  const canvasAgentObject = bauen(quelle("canvas-agent-runtime.js"), "canvasAgentObject", { state:state() });
  for (const id of ["ben~text-box-1", "ben~widget-1", "ben~image-1"]) assert.equal(canvasAgentObject(id), null, id);
  assert.equal(canvasAgentObject("text-box-1").item, eigenText);
});

test("KI: canvasAgentAllObjects listet keine fremden Objekte", () => {
  const f = bauen(quelle("canvas-agent-runtime.js"), "canvasAgentAllObjects", { state:state(), canvasAgentObjectSummary: o => o.item.id });
  assert.deepEqual(f(), ["text-box-1"]);
});

test("Dokumente: canvasDocumentsObjects (aktiv) listet keine fremden Objekte, also kein Schreibpfad", () => {
  const f = bauen(quelle("canvas-documents.js"), "canvasDocumentsObjects", { state:state(), canvasDocumentsIsActive: () => true });
  assert.deepEqual(f({}).map(o => o.item.id), ["text-box-1"]);
});

test("KI-Widgetsuche (canvasAgentReference) schliesst fremde Widgets aus", () => {
  const text = quelle("canvas-agent-runtime.js");
  assert.match(text, /state\.widgets\.filter\(item=>\{\s*if\(item\.gruppeAutor\)return false;/);
});

test("Widget: Gesten und Inhaltsanpassung fremder Widgets sind gesperrt", () => {
  const text = quelle("canvas-runtime.js");
  const geste = bauen(text, "beginWidgetGesture", {});
  assert.equal(geste({}, {}, { widget:fremdWidget, hit:"resize" }), false);
  const anpassung = bauen(text, "requestWidgetContentFit", { state:{}, beginWidgetEdit: () => assert.fail("beginWidgetEdit darf nicht laufen") });
  assert.equal(anpassung(fremdWidget, "resize"), false);
});

test("Loeschen und Bearbeiten fremder Objekte sind No-ops", () => {
  const text = quelle("canvas-runtime.js");
  const s = state();
  const aufruf = () => assert.fail("darf nicht laufen");
  assert.equal(bauen(text, "deleteWidget", { state:s })(fremdWidget), false);
  assert.equal(bauen(text, "deleteImage", { state:s })(fremdBild), false);
  assert.equal(bauen(text, "editTextBox", { state:{ ...s, mode:"select", viewMode:false, textEditors:new Set() } })(fremdText), false);
  assert.equal(bauen(text, "beginWidgetEdit", { state:s })(fremdWidget), false);
  assert.equal(bauen(text, "beginImageEdit", { state:s, cancelSmartSuggest: aufruf })(fremdBild), false);
  assert.equal(s.widgets.length, 1);
  assert.equal(s.images.length, 1);
  assert.equal(s.textBoxes.length, 2);
});

test("Fremde Objekte erscheinen in keinem Snapshot und damit in keinem eigenen Diff", () => {
  const { objektListe } = require("../src/shared/objekt-abgleich.js");
  const s = { ...state(), widgets:[fremdWidget], images:[fremdBild] };
  assert.deepEqual([...objektListe(s).keys()], ["text-box-1"]);
  const text = quelle("canvas-runtime.js");
  const gespeichert = bauen(text, "storedTextBoxes", { state:s })();
  assert.deepEqual(gespeichert.map(i => i.id), ["text-box-1"]);
  assert.deepEqual(bauen(text, "serializedWidgets", { state:s })(), []);
});
