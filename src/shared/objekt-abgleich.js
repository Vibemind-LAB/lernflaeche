"use strict";
// Lernflaeche: reine Regeln des Objekt-Abgleichs (ohne DOM, testbar).
// Objekte sind Texte, Bilder und Widgets. Der Dienst (abgleich/protokoll.mjs) verlangt je Objekt
// eine Id (^[A-Za-z0-9_-]{1,80}$) und Daten mit art und endlichen Zahlen x, y, w, h.
var LernflaecheObjektAbgleich = (() => {
  const MAX_BYTES = 900000; // dupliziert abgleich/protokoll.mjs
  const ID = /^[A-Za-z0-9_-]{1,80}$/;
  const eigen = item => Boolean(item) && typeof item === "object" && !item.gruppeAutor;
  const endlich = v => typeof v === "number" && Number.isFinite(v);
  const rechteckOk = o => endlich(o.x) && endlich(o.y) && endlich(o.w) && endlich(o.h);

  // PenEchos Ids (text-box-3, image-2, widget-1) passen schon. Alles andere wird
  // deterministisch abgebildet: ungueltige Zeichen werden "_", dazu ein Fingerabdruck der Originalid.
  function objektId(id) {
    const text = String(id);
    if (ID.test(text)) return text;
    let h = 0x811c9dc5;
    for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
    const rumpf = text.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60) || "x";
    return `${rumpf}_${h.toString(16).padStart(8, "0")}`;
  }
  // Lokale Kennung eines fremden Objekts: eindeutig je (Autor, Id), nie gleich einer eigenen Id ("~" kommt in keiner vor).
  const fremdId = (autor, id) => `${autor}~${id}`;

  function textDaten(item) {
    return { art:"text", x:item.x, y:item.y, w:item.w, h:item.h, maxWidth:item.maxWidth, fontSize:item.fontSize, fontFamily:item.fontFamily, color:item.color, text:item.text };
  }
  function bildDaten(item, src) {
    return {
      art:"bild", x:item.x, y:item.y, w:item.w, h:item.h, naturalW:item.naturalW, naturalH:item.naturalH, sourceName:item.sourceName,
      ...(item.plotExpression ? { plotExpression:item.plotExpression } : {}),
      ...(typeof src === "string" ? { src } : {}),
    };
  }
  // Privates (Favoriten, Teilen, Spiegel-Zustaende) bleibt beim Absender.
  const WIDGET_PRIVAT = new Set(["id", "favorite", "favoriteSourceId", "shareSourceId", "favoriteArtifactSha256", "favoriteCloudId", "favoriteCommunityItemId", "gruppeAutor"]);
  const WIDGET_FELDER = ["widgetType", "pluginId", "x", "y", "w", "h", "contentW", "contentH", "fitContent", "fitContentAxes", "title", "refreshSeconds", "html", "source", "diagramKind", "sourceFormat", "frameworkVersion", "widgetAnimation", "copyText", "copyLabel", "communityOriginItemId", "communityRootItemId", "communityOriginName", "communityOriginGeneration"];
  function widgetDaten(item) {
    const daten = { art:"widget" };
    for (const k of WIDGET_FELDER) if (item[k] !== undefined && item[k] !== null && item[k] !== "" && !WIDGET_PRIVAT.has(k)) daten[k] = item[k];
    // diagram_source traegt die Quelle, html_widget das HTML; das jeweils andere Feld ist abgeleitet.
    if (item.widgetType === "diagram_source") delete daten.html;
    return daten;
  }

  // bildQuelle(item) liefert die Bytes des Bildes als data:-URL (die Kodierung ist asynchron und liegt im Browser).
  function objektListe(state, bildQuelle) {
    const liste = new Map();
    const dazu = (item, art, daten) => {
      if (!eigen(item) || typeof item.id !== "string" || !rechteckOk(daten)) return;
      liste.set(objektId(item.id), { art, daten });
    };
    for (const item of state?.textBoxes || []) if (eigen(item)) dazu(item, "text", textDaten(item));
    for (const item of state?.images || []) if (eigen(item)) dazu(item, "bild", bildDaten(item, typeof bildQuelle === "function" ? bildQuelle(item) : item.src));
    for (const item of state?.widgets || []) if (eigen(item) && !item.pending && !item.hiddenForReplacement) dazu(item, "widget", widgetDaten(item));
    return liste;
  }

  function objektDiff(vorher, nachher) {
    const geaendert = [], geloescht = [];
    for (const [id, { art, daten }] of nachher) {
      const alt = vorher.get(id);
      if (!alt || alt.art !== art || JSON.stringify(alt.daten) !== JSON.stringify(daten)) geaendert.push({ id, art, daten });
    }
    for (const id of vorher.keys()) if (!nachher.has(id)) geloescht.push(id);
    return { geaendert, geloescht };
  }

  const objektRechteck = daten => ({ x:daten.x, y:daten.y, w:daten.w, h:daten.h });
  const objektZuGross = daten => new TextEncoder().encode(JSON.stringify(daten)).length > MAX_BYTES;

  return Object.freeze({ MAX_BYTES, objektId, fremdId, objektListe, objektDiff, objektRechteck, objektZuGross });
})();
if (typeof module === "object" && module.exports) module.exports = LernflaecheObjektAbgleich;
