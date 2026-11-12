// Liegt im Rechteck einer PNG-Kachel ein Pixel mit Alpha > 0?
// Dekodiert nur RGBA, 8 Bit, ohne Interlace (so schreibt PenEcho seine Kacheln). Alles andere,
// auch jeder Fehler beim Lesen, gilt als "Pixel vorhanden" (fail-closed).
import zlib from "node:zlib";

const SIGNATUR = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_PIXEL = 4096 * 4096;

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function dekodiere(png) {
  if (png.length < 33 || !png.subarray(0, 8).equals(SIGNATUR)) return null;
  let pos = 8;
  let kopf = null;
  const idat = [];
  while (pos + 12 <= png.length) {
    const laenge = png.readUInt32BE(pos);
    const art = png.toString("latin1", pos + 4, pos + 8);
    if (pos + 12 + laenge > png.length) return null;
    const daten = png.subarray(pos + 8, pos + 8 + laenge);
    if (art === "IHDR") {
      if (laenge !== 13) return null;
      kopf = {
        breite: daten.readUInt32BE(0),
        hoehe: daten.readUInt32BE(4),
        tiefe: daten[8],
        farbe: daten[9],
        verschachtelt: daten[12],
      };
    } else if (art === "IDAT") idat.push(daten);
    else if (art === "IEND") break;
    pos += 12 + laenge;
  }
  if (!kopf || kopf.tiefe !== 8 || kopf.farbe !== 6 || kopf.verschachtelt !== 0) return null;
  if (kopf.breite < 1 || kopf.hoehe < 1 || kopf.breite * kopf.hoehe > MAX_PIXEL) return null;
  const zeile = kopf.breite * 4;
  const roh = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: kopf.hoehe * (zeile + 1) });
  if (roh.length !== kopf.hoehe * (zeile + 1)) return null;
  const pixel = Buffer.alloc(kopf.hoehe * zeile);
  for (let y = 0; y < kopf.hoehe; y++) {
    const filter = roh[y * (zeile + 1)];
    const von = y * (zeile + 1) + 1;
    const nach = y * zeile;
    for (let i = 0; i < zeile; i++) {
      const x = roh[von + i];
      const a = i >= 4 ? pixel[nach + i - 4] : 0;
      const b = y > 0 ? pixel[nach - zeile + i] : 0;
      const c = i >= 4 && y > 0 ? pixel[nach - zeile + i - 4] : 0;
      let v;
      if (filter === 0) v = x;
      else if (filter === 1) v = x + a;
      else if (filter === 2) v = x + b;
      else if (filter === 3) v = x + ((a + b) >> 1);
      else if (filter === 4) v = x + paeth(a, b, c);
      else return null;
      pixel[nach + i] = v & 0xff;
    }
  }
  return { breite: kopf.breite, hoehe: kopf.hoehe, pixel };
}

export function pngAlphaImRechteck(png, { x, y, w, h }) {
  try {
    const bild = dekodiere(Buffer.from(png.buffer, png.byteOffset, png.byteLength));
    if (!bild) return true;
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(bild.breite, x + w);
    const y1 = Math.min(bild.hoehe, y + h);
    for (let zy = y0; zy < y1; zy++) {
      for (let zx = x0; zx < x1; zx++) {
        if (bild.pixel[(zy * bild.breite + zx) * 4 + 3] > 0) return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}
