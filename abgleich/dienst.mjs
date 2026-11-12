// Abgleichdienst: WebSocket-Verteilung der Kacheln einer Flaeche.
// Der Autor ist immer die Person der Verbindung, nie ein Feld der Nachricht.
//
// Ablauf je Verbindung (Query: flaeche, person, fenster):
// 1. Der Client schickt zuerst hallo {seit, protokoll}. Vorher wird keine Kachel angenommen.
//    - seit null: frisch geladenes Fenster. Es wird das aktuelle Fenster der Person, eine
//      andere Verbindung derselben Person wird mit 4409 getrennt. Antwort: stand.
//    - seit n: Neuverbindung. Nur das aktuelle Fenster der Person (oder irgendein Fenster,
//      solange keins bekannt ist) wird angenommen; ein veraltetes bekommt 4409 und darf nichts
//      mehr schreiben. Antwort: die Eintraege nach n und danach angenommen {seq}, oder ein
//      frischer stand, wenn die Protokoll-Kennung nicht passt oder n hinter dem Protokoll liegt
//      (Protokoll ersetzt). Erst nach stand bzw. angenommen schickt der Browser Kacheln.
// 2. Jede gespeicherte Kachel wird dem Absender mit ok {kachel, seq, nr} bestaetigt.
// 3. Mit Schluessel (ABGLEICH_SCHLUESSEL) braucht jede Verbindung einen Ausweis (?ausweis=, siehe ausweis.mjs),
//    dessen Flaeche und Person zur Query passen; der Name kommt aus dem Ausweis. Ohne Schluessel laeuft der
//    Dienst nur im offenen Modus (ABGLEICH_OFFEN=1), dort ist der Name die Person.
//    HTTP (gleicher Port): GET /healthz frei; POST /platz und PUT /schutz nur mit Kopf X-Abgleich-Dienst.
//    Tinte (PNG-Kachel) in einem Schutzfeld einer anderen Person wird mit fremdes_ergebnisfeld abgelehnt.
//    Die Schutzfelder der Flaeche stehen im stand und im angenommen (schutz [{person, felder}]); PUT /schutz geht als schutz
//    {person, felder} an alle angenommenen Verbindungen der Flaeche, damit der Browser fremde Felder schon beim
//    Zeichnen freihaelt (leere felder = aufgehoben).
// 4. Fluechtig, nie gespeichert: zeiger {x, y} bzw. {weg:true} geht als zeiger {autor, ...} an die
//    anderen der Flaeche (hoechstens einer je ZEIGER_ABSTAND_MS und Verbindung). anwesend {personen}
//    geht an alle der Flaeche, sobald jemand angenommen wurde oder seine aktuelle Verbindung endet.
import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { pruefeAusweis } from "./ausweis.mjs";
import { pngAlphaImRechteck } from "./png-alpha.mjs";
import {
  GRUPPEN_KENNUNG, KACHEL_PX, KENNUNG, PERSONEN_KENNUNG,
  istSchutzfelderListe, pruefeKachelNachricht, pruefeLiveNachricht, pruefeObjektNachricht, pruefeZeigerNachricht,
} from "./protokoll.mjs";
import { oeffneSpeicher } from "./speicher.mjs";

export const UEBERNAHME_CODE = 4409;
export const UEBERNAHME_GRUND = "Diese Fläche ist in einem anderen Fenster geöffnet. Arbeiten Sie dort weiter.";
export const HERZSCHLAG_MS = 30000;
export const ZEIGER_ABSTAND_MS = 25;
export const LIVE_ABSTAND_MS = 40;
const MAX_NACHRICHT_BYTES = 1048576;
const MAX_HTTP_BYTES = 65536;
export const MIN_SCHLUESSEL_ZEICHEN = 32;

const alsBase64 = (png) => (png === null ? null : Buffer.from(png.buffer, png.byteOffset, png.byteLength).toString("base64"));
const istObjekt = (x) => typeof x === "object" && x !== null && !Array.isArray(x);

// Schnitt eines Schutzfelds mit der Kachel "tx,ty" (deckt x=tx*512.., y=ty*512..), in Kachelpixeln, oder null.
function schnittMitKachel(feld, kachel) {
  const [tx, ty] = kachel.split(",").map(Number);
  const x0 = Math.max(feld[0], tx * KACHEL_PX);
  const y0 = Math.max(feld[1], ty * KACHEL_PX);
  const x1 = Math.min(feld[0] + feld[2], (tx + 1) * KACHEL_PX);
  const y1 = Math.min(feld[1] + feld[3], (ty + 1) * KACHEL_PX);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0 - tx * KACHEL_PX, y: y0 - ty * KACHEL_PX, w: x1 - x0, h: y1 - y0 };
}

const json = (res, status, objekt) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(objekt));
};

export async function starteDienst({ port, host = "127.0.0.1", speicherPfad, herzschlagMs = HERZSCHLAG_MS, schluessel = null, offen = false }) {
  // VM-Env-Dateien tragen gern CRLF: Umgebungsleerraum gehoert nicht zum Schluessel.
  if (typeof schluessel === "string") schluessel = schluessel.trim();
  if (schluessel !== null && (typeof schluessel !== "string" || schluessel.length < MIN_SCHLUESSEL_ZEICHEN)) {
    throw new Error(`ABGLEICH_SCHLUESSEL braucht mindestens ${MIN_SCHLUESSEL_ZEICHEN} Zeichen`);
  }
  if (schluessel === null && !offen) {
    throw new Error("ABGLEICH_SCHLUESSEL fehlt (nur mit ABGLEICH_OFFEN=1 startet der Dienst ohne Schluessel)");
  }
  const speicher = oeffneSpeicher(speicherPfad);
  const dienstKopf = schluessel === null ? null : createHash("sha256").update(`abgleich-dienst:${schluessel}`).digest();
  const kopfStimmt = (wert) => {
    if (dienstKopf === null) return true; // offener Modus: kein Schluessel, kein Kopf
    if (typeof wert !== "string" || !/^[0-9a-f]{64}$/.test(wert)) return false;
    return timingSafeEqual(Buffer.from(wert, "hex"), dienstKopf);
  };
  // flaeche -> (person -> Schutzfelder [[x,y,w,h], ...]); beim Start aus der DB, danach von PUT /schutz
  const schutz = new Map();
  const schutzMerken = (flaeche, person, felder) => {
    let je = schutz.get(flaeche);
    if (!je) schutz.set(flaeche, (je = new Map()));
    if (felder.length === 0) je.delete(person);
    else je.set(person, felder);
  };
  for (const z of speicher.schutzAlle()) schutzMerken(z.flaeche, z.person, z.felder);
  const gueltigeIds = (flaeche, person) => KENNUNG.test(flaeche) && KENNUNG.test(person)
    && (schluessel === null || (GRUPPEN_KENNUNG.test(flaeche) && PERSONEN_KENNUNG.test(person)));

  const koerperLesen = (req) => new Promise((res, rej) => {
    const teile = [];
    let n = 0;
    req.on("data", (d) => {
      n += d.length;
      if (n > MAX_HTTP_BYTES) { rej(new Error("zu gross")); req.destroy(); } else teile.push(d);
    });
    req.on("end", () => {
      try { res(JSON.parse(Buffer.concat(teile).toString("utf8"))); } catch (e) { rej(e); }
    });
    req.on("error", rej);
  });

  const server = http.createServer(async (req, res) => {
    try {
      const pfad = new URL(req.url ?? "/", "http://abgleich").pathname;
      if (req.method === "GET" && pfad === "/healthz") return json(res, 200, { ok: true });
      if (!kopfStimmt(req.headers["x-abgleich-dienst"])) return json(res, 403, { fehler: "Verboten" });
      const zielPlatz = req.method === "POST" && pfad === "/platz";
      const zielSchutz = req.method === "PUT" && pfad === "/schutz";
      if (!zielPlatz && !zielSchutz) {
        res.writeHead(426, { "content-type": "text/plain" });
        return res.end("WebSocket erforderlich");
      }
      let k;
      try { k = await koerperLesen(req); } catch { return json(res, 400, { fehler: "Kein gueltiges JSON" }); }
      if (!istObjekt(k) || typeof k.flaeche !== "string" || typeof k.person !== "string" || !gueltigeIds(k.flaeche, k.person)) {
        return json(res, 400, { fehler: "flaeche oder person ungueltig" });
      }
      if (zielPlatz) return json(res, 200, { platz: speicher.platz(k.flaeche, k.person) });
      if (!istSchutzfelderListe(k.felder)) return json(res, 400, { fehler: "felder ungueltig" });
      speicher.schutzSetzen(k.flaeche, k.person, k.felder);
      schutzMerken(k.flaeche, k.person, k.felder);
      const meldung = { typ: "schutz", person: k.person, felder: k.felder };
      for (const verbindung of flaechen.get(k.flaeche)?.values() ?? []) if (verbindung.aktiv) senden(verbindung, meldung);
      res.writeHead(204);
      res.end();
    } catch {
      if (!res.headersSent) json(res, 500, { fehler: "Fehler" });
      else res.end();
    }
  });
  const wss = new WebSocketServer({ server, maxPayload: MAX_NACHRICHT_BYTES });
  // flaeche -> (person -> Verbindung, die hallo gesagt hat und aktuell ist)
  const flaechen = new Map();

  // Mit ABGLEICH_PROTOKOLL=1 eine Zeile je Verbindungsereignis (Flaeche, Person, Art), nie Inhalte.
  const protokollZeile = process.env.ABGLEICH_PROTOKOLL === "1"
    ? (...teile) => console.log(`${new Date().toISOString()} ${teile.join(" ")}`)
    : () => {};
  const senden = (ws, objekt) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(objekt));
  };

  // Herzschlag: wer auf ein ping bis zum naechsten Schlag kein pong schickt, wird beendet.
  const herzschlag = setInterval(() => {
    for (const c of wss.clients) {
      if (c.wach === false) {
        c.terminate();
        continue;
      }
      c.wach = false;
      try { c.ping(); } catch { /* Socket schon zu */ }
    }
  }, herzschlagMs);
  herzschlag.unref();

  wss.on("connection", (ws, req) => {
    ws.wach = true;
    ws.on("pong", () => { ws.wach = true; });
    let flaeche;
    let person;
    let fenster;
    let name;
    try {
      const url = new URL(req.url ?? "/", "http://abgleich");
      const q = url.searchParams;
      if (url.pathname !== "/") throw new Error("Pfad");
      flaeche = q.get("flaeche") ?? "";
      person = q.get("person") ?? "";
      fenster = q.get("fenster") ?? "";
      name = person;
      if (schluessel !== null) {
        const ausweis = pruefeAusweis(schluessel, q.get("ausweis") ?? "", Math.floor(Date.now() / 1000));
        if (!ausweis || ausweis.flaeche !== flaeche || ausweis.person !== person) throw new Error("Ausweis");
        name = ausweis.name;
      }
    } catch {
      flaeche = person = fenster = name = "";
    }
    protokollZeile("verbunden", JSON.stringify(flaeche).slice(0, 50), JSON.stringify(person).slice(0, 50));
    if (!gueltigeIds(flaeche, person) || !KENNUNG.test(fenster)) {
      ws.close(1008, "Ungueltige Kennung");
      return;
    }

    let personen = flaechen.get(flaeche);
    if (!personen) flaechen.set(flaeche, (personen = new Map()));

    // An alle angenommenen Verbindungen der Flaeche: wer gerade da ist.
    const anwesendMelden = () => {
      const da = [...personen].filter(([, v]) => v.aktiv);
      const meldung = {
        typ: "anwesend",
        personen: da.map(([p]) => p).sort(),
        namen: Object.fromEntries(da.map(([p, v]) => [p, v.name])),
      };
      for (const verbindung of personen.values()) if (verbindung.aktiv) senden(verbindung, meldung);
    };

    ws.on("close", (code) => {
      protokollZeile("zu", flaeche, person, `code=${code}`, `aktiv=${Boolean(ws.aktiv)}`);
      if (personen.get(person) === ws) {
        personen.delete(person);
        if (ws.aktiv) anwesendMelden();
      }
      if (personen.size === 0 && flaechen.get(flaeche) === personen) flaechen.delete(flaeche);
    });
    ws.on("error", () => {});

    // aktiv: hat hallo gesagt und wurde angenommen. Verteilung erst ab hallo: so kommt jeder
    // Eintrag genau einmal und in seq-Reihenfolge an.
    ws.aktiv = false;
    ws.name = name;
    const verarbeite = (daten, istBinaer) => {
      if (ws.readyState !== ws.OPEN) return; // abgewiesen oder im Schliessen
      // Nach einer Uebernahme darf die alte Verbindung nichts mehr schreiben.
      if (ws.aktiv && personen.get(person) !== ws) return;
      if (istBinaer) return senden(ws, { typ: "fehler", grund: "Nur Textnachrichten erlaubt" });
      let nachricht;
      try {
        nachricht = JSON.parse(daten.toString("utf8"));
      } catch {
        return senden(ws, { typ: "fehler", grund: "Kein gueltiges JSON" });
      }
      if (istObjekt(nachricht) && nachricht.typ === "hallo") return hallo(nachricht);
      if (istObjekt(nachricht) && nachricht.typ === "zeiger") return zeiger(nachricht);
      if (istObjekt(nachricht) && nachricht.typ === "live") return live(nachricht);
      const nr = istObjekt(nachricht) && Number.isSafeInteger(nachricht.nr) ? { nr: nachricht.nr } : {};
      if (!ws.aktiv) return senden(ws, { typ: "fehler", grund: "Zuerst hallo senden", ...nr });
      if (istObjekt(nachricht) && nachricht.typ === "objekt") return objekt(nachricht, nr);
      const p = pruefeKachelNachricht(nachricht);
      if (!p.ok) return senden(ws, { typ: "fehler", grund: p.grund, ...nr });
      if (p.png !== null && schutzVerletzt(p.kachel, p.png)) {
        return senden(ws, { typ: "fehler", grund: "fremdes_ergebnisfeld", ...nr });
      }
      const seq = speicher.anfuegen({ flaeche, autor: person, kachel: p.kachel, png: p.png });
      senden(ws, { typ: "ok", kachel: p.kachel, seq, ...nr });
      const eintrag = { typ: "eintrag", seq, autor: person, kachel: p.kachel, png: alsBase64(p.png) };
      for (const [andere, verbindung] of personen) {
        if (andere !== person && verbindung.aktiv) senden(verbindung, eintrag);
      }
    };
    // Eine einzelne fehlerhafte Nachricht darf nie den Prozess beenden. Die Verbindung bleibt offen;
    // geloggt wird nur die Fehlerklasse, nie Nutzlast oder Schluessel.
    ws.on("message", (daten, istBinaer) => {
      try {
        verarbeite(daten, istBinaer);
      } catch (e) {
        protokollZeile("fehler", flaeche, person, e instanceof Error ? e.constructor.name : "unbekannt");
        try {
          senden(ws, { typ: "fehler", grund: "Nachricht nicht verarbeitbar" });
        } catch { /* Verbindung schon weg */ }
      }
    });

    // Liegt in der Kachel Tinte in einem Schutzfeld einer anderen Person dieser Flaeche?
    function schutzVerletzt(kachel, png) {
      for (const [inhaber, felder] of schutz.get(flaeche) ?? []) {
        if (inhaber === person) continue;
        for (const feld of felder) {
          const r = schnittMitKachel(feld, kachel);
          if (r && pngAlphaImRechteck(png, r)) return true;
        }
      }
      return false;
    }

    // Schneidet das Rechteck eines Objekts ein Schutzfeld einer anderen Person (reine Rechteckpruefung)?
    function objektImFremdenFeld(d) {
      const x0 = Math.min(d.x, d.x + d.w);
      const x1 = Math.max(d.x, d.x + d.w);
      const y0 = Math.min(d.y, d.y + d.h);
      const y1 = Math.max(d.y, d.y + d.h);
      for (const [inhaber, felder] of schutz.get(flaeche) ?? []) {
        if (inhaber === person) continue;
        for (const [fx, fy, fw, fh] of felder) {
          if (x0 < fx + fw && x1 > fx && y0 < fy + fh && y1 > fy) return true;
        }
      }
      return false;
    }

    // Objekt-Schluessel ist (Autor der Verbindung, id): ein fremdes Objekt ist nie ueberschreibbar.
    function objekt(nachricht, nr) {
      const p = pruefeObjektNachricht(nachricht);
      if (!p.ok) return senden(ws, { typ: "fehler", grund: p.grund, ...nr });
      if (p.daten !== null && objektImFremdenFeld(p.daten)) {
        return senden(ws, { typ: "fehler", grund: "fremdes_ergebnisfeld", ...nr });
      }
      const seq = speicher.anfuegen({ flaeche, autor: person, art: "objekt", kachel: p.id, daten: p.daten });
      senden(ws, { typ: "ok", objekt: p.id, seq, ...nr });
      const meldung = { typ: "objekt", seq, autor: person, id: p.id, daten: p.daten };
      for (const [andere, verbindung] of personen) {
        if (andere !== person && verbindung.aktiv) senden(verbindung, meldung);
      }
    }

    // Live-Strich: fluechtig, hoechstens einer je LIVE_ABSTAND_MS und Verbindung; ende nie gedrosselt.
    let letzterLive = -Infinity;
    function live(nachricht) {
      const l = pruefeLiveNachricht(nachricht);
      if (!l || !ws.aktiv) return;
      if (!l.ende) {
        const jetzt = performance.now();
        if (jetzt - letzterLive < LIVE_ABSTAND_MS) return;
        letzterLive = jetzt;
      }
      const meldung = { typ: "live", autor: person, ...l };
      for (const [andere, verbindung] of personen) {
        if (andere !== person && verbindung.aktiv) senden(verbindung, meldung);
      }
    }

    // Ungueltig, vor hallo oder zu schnell: still verworfen (kein fehler, der Zeiger ist fluechtig).
    let letzterZeiger = -Infinity;
    function zeiger(nachricht) {
      const z = pruefeZeigerNachricht(nachricht);
      if (!z || !ws.aktiv) return;
      // weg wird nie gedrosselt: sonst bliebe der Zeiger bei den anderen stehen
      if (!z.weg) {
        const jetzt = performance.now();
        if (jetzt - letzterZeiger < ZEIGER_ABSTAND_MS) return;
        letzterZeiger = jetzt;
      }
      const meldung = { typ: "zeiger", autor: person, ...z };
      for (const [andere, verbindung] of personen) {
        if (andere !== person && verbindung.aktiv) senden(verbindung, meldung);
      }
    }

    function stand() {
      const st = speicher.stand(flaeche);
      senden(ws, {
        typ: "stand",
        protokoll: speicher.protokoll,
        seq: st.seq,
        kacheln: st.kacheln.map((k) => ({ autor: k.autor, kachel: k.kachel, seq: k.seq, png: alsBase64(k.png) })),
        objekte: st.objekte.map((o) => ({ autor: o.autor, id: o.id, seq: o.seq, daten: o.daten })),
        schutz: schutzListe(),
      });
    }

    function schutzListe() {
      return [...(schutz.get(flaeche) ?? [])].map(([inhaber, felder]) => ({ person: inhaber, felder }));
    }

    function hallo(nachricht) {
      const { seit, protokoll } = nachricht;
      protokollZeile("hallo", flaeche, person, `seit=${seit === null ? "null" : String(seit).slice(0, 20)}`);
      if (seit !== null && !(Number.isSafeInteger(seit) && seit >= 0)) {
        return senden(ws, { typ: "fehler", grund: "seit muss null oder eine ganze Zahl >= 0 sein" });
      }
      const aktuell = speicher.fenster(flaeche, person);
      if (seit !== null && aktuell !== null && aktuell !== fenster) {
        // Ein veraltetes Fenster verbindet sich neu, waehrend ein frischeres die Flaeche hat.
        ws.close(UEBERNAHME_CODE, UEBERNAHME_GRUND);
        return;
      }
      if (aktuell !== fenster) speicher.fensterSetzen(flaeche, person, fenster);
      const alt = personen.get(person);
      personen.set(person, ws);
      if (alt && alt !== ws) alt.close(UEBERNAHME_CODE, UEBERNAHME_GRUND);

      if (seit === null || protokoll !== speicher.protokoll || seit > speicher.hoechsteSeq(flaeche)) {
        stand();
      } else {
        for (const e of speicher.seit(flaeche, seit)) {
          if (e.art === "objekt") senden(ws, { typ: "objekt", seq: e.seq, autor: e.autor, id: e.kachel, daten: e.daten });
          else senden(ws, { typ: "eintrag", seq: e.seq, autor: e.autor, kachel: e.kachel, png: alsBase64(e.png) });
        }
        // Abschluss der Nachholung, auch wenn nichts fehlte: erst danach schickt der Browser Kacheln.
        // Mit den Schutzfeldern: ein PUT /schutz waehrend der Trennung haette dieses Fenster nicht erreicht.
        senden(ws, { typ: "angenommen", seq: speicher.hoechsteSeq(flaeche), schutz: schutzListe() });
      }
      // gleicher synchroner Schritt wie die Antwort: nichts dazwischen geht verloren oder doppelt
      ws.aktiv = true;
      anwesendMelden();
    }
  });

  await new Promise((res, rej) => {
    server.once("error", rej);
    server.listen(port, host, res);
  });

  let zu = null;
  return {
    port: server.address().port,
    protokoll: speicher.protokoll,
    schliessen() {
      zu ??= (async () => {
        clearInterval(herzschlag);
        for (const c of wss.clients) c.terminate();
        await new Promise((res) => wss.close(res));
        server.closeAllConnections();
        await new Promise((res) => server.close(res));
        speicher.schliessen();
      })();
      return zu;
    },
  };
}

async function alsProgramm() {
  const db = process.env.ABGLEICH_DB;
  if (!db) {
    console.error("ABGLEICH_DB fehlt: Pfad zur SQLite-Datei des Abgleichs angeben.");
    process.exit(2);
  }
  const schluessel = (process.env.ABGLEICH_SCHLUESSEL ?? "").trim() || null;
  const offen = process.env.ABGLEICH_OFFEN === "1";
  if (schluessel === null && !offen) {
    console.error("ABGLEICH_SCHLUESSEL fehlt: Schluessel (mindestens 32 Zeichen) setzen, oder nur zum Ausprobieren ABGLEICH_OFFEN=1.");
    process.exit(1);
  }
  if (schluessel !== null && schluessel.length < MIN_SCHLUESSEL_ZEICHEN) {
    console.error(`ABGLEICH_SCHLUESSEL ist zu kurz: mindestens ${MIN_SCHLUESSEL_ZEICHEN} Zeichen.`);
    process.exit(1);
  }
  const port = Number(process.env.ABGLEICH_PORT || 8160);
  const host = process.env.ABGLEICH_HOST || "127.0.0.1";
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`ABGLEICH_PORT ungueltig: ${process.env.ABGLEICH_PORT}`);
    process.exit(2);
  }
  const dienst = await starteDienst({ port, host, speicherPfad: db, schluessel, offen });
  console.log(`Abgleichdienst lauscht auf ${host}:${dienst.port}`);
  const beenden = () => {
    dienst.schliessen().then(() => process.exit(0), () => process.exit(1));
  };
  process.on("SIGINT", beenden);
  process.on("SIGTERM", beenden);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  alsProgramm().catch((e) => {
    console.error(`Abgleichdienst konnte nicht starten: ${e.message}`);
    process.exit(1);
  });
}
