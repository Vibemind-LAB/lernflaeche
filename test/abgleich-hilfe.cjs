"use strict";
// Testhilfe: PNG-Kopf (Signatur + IHDR) mit frei waehlbaren Massen. Der Dienst dekodiert nicht,
// er prueft nur Signatur und IHDR; der Rest darf beliebig sein.
function pngKopf(breite = 512, hoehe = 512, rest = "") {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4, "latin1");
  ihdr.writeUInt32BE(breite, 8);
  ihdr.writeUInt32BE(hoehe, 12);
  ihdr[16] = 8; // Bittiefe
  ihdr[17] = 6; // RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, Buffer.from(rest)]);
}
const png64 = (rest = "", breite = 512, hoehe = 512) => pngKopf(breite, hoehe, rest).toString("base64");

// Echte 512x512-RGBA-Kachel (Filter 0) mit deckenden Pixeln an den Stellen [x, y].
const zlib = require("node:zlib");
function pngMitPunkten(punkte = []) {
  const zeile = 512 * 4;
  const roh = Buffer.alloc(512 * (zeile + 1));
  for (const [x, y] of punkte) roh.writeUInt32BE(0x102030ff, y * (zeile + 1) + 1 + x * 4);
  const chunk = (art, daten) => {
    const k = Buffer.alloc(12 + daten.length);
    k.writeUInt32BE(daten.length, 0);
    k.write(art, 4, "latin1");
    daten.copy(k, 8);
    return k;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(512, 0);
  ihdr.writeUInt32BE(512, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(roh)), chunk("IEND", Buffer.alloc(0)),
  ]);
}
const pngEcht64 = (punkte) => pngMitPunkten(punkte).toString("base64");
module.exports = { pngKopf, png64, pngMitPunkten, pngEcht64 };
