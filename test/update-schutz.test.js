"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { maybeUpdateOnStart, updateCheckAllowed } = require("../src/cli/update.js");

function ttyOptionen(extra = {}) {
  const geschrieben = [];
  const strom = { isTTY: true, write: t => { geschrieben.push(String(t)); return true; } };
  return { geschrieben, optionen: { input: strom, output: strom, errorOutput: strom, env: {}, ...extra } };
}

test("ohne eingespeisten Prüfer: kein Update-Check, keine Installation, keine Netzanfrage", async () => {
  let netz = 0, installiert = 0;
  const { optionen, geschrieben } = ttyOptionen({
    updateFetch: async () => { netz++; throw new Error("darf nicht aufgerufen werden"); },
    updateInstaller: async () => { installiert++; return true; },
  });
  assert.equal(updateCheckAllowed(optionen), false);
  const r = await maybeUpdateOnStart([], optionen);
  assert.deepEqual(r, { checked: false, restarted: false });
  assert.equal(netz, 0);
  assert.equal(installiert, 0);
  assert.equal(geschrieben.length, 0);
});

test("mit ausdrücklich eingespeistem Prüfer läuft der Check weiter (nur für Tests)", async () => {
  const { optionen } = ttyOptionen({ updateChecker: async () => "0.0.1" });
  assert.equal(updateCheckAllowed(optionen), true);
  const r = await maybeUpdateOnStart([], optionen);
  assert.equal(r.checked, true);
  assert.equal(r.restarted, false);
});
