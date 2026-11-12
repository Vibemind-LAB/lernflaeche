"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { KENNUNG, gruppeAusUrl, Folge, Ausstehend, zielEbene } = require("../src/shared/gruppe-kern.js");

test("gruppeAusUrl liest gueltige Werte", () => assert.deepEqual(gruppeAusUrl("?gruppe=test-1&person=anna"), {gruppe:"test-1", person:"anna"}));
test("gruppeAusUrl lehnt ungueltige ab", () => { for (const s of ["", "?gruppe=x", "?gruppe=A B&person=anna", "?gruppe=x&person=../a"]) assert.equal(gruppeAusUrl(s), null); });
test("Folge verwirft Doppeltes und Aelteres", () => { const f = new Folge(5); assert.equal(f.annehmen(5), false); assert.equal(f.annehmen(4), false); assert.equal(f.annehmen(6), true); assert.equal(f.seq, 6); });
test("Ausstehend haelt je Kachel nur den neuesten Stand", () => { const a = new Ausstehend(); a.setzen("1,1","A"); a.setzen("1,1",null); assert.deepEqual(a.alle(), [{kachel:"1,1", png:null}]); });
test("zielEbene", () => { assert.equal(zielEbene({autor:"anna"},"anna"),"eigen"); assert.equal(zielEbene({autor:"ben"},"anna"),"fremd"); });

test("Folge beginnt bei 0 und Ausstehend leert sich", () => {
  const f = new Folge();
  assert.equal(f.seq, 0);
  assert.equal(f.annehmen(1), true);
  const a = new Ausstehend();
  a.setzen("0,0", "A");
  a.setzen("2,3", "B");
  assert.deepEqual(a.alle(), [{kachel:"0,0", png:"A"}, {kachel:"2,3", png:"B"}]);
  assert.equal(a.hat("0,0"), true);
  assert.equal(a.hat("9,9"), false);
  a.leeren();
  assert.deepEqual(a.alle(), []);
  assert.equal(a.hat("0,0"), false);
});

test("fingerabdruckText sortiert die Zeilen autor|kachel|hash", () => {
  const { fingerabdruckText } = require("../src/shared/gruppe-kern.js");
  assert.equal(fingerabdruckText([{autor:"ben", kachel:"1,0", hash:"bb"}, {autor:"anna", kachel:"2,0", hash:"aa"}, {autor:"anna", kachel:"10,0", hash:"cc"}]),
    "anna|10,0|cc\nanna|2,0|aa\nben|1,0|bb");
  assert.equal(fingerabdruckText([]), "");
});

test("istKachelSchluessel wie im Protokoll", async () => {
  const { istKachelSchluessel } = require("../src/shared/gruppe-kern.js");
  const protokoll = await import(pathToFileURL(path.join(__dirname, "..", "abgleich", "protokoll.mjs")).href);
  for (const s of ["0,0", "39,39", "40,0", "01,2", "1,1,1", "-1,0", "", null, 5, "3, 4"]) assert.equal(istKachelSchluessel(s), protokoll.istKachelSchluessel(s), String(s));
});

test("KENNUNG entspricht dem Protokoll des Dienstes", async () => {
  const protokoll = await import(pathToFileURL(path.join(__dirname, "..", "abgleich", "protokoll.mjs")).href);
  assert.equal(KENNUNG.source, protokoll.KENNUNG.source);
  assert.equal(KENNUNG.flags, protokoll.KENNUNG.flags);
});

test("Ausstehend: ok bestaetigt nur genau die Sendung, Neueres bleibt stehen", () => {
  const a = new Ausstehend();
  a.setzen("1,1", "A");
  assert.deepEqual(a.ungesendet(), [{kachel:"1,1", png:"A"}]);
  a.gesendet("1,1", 1);
  assert.deepEqual(a.ungesendet(), []);
  assert.equal(a.unterwegs, 1);
  a.setzen("1,1", "B"); // neuer Stand, waehrend A unterwegs ist
  assert.deepEqual(a.ungesendet(), [{kachel:"1,1", png:"B"}]);
  assert.equal(a.bestaetigen("1,1", 1), false, "ok fuer A darf B nicht loeschen");
  assert.equal(a.hat("1,1"), true);
  a.gesendet("1,1", 2);
  assert.equal(a.bestaetigen("1,1", 2), true);
  assert.equal(a.groesse, 0);
  assert.equal(a.bestaetigen("1,1", 2), false, "doppeltes ok");
  assert.equal(a.bestaetigen("9,9", 1), false);
});

test("Ausstehend: nach Neuverbindung geht nur Unbestaetigtes noch einmal raus", () => {
  const a = new Ausstehend();
  a.setzen("0,0", "A"); a.setzen("0,1", "B"); a.setzen("0,2", null);
  a.gesendet("0,0", 1); a.gesendet("0,1", 2); a.gesendet("0,2", 3);
  assert.equal(a.bestaetigen("0,1", 2), true);
  assert.equal(a.bestaetigen("0,0", 7), false, "fremde nr");
  a.zuruecksetzen(); // Verbindung weg, ok fuer 0,0 und 0,2 kam nie
  assert.deepEqual(a.ungesendet(), [{kachel:"0,0", png:"A"}, {kachel:"0,2", png:null}]);
  assert.equal(a.unterwegs, 0);
  assert.equal(a.bestaetigen("0,0", 1), false, "spaetes ok der alten Verbindung zaehlt nicht");
  a.gesendet("0,0", 4); a.gesendet("0,2", 5);
  assert.equal(a.bestaetigen("0,0", 4) && a.bestaetigen("0,2", 5), true);
  assert.equal(a.groesse, 0);
});

test("Ausstehend: naechste gibt hoechstens so viele, dass hoechstens max unterwegs sind", () => {
  const a = new Ausstehend();
  for (let i = 0; i < 40; i++) a.setzen(`0,${i}`, `P${i}`);
  const erste = a.naechste(16);
  assert.equal(erste.length, 16);
  assert.deepEqual(erste[0], { kachel:"0,0", png:"P0" });
  erste.forEach((e, i) => a.gesendet(e.kachel, i + 1));
  assert.deepEqual(a.naechste(16), [], "Fenster voll");
  assert.equal(a.bestaetigen("0,0", 1) && a.bestaetigen("0,1", 2), true);
  const weiter = a.naechste(16);
  assert.deepEqual(weiter.map(e => e.kachel), ["0,16", "0,17"]);
  a.zuruecksetzen();
  assert.equal(a.naechste(16).length, 16, "nach Neuverbindung wieder volles Fenster");
  assert.equal(a.naechste(0).length, 0);
});

test("pngMasse wie im Protokoll", async () => {
  const { pngMasse } = require("../src/shared/gruppe-kern.js");
  const { pngKopf } = require("./abgleich-hilfe.cjs");
  const protokoll = await import(pathToFileURL(path.join(__dirname, "..", "abgleich", "protokoll.mjs")).href);
  const kopf = pngKopf(512, 512);
  const falscherName = Buffer.from(kopf); falscherName.write("IDAT", 12, "latin1");
  const proben = [kopf, pngKopf(600, 600), pngKopf(30000, 30000), pngKopf(0xffffffff, 1), kopf.subarray(0, 23), falscherName,
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("GIF89a................................"), null];
  for (const p of proben) assert.deepEqual(pngMasse(p && new Uint8Array(p)), protokoll.pngMasse(p), String(p && p.length));
  assert.deepEqual(pngMasse(new Uint8Array(kopf)), {breite:512, hoehe:512});
});

test("fensterKennung: 32 Hexzeichen, passt zu KENNUNG", () => {
  const { fensterKennung } = require("../src/shared/gruppe-kern.js");
  const crypto = require("node:crypto");
  const k = fensterKennung(crypto.getRandomValues(new Uint8Array(16)));
  assert.match(k, /^[0-9a-f]{32}$/);
  assert.ok(KENNUNG.test(k));
  assert.equal(fensterKennung(new Uint8Array(16).fill(255)), "f".repeat(32));
  assert.throws(() => fensterKennung(new Uint8Array(4)));
});

test("neuAufbauKacheln: lokale und eigene Stand-Kacheln, ohne Doppel, nur gueltige Schluessel", () => {
  const { neuAufbauKacheln } = require("../src/shared/gruppe-kern.js");
  assert.deepEqual(neuAufbauKacheln(["1,1", "0,0"], ["0,0", "2,2", "99,0"]), ["0,0", "1,1", "2,2"]);
  assert.deepEqual(neuAufbauKacheln([], []), []);
});

test("zeigerFarbe: fest je Person, verschieden fuer pc1 und pc2, als hsl", () => {
  const { zeigerFarbe } = require("../src/shared/gruppe-kern.js");
  assert.equal(zeigerFarbe("pc1"), zeigerFarbe("pc1"));
  assert.notEqual(zeigerFarbe("pc1"), zeigerFarbe("pc2"));
  assert.notEqual(zeigerFarbe("anna"), zeigerFarbe("ben"));
  assert.match(zeigerFarbe("anna"), /^hsl\(\d{1,3} 70% 40%\)$/);
});

test("ZeigerTakt: sofort, dann hoechstens einer je Abstand, der letzte wird nachgereicht", () => {
  const { ZeigerTakt } = require("../src/shared/gruppe-kern.js");
  const takt = new ZeigerTakt(50);
  assert.deepEqual(takt.melden({ x: 1, y: 1 }, 1000), { senden: { x: 1, y: 1 }, warte: 0 });
  assert.deepEqual(takt.melden({ x: 2, y: 2 }, 1010), { senden: null, warte: 40 });
  assert.deepEqual(takt.melden({ x: 3, y: 3 }, 1030), { senden: null, warte: 20 });
  assert.deepEqual(takt.nachreichen(1050), { x: 3, y: 3 });
  assert.equal(takt.nachreichen(1060), null, "nichts doppelt");
  assert.deepEqual(takt.melden({ x: 4, y: 4 }, 1070), { senden: null, warte: 30 });
  assert.deepEqual(takt.melden({ x: 5, y: 5 }, 1100), { senden: { x: 5, y: 5 }, warte: 0 });
  assert.equal(takt.nachreichen(1150), null, "der sofort gesendete ersetzt den wartenden");
});

test("istZeigerMeldung: nur gueltiger Autor mit Punkt im Feld oder weg", () => {
  const { istZeigerMeldung } = require("../src/shared/gruppe-kern.js");
  assert.equal(istZeigerMeldung({ typ: "zeiger", autor: "pc2", x: 0, y: 20480 }), true);
  assert.equal(istZeigerMeldung({ typ: "zeiger", autor: "pc2", weg: true }), true);
  for (const schlecht of [
    { typ: "zeiger", autor: "PC2", x: 1, y: 1 },
    { typ: "zeiger", x: 1, y: 1 },
    { typ: "zeiger", autor: "pc2", x: "1", y: 1 },
    { typ: "zeiger", autor: "pc2", x: -1, y: 1 },
    { typ: "zeiger", autor: "pc2", x: 1, y: 20481 },
    { typ: "zeiger", autor: "pc2", weg: false },
    null,
  ]) assert.equal(istZeigerMeldung(schlecht), false, JSON.stringify(schlecht));
});

// Namen, Live-Striche (Task 4) ------------------------------------------------
const live = (autor, strich, punkte, extra = {}) => ({ typ: "live", autor, strich, punkte, farbe: "#112233", staerke: 4, ...extra });

test("namen_ersatz_id: Anzeigename aus namen, sonst die Id", () => {
  const { anzeigeName } = require("../src/shared/gruppe-kern.js");
  assert.equal(anzeigeName({ ben: "Ben Beispiel" }, "ben"), "Ben Beispiel");
  assert.equal(anzeigeName({ ben: "  Ben  " }, "ben"), "Ben", "getrimmt");
  assert.equal(anzeigeName({}, "ben"), "ben");
  assert.equal(anzeigeName(undefined, "ben"), "ben");
  assert.equal(anzeigeName(null, "ben"), "ben");
  for (const schlecht of ["", "   ", 5, null, {}, ["x"]]) assert.equal(anzeigeName({ ben: schlecht }, "ben"), "ben", JSON.stringify(schlecht));
  assert.equal(anzeigeName({ ben: "a\u0000b\nc" }, "ben"), "a b c", "Steuerzeichen werden zu Leerzeichen");
  assert.equal(anzeigeName({ ben: "x".repeat(200) }, "ben").length, 60, "auf 60 Zeichen gekuerzt");
  assert.equal(anzeigeName({ __proto__: { ben: "Fremd" } }, "ben"), "ben", "nur eigene Eintraege");
});

test("live_strich_lebt_bis_kachel: ein Strich bleibt, bis der Autor eine Kachel schickt", () => {
  const { liveStriche } = require("../src/shared/gruppe-kern.js");
  const l = liveStriche();
  assert.equal(l.aufnehmen(live("ben", "s1", [[10, 10, 4], [20, 20, 4]]), 1000), true);
  assert.equal(l.aufnehmen(live("cleo", "s9", [[5, 5, 4]]), 1000), true);
  assert.deepEqual(l.alle().map(s => s.id).sort(), ["ben|s1", "cleo|s9"]);
  assert.deepEqual(l.aufraeumen(2500), [], "nach 1,5 s noch da");
  assert.deepEqual(l.entfernenAutor("ben"), ["ben|s1"]);
  assert.deepEqual(l.alle().map(s => s.id), ["cleo|s9"], "nur der Strich des Autors geht");
  assert.deepEqual(l.entfernenAutor("ben"), []);
});

test("live_strich_lebt_bis_kachel: nurFertige laesst den laufenden Strich stehen", () => {
  const { liveStriche } = require("../src/shared/gruppe-kern.js");
  const l = liveStriche();
  l.aufnehmen(live("ben", "alt", [[1, 1, 4]], { ende: true }), 0);
  l.aufnehmen(live("ben", "neu", [[2, 2, 4]]), 10);
  assert.deepEqual(l.entfernenAutor("ben", true), ["ben|alt"]);
  assert.deepEqual(l.alle().map(s => s.id), ["ben|neu"]);
});

test("live_strich_verfaellt_nach_3s: ohne neue Nachricht 3 s, jede Nachricht verlaengert", () => {
  const { liveStriche } = require("../src/shared/gruppe-kern.js");
  const l = liveStriche();
  l.aufnehmen(live("ben", "s1", [[1, 1, 4]]), 1000);
  assert.deepEqual(l.aufraeumen(4000), [], "genau 3 s: noch da");
  l.aufnehmen(live("ben", "s1", [[2, 2, 4]]), 3500);
  assert.deepEqual(l.aufraeumen(6000), [], "die zweite Nachricht hat verlaengert");
  assert.deepEqual(l.aufraeumen(6501), ["ben|s1"]);
  assert.deepEqual(l.alle(), []);
  assert.deepEqual(l.aufraeumen(99999), []);
});

test("live: ungueltige Nachrichten werden verworfen, Begrenzung der Striche", () => {
  const { liveStriche } = require("../src/shared/gruppe-kern.js");
  const l = liveStriche();
  for (const schlecht of [
    null, {}, { typ: "zeiger" }, live("BEN", "s", [[1, 1, 1]]), live("ben", "", [[1, 1, 1]]), live("ben", "x".repeat(41), [[1, 1, 1]]),
    live("ben", "s", "nein"), live("ben", "s", [[1, 1]]), live("ben", "s", [[1, 1, NaN]]), live("ben", "s", [[1, "1", 1]]),
    live("ben", "s", Array.from({ length: 201 }, () => [1, 1, 1])), live("ben", "s", [[1, 1, 1]], { farbe: "x".repeat(33) }),
    live("ben", "s", [[1, 1, 1]], { farbe: "red;}" }), live("ben", "s", [[1, 1, 1]], { staerke: "4" }),
  ]) assert.equal(l.aufnehmen(schlecht, 0), false, JSON.stringify(schlecht)?.slice(0, 60));
  assert.deepEqual(l.alle(), []);
  for (let i = 0; i < 200; i++) l.aufnehmen(live("ben", `s${i}`, [[1, 1, 1]]), i);
  assert.ok(l.alle().length <= 64, "hoechstens 64 Striche zugleich");
  assert.ok(l.alle().some(s => s.strich === "s199"), "der neueste bleibt");
});

test("live: Ueberlappung der Nachrichten ergibt keinen Doppelpunkt, eine verlorene Nachricht laesst keine Luecke", () => {
  const { liveStriche } = require("../src/shared/gruppe-kern.js");
  const p = n => [n, n * 2, 4];
  const l = liveStriche();
  l.aufnehmen(live("ben", "s", [p(1), p(2), p(3)]), 0);
  l.aufnehmen(live("ben", "s", [p(2), p(3), p(4), p(5)]), 50);
  assert.deepEqual(l.alle()[0].punkte, [p(1), p(2), p(3), p(4), p(5)]);
  // Nachricht mit p(6), p(7) geht verloren; die naechste bringt die Punkte der verlorenen noch einmal mit.
  l.aufnehmen(live("ben", "s", [p(6), p(7), p(8)]), 150);
  assert.deepEqual(l.alle()[0].punkte, [p(1), p(2), p(3), p(4), p(5), p(6), p(7), p(8)]);
  l.aufnehmen(live("ben", "s", [p(8), p(9)], { ende: true }), 200);
  assert.deepEqual(l.alle()[0].punkte.at(-1), p(9));
  assert.equal(l.alle()[0].fertig, true);
  assert.equal(l.alle()[0].punkte.length, 9);
});

test("LiveSender: hoechstens alle 50 ms, jede Nachricht traegt die Punkte der vorigen mit, ende nie gedrosselt", () => {
  const { LiveSender } = require("../src/shared/gruppe-kern.js");
  const s = new LiveSender("s1", "#112233", 4, 50);
  assert.equal(s.abholen(0), null, "ohne Punkte nichts");
  s.punkt(1, 1, 4);
  assert.deepEqual(s.abholen(0), { typ: "live", strich: "s1", punkte: [[1, 1, 4]], farbe: "#112233", staerke: 4 }, "die erste sofort");
  s.punkt(2, 2, 4);
  assert.equal(s.abholen(20), null, "zu frueh");
  assert.equal(s.warte(20), 30);
  s.punkt(3, 3, 4);
  assert.deepEqual(s.abholen(50).punkte, [[1, 1, 4], [2, 2, 4], [3, 3, 4]], "bringt die Punkte der vorigen Nachricht mit");
  s.punkt(4, 4, 4);
  assert.deepEqual(s.abholen(100).punkte, [[2, 2, 4], [3, 3, 4], [4, 4, 4]], "nur die der letzten Nachricht, nicht mehr");
  s.punkt(5.04, 5.06, 3.333);
  const ende = s.abholen(101, true);
  assert.equal(ende.ende, true);
  assert.deepEqual(ende.punkte, [[4, 4, 4], [5, 5.1, 3.3]], "ende sofort, auf eine Nachkommastelle gerundet");
  assert.equal(s.abholen(1000), null, "nach ende nichts mehr");
});

test("LiveSender: mehr als 200 neue Punkte werden auf die neuesten 200 gekuerzt", () => {
  const { LiveSender } = require("../src/shared/gruppe-kern.js");
  const s = new LiveSender("s2", "#000", 2, 50);
  for (let i = 0; i < 350; i++) s.punkt(i, i, 2);
  const m = s.abholen(0);
  assert.equal(m.punkte.length, 200);
  assert.deepEqual(m.punkte.at(-1), [349, 349, 2]);
});

// ---------------------------------------------------------------- Teil C, Abschlusspruefung A (Wichtig 2 und 3)
test("Ausstehend.nrKachel findet die Kachel genau dieser Sendung", () => {
  const a = new Ausstehend();
  a.setzen("0,0", "A"); a.setzen("0,1", "B");
  a.gesendet("0,0", 4); a.gesendet("0,1", 5);
  assert.equal(a.nrKachel(5), "0,1");
  assert.equal(a.nrKachel(4), "0,0");
  assert.equal(a.nrKachel(9), null);
  a.setzen("0,1", "C"); // neuerer Stand, noch ungesendet: die alte Sendung 5 gibt es nicht mehr
  assert.equal(a.nrKachel(5), null);
  assert.equal(a.eintrag("0,0").png, "A");
  assert.equal(a.eintrag("9,9"), null);
});

test("schutzListe nimmt nur gueltige Schutzfelder an (wie istSchutzfelderListe des Dienstes)", async () => {
  const { schutzListe } = require("../src/shared/gruppe-kern.js");
  const protokoll = await import(pathToFileURL(path.join(__dirname, "..", "abgleich", "protokoll.mjs")).href);
  for (const felder of [[], [[0, 0, 1, 1]], [[0, 0, 10]], [[0, 0, 10, 1.5]], [[-1, 0, 1, 1]], [[0, 0, 20481, 1]],
    Array.from({ length: 201 }, () => [0, 0, 1, 1]), Array.from({ length: 200 }, () => [0, 0, 1, 1]), "nein", null]) {
    const m = schutzListe([{ person:"ben", felder }]);
    assert.equal(m.has("ben"), protokoll.istSchutzfelderListe(felder) && felder.length > 0, JSON.stringify(felder).slice(0, 40));
  }
  const m = schutzListe([{ person:"ben", felder:[[1, 2, 3, 4]] }, { person:"A B", felder:[[0, 0, 1, 1]] }, null, { person:"cem", felder:[] }]);
  assert.deepEqual([...m], [["ben", [[1, 2, 3, 4]]]]);
  assert.equal(schutzListe("quatsch").size, 0);
});

test("schutzRechtecke: fremde Felder je Kachel in Kachelpixeln, eigene nie", () => {
  const { schutzRechtecke } = require("../src/shared/gruppe-kern.js");
  const schutz = new Map([["ben", [[1024, 0, 200, 200], [1000, 500, 100, 100]]], ["anna", [[1024, 0, 512, 512]]]]);
  assert.deepEqual(schutzRechtecke(schutz, "anna", "2,0"), [{ x:0, y:0, w:200, h:200 }, { x:0, y:500, w:76, h:12 }]);
  assert.deepEqual(schutzRechtecke(schutz, "anna", "1,0"), [{ x:488, y:500, w:24, h:12 }]);
  assert.deepEqual(schutzRechtecke(schutz, "anna", "2,1"), [{ x:0, y:0, w:76, h:88 }]);
  assert.deepEqual(schutzRechtecke(schutz, "anna", "5,5"), []);
  assert.deepEqual(schutzRechtecke(schutz, "ben", "2,0"), [{ x:0, y:0, w:512, h:512 }], "fuer ben ist nur annas Feld fremd");
  assert.deepEqual(schutzRechtecke(new Map(), "anna", "0,0"), []);
});

test("mcpWartetAufGruppe: verändernde Werkzeuge und Aufnahmen warten, Lesen und Sitzung nicht", () => {
  const { mcpWartetAufGruppe } = require("../src/shared/gruppe-kern.js");
  for (const name of ["mcp_present_widget", "mcp_draw", "mcp_plot", "mcp_patch_file", "mcp_edit_canvas", "mcp_upload_image",
    "mcp_place_image", "mcp_upload_image_to_document", "mcp_capture_canvas", "mcp_capture_widget", "mcp_capture_primitives"]) {
    assert.equal(mcpWartetAufGruppe(name, {}), true, name);
  }
  for (const name of ["mcp_start_session", "mcp_update_session", "mcp_close_session", "mcp_inspect_session", "mcp_find_canvases",
    "mcp_list_files", "mcp_read_file", "mcp_inbox", "mcp_read_feedback"]) {
    assert.equal(mcpWartetAufGruppe(name, {}), false, name);
  }
  assert.equal(mcpWartetAufGruppe("mcp_inbox", { capture:true }), true, "Rückmeldungen mit Bildern sind Aufnahmen");
  assert.equal(mcpWartetAufGruppe("mcp_read_feedback", { capture:true }), true);
  assert.equal(mcpWartetAufGruppe("mcp_present_widget", { presentation:{ intent:"inspect" } }), false, "nur prüfen, nichts setzen");
  assert.equal(mcpWartetAufGruppe("mcp_edit_canvas", null), true);
});
