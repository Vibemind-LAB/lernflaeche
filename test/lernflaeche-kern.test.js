"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { lernmodusAktiv, eingabeGruppen, imKasten, kiWarteText, KI_NAEHE, kiAbraeumart, kiFehlerHaeltAn, kiSchriftGelesen, kiSchriftStufe, kiSchriftAnwenden, KI_SCHRIFT_STUFEN, KI_SCHRIFT_GRUND, KI_SCHRIFT_SCHLUESSEL,
  BEREICHE_MARKE, bereicheAusKontext, kontextOhneBereiche, nahAnAnfrage, TEXTGRENZE, tintenKaesten, autoKiStart, autoKiStartFuer, kiSchriftFaktorFuer } = require("../src/shared/lernflaeche-kern.js");
const LK = require("../src/shared/lernflaeche-kern.js");

test("lernmodusAktiv", () => {
  assert.equal(lernmodusAktiv("?lernen=1"), true);
  assert.equal(lernmodusAktiv("?gruppe=g1&person=p1"), true);   // Gruppe heißt immer Lernende
  assert.equal(lernmodusAktiv("?gruppe=g1&person=p1&lernen=0"), true);
  assert.equal(lernmodusAktiv(""), false);
  assert.equal(lernmodusAktiv("?lernen=ja"), false);             // nur genau "1"
  assert.equal(lernmodusAktiv("?gruppe=../x&person=p1"), false); // ungültige Gruppe zählt nicht
});

test("kiSchriftGelesen", () => {
  assert.equal(kiSchriftGelesen("0.85"), 0.85);
  assert.equal(kiSchriftGelesen(null), 0.7);
  assert.equal(kiSchriftGelesen("abc"), 0.7);
  assert.equal(kiSchriftGelesen("9"), 0.7);      // keine Stufe
  assert.equal(kiSchriftGelesen("0.7000001"), 0.7);
});

test("kiSchriftStufe", () => {
  assert.equal(kiSchriftStufe(0.7, 1), 0.85);
  assert.equal(kiSchriftStufe(0.7, -1), 0.6);
  assert.equal(kiSchriftStufe(1.2, 1), 1.2);
  assert.equal(kiSchriftStufe(0.5, -1), 0.5);
});

test("kiSchriftAnwenden", () => {
  assert.equal(kiSchriftAnwenden(180, 0.7), 126);
  assert.equal(kiSchriftAnwenden(24, 0.5), 16);  // Untergrenze 16
});

test("KI-Schrift-Konstanten", () => {
  assert.deepEqual([...KI_SCHRIFT_STUFEN], [0.5, 0.6, 0.7, 0.85, 1, 1.2]);
  assert.equal(KI_SCHRIFT_GRUND, 0.7);
  assert.equal(KI_SCHRIFT_SCHLUESSEL, "lernflaeche-ki-schrift");
});

test("eingabeGruppen trennt Bereiche und sortiert lesend", () => {
  const a = {x:100,y:100,w:300,h:80}, b = {x:450,y:120,w:100,h:50}, c = {x:100,y:950,w:200,h:60};
  assert.deepEqual(eingabeGruppen([c, b, a]), [{x:100,y:100,w:450,h:80}, c]);
  assert.deepEqual(eingabeGruppen([]), []);
  assert.equal(eingabeGruppen([{x:0,y:0,w:10,h:10},{x:250,y:0,w:10,h:10}]).length, 1); // Abstand 240
  assert.equal(eingabeGruppen([{x:0,y:0,w:10,h:10},{x:251,y:0,w:10,h:10}]).length, 2);
});

test("eingabeGruppen verbindet transitiv", () => {
  const k = [{x:0,y:0,w:10,h:10},{x:200,y:0,w:10,h:10},{x:400,y:0,w:10,h:10}];
  assert.equal(eingabeGruppen(k).length, 1);
});

test("imKasten mit Rand", () => {
  const k = {x:1000,y:1000,w:100,h:100};
  assert.equal(imKasten({x:1340,y:1050}, k), true);
  assert.equal(imKasten({x:1341,y:1050}, k), false);
  assert.equal(imKasten({x:0,y:0}, null), false);
});

test("kiWarteText", () => {
  assert.equal(kiWarteText(true, 0), "KI arbeitet");
  assert.equal(kiWarteText(true, 1), "KI arbeitet · 1 Bereich wartet");
  assert.equal(kiWarteText(true, 3), "KI arbeitet · 3 Bereiche warten");
  assert.equal(kiWarteText(false, 2), "KI wartet · 2 Bereiche warten");
  assert.equal(kiWarteText(false, 0), "");
});

test("KI_NAEHE", () => {
  assert.equal(KI_NAEHE, 240);
});

test("kiAbraeumart: Warteschlange nur ihr Bereich, andere Anfragen bei Auto-KI nur ihr Kasten", () => {
  const kasten = {x:100,y:100,w:400,h:300};
  assert.equal(kiAbraeumart({ warteschlange:true, kasten, autoAn:true, aktuell:true }), "bereich");
  assert.equal(kiAbraeumart({ warteschlange:true, kasten, autoAn:false, aktuell:true }), "bereich");
  assert.equal(kiAbraeumart({ warteschlange:false, kasten, autoAn:true, aktuell:true }), "kasten");
  assert.equal(kiAbraeumart({ warteschlange:false, kasten, autoAn:false, aktuell:true }), "alles"); // ohne Auto wartet nichts
  assert.equal(kiAbraeumart({ warteschlange:false, kasten:null, autoAn:true, aktuell:true }), "alles");
  assert.equal(kiAbraeumart({ warteschlange:true, kasten:{x:0,y:0,w:Number.NaN,h:1}, autoAn:true, aktuell:true }), "alles");
  assert.equal(kiAbraeumart({ warteschlange:true, kasten, autoAn:true, aktuell:false }), "alles"); // Eingabe veraltet
  assert.equal(kiAbraeumart(null), "alles");
});

// A2 Task 7: Bereiche der Huelle (Markenzeile in context.md) trennen Aufgaben.
const marke = (rechtecke) => `<!-- lernflaeche-bereiche: ${JSON.stringify(rechtecke)} -->`;
// Raster der Huelle: Spalten x 100 und 3000, w 1760, Zeilenhoehe 800, Luecke 150 (hier zwei Zeilen mit 50 Luecke).
const B1 = {x:100,y:100,w:1760,h:800}, B2 = {x:100,y:950,w:1760,h:800}, S2 = {x:3000,y:100,w:1760,h:800};

test("BEREICHE_MARKE", () => {
  assert.equal(BEREICHE_MARKE, "lernflaeche-bereiche");
});

test("bereicheAusKontext liest die Markenzeile", () => {
  const text = `# Aufgaben\n${marke([[100,100,1760,800],[100,950,1760,800]])}\nmehr`;
  assert.deepEqual(bereicheAusKontext(text), [B1, B2]);
  assert.deepEqual(bereicheAusKontext(marke([[100,100,1760,800]]) + "\r\n"), [B1]);           // CRLF
  assert.deepEqual(bereicheAusKontext(`${marke([[100,100,1760,800]])}\n${marke([[1,1,1,1]])}`), [B1]); // nur die erste
});

test("bereicheAusKontext lehnt Ungueltiges ab", () => {
  assert.deepEqual(bereicheAusKontext(""), []);                                    // kein Text
  assert.deepEqual(bereicheAusKontext(undefined), []);
  assert.deepEqual(bereicheAusKontext("Text ohne Marke"), []);
  assert.deepEqual(bereicheAusKontext("<!-- lernflaeche-bereiche: [[100,100,1760 -->"), []); // kaputtes JSON
  assert.deepEqual(bereicheAusKontext(marke(Array.from({length:61}, (_, i) => [100, i * 950, 1760, 800]))), []); // 61 Eintraege
  assert.equal(bereicheAusKontext(marke(Array.from({length:60}, (_, i) => [100, i * 950, 1760, 800]))).length, 60);
  assert.deepEqual(bereicheAusKontext(marke([[100,100,0,800]])), []);                // w: 0
  assert.deepEqual(bereicheAusKontext(marke([[100,100,1760,-1]])), []);              // h < 0
  assert.deepEqual(bereicheAusKontext(marke([["1",100,1760,800]])), []);             // "x": "1"
  assert.deepEqual(bereicheAusKontext(marke([[100,100,1760,800],[1,2,3]])), []);     // ein Eintrag kaputt: alles verworfen
  assert.deepEqual(bereicheAusKontext(marke({x:100})), []);
  assert.deepEqual(bereicheAusKontext("<!-- lernflaeche-bereiche: [[100,100,1e999,800]] -->"), []); // nicht endlich
});

test("kontextOhneBereiche entfernt die Markenzeile", () => {
  const m = marke([[100,100,1760,800]]);
  assert.equal(kontextOhneBereiche(`Text\n${m}\nmehr`), "Text\nmehr");
  assert.equal(kontextOhneBereiche(`Text\n${m}\n`), "Text\n");
  assert.equal(kontextOhneBereiche(m), "");
  assert.equal(kontextOhneBereiche("Text\nmehr"), "Text\nmehr");
  assert.equal(kontextOhneBereiche(`a\n${m}\nb\n<!-- lernflaeche-bereiche: kaputt -->\nc`), "a\nb\nc");
  assert.equal(kontextOhneBereiche(null), "");
});

test("eingabeGruppen nach Bereichen: Nachbarn mit 50 Abstand bleiben getrennt (I1)", () => {
  const a = {x:500,y:850,w:100,h:30}, b = {x:500,y:960,w:100,h:30};  // 80 auseinander, Mitten in B1 bzw. B2
  assert.equal(eingabeGruppen([a, b]).length, 1);                     // ohne Bereiche wie bisher eine Gruppe
  assert.deepEqual(eingabeGruppen([b, a], KI_NAEHE, [B1, B2]), [a, b]);
});

test("eingabeGruppen nach Bereichen: 600 auseinander im selben Bereich ist eine Gruppe", () => {
  const a = {x:200,y:200,w:100,h:50}, b = {x:900,y:200,w:100,h:50};
  assert.equal(eingabeGruppen([a, b]).length, 2);
  assert.deepEqual(eingabeGruppen([a, b], KI_NAEHE, [B1, B2]), [{x:200,y:200,w:800,h:50}]);
});

test("eingabeGruppen nach Bereichen: ausserhalb", () => {
  const o1 = {x:2500,y:300,w:200,h:50}, o2 = {x:2800,y:300,w:100,h:50}, // zwischen den Spalten, 100 auseinander
    s = {x:2950,y:300,w:200,h:50}, s2 = {x:4000,y:700,w:100,h:50};       // Spalte 2: 50 neben o2 und weit weg
  assert.equal(eingabeGruppen([o1, o2, s]).length, 1);
  assert.deepEqual(eingabeGruppen([s2, s, o2, o1], KI_NAEHE, [B1, S2]),
    [{x:2500,y:300,w:400,h:50}, {x:2950,y:300,w:1150,h:450}]);
  // Ausserhalb wie bisher nach Naehe: 300 weiter weg eine eigene Gruppe.
  assert.equal(eingabeGruppen([o1, {x:2500,y:650,w:50,h:50}], KI_NAEHE, [B1, S2]).length, 2);
});

test("eingabeGruppen nach Bereichen: Kante halboffen, bei Ueberlappung zaehlt der erste Bereich", () => {
  const L = {x:0,y:0,w:100,h:100}, R = {x:100,y:0,w:100,h:100};
  const kante = {x:90,y:10,w:20,h:10}, rechts = {x:150,y:80,w:20,h:10}, links = {x:20,y:10,w:20,h:10}; // Mitte x 100 -> R
  assert.deepEqual(eingabeGruppen([kante, rechts, links], KI_NAEHE, [L, R]), [links, {x:90,y:10,w:80,h:80}]);
  const C = {x:0,y:0,w:200,h:100}, D = {x:50,y:0,w:200,h:100};
  const beide = {x:90,y:10,w:20,h:10}, nurD = {x:210,y:10,w:20,h:10}, auchC = {x:20,y:50,w:20,h:10};
  assert.deepEqual(eingabeGruppen([beide, nurD, auchC], KI_NAEHE, [C, D]), [{x:20,y:10,w:90,h:50}, nurD]);
});

test("eingabeGruppen ohne Bereiche wie bisher", () => {
  const k = [{x:100,y:100,w:300,h:80},{x:450,y:120,w:100,h:50},{x:100,y:950,w:200,h:60},{x:0,y:0,w:10,h:10}];
  assert.deepEqual(eingabeGruppen(k, KI_NAEHE, []), eingabeGruppen(k));
  assert.deepEqual(eingabeGruppen(k, KI_NAEHE, null), eingabeGruppen(k));
  assert.deepEqual(eingabeGruppen(k, KI_NAEHE, [{x:0,y:0,w:Number.NaN,h:1}]), eingabeGruppen(k)); // ungueltiger Bereich zaehlt nicht
});

test("nahAnAnfrage: ein Strich verdraengt nur die Anfrage seines Bereichs", () => {
  const kasten = {x:500,y:850,w:100,h:30}; // laufende Anfrage unten in B1
  assert.equal(nahAnAnfrage({x:550,y:1000}, kasten), imKasten({x:550,y:1000}, kasten)); // ohne Bereiche: imKasten
  assert.equal(nahAnAnfrage({x:550,y:1000}, kasten, []), true);
  assert.equal(nahAnAnfrage({x:550,y:1000}, kasten, [B1, B2]), false);  // Nachbarbereich, 120 entfernt
  assert.equal(nahAnAnfrage({x:1700,y:200}, kasten, [B1, B2]), true);   // derselbe Bereich, weit weg
  const aussen = {x:2500,y:300,w:200,h:50};
  assert.equal(nahAnAnfrage({x:2800,y:320}, aussen, [B1, S2]), true);   // ausserhalb, nah: wie imKasten
  assert.equal(nahAnAnfrage({x:3010,y:320}, aussen, [B1, S2]), false);  // in Spalte 2, 310 entfernt
  assert.equal(nahAnAnfrage({x:3010,y:320}, {x:2700,y:300,w:200,h:50}, [B1, S2]), false); // in Spalte 2, nah an aussen
  assert.equal(nahAnAnfrage({x:2950,y:320}, {x:3000,y:300,w:200,h:50}, [B1, S2]), false); // ausserhalb, nah an Spalte 2
  assert.equal(nahAnAnfrage(null, kasten, [B1]), false);
});

// Fix-Runde 1 (I1): echte Eingabe ist ein Kasten je 512er-Kachel der Tintenmaske. Liegt eine Bereichsgrenze in der
// Kachel, zerlegt tintenKaesten die Maske je Bereich (und je Zelle ausserhalb), damit die Mitte nicht in der Luecke liegt.
function maske(breite, hoehe, punkte) {
  const daten = new Uint8ClampedArray(breite * hoehe * 4);
  for (const [x, y] of punkte) daten[(y * breite + x) * 4 + 3] = 255;
  return daten;
}
const K = {x:0,y:0,w:32,h:32}; // 8x8-Maske, je Maskenpixel 4 Weltpixel

test("tintenKaesten ohne Bereiche: ein Kasten wie die Alpha-Grenzen der Kachel", () => {
  assert.deepEqual(tintenKaesten(maske(8, 8, [[1,1],[5,6]]), 8, 8, K, []), [{x:4,y:4,w:20,h:24}]);
  assert.deepEqual(tintenKaesten(maske(8, 8, [[1,1],[5,6]]), 8, 8, K), [{x:4,y:4,w:20,h:24}]);
  assert.deepEqual(tintenKaesten(maske(8, 8, []), 8, 8, K, []), []);
  assert.deepEqual(tintenKaesten(maske(8, 8, [[1,1]]), 8, 8, K, [{x:100,y:100,w:10,h:10}]), [{x:4,y:4,w:4,h:4}]); // Bereich ausserhalb
});

test("tintenKaesten zerlegt die Kachel an der Grenze zweier Bereiche", () => {
  const A = {x:0,y:0,w:32,h:12}, B = {x:0,y:16,w:32,h:16};  // Zeilen 0-2 in A, Zeile 3 Luecke, Zeilen 4-7 in B
  const teile = tintenKaesten(maske(8, 8, [[1,2],[5,5]]), 8, 8, K, [A, B]);
  assert.deepEqual(eingabeGruppen(teile, KI_NAEHE, [A, B]), [{x:4,y:8,w:4,h:4}, {x:20,y:20,w:4,h:4}]);
  assert.equal(teile.length, 2);
});

test("tintenKaesten: Teile ausserhalb bleiben je Zelle getrennt, Teile eines Bereichs werden vereinigt", () => {
  const C = {x:8,y:8,w:16,h:16};
  const teile = tintenKaesten(maske(8, 8, [[0,0],[7,7],[3,3]]), 8, 8, K, [C]);
  // Vereinigt laege die Mitte des Aussenteils (16,16) in C.
  assert.deepEqual([...teile].sort((a, b) => a.y - b.y || a.x - b.x), [{x:0,y:0,w:4,h:4}, {x:12,y:12,w:4,h:4}, {x:28,y:28,w:4,h:4}]);
  const A = {x:0,y:0,w:32,h:12}, D = {x:16,y:16,w:16,h:16};   // D schneidet A bei x 16 in zwei Zellen
  assert.deepEqual(tintenKaesten(maske(8, 8, [[1,1],[6,1]]), 8, 8, K, [A, D]), [{x:4,y:4,w:24,h:4}]);
});

test("tintenKaesten: Regression I1 mit echter Kachel (Raster der Huelle, Striche vor der ersten Anfrage)", () => {
  // Kachel x 512..1024, y 3584..4096 (Maske 128x128); Bereiche wie die Probe; Striche bei y 3730 und 3830.
  const kachel = {x:512,y:3584,w:512,h:512}, A = {x:100,y:2950,w:1760,h:800}, B = {x:100,y:3800,w:1760,h:800};
  const punkte = [];
  for (let x = 110; x < 128; x += 1) punkte.push([x, 36], [x, 61]);
  const daten = maske(128, 128, punkte);
  const alt = tintenKaesten(daten, 128, 128, kachel, []);
  assert.equal(alt.length, 1);
  assert.equal(eingabeGruppen(alt, KI_NAEHE, [A, B]).length, 1);   // ohne Zerlegen: eine Gruppe in der Luecke
  const gruppen = eingabeGruppen(tintenKaesten(daten, 128, 128, kachel, [A, B]), KI_NAEHE, [A, B]);
  assert.equal(gruppen.length, 2);
  assert.ok(gruppen[0].y + gruppen[0].h <= 3750 && gruppen[1].y >= 3800, JSON.stringify(gruppen));
});

test("TEXTGRENZE", () => {
  assert.equal(TEXTGRENZE, 200);
});

test("kiFehlerHaeltAn: gesperrt oder Verbindung veraltet haelt die Warteschlange an", () => {
  assert.equal(kiFehlerHaeltAn({ status:423 }), true);
  assert.equal(kiFehlerHaeltAn({ status:403 }), true);
  assert.equal(kiFehlerHaeltAn({ code:"CONNECTION_STALE" }), true);
  assert.equal(kiFehlerHaeltAn({ status:500 }), false);
  assert.equal(kiFehlerHaeltAn({ status:429, code:"rate_limited" }), false);
  assert.equal(kiFehlerHaeltAn({ name:"AbortError" }), false);
  assert.equal(kiFehlerHaeltAn(new Error("x")), false);
  assert.equal(kiFehlerHaeltAn(null), false);
});

test("autoKiStart: im Lernmodus an, ausser ausdruecklich aus; sonst nur bei gespeichertem an", () => {
  assert.equal(autoKiStart(true, null), true);
  assert.equal(autoKiStart(true, "false"), false);
  assert.equal(autoKiStart(true, "true"), true);
  assert.equal(autoKiStart(true, ""), true);        // nur genau "false" ist ein ausdrueckliches Aus
  assert.equal(autoKiStart(false, null), false);
  assert.equal(autoKiStart(false, "true"), true);
  assert.equal(autoKiStart(false, "false"), false);
});

test("kiSchriftFaktorFuer: Schriftsatz behaelt die eigene Groesse (M1)", () => {
  assert.equal(kiSchriftFaktorFuer("normalize", 0), 1);
  assert.equal(kiSchriftFaktorFuer("normalize", 0.7), 1);
  assert.equal(kiSchriftFaktorFuer("auto", 0.7), 0.7);
  assert.equal(kiSchriftFaktorFuer("answer", 1.2), 1.2);
  assert.equal(kiSchriftFaktorFuer("auto", 0.85), 0.85);
});

test("Lernmodus-Vorgabe fuer KI-Entwuerfe: Deutsch, Aufgabenbezug, keine Loesung (A2, Befund 4)", () => {
  const thema = "Minimal studio assistant.";
  assert.equal(LK.lernPersona(false, thema), thema);
  assert.equal(LK.lernPersona(undefined, thema), thema);
  const p = LK.lernPersona(true, thema);
  assert.notEqual(p, thema);
  assert.match(p, /German/);
  assert.match(LK.LERN_VORGABE, /German/);
  assert.match(LK.LERN_VORGABE, /Sie/);
  assert.match(LK.LERN_VORGABE, /never .*(final answer|complete solution)/i);
  assert.match(LK.LERN_VORGABE, /exercise/);
  assert.equal(LK.lernmodusGueltig(undefined), true);
  assert.equal(LK.lernmodusGueltig(true), true);
  assert.equal(LK.lernmodusGueltig(false), true);
  assert.equal(LK.lernmodusGueltig("1"), false);
  assert.equal(LK.lernmodusGueltig(null), false);
});

test("Lernmodus-Vorgabe ist verdrahtet: Seite meldet den Lernmodus, Server nimmt ihn ins Modell", () => {
  const fs = require("node:fs"), path = require("node:path");
  const lies = (...teile) => fs.readFileSync(path.join(__dirname, "..", ...teile), "utf8");
  const ki = lies("src", "client", "app", "ai-runtime.js");
  assert.match(ki, /lernmodus:\s*true/);
  const main = lies("src", "server", "main.js");
  assert.match(main, /LERNFLAECHE_KERN\.lernmodusGueltig\(p\?\.lernmodus\)/);
  assert.match(main, /lernmodus:true/);
  assert.match(main, /persona:LERNFLAECHE_KERN\.lernPersona\(payload\.lernmodus,THEME_PERSONAS\[payload\.uiTheme\]\)/);
  assert.match(main, /learningModePolicy:LERNFLAECHE_KERN\.LERN_VORGABE/);
});

test("kiWartendZaehlen: Bereiche von Lauf und offenem Entwurf zaehlen nicht mit (A2, Befund 2)", () => {
  const a = { x: 0, y: 0, w: 100, h: 100 }, b = { x: 500, y: 0, w: 100, h: 100 }, c = { x: 1000, y: 0, w: 100, h: 100 };
  assert.equal(LK.kiWartendZaehlen([a, b, c], []), 3);
  assert.equal(LK.kiWartendZaehlen([a, b, c], [null, { x: 10, y: 10, w: 5, h: 5 }]), 2);
  assert.equal(LK.kiWartendZaehlen([a, b, c], [{ x: 450, y: 0, w: 700, h: 50 }, a]), 0);
  assert.equal(LK.kiWartendZaehlen([], [a]), 0);
});

test("kiWarteText mit offenem Entwurf", () => {
  assert.equal(kiWarteText(false, 0, true), "Entwurf wartet auf Ihre Bestätigung");
  assert.equal(kiWarteText(false, 0, false), "");
  assert.equal(kiWarteText(false, 0), "");
  // Abnahme A2 (Befund 2): die Warteschlange steht, bis der Entwurf bestaetigt ist; das sagt die Anzeige zuerst.
  assert.equal(kiWarteText(false, 2, true), "Entwurf wartet auf Ihre Bestätigung · 2 Bereiche warten");
  assert.equal(kiWarteText(false, 1, true), "Entwurf wartet auf Ihre Bestätigung · 1 Bereich wartet");
  assert.equal(kiWarteText(true, 0, true), "KI arbeitet");
  assert.equal(kiWarteText(true, 1, true), "KI arbeitet · 1 Bereich wartet");
});

test("autoKiStartFuer: Lernmodus allein an, auf der Gruppenflaeche nur ausdruecklich (T8-d)", () => {
  assert.equal(autoKiStartFuer("?lernen=1", null), true);
  assert.equal(autoKiStartFuer("?lernen=1", "false"), false);
  assert.equal(autoKiStartFuer("?gruppe=g1&person=p1", null), false);
  assert.equal(autoKiStartFuer("?gruppe=g1&person=p1", "true"), true);   // ausdrueckliches An bleibt moeglich
  assert.equal(autoKiStartFuer("?gruppe=g1&person=p1", "false"), false);
  assert.equal(autoKiStartFuer("?gruppe=g1&person=p1&lernen=1", null), false);
  assert.equal(autoKiStartFuer("?gruppe=../x&person=p1&lernen=1", null), true); // ungueltige Gruppe: Lernmodus allein
  assert.equal(autoKiStartFuer("", null), false);
  assert.equal(autoKiStartFuer("", "true"), true);
});

test("textUmbruchBreite: mit Bereich bricht der Text an dessen Breite um (A3, Karte)", () => {
  // Live 09.11.: die Bewertungskarte brach fest bei 400 px um und war in normal hohen Bereichen abgeschnitten.
  assert.equal(LK.textUmbruchBreite({}), 400);
  assert.equal(LK.textUmbruchBreite({ width: 300 }), 300);              // altes Feld ohne Bereich bleibt
  assert.equal(LK.textUmbruchBreite({ region: { x: 0, y: 0, w: 760, h: 760 } }), 760);
  assert.equal(LK.textUmbruchBreite({ region: { x: 0, y: 0, w: 50, h: 50 } }), 200);   // nicht schmaler als 200
  assert.equal(LK.textUmbruchBreite({ region: { x: 0, y: 0, w: 9000, h: 50 } }), 1600); // nicht breiter als 1600
  assert.equal(LK.textUmbruchBreite({ region: { w: "breit" } }), 400);
  assert.equal(LK.textUmbruchBreite(null), 400);
});

test("create_text nimmt die Umbruchbreite aus dem Kern", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const quelle = fs.readFileSync(path.join(__dirname, "..", "src", "client", "app", "canvas-documents.js"), "utf8");
  assert.match(quelle, /maxWidth:LernflaecheKern\.textUmbruchBreite\(args\)/);
  assert.doesNotMatch(quelle, /maxWidth:args\.width\|\|400/);
});

test("flaechenKennung nur im Lernmodus und nur gültig", () => {
  // Teil B: die Huelle vergibt je Browser-Tab eine Kennung lf-<32 hex> und gibt sie als ?flaeche= mit.
  assert.equal(LK.flaechenKennung("?lernen=1&flaeche=lf-" + "a".repeat(32)), "lf-" + "a".repeat(32));
  assert.equal(LK.flaechenKennung("?flaeche=lf-" + "a".repeat(32)), null);
  assert.equal(LK.flaechenKennung("?lernen=1&flaeche=x"), null);
  assert.equal(LK.flaechenKennung("?lernen=1"), null);
  assert.equal(LK.flaechenKennung("?lernen=1&flaeche=lf-" + "A".repeat(32)), null);      // nur Kleinbuchstaben
  assert.equal(LK.flaechenKennung("?lernen=1&flaeche=lf-" + "a".repeat(33)), null);      // genau 32 Zeichen
  assert.equal(LK.flaechenKennung("?lernen=1&flaeche=lf-" + "a".repeat(32) + "%0A"), null);
  assert.equal(LK.flaechenKennung("?lernen=0&flaeche=lf-" + "a".repeat(32)), null);
  assert.equal(LK.flaechenKennung(null), null);
});

test("mcp-runtime nimmt die Flächen-Kennung als browserId", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const quelle = fs.readFileSync(path.join(__dirname, "..", "src", "client", "app", "mcp-runtime.js"), "utf8");
  // Die Kennung geht vor browserDraftId und canvasClientId(): so meldet sich der Tab mit dieser canvasId beim MCP.
  assert.match(quelle, /mcpRuntime\.browserId=mcpRuntime\.browserId\|\|LernflaecheKern\.flaechenKennung\(location\.search\)\|\|window\.PENECHO_CONFIG\?\.browserDraftId\|\|canvasClientId\(\);/);
});

test("ersetzter Tab mit Flächen-Kennung verbindet sich nicht zurück", () => {
  // Die Kennung bleibt je Tab gleich (sessionStorage der Huelle). Ein dupliziertes Tab traegt dieselbe; der Server
  // ersetzt dann die aeltere Verbindung (4001). Wie beim Cloud-Entwurf: nicht neu verbinden, sonst wechseln sich
  // die beiden Tabs endlos ab. Der neue Tab uebernimmt.
  const fs = require("node:fs");
  const path = require("node:path");
  const quelle = fs.readFileSync(path.join(__dirname, "..", "src", "client", "app", "mcp-runtime.js"), "utf8");
  assert.match(quelle, /if\(\(window\.PENECHO_CONFIG\?\.browserDraftId&&\[4001,4401\]\.includes\(event\?\.code\)\)\|\|\(event\?\.code===4001&&LernflaecheKern\.flaechenKennung\(location\.search\)\)\)\{/);
  assert.equal(LK.LERN_DE_MCP["This canvas is connected in another window. Continue there."],
    "Diese Fläche ist in einem anderen Fenster verbunden. Arbeiten Sie dort weiter.");
});
