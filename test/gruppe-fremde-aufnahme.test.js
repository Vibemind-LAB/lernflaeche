"use strict";
// Gruppenflaeche: Notizkarten-Aufnahme, Platzierungsmaske und Sitzungsstart (Quelltext-Pruefung des Client-Bundles, kein DOM).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const lies = datei => fs.readFileSync(path.join(__dirname, "..", "src", "client", "app", datei), "utf8");

test("noteCaptureSelection nimmt keine fremden Widgets auf", () => {
  const q = lies("note-cards.js");
  const start = q.indexOf("async function noteCaptureSelection");
  const funktion = q.slice(start, q.indexOf("noteFitCapturedMedia({ items", start));
  assert.match(funktion, /state\.widgets \|\| \[\]\)\.filter\(widget => !widget\.gruppeAutor && /);
});

test("assistContentMask zeigt fremde Objekte (Platzierung, mitFremden = true)", () => {
  const q = lies("smart-suggestions.js");
  assert.match(q, /visibleImages\(region, true\)\.map\(imageBox\)/);
  assert.match(q, /visibleTextBoxes\(region, true\)\.map\(textBoxBox\)/);
});

test("mcp_start_session ist in der Gruppe nur mit target current erlaubt", () => {
  const q = lies("canvas-documents.js");
  assert.match(q, /name==="mcp_start_session"&&GRUPPE_IM_URL&&args\.target!=="current"\)throw canvasDocumentsError\("GROUP_CANVAS_ONLY"/);
});
