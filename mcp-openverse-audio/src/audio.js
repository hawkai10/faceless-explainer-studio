// search_music / search_sfx: Openverse audio search with a license-first strategy.
//
// Why not Openverse's `category` filter? It is empty for Freesound and Wikimedia records, so
// category=sound_effect silently drops ~600k sound effects. Instead each kind defaults to the
// sources that carry it and filters by duration; `category` here is a keyword appended to the query.
import { get, maxPageSize } from "./openverse.js";
import { evaluate, allowedCodes, LICENSES, NEVER } from "./licenses.js";

export const SOURCES = ["jamendo", "freesound", "wikimedia_audio"];
export const KINDS = {
  music: { sources: ["jamendo", "wikimedia_audio"], minSeconds: 30, maxSeconds: null },
  sfx: { sources: ["freesound", "wikimedia_audio"], minSeconds: null, maxSeconds: 30 },
};
// Keyword categories → extra query terms (kept small and predictable).
export const SFX_CATEGORIES = {
  transition: "whoosh", whoosh: "whoosh", impact: "impact hit", ui: "click interface", click: "click",
  notification: "notification chime", ambience: "ambience", nature: "nature", weather: "rain wind",
  foley: "foley", riser: "riser", swoosh: "swoosh", cash: "cash register coins", typing: "keyboard typing",
};
export const MUSIC_CATEGORIES = {
  corporate: "corporate", ambient: "ambient", cinematic: "cinematic", electronic: "electronic",
  acoustic: "acoustic", classical: "classical", piano: "piano", lofi: "lofi", upbeat: "upbeat",
  calm: "calm", jazz: "jazz", hiphop: "hip hop", orchestral: "orchestral",
};
const UNPLAYABLE = new Set(["mid", "midi"]);
const LENGTHS = [["shortest", 0, 30], ["short", 30, 120], ["medium", 120, 600], ["long", 600, Infinity]];

function lengthBuckets(min, max) {
  const lo = min ?? 0, hi = max ?? Infinity;
  const b = LENGTHS.filter(([, a, z]) => a < hi && z > lo).map(([n]) => n);
  return b.length === LENGTHS.length ? undefined : b.join(",");
}
function csv(v) { return v == null ? [] : (Array.isArray(v) ? v : String(v).split(",")).map((s) => s.trim().toLowerCase()).filter(Boolean); }
function num(v) { return v == null || v === "" ? null : Number(v); }

/** Compact, license-annotated view of one Openverse audio record. */
export function summarize(rec, ev) {
  return {
    id: rec.id,
    title: rec.title || "(untitled)",
    creator: rec.creator || null,
    source: rec.source || rec.provider || null,
    duration_s: rec.duration != null ? Math.round(rec.duration / 100) / 10 : null,
    filetype: rec.filetype || null,
    genres: rec.genres || [],
    tags: (rec.tags || []).map((t) => t.name).slice(0, 8),
    source_url: rec.foreign_landing_url || null,
    preview_url: rec.url || null,
    license: {
      code: ev.code, name: ev.name, url: ev.url, tier: ev.tier,
      public_domain: ev.publicDomain, attribution_required: ev.attributionRequired, share_alike: ev.shareAlike,
      commercial_use: ev.allowed,
    },
  };
}

/**
 * @param {"music"|"sfx"} kind
 * @param {object} a  tool arguments (see tool schema in tools.js)
 */
export async function searchKind(kind, a) {
  const cfg = KINDS[kind];
  const query = String(a.query || "").trim();
  if (!query) throw new Error('"query" is required, e.g. "calm piano for an explainer"');
  const allowShareAlike = !!a.allow_share_alike;
  const mode = a.license_mode || "prefer_public_domain";
  if (!["prefer_public_domain", "public_domain_only", "commercial"].includes(mode)) throw new Error(`license_mode must be prefer_public_domain | public_domain_only | commercial`);

  // Which licenses may appear at all.
  let permitted = allowedCodes(allowShareAlike);
  if (a.license) {
    const asked = csv(a.license);
    const bad = asked.filter((c) => !permitted.includes(c));
    if (bad.length) throw new Error(`license ${bad.join(", ")} is not usable: ${bad.map((c) => NEVER[c] || (LICENSES[c]?.shareAlike ? "share-alike needs allow_share_alike" : "unrecognised")).join("; ")}. Usable: ${permitted.join(", ")}`);
    permitted = asked;
  }
  if (mode === "public_domain_only") permitted = permitted.filter((c) => LICENSES[c].publicDomain);
  if (!permitted.length) throw new Error("no usable license left after filters");
  // Pass order: public domain first, then attribution licenses (prefer mode = two passes).
  const pd = permitted.filter((c) => LICENSES[c].publicDomain), rest = permitted.filter((c) => !LICENSES[c].publicDomain);
  const passes = mode === "commercial" ? [permitted] : [pd, rest].filter((p) => p.length);

  const sources = a.source ? csv(a.source) : cfg.sources;
  const badSrc = sources.filter((s) => !SOURCES.includes(s));
  if (badSrc.length) throw new Error(`unknown source ${badSrc.join(", ")}; use ${SOURCES.join(", ")}`);
  const minS = num(a.min_seconds) ?? cfg.minSeconds, maxS = num(a.max_seconds) ?? cfg.maxSeconds;
  const cats = kind === "sfx" ? SFX_CATEGORIES : MUSIC_CATEGORIES;
  const catTerm = a.category ? cats[String(a.category).toLowerCase()] ?? String(a.category) : "";
  const q = [query, catTerm].filter(Boolean).join(" ");
  const want = Math.min(20, Math.max(1, num(a.limit) ?? 8));

  const results = [], seen = new Set(), filtered = {};
  const drop = (why) => { filtered[why] = (filtered[why] || 0) + 1; };
  let requests = 0, total = 0;
  for (const lic of passes) {
    if (results.length >= want) break;
    const data = await get("/audio/", {
      q, license: lic.join(","), source: sources.join(","), length: lengthBuckets(minS, maxS),
      page_size: Math.min(maxPageSize(), want * 3), mature: "false",
    });
    requests++; total += data.result_count || 0;
    for (const rec of data.results || []) {
      if (results.length >= want) break;
      if (seen.has(rec.id)) continue;
      seen.add(rec.id);
      const ev = evaluate(rec, { allowShareAlike });
      if (!ev.allowed) { drop("license: " + ev.reasons[0]); continue; }
      if (UNPLAYABLE.has(String(rec.filetype).toLowerCase())) { drop("MIDI (not a playable recording)"); continue; }
      const d = rec.duration != null ? rec.duration / 1000 : null;
      if (d == null && (minS != null || maxS != null)) { drop("unknown duration"); continue; }
      if (minS != null && d < minS) { drop(`shorter than ${minS}s`); continue; }
      if (maxS != null && d > maxS) { drop(`longer than ${maxS}s`); continue; }
      if (a.instrumental && kind === "music") {
        const tags = (rec.tags || []).map((t) => t.name.toLowerCase());
        if (tags.includes("vocal") || (rec.source === "jamendo" && !tags.includes("instrumental") && !/instrumental/i.test(rec.title || ""))) { drop("not tagged instrumental"); continue; }
      }
      results.push(summarize(rec, ev));
    }
  }
  results.sort((x, y) => x.license.tier - y.license.tier); // stable: relevance order kept within a tier
  return {
    kind,
    query: q,
    filters: { license_mode: mode, licenses: permitted, sources, min_seconds: minS, max_seconds: maxS, category: a.category || null, instrumental: !!a.instrumental },
    count: results.length,
    results,
    filtered_out: filtered,
    note: results.length ? "Pick by id and call download_audio. Public-domain (tier 0) results are listed first." : "Nothing usable matched — try broader words, drop category, widen the duration, or use license_mode \"commercial\".",
    openverse_requests: requests,
  };
}
