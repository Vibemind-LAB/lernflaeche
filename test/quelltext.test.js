"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { quelltextAusliefern } = require("../src/server/quelltext.js");

function starte(ordner) {
  const server = http.createServer((req, res) => {
    if (!quelltextAusliefern(req, res, { ordner })) { res.writeHead(418); res.end("weiter"); }
  });
  return new Promise(ok => server.listen(0, "127.0.0.1", () => ok({ server, port: server.address().port })));
}
function hole(port, pfad, methode = "GET") {
  return new Promise((ok, fehler) => {
    const req = http.request({ host: "127.0.0.1", port, path: pfad, method: methode }, res => {
      const teile = [];
      res.on("data", t => teile.push(t));
      res.on("end", () => ok({ status: res.statusCode, kopf: res.headers, body: Buffer.concat(teile) }));
    });
    req.on("error", fehler);
    req.end();
  });
}

test("ohne Archiv: 404 mit deutschem Text", async () => {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "quelltext-leer-"));
  const { server, port } = await starte(ordner);
  try {
    const r = await hole(port, "/quelltext");
    assert.equal(r.status, 404);
    assert.match(r.body.toString("utf8"), /Quelltext/);
  } finally { server.close(); fs.rmSync(ordner, { recursive: true, force: true }); }
});

test("fehlender Ordner: ebenfalls 404", async () => {
  const { server, port } = await starte(path.join(os.tmpdir(), "quelltext-gibt-es-nicht-xyz"));
  try { assert.equal((await hole(port, "/quelltext")).status, 404); } finally { server.close(); }
});

test("mit Archiv: 200, Köpfe und genau diese Bytes (neuestes gewinnt)", async () => {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "quelltext-voll-"));
  const alt = path.join(ordner, "lernflaeche-0000000.tar.gz");
  const neu = path.join(ordner, "lernflaeche-abc1234.tar.gz");
  fs.writeFileSync(alt, Buffer.from([1, 2, 3]));
  const bytes = Buffer.from([0x1f, 0x8b, 8, 0, 9, 8, 7, 6, 5, 0, 255]);
  fs.writeFileSync(neu, bytes);
  fs.utimesSync(alt, new Date(2020, 0, 1), new Date(2020, 0, 1));
  const { server, port } = await starte(ordner);
  try {
    const r = await hole(port, "/quelltext");
    assert.equal(r.status, 200);
    assert.equal(r.kopf["content-type"], "application/gzip");
    assert.equal(r.kopf["content-disposition"], 'attachment; filename="lernflaeche-abc1234.tar.gz"');
    assert.deepEqual(r.body, bytes);
  } finally { server.close(); fs.rmSync(ordner, { recursive: true, force: true }); }
});

test("andere Pfade und Methoden werden nicht beantwortet", async () => {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "quelltext-weg-"));
  const { server, port } = await starte(ordner);
  try {
    assert.equal((await hole(port, "/quelltext/x")).status, 418);
    assert.equal((await hole(port, "/", "GET")).status, 418);
    assert.equal((await hole(port, "/quelltext", "POST")).status, 418);
    assert.equal((await hole(port, "/quelltext?a=1")).status, 404);
  } finally { server.close(); fs.rmSync(ordner, { recursive: true, force: true }); }
});

test("Oberfläche enthält den Quelltext-Link neben dem PenEcho-Vermerk", () => {
  const wurzel = path.join(__dirname, "..");
  const index = fs.readFileSync(path.join(wurzel, "public", "index.html"), "utf8");
  assert.match(index, /<a[^>]*href="\/quelltext"[^>]*>Quelltext<\/a>/);
  assert.match(index, /basiert auf PenEcho/);
  const zugang = fs.readFileSync(path.join(wurzel, "public", "access.html"), "utf8");
  assert.match(zugang, /<a[^>]*href="\/quelltext"[^>]*>Quelltext<\/a>/);
  assert.match(zugang, /basiert auf PenEcho/);
});

test("package.json trägt den eigenen Namen und die Basisversion", () => {
  const pkg = require("../package.json");
  assert.equal(pkg.name, "lernflaeche");
  assert.equal(pkg.version, "0.1.0");
  assert.equal(pkg.lernflaeche.basisPenecho, "1.4.2");
  assert.notEqual(pkg.productName, "PenEcho");
});

test("sichtbarer Name: Seitentitel ohne PenEcho, keine Upstream-Downloads", () => {
  const wurzel = path.join(__dirname, "..");
  for (const datei of ["index.html", "access.html"]) {
    const html = fs.readFileSync(path.join(wurzel, "public", datei), "utf8");
    const titel = html.match(/<title>([^<]*)<\/title>/)[1];
    assert.match(titel, /Lernfläche/);
    assert.doesNotMatch(titel, /PenEcho/);
  }
  const index = fs.readFileSync(path.join(wurzel, "public", "index.html"), "utf8");
  assert.doesNotMatch(index, /releases\/latest/);
  assert.match(index, /basiert auf PenEcho \(Upstream-Quelltext\)/);
});
