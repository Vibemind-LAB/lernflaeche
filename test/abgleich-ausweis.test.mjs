import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pruefeAusweis, stelleAusweis } from "../abgleich/ausweis.mjs";

const SCHLUESSEL = "testschluessel-nur-fuer-den-vektor-0123456789abcdef";
const FLAECHE = "g-7";
const PERSON = "p0123456789abcdef01234567";

test("ausweis_vektor_stimmt", () => {
  const v = JSON.parse(fs.readFileSync(new URL("../abgleich/ausweis_vektor.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(v).sort(), ["ablauf", "ausweis", "flaeche", "name", "person", "schluessel"]);
  assert.equal(v.flaeche, "g-7");
  assert.equal(v.person, PERSON);
  assert.equal(v.name, "Anna Ä.");
  assert.equal(v.ablauf, 2000000000);
  assert.equal(stelleAusweis(v.schluessel, v.flaeche, v.person, v.name, v.ablauf), v.ausweis);
  assert.deepEqual(pruefeAusweis(v.schluessel, v.ausweis, 1900000000), { flaeche: v.flaeche, person: v.person, name: v.name });
});

test("ausweis_gueltig_bis_ablauf_einschliesslich", () => {
  const a = stelleAusweis(SCHLUESSEL, FLAECHE, PERSON, "Anna", 1000);
  assert.deepEqual(pruefeAusweis(SCHLUESSEL, a, 1000), { flaeche: FLAECHE, person: PERSON, name: "Anna" });
});

test("ausweis_abgelaufen_null", () => {
  const a = stelleAusweis(SCHLUESSEL, FLAECHE, PERSON, "Anna", 1000);
  assert.equal(pruefeAusweis(SCHLUESSEL, a, 1001), null);
});

test("ausweis_falsche_signatur_null", () => {
  const a = stelleAusweis(SCHLUESSEL, FLAECHE, PERSON, "Anna", 2000000000);
  assert.equal(pruefeAusweis(SCHLUESSEL + "x", a, 1), null);
  const [teil, sig] = a.split(".");
  const verfaelscht = Buffer.from(`${FLAECHE}|pffffffffffffffffffffffff|2000000000|${Buffer.from("Anna").toString("base64url")}`).toString("base64url");
  assert.equal(pruefeAusweis(SCHLUESSEL, `${verfaelscht}.${sig}`, 1), null);
  assert.equal(pruefeAusweis(SCHLUESSEL, `${teil}.${sig.slice(0, -1)}0`, 1) === null || sig.endsWith("0"), true);
  assert.equal(pruefeAusweis(SCHLUESSEL, "", 1), null);
  assert.equal(pruefeAusweis(SCHLUESSEL, "abc", 1), null);
  assert.equal(pruefeAusweis(SCHLUESSEL, `${teil}.${sig}.x`, 1), null);
  assert.equal(pruefeAusweis(SCHLUESSEL, undefined, 1), null);
});

test("ausweis_name_mit_trennzeichen", () => {
  for (const name of ["a|b", "Jörg Æ 🙂", ""]) {
    const a = stelleAusweis(SCHLUESSEL, FLAECHE, PERSON, name, 2000000000);
    assert.equal(pruefeAusweis(SCHLUESSEL, a, 1).name, name);
  }
});
