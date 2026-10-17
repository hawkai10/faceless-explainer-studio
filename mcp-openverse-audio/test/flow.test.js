// Search → download → ledger against the local mock (offline).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startMock, record } from "./mock-openverse.js";

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const recs = [
  record({ id: ID(1), title: "Deep Whoosh", license: "cc0", duration: 3100 }),
  record({ id: ID(2), title: "Swish (CC BY)", license: "by", license_version: "4.0", license_url: "https://creativecommons.org/licenses/by/4.0/", duration: 1500 }),
  record({ id: ID(3), title: "NC Whoosh", license: "by-nc", license_version: "4.0", _ignoreLicenseFilter: true, duration: 2000 }),
  record({ id: ID(4), title: "Long Rain Bed", license: "cc0", duration: 95000 }),
  record({ id: ID(5), title: "Score", license: "cc0", filetype: "mid", duration: 2000 }),
  record({ id: ID(6), title: "Broken host", license: "cc0", url: "/files/html-6.mp3" }),
  record({ id: ID(7), title: "Tiny", license: "cc0", url: "/files/tiny-7.mp3" }),
  record({ id: ID(8), title: "Calm Piano", license: "by", license_version: "3.0", license_url: "https://creativecommons.org/licenses/by/3.0/", source: "jamendo", provider: "jamendo", filetype: "mp32", duration: 185000, tags: [{ name: "instrumental" }], attribution: '"Calm Piano" by Test Artist is licensed under CC BY 3.0.' }),
];

let mock, tools, dl, root;
before(async () => {
  mock = await startMock(recs);
  process.env.OPENVERSE_API_BASE = mock.api;
  tools = await import("../src/tools.js");
  dl = await import("../src/download.js");
  root = mkdtempSync(join(tmpdir(), "ova-"));
});
after(async () => { await mock.close(); rmSync(root, { recursive: true, force: true }); });
const call = (name, args) => tools.callTool(name, args);

test("search_sfx: public domain first, NC/MIDI/over-long filtered out", async () => {
  const r = await call("search_sfx", { query: "whoosh" });
  const ids = r.results.map((x) => x.id);
  assert.ok(!ids.includes(ID(3)), "non-commercial never returned");
  assert.ok(!ids.includes(ID(5)), "MIDI dropped");
  assert.ok(!ids.includes(ID(4)), "95 s is over the 30 s sfx default");
  assert.equal(r.results[0].license.tier, 0, "CC0 before CC BY");
  assert.ok(r.results.some((x) => x.license.code === "by"), "CC BY fills in after public domain");
  assert.ok(Object.keys(r.filtered_out).length > 0, "reports what was filtered and why");
});

test("search stays within the anonymous page_size limit (≤ 20) even for limit 20", async () => {
  const r = await call("search_sfx", { query: "whoosh", limit: 20 });
  assert.ok(r.count > 0);
  assert.ok(mock.hits.filter((h) => h.startsWith("/v1/audio/?")).every((h) => Number(new URLSearchParams(h.split("?")[1]).get("page_size")) <= 20));
  const raw = await call("search_audio", { query: "whoosh", page_size: 100 });
  assert.ok(raw.results.length > 0, "raw search clamps page_size too");
});

test("search filters: public_domain_only, duration, explicit bad license", async () => {
  const pd = await call("search_sfx", { query: "whoosh", license_mode: "public_domain_only" });
  assert.ok(pd.results.every((x) => x.license.public_domain));
  const long = await call("search_music", { query: "rain", min_seconds: 60, max_seconds: 120, source: "freesound" });
  assert.deepEqual(long.results.map((x) => x.id), [ID(4)]);
  await assert.rejects(call("search_music", { query: "x", license: "by-nc" }), /not usable/);
  await assert.rejects(call("search_music", { query: "x", source: "spotify" }), /unknown source/);
});

test("download_audio: saves file under assets/audio/sfx and records the license", async () => {
  const r = await call("download_audio", { id: ID(1), project_dir: root });
  assert.equal(r.status, "downloaded");
  assert.match(r.file, /^assets\/audio\/sfx\/deep-whoosh-00000000\.mp3$/);
  assert.equal(statSync(join(root, r.file)).size, 4096);
  const ledger = JSON.parse(readFileSync(join(root, "assets/audio/LICENSES.json"), "utf8"));
  assert.equal(ledger.length, 1);
  const e = ledger[0];
  for (const k of ["title", "creator", "source_url", "license", "license_url", "attribution", "attribution_required", "openverse_id", "sha256", "file"]) assert.ok(k in e, k);
  assert.equal(e.openverse_id, ID(1));
  assert.equal(e.license, "cc0");
  assert.equal(e.attribution_required, false);
  assert.equal(e.source_url, "https://example.org/track/1");
});

test("download_audio: music goes to assets/audio/music, mp32 → .mp3, CC BY attribution kept", async () => {
  const r = await call("download_audio", { id: ID(8), project_dir: root, kind: "music" });
  assert.match(r.file, /^assets\/audio\/music\/calm-piano-00000000\.mp3$/);
  assert.equal(r.entry.attribution_required, true);
  assert.equal(r.entry.license_name, "CC BY 3.0");
  assert.match(r.entry.attribution, /Calm Piano/);
  const ledger = dl.readLedger(root);
  assert.equal(ledger.length, 2, "appended, not replaced");
});

test("download_audio: same id again is not re-downloaded or re-recorded", async () => {
  const r = await call("download_audio", { id: ID(1), project_dir: root });
  assert.equal(r.status, "already_downloaded");
  assert.equal(dl.readLedger(root).length, 2);
});

test("download_audio: refuses non-commercial, MIDI, non-audio and tiny files — and leaves no trace", async () => {
  await assert.rejects(call("download_audio", { id: ID(3), project_dir: root }), /Refused.*non-commercial/);
  await assert.rejects(call("download_audio", { id: ID(5), project_dir: root }), /MIDI/);
  await assert.rejects(call("download_audio", { id: ID(6), project_dir: root }), /not audio/);
  await assert.rejects(call("download_audio", { id: ID(7), project_dir: root }), /only 3 bytes/);
  assert.equal(dl.readLedger(root).length, 2, "ledger unchanged");
  const leftovers = ["nc-whoosh", "score", "broken-host", "tiny"].filter((n) => existsSync(join(root, "assets/audio/sfx", `${n}-00000000.mp3`)) || existsSync(join(root, "assets/audio/sfx", `${n}-00000000.mp3.part`)));
  assert.deepEqual(leftovers, []);
});

test("download_audio: validates inputs", async () => {
  await assert.rejects(call("download_audio", { id: "not-a-uuid" }), /UUID/);
  await assert.rejects(call("download_audio", { id: ID(1), project_dir: join(root, "missing") }), /does not exist/);
});

test("download_audio: refuses to clobber a LICENSES.json that isn't a JSON array", async () => {
  const other = mkdtempSync(join(tmpdir(), "ova2-"));
  mkdirSync(join(other, "assets/audio"), { recursive: true });
  writeFileSync(join(other, "assets/audio/LICENSES.json"), '{"hand":"written"}');
  await assert.rejects(call("download_audio", { id: ID(1), project_dir: other }), /not a JSON array/);
  assert.equal(readFileSync(join(other, "assets/audio/LICENSES.json"), "utf8"), '{"hand":"written"}');
  rmSync(other, { recursive: true, force: true });
});

test("list_audio_licenses: credits only the assets that need attribution", async () => {
  const r = await call("list_audio_licenses", { project_dir: root });
  assert.equal(r.count, 2);
  assert.equal(r.attribution_required_count, 1);
  assert.match(r.credits_text, /Calm Piano/);
  assert.doesNotMatch(r.credits_text, /Deep Whoosh/);
  const all = await call("list_audio_licenses", { project_dir: root, include_public_domain: true });
  assert.match(all.credits_text, /Deep Whoosh/);
});
