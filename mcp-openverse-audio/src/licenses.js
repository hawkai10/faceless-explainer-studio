// License policy — the single place that decides whether an Openverse audio record may be used.
//
// Rules (see README "License policy"):
//   tier 0  cc0, pdm            public domain — preferred, no attribution required
//   tier 1  by                  commercial use OK, attribution required
//   tier 2  by-sa               commercial use OK, attribution + share-alike; ONLY when the caller
//                               passes allow_share_alike (putting music under a video makes the
//                               video an adaptation, which would then have to be BY-SA too)
//   never   by-nd, by-nc*, sampling+, nc-sampling+, anything unrecognised, or any record whose
//           license URL / version / source page / (for BY) creator is missing — "unclear" means no.

export const LICENSES = {
  cc0: { tier: 0, name: () => "CC0 1.0", url: () => "https://creativecommons.org/publicdomain/zero/1.0/", attribution: false, shareAlike: false, publicDomain: true },
  pdm: { tier: 0, name: () => "Public Domain Mark 1.0", url: () => "https://creativecommons.org/publicdomain/mark/1.0/", attribution: false, shareAlike: false, publicDomain: true },
  by: { tier: 1, name: (v) => `CC BY ${v}`, url: (v) => `https://creativecommons.org/licenses/by/${v}/`, attribution: true, shareAlike: false, publicDomain: false },
  "by-sa": { tier: 2, name: (v) => `CC BY-SA ${v}`, url: (v) => `https://creativecommons.org/licenses/by-sa/${v}/`, attribution: true, shareAlike: true, publicDomain: false },
};

export const NEVER = {
  "by-nd": "no-derivatives: syncing audio to video is an adaptation",
  "by-nc": "non-commercial only",
  "by-nc-sa": "non-commercial only",
  "by-nc-nd": "non-commercial only",
  "sampling+": "retired Sampling+ license (unclear commercial scope)",
  "nc-sampling+": "non-commercial only",
};

/** License codes a caller may ask for, given the share-alike opt-in. */
export function allowedCodes(allowShareAlike = false) {
  return Object.keys(LICENSES).filter((c) => allowShareAlike || !LICENSES[c].shareAlike);
}

const CC_URL = /^https:\/\/creativecommons\.org\/(licenses|publicdomain)\//;

/**
 * Evaluate one Openverse audio record against the policy.
 * @returns {{allowed:boolean, reasons:string[], code:string, version:string|null, tier:number|null,
 *            name:string|null, url:string|null, attributionRequired:boolean, shareAlike:boolean, publicDomain:boolean}}
 */
export function evaluate(rec, { allowShareAlike = false } = {}) {
  const code = String(rec?.license || "").toLowerCase().trim();
  const version = rec?.license_version ? String(rec.license_version).trim() : null;
  const reasons = [];
  const def = LICENSES[code];
  if (!code) reasons.push("no license on record");
  else if (NEVER[code]) reasons.push(`${code}: ${NEVER[code]}`);
  else if (!def) reasons.push(`unrecognised license "${code}"`);
  else if (def.shareAlike && !allowShareAlike) reasons.push(`${code}: share-alike (pass allow_share_alike to permit)`);

  let url = null, name = null;
  if (def) {
    if (!def.publicDomain && !version) reasons.push("license version missing — cannot identify the exact license");
    const canonical = def.url(version);
    // Prefer Openverse's own license_url when it is a real creativecommons.org URL for the same license.
    const given = rec?.license_url ? String(rec.license_url) : "";
    const frag = { cc0: "/publicdomain/zero/", pdm: "/publicdomain/mark/", by: "/licenses/by/", "by-sa": "/licenses/by-sa/" }[code];
    if (given && CC_URL.test(given) && !given.includes(frag)) reasons.push(`license URL (${given}) does not match license "${code}"`);
    url = CC_URL.test(given) ? given : version || def.publicDomain ? canonical : null;
    if (!url) reasons.push("license URL missing");
    name = def.name(version || "");
    if (def.attribution && !String(rec?.creator || "").trim()) reasons.push("attribution required but creator is unknown");
  }
  if (!rec?.id) reasons.push("no Openverse id");
  if (!/^https?:\/\//.test(String(rec?.foreign_landing_url || ""))) reasons.push("no source page URL (provenance unknown)");
  if (rec?.mature) reasons.push("marked mature");

  return {
    allowed: reasons.length === 0,
    reasons,
    code,
    version,
    tier: def ? def.tier : null,
    name,
    url,
    attributionRequired: def ? def.attribution : true,
    shareAlike: def ? def.shareAlike : false,
    publicDomain: def ? def.publicDomain : false,
  };
}

/** Human attribution line. Uses Openverse's own text when present, else builds a TASL line. */
export function attributionText(rec, ev) {
  if (rec?.attribution && String(rec.attribution).trim()) return String(rec.attribution).trim();
  const title = rec?.title ? `"${rec.title}"` : "This work";
  const by = rec?.creator ? ` by ${rec.creator}` : "";
  if (ev.publicDomain) return `${title}${by} is in the public domain (${ev.name}). ${ev.url}`;
  return `${title}${by} is licensed under ${ev.name}. To view a copy of this license, visit ${ev.url}`;
}
