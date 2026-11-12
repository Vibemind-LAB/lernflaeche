import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { starteVorsatz } from "../abgleich/probe/tailnet_vorsatz.mjs";

// Platzhalter, keine echte Tailnet-Adresse.
const HERKUNFT = "https://pc.beispiel-tailnet.ts.net";

// Unechte Flaeche: meldet, was bei ihr ankommt (Host, Origin, Referer, Pfad, Koerper).
async function mitAufbau(fn) {
  const gesehen = [];
  const flaeche = http.createServer((req, res) => {
    let koerper = "";
    req.on("data", (d) => { koerper += d; });
    req.on("end", () => {
      gesehen.push({ art: "http", host: req.headers.host, origin: req.headers.origin, referer: req.headers.referer, url: req.url });
      if (req.url === "/umleiten") {
        res.writeHead(302, { location: `http://${req.headers.host}/ziel` });
        return res.end();
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ host: req.headers.host, origin: req.headers.origin ?? null, url: req.url, methode: req.method, koerper }));
    });
  });
  const wss = new WebSocketServer({ noServer: true });
  flaeche.on("upgrade", (req, socket, head) => {
    gesehen.push({ art: "ws", host: req.headers.host, origin: req.headers.origin, url: req.url });
    if (!req.url.startsWith("/api/abgleich")) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.send(JSON.stringify({ host: req.headers.host, origin: req.headers.origin, url: req.url }));
      ws.on("message", (d) => ws.send(`echo:${d}`));
    });
  });
  await new Promise((res) => flaeche.listen(0, "127.0.0.1", res));
  const ziel = `127.0.0.1:${flaeche.address().port}`;
  const vorsatz = await starteVorsatz({ port: 0, ziel, herkunft: HERKUNFT });
  try {
    await fn({ port: vorsatz.port, ziel, gesehen });
  } finally {
    await vorsatz.schliessen();
    for (const c of wss.clients) c.terminate();
    flaeche.closeAllConnections();
    await new Promise((res) => flaeche.close(res));
  }
}

function anfrage(port, { pfad = "/", methode = "GET", koepfe = {}, koerper } = {}) {
  return new Promise((res, rej) => {
    const r = http.request({ host: "127.0.0.1", port, path: pfad, method: methode, headers: { host: "pc.beispiel-tailnet.ts.net", ...koepfe } }, (a) => {
      let text = "";
      a.on("data", (d) => { text += d; });
      a.on("end", () => res({ status: a.statusCode, koepfe: a.headers, text }));
    });
    r.on("error", rej);
    if (koerper) r.write(koerper);
    r.end();
  });
}

function wsOeffnen(port, pfad, origin) {
  return new Promise((res) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${pfad}`, { headers: origin ? { origin } : {} });
    const eingang = [];
    const warter = [];
    ws.on("message", (d) => { const t = d.toString(); const w = warter.shift(); w ? w(t) : eingang.push(t); });
    ws.naechste = () => new Promise((r) => { const t = eingang.shift(); t !== undefined ? r(t) : warter.push(r); });
    ws.once("open", () => res({ ws, status: 101 }));
    ws.once("unexpected-response", (_q, a) => { a.resume(); res({ ws, status: a.statusCode }); });
    ws.once("error", () => {});
  });
}

test("HTTP mit erlaubter Herkunft: geht durch, Host und Origin auf die Flaeche umgeschrieben", () => mitAufbau(async ({ port, ziel, gesehen }) => {
  const a = await anfrage(port, { pfad: "/api/x?y=1", methode: "POST", koepfe: { origin: HERKUNFT, referer: `${HERKUNFT}/?gruppe=g&person=anna`, "content-type": "text/plain" }, koerper: "hallo" });
  assert.equal(a.status, 200);
  const j = JSON.parse(a.text);
  assert.deepEqual(j, { host: ziel, origin: `http://${ziel}`, url: "/api/x?y=1", methode: "POST", koerper: "hallo" });
  assert.equal(gesehen[0].referer, `http://${ziel}/?gruppe=g&person=anna`);
}));

test("HTTP ohne Origin (normale Seitenaufrufe): geht durch, Host umgeschrieben, kein Origin erfunden", () => mitAufbau(async ({ port, ziel }) => {
  const a = await anfrage(port, { pfad: "/" });
  assert.equal(a.status, 200);
  const j = JSON.parse(a.text);
  assert.equal(j.host, ziel);
  assert.equal(j.origin, null);
}));

test("HTTP mit fremder Herkunft: 403, die Flaeche sieht nichts", () => mitAufbau(async ({ port, gesehen }) => {
  for (const origin of ["https://boese.example", `http://pc.beispiel-tailnet.ts.net`, `${HERKUNFT}:8443`, "null", "http://127.0.0.1:3889"]) {
    const a = await anfrage(port, { pfad: "/api/ai/command", methode: "POST", koepfe: { origin }, koerper: "x" });
    assert.equal(a.status, 403, origin);
  }
  assert.deepEqual(gesehen, []);
}));

test("Umleitung der Flaeche zeigt auf die Tailnet-Herkunft", () => mitAufbau(async ({ port }) => {
  const a = await anfrage(port, { pfad: "/umleiten" });
  assert.equal(a.status, 302);
  assert.equal(a.koepfe.location, `${HERKUNFT}/ziel`);
}));

test("WebSocket /api/abgleich mit erlaubter Herkunft: Upgrade geht durch, Koepfe umgeschrieben, Daten in beide Richtungen", () => mitAufbau(async ({ port, ziel }) => {
  const { ws, status } = await wsOeffnen(port, "/api/abgleich?flaeche=g&person=anna&fenster=f1", HERKUNFT);
  assert.equal(status, 101);
  const erste = JSON.parse(await ws.naechste());
  assert.deepEqual(erste, { host: ziel, origin: `http://${ziel}`, url: "/api/abgleich?flaeche=g&person=anna&fenster=f1" });
  ws.send("hallo");
  assert.equal(await ws.naechste(), "echo:hallo");
  ws.close();
}));

test("WebSocket mit fremder Herkunft: 403, kein Upgrade bei der Flaeche", () => mitAufbau(async ({ port, gesehen }) => {
  const { status } = await wsOeffnen(port, "/api/abgleich?flaeche=g&person=anna&fenster=f1", "https://boese.example");
  assert.equal(status, 403);
  assert.deepEqual(gesehen, []);
}));

test("WebSocket, den die Flaeche ablehnt: deren Status kommt beim Browser an", () => mitAufbau(async ({ port }) => {
  const { status } = await wsOeffnen(port, "/anderes", HERKUNFT);
  assert.equal(status, 403);
}));

test("VORSATZ_HERKUNFT muss eine reine https-Herkunft sein", async () => {
  for (const herkunft of [undefined, "", "http://pc.beispiel-tailnet.ts.net", "https://pc.beispiel-tailnet.ts.net/pfad", "kein url"]) {
    await assert.rejects(starteVorsatz({ port: 0, herkunft }), /VORSATZ_HERKUNFT/, String(herkunft));
  }
});
