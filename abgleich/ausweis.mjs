// Ausweis: kurzlebiger, signierter Berechtigungsschein fuer genau eine Verbindung.
// Format (muss in der Huelle, Python, wortgleich ausgestellt werden; Vektor: ausweis_vektor.json):
//   nutzlast = "<flaeche>|<person>|<ablauf_unix>|<b64url(name_utf8)>"
//   ausweis  = b64url(nutzlast) + "." + hmac_sha256_hex(sha256("abgleich-ausweis:" + schluessel), b64url(nutzlast))[:48]
// b64url ist base64url ohne Fuellzeichen. Gueltig, solange jetzt <= ablauf (Unix-Sekunden).
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const b64url = (daten) => Buffer.from(daten).toString("base64url");
const B64URL = /^[A-Za-z0-9_-]*$/;
const ZAHL = /^[0-9]{1,15}$/;

const signatur = (schluessel, teil) => {
  const k = createHash("sha256").update(`abgleich-ausweis:${schluessel}`).digest();
  return createHmac("sha256", k).update(teil).digest("hex").slice(0, 48);
};

export function stelleAusweis(schluessel, flaeche, person, name, ablauf) {
  const nutzlast = `${flaeche}|${person}|${ablauf}|${b64url(Buffer.from(name, "utf8"))}`;
  const teil = b64url(Buffer.from(nutzlast, "utf8"));
  return `${teil}.${signatur(schluessel, teil)}`;
}

// {flaeche, person, name} oder null (kaputt, falsch signiert, abgelaufen).
export function pruefeAusweis(schluessel, ausweis, jetzt) {
  if (typeof ausweis !== "string") return null;
  const teile = ausweis.split(".");
  if (teile.length !== 2 || !B64URL.test(teile[0])) return null;
  const soll = Buffer.from(signatur(schluessel, teile[0]), "utf8");
  const ist = Buffer.from(teile[1], "utf8");
  if (soll.length !== ist.length || !timingSafeEqual(soll, ist)) return null;
  const felder = Buffer.from(teile[0], "base64url").toString("utf8").split("|");
  if (felder.length !== 4 || !ZAHL.test(felder[2]) || !B64URL.test(felder[3])) return null;
  if (jetzt > Number(felder[2])) return null;
  return { flaeche: felder[0], person: felder[1], name: Buffer.from(felder[3], "base64url").toString("utf8") };
}
