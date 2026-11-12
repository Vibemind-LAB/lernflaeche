"use strict";
// Öffentliche Fassung: eigene visuelle Identität (TRADEMARKS.md, "Forks and redistributed builds")
// und keine sichtbaren Angebote des Ursprungsprojekts, die als Teil der Lernfläche erscheinen.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const wurzel = path.join(__dirname, "..");
const lies = (datei) => fs.readFileSync(path.join(wurzel, datei), "utf8");

test("Favicon und Wortmarke nutzen das VibeMind-Logo, nicht die PenEcho-Zeichen", () => {
  for (const seite of ["public/index.html", "public/access.html"]) {
    const html = lies(seite);
    assert.match(html, /<link rel="icon" type="image\/png" href="lernflaeche-favicon\.png">/, seite);
    assert.match(html, /<img src="lernflaeche-favicon\.png" alt="">/, seite);
  }
  assert.match(lies("public/viewer.css"), /mask: url\("vibemind-mark\.png"\)/);
  for (const bild of ["public/lernflaeche-favicon.png", "public/vibemind-mark.png"]) {
    const bytes = fs.readFileSync(path.join(wurzel, bild));
    assert.equal(bytes.subarray(1, 4).toString("latin1"), "PNG", bild);
  }
});

test("keine PenEcho-Bildzeichen mehr in Oberfläche und Paket", () => {
  const dateien = ["public/index.html", "public/access.html", "public/widget-host.html", "public/style.css",
    "public/viewer.css", "public/access.css", "public/studio-shell.css", "public/app.js", "public/viewer.js", "package.json"];
  for (const datei of dateien) {
    assert.ok(!/penecho-(favicon|mark|readme-header|architecture)\.(png|webp)/.test(lies(datei)), datei);
  }
  for (const alt of ["penecho-favicon.png", "penecho-mark.png", "penecho-readme-header.webp", "penecho-readme-header-dark.webp", "penecho-architecture.webp"]) {
    assert.equal(fs.existsSync(path.join(wurzel, "public", alt)), false, alt);
  }
});

test("Kimi-Hinweis ohne Partner-Anspruch und ohne Affiliate-Kennung des Ursprungsprojekts", () => {
  for (const datei of ["public/index.html", "public/app.js", "src/client/app/core.js", "public/locales/zh.js"]) {
    const text = lies(datei);
    assert.ok(!/aff=penecho/.test(text), datei);
    assert.ok(!/settingsKimiPartner|Open Source Partner|开源合作伙伴/.test(text), datei);
  }
});

test("Community-Link des Ursprungsprojekts bleibt ausgeblendet", () => {
  assert.match(lies("public/index.html"), /<a id="craftsEchoesLink"[^>]*\shidden>/);
  assert.match(lies("public/style.css"), /#craftsEchoesLink \{ display: none !important; \}/);
});

test("NOTICE nennt die Lernfläche als veränderte, nicht offizielle Fassung", () => {
  const notice = lies("NOTICE").replace(/\s+/g, " ");
  assert.match(notice, /Lernfläche ist eine veränderte Fassung von PenEcho \(https:\/\/github\.com\/penecho\/penecho\), AGPL-3\.0-only; keine offizielle PenEcho-Fassung\./);
});
