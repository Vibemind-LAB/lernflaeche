"use strict";
// Test-Flaechen bekommen per Umgebung einen eigenen MCP-Zustand und einen eigenen Port.
// Ohne die Variablen bleibt alles wie bisher (3922 zuerst, Zustand unter ~/.penecho).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

// Eigenes Heimverzeichnis fuer diesen Testprozess: so laesst sich pruefen, dass unter
// ~/.penecho nichts entsteht. os.homedir() liest USERPROFILE (Windows) bzw. HOME.
const HEIM = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-isolation-heim-"));
process.env.USERPROFILE = HEIM;
process.env.HOME = HEIM;

const { readMcpIsolation, MCP_ZUSTAND_VARIABLE, MCP_PORT_VARIABLE } = require("../src/server/mcp/isolation.js");
const { DEFAULT_MCP_PORTS, mcpPortCandidates, listenMcp } = require("../src/server/mcp/listen.js");
const { createMcpService } = require("../src/server/mcp/service.js");

test("Variablennamen", () => {
  assert.equal(MCP_ZUSTAND_VARIABLE, "LERNFLAECHE_MCP_ZUSTAND");
  assert.equal(MCP_PORT_VARIABLE, "LERNFLAECHE_MCP_PORT");
});

test("ohne Variablen: keine Abweichung vom bisherigen Verhalten", () => {
  assert.deepEqual(readMcpIsolation({}), {});
  assert.deepEqual(readMcpIsolation({ LERNFLAECHE_MCP_ZUSTAND: "  ", LERNFLAECHE_MCP_PORT: "" }), {});
  assert.deepEqual(mcpPortCandidates(), [3922, 13922, 23922, 0]);
  assert.deepEqual(mcpPortCandidates(3922), [3922, 13922, 23922, 0]);
  assert.deepEqual(mcpPortCandidates(5000), [5000, 0]);
  assert.deepEqual(mcpPortCandidates(0), [0]);
});

test("Zustand gesetzt: eigenes Verzeichnis, ohne Port nie die produktiven Ports", () => {
  const ordner = path.join(os.tmpdir(), "irgendwo", "mcp-zustand");
  assert.deepEqual(readMcpIsolation({ LERNFLAECHE_MCP_ZUSTAND: ordner }), { registryStateDirectory: path.resolve(ordner), directHttpPort: 0 });
});

test("Port gesetzt: genau dieser Port", () => {
  assert.deepEqual(readMcpIsolation({ LERNFLAECHE_MCP_PORT: "40123" }), { directHttpPort: 40123 });
  assert.deepEqual(readMcpIsolation({ LERNFLAECHE_MCP_PORT: "0" }), { directHttpPort: 0 });
  const ordner = path.join(os.tmpdir(), "z");
  assert.deepEqual(readMcpIsolation({ LERNFLAECHE_MCP_ZUSTAND: ordner, LERNFLAECHE_MCP_PORT: "40124" }), { registryStateDirectory: path.resolve(ordner), directHttpPort: 40124 });
});

test("ungueltige Werte werden abgelehnt, auch die produktiven Ports", () => {
  for (const port of DEFAULT_MCP_PORTS) assert.throws(() => readMcpIsolation({ LERNFLAECHE_MCP_PORT: String(port) }), /LERNFLAECHE_MCP_PORT/);
  for (const wert of ["abc", "-1", "65536", "12.5", "1e3"]) assert.throws(() => readMcpIsolation({ LERNFLAECHE_MCP_PORT: wert }), /LERNFLAECHE_MCP_PORT/);
  assert.throws(() => readMcpIsolation({ LERNFLAECHE_MCP_ZUSTAND: "relativ/ordner" }), /LERNFLAECHE_MCP_ZUSTAND/);
});

test("fester Port: keine Ausweichports", () => {
  assert.deepEqual(mcpPortCandidates(40125, { exact: true }), [40125]);
  assert.deepEqual(mcpPortCandidates(0, { exact: true }), [0]);
});

test("fester Port belegt: Fehler statt Ausweichen", async () => {
  const belegt = net.createServer();
  await new Promise(ok => belegt.listen(0, "0.0.0.0", ok));
  const port = belegt.address().port;
  const versuche = [];
  const zweiter = net.createServer();
  const listen = zweiter.listen.bind(zweiter);
  zweiter.listen = (p, ...rest) => { versuche.push(p); return listen(p, ...rest); };
  try {
    await assert.rejects(listenMcp(zweiter, port, 5000, { exact: true }), { code: "EADDRINUSE" });
    assert.deepEqual(versuche, [port]);
  } finally {
    zweiter.close();
    await new Promise(ok => belegt.close(ok));
  }
});

test("Dienst mit registryStateDirectory und Port 0: alles im eigenen Ordner, nichts unter ~/.penecho", async () => {
  const zustand = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-isolation-zustand-"));
  const server = http.createServer();
  const dienst = createMcpService({
    server,
    authorizeBrowser: () => null,
    rootDirectory: zustand,
    registryStateDirectory: zustand,
    directHttpPort: 0,
    lanAddresses: () => [],
    directAnnounce: () => ({ close() {} }),
  });
  try {
    dienst.register({ port: 45999 });
    const wert = await dienst.startDirect();
    const port = Number(new URL(wert.localUrl).port);
    assert.ok(port > 0 && !DEFAULT_MCP_PORTS.includes(port), `Port ${port}`);
    const echt = fs.realpathSync(zustand);
    const instanzen = fs.readdirSync(path.join(echt, "mcp", "instances"));
    assert.equal(instanzen.length, 1);
    assert.ok(fs.existsSync(path.join(echt, "mcp", "server", "direct-http", "identity.json")));
    assert.ok(fs.existsSync(path.join(echt, "mcp", "client.js")));
    const hosts = fs.readdirSync(path.join(echt, "mcp", "hosts"));
    assert.equal(hosts.length, 1);
    const zugang = JSON.parse(fs.readFileSync(path.join(echt, "mcp", "hosts", hosts[0], "credentials.json"), "utf8"));
    assert.equal(Number(new URL(zugang.initialUrl).port), port);
    assert.equal(fs.existsSync(path.join(HEIM, ".penecho")), false, "unter ~/.penecho darf nichts entstehen");
  } finally {
    await dienst.close();
  }
});

test("main.js reicht die Isolation an den MCP-Dienst durch", () => {
  const quelle = fs.readFileSync(path.join(__dirname, "..", "src", "server", "main.js"), "utf8");
  const start = quelle.indexOf("const mcpService = createMcpService({");
  assert.ok(start > 0);
  assert.match(quelle.slice(0, start), /readMcpIsolation\(process\.env\)/);
  assert.match(quelle.slice(start, quelle.indexOf("});", start)), /\.\.\.MCP_ISOLATION,/);
});
