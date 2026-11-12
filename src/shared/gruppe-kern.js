"use strict";
// Lernflaeche: reine Regeln der Gruppen-Schicht (ohne DOM, testbar).
// KENNUNG, der Kachelschluessel und pngMasse duplizieren abgleich/protokoll.mjs, weil das Bundle keine ES-Module laedt.
var LernflaecheGruppeKern = (() => {
  const KENNUNG = /^[a-z0-9-]{1,40}$/;
  const SCHLUESSEL = /^(0|[1-9]\d?),(0|[1-9]\d?)$/;
  const PNG_SIGNATUR = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const IHDR = [0x49, 0x48, 0x44, 0x52];

  function gruppeAusUrl(search) {
    let q;
    try { q = new URLSearchParams(typeof search === "string" ? search : ""); } catch { return null; }
    const gruppe = q.get("gruppe"), person = q.get("person");
    if (typeof gruppe !== "string" || typeof person !== "string") return null;
    if (!KENNUNG.test(gruppe) || !KENNUNG.test(person)) return null;
    return { gruppe, person };
  }

  function istKachelSchluessel(s) {
    if (typeof s !== "string") return false;
    const m = SCHLUESSEL.exec(s);
    return m !== null && Number(m[1]) <= 39 && Number(m[2]) <= 39;
  }

  // Breite und Hoehe aus dem IHDR-Block direkt nach der Signatur, sonst null.
  function pngMasse(bytes) {
    if (!bytes || bytes.length < 24) return null;
    if (!PNG_SIGNATUR.every((b, i) => bytes[i] === b)) return null;
    const zahl = o => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
    if (zahl(8) !== 13 || !IHDR.every((b, i) => bytes[12 + i] === b)) return null;
    return { breite: zahl(16), hoehe: zahl(20) };
  }

  // Kennung eines Fensters (eines Seitenaufrufs) aus 16 Zufallsbytes: 32 Hexzeichen, passt zu KENNUNG.
  function fensterKennung(zufall) {
    if (!zufall || zufall.length < 16) throw Error("fensterKennung braucht 16 Zufallsbytes");
    return Array.from(zufall.slice(0, 16), b => b.toString(16).padStart(2, "0")).join("");
  }

  // Fortlaufende Nummer des zuletzt angenommenen Eintrags.
  class Folge {
    #seq;
    constructor(seq = 0) { this.#seq = seq; }
    annehmen(seq) {
      if (!Number.isSafeInteger(seq) || seq <= this.#seq) return false;
      this.#seq = seq;
      return true;
    }
    get seq() { return this.#seq; }
  }

  // Eigene Kacheln, deren neuester Stand noch nicht bestaetigt ist (ok vom Dienst).
  // Je Kachel zaehlt nur der neueste Stand. nr ist die Sendenummer in der laufenden
  // Verbindung (null = in dieser Verbindung noch nicht gesendet). Ein ok gilt nur fuer genau
  // die Sendung mit seiner nr; ein ok fuer einen aelteren Stand laesst den neueren stehen.
  class Ausstehend {
    #kacheln = new Map();
    setzen(kachel, png) {
      this.#kacheln.delete(kachel);
      this.#kacheln.set(kachel, { png, nr: null });
    }
    // noch nicht in dieser Verbindung gesendet
    ungesendet() { return [...this.#kacheln].filter(([, e]) => e.nr === null).map(([kachel, e]) => ({ kachel, png: e.png })); }
    // Portion: so viele Ungesendete, dass danach hoechstens max unbestaetigt unterwegs sind.
    naechste(max) { return this.ungesendet().slice(0, Math.max(0, max - this.unterwegs)); }
    gesendet(kachel, nr) {
      const e = this.#kacheln.get(kachel);
      if (e) e.nr = nr;
    }
    bestaetigen(kachel, nr) {
      const e = this.#kacheln.get(kachel);
      if (!e || e.nr === null || e.nr !== nr) return false;
      this.#kacheln.delete(kachel);
      return true;
    }
    // neue Verbindung: alles Unbestaetigte gilt als ungesendet und geht noch einmal raus
    zuruecksetzen() { for (const e of this.#kacheln.values()) e.nr = null; }
    alle() { return [...this.#kacheln].map(([kachel, e]) => ({ kachel, png: e.png })); }
    // Kachel, deren neuester Stand genau mit dieser Sendenummer unterwegs ist, sonst null.
    nrKachel(nr) {
      for (const [kachel, e] of this.#kacheln) if (e.nr !== null && e.nr === nr) return kachel;
      return null;
    }
    eintrag(kachel) {
      const e = this.#kacheln.get(kachel);
      return e ? { png: e.png, nr: e.nr } : null;
    }
    hat(kachel) { return this.#kacheln.has(kachel); }
    leeren() { this.#kacheln.clear(); }
    get groesse() { return this.#kacheln.size; }
    get unterwegs() { let n = 0; for (const e of this.#kacheln.values()) if (e.nr !== null) n++; return n; }
  }

  const zielEbene = (eintrag, ich) => (eintrag?.autor === ich ? "eigen" : "fremd");

  // Neuaufbau nach einem ersetzten Protokoll: die eigene Ebene ist lokal massgeblich. Hochgeladen
  // werden alle lokalen Kacheln und alle eigenen Kacheln des neuen Stands (die lokal fehlen, gehen als null raus).
  const neuAufbauKacheln = (lokal, imStand) => [...new Set([...lokal, ...imStand])].filter(istKachelSchluessel).sort();

  // Grundlage des Fingerabdrucks: sortierte Zeilen autor|kachel|hash.
  // Protokoll-, nicht Pixelgleichheit: gehasht werden die zuletzt gesendeten/empfangenen PNGs.
  const fingerabdruckText = (liste) => liste.map(e => `${e.autor}|${e.kachel}|${e.hash}`).sort().join("\n");

  // Schutzfelder (Ergebnisfelder je Person, [x, y, w, h] in Flaechenpunkten). Grenzen wie istSchutzfelderListe in
  // abgleich/protokoll.mjs. Liste [{person, felder}] -> Map(person -> felder); leere oder ungueltige Eintraege fallen weg.
  const MAX_SCHUTZFELDER = 200, MAX_SCHUTZ_ZAHL = 20480, KACHEL_PX = 512;
  const istSchutzfelder = felder => Array.isArray(felder) && felder.length <= MAX_SCHUTZFELDER && felder.every(f =>
    Array.isArray(f) && f.length === 4 && f.every(v => Number.isInteger(v) && v >= 0 && v <= MAX_SCHUTZ_ZAHL));
  function schutzListe(liste) {
    const schutz = new Map();
    for (const e of Array.isArray(liste) ? liste : []) {
      if (!e || typeof e.person !== "string" || !KENNUNG.test(e.person) || !istSchutzfelder(e.felder) || !e.felder.length) continue;
      schutz.set(e.person, e.felder.map(f => [...f]));
    }
    return schutz;
  }
  // Fremde Schutzfelder geschnitten mit der Kachel "tx,ty", in Kachelpixeln (wie schnittMitKachel in abgleich/dienst.mjs).
  function schutzRechtecke(schutz, ich, kachel) {
    const [tx, ty] = String(kachel).split(",").map(Number), r = [];
    for (const [person, felder] of schutz) {
      if (person === ich) continue;
      for (const [fx, fy, fw, fh] of felder) {
        const x0 = Math.max(fx, tx * KACHEL_PX), y0 = Math.max(fy, ty * KACHEL_PX);
        const x1 = Math.min(fx + fw, (tx + 1) * KACHEL_PX), y1 = Math.min(fy + fh, (ty + 1) * KACHEL_PX);
        if (x1 > x0 && y1 > y0) r.push({ x: x0 - tx * KACHEL_PX, y: y0 - ty * KACHEL_PX, w: x1 - x0, h: y1 - y0 });
      }
    }
    return r;
  }

  // MCP auf der Gruppenflaeche vor dem ersten Stand: veraendernde Werkzeuge und Aufnahmen warten (GROUP_NOT_READY).
  // Sonst saehe eine Aufnahme die eigene Tinte nicht, und ein neues Objekt bekaeme die id eines gespeicherten.
  const MCP_WARTET = new Set(["mcp_present_widget", "mcp_draw", "mcp_plot", "mcp_patch_file", "mcp_edit_canvas", "mcp_upload_image",
    "mcp_place_image", "mcp_upload_image_to_document", "mcp_capture_canvas", "mcp_capture_widget", "mcp_capture_primitives"]);
  function mcpWartetAufGruppe(name, args) {
    if (name === "mcp_present_widget" && args?.presentation?.intent === "inspect") return false; // prueft nur, setzt nichts
    if (MCP_WARTET.has(name)) return true;
    return (name === "mcp_inbox" || name === "mcp_read_feedback") && args?.capture === true; // Rueckmeldung mit Bildern
  }

  // Live-Zeiger (fluechtig). FLAECHE_PX dupliziert abgleich/protokoll.mjs: 40 Kacheln zu je 512.
  const FLAECHE_PX = 40 * 512;
  const imFeld = v => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= FLAECHE_PX;
  const istZeigerMeldung = m => Boolean(m) && m.typ === "zeiger" && typeof m.autor === "string" && KENNUNG.test(m.autor)
    && (m.weg === true || (imFeld(m.x) && imFeld(m.y)));

  // Feste Farbe je Person (FNV-1a ueber die Kennung -> Farbton).
  function zeigerFarbe(person) {
    let h = 0x811c9dc5;
    for (const ch of String(person)) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
    return `hsl(${h % 360} 70% 40%)`;
  }

  // Drosselt die eigene Zeigerposition: sofort, wenn der Abstand um ist, sonst merkt er sich den
  // neuesten Punkt; nachreichen() liefert ihn nach Ablauf von warte genau einmal.
  class ZeigerTakt {
    #abstand; #letzt = -Infinity; #offen = null;
    constructor(abstand) { this.#abstand = abstand; }
    melden(punkt, jetzt) {
      if (jetzt - this.#letzt >= this.#abstand) {
        this.#letzt = jetzt;
        this.#offen = null;
        return { senden: punkt, warte: 0 };
      }
      this.#offen = punkt;
      return { senden: null, warte: this.#abstand - (jetzt - this.#letzt) };
    }
    nachreichen(jetzt) {
      const punkt = this.#offen;
      if (!punkt) return null;
      this.#offen = null;
      this.#letzt = jetzt;
      return punkt;
    }
  }

  // Anzeigename: namen[id] (vom Dienst), sonst die Id. Nur eigene Eintraege, Steuerzeichen raus, hoechstens 60 Zeichen.
  const NAME_MAX = 60;
  function anzeigeName(namen, id) {
    if (!namen || typeof namen !== "object" || !Object.hasOwn(namen, id) || typeof namen[id] !== "string") return id;
    const name = namen[id].replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim().slice(0, NAME_MAX).trim();
    return name || id;
  }

  // Live-Striche (fluechtig). Der Dienst drosselt je Verbindung auf eine Nachricht je 40 ms und VERWIRFT die zu schnellen.
  // Darum traegt jede Nachricht die Punkte der vorigen noch einmal mit (LiveSender) und der Empfaenger legt
  // die Ueberlappung wieder zusammen: geht eine Nachricht verloren, bleibt keine Luecke.
  const LIVE_ABSTAND_MS = 50; // Abstand der eigenen Nachrichten: 40 ms des Dienstes plus Reserve fuer Netz-Jitter
  const LIVE_MAX_PUNKTE = 200; // je Nachricht (Protokoll)
  const LIVE_STRICH_PUNKTE = 3000; // je Strich beim Empfaenger
  const LIVE_MAX_STRICHE = 64;
  const LIVE_VERFALL_MS = 3000;
  const FARBE = /^[#a-zA-Z0-9(),.%\s-]{1,32}$/;
  const zahl = v => typeof v === "number" && Number.isFinite(v);
  const rund = v => Math.round(v * 10) / 10;

  function istLiveMeldung(m) {
    if (!m || typeof m !== "object" || m.typ !== "live") return false;
    if (typeof m.autor !== "string" || !KENNUNG.test(m.autor)) return false;
    if (typeof m.strich !== "string" || m.strich === "" || m.strich.length > 40) return false;
    if (!Array.isArray(m.punkte) || m.punkte.length > LIVE_MAX_PUNKTE) return false;
    if (!m.punkte.every(p => Array.isArray(p) && p.length === 3 && imFeld(p[0]) && imFeld(p[1]) && zahl(p[2]) && p[2] >= 0 && p[2] <= 2000)) return false;
    if (typeof m.farbe !== "string" || !FARBE.test(m.farbe) || !zahl(m.staerke) || m.staerke < 0 || m.staerke > 2000) return false;
    return m.ende === undefined || m.ende === true;
  }

  const gleichPunkt = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

  // Fremde Live-Striche: je "autor|strich" die Punkte, bis der Autor eine Kachel schickt oder 3 s nichts mehr kommt.
  function liveStriche() {
    const striche = new Map();
    const entfernen = ids => { for (const id of ids) striche.delete(id); return ids; };
    return {
      aufnehmen(m, jetzt) {
        if (!istLiveMeldung(m)) return false;
        const id = `${m.autor}|${m.strich}`;
        let s = striche.get(id);
        if (!s) {
          if (!m.punkte.length) return false;
          s = { id, autor: m.autor, strich: m.strich, punkte: [], farbe: m.farbe, staerke: m.staerke, fertig: false, zuletzt: jetzt };
          striche.set(id, s);
          while (striche.size > LIVE_MAX_STRICHE) {
            const aeltester = [...striche.values()].reduce((a, b) => (b.zuletzt < a.zuletzt ? b : a));
            if (aeltester === s) break;
            striche.delete(aeltester.id);
          }
        }
        let ueberlapp = 0;
        for (let k = Math.min(s.punkte.length, m.punkte.length); k > 0 && !ueberlapp; k--) {
          const ende = s.punkte.length - k;
          if (m.punkte.slice(0, k).every((p, i) => gleichPunkt(p, s.punkte[ende + i]))) ueberlapp = k;
        }
        s.punkte.push(...m.punkte.slice(ueberlapp).map(p => [p[0], p[1], p[2]]));
        if (s.punkte.length > LIVE_STRICH_PUNKTE) s.punkte.splice(0, s.punkte.length - LIVE_STRICH_PUNKTE);
        s.farbe = m.farbe;
        s.staerke = m.staerke;
        s.fertig = m.ende === true;
        s.zuletzt = jetzt;
        return true;
      },
      // Der Autor hat eine Kachel geschickt: seine Live-Striche sind jetzt in der Ebene. nurFertige laesst einen
      // noch laufenden Strich stehen (die Kachel kann zu einem frueheren gehoeren).
      entfernenAutor(autor, nurFertige = false) {
        return entfernen([...striche.values()].filter(s => s.autor === autor && (!nurFertige || s.fertig)).map(s => s.id));
      },
      aufraeumen(jetzt) {
        return entfernen([...striche.values()].filter(s => jetzt - s.zuletzt > LIVE_VERFALL_MS).map(s => s.id));
      },
      alle() { return [...striche.values()]; },
      leeren() { striche.clear(); },
    };
  }

  // Eigener Strich: sammelt Punkte und gibt hoechstens alle abstand ms eine Nachricht her. Jede Nachricht enthaelt
  // die neuen Punkte der vorigen Nachricht noch einmal (siehe oben), ende:true geht immer sofort und ist nie gedrosselt.
  class LiveSender {
    #strich; #farbe; #staerke; #abstand;
    #neu = []; #zuvor = []; #letzt = -Infinity; #gesendet = false; #beendet = false;
    constructor(strich, farbe, staerke, abstand = LIVE_ABSTAND_MS) {
      this.#strich = strich;
      this.#farbe = farbe;
      this.#staerke = rund(staerke);
      this.#abstand = abstand;
    }
    punkt(x, y, d) { if (!this.#beendet) this.#neu.push([rund(x), rund(y), rund(d)]); }
    // Wartezeit bis zur naechsten erlaubten Nachricht (0 = jetzt).
    warte(jetzt) { return Math.max(0, this.#abstand - (jetzt - this.#letzt)); }
    get offen() { return this.#neu.length > 0; }
    abholen(jetzt, ende = false) {
      if (this.#beendet) return null;
      if (!ende && (!this.#neu.length || this.warte(jetzt) > 0)) return null;
      if (ende && !this.#neu.length && !this.#gesendet) { this.#beendet = true; return null; }
      const punkte = [...this.#zuvor, ...this.#neu].slice(-LIVE_MAX_PUNKTE);
      this.#zuvor = this.#neu.slice(-LIVE_MAX_PUNKTE);
      this.#neu = [];
      this.#gesendet = true;
      if (ende) this.#beendet = true; else this.#letzt = jetzt;
      return { typ: "live", strich: this.#strich, punkte, farbe: this.#farbe, staerke: this.#staerke, ...(ende ? { ende: true } : {}) };
    }
  }

  // Lage der Anwesenheitsanzeige (Abnahme C, Befund 3): links unten, direkt ueber PenEchos Zoom-Knoepfen, weil die
  // Huelle ihre Leiste (Speichern, Abgeben, ...) rechts oben ueber die Flaeche legt und unten nichts hat. Rechts bleiben
  // 64 px frei (schmal liegt dort PenEchos MCP-Knopf). fenster {breite, hoehe}; flaeche und zoom sind DOMRects oder null.
  // Ergebnis in px fuer position:fixed: left, bottom (Abstand zur Fensterunterkante), maxWidth.
  function anwesendLage(fenster, flaeche, zoom) {
    const hoehe = Number(fenster?.hoehe) || 0, breite = Number(fenster?.breite) || 0;
    const fl = flaeche && flaeche.width > 0 && flaeche.height > 0 ? flaeche : null;
    const links = fl ? fl.left : 0, rechts = fl ? fl.right : breite, unten = fl ? fl.bottom : hoehe;
    const mitte = fl ? (fl.top + fl.bottom) / 2 : hoehe / 2;
    let left = links + 12, bottom = Math.max(0, hoehe - unten) + 12;
    if (zoom && zoom.width > 0 && zoom.height > 0 && zoom.top > mitte) {
      left = Math.max(links + 12, zoom.left);
      bottom = Math.max(0, hoehe - zoom.top) + 8;
    }
    const maxWidth = Math.max(120, Math.min(360, rechts - left - 64));
    return { left: Math.round(left), bottom: Math.round(bottom), maxWidth: Math.round(maxWidth) };
  }

  // Bereich der eigenen Mappe (Abnahme C, Befund 1): Vereinigung der eigenen Objekt-Kaesten {x, y, w, h} und der eigenen
  // Schutzfelder [[x, y, w, h], ...]; ungueltige oder leere Kaesten zaehlen nicht. null ohne eigene Mappe.
  function mappeBereich(kaesten, schutzfelder) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const nehmen = (x, y, w, h) => {
      if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h);
    };
    for (const k of Array.isArray(kaesten) ? kaesten : []) if (k) nehmen(k.x, k.y, k.w, k.h);
    for (const f of Array.isArray(schutzfelder) ? schutzfelder : []) if (Array.isArray(f)) nehmen(...f);
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }

  // Ausschnitt fuer die Ansicht nach dem Laden: der obere Teil der Mappe (Namensschild, erste Aufgaben), hoechstens so
  // hoch wie breit. Eine ganze Mappe mit 16 Aufgaben (2100 x 15200) waere gerahmt bei ~5 % Zoom unlesbar; die Huelle
  // springt nach "Flaeche verbinden" ohnehin auf die aktuelle Aufgabe.
  function mappeAnsicht(bereich) {
    if (!bereich) return null;
    return { x: bereich.x, y: bereich.y, w: bereich.w, h: Math.min(bereich.h, bereich.w) };
  }

  return Object.freeze({ anwesendLage, mappeBereich, mappeAnsicht, KENNUNG, gruppeAusUrl, istKachelSchluessel, pngMasse, fensterKennung, Folge, Ausstehend, zielEbene, neuAufbauKacheln, fingerabdruckText, istZeigerMeldung, zeigerFarbe, ZeigerTakt, anzeigeName, istLiveMeldung, liveStriche, LiveSender, LIVE_ABSTAND_MS, schutzListe, schutzRechtecke, mcpWartetAufGruppe });
})();
if (typeof module === "object" && module.exports) module.exports = LernflaecheGruppeKern;
