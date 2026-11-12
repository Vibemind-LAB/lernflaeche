"use strict";
// AGPL §13: Jede Person, die die laufende Fassung nutzt, kann den passenden Quelltext holen.
// GET /quelltext liefert das neueste lernflaeche-*.tar.gz aus dem Quelltext-Ordner (beim
// Ausliefern per scripts/quelltext-paket.mjs gebaut). Es wird nichts veröffentlicht.
const fs = require("node:fs");
const path = require("node:path");

const MUSTER = /^lernflaeche-[0-9a-f]{7,40}\.tar\.gz$/;

function neuesterAbzug(ordner) {
  let namen;
  try { namen = fs.readdirSync(ordner); } catch { return null; }
  let beste = null;
  for (const name of namen) {
    if (!MUSTER.test(name)) continue;
    let st;
    try { st = fs.statSync(path.join(ordner, name)); } catch { continue; }
    if (!st.isFile()) continue;
    if (!beste || st.mtimeMs > beste.mtimeMs) beste = { name, datei: path.join(ordner, name), mtimeMs: st.mtimeMs, groesse: st.size };
  }
  return beste;
}

function quelltextAusliefern(req, res, { ordner }) {
  if (req.method !== "GET") return false;
  let pfad;
  try { pfad = new URL(req.url, "http://localhost").pathname; } catch { return false; }
  if (pfad !== "/quelltext") return false;
  const abzug = neuesterAbzug(ordner);
  if (!abzug) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end("Der Quelltext liegt auf diesem Rechner noch nicht bereit. Bitte wenden Sie sich an die Person, die diese Lernfläche betreibt.");
    return true;
  }
  res.writeHead(200, {
    "Content-Type": "application/gzip",
    "Content-Disposition": `attachment; filename="${abzug.name}"`,
    "Content-Length": abzug.groesse,
    "Cache-Control": "no-store",
  });
  const strom = fs.createReadStream(abzug.datei);
  strom.on("error", () => res.destroy());
  strom.pipe(res);
  return true;
}

module.exports = { quelltextAusliefern, neuesterAbzug };
