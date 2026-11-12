import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { pngAlphaImRechteck } from "../abgleich/png-alpha.mjs";

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function chunk(art, daten) {
  const k = Buffer.alloc(12 + daten.length);
  k.writeUInt32BE(daten.length, 0);
  k.write(art, 4, "latin1");
  daten.copy(k, 8);
  // CRC wird vom Dekoder nicht geprueft
  return k;
}
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
// pixel: RGBA-Puffer breite*hoehe*4; filterJeZeile: Funktion zeile -> 0..4
function pngAus(breite, hoehe, pixel, { farbe = 6, filter = () => 0, kanaele = 4 } = {}) {
  const zeile = breite * kanaele;
  const roh = Buffer.alloc(hoehe * (zeile + 1));
  for (let y = 0; y < hoehe; y++) {
    const f = filter(y);
    roh[y * (zeile + 1)] = f;
    for (let i = 0; i < zeile; i++) {
      const x = pixel[y * zeile + i];
      const a = i >= kanaele ? pixel[y * zeile + i - kanaele] : 0;
      const b = y > 0 ? pixel[(y - 1) * zeile + i] : 0;
      const c = i >= kanaele && y > 0 ? pixel[(y - 1) * zeile + i - kanaele] : 0;
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][f];
      roh[y * (zeile + 1) + 1 + i] = (x - pred) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breite, 0);
  ihdr.writeUInt32BE(hoehe, 4);
  ihdr[8] = 8;
  ihdr[9] = farbe;
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(roh)), chunk("IEND", Buffer.alloc(0))]);
}
function kachel(punkte = [], optionen = {}) {
  const px = Buffer.alloc(512 * 512 * 4);
  for (const [x, y, a = 255] of punkte) px.writeUInt32BE(((0x10 << 24) | (0x20 << 16) | (0x30 << 8) | a) >>> 0, (y * 512 + x) * 4);
  return pngAus(512, 512, px, optionen);
}
const R = { x: 0, y: 0, w: 200, h: 200 };

test("leere_kachel_ohne_alpha", () => {
  assert.equal(pngAlphaImRechteck(kachel(), R), false);
  assert.equal(pngAlphaImRechteck(kachel([[10, 10, 0]]), R), false);
});

test("punkt_im_rechteck", () => {
  assert.equal(pngAlphaImRechteck(kachel([[10, 10]]), R), true);
  assert.equal(pngAlphaImRechteck(kachel([[199, 199, 1]]), R), true);
});

test("punkt_ausserhalb", () => {
  assert.equal(pngAlphaImRechteck(kachel([[400, 400]]), R), false);
  assert.equal(pngAlphaImRechteck(kachel([[200, 10]]), R), false);
  assert.equal(pngAlphaImRechteck(kachel([[10, 200]]), R), false);
});

test("alle_filter", () => {
  const px = Buffer.alloc(8 * 8 * 4);
  for (let i = 0; i < px.length; i++) px[i] = (i * 37 + 11) % 251;
  for (let i = 3; i < px.length; i += 4) px[i] = 0;
  px[(5 * 8 + 6) * 4 + 3] = 77;
  for (let f = 0; f <= 4; f++) {
    const png = pngAus(8, 8, px, { filter: () => f });
    assert.equal(pngAlphaImRechteck(png, { x: 6, y: 5, w: 1, h: 1 }), true, `Filter ${f}: Punkt`);
    assert.equal(pngAlphaImRechteck(png, { x: 0, y: 0, w: 8, h: 5 }), false, `Filter ${f}: leere Zeilen`);
    assert.equal(pngAlphaImRechteck(png, { x: 0, y: 5, w: 6, h: 1 }), false, `Filter ${f}: Zeile links`);
  }
  // gemischt je Zeile
  const png = pngAus(8, 8, px, { filter: (y) => y % 5 });
  assert.equal(pngAlphaImRechteck(png, { x: 6, y: 5, w: 1, h: 1 }), true);
  assert.equal(pngAlphaImRechteck(png, { x: 0, y: 0, w: 8, h: 5 }), false);
});

test("fremdes_format_fail_closed", () => {
  const rgb = pngAus(4, 4, Buffer.alloc(4 * 4 * 3), { farbe: 2, kanaele: 3 });
  assert.equal(pngAlphaImRechteck(rgb, { x: 0, y: 0, w: 4, h: 4 }), true);
  assert.equal(pngAlphaImRechteck(Buffer.from("kein png"), R), true);
  assert.equal(pngAlphaImRechteck(kachel().subarray(0, 100), R), true);
});
