import test from "node:test";
import assert from "node:assert/strict";
import hilfe from "./abgleich-hilfe.cjs";
import { pruefeKachelNachricht, istKachelSchluessel, pngMasse, MAX_PNG_BYTES, KACHEL_PX, KENNUNG } from "../abgleich/protokoll.mjs";

const { pngKopf, png64 } = hilfe;
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_B64 = png64("tiny");

test("akzeptiert gueltige Kachel", () => {
  const r = pruefeKachelNachricht({ typ: "kachel", kachel: "12,3", png: PNG_B64 });
  assert.equal(r.ok, true);
  assert.equal(r.kachel, "12,3");
  assert.ok(r.png instanceof Uint8Array);
  assert.equal(r.png.length, pngKopf(512, 512, "tiny").length);
});
test("leere Kachel ist null", () => {
  const r = pruefeKachelNachricht({ typ: "kachel", kachel: "0,0", png: null });
  assert.equal(r.ok, true);
  assert.equal(r.png, null);
});
test("lehnt Schluessel ausserhalb ab", () => {
  for (const k of ["40,0", "-1,2", "a,b", "1,2,3", "01,2", " 1,2", "", "1,"]) {
    assert.equal(pruefeKachelNachricht({ typ: "kachel", kachel: k, png: null }).ok, false, k);
  }
  assert.equal(pruefeKachelNachricht({ typ: "kachel", kachel: 5, png: null }).ok, false);
  assert.equal(istKachelSchluessel("39,39"), true);
  assert.equal(istKachelSchluessel("0,0"), true);
});
test("lehnt Nicht-PNG ab", () => {
  assert.equal(pruefeKachelNachricht({ typ: "kachel", kachel: "1,1", png: Buffer.from("GIF89a").toString("base64") }).ok, false);
});
test("lehnt zu grosse Kachel ab", () => {
  const r = pruefeKachelNachricht({ typ: "kachel", kachel: "1,1", png: Buffer.concat([pngKopf(), Buffer.alloc(MAX_PNG_BYTES)]).toString("base64") });
  assert.equal(r.ok, false);
});
test("Grenze: genau MAX_PNG_BYTES ist erlaubt", () => {
  const kopf = pngKopf();
  const r = pruefeKachelNachricht({ typ: "kachel", kachel: "1,1", png: Buffer.concat([kopf, Buffer.alloc(MAX_PNG_BYTES - kopf.length)]).toString("base64") });
  assert.equal(r.ok, true);
});
test("Masse: nur genau 512x512 wie PenEchos tile()", () => {
  assert.equal(KACHEL_PX, 512);
  for (const [b, h] of [[600, 600], [30000, 30000], [512, 511], [511, 512], [1, 1], [0, 0], [1024, 512]]) {
    const r = pruefeKachelNachricht({ typ: "kachel", kachel: "1,1", png: png64("x", b, h) });
    assert.equal(r.ok, false, `${b}x${h}`);
    assert.match(r.grund, /512x512/);
  }
});
test("Masse: ohne IHDR direkt nach der Signatur abgelehnt", () => {
  const ohneIhdr = Buffer.concat([PNG_SIG, Buffer.from("tiny")]).toString("base64");
  const kopf = pngKopf();
  const falscherName = Buffer.from(kopf); falscherName.write("IDAT", 12, "latin1");
  const falscheLaenge = Buffer.from(kopf); falscheLaenge.writeUInt32BE(14, 8);
  for (const png of [ohneIhdr, falscherName.toString("base64"), falscheLaenge.toString("base64"), kopf.subarray(0, 23).toString("base64")]) {
    const r = pruefeKachelNachricht({ typ: "kachel", kachel: "1,1", png });
    assert.equal(r.ok, false);
  }
});
test("pngMasse liest Breite und Hoehe", () => {
  assert.deepEqual(pngMasse(pngKopf(512, 512)), { breite: 512, hoehe: 512 });
  assert.deepEqual(pngMasse(pngKopf(30000, 7)), { breite: 30000, hoehe: 7 });
  assert.deepEqual(pngMasse(pngKopf(0xffffffff, 1)), { breite: 0xffffffff, hoehe: 1 });
  assert.equal(pngMasse(PNG_SIG), null);
  assert.equal(pngMasse(null), null);
});
test("lehnt falschen Typ, Nicht-Objekt, kaputtes Base64 und Nicht-String-png ab", () => {
  for (const n of [null, undefined, "x", 5, [], { typ: "hallo", kachel: "1,1", png: null }, { kachel: "1,1", png: null }]) {
    assert.equal(pruefeKachelNachricht(n).ok, false);
  }
  assert.equal(pruefeKachelNachricht({ typ: "kachel", kachel: "1,1", png: "!!!nicht base64!!!" }).ok, false);
  assert.equal(pruefeKachelNachricht({ typ: "kachel", kachel: "1,1", png: 42 }).ok, false);
  assert.equal(pruefeKachelNachricht({ typ: "kachel", kachel: "1,1", png: "" }).ok, false);
  assert.equal(pruefeKachelNachricht({ typ: "kachel", kachel: "1,1" }).ok, false);
});
test("ignoriert Feld autor", () => {
  const r = pruefeKachelNachricht({ typ: "kachel", kachel: "1,1", png: null, autor: "mallory" });
  assert.equal(r.ok, true);
  assert.equal("autor" in r, false);
});
test("KENNUNG", () => {
  assert.ok(KENNUNG.test("anna-1"));
  assert.ok(!KENNUNG.test("Anna"));
  assert.ok(!KENNUNG.test(""));
  assert.ok(!KENNUNG.test("a".repeat(41)));
});
