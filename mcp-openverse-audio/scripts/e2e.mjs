// Live end-to-end check against the real Openverse API, through the real stdio MCP server
// (exactly how Claude Code talks to it): search → select → download → license ledger → refusal.
// Uses ~8 Openverse requests. Usage: npm run e2e  [-- --keep]  (keep = leave the temp project)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const project = mkdtempSync(join(tmpdir(), "openverse-audio-e2e-"));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(here, "..", "src", "server.js")],
  env: { ...process.env, AUDIO_PROJECT_ROOT: project },
  stderr: "ignore",
});
const client = new Client({ name: "e2e", version: "1.0.0" });
await client.connect(transport);

async function call(name, args) {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content?.[0]?.text ?? "";
  return { error: !!r.isError, text, json: r.isError ? null : JSON.parse(text) };
}
const step = (s) => console.log(`\n▶ ${s}`);
const ledger = () => JSON.parse(readFileSync(join(project, "assets/audio/LICENSES.json"), "utf8"));

try {
  step("tools/list");
  const names = (await client.listTools()).tools.map((t) => t.name);
  for (const t of ["search_music", "search_sfx", "download_audio", "list_audio_licenses", "search_audio", "search_images"]) assert.ok(names.includes(t), t);
  console.log("  " + names.join(", "));

  step('search_music "calm piano" (instrumental, ≤ 4 min)');
  const music = await call("search_music", { query: "calm piano", instrumental: true, max_seconds: 240, limit: 10 });
  assert.ok(!music.error, music.text);
  assert.ok(music.json.count > 0, "no music results");
  for (const r of music.json.results) console.log(`  [tier ${r.license.tier}] ${r.license.name.padEnd(8)} ${String(r.duration_s).padStart(6)}s  ${r.title} — ${r.creator} (${r.source})  ${r.id}`);
  assert.ok(music.json.results.every((r) => r.license.commercial_use && ["cc0", "pdm", "by"].includes(r.license.code)));
  const pickM = music.json.results[0];

  step(`download_audio (music) ${pickM.id}`);
  const dm = await call("download_audio", { id: pickM.id, kind: "music" });
  assert.ok(!dm.error, dm.text);
  console.log(`  → ${dm.json.file} (${dm.json.entry.bytes} bytes, ${dm.json.entry.license_name})`);
  assert.match(dm.json.file, /^assets\/audio\/music\//);
  const bytesM = readFileSync(join(project, dm.json.file));
  assert.ok(bytesM.length > 50_000, "music file suspiciously small");
  assert.equal(createHash("sha256").update(bytesM).digest("hex"), dm.json.entry.sha256, "sha256 matches file on disk");

  step('search_sfx "whoosh" category=transition');
  const sfx = await call("search_sfx", { query: "whoosh", category: "transition", limit: 5 });
  assert.ok(!sfx.error, sfx.text);
  assert.ok(sfx.json.count > 0, "no sfx results");
  for (const r of sfx.json.results) console.log(`  [tier ${r.license.tier}] ${r.license.name.padEnd(8)} ${String(r.duration_s).padStart(6)}s  ${r.title} — ${r.creator} (${r.source})  ${r.id}`);
  assert.equal(sfx.json.results[0].license.tier, 0, "public domain preferred");
  assert.ok(sfx.json.results.every((r) => r.duration_s <= 30));
  const pickS = sfx.json.results[0];

  step(`download_audio (sfx) ${pickS.id}`);
  const ds = await call("download_audio", { id: pickS.id });
  assert.ok(!ds.error, ds.text);
  console.log(`  → ${ds.json.file} (${ds.json.entry.bytes} bytes, ${ds.json.entry.license_name})`);
  assert.match(ds.json.file, /^assets\/audio\/sfx\//);
  assert.equal(statSync(join(project, ds.json.file)).size, ds.json.entry.bytes);

  step("download_audio refuses a CC BY-NC track (Jamendo 'White Line (Solo Piano)')");
  const before = ledger().length;
  const nc = await call("download_audio", { id: "864b954b-d800-4b14-b94a-f3e9f83bceb0" });
  assert.ok(nc.error, "NC download must fail");
  console.log("  " + nc.text);
  assert.match(nc.text, /Refused/);
  assert.equal(ledger().length, before, "ledger unchanged after refusal");

  step("assets/audio/LICENSES.json");
  const L = ledger();
  assert.equal(L.length, 2);
  for (const e of L) {
    for (const k of ["title", "creator", "source_url", "license", "license_url", "attribution", "attribution_required", "openverse_id"]) assert.ok(e[k] !== undefined && e[k] !== null, `${k} missing`);
    console.log(`  ${e.openverse_id}  ${e.license_name.padEnd(8)} attribution_required=${e.attribution_required}  ${e.file}`);
  }

  step("list_audio_licenses");
  const lic = await call("list_audio_licenses", {});
  console.log("  " + lic.json.credits_text.replace(/\n/g, "\n  "));
  console.log(`\n✓ e2e passed — project: ${project}`);
  console.log(`  Openverse quota left: ${JSON.stringify(dm.json.openverse_rate_limit || lic.json.openverse_rate_limit || "n/a")}`);
} finally {
  await client.close();
  if (!process.argv.includes("--keep")) rmSync(project, { recursive: true, force: true });
}
