// Baut das Quelltext-Angebot (AGPL §13): quelltext/lernflaeche-<sha7>.tar.gz aus HEAD.
// Beim Ausliefern der Lernfläche aufrufen; /quelltext liefert das neueste Archiv.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = args => execFileSync("git", args, { cwd: wurzel, encoding: "utf8" }).trim();
const sha7 = git(["rev-parse", "--short=7", "HEAD"]);
const ordner = path.join(wurzel, "quelltext");
mkdirSync(ordner, { recursive: true });
const ziel = path.join(ordner, `lernflaeche-${sha7}.tar.gz`);
execFileSync("git", ["archive", "--format=tar.gz", "-o", ziel, "HEAD"], { cwd: wurzel });
console.log(ziel);
