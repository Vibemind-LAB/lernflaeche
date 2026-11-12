"use strict";
// Opt-in isolation of the local MCP host for test surfaces (Lernfläche).
// LERNFLAECHE_MCP_ZUSTAND: absolute directory that replaces ~/.penecho for every MCP file
//   (instances, server certificate and identity, host credentials, client.js, conversations).
// LERNFLAECHE_MCP_PORT: exact port of the direct HTTPS MCP listener, without fallback ports.
// With a separate state directory but no port, the listener takes any free port (0), so an
// isolated instance never claims the default ports of the production instance.
// Without both variables nothing changes.
const path = require("node:path");
const { DEFAULT_MCP_PORTS } = require("./listen.js");

const MCP_ZUSTAND_VARIABLE = "LERNFLAECHE_MCP_ZUSTAND";
const MCP_PORT_VARIABLE = "LERNFLAECHE_MCP_PORT";

function readMcpIsolation(env = process.env) {
  const result = {};
  const directory = String(env?.[MCP_ZUSTAND_VARIABLE] ?? "").trim();
  if (directory) {
    if (!path.isAbsolute(directory)) throw new Error(`${MCP_ZUSTAND_VARIABLE} must be an absolute directory.`);
    result.registryStateDirectory = path.resolve(directory);
    result.directHttpPort = 0;
  }
  const portText = String(env?.[MCP_PORT_VARIABLE] ?? "").trim();
  if (portText) {
    if (!/^\d{1,5}$/.test(portText)) throw new Error(`${MCP_PORT_VARIABLE} must be a port number.`);
    const port = Number(portText);
    if (port > 65535) throw new Error(`${MCP_PORT_VARIABLE} must be at most 65535.`);
    if (DEFAULT_MCP_PORTS.includes(port)) throw new Error(`${MCP_PORT_VARIABLE} must not be a default MCP port (${DEFAULT_MCP_PORTS.join(", ")}).`);
    result.directHttpPort = port;
  }
  return result;
}

module.exports = { MCP_PORT_VARIABLE, MCP_ZUSTAND_VARIABLE, readMcpIsolation };
