"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function lade() {
  const code = fs.readFileSync(path.join(__dirname, "..", "src", "client", "app", "document-identity.js"), "utf8");
  const ctx = vm.createContext({});
  vm.runInContext(code + "\nthis.__ident = canvasDocumentIdentity;", ctx);
  return ctx.__ident;
}

const SCHLUESSEL = "agent-" + "a".repeat(64);
const metadaten = { version: 1, documentId: "doc-1", title: "", context: "", bindings: [], locators: [], processor: null };

function arbeitsbereich(client) {
  return { version: 1, sessions: [], messages: [], internalSessions: [{ sessionKey: SCHLUESSEL, client, documentId: "doc-1", title: "Agent", status: "working" }] };
}

test("interne Sitzung mit persistiertem client \"PenEcho Agent\" überlebt das Wiederherstellen", () => {
  const ident = lade();
  const r = ident.normalizeWorkspace(arbeitsbereich("PenEcho Agent"), metadaten);
  assert.ok(r, "Arbeitsbereich wird erkannt");
  assert.equal(r.internalSessions?.length, 1);
  assert.equal(r.internalSessions[0].sessionKey, SCHLUESSEL);
  assert.equal(r.internalSessions[0].client, "PenEcho Agent");
});

test("fremder client wird weiterhin verworfen", () => {
  const ident = lade();
  const r = ident.normalizeWorkspace(arbeitsbereich("Lernfläche Agent"), metadaten);
  assert.equal(r.internalSessions, undefined);
});
