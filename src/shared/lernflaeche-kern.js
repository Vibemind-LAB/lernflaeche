"use strict";
// Lernflaeche: reine Regeln der Lernflaeche (ohne DOM, testbar). Unter Node per require, im Browser als Global
// LernflaecheKern; gruppe-kern.js wird im Bundle vorher geladen.
var LernflaecheKern = (() => {
  const gruppeKern = typeof module === "object" && module.exports ? require("./gruppe-kern.js") : LernflaecheGruppeKern;

  // Lernmodus: nur "?lernen=1" oder eine gueltige Gruppe (Gruppe heisst immer Lernende).
  function lernmodusAktiv(search) {
    if (gruppeKern.gruppeAusUrl(search)) return true;
    try { return new URLSearchParams(typeof search === "string" ? search : "").get("lernen") === "1"; } catch { return false; }
  }

  // Lernmodus spricht Deutsch (A2, Befund 7): Werkzeugleiste, Entwurfsablauf und Statusmeldungen; Schluessel wie in
  // I18N.en (core.js), Platzhalter wie {delay} bleiben gleich. Einstellungen, Agent und MCP-Einrichtung bleiben englisch.
  const LERN_DE = Object.freeze({
    title: "Lernfläche | Handschriftliche KI-Fläche",
    canvas: "Zoombare Fläche für Handschrift mit KI",
    shareCanvasAction: "Teilen",
    shareCanvasCloud: "Fläche teilen",
    canvasMoreActions: "Weitere Aktionen",
    openPenEchoCloud: "Lernfläche-Cloud öffnen",
    settingsTitle: "Einstellungen",
    settingsAISection: "KI",
    aiTools: "KI-Werkzeuge",
    autoAI: "Automatische KI",
    autoEnabled: "Auto ({delay} s)",
    autoDisabled: "KI von Hand",
    triggerAutoAI: "KI jetzt ausführen",
    reasoningEffort: "Denkaufwand",
    reasoningEffortDisplay: "Denkaufwand ({level})",
    effortConfigured: "Vorgabe",
    effortConfiguredShort: "Vorg.",
    aiColor: "KI-Farbe",
    enterCanvasViewMode: "Nur ansehen",
    hand: "Hand: Fläche verschieben (H)",
    pen: "Stift",
    eraser: "Radierer",
    lassoToolPurpose: "Lasso · etwas einkreisen, dann Lösen, Zeichnen, Animieren oder Fragen (V)",
    text: "Texteingabe",
    textConfirm: "Text übernehmen",
    textCancel: "Text verwerfen",
    assistTools: "Formen, Graph und Werkzeuge",
    addImage: "Bild oder Foto einfügen",
    penSize: "Stiftstärke",
    inkColor: "Tintenfarbe",
    undo: "Rückgängig",
    redo: "Wiederholen",
    clear: "Leeren",
    hint: "Hinweis",
    explain: "Erklären",
    plot: "Zeichnen",
    canvasAgent: "Lernfläche-Assistent",
    canvasAgentShort: "Assistent",
    openCanvasAgent: "Lernfläche-Assistent öffnen",
    canvasAgentResizeLeft: "Breite des Assistenten am linken Rand ändern",
    canvasAgentThinkingOff: "Aus",
    canvasNavigationActions: "Navigation auf der Fläche",
    canvasZoomOut: "Verkleinern",
    canvasZoomReset: "Auf 100 % zoomen",
    canvasZoomIn: "Vergrößern",
    canvasFitContents: "Alles einpassen",
    canvasLockNavigation: "Navigation sperren",
    tip: "Verschieben: zwei Finger, Hand oder Leertaste + Ziehen · Zoomen: zwei Finger spreizen oder Strg + Mausrad",
    aiBusy: "Die KI arbeitet. Bitte warten Sie kurz.",
    aiError: "KI: ",
    draftRejected: "KI-Entwurf verworfen",
    draftFading: "Sie schreiben weiter; der KI-Entwurf wird ausgeblendet",
    draftReady: "Ziehen Sie den KI-Entwurf, um ihn zu verschieben; mit den Griffen ändern Sie die Größe",
    batchDraftReady: "Alle übernehmen oder verwerfen",
    itemAccepted: "KI-Element übernommen; die übrigen Entwürfe bleiben bearbeitbar",
    itemDiscarded: "KI-Element verworfen; die übrigen Entwürfe bleiben bearbeitbar",
    acceptBatch: "Alle KI-Entwürfe übernehmen",
    rejectBatch: "Alle KI-Entwürfe verwerfen",
    pendingConfirm: "Bitte übernehmen oder verwerfen Sie zuerst den aktuellen KI-Entwurf",
    handDraftConfirmedHint: "KI-Ergebnis übernommen · Die automatische KI pausiert im Hand-Modus.",
    assistAsk: "Fragen",
    assistAskPlaceholder: "Fragen Sie dazu …",
    assistSend: "Senden",
    assistAsking: "Ihre Frage wird beantwortet",
    assistStop: "Anhalten",
    assistKeep: "Behalten",
    assistRetry: "Neu versuchen",
    assistNext: "Weiter:",
    assistDone: "Fertig",
    // Live 09.11.: diese Knoepfe und Meldungen standen im Lernmodus noch englisch da.
    answer: "Antworten",
    selectionTypeset: "Sauber setzen",
    cancel: "Abbrechen",
    selectionCancel: "Abbrechen",
    selectionDelete: "Löschen",
    selectionDownload: "Bild herunterladen",
    widgetAccept: "Übernehmen",
    copyText: "Inhalt kopieren",
    textCopyFailed: "Der Inhalt ließ sich nicht kopieren",
    smartSuggestDismiss: "Vorschläge ausblenden",
    aiCancelled: "KI-Anfrage abgebrochen",
    snapshotSaved: "Stand der Fläche gespeichert",
    saveCanvas: "Fläche speichern",
    boardTools: "Werkzeuge der Fläche",
    assistGraph: "Funktionsgraph",
    assistGraph3d: "3D-Funktionsgraph",
    snapshotOverwritten: "Stand der Fläche überschrieben",
    snapshotSaving: "Fläche wird gespeichert …",
    snapshotSavingShort: "Speichert …",
    effortNone: "Keine",
    effortLow: "Niedrig",
    effortMedium: "Mittel",
    effortMediumShort: "Mittel",
    effortHigh: "Hoch",
    // Abnahme C, Befund 2: Statusleiste (setStatusKey, Hinweise im Hand-Modus) stand im Lernmodus noch englisch.
    ready: "Bereit",
    observing: "Beobachte …",
    writing: "Schreibt …",
    aiDone: "KI fertig",
    aiPreparingCanvas: "Fläche wird vorbereitet …",
    aiSendingRequest: "Anfrage wird gesendet …",
    aiCancelledForInput: "KI-Anfrage abgebrochen, weil Sie weitergeschrieben haben",
    aiNoVisibleResponse: "Die KI hat nichts Darstellbares geliefert. Bitte versuchen Sie es erneut oder formulieren Sie die Anfrage anders.",
    aiRequestSuperseded: "Eine neuere Anfrage hat diese KI-Anfrage ersetzt. Ihre Eingabe bleibt erhalten; versuchen Sie es erneut, falls Sie das Ergebnis noch brauchen.",
    aiWidgetChanged: "Dieses Element wurde geändert, während die KI arbeitete. Ihre Eingabe bleibt erhalten; versuchen Sie es erneut, um sie auf den neuesten Stand anzuwenden.",
    deferred: "Die Eingabe auf der Fläche hat sich geändert; dieses KI-Ergebnis wurde zurückgestellt",
    canvasChanged: "Die Fläche hat sich geändert; der alte KI-Entwurf wurde verworfen",
    merged: "KI-Ergebnis übernommen",
    autoToolboxPending: "Automatische KI pausiert: Schließen Sie die offene Werkzeugleiste oder starten Sie die KI von Hand",
    canvasAgentAutoAIFocusPaused: "Automatische KI pausiert, solange der Assistent offen ist",
    canvasAgentExternalAIPaused: "Externes Gespräch gewählt · Die automatische KI der Fläche pausiert. Rückmeldungen bleiben für die externe KI erhalten.",
    canvasAgentChooseConnection: "KI-Verbindung wählen",
    handAutoAIManual: "Im Hand-Modus pausiert die automatische KI · Mit dem KI-Knopf starten Sie sie von Hand.",
    handAutoAIResume: "Die automatische KI läuft weiter, sobald Sie den Hand-Modus verlassen.",
    handWidgetConfirmedHint: "Element übernommen · Tippen Sie es erneut an, um seine Bedienelemente zu zeigen.",
    handImageConfirmedHint: "Als verschiebbares Bild platziert · Es bleibt von der Fläche getrennt und lässt sich wieder verschieben.",
    handImageMergedHint: "In die Fläche übernommen · Der Radierer kann es entfernen, als Bild verschieben lässt es sich nicht mehr.",
    handAnimationConfirmedHint: "Animation übernommen · Tippen Sie sie erneut an, um sie zu verschieben, die Größe zu ändern oder abzuspielen.",
    handTextConfirmedHint: "Text übernommen · Tippen Sie ihn erneut an, um ihn zu bearbeiten, zu verschieben oder die Größe zu ändern.",
    animationSelected: "Animation bearbeiten: oben ziehen zum Verschieben, an Kanten oder Ecken die Größe ändern, dann übernehmen oder abbrechen",
    animationDeleted: "Animation gelöscht",
    imageSelected: "Bild bearbeiten: an der oberen Leiste ziehen zum Verschieben, an den Kanten die Größe ändern",
    imagePlaced: "Als verschiebbares Bild platziert · Es bleibt von der Fläche getrennt und lässt sich wieder verschieben",
    imageMerged: "In die Fläche übernommen · Der Radierer kann es entfernen, als Bild verschieben lässt es sich nicht mehr",
    imageLoading: "Bild wird vorbereitet …",
    imageAdded: "Bild eingefügt",
    imageDeleted: "Bild gelöscht",
    imageImportFailed: "Das Bild ließ sich nicht einfügen",
    imageLimitReached: "Höchstzahl an Bildern erreicht (100). Löschen Sie ein Bild, bevor Sie ein neues einfügen.",
    widgetDeleted: "Element gelöscht",
    widgetDownloading: "Bild des Elements wird vorbereitet …",
    widgetDownloaded: "Bild des Elements heruntergeladen",
    widgetExportFailed: "Ein Live-Element ließ sich nicht erfassen. Warten Sie, bis es geladen ist, und versuchen Sie es erneut.",
    widgetLimitReached: "Höchstzahl an Live-Elementen erreicht (100). Löschen Sie ein Element, bevor Sie ein neues einfügen.",
    widgetRefinePending: "Neue Striche neben diesem Element erkannt. Mit „Anpassen“ übernehmen Sie sie. Die automatische KI pausiert.",
    widgetRefining: "Die KI passt dieses Element an",
    widgetSourceCopied: "Quelltext des Elements kopiert",
    widgetSourceCopyFailed: "Der Quelltext des Elements ließ sich nicht kopieren",
    textCopied: "Kopiert",
    textEmpty: "Geben Sie zuerst Text ein",
    textMixedModeError: "Die gemischte Formatierung war nicht verfügbar; reiner Text wurde eingefügt",
    emptyCanvas: "Die Fläche ist leer",
    exportComplete: "PNG exportiert",
    snapshotLoaded: "Stand der Fläche geladen",
    snapshotDeleted: "Stand der Fläche gelöscht",
    newCanvasReady: "Neue Fläche bereit",
    areaEraseDeleted: "Tinte im gewählten Bereich gelöscht",
    areaEraseTooSmall: "Ziehen Sie zum Radieren einen größeren Bereich auf",
    selectionTooSmall: "Ziehen Sie ein größeres, geschlossenes Lasso um den gewünschten Bereich",
    selectionReady: "Verschieben Sie den gewählten Lasso-Bereich oder ändern Sie seine Größe",
    selectionCancelled: "Auswahl abgebrochen",
    selectionCommitted: "Auswahl geschlossen",
    selectionRecolored: "Farbe der Auswahl geändert",
    selectionDeleted: "Gewählter Bereich gelöscht",
    selectionEmpty: "Der gewählte Bereich ließ sich nicht erfassen",
    selectionTypesetting: "Auswahl wird sauber gesetzt …",
    smartShapesSnapped: "Formen geglättet. „Rückgängig“ stellt die Skizze wieder her.",
    assistGraphInserted: "Graph eingefügt. Tippen Sie ihn an, um eine Funktion einzugeben; Buchstaben werden zu Schiebereglern.",
    outsideCanvas: "Das liegt außerhalb der Fläche. Schreiben Sie auf das Papier.",
    clipboardReading: "Zwischenablage wird gelesen …",
    clipboardTextAdded: "Text aus der Zwischenablage eingefügt. Verschieben Sie das Textfeld oder ändern Sie seine Größe, dann übernehmen Sie es.",
    clipboardUnsupported: "Dieses Format der Zwischenablage wird nicht unterstützt. Kopieren Sie reinen Text oder ein Bild.",
    clipboardReadFailed: "Die Zwischenablage ließ sich nicht lesen. Erlauben Sie den Zugriff oder nutzen Sie Strg/Cmd + V.",
    // Hinweiszeile ueber der Werkzeugleiste (showCanvasHint, ab Werk an).
    canvasHintWidgetAdded: "Fahren Sie über das Element: direkt bedienen oder mit „Anpassen“ Vorschläge öffnen.",
    canvasHintWidgetFullscreen: "Doppelklicken Sie auf ein Element, um es zu maximieren.",
    canvasHintWidgetInline: "Doppelklicken Sie auf ein Element, um es zu bedienen.",
    canvasHintShortcutAgent: "{shortcut} Assistent öffnen oder schließen",
    canvasHintShortcutSave: "{shortcut} Fläche speichern",
    canvasHintShortcutUndoRedo: "{undo} Rückgängig · {redo} Wiederholen",
    canvasHintShortcutLibrary: "{shortcut} Flächensammlung öffnen",
    canvasHintShortcutFullscreen: "{shortcut} Vollbild ein oder aus",
    canvasHintShortcutSettings: "{shortcut} Einstellungen öffnen",
    canvasHintMcp: "Einstellungen → MCP: eine KI verbinden.",
    canvasHintGuestAi: "Zeichnen Sie frei. Für die KI melden Sie sich bitte an.",
    canvasHintMcpConnected: "MCP verbunden: Die KI kann diese Fläche bearbeiten.",
    canvasHintHand: "Ziehen zum Verschieben · ein Objekt anklicken zum Auswählen",
    canvasHintHandAlt: "{shortcut} gedrückt halten, um kurz zu verschieben",
    canvasHintWidgetTouchHand: "Stift: doppelt tippen zum Bedienen. Hand: „Bedienen“ wählen.",
    canvasHintLasso: "Kreisen Sie einen Bereich ein, auch einen Teil eines Elements, um mit seinem Bild zu arbeiten.",
    canvasHintLassoFirstUse: "Kreisen Sie den gewünschten Teil ein und wählen Sie dann Lösen, Zeichnen, Notiz, eine andere Aktion oder Fragen.",
    canvasHintLassoFirstUseCompact: "Inhalt einkreisen, dann eine Aktion wählen.",
    canvasHintLassoDiscover: "Kreisen Sie etwas ein, dann Lösen, Zeichnen, Animieren, als Notiz sichern oder Fragen · Handschrift, Bilder, Elemente.",
    canvasHintLassoDiscoverCompact: "Etwas einkreisen und die KI damit arbeiten lassen.",
    canvasHintLassoNudge: "Probieren Sie das Lasso {shortcut}: einen Teil einkreisen zum Lösen, Zeichnen, Animieren oder als Notiz sichern.",
    canvasHintLassoNudgeCompact: "Lasso {shortcut}: einkreisen, dann die KI arbeiten lassen.",
    canvasHintLassoCaptured: "Wählen Sie unten eine Aktion oder ziehen Sie zum Verschieben. Tipp: Mit gedrückter Seitentaste des Stifts kreisen Sie aus jedem Werkzeug ein.",
    canvasHintLassoCapturedCompact: "Aktion wählen oder zum Verschieben ziehen.",
    canvasHintLassoAlt: "Gewählten Inhalt verschieben oder in der Größe ändern. Elemente bleiben an ihrem Platz.",
    canvasHintText: "Markdown/LaTeX; mit Strg/Cmd + Enter übernehmen.",
    canvasHintTextAlt: "Klicken Sie auf die Fläche, um Text einzufügen.",
    canvasHintEraser: "Der Radierer entfernt Tinte; Objekte wählen Sie zum Löschen mit der Hand aus.",
    canvasHintEraserAlt: "KI-Striche radieren, ohne Elemente zu verändern.",
    canvasHintAreaEraser: "Ziehen Sie ein Rechteck auf, um die Tinte darin zu radieren.",
    canvasHintAreaEraserAlt: "Der Flächenradierer wirkt nur auf Tinte.",
    widgetInteractShort: "Bedienen",
    widgetInteract: "Element bedienen",
  });
  // Vorschlagsaktionen der Hilfsleiste (public/smart-suggest.js hat nur englisch/chinesisch), je Aktions-ID.
  const LERN_DE_AKTION = Object.freeze({
    refine: "Anpassen", plot: "Funktion zeichnen", typeset: "Sauber setzen", solve: "Lösen", check_step: "Prüfen",
    next_step: "Nächster Schritt", hint: "Hinweis", practice: "Übungsaufgabe", snap_shapes: "Formen glätten",
    diagram: "Diagramm erstellen", prototype: "Prototyp bauen", organize: "Notizen ordnen", answer: "Antworten",
    create_visual: "Bild erstellen", explain: "Erklären", animate: "Mit Animation erklären",
    finish_drawing: "Zeichnung ergänzen", vivid: "Als Illustration", animate_sketch: "Skizze bewegen",
    note: "Als Notiz sichern",
  });
  // Feste Fenstertexte ohne I18N-Schluessel (canvasCompanionCopy, canvasDocumentsCopy, Notizsammlung).
  const LERN_DE_FEST = Object.freeze({
    "Canvas tools": "Werkzeuge", "Canvases have new updates": "Es gibt neue Änderungen", "Notes library": "Notizsammlung",
  });
  // MCP-Knopf der Werkzeugleiste (mcpUiText liefert englisch/chinesisch): nur die Kurztexte, die dort zu sehen sind.
  const LERN_DE_MCP = Object.freeze({
    "Off": "Aus", "Online": "Verbunden", "Offline": "Getrennt", "Connecting…": "Verbinde …", "Retrying…": "Neuer Versuch …",
    "Sign in": "Anmelden", "updating…": "aktualisiert …", "MCP connection details": "MCP-Verbindung",
    "Discoverable · AI can connect": "Bereit · die Lernhilfe ist verbunden", "Not discoverable": "Nicht bereit",
    // Teil B: dieselbe Flaechen-Kennung in einem zweiten Tab (dupliziert); der neue Tab hat uebernommen.
    "This canvas is connected in another window. Continue there.":
      "Diese Fläche ist in einem anderen Fenster verbunden. Arbeiten Sie dort weiter.",
  });

  // KI-Schrift: Faktor auf die Schriftgroesse, die das Modell fuer write_text/draw_formula nennt.
  const KI_SCHRIFT_STUFEN = Object.freeze([0.5, 0.6, 0.7, 0.85, 1, 1.2]);
  const KI_SCHRIFT_GRUND = 0.7;
  const KI_SCHRIFT_SCHLUESSEL = "lernflaeche-ki-schrift";
  const KI_SCHRIFT_UNTERGRENZE = 16;

  // Eine Eingabe zaehlt als Stufe, wenn sie auf zwei Nachkommastellen gerundet einer Stufe gleicht.
  function kiSchriftGelesen(roh) {
    if (roh === null || roh === undefined || (typeof roh === "string" && roh.trim() === "")) return KI_SCHRIFT_GRUND;
    const zahl = Number(roh);
    if (!Number.isFinite(zahl)) return KI_SCHRIFT_GRUND;
    const gerundet = Math.round(zahl * 100) / 100;
    return KI_SCHRIFT_STUFEN.find((stufe) => stufe === gerundet) ?? KI_SCHRIFT_GRUND;
  }

  // Nachbarstufe in Richtung -1 (kleiner) oder 1 (groesser); am Rand dieselbe Stufe.
  function kiSchriftStufe(faktor, richtung) {
    const i = KI_SCHRIFT_STUFEN.indexOf(kiSchriftGelesen(faktor));
    const j = Math.max(0, Math.min(KI_SCHRIFT_STUFEN.length - 1, i + (richtung < 0 ? -1 : 1)));
    return KI_SCHRIFT_STUFEN[j];
  }

  function kiSchriftAnwenden(groesse, faktor) {
    return Math.max(KI_SCHRIFT_UNTERGRENZE, Math.round(groesse * faktor));
  }

  // Faktor fuer eine Anfrage: der Schriftsatz (normalize) setzt die eigene Handschrift und behaelt deren Groesse (M1);
  // jede andere Aktion schreibt mit der eingestellten Stufe.
  function kiSchriftFaktorFuer(aktion, stufe) {
    return aktion === "normalize" ? 1 : kiSchriftGelesen(stufe);
  }

  // Automatische KI beim Start: im Lernmodus an, ausser sie wurde ausdruecklich ausgeschaltet (gespeichert genau
  // "false"); sonst wie im Ursprungsprojekt nur, wenn sie eingeschaltet gespeichert ist.
  function autoKiStart(lernmodus, gespeichert) {
    return lernmodus ? gespeichert !== "false" : gespeichert === "true";
  }

  // Automatische KI beim Start fuer eine Seitenadresse: nur der Lernmodus allein schaltet sie von selbst ein. Auf der
  // Gruppenflaeche nicht (Ruling T8-d): jede eigene Eingabe kostete je Teilnehmer, und das Modell saehe nur die eigenen
  // Kacheln; ein ausdrueckliches An ("true") bleibt dort moeglich.
  function autoKiStartFuer(search, gespeichert) {
    return autoKiStart(lernmodusAktiv(search) && !gruppeKern.gruppeAusUrl(search), gespeichert);
  }

  // KI-Warteschlange: offene Eingabe zerfaellt in Bereiche; je Bereich eine automatische Anfrage, lesend sortiert.
  const KI_NAEHE = 240;

  function gueltigerKasten(k) {
    return !!k && [k.x, k.y, k.w, k.h].every(Number.isFinite) && k.w >= 0 && k.h >= 0;
  }

  // Abstand zweier Kaesten: groesste Luecke je Achse (0, wenn sie sich ueberlappen). Gleiche Form wie imKasten:
  // b liegt nah an a, wenn b den um "naehe" erweiterten Kasten a beruehrt.
  function kastenAbstand(a, b) {
    const dx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
    const dy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
    return Math.max(dx, dy);
  }

  function vereinige(a, b) {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
  }

  // Bereiche der Huelle (Vertrag Huelle <-> Lernflaeche): eine eigene Zeile in context.md,
  // "<!-- lernflaeche-bereiche: [[x,y,w,h],...] -->", Weltkoordinaten, hoechstens 60 Rechtecke.
  // create_text: ohne Bereich wie PenEcho fest 400 px (oder `width`); mit Bereich an dessen Breite, damit ein
  // breites Feld (Bewertungskarte der Lern-Huelle) mehr Text fasst. Begrenzt auf 200..1600 px.
  const TEXT_UMBRUCH_GRUND = 400;
  function textUmbruchBreite(args) {
    const a = args && typeof args === "object" ? args : {};
    const w = a.region && typeof a.region === "object" ? a.region.w : undefined;
    if (Number.isFinite(w)) return Math.min(1600, Math.max(200, Math.round(w)));
    return Number.isFinite(a.width) && a.width > 0 ? a.width : TEXT_UMBRUCH_GRUND;
  }

  const BEREICHE_MARKE = "lernflaeche-bereiche";
  const BEREICHE_HOECHSTENS = 60;
  const MARKEN_ANFANG = `<!-- ${BEREICHE_MARKE}:`;
  // Texte je Flaeche (sichtbare Textfelder, MCP-Kapazitaet, gespeicherter Stand); PenEcho hatte 50.
  const TEXTGRENZE = 200;

  function istMarkenzeile(zeile) {
    const t = zeile.trim();
    return t.startsWith(MARKEN_ANFANG) && t.endsWith("-->");
  }

  // Rechtecke der ersten Markenzeile. Fehlt sie, ist sie kaputt, hat sie mehr als 60 Eintraege, eine nicht
  // endliche Zahl oder w/h <= 0, dann [] (die Laufzeit gruppiert dann wie ohne Huelle).
  function bereicheAusKontext(text) {
    if (typeof text !== "string" || !text) return [];
    const zeile = text.split("\n").find(istMarkenzeile);
    if (!zeile) return [];
    const t = zeile.trim();
    let roh;
    try { roh = JSON.parse(t.slice(MARKEN_ANFANG.length, -3)); } catch { return []; }
    if (!Array.isArray(roh) || roh.length > BEREICHE_HOECHSTENS) return [];
    const bereiche = [];
    for (const r of roh) {
      if (!Array.isArray(r) || r.length !== 4 || !r.every((z) => typeof z === "number" && Number.isFinite(z)) || r[2] <= 0 || r[3] <= 0) return [];
      bereiche.push({ x: r[0], y: r[1], w: r[2], h: r[3] });
    }
    return bereiche;
  }

  // Der Kontext ohne Markenzeile(n): nur das geht an die KI.
  function kontextOhneBereiche(text) {
    if (typeof text !== "string") return "";
    return text.split("\n").filter((zeile) => !istMarkenzeile(zeile)).join("\n");
  }

  function gueltigeBereiche(bereiche) {
    return (Array.isArray(bereiche) ? bereiche : []).filter((b) => gueltigerKasten(b) && b.w > 0 && b.h > 0);
  }

  // Index des ersten Bereichs, in dem der Punkt liegt (Kanten halboffen: links/oben dazu, rechts/unten nicht), sonst -1.
  function bereichIndex(punkt, bereiche) {
    return bereiche.findIndex((b) => punkt.x >= b.x && punkt.x < b.x + b.w && punkt.y >= b.y && punkt.y < b.y + b.h);
  }

  function kastenBereich(k, bereiche) {
    return bereichIndex({ x: k.x + k.w / 2, y: k.y + k.h / 2 }, bereiche);
  }

  // Tintenmaske einer Kachel (RGBA-Daten, breite x hoehe Maskenpixel; kachel = ihr Rechteck in Weltkoordinaten) als
  // Weltkaesten: Ohne Bereich in der Kachel ein Kasten um alle deckenden Pixel (wie bisher je Kachel). Schneiden
  // Bereichskanten die Kachel, zerfaellt sie an diesen Kanten in Zellen; jedes Pixel zaehlt nach seiner Mitte (halboffen
  // wie bereichIndex). Teile desselben Bereichs werden vereinigt, Teile ausserhalb bleiben je Zelle einzeln: vereinigt
  // koennte ihre Mitte in einem Bereich liegen. Jeder Kasten hat so seine Mitte im eigenen Bereich (bzw. ausserhalb).
  function tintenKaesten(daten, breite, hoehe, kachel, bereiche = []) {
    if (!daten || !(breite > 0) || !(hoehe > 0) || !gueltigerKasten(kachel)) return [];
    const gueltig = gueltigeBereiche(bereiche), sx = kachel.w / breite, sy = kachel.h / hoehe;
    const schnitte = (anfang, laenge, kanten) => [...new Set(kanten)].filter((k) => k > anfang && k < anfang + laenge).sort((a, b) => a - b);
    const xs = schnitte(kachel.x, kachel.w, gueltig.flatMap((b) => [b.x, b.x + b.w]));
    const ys = schnitte(kachel.y, kachel.h, gueltig.flatMap((b) => [b.y, b.y + b.h]));
    const fach = (schnitt, wert) => { let i = 0; while (i < schnitt.length && wert >= schnitt[i]) i += 1; return i; };
    const spalte = Array.from({ length: breite }, (_, x) => fach(xs, kachel.x + (x + 0.5) * sx));
    const zellen = new Map();
    for (let y = 0; y < hoehe; y += 1) {
      const zeile = fach(ys, kachel.y + (y + 0.5) * sy);
      for (let x = 0; x < breite; x += 1) {
        if (!daten[(y * breite + x) * 4 + 3]) continue;
        const schluessel = zeile * (xs.length + 1) + spalte[x];
        const z = zellen.get(schluessel);
        if (z) { z.l = Math.min(z.l, x); z.r = Math.max(z.r, x); z.b = y; }
        else zellen.set(schluessel, { l: x, t: y, r: x, b: y,
          bereich: bereichIndex({ x: kachel.x + (x + 0.5) * sx, y: kachel.y + (y + 0.5) * sy }, gueltig) });
      }
    }
    const welt = (z) => ({ x: kachel.x + z.l * sx, y: kachel.y + z.t * sy, w: (z.r - z.l + 1) * sx, h: (z.b - z.t + 1) * sy });
    const jeBereich = new Map(), aussen = [];
    for (const z of zellen.values()) {
      if (z.bereich < 0) { aussen.push(welt(z)); continue; }
      const k = welt(z);
      jeBereich.set(z.bereich, jeBereich.has(z.bereich) ? vereinige(jeBereich.get(z.bereich), k) : k);
    }
    return [...jeBereich.values(), ...aussen];
  }

  // Gruppen transitiv naher Kaesten, je Gruppe die Vereinigung; oben vor unten, bei gleichem y links vor rechts.
  // Mit Bereichen: ein Kasten, dessen Mitte in Bereich i liegt, gehoert zur Gruppe von Bereich i; Gruppen
  // verschiedener Bereiche verschmelzen nie. Kaesten ausserhalb aller Bereiche buendeln sich untereinander nach naehe.
  function eingabeGruppen(kaesten, naehe = KI_NAEHE, bereiche = []) {
    const liste = (Array.isArray(kaesten) ? kaesten : []).filter(gueltigerKasten).map((k) => ({ x: k.x, y: k.y, w: k.w, h: k.h }));
    const gueltig = gueltigeBereiche(bereiche), zugehoerig = liste.map((k) => kastenBereich(k, gueltig));
    const eltern = liste.map((_, i) => i);
    const wurzel = (i) => { while (eltern[i] !== i) { eltern[i] = eltern[eltern[i]]; i = eltern[i]; } return i; };
    for (let i = 0; i < liste.length; i += 1) {
      for (let j = i + 1; j < liste.length; j += 1) {
        if (zugehoerig[i] !== zugehoerig[j]) continue;
        if (zugehoerig[i] >= 0 || kastenAbstand(liste[i], liste[j]) <= naehe) eltern[wurzel(i)] = wurzel(j);
      }
    }
    const gruppen = new Map();
    liste.forEach((k, i) => {
      const r = wurzel(i);
      gruppen.set(r, gruppen.has(r) ? vereinige(gruppen.get(r), k) : k);
    });
    return [...gruppen.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  }

  function imKasten(punkt, kasten, rand = KI_NAEHE) {
    if (!punkt || !gueltigerKasten(kasten) || !Number.isFinite(punkt.x) || !Number.isFinite(punkt.y)) return false;
    return punkt.x >= kasten.x - rand && punkt.x <= kasten.x + kasten.w + rand
      && punkt.y >= kasten.y - rand && punkt.y <= kasten.y + kasten.h + rand;
  }

  // Gehoert ein neuer Strich bei punkt zur laufenden Anfrage mit kasten (verdraengt sie)? Ohne Bereiche wie imKasten.
  // Mit Bereichen gilt dieselbe Zuordnung wie in eingabeGruppen: im Bereich der Anfrage ja, in einem anderen Bereich
  // nie; liegen Anfrage und Strich beide ausserhalb aller Bereiche, entscheidet imKasten (Naehe).
  function nahAnAnfrage(punkt, kasten, bereiche = [], rand = KI_NAEHE) {
    const gueltig = gueltigeBereiche(bereiche);
    if (!gueltig.length) return imKasten(punkt, kasten, rand);
    if (!punkt || !gueltigerKasten(kasten) || !Number.isFinite(punkt.x) || !Number.isFinite(punkt.y)) return false;
    const eigener = kastenBereich(kasten, gueltig);
    if (eigener !== bereichIndex(punkt, gueltig)) return false;
    return eigener >= 0 || imKasten(punkt, kasten, rand);
  }

  function bereicheText(n) {
    return n === 1 ? "1 Bereich wartet" : `${n} Bereiche warten`;
  }

  // Text der Anzeige #kiWarteschlange; leer heisst: Anzeige verbergen. entwurf: ein KI-Entwurf wartet auf Annahme
  // oder Verwerfen. Die Warteschlange steht so lange; das sagt die Anzeige zuerst (Abnahme A2, Befund 2).
  function kiWarteText(laeuft, wartend, entwurf = false) {
    const n = Number.isFinite(wartend) && wartend > 0 ? Math.floor(wartend) : 0;
    if (laeuft) return n ? `KI arbeitet · ${bereicheText(n)}` : "KI arbeitet";
    if (entwurf) return n ? `Entwurf wartet auf Ihre Bestätigung · ${bereicheText(n)}` : "Entwurf wartet auf Ihre Bestätigung";
    return n ? `KI wartet · ${bereicheText(n)}` : "";
  }

  // Wartende Bereiche fuer die Anzeige: offene Eingabegruppen, die keinen der ausgenommenen Kaesten schneiden
  // (Bereich des laufenden Laufs, Bereich des offenen Entwurfs; null wird ignoriert).
  function kiWartendZaehlen(offene, ausgenommen) {
    const schneidet = (a, b) => a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
    const kaesten = (Array.isArray(ausgenommen) ? ausgenommen : []).filter(gueltigerKasten);
    return (Array.isArray(offene) ? offene : []).filter((o) => gueltigerKasten(o) && !kaesten.some((k) => schneidet(o, k))).length;
  }

  // Was eine angenommene KI-Antwort von der offenen Eingabe abraeumt:
  //  "bereich" - Anfrage der Warteschlange: nur die Eingabe ihres Bereichs (Schnappschuss vom Start);
  //  "kasten"  - jede andere Anfrage (Orb, Lasso, Stiftgeste ...), solange Auto-KI an ist: nur Eingabe in ihrem
  //              Anfragekasten; wartende Bereiche ausserhalb, die das Modell nicht gesehen hat, bleiben offen;
  //  "alles"   - wie in PenEcho: ohne Auto-KI wartet nichts, ohne gueltigen Kasten oder bei veralteter Eingabe.
  function kiAbraeumart(lauf) {
    if (!lauf || !lauf.aktuell || !gueltigerKasten(lauf.kasten)) return "alles";
    if (lauf.warteschlange) return "bereich";
    return lauf.autoAn ? "kasten" : "alles";
  }

  // Fehler, die ein neuer Versuch nicht behebt: KI gesperrt (die Huelle antwortet 423, nicht erlaubt 403) oder die
  // gewaehlte Verbindung ist veraltet. Dann haelt die Warteschlange an, statt jeden wartenden Bereich anzufragen.
  function kiFehlerHaeltAn(fehler) {
    if (!fehler) return false;
    return fehler.status === 403 || fehler.status === 423 || fehler.code === "CONNECTION_STALE";
  }

  // Vorgabe fuer KI-Entwuerfe im Lernmodus (Abnahme A2, Befund 4: ein Entwurf englisch und ohne Aufgabenbezug,
  // einer verriet die Loesung). Englisch fuer das Modell, die Antwort selbst ist deutsch.
  const LERN_VORGABE = "Learning mode (Lernflaeche): the canvas holds numbered exercise areas. The exercise text of the "
    + "area the learner is writing in is printed at the top left of that area and repeated in the task context. Act as a "
    + "tutor for exactly that exercise: (1) Write every visible word in German, using the formal address \"Sie\" and correct "
    + "umlauts; use another language only if the exercise itself is written in it. (2) Refer to this exercise and to what "
    + "the learner wrote in this area; never answer about other areas or unrelated topics. (3) Never give the final answer "
    + "or a complete solution path: give at most one next step, one guiding question, or point out one concrete error in "
    + "the learner's writing. If the learner's result is already correct, confirm it briefly. (4) Keep it short (at most "
    + "three short lines) and legible: plain text, formulas only where needed.";
  const LERN_PERSONA = "Patient German-speaking math tutor for a learner working on a fixed exercise. Prefers guiding "
    + "questions and the next small step over explanations; never reveals the solution; writes short, legible German.";

  function lernPersona(lernmodus, themenPersona) {
    return lernmodus === true ? LERN_PERSONA : themenPersona;
  }

  function lernmodusGueltig(wert) {
    return wert === undefined || typeof wert === "boolean";
  }

  // Teil B, eigene Flaeche je Person: die Huelle vergibt je Browser-Tab eine Kennung lf-<32 hex> und gibt sie als
  // ?flaeche= mit. Nur im Lernmodus (lernen=1) und nur in genau diesem Muster; sonst null (dann wie bisher).
  const FLAECHEN_KENNUNG = /^lf-[0-9a-f]{32}$/;
  function flaechenKennung(search) {
    try {
      const p = new URLSearchParams(typeof search === "string" ? search : "");
      const wert = p.get("flaeche");
      return p.get("lernen") === "1" && typeof wert === "string" && FLAECHEN_KENNUNG.test(wert) ? wert : null;
    } catch { return null; }
  }

  return Object.freeze({
    LERN_VORGABE, lernPersona, lernmodusGueltig, LERN_DE, LERN_DE_MCP, LERN_DE_AKTION, LERN_DE_FEST,
    lernmodusAktiv, KI_SCHRIFT_STUFEN, KI_SCHRIFT_GRUND, KI_SCHRIFT_SCHLUESSEL, kiSchriftGelesen, kiSchriftStufe, kiSchriftAnwenden,
    kiSchriftFaktorFuer, autoKiStart, autoKiStartFuer,
    KI_NAEHE, eingabeGruppen, imKasten, kiWarteText, kiWartendZaehlen, kiAbraeumart, kiFehlerHaeltAn,
    BEREICHE_MARKE, bereicheAusKontext, kontextOhneBereiche, nahAnAnfrage, TEXTGRENZE, tintenKaesten,
    textUmbruchBreite, flaechenKennung,
  });
})();
if (typeof module === "object" && module.exports) module.exports = LernflaecheKern;
