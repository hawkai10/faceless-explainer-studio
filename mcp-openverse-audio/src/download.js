// download_audio + the license ledger (assets/audio/LICENSES.json).
//
// Every download re-fetches the record from Openverse (never trusts search results or the
// caller), re-applies the license policy, streams the file with a size cap and hash, and then
// records provenance. The file is only moved into place after the ledger entry is ready, so a
// file in assets/audio/ always has a license entry.
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { get } from "./openverse.js";
import { evaluate, attributionText } from "./licenses.js";

const MAX_BYTES = Number(process.env.AUDIO_MAX_BYTES || 150 * 1024 * 1024);
const EXT = { mp3: "mp3", mp32: "mp3", mpeg: "mp3", ogg: "ogg", oga: "ogg", opus: "opus", wav: "wav", "x-wav": "wav", wave: "wav", flac: "flac", "x-flac": "flac", m4a: "m4a", mp4: "m4a", aac: "aac", webm: "webm", aiff: "aiff" };
const UNPLAYABLE = new Set(["mid", "midi"]);

export function projectRoot(dir) {
  const root = resolve(dir || process.env.AUDIO_PROJECT_ROOT || process.cwd());
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`project_dir does not exist: ${root}`);
  return root;
}
export function ledgerPath(root) { return join(root, "assets", "audio", "LICENSES.json"); }

export function readLedger(root) {
  const p = ledgerPath(root);
  if (!existsSync(p)) return [];
  const data = JSON.parse(readFileSync(p, "utf8"));
  if (!Array.isArray(data)) throw new Error(`${p} is not a JSON array — refusing to overwrite it`);
  return data;
}
function writeLedger(root, entries) {
  const p = ledgerPath(root);
  mkdirSync(dirname(p), { recursive: true });
  const tmp = p + ".tmp";
  writeFileSync(tmp, JSON.stringify(entries, null, 2) + "\n");
  renameSync(tmp, p); // atomic replace
}

export function slug(s) {
  return String(s || "audio").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\.(mp3|wav|ogg|flac|aiff?|m4a)$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "audio";
}
function extFor(rec, contentType) {
  const ft = String(rec.filetype || "").toLowerCase();
  if (EXT[ft]) return EXT[ft];
  const sub = String(contentType || "").split(";")[0].split("/")[1];
  return EXT[sub] || null;
}

/**
 * @param {{id:string, kind?:"music"|"sfx", project_dir?:string, filename?:string, allow_share_alike?:boolean}} a
 */
export async function downloadAudio(a) {
  const id = String(a.id || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('"id" must be an Openverse audio UUID from search_music / search_sfx');
  const root = projectRoot(a.project_dir);

  // 1. Fresh record straight from Openverse — the provenance of record.
  const rec = await get(`/audio/${id}/`, {}, { useCache: false });
  const ev = evaluate(rec, { allowShareAlike: !!a.allow_share_alike });
  if (!ev.allowed) throw new Error(`Refused: "${rec.title || id}" cannot be used — ${ev.reasons.join("; ")}. Nothing was downloaded.`);
  if (UNPLAYABLE.has(String(rec.filetype).toLowerCase())) throw new Error("Refused: MIDI files are scores, not recordings.");
  if (!/^https?:\/\//.test(String(rec.url || ""))) throw new Error("Refused: Openverse has no downloadable file URL for this record.");

  const durationS = rec.duration != null ? rec.duration / 1000 : null;
  const kind = a.kind || (rec.source === "freesound" || (durationS != null && durationS < 30) ? "sfx" : "music");
  if (!["music", "sfx"].includes(kind)) throw new Error('kind must be "music" or "sfx"');

  // 2. Already have it? (same Openverse id, file still present) → just report it.
  const ledger = readLedger(root);
  const prior = ledger.find((e) => e.openverse_id === id && existsSync(join(root, e.file)));
  if (prior) return { status: "already_downloaded", file: prior.file, absolute_path: join(root, prior.file), entry: prior, ledger: ledgerPath(root) };

  // 3. Stream to a temp file with a size cap + hash.
  let res;
  try {
    res = await fetch(rec.url, { redirect: "follow", headers: { "User-Agent": "mcp-openverse-audio/0.1" }, signal: AbortSignal.timeout(180_000) });
  } catch (e) { throw new Error(`Download failed (${e.name === "TimeoutError" ? "timed out" : e.message}). Nothing was saved.`); }
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status} from ${new URL(rec.url).host}. Nothing was saved.`);
  const ctype = res.headers.get("content-type") || "";
  if (!/^(audio\/|application\/(ogg|octet-stream))/i.test(ctype) && ctype) throw new Error(`Refused: server returned "${ctype}", not audio. Nothing was saved.`);
  const ext = extFor(rec, ctype);
  if (!ext) throw new Error(`Refused: unknown audio format (filetype "${rec.filetype}", content-type "${ctype}").`);

  const dir = join(root, "assets", "audio", kind);
  mkdirSync(dir, { recursive: true });
  const base = a.filename ? slug(a.filename) : `${slug(rec.title)}-${id.slice(0, 8)}`;
  let target = join(dir, `${base}.${ext}`);
  for (let n = 2; existsSync(target); n++) target = join(dir, `${base}-${n}.${ext}`);
  if (!resolve(target).startsWith(resolve(root) + sep)) throw new Error("Refused: target path escapes the project");
  const tmp = target + ".part";
  const hash = createHash("sha256");
  let bytes = 0;
  const meter = new Transform({
    transform(chunk, _e, cb) {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) return cb(new Error(`file exceeds ${Math.round(MAX_BYTES / 1048576)} MB cap`));
      hash.update(chunk); cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(res.body), meter, createWriteStream(tmp));
  } catch (e) {
    rmSync(tmp, { force: true });
    throw new Error(`Download failed: ${e.message}. Nothing was saved.`);
  }
  if (bytes < 1024) { rmSync(tmp, { force: true }); throw new Error(`Refused: downloaded file is only ${bytes} bytes — not a real audio file.`); }

  // 4. Ledger entry, then move the file into place.
  const file = relative(root, target).split(sep).join("/");
  const entry = {
    openverse_id: id,
    title: rec.title || null,
    creator: rec.creator || null,
    creator_url: rec.creator_url || null,
    source: rec.source || rec.provider || null,
    source_url: rec.foreign_landing_url,
    openverse_url: `https://openverse.org/audio/${id}`,
    file_url: rec.url,
    license: ev.code,
    license_version: ev.version,
    license_name: ev.name,
    license_url: ev.url,
    public_domain: ev.publicDomain,
    attribution_required: ev.attributionRequired,
    attribution: attributionText(rec, ev),
    share_alike: ev.shareAlike,
    commercial_use: true,
    kind,
    file,
    duration_s: durationS != null ? Math.round(durationS * 10) / 10 : null,
    bytes,
    sha256: hash.digest("hex"),
    downloaded_at: new Date().toISOString(),
    verified: "license re-checked against the Openverse API record at download time",
  };
  try {
    writeLedger(root, [...ledger, entry]);
    renameSync(tmp, target);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
  return { status: "downloaded", file, absolute_path: target, entry, ledger: ledgerPath(root) };
}

/** list_audio_licenses: the ledger plus a ready-to-paste credits block. */
export function listLicenses(a = {}) {
  const root = projectRoot(a.project_dir);
  const entries = readLedger(root).map((e) => ({ ...e, file_present: existsSync(join(root, e.file)) }));
  const need = entries.filter((e) => e.attribution_required);
  const credits = (a.include_public_domain ? entries : need).map((e) => `• ${e.attribution} Source: ${e.source_url}`);
  return {
    ledger: ledgerPath(root),
    count: entries.length,
    attribution_required_count: need.length,
    credits_text: credits.length ? "Audio credits:\n" + credits.join("\n") : "No attribution required (all assets are public domain).",
    assets: entries,
  };
}
