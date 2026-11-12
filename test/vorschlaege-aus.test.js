"use strict";
// Lernflaeche: Die Vorschlags-Klassifikation des Ursprungsprojekts fragt dessen Cloud-Dienst an,
// ohne Konto als Gast. Ab Werk ist sie deshalb aus; nur ein ausdrueckliches Einschalten erlaubt sie.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { cloudJeVisionConfig, cloudVorschlaegeErlaubt } = require("../src/server/jevision.js");

const VERBINDER = { status: () => ({}), defaultOrigin: "https://cloud.invalid" };
const konfig = (env = {}, datei = {}) => cloudJeVisionConfig(VERBINDER, env, datei);

test("ohne Einstellung: aus", () => {
  assert.equal(konfig().configured, false);
  assert.equal(cloudVorschlaegeErlaubt(konfig()), false);
});

test("nur ausdrueckliches Einschalten erlaubt die Cloud-Vorschlaege", () => {
  for (const wert of ["1", "true", "TRUE", "on", "yes"]) {
    assert.equal(konfig({ PENECHO_JEVISION_ENABLED: wert }).configured, true, wert);
    assert.equal(cloudVorschlaegeErlaubt(konfig({ PENECHO_JEVISION_ENABLED: wert })), true, wert);
  }
  for (const wert of ["0", "false", "off", "no", "", "vielleicht"]) {
    assert.equal(konfig({ PENECHO_JEVISION_ENABLED: wert }).configured, false, wert);
  }
});

test("die Konfigurationsdatei kann einschalten, die Umgebung hat Vorrang", () => {
  assert.equal(konfig({}, { PENECHO_JEVISION_ENABLED: "true" }).configured, true);
  assert.equal(konfig({ PENECHO_JEVISION_ENABLED: "false" }, { PENECHO_JEVISION_ENABLED: "true" }).configured, false);
});

test("Demo-Modus bleibt lokal nutzbar, erlaubt aber keine Cloud-Anfrage", () => {
  const demo = konfig({ PENECHO_JEVISION_MOCK: "auto" });
  assert.equal(demo.configured, true);
  assert.equal(demo.mock, "auto");
  assert.equal(cloudVorschlaegeErlaubt(demo), false);
});

test("der Einstellungs-Weg der Vorschlaege prueft die Erlaubnis vor der Cloud-Anfrage", () => {
  const main = fs.readFileSync(path.join(__dirname, "..", "src", "server", "main.js"), "utf8");
  const anfang = main.indexOf('url.pathname==="/api/suggest/preferences"');
  assert.ok(anfang > 0, "Weg /api/suggest/preferences nicht gefunden");
  const abschnitt = main.slice(anfang, main.indexOf("suggestionRequest(\"/preferences\"", anfang));
  assert.match(abschnitt, /cloudVorschlaegeErlaubt\(config\)/);
});
