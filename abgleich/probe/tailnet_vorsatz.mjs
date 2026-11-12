// Tailnet-Testvorsatz fuer einen Zwei-Rechner-Test. Nur fuer den Test, nicht fuer den Betrieb.
//
// tailscale serve (https, nur fuer die Dauer des Tests eingerichtet) -> dieser Vorsatz
// (127.0.0.1:VORSATZ_PORT, Standard 3890) -> Test-Flaeche 127.0.0.1:3889.
//
// PenEchos browserRequestError erwartet Host und Origin der Flaeche selbst (Loopback). Der Vorsatz
// prueft deshalb ZUERST selbst die Herkunft: hat eine Anfrage einen Origin-Kopf, muss er genau
// VORSATZ_HERKUNFT sein (die https-Tailnet-Adresse), sonst 403. Erst dann schreibt er Host und
// Origin auf die Flaeche um. HTTP und WebSocket-Upgrades (auch /api/abgleich) gehen beide durch.
// Tailnet-Namen und -Adressen stehen nie im Repo, nur in der Umgebung.
import http from "node:http";
import { fileURLToPath } from "node:url";

export const STANDARD_PORT = 3890;
export const STANDARD_ZIEL = "127.0.0.1:3889";

function normierteHerkunft(herkunft) {
  let url;
  try { url = new URL(String(herkunft ?? "")); } catch { throw new Error("VORSATZ_HERKUNFT fehlt oder ist keine URL"); }
  if (url.protocol !== "https:") throw new Error("VORSATZ_HERKUNFT muss eine https-Adresse sein");
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("VORSATZ_HERKUNFT darf nur Schema, Name und Port enthalten");
  }
  return url.origin;
}

export async function starteVorsatz({ port = STANDARD_PORT, host = "127.0.0.1", ziel = STANDARD_ZIEL, herkunft }) {
  const erlaubt = normierteHerkunft(herkunft);
  const zielUrl = new URL(`http://${ziel}`);
  const zielOrigin = zielUrl.origin;
  const zielVerbindung = { host: zielUrl.hostname, port: Number(zielUrl.port || 80) };

  const herkunftOk = (req) => req.headers.origin === undefined || req.headers.origin === erlaubt;
  // Mit VORSATZ_PROTOKOLL=1 eine Zeile je Anfrage: nur Pfad, Art und Status, nie Werte (keine Abfrage, kein Cookie-Inhalt).
  const protokoll = process.env.VORSATZ_PROTOKOLL === "1"
    ? (req, art, status) => {
      let pfad = "?";
      let gruppe = false;
      try { const u = new URL(req.url, "http://x"); pfad = u.pathname; gruppe = u.searchParams.has("gruppe") || u.searchParams.has("flaeche"); } catch {}
      // geraet: von tailscale serve gesetzte Absenderadresse, damit sich Geraete unterscheiden lassen (nur lokales Protokoll)
      const geraet = String(req.headers["x-forwarded-for"] ?? "-").split(",")[0].trim().slice(0, 45);
      console.log(`${new Date().toISOString()} ${art} ${req.method} ${pfad} gruppe=${gruppe} cookie=${Boolean(req.headers.cookie)} herkunft=${herkunftOk(req)} geraet=${geraet} -> ${status}`);
    }
    : () => {};
  const umschreiben = (headers) => {
    const h = { ...headers, host: zielUrl.host };
    if (h.origin !== undefined) h.origin = zielOrigin;
    if (typeof h.referer === "string" && (h.referer === erlaubt || h.referer.startsWith(`${erlaubt}/`))) {
      h.referer = zielOrigin + h.referer.slice(erlaubt.length);
    }
    return h;
  };
  const antwortKoepfe = (headers) => {
    const h = { ...headers };
    if (typeof h.location === "string" && (h.location === zielOrigin || h.location.startsWith(`${zielOrigin}/`))) {
      h.location = erlaubt + h.location.slice(zielOrigin.length);
    }
    return h;
  };

  const server = http.createServer((req, res) => {
    if (!herkunftOk(req)) {
      req.resume();
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8", connection: "close" });
      return res.end("Fremde Herkunft");
    }
    const hoch = http.request({ ...zielVerbindung, method: req.method, path: req.url, headers: umschreiben(req.headers) }, (antwort) => {
      if (!/\.(?:js|css|png|svg|woff2?|ico|json)$/i.test(req.url.split("?")[0])) protokoll(req, "http", antwort.statusCode);
      res.writeHead(antwort.statusCode ?? 502, antwort.statusMessage, antwortKoepfe(antwort.headers));
      antwort.pipe(res);
    });
    hoch.on("error", () => {
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      res.end("Flaeche nicht erreichbar");
    });
    req.pipe(hoch);
  });

  server.on("upgrade", (req, socket, head) => {
    socket.on("error", () => {});
    if (!herkunftOk(req)) {
      protokoll(req, "ws", 403);
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    const kopfzeilen = (status, text, roh) => {
      let s = `HTTP/1.1 ${status} ${text}\r\n`;
      for (let i = 0; i < roh.length; i += 2) s += `${roh[i]}: ${roh[i + 1]}\r\n`;
      return `${s}\r\n`;
    };
    const hoch = http.request({ ...zielVerbindung, method: req.method, path: req.url, headers: umschreiben(req.headers) });
    hoch.on("upgrade", (antwort, hochSocket, hochHead) => {
      protokoll(req, "ws", antwort.statusCode);
      hochSocket.on("error", () => socket.destroy());
      socket.write(kopfzeilen(antwort.statusCode, antwort.statusMessage, antwort.rawHeaders));
      if (hochHead.length) socket.write(hochHead);
      if (head.length) hochSocket.write(head);
      hochSocket.pipe(socket);
      socket.pipe(hochSocket);
      socket.on("close", () => hochSocket.destroy());
      hochSocket.on("close", () => socket.destroy());
    });
    // Die Flaeche stellt nicht um (z. B. 403 ihrer eigenen Pruefung): Antwort unveraendert weitergeben.
    hoch.on("response", (antwort) => {
      protokoll(req, "ws", antwort.statusCode);
      socket.write(kopfzeilen(antwort.statusCode, antwort.statusMessage, antwort.rawHeaders));
      antwort.pipe(socket);
    });
    hoch.on("error", () => socket.destroy());
    hoch.end();
  });

  await new Promise((res, rej) => {
    server.once("error", rej);
    server.listen(port, host, res);
  });
  return {
    port: server.address().port,
    herkunft: erlaubt,
    schliessen() {
      server.closeAllConnections();
      return new Promise((res) => server.close(() => res()));
    },
  };
}

async function alsProgramm() {
  const port = Number(process.env.VORSATZ_PORT || STANDARD_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`VORSATZ_PORT ungueltig: ${process.env.VORSATZ_PORT}`);
  const vorsatz = await starteVorsatz({ port, herkunft: process.env.VORSATZ_HERKUNFT });
  console.log(`Tailnet-Vorsatz lauscht auf 127.0.0.1:${vorsatz.port} -> ${STANDARD_ZIEL}, erlaubte Herkunft aus VORSATZ_HERKUNFT`);
  const beenden = () => vorsatz.schliessen().then(() => process.exit(0), () => process.exit(1));
  process.on("SIGINT", beenden);
  process.on("SIGTERM", beenden);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  alsProgramm().catch((e) => {
    console.error(`Tailnet-Vorsatz konnte nicht starten: ${e.message}`);
    process.exit(2);
  });
}
