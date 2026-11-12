// Lernflaeche: Gruppen-Schicht. Nur aktiv mit ?gruppe=<kennung>&person=<kennung>.
// Die eigene Ebene ist PenEchos Kachelspeicher (tiles), nur sie wird bearbeitet.
// Fremde Ebenen liegen getrennt und werden unter der eigenen gezeichnet.
// Protokoll: abgleich/dienst.mjs (hallo, stand, angenommen, eintrag, kachel, objekt, ok, fehler, schutz; Code 4409 = Uebernahme;
// fluechtig: zeiger, live und anwesend mit namen).
// Objekte (Texte, Bilder, Widgets) liegen in PenEchos state-Listen; fremde tragen gruppeAutor, gruppeId und die lokale
// Id "autor~id" und sind weder auswaehlbar noch verschiebbar noch loeschbar (Treffertests in canvas-runtime.js).
  const gruppeKern = LernflaecheGruppeKern;
  const gruppeObjekt = LernflaecheObjektAbgleich;
  const gruppeZiel = gruppeKern.gruppeAusUrl(location.search);
  const GRUPPE_UEBERNAHME = "Diese Fläche ist in einem anderen Fenster geöffnet. Arbeiten Sie dort weiter.";
  const GRUPPE_LADEFEHLER = "Gruppenfläche konnte nicht vollständig geladen werden. Bitte neu laden.";
  const GRUPPE_FREMDES_FELD = "In das Ergebnisfeld einer anderen Person können Sie nicht schreiben.";
  const GRUPPE_STRICH_ENTFERNT = "Dieser Strich lag im Ergebnisfeld einer anderen Person und wurde entfernt.";
  const GRUPPE_BILD_ZU_GROSS = "Dieses Bild ist zu groß für die Gruppenfläche.";
  const GRUPPE_OBJEKT_ZU_GROSS = "Dieses Objekt ist zu groß für die Gruppenfläche.";
  // Bilder werden als data:-URL gesendet; darueber waere die JSON-Grenze des Dienstes (900 000 Bytes) sicher gerissen.
  const GRUPPE_BILD_MAX_BYTES = 650000;
  const GRUPPE_OBJEKT_ARTEN = { text:"textBoxes", bild:"images", widget:"widgets" };
  // Kommt so lange kein ok und keine andere Nachricht vom Dienst, gilt die Verbindung als tot.
  const GRUPPE_ACK_FRIST_MS = 20000;
  // Hoechstens so viele eigene Kacheln sind zugleich ohne ok unterwegs; der Rest folgt mit den ok.
  const GRUPPE_MAX_UNTERWEGS = 16;
  const gruppeLage = {
    // Kennung dieses Seitenaufrufs: ein veraltetes Fenster darf beim Wiederverbinden nicht uebernehmen.
    fenster: gruppeZiel ? gruppeKern.fensterKennung(crypto.getRandomValues(new Uint8Array(16))) : null,
    protokoll: null, // Kennung des Protokolls aus dem zuletzt angewendeten stand
    folge: new gruppeKern.Folge(),
    ausstehend: new gruppeKern.Ausstehend(), // eigene Kacheln ohne ok vom Dienst
    sendeNr: 0,
    schmutzig: new Set(), // lokal geaendert, noch nicht kodiert
    vorStand: new Set(), // vor dem ersten Stand geaendert (nur ueber Wege ohne Zeiger, z. B. Agent/MCP)
    eigen: new Map(), // kachel -> base64, zuletzt gesendet oder empfangen
    bestaetigt: new Map(), // kachel -> base64, zuletzt vom Dienst angenommen (ok oder Stand); fehlt = leer
    schutz: new Map(), // person -> Schutzfelder [[x, y, w, h], ...] (Ergebnisfelder; fremde sind nicht beschreibbar)
    fremd: new Map(), // autor -> Map(kachel -> {canvas, tx, ty})
    fremdPng: new Map(), // "autor|kachel" -> base64, zuletzt empfangen
    neueste: new Map(), // "autor|kachel" -> seq des neuesten Eintrags
    ws: null,
    offen: false,
    // Der Dienst hat auf das hallo dieser Verbindung geantwortet (stand oder angenommen).
    // Vorher geht keine Kachel raus: der Durchreicher puffert bis dahin nur wenige Nachrichten.
    beantwortet: false,
    geoeffnetUm: 0,
    standDa: false,
    standNr: 0, // jeder angewendete stand bekommt eine Nummer; spaete Dekodierungen eines alten verfallen
    bereit: false, // erster Stand empfangen und alle eigenen Kacheln daraus in tiles
    ansichtGesetzt: false, // die Ansicht stand nach dem Laden schon einmal auf der eigenen Mappe
    ladeFehler: false,
    beendet: false,
    warte: 500,
    wiederTimer: 0,
    flushTimer: 0,
    flushLaeuft: false,
    ackTimer: 0,
    objAusstehend: new gruppeKern.Ausstehend(), // eigene Objekte (id -> daten|null) ohne ok vom Dienst
    objVorher: new Map(), // zuletzt gesendeter eigener Stand: id -> {art, daten}
    objFremd: new Map(), // "autor|id" -> {autor, id, daten, seq}
    objTimer: 0,
    objLaeuft: false,
    objNochmal: false,
    objSperre: 0, // solange eine Wiederherstellung (Rueckgaengig) Objekte neu aufbaut, wird nichts verglichen
    fremdLaeuft: false,
    fremdNochmal: false,
    objGemeldet: new Set(), // Zu-gross-Hinweise je id und Daten, damit sie nicht bei jedem Vergleich wiederkommen
  };
  const gruppeBildSrc = new WeakMap(); // Blob -> data:-URL, zuletzt gesendet oder empfangen
  const gruppeBildZuGross = new WeakSet(); // Blobs, die nicht geteilt werden koennen
  const GRUPPE_LAEDT = "Gruppenfläche wird geladen …";
  const GRUPPE_VERBINDET = "Verbindung zur Gruppe wird hergestellt …";
  function gruppeAktiv() {
    return gruppeZiel !== null;
  }
  // Bis der erste Stand samt eigener Kacheln angewendet ist (und nach einer Uebernahme)
  // nimmt die Flaeche keine Tinte an: sonst wuerde ein Strich auf der leeren Flaeche
  // den frueheren eigenen Stand dieser Kachel beim Dienst ueberschreiben.
  function gruppeEingabeGesperrt() {
    return gruppeAktiv() && (!gruppeLage.bereit || gruppeLage.beendet);
  }
  // Eine Kachel mitten in einer Aenderung (offener Strich, angehobene Lasso-Auswahl) wird noch nicht kodiert.
  function gruppeInAenderung(k) {
    return Boolean(state.historyBefore?.has(k) || state.selection?.beforeTiles?.has(k));
  }
  function gruppeBase64(bytes) {
    let text = "";
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(text);
  }
  function gruppeBytes(base64) {
    const text = atob(base64), bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    return bytes;
  }
  function gruppeShaVerfuegbar() {
    if (!globalThis.crypto?.subtle) throw Error("Fingerabdruck nicht möglich: crypto.subtle fehlt. Die Seite braucht eine sichere Herkunft (https, localhost oder 127.0.0.1).");
  }
  async function gruppeSha256(bytes) {
    gruppeShaVerfuegbar();
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return [...digest].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  // Nur Kacheln in genau der Groesse von PenEchos tile(); die Masse werden vor dem Dekodieren
  // aus dem IHDR gelesen, damit ein boeswillig grosses PNG gar nicht erst dekodiert wird.
  async function gruppeDekodieren(base64) {
    const bytes = gruppeBytes(base64), masse = gruppeKern.pngMasse(bytes);
    if (!masse || masse.breite !== TILE || masse.hoehe !== TILE) throw Error(`Kachel ist kein ${TILE}×${TILE}-PNG`);
    const bitmap = await createImageBitmap(new Blob([bytes], { type:"image/png" }));
    try {
      if (bitmap.width !== TILE || bitmap.height !== TILE) throw Error(`Kachel ist kein ${TILE}×${TILE}-PNG`);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = TILE;
      canvas.getContext("2d", { willReadFrequently: true }).drawImage(bitmap, 0, 0);
      return canvas;
    } finally {
      bitmap.close?.();
    }
  }
  // Verhindern (C.4): eigene Tinte in fremden Ergebnisfeldern wird vor dem Kodieren entfernt. Sonst lehnte der Dienst die
  // ganze 512-px-Kachel ab, und jeder weitere Strich darin ginge samt der fremden Pixel wieder verloren.
  function gruppeSchutzBereinigen(k, canvas) {
    const rechtecke = gruppeKern.schutzRechtecke(gruppeLage.schutz, gruppeZiel.person, k);
    if (!rechtecke.length) return false;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const tinte = rechtecke.some(r => {
      const d = ctx.getImageData(r.x, r.y, r.w, r.h).data;
      for (let i = 3; i < d.length; i += 4) if (d[i]) return true;
      return false;
    });
    if (!tinte) return false;
    for (const r of rechtecke) ctx.clearRect(r.x, r.y, r.w, r.h);
    state.inkBounds.delete(k);
    requestRender();
    gruppeKurzHinweis(GRUPPE_STRICH_ENTFERNT);
    return true;
  }
  // Schutzfelder aus dem Stand (ersetzen) oder aus einer Meldung schutz {person, felder}; leere felder heben auf.
  function gruppeSchutzEmpfangen(liste, ersetzen) {
    const neu = gruppeKern.schutzListe(liste);
    if (ersetzen) { gruppeLage.schutz = neu; return; }
    for (const e of Array.isArray(liste) ? liste : []) {
      if (!e || typeof e.person !== "string" || !gruppeKern.KENNUNG.test(e.person)) continue;
      if (neu.has(e.person)) gruppeLage.schutz.set(e.person, neu.get(e.person));
      else if (Array.isArray(e.felder) && !e.felder.length) gruppeLage.schutz.delete(e.person);
    }
  }
  async function gruppeKodieren(k) {
    const canvas = tiles.get(k);
    if (!canvas) return null;
    gruppeSchutzBereinigen(k, canvas);
    const [tx, ty] = k.split(",").map(Number);
    if (!inkBox(canvas, Math.min(TILE, SIZE - tx * TILE), Math.min(TILE, SIZE - ty * TILE))) return null;
    const blob = await canvasBlob(canvas);
    return gruppeBase64(new Uint8Array(await blob.arrayBuffer()));
  }
  function gruppeHinweis(text, art = "fehler") {
    let hinweis = document.getElementById("lernflaecheGruppeHinweis");
    if (!hinweis) {
      hinweis = document.createElement("div");
      hinweis.id = "lernflaecheGruppeHinweis";
      hinweis.setAttribute("role", "alert");
      Object.assign(hinweis.style, {
        position:"fixed", top:"12px", left:"50%", transform:"translateX(-50%)", zIndex:"2147483000",
        boxSizing:"border-box", maxWidth:"calc(100vw - 32px)", padding:"12px 16px", borderRadius:"10px",
        color:"#fff", font:"600 15px/1.4 system-ui, sans-serif", textAlign:"center",
        boxShadow:"0 6px 24px rgba(0,0,0,.25)",
      });
      document.body.append(hinweis);
    }
    hinweis.style.background = art === "laden" ? "#2f3a4a" : "#7a1f1f";
    hinweis.dataset.art = art;
    hinweis.textContent = text;
  }
  function gruppeHinweisWeg() {
    document.getElementById("lernflaecheGruppeHinweis")?.remove();
  }
  // Kurzer Hinweis auf eine abgelehnte Eingabe; verdraengt nie die Hinweise zu Uebernahme, Laden oder Verbindung.
  let gruppeKurzTimer = 0;
  function gruppeKurzHinweis(text) {
    if (gruppeLage.beendet || gruppeLage.ladeFehler || !gruppeLage.bereit) return;
    gruppeHinweis(text);
    clearTimeout(gruppeKurzTimer);
    gruppeKurzTimer = setTimeout(() => {
      const hinweis = document.getElementById("lernflaecheGruppeHinweis");
      if (hinweis && hinweis.textContent === text && !gruppeLage.beendet) gruppeHinweisWeg();
    }, 7000);
  }

  // Objekte -----------------------------------------------------------------
  const gruppeObjektFremd = item => Boolean(item?.gruppeAutor);
  function gruppeDataUrlBlob(src) {
    const m = typeof src === "string" ? /^data:(image\/(?:png|jpeg|webp|gif|bmp|avif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(src) : null;
    return m ? new Blob([gruppeBytes(m[2])], { type:m[1] }) : null;
  }
  function gruppeBlobDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const leser = new FileReader();
      leser.onload = () => {
        const text = String(leser.result);
        resolve(blob.type ? text : text.replace(/^data:[^;,]*/, "data:image/png"));
      };
      leser.onerror = () => reject(leser.error || Error("Bild nicht lesbar"));
      leser.readAsDataURL(blob);
    });
  }
  // Alle eigenen Bilder kodieren, bevor verglichen wird: objektListe selbst ist synchron.
  async function gruppeBilderKodieren() {
    for (const item of state.images) {
      const blob = item?.blob;
      if (gruppeObjektFremd(item) || !(blob instanceof Blob) || gruppeBildSrc.has(blob) || gruppeBildZuGross.has(blob)) continue;
      if (blob.size > GRUPPE_BILD_MAX_BYTES) { gruppeBildZuGross.add(blob); continue; }
      try { gruppeBildSrc.set(blob, await gruppeBlobDataUrl(blob)); }
      catch (error) { gruppeBildZuGross.add(blob); debug("gruppe-bild-kodieren", { error:String(error?.message || error).slice(0, 160) }); }
    }
  }
  // Baut aus Objektdaten einen Eintrag fuer die state-Listen. Gezeichnet wird immer genau im
  // erklaerten Rechteck x, y, w, h: der Dienst prueft Rechte nur gegen dieses Rechteck.
  async function gruppeObjektBauen(art, daten, id) {
    if (!daten || typeof daten !== "object" || !(daten.w > 0) || !(daten.h > 0)) return null;
    let record = null;
    if (art === "text") {
      record = await renderedTextBoxRecord({ ...daten, id:"text-box-0" }, 1);
      if (record) Object.assign(record, { x:daten.x, y:daten.y, w:daten.w, h:daten.h });
    } else if (art === "bild") {
      const blob = gruppeDataUrlBlob(daten.src);
      if (!blob) return null;
      record = imageRecord({ ...daten, id:"image-0", blob, image:await imageFromBlob(blob) });
      if (record) gruppeBildSrc.set(blob, daten.src);
    } else if (art === "widget") {
      await enableSnapshotWidgetPlugins([daten]);
      record = widgetRecord({ ...daten, id:"widget-0" });
    }
    if (record) record.id = id;
    return record;
  }
  function gruppeObjektEinsetzen(key, record) {
    const liste = state[key], index = liste.findIndex(item => item.id === record.id);
    if (index >= 0) {
      if (key === "widgets") unmountWidget(liste[index]);
      liste.splice(index, 1, record);
    } else liste.push(record);
    if (key === "widgets") {
      if (pluginEnabled(record.pluginId)) mountWidget(record);
      syncWidgetLayerOrder();
    }
  }
  function gruppeObjektEntfernen(key, item) {
    const liste = state[key], index = liste.indexOf(item);
    if (index < 0) return;
    if (key === "widgets") unmountWidget(item);
    liste.splice(index, 1);
    if (key === "textBoxes" && item.image) releaseTextRaster(item.image);
  }
  // Fremde Objekte aus objFremd in die Listen bringen: Veraltetes weg, Neues und Geaendertes (neu) anlegen.
  async function gruppeFremdeAnwenden() {
    if (!gruppeAktiv()) return;
    if (gruppeLage.fremdLaeuft) { gruppeLage.fremdNochmal = true; return; }
    gruppeLage.fremdLaeuft = true;
    try {
      do {
        gruppeLage.fremdNochmal = false;
        for (const key of Object.values(GRUPPE_OBJEKT_ARTEN)) {
          for (const item of [...state[key]]) {
            if (!gruppeObjektFremd(item)) continue;
            const e = gruppeLage.objFremd.get(`${item.gruppeAutor}|${item.gruppeId}`);
            if (!e || GRUPPE_OBJEKT_ARTEN[e.daten.art] !== key) gruppeObjektEntfernen(key, item);
          }
        }
        for (const [schluessel, e] of [...gruppeLage.objFremd]) {
          const key = GRUPPE_OBJEKT_ARTEN[e.daten?.art];
          if (!key) continue;
          const lokal = gruppeObjekt.fremdId(e.autor, e.id), json = JSON.stringify(e.daten);
          if (state[key].some(item => item.id === lokal && item.gruppeJson === json)) continue;
          let record = null;
          try { record = await gruppeObjektBauen(e.daten.art, e.daten, lokal); }
          catch (error) { debug("gruppe-objekt-bauen", { art:e.daten.art, error:String(error?.message || error).slice(0, 160) }); }
          if (gruppeLage.objFremd.get(schluessel) !== e) { // inzwischen ersetzt oder geloescht
            if (record?.image && key === "textBoxes") releaseTextRaster(record.image);
            gruppeLage.fremdNochmal = true;
            continue;
          }
          if (!record) continue;
          Object.assign(record, { gruppeAutor:e.autor, gruppeId:e.id, gruppeJson:json });
          gruppeObjektEinsetzen(key, record);
          requestRender();
        }
      } while (gruppeLage.fremdNochmal && !gruppeLage.beendet);
    } finally {
      gruppeLage.fremdLaeuft = false;
      requestRender();
    }
  }
  function gruppeObjektHinweis(art) {
    gruppeKurzHinweis(art === "bild" ? GRUPPE_BILD_ZU_GROSS : GRUPPE_OBJEKT_ZU_GROSS);
  }
  // Eigene Objekte gegen den zuletzt gesendeten Stand vergleichen und die Unterschiede senden.
  async function gruppeObjekteAbgleichen() {
    if (!gruppeAktiv() || gruppeLage.beendet || !gruppeLage.bereit || gruppeLage.objSperre > 0) return;
    if (gruppeLage.objLaeuft) { gruppeLage.objNochmal = true; return; }
    gruppeLage.objLaeuft = true;
    try {
      do {
        gruppeLage.objNochmal = false;
        await gruppeBilderKodieren();
        if (gruppeLage.beendet || gruppeLage.objSperre > 0) break;
        const nachher = gruppeObjekt.objektListe(state, item => gruppeBildSrc.get(item.blob));
        for (const [id, objekt] of [...nachher]) {
          let zeichen = null;
          if (objekt.art === "bild" && typeof objekt.daten.src !== "string") zeichen = `${id}|bild`;
          else if (gruppeObjekt.objektZuGross(objekt.daten)) zeichen = `${id}|${objekt.art}|${JSON.stringify(objekt.daten).length}`;
          if (!zeichen) continue;
          // Nicht teilbar (zu gross oder nicht kodierbar): eine frueher gesendete Fassung bleibt stehen.
          const alt = gruppeLage.objVorher.get(id);
          if (alt) nachher.set(id, alt); else nachher.delete(id);
          if (!gruppeLage.objGemeldet.has(zeichen)) { gruppeLage.objGemeldet.add(zeichen); gruppeObjektHinweis(objekt.art); }
        }
        const { geaendert, geloescht } = gruppeObjekt.objektDiff(gruppeLage.objVorher, nachher);
        for (const { id, art, daten } of geaendert) {
          gruppeLage.objVorher.set(id, { art, daten });
          gruppeLage.objAusstehend.setzen(id, daten);
        }
        for (const id of geloescht) {
          gruppeLage.objVorher.delete(id);
          gruppeLage.objAusstehend.setzen(id, null);
        }
        if (geaendert.length || geloescht.length) gruppeAusstehendSenden();
      } while (gruppeLage.objNochmal && !gruppeLage.beendet);
    } finally {
      gruppeLage.objLaeuft = false;
    }
  }
  async function gruppeObjekteTakt() {
    gruppeLage.objTimer = 0;
    await gruppeFremdeAnwenden();
    await gruppeObjekteAbgleichen();
  }
  function gruppeObjektePlanen(ms) {
    if (!gruppeAktiv() || gruppeLage.beendet) return;
    clearTimeout(gruppeLage.objTimer);
    gruppeLage.objTimer = setTimeout(() => { void gruppeObjekteTakt(); }, ms);
  }
  // Haken nach save(), Rueckgaengig/Wiederholen und MCP-Bearbeitungen. Eine Wiederherstellung (Promise) baut die Listen
  // asynchron neu auf: bis dahin wird nichts verglichen, sonst gaelten die noch fehlenden Objekte als geloescht.
  function gruppeObjekteGeaendert(wiederherstellung = null) {
    if (!gruppeAktiv() || gruppeLage.beendet) return;
    if (wiederherstellung && typeof wiederherstellung.then === "function") {
      gruppeLage.objSperre++;
      const fertig = () => { gruppeLage.objSperre--; gruppeObjektePlanen(0); };
      wiederherstellung.then(fertig, fertig);
    }
    gruppeObjektePlanen(100);
  }
  function gruppeObjektGueltig(e) {
    return typeof e?.autor === "string" && gruppeKern.KENNUNG.test(e.autor) && typeof e.id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(e.id)
      && Number.isSafeInteger(e.seq) && (e.daten === null || (typeof e.daten === "object" && !Array.isArray(e.daten) && typeof e.daten.art === "string"));
  }
  // Ein fremdes Objekt (objekt-Nachricht oder Stand) in objFremd; eigene Objekte sind lokal massgeblich.
  function gruppeObjektEmpfangen(e) {
    if (!gruppeObjektGueltig(e) || e.autor === gruppeZiel.person) return;
    const schluessel = `${e.autor}|${e.id}`;
    if (e.daten === null) gruppeLage.objFremd.delete(schluessel);
    else gruppeLage.objFremd.set(schluessel, { autor:e.autor, id:e.id, daten:e.daten, seq:e.seq });
  }
  // Stand: fremde Objekte ersetzen alle fremden; die eigenen kommen beim ersten Stand in die Listen
  // (Promises fuer "bereit"), bei einem Neuaufbau bleibt der lokale Stand massgeblich.
  function gruppeObjekteAusStand(objekte, erstmals) {
    gruppeLage.objFremd.clear();
    gruppeLage.objVorher = new Map();
    const eigene = [];
    for (const e of Array.isArray(objekte) ? objekte : []) {
      if (!gruppeObjektGueltig(e) || e.daten === null) continue;
      if (e.autor !== gruppeZiel.person) { gruppeObjektEmpfangen(e); continue; }
      const art = e.daten.art, key = GRUPPE_OBJEKT_ARTEN[art];
      if (!key) continue;
      // Die id-Zaehler sofort hinter die gespeicherten eigenen ids, nicht erst nach dem asynchronen Aufbau:
      // sonst bekaeme ein neues Objekt (Zeichnen, MCP) die id eines gespeicherten und ueberschriebe es beim Dienst.
      const nummer = /^(text-box|image|widget)-(\d+)$/.exec(e.id);
      if (nummer) {
        const zaehler = nummer[1] === "text-box" ? "nextTextBoxId" : nummer[1] === "image" ? "nextImageId" : "nextWidgetId";
        state[zaehler] = Math.max(state[zaehler], Number(nummer[2]) + 1);
      }
      if (!erstmals) { gruppeLage.objVorher.set(e.id, { art, daten:e.daten }); continue; }
      eigene.push(gruppeObjektBauen(art, e.daten, e.id).then(record => {
        if (!record || state[key].some(item => item.id === e.id)) return;
        gruppeLage.objVorher.set(e.id, { art, daten:e.daten });
        gruppeObjektEinsetzen(key, record);
        requestRender();
      }));
    }
    return eigene;
  }

  // Senden: save()/Rueckgaengig/Wiederholen markieren nur; kurz danach wird der
  // aktuelle Stand jeder Kachel kodiert, so gewinnt immer der neueste.
  function gruppeNachSpeichern(aenderungen) {
    if (!gruppeAktiv() || gruppeLage.beendet || !Array.isArray(aenderungen)) return;
    for (const change of aenderungen) {
      if (!gruppeKern.istKachelSchluessel(change?.k)) continue;
      gruppeLage.schmutzig.add(change.k);
      if (!gruppeLage.bereit) gruppeLage.vorStand.add(change.k);
    }
    gruppeFlushPlanen(100);
  }
  function gruppeFlushPlanen(ms) {
    if (!gruppeLage.schmutzig.size || gruppeLage.beendet) return;
    clearTimeout(gruppeLage.flushTimer);
    gruppeLage.flushTimer = setTimeout(() => { void gruppeFlush(); }, ms);
  }
  // Vor dem ersten Stand wird nichts gesendet: der eigene Serverstand muss erst unterlegt sein.
  const gruppeFlushbar = () => (gruppeLage.bereit ? [...gruppeLage.schmutzig].filter(k => !gruppeInAenderung(k)) : []);
  async function gruppeFlush() {
    if (gruppeLage.flushLaeuft) return;
    gruppeLage.flushLaeuft = true;
    try {
      let keys;
      while (!gruppeLage.beendet && (keys = gruppeFlushbar()).length) {
        for (const k of keys) {
          if (gruppeInAenderung(k)) continue; // bleibt schmutzig bis zum Abschluss
          gruppeLage.schmutzig.delete(k);
          let png;
          try { png = await gruppeKodieren(k); }
          catch (error) { debug("gruppe-kodieren", { kachel:k, error:String(error?.message || error).slice(0, 160) }); continue; }
          if (gruppeLage.beendet) return;
          if (gruppeLage.schmutzig.has(k)) continue; // ein neuerer Stand folgt
          gruppeSenden(k, png);
        }
      }
    } finally {
      gruppeLage.flushLaeuft = false;
      // Kacheln mitten in einer Aenderung: nach Abschluss (save) oder Abbruch (ohne save) erneut versuchen.
      if (gruppeLage.bereit) gruppeFlushPlanen(250);
    }
  }
  // Jede Kachel bleibt in ausstehend, bis der Dienst genau diese Sendung mit ok bestaetigt.
  function gruppeSenden(k, png) {
    if (png === null) gruppeLage.eigen.delete(k);
    else gruppeLage.eigen.set(k, png);
    gruppeLage.ausstehend.setzen(k, png);
    gruppeAusstehendSenden();
  }
  function gruppeAusstehendSenden() {
    const ws = gruppeLage.ws;
    if (!ws || !gruppeLage.offen || !gruppeLage.beantwortet || !gruppeLage.standDa || ws.readyState !== WebSocket.OPEN || gruppeLage.beendet) return;
    for (const { kachel, png } of gruppeLage.ausstehend.naechste(GRUPPE_MAX_UNTERWEGS)) {
      const nr = ++gruppeLage.sendeNr;
      ws.send(JSON.stringify({ typ:"kachel", kachel, png, nr }));
      gruppeLage.ausstehend.gesendet(kachel, nr);
    }
    for (const { kachel:id, png:daten } of gruppeLage.objAusstehend.naechste(GRUPPE_MAX_UNTERWEGS)) {
      const nr = ++gruppeLage.sendeNr;
      ws.send(JSON.stringify({ typ:"objekt", id, daten, nr }));
      gruppeLage.objAusstehend.gesendet(id, nr);
    }
    gruppeAckFrist();
  }
  // Halboffene Verbindung (Ruhezustand, WLAN-Wechsel): ohne Antwort auf Gesendetes wird neu verbunden.
  function gruppeAckFrist() {
    clearTimeout(gruppeLage.ackTimer);
    gruppeLage.ackTimer = 0;
    const ws = gruppeLage.ws;
    if (!ws || !(gruppeLage.ausstehend.unterwegs || gruppeLage.objAusstehend.unterwegs)) return;
    gruppeLage.ackTimer = setTimeout(() => {
      if (gruppeLage.ws !== ws) return;
      debug("gruppe-ack-frist", { unterwegs:gruppeLage.ausstehend.unterwegs + gruppeLage.objAusstehend.unterwegs });
      try { ws.close(4000, "Keine Bestaetigung vom Abgleich"); } catch {}
      gruppeGetrennt(ws, 4000, "", false);
    }, GRUPPE_ACK_FRIST_MS);
  }

  // Empfangen
  // Sicherheitsnetz fuer Tinte, die trotz Eingabesperre vor dem ersten Stand entstand:
  // der eigene Serverstand wird unter jeden lokalen Stand dieser Kachel gelegt
  // (Kachel, offene Aenderung, Rueckgaengig-Verlauf), damit nichts davon verloren geht.
  function gruppeUnterlegen(k, server) {
    const unter = canvas => {
      if (!canvas) return cloneCanvas(server);
      const ctx = canvas.getContext("2d");
      ctx.save();
      ctx.globalCompositeOperation = "destination-over";
      ctx.drawImage(server, 0, 0);
      ctx.restore();
      return canvas;
    };
    tiles.set(k, unter(tiles.get(k)));
    if (state.historyBefore.has(k)) state.historyBefore.set(k, unter(state.historyBefore.get(k)));
    for (const entry of [...state.history, ...state.future]) {
      for (const change of Array.isArray(entry?.tiles) ? entry.tiles : []) {
        if (change.k !== k) continue;
        change.before = unter(change.before);
        change.after = unter(change.after);
      }
    }
    gruppeLage.schmutzig.add(k);
  }
  function gruppeFremdSetzen(autor, k, canvas) {
    let ebene = gruppeLage.fremd.get(autor);
    const alt = ebene?.get(k);
    if (alt) alt.canvas.width = alt.canvas.height = 1;
    if (!canvas) {
      ebene?.delete(k);
      if (ebene && !ebene.size) gruppeLage.fremd.delete(autor);
      return;
    }
    if (!ebene) gruppeLage.fremd.set(autor, (ebene = new Map()));
    const [tx, ty] = k.split(",").map(Number);
    ebene.set(k, { canvas, tx, ty });
  }
  function gruppeFremdeLeeren() {
    for (const ebene of gruppeLage.fremd.values()) for (const kachel of ebene.values()) kachel.canvas.width = kachel.canvas.height = 1;
    gruppeLage.fremd.clear();
    gruppeLage.fremdPng.clear();
    gruppeLage.neueste.clear();
  }
  const gruppeGueltig = e => typeof e?.autor === "string" && gruppeKern.KENNUNG.test(e.autor) && gruppeKern.istKachelSchluessel(e.kachel)
    && Number.isSafeInteger(e.seq) && (e.png === null || typeof e.png === "string");
  // Liefert fuer eine eigene Kachel aus dem Stand ein Promise, das bei fehlgeschlagener oder
  // falsch grosser Dekodierung abgelehnt wird: dann gilt der Stand nicht als geladen.
  function gruppeEintrag(e, ausStand) {
    if (!gruppeGueltig(e)) return;
    const id = `${e.autor}|${e.kachel}`, k = e.kachel;
    if ((gruppeLage.neueste.get(id) ?? -1) >= e.seq) return;
    gruppeLage.neueste.set(id, e.seq);
    if (gruppeKern.zielEbene(e, gruppeZiel.person) === "eigen") {
      // Die eigene Ebene hat genau einen Schreiber: diesen Browser. Nur der erste Stand
      // fuellt sie; bis seine eigenen Kacheln in tiles sind, ist die Eingabe gesperrt.
      if (!ausStand || e.png === null) return null;
      gruppeLage.eigen.set(k, e.png);
      gruppeLage.bestaetigt.set(k, e.png);
      return gruppeDekodieren(e.png).then(canvas => {
        if (gruppeLage.neueste.get(id) !== e.seq) { canvas.width = canvas.height = 1; return; }
        if (gruppeLage.vorStand.has(k) || state.historyBefore.has(k)) {
          gruppeUnterlegen(k, canvas);
          canvas.width = canvas.height = 1;
        } else tiles.set(k, canvas);
        state.inkBounds.delete(k);
        requestRender();
      }, error => {
        debug("gruppe-dekodieren", { kachel:k, eigen:true, error:String(error?.message || error).slice(0, 160) });
        throw error;
      });
    }
    if (e.png === null) {
      gruppeLage.fremdPng.delete(id);
      gruppeFremdSetzen(e.autor, k, null);
      liveKachelDa(e.autor);
      requestRender();
      return;
    }
    gruppeLage.fremdPng.set(id, e.png);
    void gruppeDekodieren(e.png).then(canvas => {
      if (gruppeLage.neueste.get(id) !== e.seq) { canvas.width = canvas.height = 1; return; }
      gruppeFremdSetzen(e.autor, k, canvas);
      liveKachelDa(e.autor); // erst jetzt, mit der gezeichneten Kachel: kein Aufblitzen ohne Strich
      requestRender();
    }, error => debug("gruppe-dekodieren", { kachel:k, error:String(error?.message || error).slice(0, 160) }));
  }
  // Erster Stand (oder ein neuer, solange der erste noch nicht fertig geladen ist): fuellt alle Ebenen.
  function gruppeStandLaden(m) {
    const nr = ++gruppeLage.standNr;
    gruppeLage.ladeFehler = false;
    gruppeFremdeLeeren();
    gruppeLage.eigen.clear();
    gruppeLage.bestaetigt.clear();
    gruppeLage.protokoll = typeof m.protokoll === "string" ? m.protokoll : null;
    gruppeLage.folge = new gruppeKern.Folge(m.seq);
    const eigene = [];
    for (const e of m.kacheln) {
      const decodiert = gruppeEintrag(e, true);
      if (decodiert) eigene.push(decodiert);
    }
    eigene.push(...gruppeObjekteAusStand(m.objekte, true));
    void gruppeFremdeAnwenden();
    gruppeLage.standDa = true;
    gruppeAusstehendSenden();
    requestRender();
    void Promise.allSettled(eigene).then(ergebnisse => {
      if (nr !== gruppeLage.standNr) return;
      if (ergebnisse.some(r => r.status === "rejected")) {
        // Ohne die eigene Kachel weiterzuarbeiten hiesse, sie beim naechsten Strich zu ueberschreiben.
        gruppeLage.ladeFehler = true;
        if (!gruppeLage.beendet) gruppeHinweis(GRUPPE_LADEFEHLER);
        return;
      }
      gruppeLage.bereit = true;
      gruppeLage.vorStand.clear();
      if (!gruppeLage.beendet) gruppeHinweisWeg();
      gruppeAnsichtAufMappe();
      if (gruppeLage.schmutzig.size) void gruppeFlush();
      gruppeObjekteGeaendert();
    });
  }
  // Nach dem Laden einmal auf die eigene Mappe (Abnahme C, Befund 1): PenEcho mittelt beim Start auf die Flaechenmitte,
  // und die Huelle zeigt eine Aufgabe erst, wenn MCP wieder verbunden ist. Gerahmt werden die eigenen Objekte (Karten
  // der Huelle) und die eigenen Ergebnisfelder, wie bei show mit 40 Rand. Nur beim ersten fertigen Stand; ein spaeterer
  // Stand (Wiederverbinden, Neuaufbau) bewegt die Ansicht nie.
  function gruppeAnsichtAufMappe() {
    if (gruppeLage.ansichtGesetzt) return false;
    gruppeLage.ansichtGesetzt = true;
    const kaesten = [...state.textBoxes, ...state.images, ...state.widgets]
      .filter(item => !gruppeObjektFremd(item))
      .map(item => ({ x:item.x, y:item.y, w:item.w, h:item.h }));
    const bereich = gruppeKern.mappeAnsicht(gruppeKern.mappeBereich(kaesten, gruppeLage.schutz.get(gruppeZiel.person)));
    if (!bereich) return false;
    canvasAgentFrameRegion(bereich, 40);
    state.viewInitialized = true; // fit() beim naechsten Groessenwechsel mittelt nicht wieder auf die Flaechenmitte
    updateCoordinates();
    return true;
  }
  // Neuer Stand, obwohl schon einer angewendet war: das Protokoll des Dienstes wurde ersetzt
  // oder zurueckgesetzt. Fremde Ebenen kommen aus dem neuen Stand; die eigene Ebene ist lokal
  // massgeblich und wird ganz neu hochgeladen.
  function gruppeNeuAufbau(m) {
    ++gruppeLage.standNr;
    debug("gruppe-neuaufbau", { alt:gruppeLage.protokoll, neu:m.protokoll, seq:m.seq });
    gruppeFremdeLeeren();
    gruppeLage.protokoll = typeof m.protokoll === "string" ? m.protokoll : null;
    gruppeLage.folge = new gruppeKern.Folge(m.seq);
    const eigeneImStand = [];
    for (const e of m.kacheln) {
      if (!gruppeGueltig(e)) continue;
      if (gruppeKern.zielEbene(e, gruppeZiel.person) === "eigen") eigeneImStand.push(e.kachel);
      else gruppeEintrag(e, true);
    }
    for (const k of gruppeKern.neuAufbauKacheln([...tiles.keys()], eigeneImStand)) gruppeLage.schmutzig.add(k);
    gruppeObjekteAusStand(m.objekte, false);
    gruppeLage.objAusstehend.leeren();
    void gruppeFremdeAnwenden();
    gruppeObjekteGeaendert();
    requestRender();
    void gruppeFlush();
  }
  function gruppeEmpfangen(text) {
    let m;
    try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m !== "object") return;
    gruppeAckFrist(); // jede Nachricht zeigt, dass die Verbindung lebt
    if (m.typ === "stand") {
      if (!Number.isSafeInteger(m.seq) || !Array.isArray(m.kacheln)) return;
      if (m.objekte !== undefined && !Array.isArray(m.objekte)) return;
      gruppeLage.beantwortet = true;
      gruppeSchutzEmpfangen(m.schutz, true);
      if (gruppeLage.bereit) gruppeNeuAufbau(m);
      else gruppeStandLaden(m);
    } else if (m.typ === "angenommen") {
      // Nachholung abgeschlossen: jetzt geht das Unbestaetigte raus, in Portionen.
      gruppeLage.beantwortet = true;
      // Schutzfelder neu: ein PUT /schutz waehrend der Trennung kam als Meldung nicht an.
      if (Array.isArray(m.schutz)) gruppeSchutzEmpfangen(m.schutz, true);
      gruppeAusstehendSenden();
    } else if (m.typ === "schutz") {
      gruppeSchutzEmpfangen([m], false);
    } else if (m.typ === "zeiger") {
      zeigerEmpfangen(m);
    } else if (m.typ === "live") {
      liveEmpfangen(m);
    } else if (m.typ === "anwesend") {
      anwesendEmpfangen(m);
    } else if (m.typ === "eintrag") {
      if (gruppeLage.standDa && gruppeLage.folge.annehmen(m.seq)) gruppeEintrag(m, false);
    } else if (m.typ === "objekt") {
      if (gruppeLage.standDa && gruppeLage.folge.annehmen(m.seq)) {
        gruppeObjektEmpfangen(m);
        void gruppeFremdeAnwenden();
      }
    } else if (m.typ === "ok") {
      if (gruppeKern.istKachelSchluessel(m.kachel) && Number.isSafeInteger(m.nr)) {
        const gesendet = gruppeLage.ausstehend.eintrag(m.kachel);
        if (gruppeLage.ausstehend.bestaetigen(m.kachel, m.nr)) {
          if (gesendet.png === null) gruppeLage.bestaetigt.delete(m.kachel);
          else gruppeLage.bestaetigt.set(m.kachel, gesendet.png);
        }
      } else if (typeof m.objekt === "string" && Number.isSafeInteger(m.nr)) gruppeLage.objAusstehend.bestaetigen(m.objekt, m.nr);
      gruppeAusstehendSenden(); // naechste Portion, setzt auch die Frist neu
      gruppeAckFrist();
    } else if (m.typ === "fehler") {
      gruppeAbgelehnt(m);
    }
  }
  function gruppeAbgelehnt(m) {
    debug("gruppe-fehler", { grund:String(m.grund).slice(0, 160), nr:m.nr });
    // Eine abgelehnte eigene Sendung wird nicht wiederholt (sie wuerde wieder abgelehnt).
    let kachel = null;
    if (Number.isSafeInteger(m.nr)) {
      kachel = gruppeLage.ausstehend.nrKachel(m.nr);
      if (kachel !== null) gruppeLage.ausstehend.bestaetigen(kachel, m.nr);
      const id = gruppeLage.objAusstehend.nrKachel(m.nr);
      if (id !== null) gruppeLage.objAusstehend.bestaetigen(id, m.nr);
    }
    if (m.grund === "fremdes_ergebnisfeld") {
      // Sicherheitsnetz: die Kachel geht auf den zuletzt angenommenen Stand zurueck, sonst bliebe sie gesperrt.
      if (kachel !== null) {
        void gruppeKachelZuruecksetzen(kachel);
        gruppeKurzHinweis(GRUPPE_STRICH_ENTFERNT);
      } else gruppeKurzHinweis(GRUPPE_FREMDES_FELD);
    }
    gruppeAusstehendSenden();
    gruppeAckFrist();
  }
  // Abgelehnte Kachel (fremdes_ergebnisfeld) auf den zuletzt bestaetigten Stand; ohne einen ist sie leer. Wurde in der
  // Kachel inzwischen weitergezeichnet, bleibt sie: der neuere Stand geht ohnehin raus und wird vorher bereinigt.
  async function gruppeKachelZuruecksetzen(k) {
    const png = gruppeLage.bestaetigt.get(k) ?? null;
    let canvas = null;
    if (png !== null) {
      try { canvas = await gruppeDekodieren(png); }
      catch (error) { debug("gruppe-zuruecksetzen", { kachel:k, error:String(error?.message || error).slice(0, 160) }); return; }
    }
    if (gruppeLage.beendet || gruppeLage.schmutzig.has(k) || gruppeLage.ausstehend.hat(k) || gruppeInAenderung(k)) {
      if (canvas) canvas.width = canvas.height = 1;
      return;
    }
    if (canvas) tiles.set(k, canvas);
    else tiles.get(k)?.getContext("2d").clearRect(0, 0, TILE, TILE);
    if (png === null) gruppeLage.eigen.delete(k);
    else gruppeLage.eigen.set(k, png);
    state.inkBounds.delete(k);
    requestRender();
  }

  // Verbindung
  function gruppeVerbinden() {
    if (!gruppeAktiv() || gruppeLage.beendet || gruppeLage.ws) return;
    const q = new URLSearchParams({ flaeche:gruppeZiel.gruppe, person:gruppeZiel.person, fenster:gruppeLage.fenster });
    const url = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/abgleich?${q}`;
    let ws;
    try { ws = new WebSocket(url); } catch (error) {
      debug("gruppe-verbinden", { error:String(error?.message || error).slice(0, 160) });
      gruppeWiederverbinden();
      return;
    }
    gruppeLage.ws = ws;
    ws.addEventListener("open", () => {
      if (gruppeLage.ws !== ws) return;
      gruppeLage.offen = true;
      gruppeLage.beantwortet = false;
      gruppeLage.geoeffnetUm = Date.now();
      // seit null nur beim ersten Laden: nur dann darf dieses Fenster ein anderes ablösen.
      // Kacheln gehen erst nach der Antwort raus (stand bzw. angenommen nach der Nachholung).
      ws.send(JSON.stringify({ typ:"hallo", seit:gruppeLage.standDa ? gruppeLage.folge.seq : null, protokoll:gruppeLage.standDa ? gruppeLage.protokoll : null }));
    });
    ws.addEventListener("message", event => { if (gruppeLage.ws === ws && typeof event.data === "string") gruppeEmpfangen(event.data); });
    ws.addEventListener("close", event => {
      if (gruppeLage.ws !== ws) return;
      gruppeGetrennt(ws, event.code, event.reason, gruppeLage.offen && Date.now() - gruppeLage.geoeffnetUm > 5000);
    });
    ws.addEventListener("error", () => {});
  }
  function gruppeGetrennt(ws, code, grund, lebte) {
    if (gruppeLage.ws !== ws) return;
    gruppeLage.ws = null;
    gruppeLage.offen = false;
    gruppeLage.beantwortet = false;
    clearTimeout(gruppeLage.ackTimer);
    gruppeLage.ackTimer = 0;
    zeigerAlleWeg(); // nach dem Wiederverbinden kommen anwesend und neue Zeiger frisch
    zeigerLage.weg = true;
    liveFremdeWeg();
    // Ohne ok ist unklar, was angekommen ist: alles Unbestaetigte geht nach dem Wiederverbinden noch einmal raus.
    gruppeLage.ausstehend.zuruecksetzen();
    gruppeLage.objAusstehend.zuruecksetzen();
    if (code === 4409 || code === 1008) {
      gruppeLage.beendet = true;
      clearTimeout(gruppeLage.flushTimer);
      gruppeLage.schmutzig.clear();
      gruppeLage.ausstehend.leeren();
      gruppeLage.objAusstehend.leeren();
      clearTimeout(gruppeLage.objTimer);
      gruppeHinweis(grund || (code === 4409 ? GRUPPE_UEBERNAHME : "Ungültiger Gruppenlink."));
      return;
    }
    if (!gruppeLage.bereit && !gruppeLage.ladeFehler) gruppeHinweis(GRUPPE_VERBINDET, "laden");
    if (lebte) gruppeLage.warte = 500;
    gruppeWiederverbinden();
  }
  function gruppeWiederverbinden() {
    if (gruppeLage.beendet || gruppeLage.wiederTimer) return;
    const warte = gruppeLage.warte;
    gruppeLage.warte = Math.min(warte * 2, 5000);
    gruppeLage.wiederTimer = setTimeout(() => { gruppeLage.wiederTimer = 0; gruppeVerbinden(); }, warte);
  }

  // Zeichnen: fremde Ebenen unter der eigenen, nur im sichtbaren Bereich.
  function gruppeZeichneFremde(ctx, sichtbar) {
    if (!gruppeAktiv() || !gruppeLage.fremd.size || !sichtbar) return;
    const x1 = sichtbar.x + sichtbar.w, y1 = sichtbar.y + sichtbar.h;
    for (const autor of [...gruppeLage.fremd.keys()].sort()) {
      for (const kachel of gruppeLage.fremd.get(autor).values()) {
        const x = kachel.tx * TILE, y = kachel.ty * TILE;
        if (x < x1 && x + TILE > sichtbar.x && y < y1 && y + TILE > sichtbar.y) ctx.drawImage(kachel.canvas, x, y);
      }
    }
  }

  // Live-Zeiger und Anwesenheit (fluechtig, nie gespeichert): die eigene Zeigerposition geht
  // gedrosselt an den Dienst, fremde Zeiger liegen als DOM-Ebene mit Name und Farbe ueber der Flaeche.
  const GRUPPE_ZEIGER_TAKT_MS = 50;
  const zeigerLage = { takt:new gruppeKern.ZeigerTakt(GRUPPE_ZEIGER_TAKT_MS), timer:0, weg:true, fremd:new Map(), anwesend:[], namen:{}, ebene:null, liste:null, raf:0 };
  const gruppeName = id => gruppeKern.anzeigeName(zeigerLage.namen, id); // Anzeigename vom Dienst, sonst die Kennung
  function zeigerSenden(nachricht) {
    const ws = gruppeLage.ws;
    if (!ws || !gruppeLage.offen || !gruppeLage.beantwortet || gruppeLage.beendet || ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify({ typ:"zeiger", ...nachricht })); } catch {}
  }
  function zeigerBewegt(event) {
    if (gruppeLage.beendet) return;
    const { rect } = canvasViewportMetrics();
    if (event.clientX < rect.left || event.clientY < rect.top || event.clientX > rect.right || event.clientY > rect.bottom) return zeigerWeg();
    const p = clientPoint(event), punkt = { x:Math.round(p.x * 10) / 10, y:Math.round(p.y * 10) / 10 };
    if (!(punkt.x >= 0 && punkt.y >= 0 && punkt.x <= SIZE && punkt.y <= SIZE)) return zeigerWeg();
    zeigerLage.weg = false;
    const { senden, warte } = zeigerLage.takt.melden(punkt, performance.now());
    if (senden) return zeigerSenden(senden);
    if (zeigerLage.timer) return;
    zeigerLage.timer = setTimeout(() => {
      zeigerLage.timer = 0;
      const nach = zeigerLage.takt.nachreichen(performance.now());
      if (nach && !zeigerLage.weg) zeigerSenden(nach);
    }, warte);
  }
  function zeigerWeg() {
    if (zeigerLage.weg) return;
    zeigerLage.weg = true;
    zeigerSenden({ weg:true });
  }
  function zeigerEbene() {
    if (zeigerLage.ebene) return zeigerLage.ebene;
    const ebene = document.createElement("div");
    ebene.id = "lernflaecheZeiger";
    ebene.setAttribute("aria-hidden", "true");
    Object.assign(ebene.style, { position:"fixed", inset:"0", pointerEvents:"none", zIndex:"2147482000", overflow:"hidden" });
    document.body.append(ebene);
    return (zeigerLage.ebene = ebene);
  }
  // Der Name nur als Text. Kein innerHTML und kein style-Attribut: die CSP der Flaeche verbietet
  // Inline-Stile, erlaubt sind nur Stile ueber das style-Objekt.
  function zeigerElement(autor) {
    const farbe = gruppeKern.zeigerFarbe(autor), el = document.createElement("div");
    Object.assign(el.style, { position:"absolute", left:"0", top:"0", willChange:"transform", display:"none", transition:"transform 70ms linear" });
    const SVG_NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(SVG_NS, "svg"), pfad = document.createElementNS(SVG_NS, "path");
    for (const [k, v] of [["width", "18"], ["height", "22"], ["viewBox", "0 0 18 22"]]) svg.setAttribute(k, v);
    Object.assign(svg.style, { display:"block", filter:"drop-shadow(0 1px 2px rgba(0,0,0,.35))" });
    const pfeil = [["d", "M1 1 L1 17 L5.5 13 L8.5 20.5 L11.5 19.2 L8.6 12 L15 12 Z"], ["fill", farbe], ["stroke", "#fff"], ["stroke-width", "1.5"], ["stroke-linejoin", "round"]];
    for (const [k, v] of pfeil) pfad.setAttribute(k, v);
    svg.append(pfad);
    el.append(svg);
    const name = document.createElement("span");
    name.textContent = gruppeName(autor);
    Object.assign(name.style, { position:"absolute", left:"14px", top:"18px", padding:"2px 7px", borderRadius:"6px", background:farbe, color:"#fff", font:"600 12px/1.3 system-ui, sans-serif", whiteSpace:"nowrap" });
    el.append(name);
    zeigerEbene().append(el);
    return { el, name };
  }
  // Solange fremde Zeiger da sind, folgt die Ebene jedem Bild: Verschieben und Zoomen gehen mit.
  function zeigerPlatzieren() {
    zeigerLage.raf = 0;
    if (!zeigerLage.fremd.size) return;
    const { rect, clientScaleX, clientScaleY } = canvasViewportMetrics();
    // PenEchos Seitenzoom (html zoom 90/110/125 %): Client-Koordinaten sind gezoomt, die px der
    // Ebene werden noch einmal gezoomt. Der Faktor wird an der Ebene gemessen (Chrome wie Safari).
    const ebene = zeigerEbene(), breite = ebene.offsetWidth;
    const zoom = breite > 0 ? ebene.getBoundingClientRect().width / breite || 1 : 1;
    for (const z of zeigerLage.fremd.values()) {
      const cx = rect.left + (state.panX + z.x * state.scale) / clientScaleX, cy = rect.top + (state.panY + z.y * state.scale) / clientScaleY;
      const sichtbar = cx >= rect.left && cy >= rect.top && cx <= rect.right && cy <= rect.bottom;
      z.el.style.display = sichtbar ? "block" : "none";
      if (sichtbar) z.el.style.transform = `translate(${Math.round((cx - 1) / zoom)}px, ${Math.round((cy - 1) / zoom)}px)`;
    }
    zeigerLage.raf = requestAnimationFrame(zeigerPlatzieren);
  }
  function zeigerEntfernen(autor) {
    const z = zeigerLage.fremd.get(autor);
    if (!z) return;
    z.el.remove();
    zeigerLage.fremd.delete(autor);
  }
  function zeigerEmpfangen(m) {
    if (!gruppeKern.istZeigerMeldung(m) || m.autor === gruppeZiel.person) return;
    if (m.weg) return zeigerEntfernen(m.autor);
    let z = zeigerLage.fremd.get(m.autor);
    if (!z) zeigerLage.fremd.set(m.autor, (z = { ...zeigerElement(m.autor), x:0, y:0 }));
    z.x = m.x;
    z.y = m.y;
    if (!zeigerLage.raf) zeigerLage.raf = requestAnimationFrame(zeigerPlatzieren);
  }
  function anwesendEmpfangen(m) {
    if (!Array.isArray(m.personen)) return;
    const personen = m.personen.filter(p => typeof p === "string" && gruppeKern.KENNUNG.test(p)).slice(0, 50);
    for (const autor of [...zeigerLage.fremd.keys()]) if (!personen.includes(autor)) zeigerEntfernen(autor);
    zeigerLage.anwesend = personen;
    zeigerLage.namen = m.namen && typeof m.namen === "object" && !Array.isArray(m.namen) ? m.namen : {};
    for (const [autor, z] of zeigerLage.fremd) z.name.textContent = gruppeName(autor);
    liveStricheBehalten(personen);
    anwesendZeigen();
  }
  function anwesendZeigen() {
    let liste = zeigerLage.liste;
    if (!liste) {
      liste = zeigerLage.liste = document.createElement("div");
      liste.id = "lernflaecheAnwesend";
      liste.setAttribute("aria-live", "polite");
      Object.assign(liste.style, {
        // Lage setzt anwesendPlatzieren (links unten): rechts oben liegt die Leiste der Huelle (Speichern, Abgeben).
        position:"fixed", zIndex:"2147482500", display:"flex", flexWrap:"wrap", gap:"6px 10px", alignItems:"center",
        boxSizing:"border-box", padding:"6px 10px", borderRadius:"10px", pointerEvents:"none",
        background:"rgba(32,38,48,.88)", color:"#fff", font:"500 13px/1.3 system-ui, sans-serif", boxShadow:"0 4px 16px rgba(0,0,0,.2)",
      });
      document.body.append(liste);
      addEventListener("resize", anwesendNachGroesse, { passive:true });
    }
    liste.style.display = zeigerLage.anwesend.length ? "flex" : "none"; // hidden allein schlaegt das gesetzte display nicht
    anwesendPlatzieren();
    const titel = document.createElement("span");
    titel.textContent = "In der Gruppe:";
    titel.style.opacity = ".75";
    const eintraege = zeigerLage.anwesend.map(p => {
      const e = document.createElement("span"), punkt = document.createElement("span");
      Object.assign(punkt.style, { display:"inline-block", width:"9px", height:"9px", borderRadius:"50%", marginRight:"5px", background:gruppeKern.zeigerFarbe(p), boxShadow:"0 0 0 1.5px #fff" });
      e.append(punkt, p === gruppeZiel.person ? `${gruppeName(p)} (Sie)` : gruppeName(p));
      return e;
    });
    liste.replaceChildren(titel, ...eintraege);
  }
  // Links unten ueber PenEchos Zoom-Knoepfen; bei jeder Groessenaenderung neu (schmal ordnet PenEcho seine Leisten um).
  function anwesendPlatzieren() {
    const liste = zeigerLage.liste;
    if (!liste || liste.style.display === "none") return;
    const flaeche = document.querySelector("#viewport")?.getBoundingClientRect() ?? null;
    // Schmal blendet PenEcho die Zoom-Leiste aus und zeigt "Alles einpassen" allein: beide zaehlen, vereinigt.
    let zoom = null;
    for (const el of document.querySelectorAll("#canvasZoomControls, #canvasFitContents")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const l = Math.min(zoom?.left ?? r.left, r.left), t = Math.min(zoom?.top ?? r.top, r.top);
      const rr = Math.max(zoom?.right ?? r.right, r.right), u = Math.max(zoom?.bottom ?? r.bottom, r.bottom);
      zoom = { left:l, top:t, right:rr, bottom:u, width:rr - l, height:u - t };
    }
    const lage = gruppeKern.anwesendLage({ breite:innerWidth, hoehe:innerHeight }, flaeche, zoom);
    Object.assign(liste.style, { left:`${lage.left}px`, bottom:`${lage.bottom}px`, maxWidth:`${lage.maxWidth}px` });
  }
  // PenEchos Leisten gleiten nach einer Groessenaenderung noch an ihren Platz: sofort und nach dem Uebergang messen.
  let anwesendGroesseTimer = 0;
  function anwesendNachGroesse() {
    anwesendPlatzieren();
    clearTimeout(anwesendGroesseTimer);
    anwesendGroesseTimer = setTimeout(anwesendPlatzieren, 400);
  }
  function zeigerAlleWeg() {
    for (const autor of [...zeigerLage.fremd.keys()]) zeigerEntfernen(autor);
    zeigerLage.anwesend = [];
    if (zeigerLage.liste) zeigerLage.liste.style.display = "none";
  }

  // Live-Striche: der eigene Strich geht waehrend des Zeichnens gebuendelt raus (LiveSender: hoechstens alle 50 ms, jede
  // Nachricht traegt die Punkte der vorigen mit, weil der Dienst zu schnelle verwirft), fremde malt eine eigene
  // Ueberlagerung. Sie ist fluechtig: nie gespeichert, nie im Verlauf, nie in einer Aufnahme (die nimmt nur tiles,
  // fremde Ebenen und Objekte kommen dort nicht vor).
  const liveLage = { fremd:gruppeKern.liveStriche(), ebene:null, raf:0, gemalt:false, timer:0, zaehler:0, sitzung:Math.random().toString(36).slice(2, 8) };
  function liveSenden(nachricht) {
    const ws = gruppeLage.ws;
    if (!ws || !gruppeLage.offen || !gruppeLage.beantwortet || gruppeLage.beendet || ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify(nachricht)); } catch {}
  }
  function liveTakt(sender) {
    liveLage.timer = 0;
    const m = sender.abholen(performance.now());
    if (m) return liveSenden(m);
    if (sender.offen) liveLage.timer = setTimeout(() => liveTakt(sender), sender.warte(performance.now()) + 2);
  }
  // Haken aus appendLiveInkSample (canvas-runtime.js): jeder Punkt eines eigenen Tintenstrichs.
  function gruppeLivePunkt(drawing, point, size) {
    if (!gruppeAktiv() || gruppeLage.beendet || drawing.erase) return;
    let sender = drawing.gruppeLive;
    if (!sender) {
      const farbe = typeof drawing.color === "string" && /^[#a-zA-Z0-9(),.%\s-]{1,32}$/.test(drawing.color) ? drawing.color : "#1f2937";
      sender = drawing.gruppeLive = new gruppeKern.LiveSender(`${liveLage.sitzung}-${(++liveLage.zaehler).toString(36)}`, farbe, size);
    }
    sender.punkt(point.x, point.y, size);
    if (!liveLage.timer) liveTakt(sender);
  }
  // Haken aus finishDrawing (ai-runtime.js): das Absetzen, nie gedrosselt.
  function gruppeLiveEnde(drawing) {
    const sender = drawing?.gruppeLive;
    if (!sender) return;
    clearTimeout(liveLage.timer);
    liveLage.timer = 0;
    const m = sender.abholen(performance.now(), true);
    if (m) liveSenden(m);
  }
  function liveEmpfangen(m) {
    if (m?.autor === gruppeZiel.person) return;
    if (liveLage.fremd.aufnehmen(m, performance.now())) liveZeichnenPlanen();
  }
  // Die Kachel des Autors ist da: seine fertigen Live-Striche stecken jetzt in der Ebene.
  function liveKachelDa(autor) {
    if (liveLage.fremd.entfernenAutor(autor, true).length) liveZeichnenPlanen();
  }
  function liveStricheBehalten(personen) {
    let weg = 0;
    for (const s of liveLage.fremd.alle()) if (!personen.includes(s.autor)) weg += liveLage.fremd.entfernenAutor(s.autor).length;
    if (weg) liveZeichnenPlanen();
  }
  function liveFremdeWeg() {
    liveLage.fremd.leeren();
    liveZeichnenPlanen();
  }
  function liveEbene() {
    if (liveLage.ebene) return liveLage.ebene;
    const c = document.createElement("canvas");
    c.id = "lernflaecheLive";
    c.setAttribute("aria-hidden", "true");
    Object.assign(c.style, { position:"fixed", inset:"0", width:"100%", height:"100%", pointerEvents:"none", zIndex:"2147481000" });
    document.body.append(c);
    return (liveLage.ebene = c);
  }
  function liveZeichnenPlanen() {
    if (!liveLage.raf) liveLage.raf = requestAnimationFrame(liveZeichnen);
  }
  // Solange Striche da sind, folgt die Ueberlagerung jedem Bild (Verschieben und Zoomen gehen mit) und raeumt Verfallenes auf.
  function liveZeichnen() {
    liveLage.raf = 0;
    liveLage.fremd.aufraeumen(performance.now());
    const striche = liveLage.fremd.alle();
    if (!striche.length && !liveLage.gemalt) return;
    const c = liveEbene(), dpr = devicePixelRatio || 1;
    const breite = Math.max(1, Math.round(innerWidth * dpr)), hoehe = Math.max(1, Math.round(innerHeight * dpr));
    if (c.width !== breite || c.height !== hoehe) { c.width = breite; c.height = hoehe; }
    const g = c.getContext("2d"), cr = c.getBoundingClientRect(), k = cr.width > 0 ? c.width / cr.width : dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    liveLage.gemalt = false;
    if (striche.length) {
      const { rect, clientScaleX, clientScaleY } = canvasViewportMetrics();
      g.setTransform(k, 0, 0, k, -cr.left * k, -cr.top * k);
      g.beginPath();
      g.rect(rect.left, rect.top, rect.width, rect.height);
      g.clip();
      g.lineCap = g.lineJoin = "round";
      const bildschirm = (x, y) => [rect.left + (state.panX + x * state.scale) / clientScaleX, rect.top + (state.panY + y * state.scale) / clientScaleY];
      for (const s of striche) {
        g.strokeStyle = s.farbe;
        g.fillStyle = s.farbe;
        const breiteVon = d => Math.max(2 / k, (d || s.staerke) * state.scale / clientScaleX);
        let [ax, ay] = bildschirm(s.punkte[0][0], s.punkte[0][1]);
        if (s.punkte.length === 1) {
          g.beginPath();
          g.arc(ax, ay, breiteVon(s.punkte[0][2]) / 2, 0, Math.PI * 2);
          g.fill();
        }
        for (let i = 1; i < s.punkte.length; i++) {
          const [bx, by] = bildschirm(s.punkte[i][0], s.punkte[i][1]);
          g.lineWidth = breiteVon(s.punkte[i][2]);
          g.beginPath();
          g.moveTo(ax, ay);
          g.lineTo(bx, by);
          g.stroke();
          ax = bx;
          ay = by;
        }
        liveLage.gemalt = true;
      }
    }
    if (striche.length) liveZeichnenPlanen();
  }

  // Protokoll-, nicht Pixelgleichheit: gehasht werden die zuletzt gesendeten/empfangenen PNGs.
  async function gruppeFingerabdruck() {
    gruppeShaVerfuegbar();
    const liste = [];
    if (gruppeAktiv()) for (const [kachel, png] of gruppeLage.eigen) liste.push({ autor:gruppeZiel.person, kachel, png });
    for (const [id, png] of gruppeLage.fremdPng) {
      const [autor, kachel] = id.split("|");
      liste.push({ autor, kachel, png });
    }
    for (const e of liste) e.hash = await gruppeSha256(gruppeBytes(e.png));
    return gruppeSha256(new TextEncoder().encode(gruppeKern.fingerabdruckText(liste)));
  }
  window.LernflaecheGruppe = Object.freeze({
    aktiv:gruppeAktiv(),
    fingerabdruck:gruppeFingerabdruck,
    // Nur lesend (Probe, Fehlersuche): Ids der eigenen und "autor|id" der fremden Objekte.
    objekte:() => {
      const alle = [...state.textBoxes, ...state.images, ...state.widgets];
      return {
        eigen:alle.filter(item => !gruppeObjektFremd(item)).map(item => item.id),
        fremd:alle.filter(gruppeObjektFremd).map(item => `${item.gruppeAutor}|${item.gruppeId}`),
        unbestaetigt:gruppeLage.objAusstehend.groesse,
      };
    },
    verbunden:() => Boolean(gruppeLage.ws && gruppeLage.offen && gruppeLage.standDa && gruppeLage.bereit && !gruppeLage.beendet),
  });
  if (gruppeAktiv()) {
    // Gruppen-Sperren: Bibliothek, Beispiele, "Neue Flaeche" und das Start-Overlay gibt es hier nicht (Klasse fuer
    // style.css; die Wege selbst sind in persistence.js, example-canvases.js und studio-navigator.js gesperrt).
    document.documentElement.classList.add("lernflaeche-gruppe");
    liveEbene(); // die Ueberlagerung fuer fremde Live-Striche gibt es von Anfang an (leer)
    // Im Gruppenmodus gibt es keinen lokalen Entwurf: solange Kacheln unbestaetigt sind, fragt der Browser nach.
    addEventListener("beforeunload", event => {
      if (gruppeLage.beendet || (!gruppeLage.ausstehend.groesse && !gruppeLage.objAusstehend.groesse && !gruppeLage.schmutzig.size)) return;
      event.preventDefault();
      event.returnValue = true; // aeltere Chromium-Versionen fragen nur damit nach
    });
    addEventListener("pointermove", zeigerBewegt, { capture:true, passive:true });
    document.documentElement.addEventListener("pointerleave", zeigerWeg);
    addEventListener("blur", zeigerWeg);
    document.addEventListener("visibilitychange", () => { if (document.hidden) zeigerWeg(); });
    setTimeout(() => {
      if (!gruppeLage.bereit) gruppeHinweis(GRUPPE_LAEDT, "laden");
      gruppeVerbinden();
    }, 0);
  } else if (new URLSearchParams(location.search).has("gruppe")) {
    setTimeout(() => gruppeHinweis("Ungültiger Gruppenlink: gruppe und person dürfen nur a–z, 0–9 und - enthalten (höchstens 40 Zeichen). Diese Fläche ist nicht geteilt."), 0);
  }
