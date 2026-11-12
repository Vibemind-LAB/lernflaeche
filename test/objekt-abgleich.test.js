"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { objektListe, objektDiff, objektRechteck, objektZuGross, objektId, fremdId } = require("../src/shared/objekt-abgleich.js");

const text = (id, extra = {}) => ({ id, x:10, y:20, w:100, h:40, maxWidth:300, fontSize:24, fontFamily:"sans", color:"#000", text:"Hallo", image:{}, ...extra });
const bild = (id, extra = {}) => ({ id, x:5, y:6, w:50, h:60, naturalW:100, naturalH:120, sourceName:"a.png", blob:{}, image:{}, ...extra });
const widget = (id, extra = {}) => ({ id, widgetType:"html_widget", pluginId:"html", x:0, y:0, w:300, h:200, contentW:300, contentH:200, title:"T", refreshSeconds:0, html:"<p>x</p>", ...extra });

test("objektListe erfasst Texte, Bilder und Widgets mit ihrer Id", () => {
  const liste = objektListe({ textBoxes:[text("text-box-1")], images:[bild("image-1")], widgets:[widget("widget-1")] }, () => "data:image/png;base64,AAAA");
  assert.deepEqual([...liste.keys()], ["text-box-1", "image-1", "widget-1"]);
  assert.equal(liste.get("text-box-1").art, "text");
  assert.equal(liste.get("image-1").art, "bild");
  assert.equal(liste.get("widget-1").art, "widget");
  for (const { art, daten } of liste.values()) assert.equal(daten.art, art);
  assert.equal(liste.get("image-1").daten.src, "data:image/png;base64,AAAA");
  assert.equal(liste.get("text-box-1").daten.image, undefined, "Rasterbilder gehen nicht in die Daten");
  assert.equal(liste.get("widget-1").daten.id, undefined);
});

test("diff_neu_geaendert_geloescht", () => {
  const a = objektListe({ textBoxes:[text("t1"), text("t2")], images:[], widgets:[] });
  const b = objektListe({ textBoxes:[text("t1", { x:11 }), text("t3")], images:[], widgets:[] });
  const d = objektDiff(a, b);
  assert.deepEqual(d.geaendert.map(e => e.id), ["t1", "t3"]);
  assert.deepEqual(d.geloescht, ["t2"]);
  assert.equal(d.geaendert[0].daten.x, 11);
  assert.deepEqual(objektDiff(b, b), { geaendert:[], geloescht:[] });
  assert.deepEqual(objektDiff(new Map(), new Map()), { geaendert:[], geloescht:[] });
});

test("diff_ignoriert_fremde", () => {
  const liste = objektListe({
    textBoxes:[text("t1"), text("ben~t1", { gruppeAutor:"ben" })],
    images:[bild("ben~i1", { gruppeAutor:"ben" })],
    widgets:[widget("ben~w1", { gruppeAutor:"ben" })],
  });
  assert.deepEqual([...liste.keys()], ["t1"]);
  assert.deepEqual(objektDiff(liste, liste), { geaendert:[], geloescht:[] });
});

test("rechteck_aus_daten", () => {
  assert.deepEqual(objektRechteck({ art:"text", x:1, y:2, w:3, h:4, text:"x" }), { x:1, y:2, w:3, h:4 });
  const liste = objektListe({ textBoxes:[text("t1")], images:[bild("i1")], widgets:[widget("w1")] });
  assert.deepEqual(objektRechteck(liste.get("t1").daten), { x:10, y:20, w:100, h:40 });
  assert.deepEqual(objektRechteck(liste.get("i1").daten), { x:5, y:6, w:50, h:60 });
  assert.deepEqual(objektRechteck(liste.get("w1").daten), { x:0, y:0, w:300, h:200 });
});

test("zu_gross_bei_900001_bytes", () => {
  const leer = JSON.stringify({ art:"bild", x:0, y:0, w:1, h:1, src:"" }).length;
  const mit = n => ({ art:"bild", x:0, y:0, w:1, h:1, src:"a".repeat(n - leer) });
  assert.equal(objektZuGross(mit(900000)), false);
  assert.equal(objektZuGross(mit(900001)), true);
  // Bytes, nicht Zeichen: ein Umlaut zaehlt doppelt.
  assert.equal(objektZuGross({ art:"text", x:0, y:0, w:1, h:1, text:"ä".repeat(450000) }), true);
});

test("objektListe ueberspringt Objekte ohne endliches Rechteck", () => {
  const liste = objektListe({ textBoxes:[text("t1", { w:NaN })], images:[], widgets:[] });
  assert.equal(liste.size, 0);
});

test("objektId und fremdId", () => {
  assert.equal(objektId("text-box-12"), "text-box-12");
  const abgebildet = objektId("a b/ä");
  assert.match(abgebildet, /^[A-Za-z0-9_-]{1,80}$/);
  assert.equal(objektId("a b/ä"), abgebildet, "deterministisch");
  assert.notEqual(objektId("a b/ä"), objektId("a b/ö"));
  assert.match(objektId("x".repeat(500)), /^[A-Za-z0-9_-]{1,80}$/);
  assert.equal(fremdId("ben", "t1"), "ben~t1");
  assert.notEqual(fremdId("ben", "t1"), fremdId("anna", "t1"));
});
