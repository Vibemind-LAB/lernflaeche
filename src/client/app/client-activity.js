// Lernflaeche: keine Telemetrie. Das Ursprungsprojekt meldete hier einmal am Tag eine anonyme Aktivitaet (Bild-Abruf
// mit Installationskennung beim Cloud-Dienst des Ursprungsprojekts). Diese Datei wird nicht mehr gebuendelt
// (scripts/build-client.js); sie bleibt als leerer Ersatz mit denselben Namen, ohne Netz und ohne Speicher.
(() => {
  "use strict";

  function randomInstallationId() { return ""; }
  function installationId() { return ""; }
  function browserPlatform() { return "unknown"; }
  function metadata() { return null; }
  function requestLogo() {}
  function scheduleActivityLogo() {}

  void [randomInstallationId, installationId, browserPlatform, metadata, requestLogo];
  scheduleActivityLogo();
})();
