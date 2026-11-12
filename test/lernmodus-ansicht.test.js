"use strict";
// Abnahme A2, Befund 5: Im Lernmodus zog „Follow AI changes“ die Ansicht zur Bewertungskarte, die die
// Huelle setzt, weg von der gewaehlten Aufgabe; nach „Fit all“ (4 %) schwenkte die Aufgabenwahl nur und
// zoomte nicht heran. Die Huelle zeigt einen Bereich mit `penecho_edit_canvas` action "show".
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const quelle = (datei) => fs.readFileSync(path.join(__dirname, "..", "src", "client", "app", datei), "utf8");

test("show im Lernmodus rahmt den Bereich mit Zoom, sonst wie bisher nur Schwenken", () => {
  const mcp = quelle("mcp-runtime.js");
  const anfang = mcp.indexOf("function mcpBereichZeigen(");
  assert.ok(anfang > 0, "mcpBereichZeigen fehlt");
  const rumpf = mcp.slice(anfang, mcp.indexOf("\n  }", anfang));
  assert.match(rumpf, /LernflaecheKern\.lernmodusAktiv\(location\.search\)/);
  assert.match(rumpf, /canvasAgentFrameRegion\(/);
  // Live 09.11.: der Rahmen zoomte, die Zoom-Anzeige blieb aber auf dem alten Wert (5 %) stehen.
  assert.match(rumpf, /canvasAgentFrameRegion\([^)]*\);\s*updateCoordinates\(\)/);
  assert.match(rumpf, /mcpRevealRegion\(/);
  const dokumente = quelle("canvas-documents.js");
  const start = dokumente.indexOf('if(args.action==="show") {');
  assert.ok(start > 0, "show-Zweig nicht gefunden");
  const show = dokumente.slice(start, dokumente.indexOf("return {documentId:doc.id,active:true}", start));
  assert.match(show, /mcpBereichZeigen\(box\)/);
  assert.doesNotMatch(show, /mcpRevealRegion\(/);
});

test("show nimmt einen Bereich an, damit die Huelle die ganze Zeile (Aufgabe und Antwortfeld) zeigen kann", () => {
  // Live 09.11.: mit objectId rahmte die Flaeche nur den Aufgabentext, das Antwortfeld lag halb draussen.
  const { validateToolArguments } = require("../src/server/mcp/schema.js");
  const region = { x: 0, y: 1200, w: 3200, h: 1100 };
  const out = validateToolArguments("penecho_edit_canvas", { sessionId: "s", requestId: "r", action: "show", region });
  assert.deepEqual(out.region, region);
  assert.throws(() => validateToolArguments("penecho_edit_canvas", { sessionId: "s", requestId: "r", action: "show", text: "x" }));
});

test("im Lernmodus folgt die Ansicht keinen Aenderungen von aussen", () => {
  const mcp = quelle("mcp-runtime.js");
  const stelle = mcp.indexOf("noteMcpContentUpdate?.(");
  assert.ok(stelle > 0);
  const bedingung = mcp.slice(mcp.lastIndexOf("if(", stelle), stelle);
  assert.match(bedingung, /!LernflaecheKern\.lernmodusAktiv\(location\.search\)/);
});
