// Build compositions/frames/*.html from spec/*.json + the look + the kit.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { STUDIO, readJson, houseCast, IDENTITY, frameId, makeResolver, resolveCues, isDark, mix, contrast, legible, canvas } from "./common.mjs";
import { LOTTIE_DIR, dicebearSvg, DICEBEAR_BY, HUM, SVG_DIR, lottieColours } from "./assets.mjs";
import { autoRecolor, applySvgMap, hexesIn } from "./autocolor.mjs";

// kit is inlined minified (comments/indent stripped, one line) so frames stay small
const squash = (src, js) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).map((l) => l.trim())
    .filter((l) => l && !(js && l.startsWith("//")))
    .map((l) => (js ? l.replace(/\s+\/\/ .*$/, "") : l)).join(" ");
const KIT_JS = () => squash(readFileSync(join(STUDIO, "kit", "kit.js"), "utf8"), true);
const KIT_CSS = () => squash(readFileSync(join(STUDIO, "kit", "kit.css"), "utf8"), false);
// 2D house helpers (KF.* / KW.* / KM.*), inlined before a project's spec/_shared.js — see kit/house.js
const HOUSE_JS = () => readFileSync(join(STUDIO, "kit", "house.js"), "utf8");
// GSAP's former Club plugins — free for commercial use since 2025 (gsap.com/community/standard-license):
// MorphSVG (shape → shape), DrawSVG (stroke draw-on), SplitText (word/char reveals), MotionPath (move along a curve).
// Tween plugins, so they stay seek-safe; house.js registers them.
const GSAP_PLUGINS = ["MorphSVGPlugin", "DrawSVGPlugin", "SplitText", "MotionPathPlugin"]
  .map((n) => `\n  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/${n}.min.js"></script>`).join("");
// maps (d3-geo + topojson-client, ISC) are only loaded by frames that use them
const MAP_LIBS = `\n  <script src="https://cdn.jsdelivr.net/npm/d3-array@3.2.4/dist/d3-array.min.js"></script>\n  <script src="https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/dist/d3-geo.min.js"></script>\n  <script src="https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js"></script>`;
export const MAP_DIR = join(STUDIO, "vendor", "maps");
// charts (Observable Plot on full d3 — ISC) are only loaded by frames that use them (spec.plot or KP.* in code);
// full d3 already contains d3-array/d3-geo, so a frame with both a chart and a map loads d3 once (+ topojson-client)
const PLOT_LIBS = `
  <script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.17/dist/plot.umd.min.js"></script>`;
const TOPO_LIB = `
  <script src="https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js"></script>`;

// ── house guards (user decisions 2026-10-02) ─────────────────────────────────────────────────
// 2D only: no three.js / WebGL anywhere — a cheap 3D render reads worse than a good 2D illustration.
const NO_3D = /\bTHREE\.|WebGLRenderer|getContext\(\s*["']webgl|three(\.module)?(\.min)?\.js|from\s+["']three["']/;
// No sources on screen: attributions live in video.json → upload.sources (the description), never in the frame.
// Quoted strings that read like a source/credit line (upper-case tokens are how on-screen source lines are set).
const SOURCE_TEXT = [
  /\bSOURCES?\b/, /\bCREDITS?\b/, /\bCOURTESY\b/, /\bVIA [A-Z]{2,}/, /\bQUOTED\b/, /\bILLUSTRATIVE\b/, /\b(PHOTO|VIDEO|FOOTAGE|IMAGE|DATA)\s*:/,
  /\b[Ss]ources?\s*:/, /\b[Cc]ourtesy of\b/, /\b[Pp]hoto\s*:/,
];
const QUOTED = /(["'`])((?:\\.|(?!\1).)*)\1/g;
function houseGuards(id, files, spec, errors) {
  if (spec.three) errors.push(`${id}: "three": true — 3D isn't used in this studio; build the shot in 2D from library assets (STYLE.md → Visual vocabulary)`);
  for (const f of files) {
    if (!existsSync(f)) continue;
    readFileSync(f, "utf8").split(/\r?\n/).forEach((line, n) => {
      const code = line.replace(/^\s*\/\/.*$/, "").replace(/\s\/\/ .*$/, "");
      const where = `${f.split(/[\\/]/).slice(-2).join("/")}:${n + 1}`;
      if (NO_3D.test(code)) errors.push(`${id}: ${where} uses three.js/WebGL — 3D isn't used in this studio; build the shot in 2D from library assets`);
      for (const [q, , txt] of code.matchAll(QUOTED)) {
        if (/^data:/.test(txt) || !SOURCE_TEXT.some((r) => r.test(txt))) continue;
        errors.push(`${id}: ${where} puts a source/credit line on screen (${q.slice(0, 70)}) — sources go in video.json → upload.sources (the description), not in the video`);
      }
    });
  }
}

// Tabler outline icons (vendor/tabler, MIT). Only the icons a spec names are inlined.
let TABLER = null;
export const tabler = () => (TABLER ||= readJson(join(STUDIO, "vendor", "tabler", "outline.json")));
// names from: icon blocks (name / items[].name), any `icon` key (chips/cards items), spec.icons[] (for custom JS)
function iconNames(spec) {
  const out = new Set(spec.icons || []);
  (function walk(o) {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    if (o.type === "icon") { if (o.name) out.add(o.name); for (const it of o.items || []) if (it.name) out.add(it.name); }
    if (typeof o.icon === "string") out.add(o.icon);
    Object.values(o).forEach(walk);
  })(spec.blocks || []);
  return [...out];
}

// Open Peeps figures (tools/peeps, CC0). Every `peep` block names a cast member (video.json → cast) or
// carries body/hair itself; each face it uses is rendered once per palette into assets/peeps/ and the block
// gets b.srcs {face: path} + b.aspect. Colours follow the frame surface: stroke = ink (or accent), fill = bg.
const PEEPS = join(STUDIO, "tools", "peeps");
function peepAssets(P, spec, pal, id, errors) {
  const jobs = [], blocks = [];
  (function walk(o) {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    if (o.type === "peep") blocks.push(o);
    Object.values(o).forEach(walk);
  })([spec.blocks || [], spec.world?.cast || {}]);
  if (!blocks.length) return;
  if (!existsSync(join(PEEPS, "node_modules", "react-peeps"))) { errors.push(`${id}: peep blocks need the figure renderer — run: npm install (in _studio/tools/peeps)`); return; }
  const house = houseCast();
  for (const b of blocks) {
    const own = (P.video.cast || {})[b.figure] || {}, h = house[b.figure];
    if (h?.dicebear) { errors.push(`${id}: ${h.name} is drawn with the avatar block — use {"type": "avatar", "figure": "${b.figure}", "face": "smile"}`); continue; }
    if (h) for (const k of IDENTITY) {
      const v = b[k] ?? own[k];
      if (v != null && v !== (h[k] ?? "None")) errors.push(`${id}: ${h.name || b.figure}'s ${k} is fixed ("${h[k]}") — change body or face instead (_studio/cast.json)`);
    }
    const cast = { ...(h || {}), ...own };
    for (const k of ["body", "hair", "facialHair", "accessory"]) if (b[k]) cast[k] = b[k];
    if (h) for (const k of IDENTITY) cast[k] = h[k];
    if (!cast.body) { errors.push(`${id}: peep "${b.figure || "?"}" has no body — add it to video.json → cast or the block`); continue; }
    const stroke = b.tone === "accent" ? pal.accent : pal.ink, fill = pal.bg;
    const faces = [...new Set([b.face || cast.face || "Calm", ...(b.faces || []).map((f) => f.face)])];
    b.face = faces[0]; b.srcs = {};
    for (const face of faces) {
      const part = { body: cast.body, hair: cast.hair || "Short", facialHair: cast.facialHair, accessory: cast.accessory, face, stroke, fill };
      const h = createHash("sha1").update(JSON.stringify(part)).digest("hex").slice(0, 8);
      const rel = `assets/peeps/${(b.figure || cast.body).replace(/[^\w-]/g, "")}-${face}-${h}.svg`;
      if (!existsSync(join(P.dir, rel))) jobs.push({ ...part, out: join(P.dir, rel) });
      b.srcs[face] = rel;
    }
  }
  if (jobs.length) {
    const jf = join(P.dir, "assets", "peeps", "_jobs.json");
    mkdirSync(join(P.dir, "assets", "peeps"), { recursive: true });
    writeFileSync(jf, JSON.stringify(jobs));
    try { execFileSync(process.execPath, [join(PEEPS, "render.cjs"), jf], { stdio: "pipe" }); }
    catch (e) { errors.push(`${id}: peep render failed — ${String(e.stderr || e.message).split("\n").find((l) => /Error/.test(l)) || e.message}`); return; }
  }
  for (const b of blocks) {
    const f = b.srcs && Object.values(b.srcs)[0];
    const m = f && existsSync(join(P.dir, f)) && readFileSync(join(P.dir, f), "utf8").match(/viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/);
    if (m) b.aspect = +m[2] / +m[1];
  }
}

// ── external visual assets: Lottie / DiceBear avatars / Humaaans ─────────────────────────────
// Each use is recorded in P.credits (→ assets/visual-credits.json → render's description credits).
const hexRgb01 = (h) => { const n = parseInt(h.replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255); };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 255;
// recolor: {"#src": "#dst", …} — every fill/stroke colour within 24/255 of a source becomes its target
export function recolorLottie(data, map) {
  const pairs = Object.entries(map || {}).map(([a, b]) => [hexRgb01(a), hexRgb01(b)]);
  if (!pairs.length) return data;
  const fix = (v) => { if (!Array.isArray(v) || v.length < 3 || typeof v[0] !== "number") return; for (const [a, b] of pairs) if (dist(v, a) < 24) { v[0] = b[0]; v[1] = b[1]; v[2] = b[2]; return; } };
  (function walk(o) {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    if ((o.ty === "fl" || o.ty === "st") && o.c) { const k = o.c.k; if (Array.isArray(k) && typeof k[0] === "number") fix(k); else if (Array.isArray(k)) k.forEach((kf) => { fix(kf.s); fix(kf.e); }); }
    Object.values(o).forEach(walk);
  })(data);
  return data;
}
function walkBlocks(spec, fn) {
  // blocks anywhere in spec.blocks AND inside spec.world (world code places them with K.block(spec, parent))
  (function walk(o) { if (Array.isArray(o)) return o.forEach(walk); if (!o || typeof o !== "object") return; if (o.type) fn(o); Object.values(o).forEach(walk); })([spec.blocks || [], spec.world || {}]);
}
function lottieAssets(P, spec, id, errors) {
  const uses = [];
  walkBlocks(spec, (b) => { if (b.type === "lottie") uses.push(b); });
  for (const u of spec.lotties || []) uses.push(u); // for world/custom code: [{src, as?, recolor?}] → K.lottie({src: as||src})
  const map = {}, ledger = existsSync(join(LOTTIE_DIR, "LICENSES.json")) ? readJson(join(LOTTIE_DIR, "LICENSES.json")) : [];
  for (const u of uses) {
    const f = [join(P.dir, "assets", "lottie", u.src + ".json"), join(LOTTIE_DIR, u.src + ".json")].find(existsSync);
    if (!f) { errors.push(`${id}: lottie "${u.src}" not found — studio lottie search/get`); continue; }
    const key = u.as || (u.recolor || u.hide ? u.src + "-" + createHash("sha1").update(JSON.stringify([u.recolor, u.hide])).digest("hex").slice(0, 6) : u.src);
    const raw = readJson(f);
    const data = recolorLottie(raw, autoRecolor(u.recolor, lottieColours(raw)) || u.recolor);
    // hide: ["layer name" | layer index (ind)] — drop unwanted layers (backgrounds, props baked into the file)
    if (u.hide?.length) data.layers = data.layers.filter((l) => !u.hide.includes(l.nm) && !u.hide.includes(l.ind));
    map[key] = data;
    u.key = key;
    // intro/outro guard: playing the WHOLE file (no from/to) is only safe if `studio lottie frames` showed the
    // subject present at every moment — otherwise it can vanish mid-move (e.g. a truck that drives off and back).
    if (u.from == null && u.to == null) {
      const insp = join(LOTTIE_DIR, "_previews", "frames-" + u.src + ".json");
      if (!existsSync(insp)) P.warnings.push(`${id}: lottie "${u.src}" plays its whole timeline but was never inspected — run: studio lottie frames ${u.src}${u.hide ? " --hide " + u.hide.join(",") : ""}`);
      else { const c = readJson(insp), bad = c.cells.filter((x) => !x.ok); if (bad.length) P.warnings.push(`${id}: lottie "${u.src}" leaves/fades at ${bad.map((x) => "f" + x.frame).join(",")} — set from/to inside ${c.safe.map((r) => r.join("–")).join(" or ") || "a safe range"} (or freeze a pose)`); }
    }
    const e = ledger.find((x) => x.name === u.src);
    if (!e) errors.push(`${id}: lottie "${u.src}" has no licence record (_studio/assets/lottie/LICENSES.json) — fetch it with studio lottie get`);
    else P.credits.set("lottie:" + u.src, { kind: "animation", title: e.title || e.name, creator: e.creator, license: e.license, attribution_required: !!e.attribution_required, attribution: e.attribution, url: e.url });
  }
  return map;
}
// avatar block: {figure (video.json → cast[figure].dicebear) | style+seed+options, faces:[{at, options}]} → b.srcs
function avatarAssets(P, spec, id, errors) {
  walkBlocks(spec, (b) => {
    if (b.type !== "avatar") return;
    // house character (_studio/cast.json): identity locked, named expressions (`face`/`faces[].face`), outfit may change
    const h = houseCast()[b.figure];
    if (h && (b.style || b.seed || (P.video.cast || {})[b.figure])) errors.push(`${id}: ${h.name} is a house character — don't override style/seed or redefine her in video.json → cast`);
    if (h) for (const o of [b.options, ...(b.faces || []).map((f) => f.options)]) for (const k of Object.keys(o || {}))
      if (![...(h.expressionKeys || []), ...(h.outfitKeys || [])].includes(k)) errors.push(`${id}: ${h.name}'s "${k}" is fixed — only ${[...h.expressionKeys, ...h.outfitKeys].join(", ")} may change (_studio/cast.json)`);
    const expr = (name) => {
      if (!name) return {};
      if (!h?.expressions?.[name]) { errors.push(`${id}: face "${name}" — ${h ? h.name + "'s expressions: " + Object.keys(h.expressions).join(", ") : "named faces need a house character"}`); return {}; }
      return h.expressions[name];
    };
    const c = h ? h.dicebear : { ...((P.video.cast || {})[b.figure]?.dicebear || {}), ...(b.style ? { style: b.style } : {}), ...(b.seed ? { seed: b.seed } : {}) };
    if (!c.style || !c.seed) { errors.push(`${id}: avatar needs style+seed (block or video.json → cast.<figure>.dicebear)`); return; }
    const base = { ...(c.options || {}), ...expr(b.face || h?.face), ...(b.options || {}) };
    const variants = [{ name: "base", options: base }, ...(b.faces || []).map((f, i) => ({ name: "f" + i, options: { ...base, ...expr(f.face), ...f.options } }))];
    b.srcs = {};
    for (const v of variants) {
      const h = createHash("sha1").update(JSON.stringify([c.style, c.seed, v.options])).digest("hex").slice(0, 8);
      const rel = `assets/avatars/${c.style}-${String(c.seed).replace(/[^\w-]/g, "")}-${h}.svg`;
      if (!existsSync(join(P.dir, rel))) { mkdirSync(join(P.dir, "assets", "avatars"), { recursive: true }); writeFileSync(join(P.dir, rel), dicebearSvg(c.style, c.seed, v.options)); }
      b.srcs[v.name] = rel;
    }
    const by = DICEBEAR_BY.includes(c.style);
    P.credits.set("dicebear:" + c.style, { kind: "avatar", title: `DiceBear "${c.style}" avatars`, creator: "DiceBear", license: by ? "CC BY 4.0" : "CC0 / free", attribution_required: by,
      attribution: by ? `Avatars: DiceBear "${c.style}" style, CC BY 4.0 (https://www.dicebear.com/styles/${c.style}/).` : `Avatars: DiceBear "${c.style}" (CC0).`, url: `https://www.dicebear.com/styles/${c.style}/` });
  });
}
// humaaan block: {name: "humaaans/standing-1", recolor: {"#src": "#dst"}} → b.src (recoloured copy in the project)
function humaaanAssets(P, spec, id, errors) {
  walkBlocks(spec, (b) => {
    if (b.type !== "humaaan" && b.type !== "art") return;
    const f = b.type === "art" ? join(SVG_DIR, b.name + ".svg") : join(HUM, b.name + ".svg");
    if (!existsSync(f)) { errors.push(`${id}: ${b.type} "${b.name}" not found — ${b.type === "art" ? "studio iconscout save" : "studio humaaans [filter]"}`); return; }
    let svg = readFileSync(f, "utf8");
    svg = applySvgMap(svg, autoRecolor(b.recolor, hexesIn(svg)) || recolorMap(b.recolor));
    const h = createHash("sha1").update(svg).digest("hex").slice(0, 8);
    const rel = `assets/humaaans/${b.name.replace(/[^\w-]/g, "_")}-${h}.svg`;
    mkdirSync(join(P.dir, "assets", "humaaans"), { recursive: true });
    if (!existsSync(join(P.dir, rel))) writeFileSync(join(P.dir, rel), svg);
    const m = svg.match(/viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/) || svg.match(/width="([\d.]+)[^"]*" height="([\d.]+)/);
    b.src = rel; b.aspect = m ? +m[2] / +m[1] : 1.5;
    if (b.type === "art") {
      const led = join(SVG_DIR, "LICENSES.json"), e = existsSync(led) ? readJson(led).find((x) => x.name === b.name) : null;
      if (!e) errors.push(`${id}: art "${b.name}" has no licence record (_studio/assets/svg/LICENSES.json)`);
      else P.credits.set("svg:" + b.name, { kind: "illustration", title: e.title, creator: e.creator, license: e.license, attribution_required: !!e.attribution_required, attribution: e.attribution, url: e.url });
      return;
    }
    P.credits.set("humaaans", { kind: "illustration", title: "Humaaans", creator: "Pablo Stanley", license: "CC0 (humaaans.com); mirror CC BY 4.0", attribution_required: true,
      attribution: "Illustrations: Humaaans by Pablo Stanley (humaaans.com).", url: "https://www.humaaans.com/" });
  });
}

export function fontFaces(look) {
  return look.faces
    .map((f) => `@font-face { font-family: "${f.family}"; src: url("assets/fonts/${f.file}") format("woff2"); font-weight: ${f.weight}; font-style: ${f.style}; font-display: block; }`)
    .join("\n");
}

// Surface palettes: base, 'invert' (bg<->ink) or 'accent' (accent field). Accent/emphasis
// colours are contrast-checked against the new ground and fall back to the new ink.
export function palette(look, surface) {
  const c = { ...look.colors };
  if (surface === "invert") {
    const bg = c.ink, ink = c.bg, dark = isDark(bg);
    const accentOk = contrast(c.accent, bg) >= 2.2;
    const accent = accentOk ? c.accent : ink;
    const onAccent = accentOk ? legible(c.accent, [c.onAccent, bg, ink]) : bg;
    const accentText = legible(bg, [c.accentText, c.accent, dark ? mix(c.accent, "#ffffff", 0.3) : mix(c.accent, "#000000", 0.3), ink]);
    return { ...c, bg, ink, accent, onAccent, accentText, muted: mix(ink, bg, 0.3), faint: mix(ink, bg, 0.5), neg: legible(bg, [c.neg, accentText, ink], 3), pos: legible(bg, [c.pos, ink], 3),
      surface: mix(bg, ink, 0.07), line: mix(bg, ink, 0.3), ground: mix(bg, ink, 0.1) };
  }
  if (surface === "accent") {
    const bg = c.accent, ink = legible(bg, [c.onAccent, c.ink, c.bg]);
    return { ...c, bg, ink, accent: ink, onAccent: bg, accentText: ink, muted: mix(ink, bg, 0.28), faint: mix(ink, bg, 0.5), neg: ink, pos: ink,
      surface: mix(bg, ink, 0.07), line: mix(bg, ink, 0.35), ground: mix(bg, ink, 0.1) };
  }
  return c;
}

function vars(look, surface) {
  const c = palette(look, surface), t = look.type, s = look.shape;
  const v = {
    "--bg": c.bg, "--ink": c.ink, "--muted": c.muted, "--faint": c.faint, "--accent": c.accent, "--accentText": c.accentText,
    "--onAccent": c.onAccent, "--neg": c.neg, "--pos": c.pos, "--surface": c.surface, "--line": c.line, "--ground": c.ground,
    "--fd": look.stacks.display, "--fb": look.stacks.body, "--fm": look.stacks.mono,
    "--dw": t.displayWeight, "--hw": t.headWeight, "--trk": t.tracking, "--case": t.case, "--mcase": t.monoCase, "--mtrk": t.monoTracking,
    "--ds": t.heroScale, "--r": s.radius + "px", "--pill": s.pill + "px", "--bw": s.border + "px",
  };
  return Object.entries(v).map(([k, x]) => `${k}: ${x};`).join(" ");
}

// Full-canvas frames (2026-10-02): the picture is the whole canvas (1080×1920 Shorts / 1920×1080 long-form, see
// common.mjs → FORMATS) and the block stage is the format's stage box. Shorts captions overlay the lower third
// (≈1270–1450); only readable text keeps clear of that band while captions show (build warns on collisions).
// Long-form has no burned-in captions (YouTube CC from studio srt).
const customJsPath = (dir, id) => join(dir, "spec", id + ".js");
// Named asset presets (video.json → "assets"): define a cast member or prop once —
//   "assets": {"meera": {"type": "art", "name": "is-meera-pump", "recolor": {...}}}
// and use it anywhere in a spec as {"use": "meera"} (+ any overrides: {"use": "meera", "bob": false, "px": 900}).
// A preset may itself "use" another (variants: {"use": "meera", "name": "is-meera-balance"}).
export function expandAssets(node, assets, id, depth = 0) {
  if (Array.isArray(node)) return node.map((x) => expandAssets(x, assets, id, depth));
  if (!node || typeof node !== "object") return node;
  let out = node;
  if (typeof node.use === "string") {
    const base = assets[node.use];
    if (!base) throw new Error(`${id}: asset preset "${node.use}" not found — define it in video.json → assets (have: ${Object.keys(assets).join(", ") || "none"})`);
    if (depth > 8) throw new Error(`${id}: asset preset "${node.use}" uses itself`);
    const { use, ...over } = node;
    const b = expandAssets(base, assets, id, depth + 1);
    out = { ...b, ...over, ...(b.recolor && over.recolor && typeof b.recolor === "object" && typeof over.recolor === "object" ? { recolor: { ...b.recolor, ...over.recolor } } : {}) };
  }
  const res = {};
  for (const [k, v] of Object.entries(out)) res[k] = expandAssets(v, assets, id, depth);
  return res;
}
// recolor presets for library SVGs: "house" = unDraw's accent → signal amber, its default skin tones → warm browns
// (Indian context). Combine with explicit pairs: {"preset": "house", "#3f3d56": "#2a2e35"}.
const RECOLOR_PRESETS = {
  house: { "#6c63ff": "#f2a33a", "#ffb6b6": "#c68a63", "#ffb8b8": "#c68a63", "#ffb7b7": "#c68a63", "#ed9da0": "#c68a63", "#a0616a": "#8d5a3b", "#9e616a": "#8d5a3b", "#9f616a": "#8d5a3b" },
};
function recolorMap(r) {
  if (!r) return {};
  if (typeof r === "string") return RECOLOR_PRESETS[r] || {};
  const { preset, ...pairs } = r;
  return { ...(preset ? RECOLOR_PRESETS[preset] || {} : {}), ...pairs };
}
// vendored geodata (vendor/maps, see its README): world = Natural Earth 110m (public domain, world-atlas TopoJSON),
// india = DataMeet india-composite (CC0) — India's official claimed outline incl. all of J&K and Ladakh, simplified.
// Detail (added 2026-10-08): a frame that zooms into a region asks for Natural Earth 1:50m —
//   spec.maps = {"detail": "50m", "region": [[lonW, latS], [lonE, latN]]}  (or a map block with detail + region)
// mapshaper clips world-50m to that box (generous margin — a portrait frame shows more than the box) at build time, so only ~20–60 KB is inlined, and India comes
// from india-detail.json (the official DataMeet outline at ~6× the default detail). Cached in vendor/maps/_cache.
function mapData(errors, id, spec, landscape) {
  const out = {};
  for (const n of ["world", "india"]) {
    const f = join(MAP_DIR, n + ".json");
    if (existsSync(f)) out[n] = readJson(f); else errors.push(`${id}: map data ${n}.json missing in _studio/vendor/maps`);
  }
  const boxes = [];
  if (spec && spec.maps && typeof spec.maps === "object" && spec.maps.detail === "50m" && Array.isArray(spec.maps.region)) boxes.push(spec.maps.region);
  walkBlocks(spec || {}, (b) => { if (b.type === "map" && b.detail === "50m" && Array.isArray(b.region)) boxes.push(b.region); });
  if (!boxes.length) return out;
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const [[a, b], [c, d]] of boxes) { w = Math.min(w, a); s = Math.min(s, b); e = Math.max(e, c); n = Math.max(n, d); }
  // portrait frames show far more latitude than the box; landscape frames more longitude
  const span = Math.max(e - w, n - s), mx = span * (landscape ? 0.9 : 0.6), my = span * (landscape ? 0.6 : 0.9);
  const box = [Math.max(-180, w - mx), Math.max(-90, s - my), Math.min(180, e + mx), Math.min(90, n + my)].map((v) => +v.toFixed(2));
  const cacheDir = join(MAP_DIR, "_cache"), cf = join(cacheDir, "w50-" + box.join("_").replace(/\./g, "p") + ".json");
  if (!existsSync(cf)) {
    const ms = join(STUDIO, "tools", "maps", "node_modules", "mapshaper", "bin", "mapshaper");
    if (!existsSync(ms)) { errors.push(`${id}: detailed maps need mapshaper — run: npm install (in _studio/tools/maps)`); return out; }
    mkdirSync(cacheDir, { recursive: true });
    try { execFileSync(process.execPath, [ms, "-i", join(MAP_DIR, "world-50m.json"), "-target", "countries", "-clip", "bbox=" + box.join(","), "-o", "format=topojson", "id-field=id", cf], { stdio: "pipe" }); }
    catch (err) { errors.push(`${id}: mapshaper clip failed — ${String(err.stderr || err.message).slice(0, 300)}`); return out; }
  }
  out.world = readJson(cf);
  if (existsSync(join(MAP_DIR, "india-detail.json"))) out.india = readJson(join(MAP_DIR, "india-detail.json"));
  return out;
}
// studio data → <project>/data/<name>.json {name, title, unit, source, url, series: [[date, value], …]}
function projectData(dir) {
  const d = join(dir, "data"), out = {};
  if (!existsSync(d)) return out;
  for (const f of readdirSync(d).filter((x) => x.endsWith(".json"))) { const j = readJson(join(d, f)); out[j.name || f.replace(/\.json$/, "")] = j; }
  return out;
}
export function buildFrames(P, sb, audioMeta) {
  const { dir, look } = P;
  P.credits = new Map();
  P.warnings = [];
  const outDir = join(dir, "compositions", "frames");
  mkdirSync(outDir, { recursive: true });
  const words = new Map((audioMeta?.voices || []).map((v) => [v.frame, v.words || []]));
  const total = sb.frames.length;
  const cv = canvas(P.video), ST = cv.stage;
  const errors = [];
  const built = [];
  sb.frames.forEach((f, i) => {
    const id = frameId(f);
    const specPath = join(dir, "spec", id + ".json");
    if (!existsSync(specPath)) { errors.push(`${id}: missing spec/${id}.json`); return; }
    const dur = f.durationSeconds || parseFloat(f.duration) || 4;
    let spec;
    try {
      const raw = expandAssets(readJson(specPath), P.video.assets || {}, id);
      const resolveCue = makeResolver(words.get(f.number) || [], dur, id);
      spec = resolveCues(raw, resolveCue);
    } catch (e) { errors.push(e.message); return; }
    const icons = {};
    for (const n of iconNames(spec)) {
      if (tabler()[n]) icons[n] = tabler()[n].filter(([tag, a]) => !(tag === "path" && a.d === "M0 0h24v24H0z"));
      else errors.push(`${id}: unknown icon "${n}" — find names with: studio icons <word>`);
    }
    peepAssets(P, spec, palette(look, spec.surface), id, errors);
    const lotties = lottieAssets(P, spec, id, errors);
    avatarAssets(P, spec, id, errors);
    humaaanAssets(P, spec, id, errors);
    const hasLottie = Object.keys(lotties).length > 0;
    // maps: a `map` block anywhere, spec.maps, or KM.* calls in the frame's code → load d3-geo and inline the vendored geodata
    const codeText = [customJsPath(dir, id), join(dir, "spec", "_shared.js")].filter(existsSync).map((f) => readFileSync(f, "utf8")).join("\n");
    let usesMap = !!spec.maps || /\bKM\.(draw|map)\b/.test(codeText);
    walkBlocks(spec, (b) => { if (b.type === "map") usesMap = true; });
    const hasMap = usesMap;
    const hasPlot = !!spec.plot || /KP\.(chart|plot)/.test(codeText);
    const maps = hasMap ? mapData(errors, id, spec, cv.landscape) : {};
    // real data (studio data → data/*.json) is available to every frame as DATA[name]
    const data = projectData(dir);
    const customJs = join(dir, "spec", id + ".js");
    const sharedJs = join(dir, "spec", "_shared.js");
    // SPEC.video [{id, src, start?, dur?, w, h, x, y}]: real footage placed as muted framework-owned clips
    // inside an untimed wrapper (data-k-video) — custom code animates the wrapper, never the <video>.
    const videos = (Array.isArray(spec.video) ? spec.video : spec.video ? [spec.video] : []).map((v, k) => {
      if (!v.src || !existsSync(join(dir, v.src))) { errors.push(`${id}: video src not found: ${v.src}`); return ""; }
      const vid = v.id || "v" + k, st = v.start ?? 0, vd = v.dur ?? (dur - st);
      return `<div data-k-video="${vid}" style="position:absolute;left:${v.x ?? 0}px;top:${v.y ?? 0}px;width:${v.w}px;height:${v.h}px;overflow:hidden;border-radius:${v.radius ?? 0}px"><video id="k-${id}-${vid}" class="clip" src="${v.src}" data-start="${st}" data-duration="${vd}" data-track-index="${1 + k}" muted playsinline style="position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover"></video></div>`;
    }).join("");
    const customCss = join(dir, "spec", id + ".css");
    const ground = spec.ground || look.ground;
    const emph = spec.emph || look.emph;
    houseGuards(id, [specPath, customJs, sharedJs], spec, errors);
    const stageTop = spec.chrome && typeof spec.chrome === "object" ? ST.top + 70 : ST.top;
    const cls = ["k-stage", spec.align === "center" ? "a-center" : "", spec.justify ? "j-" + spec.justify : ""].filter(Boolean).join(" ");
    const html = `<template>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>${GSAP_PLUGINS}${hasPlot ? PLOT_LIBS + (hasMap ? TOPO_LIB : "") : hasMap ? MAP_LIBS : ""}${hasLottie ? '\n  <script src="https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie_svg.min.js"></script>' : ""}
  <style>
${fontFaces(look)}
${KIT_CSS()}
${existsSync(customCss) ? readFileSync(customCss, "utf8") : ""}
  </style>
  <div id="root" style="${(vars(look, spec.surface) + ` width: ${cv.W}px; height: ${cv.H}px; --cw: ${cv.W}px; --ch: ${cv.H}px; --sw: ${ST.width}px;`).replace(/"/g, "&quot;")}" data-composition-id="${id}" data-width="${cv.W}" data-height="${cv.H}" data-duration="${dur}">
    <div id="k${String(i + 1).padStart(2, "0")}-bg" class="k-bg g-${ground} clip" data-start="0" data-duration="${dur}" data-track-index="0"></div>
    <div class="k-cam">
      ${videos}
      <div class="k-chrome e-${emph}"></div>
      <div class="${cls} e-${emph}" style="left: ${ST.left}px; width: ${ST.width}px; top: ${stageTop}px; height: ${ST.bottom - stageTop}px;"></div>
    </div>
  </div>
  <script>
    (function () {
      var FID = ${JSON.stringify(id)}, DUR = ${dur}, IDX = ${i + 1}, TOTAL = ${total}, CW = ${cv.W}, CH = ${cv.H};
      var LOOK = ${JSON.stringify({ motion: look.motion, chrome: look.chrome, shape: look.shape, ground: look.ground, ds: look.type.heroScale })};
      var SPEC = ${JSON.stringify(spec)};
      var CUSTOM = {}, ICONS = ${JSON.stringify(icons)}, LOTTIES = ${JSON.stringify(lotties)}, MAPS = ${JSON.stringify(maps)}, DATA = ${JSON.stringify(data)};
${HOUSE_JS()}
${existsSync(sharedJs) ? readFileSync(sharedJs, "utf8") : ""}
${existsSync(customJs) ? readFileSync(customJs, "utf8") : ""}
${KIT_JS()}
    })();
  </script>
</template>
`;
    writeFileSync(join(outDir, id + ".html"), html);
    built.push({ id, spec, dur });
  });
  for (const w of P.warnings) console.log("⚠ " + w);
  if (P.credits.size) writeFileSync(join(dir, "assets", "visual-credits.json"), JSON.stringify([...P.credits.values()], null, 2));
  return { built, errors };
}
