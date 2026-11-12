"use strict";
// Reicht WebSocket-Verbindungen von /api/abgleich an den Abgleichdienst durch.
// Die Herkunftspruefung wird von aussen uebergeben (in main.js dieselbe wie fuer /api/mcp/canvas).
const WebSocket = require("ws");

const PFAD = "/api/abgleich";
const GEHT_NICHT = new Set([1004, 1005, 1006, 1015]);
// Bis der Dienst die Verbindung annimmt, werden Browser-Nachrichten gepuffert, aber begrenzt.
const MAX_WARTEND_NACHRICHTEN = 64;
const MAX_WARTEND_BYTES = 4 * 1048576;

const schliesscode = (code) => (Number.isInteger(code) && !GEHT_NICHT.has(code) && ((code >= 1000 && code <= 1014) || (code >= 3000 && code <= 4999)) ? code : 1011);

function ablehnen(socket) {
  if (socket.destroyed) return;
  socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
  socket.destroy();
}

// handshakeMs: so lange darf der Dienst fuer den Verbindungsaufbau brauchen.
// herzschlagMs: Browser, die auf ein ping bis zum naechsten Schlag kein pong schicken, werden beendet.
// Die Upstream-maxPayload bleibt beim ws-Standard (100 MiB): der ganze stand kommt in einer Nachricht.
function abgleichDurchreichen(server, { ziel, pruefe = () => true, handshakeMs = 10000, herzschlagMs = 30000 }) {
  const wss = new WebSocket.WebSocketServer({ noServer: true, maxPayload: 1048576 });

  const herzschlag = setInterval(() => {
    for (const browser of wss.clients) {
      if (browser.wach === false) {
        browser.terminate();
        continue;
      }
      browser.wach = false;
      try { browser.ping(); } catch { /* schon zu */ }
    }
  }, herzschlagMs);
  herzschlag.unref();
  server.once("close", () => clearInterval(herzschlag));

  server.on("upgrade", async (req, socket, head) => {
    let url;
    try { url = new URL(req.url, "http://localhost"); } catch { return; }
    if (url.pathname !== PFAD) return;
    let erlaubt = false;
    try { erlaubt = (await pruefe(req)) === true; } catch { erlaubt = false; }
    if (!erlaubt) return ablehnen(socket);

    wss.handleUpgrade(req, socket, head, (browser) => {
      // Erst hier, nach dem Handshake mit dem Browser: ein abgebrochener Handshake laesst so keinen Upstream offen.
      const nachgelagert = new WebSocket(`${ziel.replace(/\/+$/, "")}/${url.search}`, { handshakeTimeout: handshakeMs });
      const wartend = [];
      let wartendBytes = 0;
      let offen = false;
      browser.wach = true;
      browser.on("pong", () => { browser.wach = true; });
      browser.on("error", () => {});
      nachgelagert.on("error", () => {
        if (browser.readyState === WebSocket.OPEN) browser.close(1011, "Abgleichdienst nicht erreichbar");
        else browser.terminate();
      });
      const schliesseBeide = (code, grund) => {
        for (const ws of [browser, nachgelagert]) {
          if (ws.readyState === WebSocket.OPEN) ws.close(code, grund);
          else if (ws.readyState === WebSocket.CONNECTING) ws.terminate();
        }
      };
      browser.on("message", (daten, binaer) => {
        if (offen) return nachgelagert.send(daten, { binary: binaer });
        wartend.push([daten, binaer]);
        wartendBytes += daten.length;
        if (wartend.length > MAX_WARTEND_NACHRICHTEN || wartendBytes > MAX_WARTEND_BYTES) {
          wartend.length = 0;
          schliesseBeide(1013, "Abgleichdienst antwortet nicht");
        }
      });
      browser.on("close", (code, grund) => schliesseBeide(schliesscode(code), grund.toString()));
      nachgelagert.on("open", () => {
        offen = true;
        for (const [d, b] of wartend.splice(0)) nachgelagert.send(d, { binary: b });
        wartendBytes = 0;
      });
      nachgelagert.on("message", (daten, binaer) => {
        if (browser.readyState === WebSocket.OPEN) browser.send(daten, { binary: binaer });
      });
      nachgelagert.on("close", (code, grund) => schliesseBeide(schliesscode(code), grund.toString()));
    });
  });
}

module.exports = { abgleichDurchreichen, MAX_WARTEND_NACHRICHTEN };
