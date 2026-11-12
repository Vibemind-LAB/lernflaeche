// Protokoll des Abgleichs: reine Pruefung, keine Ein-/Ausgabe.
export const KENNUNG = /^[a-z0-9-]{1,40}$/;
// Mit Schluessel erzwingt der Dienst diese engeren Formen (beide erfuellen KENNUNG).
export const GRUPPEN_KENNUNG = /^g-[0-9]{1,9}$/;
export const PERSONEN_KENNUNG = /^p[0-9a-f]{24}$/;
export const MAX_SCHUTZFELDER = 200;
export const MAX_SCHUTZ_ZAHL = 20480;
export const MAX_PNG_BYTES = 524288;
// PenEchos tile() legt jede Kachel als 512x512-Leinwand an (canvas-runtime.js, TILE in core.js).
export const KACHEL_PX = 512;

const PNG_SIGNATUR = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR = [0x49, 0x48, 0x44, 0x52];
const SCHLUESSEL = /^(0|[1-9]\d?),(0|[1-9]\d?)$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MAX_BASE64_ZEICHEN = Math.ceil(MAX_PNG_BYTES / 3) * 4;

export function istKachelSchluessel(s) {
  if (typeof s !== "string") return false;
  const m = SCHLUESSEL.exec(s);
  return m !== null && Number(m[1]) <= 39 && Number(m[2]) <= 39;
}

// Breite und Hoehe aus dem IHDR-Block (muss direkt nach der Signatur stehen), sonst null.
export function pngMasse(bytes) {
  if (!bytes || bytes.length < 24) return null;
  if (!PNG_SIGNATUR.every((b, i) => bytes[i] === b)) return null;
  const laenge = ((bytes[8] << 24) | (bytes[9] << 16) | (bytes[10] << 8) | bytes[11]) >>> 0;
  if (laenge !== 13 || !IHDR.every((b, i) => bytes[12 + i] === b)) return null;
  const zahl = (o) => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
  return { breite: zahl(16), hoehe: zahl(20) };
}

// Kantenlaenge der ganzen Flaeche in Flaechenpunkten: 40 Kacheln (Schluessel 0..39) zu je KACHEL_PX.
export const FLAECHE_PX = 40 * KACHEL_PX;

// Live-Zeiger: {typ:"zeiger", x, y} mit 0 <= x, y <= FLAECHE_PX oder {typ:"zeiger", weg:true}.
// Liefert die zu verteilende Form ohne Autor oder null (ungueltig, wird still verworfen).
export function pruefeZeigerNachricht(nachricht) {
  if (typeof nachricht !== "object" || nachricht === null || nachricht.typ !== "zeiger") return null;
  if (nachricht.weg === true) return { weg: true };
  const { x, y } = nachricht;
  const imFeld = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= FLAECHE_PX;
  return imFeld(x) && imFeld(y) ? { x, y } : null;
}

// Schutzfelder: Liste von [x, y, w, h], hoechstens MAX_SCHUTZFELDER, jede Zahl ganz in 0..MAX_SCHUTZ_ZAHL.
export function istSchutzfelderListe(felder) {
  return Array.isArray(felder) && felder.length <= MAX_SCHUTZFELDER && felder.every((f) =>
    Array.isArray(f) && f.length === 4 && f.every((v) => Number.isInteger(v) && v >= 0 && v <= MAX_SCHUTZ_ZAHL));
}

export function pruefeKachelNachricht(nachricht) {
  if (typeof nachricht !== "object" || nachricht === null || Array.isArray(nachricht)) {
    return { ok: false, grund: "Nachricht ist kein Objekt" };
  }
  if (nachricht.typ !== "kachel") return { ok: false, grund: "Unbekannter Typ" };
  if (!istKachelSchluessel(nachricht.kachel)) return { ok: false, grund: "Ungueltiger Kachelschluessel" };
  const { png } = nachricht;
  if (png === null) return { ok: true, kachel: nachricht.kachel, png: null };
  if (typeof png !== "string" || png.length === 0) return { ok: false, grund: "png fehlt oder ist kein Base64-Text" };
  if (png.length > MAX_BASE64_ZEICHEN) return { ok: false, grund: "Kachel zu gross" };
  if (!BASE64.test(png)) return { ok: false, grund: "png ist kein gueltiges Base64" };
  const bytes = Buffer.from(png, "base64");
  if (bytes.length > MAX_PNG_BYTES) return { ok: false, grund: "Kachel zu gross" };
  if (bytes.length < PNG_SIGNATUR.length || !PNG_SIGNATUR.every((b, i) => bytes[i] === b)) {
    return { ok: false, grund: "Keine PNG-Daten" };
  }
  const masse = pngMasse(bytes);
  if (!masse) return { ok: false, grund: "PNG ohne gueltigen IHDR-Kopf" };
  if (masse.breite !== KACHEL_PX || masse.hoehe !== KACHEL_PX) {
    return { ok: false, grund: `PNG muss ${KACHEL_PX}x${KACHEL_PX} Pixel haben` };
  }
  return { ok: true, kachel: nachricht.kachel, png: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length) };
}

// Objekte (Texte, Bilder, Widgets): {typ:"objekt", id, daten: object|null}. daten=null loescht.
export const OBJEKT_ID = /^[A-Za-z0-9_-]{1,80}$/;
export const MAX_OBJEKT_BYTES = 900000;
// Grenzen gegen boesartig tiefe oder riesige Daten: daten selbst ist Ebene 1.
export const MAX_OBJEKT_TIEFE = 32;
export const MAX_OBJEKT_WERTE = 20000;
const istZahl = (v) => typeof v === "number" && Number.isFinite(v);

// Prueft Tiefe und Menge ohne Rekursion (explizierter Stapel). Gezaehlt werden alle Werte und Schluessel.
export function formOk(wurzel) {
  const stapel = [[wurzel, 1]];
  let menge = 0;
  while (stapel.length > 0) {
    const [wert, tiefe] = stapel.pop();
    if (typeof wert !== "object" || wert === null) { if (++menge > MAX_OBJEKT_WERTE) return false; continue; }
    if (tiefe > MAX_OBJEKT_TIEFE) return false;
    if (++menge > MAX_OBJEKT_WERTE) return false;
    const kinder = Array.isArray(wert) ? wert : Object.values(wert);
    if (!Array.isArray(wert)) menge += kinder.length;
    if (menge > MAX_OBJEKT_WERTE) return false;
    for (const k of kinder) stapel.push([k, tiefe + 1]);
  }
  return true;
}

export function pruefeObjektNachricht(nachricht) {
  if (typeof nachricht !== "object" || nachricht === null || nachricht.typ !== "objekt") return { ok: false, grund: "Unbekannter Typ" };
  if (typeof nachricht.id !== "string" || !OBJEKT_ID.test(nachricht.id)) return { ok: false, grund: "Ungueltige Objekt-Id" };
  const { daten } = nachricht;
  if (daten === null) return { ok: true, id: nachricht.id, daten: null };
  if (typeof daten !== "object" || daten === undefined || Array.isArray(daten)) return { ok: false, grund: "daten muss ein Objekt oder null sein" };
  if (typeof daten.art !== "string" || daten.art === "") return { ok: false, grund: "daten.art fehlt" };
  if (!["x", "y", "w", "h"].every((k) => istZahl(daten[k]))) return { ok: false, grund: "daten braucht Zahlen x, y, w, h" };
  if (!formOk(daten)) return { ok: false, grund: "Objekt zu tief verschachtelt oder zu gross" };
  let laenge;
  try {
    laenge = Buffer.byteLength(JSON.stringify(daten), "utf8");
  } catch {
    return { ok: false, grund: "daten nicht darstellbar" };
  }
  if (laenge > MAX_OBJEKT_BYTES) return { ok: false, grund: "Objekt zu gross" };
  return { ok: true, id: nachricht.id, daten };
}

// Live-Strich (fluechtig): {typ:"live", strich<=40, punkte<=200 mal [x,y,d], farbe<=32, staerke, ende?:true}.
// Liefert die zu verteilende Form ohne Autor oder null (still verworfen).
export function pruefeLiveNachricht(nachricht) {
  if (typeof nachricht !== "object" || nachricht === null || nachricht.typ !== "live") return null;
  const { strich, punkte, farbe, staerke, ende } = nachricht;
  if (typeof strich !== "string" || strich === "" || strich.length > 40) return null;
  if (!Array.isArray(punkte) || punkte.length > 200) return null;
  if (!punkte.every((p) => Array.isArray(p) && p.length === 3 && p.every(istZahl))) return null;
  if (typeof farbe !== "string" || farbe.length > 32 || !istZahl(staerke)) return null;
  if (ende !== undefined && ende !== true) return null;
  return { strich, punkte, farbe, staerke, ...(ende ? { ende: true } : {}) };
}
