#!/usr/bin/env node
// npm run setup — install the npm dependencies of every studio tool folder and the audio MCP server.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const dirs = ["color", "dicebear", "maps", "peeps", "svgraster"].map((d) => join("_studio", "tools", d)).concat("mcp-openverse-audio");
for (const d of dirs) {
  if (!existsSync(join(root, d, "package.json"))) continue;
  console.log(`\n▸ npm ci in ${d}`);
  execSync("npm ci --no-audit --no-fund", { cwd: join(root, d), stdio: "inherit" });
}
console.log("\nDone. Optional Python tools: see _studio/STUDIO.md → Media & quality tools.");
