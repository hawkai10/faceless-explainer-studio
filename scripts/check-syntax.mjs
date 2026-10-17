#!/usr/bin/env node
// npm run lint — `node --check` every tracked studio script (no build step, so this catches syntax errors early).
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const files = execFileSync("git", ["ls-files", "*.mjs", "*.cjs", "*.js"], { cwd: root, encoding: "utf8" })
  .split("\n").filter((f) => f && !f.includes("node_modules/"));
if (!files.length) { console.error("no scripts found — run inside a git checkout"); process.exit(1); }
let failed = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ["--check", f], { cwd: root, stdio: "pipe" }); }
  catch (e) { failed++; console.error(`✗ ${f}\n${e.stderr}`); }
}
console.log(`${files.length - failed}/${files.length} files OK`);
process.exit(failed ? 1 : 0);
