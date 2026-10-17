// Tool definitions + dispatch. The six original pipeworx Openverse tools are kept (raw,
// unfiltered passthrough); the audio tools add license policy, filters, downloads and a ledger.
import { get, rateLimit, maxPageSize } from "./openverse.js";
import { searchKind, SOURCES, SFX_CATEGORIES, MUSIC_CATEGORIES } from "./audio.js";
import { downloadAudio, listLicenses } from "./download.js";
import { evaluate } from "./licenses.js";

const searchProps = (kind) => ({
  query: { type: "string", description: "What you want, in plain words (e.g. \"calm piano\", \"whoosh transition\")." },
  category: { type: "string", description: `Optional keyword category appended to the query: ${Object.keys(kind === "sfx" ? SFX_CATEGORIES : MUSIC_CATEGORIES).join(", ")} (free text also accepted).` },
  min_seconds: { type: "number", description: `Minimum duration (default ${kind === "sfx" ? "none" : 30}).` },
  max_seconds: { type: "number", description: `Maximum duration (default ${kind === "sfx" ? 30 : "none"}).` },
  license_mode: { type: "string", enum: ["prefer_public_domain", "public_domain_only", "commercial"], description: "prefer_public_domain (default): CC0/PDM first, then CC BY to fill. public_domain_only: CC0/PDM only. commercial: all commercially usable licenses ranked equally." },
  license: { type: "string", description: "Optional comma list restricting licenses: cc0, pdm, by (by-sa needs allow_share_alike). NC/ND/sampling licenses are never allowed." },
  allow_share_alike: { type: "boolean", description: "Permit CC BY-SA (the finished video would then have to be BY-SA too). Default false." },
  source: { type: "string", description: `Comma list of sources: ${SOURCES.join(", ")}. Default: ${kind === "sfx" ? "freesound,wikimedia_audio" : "jamendo,wikimedia_audio"}.` },
  ...(kind === "music" ? { instrumental: { type: "boolean", description: "Only tracks tagged instrumental (Jamendo tags; recommended under narration)." } } : {}),
  limit: { type: "number", description: "Max results, 1-20 (default 8)." },
});

export const tools = [
  // ── audio (license-safe) ──────────────────────────────────────────────────
  {
    name: "search_music",
    description: "Search royalty-free MUSIC that is safe for commercial video (Openverse: Jamendo, Wikimedia Commons). Only CC0 / public domain / CC BY (optionally BY-SA) are returned; public domain first. Results carry id, duration, license and attribution needs — pass an id to download_audio.",
    inputSchema: { type: "object", properties: searchProps("music"), required: ["query"] },
  },
  {
    name: "search_sfx",
    description: "Search royalty-free SOUND EFFECTS safe for commercial video (Openverse: Freesound, Wikimedia Commons). Only CC0 / public domain / CC BY (optionally BY-SA); public domain first; ≤30 s by default. Pass an id to download_audio.",
    inputSchema: { type: "object", properties: searchProps("sfx"), required: ["query"] },
  },
  {
    name: "download_audio",
    description: "Download one Openverse audio asset by id after re-verifying its license with Openverse. Saves to <project>/assets/audio/music|sfx/ and appends title, creator, source URL, license, license URL, attribution and Openverse id to assets/audio/LICENSES.json. Refuses anything not commercially usable or with unclear licensing.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Openverse audio UUID from search_music / search_sfx." },
        kind: { type: "string", enum: ["music", "sfx"], description: "Target folder. Default: sfx for Freesound or clips under 30 s, else music." },
        project_dir: { type: "string", description: "Absolute project folder to save into (default: AUDIO_PROJECT_ROOT env, else the server's working directory)." },
        filename: { type: "string", description: "Optional base filename (extension added automatically)." },
        allow_share_alike: { type: "boolean", description: "Permit a CC BY-SA asset. Default false." },
      },
      required: ["id"],
    },
  },
  {
    name: "list_audio_licenses",
    description: "Show the project's audio license ledger (assets/audio/LICENSES.json) and a ready-to-paste credits block for assets that require attribution.",
    inputSchema: {
      type: "object",
      properties: {
        project_dir: { type: "string", description: "Absolute project folder (default as for download_audio)." },
        include_public_domain: { type: "boolean", description: "Also credit public-domain assets (courtesy). Default false." },
      },
    },
  },
  // ── original Openverse tools (kept from pipeworx-io/mcp-openverse; unfiltered) ──
  {
    name: "search_audio",
    description: "Raw Openverse audio search (unfiltered — may include non-commercial licenses). Prefer search_music / search_sfx; download_audio enforces the license policy either way.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, license: { type: "string" }, license_type: { type: "string" }, source: { type: "string" }, page: { type: "number" }, page_size: { type: "number" } }, required: ["query"] },
  },
  {
    name: "get_audio",
    description: "Full Openverse metadata for one audio id, plus this server's license verdict (license_check).",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "audio_related",
    description: "Openverse audio related to an id (unfiltered).",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "search_images",
    description: "Raw Openverse image search (Creative Commons / public domain). Filters: license (comma list), license_type (commercial|modification), size, source.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, license: { type: "string" }, license_type: { type: "string" }, size: { type: "string" }, source: { type: "string" }, page: { type: "number" }, page_size: { type: "number" } }, required: ["query"] },
  },
  {
    name: "get_image",
    description: "Full Openverse metadata for one image id.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "image_related",
    description: "Openverse images related to an id.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
];

function reqId(a) {
  const id = String(a.id || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('"id" must be an Openverse UUID');
  return encodeURIComponent(id);
}
function raw(a, keys) {
  const p = { q: String(a.query || "").trim() };
  if (!p.q) throw new Error('"query" is required');
  for (const k of keys) if (a[k] != null && a[k] !== "") p[k] = a[k];
  p.page = Math.max(1, Number(a.page) || 1);
  p.page_size = Math.min(maxPageSize(), Math.max(1, Number(a.page_size) || 20));
  return p;
}

export async function callTool(name, a = {}) {
  let out;
  switch (name) {
    case "search_music": out = await searchKind("music", a); break;
    case "search_sfx": out = await searchKind("sfx", a); break;
    case "download_audio": out = await downloadAudio(a); break;
    case "list_audio_licenses": return listLicenses(a);
    case "search_audio": out = await get("/audio/", raw(a, ["license", "license_type", "source"])); break;
    case "get_audio": { const r = await get(`/audio/${reqId(a)}/`); const ev = evaluate(r); out = { ...r, license_check: { usable: ev.allowed, reasons: ev.reasons, license: ev.name, license_url: ev.url, attribution_required: ev.attributionRequired } }; break; }
    case "audio_related": out = await get(`/audio/${reqId(a)}/related/`); break;
    case "search_images": out = await get("/images/", raw(a, ["license", "license_type", "size", "source"])); break;
    case "get_image": out = await get(`/images/${reqId(a)}/`); break;
    case "image_related": out = await get(`/images/${reqId(a)}/related/`); break;
    default: throw new Error(`Unknown tool: ${name}`);
  }
  const rl = rateLimit();
  return rl && out && typeof out === "object" && !Array.isArray(out) ? { ...out, openverse_rate_limit: rl } : out;
}
