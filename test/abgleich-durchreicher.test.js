"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const WebSocket = require("ws");
const net = require("node:net");
const { abgleichDurchreichen, MAX_WARTEND_NACHRICHTEN } = require("../src/server/abgleich-durchreicher.js");
const { pngKopf } = require("./abgleich-hilfe.cjs");

const PNG = pngKopf(512, 512, "rest");
const gleicherOrigin = (req) => {
  try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; }
};

async function aufbauen({ pruefe = gleicherOrigin, ziel, ...optionen } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "durchreicher-"));
  const { starteDienst } = await import(pathToFileURL(path.join(__dirname, "..", "abgleich", "dienst.mjs")).href);
  const dienst = await starteDienst({ port: 0, speicherPfad: path.join(dir, "a.db"), offen: true });
  const server = http.createServer((_q, r) => r.end("ok"));
  abgleichDurchreichen(server, { ziel: ziel ?? `ws://127.0.0.1:${dienst.port}`, pruefe, ...optionen });
  await new Promise((res) => server.listen(0, "127.0.0.1", res));
  const port = server.address().port;
  return {
    server, port, dienst,
    async zu() {
      server.closeAllConnections();
      await new Promise((res) => server.close(res));
      await dienst.schliessen();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

const oeffnen = (port, pfad, headers, wsOptionen = {}) => new Promise((res, rej) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${pfad}`, { headers: { origin: `http://127.0.0.1:${port}`, ...headers }, ...wsOptionen });
  const eingang = [];
  const warter = [];
  ws.on("message", (d) => {
    const m = JSON.parse(d.toString());
    if (m.typ === "anwesend" || m.typ === "zeiger") return; // fluechtig, hier nicht Gegenstand
    const w = warter.shift();
    w ? w(m) : eingang.push(m);
  });
  ws.naechste = () => new Promise((r) => { const m = eingang.shift(); m ? r(m) : warter.push(r); });
  ws.geschlossen = new Promise((r) => ws.on("close", (code, grund) => r({ code, grund: grund.toString() })));
  ws.once("open", () => res(ws));
  ws.once("error", rej);
});

test("reicht Kachel durch und zurueck", async () => {
  const t = await aufbauen();
  try {
    const q = "?flaeche=f1&person=anna&fenster=fa";
    const a = await oeffnen(t.port, `/api/abgleich${q}`);
    const b = await oeffnen(t.port, "/api/abgleich?flaeche=f1&person=ben&fenster=fb");
    a.send(JSON.stringify({ typ: "hallo", seit: null }));
    b.send(JSON.stringify({ typ: "hallo", seit: null }));
    assert.equal((await a.naechste()).typ, "stand");
    assert.equal((await b.naechste()).typ, "stand");
    a.send(JSON.stringify({ typ: "kachel", kachel: "0,0", png: PNG.toString("base64") }));
    const ok = await a.naechste();
    assert.equal(ok.typ, "ok");
    assert.equal(ok.kachel, "0,0");
    const m = await b.naechste();
    assert.equal(m.typ, "eintrag");
    assert.equal(m.autor, "anna");
    assert.equal(m.kachel, "0,0");
    assert.equal(m.png, PNG.toString("base64"));
    a.close(); b.close();
  } finally { await t.zu(); }
});

test("fremder Origin wird mit 403 abgelehnt", async () => {
  const t = await aufbauen();
  try {
    const status = await new Promise((res, rej) => {
      const ws = new WebSocket(`ws://127.0.0.1:${t.port}/api/abgleich?flaeche=f1&person=anna`, { headers: { origin: "http://boese.example" } });
      ws.once("unexpected-response", (_q, r) => { res(r.statusCode); r.resume(); });
      ws.once("open", () => rej(new Error("haette abgelehnt werden muessen")));
      ws.once("error", () => {});
    });
    assert.equal(status, 403);
  } finally { await t.zu(); }
});

test("anderer Pfad bleibt unberuehrt", async () => {
  const t = await aufbauen();
  try {
    const wss = new WebSocket.WebSocketServer({ noServer: true });
    t.server.on("upgrade", (req, socket, head) => {
      if (req.url !== "/x") return;
      wss.handleUpgrade(req, socket, head, (ws) => ws.send("hallo-x"));
    });
    const text = await new Promise((res, rej) => {
      const ws = new WebSocket(`ws://127.0.0.1:${t.port}/x`);
      ws.once("message", (d) => { res(d.toString()); ws.close(); });
      ws.once("error", rej);
    });
    assert.equal(text, "hallo-x");
    wss.close();
  } finally { await t.zu(); }
});

test("Schliesscode 4409 kommt beim Browser an", async () => {
  const t = await aufbauen();
  try {
    const q = "/api/abgleich?flaeche=f1&person=anna&fenster=";
    const alt = await oeffnen(t.port, `${q}alt`);
    alt.send(JSON.stringify({ typ: "hallo", seit: null }));
    await alt.naechste();
    const neu = await oeffnen(t.port, `${q}neu`);
    neu.send(JSON.stringify({ typ: "hallo", seit: null }));
    const zu = await alt.geschlossen;
    assert.equal(zu.code, 4409);
    assert.match(zu.grund, /anderen Fenster/);
    neu.close();
  } finally { await t.zu(); }
});

test("abgelehnte Pruefung liefert 403", async () => {
  const t = await aufbauen({ pruefe: async () => false });
  try {
    const status = await new Promise((res, rej) => {
      const ws = new WebSocket(`ws://127.0.0.1:${t.port}/api/abgleich?flaeche=f1&person=anna`, { headers: { origin: `http://127.0.0.1:${t.port}` } });
      ws.once("unexpected-response", (_q, r) => { res(r.statusCode); r.resume(); });
      ws.once("open", () => rej(new Error("offen")));
      ws.once("error", () => {});
    });
    assert.equal(status, 403);
  } finally { await t.zu(); }
});

test("unerreichbares Ziel schliesst mit 1011", async () => {
  const t = await aufbauen({ ziel: "ws://127.0.0.1:1" });
  try {
    const ws = await oeffnen(t.port, "/api/abgleich?flaeche=f1&person=anna&fenster=fa");
    assert.equal((await ws.geschlossen).code, 1011);
  } finally { await t.zu(); }
});

// Ein Ziel, das die TCP-Verbindung annimmt, aber nie antwortet (verlorene SYN-ACKs, haengender Dienst).
async function stummesZiel() {
  const sockets = new Set();
  const stumm = net.createServer((s) => { sockets.add(s); s.resume(); s.on("error", () => {}); s.on("close", () => sockets.delete(s)); });
  await new Promise((res) => stumm.listen(0, "127.0.0.1", res));
  return {
    url: `ws://127.0.0.1:${stumm.address().port}`,
    offen: () => sockets.size,
    async zu() { for (const s of sockets) s.destroy(); await new Promise((res) => stumm.close(res)); },
  };
}

test("haengender Dienst: handshakeTimeout schliesst den Browser mit 1011", async () => {
  const stumm = await stummesZiel();
  const t = await aufbauen({ ziel: stumm.url, handshakeMs: 200 });
  try {
    const start = Date.now();
    const ws = await oeffnen(t.port, "/api/abgleich?flaeche=f1&person=anna&fenster=fa");
    ws.send(JSON.stringify({ typ: "hallo", seit: null }));
    const zu = await ws.geschlossen;
    assert.equal(zu.code, 1011);
    assert.ok(Date.now() - start < 3000, "nicht rechtzeitig geschlossen");
  } finally { await t.zu(); await stumm.zu(); }
});

test("Warteschlange vor dem Oeffnen ist begrenzt: Ueberlauf schliesst mit 1013", async () => {
  const stumm = await stummesZiel();
  const t = await aufbauen({ ziel: stumm.url, handshakeMs: 30000 });
  try {
    const ws = await oeffnen(t.port, "/api/abgleich?flaeche=f1&person=anna&fenster=fa");
    for (let i = 0; i <= MAX_WARTEND_NACHRICHTEN; i++) ws.send(JSON.stringify({ typ: "kachel", kachel: "0,0", png: null }));
    const zu = await ws.geschlossen;
    assert.equal(zu.code, 1013);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(stumm.offen(), 0, "Upstream nach dem Ueberlauf noch offen");
  } finally { await t.zu(); await stumm.zu(); }
});

test("Browser schliesst vor dem Upstream-Handshake: Upstream wird abgebaut", async () => {
  const stumm = await stummesZiel();
  const t = await aufbauen({ ziel: stumm.url, handshakeMs: 30000 });
  try {
    const ws = await oeffnen(t.port, "/api/abgleich?flaeche=f1&person=anna&fenster=fa");
    for (let i = 0; i < 50 && stumm.offen() === 0; i++) await new Promise((r) => setTimeout(r, 10));
    assert.equal(stumm.offen(), 1, "Upstream wurde nicht aufgebaut");
    ws.close();
    await ws.geschlossen;
    for (let i = 0; i < 50 && stumm.offen() > 0; i++) await new Promise((r) => setTimeout(r, 10));
    assert.equal(stumm.offen(), 0, "Upstream blieb offen");
  } finally { await t.zu(); await stumm.zu(); }
});

test("Herzschlag: Browser ohne pong wird beendet, der Dienst gibt den Platz frei", async () => {
  const t = await aufbauen({ herzschlagMs: 60 });
  try {
    const tot = await oeffnen(t.port, "/api/abgleich?flaeche=f1&person=anna&fenster=fa", {}, { autoPong: false });
    tot.send(JSON.stringify({ typ: "hallo", seit: null }));
    assert.equal((await tot.naechste()).typ, "stand");
    const zu = await tot.geschlossen;
    assert.equal(zu.code, 1006);
    // Der Dienst hat die Verbindung verloren: frisches Laden derselben Person laeuft ohne Uebernahme
    const lebt = await oeffnen(t.port, "/api/abgleich?flaeche=f1&person=anna&fenster=fb");
    lebt.send(JSON.stringify({ typ: "hallo", seit: null }));
    assert.equal((await lebt.naechste()).typ, "stand");
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(lebt.readyState, WebSocket.OPEN, "lebende Verbindung wurde beendet");
    lebt.close();
  } finally { await t.zu(); }
});
