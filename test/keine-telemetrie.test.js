"use strict";
// Lernflaeche: keine Telemetrie des Ursprungsprojekts (taeglicher Beacon /a/p.png mit Installationskennung).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { SOURCES } = require("../scripts/build-client.js");

const WURZEL = path.resolve(__dirname, "..");

test("client-activity.js steht nicht in der Buendelliste", () => {
  assert.ok(Array.isArray(SOURCES) && SOURCES.length > 0);
  assert.equal(SOURCES.some((datei) => /client-activity\.js$/.test(datei)), false);
});

test("public/app.js enthaelt weder den Beacon noch die Installationskennung", () => {
  const app = fs.readFileSync(path.join(WURZEL, "public", "app.js"), "utf8");
  assert.equal(app.includes("/a/p.png"), false);
  assert.equal(app.includes("penecho-anonymous-installation-id"), false);
});
