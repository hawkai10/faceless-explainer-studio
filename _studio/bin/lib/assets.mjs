// External asset libraries for the studio (see STUDIO.md → "Asset libraries").
//   lottie search "<words>" [--n 12]   LottieFiles public search → numbered preview contact sheet
//   lottie get <id|noto:<codepoint>> <name>   download into _studio/assets/lottie/<name>.json (+ licence ledger, inspection)
//   lottie info <name>                  inspect a library file (size, fps, length, colours, risky features)
//   avatar <style> <seed> [k=v …]       DiceBear avatar → _studio/assets/avatars/<style>-<seed>.svg (licence-checked)
//   humaaans [filter] | humaaans fetch   list / vendor the Humaaans figures (CC0 / CC BY 4.0 mirror)
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { join, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { STUDIO, die, readJson, writeJson, run } from "./common.mjs";

export const LOTTIE_DIR = join(STUDIO, "assets", "lottie");
const LEDGER = join(LOTTIE_DIR, "LICENSES.json");
const GQL = "https://graphql.lottiefiles.com/2022-08";
const UA = { "User-Agent": "studio-assets/1.0 (local video pipeline)" };

async function gql(query, variables) {
  const r = await fetch(GQL, { method: "POST", headers: { "Content-Type": "application/json", ...UA }, body: JSON.stringify({ query, variables }) });
  const j = await r.json();
  if (j.errors) die("LottieFiles API: " + j.errors.map((e) => e.message).join("; "));
  return j.data;
}
async function download(url, out) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) die(`download failed ${r.status}: ${url}`);
  writeFileSync(out, Buffer.from(await r.arrayBuffer()));
}
const ledger = () => (existsSync(LEDGER) ? readJson(LEDGER) : []);
function record(entry) {
  const l = ledger().filter((e) => e.name !== entry.name);
  l.push(entry);
  writeJson(LEDGER, l);
}

// ── inspection ──────────────────────────────────────────────────────────────
const hex = (c) => "#" + c.slice(0, 3).map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
export function lottieColours(data) {
  const seen = new Map();
  (function walk(o) {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    if ((o.ty === "fl" || o.ty === "st") && o.c) {
      const k = o.c.k;
      const add = (v) => { if (Array.isArray(v) && v.length >= 3 && typeof v[0] === "number") { const h = hex(v); seen.set(h, (seen.get(h) || 0) + 1); } };
      if (Array.isArray(k) && typeof k[0] === "number") add(k); else if (Array.isArray(k)) k.forEach((kf) => { add(kf.s); add(kf.e); });
    }
    Object.values(o).forEach(walk);
  })(data);
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
}
export function inspectLottie(data) {
  const layers = [];
  (function all(ls) { for (const l of ls || []) { layers.push(l); } })(data.layers);
  for (const a of data.assets || []) if (a.layers) layers.push(...a.layers);
  const images = (data.assets || []).filter((a) => a.p && !a.layers).length;
  const text = layers.filter((l) => l.ty === 5).length;
  const expr = JSON.stringify(data).match(/"x":"/g)?.length || 0;
  return { w: data.w, h: data.h, fr: data.fr, ip: data.ip, op: data.op, seconds: +((data.op - data.ip) / data.fr).toFixed(2), layers: layers.length, images, text, expressions: expr, colours: lottieColours(data) };
}
function report(name, info, bytes) {
  const warn = [];
  if (info.images) warn.push(`${info.images} raster image asset(s) — may look soft, can't be recoloured`);
  if (info.text) warn.push(`${info.text} text layer(s) — fonts may not render; avoid`);
  if (info.expressions) warn.push(`${info.expressions} expression(s) — lottie-web may not evaluate them identically`);
  if (bytes > 400000) warn.push(`${(bytes / 1024).toFixed(0)} KB — heavy; it is inlined into the frame`);
  console.log(`${name}: ${info.w}×${info.h} · ${info.fr} fps · frames ${info.ip}–${info.op} (${info.seconds}s) · ${info.layers} layers · ${(bytes / 1024).toFixed(0)} KB`);
  console.log(`  colours (most used first): ${info.colours.slice(0, 12).join(" ")}`);
  if (warn.length) console.log("  ⚠ " + warn.join("\n  ⚠ "));
}

// ── lottie search / get / info ─────────────────────────────────────────────
export async function cmdLottie(args, flag) {
  const sub = args[0];
  mkdirSync(join(LOTTIE_DIR, "_previews"), { recursive: true });
  if (sub === "search") {
    const q = args.slice(1).join(" ");
    if (!q) die('lottie search "<words>"');
    const n = +(flag("n", 12));
    const d = await gql(`query($q:String!,$n:Int){ searchPublicAnimations(query:$q, first:$n){ edges{ node{ id name gifUrl jsonUrl lottieFileSize frameRate createdBy{ username } } } } }`, { q, n });
    const nodes = d.searchPublicAnimations.edges.map((e) => e.node).filter((x) => x.jsonUrl);
    if (!nodes.length) die("no results");
    const tiles = join(LOTTIE_DIR, "_previews", "_tiles");
    rmSync(tiles, { recursive: true, force: true }); mkdirSync(tiles, { recursive: true });
    const font = "C\\:/Windows/Fonts/arial.ttf";
    let k = 0;
    for (const x of nodes) {
      const gif = join(LOTTIE_DIR, "_previews", x.id + ".gif");
      try { if (!existsSync(gif)) await download(x.gifUrl, gif); } catch { continue; }
      // one tile = 3 moments of the animation side by side (start / middle / late) so motion is visible
      const out = join(tiles, String(k).padStart(3, "0") + ".png");
      try {
        const nf = +(run("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", gif], { capture: true }).stdout.trim()) || 3;
        const pick = [0, Math.floor(nf * 0.45), Math.floor(nf * 0.8)].map((n) => `eq(n\,${n})`).join("+");
        run("ffmpeg", ["-y", "-loglevel", "error", "-i", gif, "-vf",
          `select='${pick}',scale=200:200:force_original_aspect_ratio=decrease,pad=200:200:(ow-iw)/2:(oh-ih)/2:color=white,tile=3x1:nb_frames=3:padding=4:color=0xdddddd,drawtext=fontfile='${font}':text='${k + 1}  #${x.id}':x=8:y=6:fontsize=20:fontcolor=black:box=1:boxcolor=0xffd84d`,
          "-vsync", "0", "-frames:v", "1", "-update", "1", out]);
      } catch { continue; }
      console.log(`${String(k + 1).padStart(2)}. #${x.id}  ${x.name}  · by ${x.createdBy?.username || "?"} · ${((x.lottieFileSize || 0) / 1024).toFixed(0)} KB`);
      k++;
    }
    const sheet = join(LOTTIE_DIR, "_previews", "search-" + q.replace(/[^\w]+/g, "-").slice(0, 40) + ".jpg");
    run("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "1", "-i", join(tiles, "%03d.png"), "-vf", `tile=2x${Math.ceil(k / 2)}:padding=8:color=0x333333`, "-frames:v", "1", "-update", "1", sheet]);
    console.log(`\npreview sheet: ${sheet}\n(each tile = start · middle · late frame) → studio lottie get <id> <name>`);
    return;
  }
  if (sub === "get") {
    const [, ref, name] = args;
    if (!ref || !name) die("lottie get <id|noto:<codepoint>> <name>");
    const out = join(LOTTIE_DIR, name + ".json");
    let entry;
    if (ref.startsWith("noto:")) {
      console.log("⚠ the user dislikes Google Noto emoji (\"low effort\") — don't use them in videos; prefer LottieFiles/IconScout animations or Open Peeps");
      const cp = ref.slice(5).toLowerCase();
      await download(`https://fonts.gstatic.com/s/e/notoemoji/latest/${cp}/lottie.json`, out);
      entry = { name, source: "Noto Animated Emoji (Google)", id: cp, url: `https://googlefonts.github.io/noto-emoji-animation/`, creator: "Google",
        license: "CC BY 4.0", attribution_required: true, attribution: "Animated Noto Emoji by Google, licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)." };
    } else {
      const d = await gql(`query($id:Int!){ publicAnimation(id:$id){ id name url jsonUrl createdBy{ username firstName lastName } } }`, { id: +ref });
      const a = d.publicAnimation;
      if (!a?.jsonUrl) die("not found / no JSON for #" + ref);
      await download(a.jsonUrl, out);
      const who = [a.createdBy?.firstName, a.createdBy?.lastName].filter(Boolean).join(" ") || a.createdBy?.username || "unknown";
      entry = { name, source: "LottieFiles", id: a.id, title: a.name, url: a.url, creator: who, license: "Lottie Simple License (free, commercial use, no attribution required)",
        license_url: "https://lottiefiles.com/page/license", attribution_required: false, attribution: `"${a.name}" by ${who} on LottieFiles (Lottie Simple License).` };
    }
    const data = readJson(out), bytes = readFileSync(out).length, info = inspectLottie(data);
    record({ ...entry, file: "assets/lottie/" + name + ".json", downloaded: new Date().toISOString().slice(0, 10), w: info.w, h: info.h, fr: info.fr, seconds: info.seconds });
    report(name, info, bytes);
    return;
  }
  // lottie frames <name> [--n 12]: render the asset itself at n moments across its whole timeline (real lottie-web
  // render through the studio, not the site's GIF) → one sheet. Use it to see intros/outros (appearing, driving off,
  // fading) BEFORE looping or moving an asset, and pick a from/to segment where the subject is fully present.
  if (sub === "frames") {
    const name = args[1];
    const f = name && join(LOTTIE_DIR, name + ".json");
    if (!f || !existsSync(f)) die("lottie frames <name> [--n 12]  (a file in _studio/assets/lottie)");
    const data = readJson(f), n = Math.max(4, Math.min(20, +(flag("n", 12)))), ip = data.ip, op = data.op;
    const frames = Array.from({ length: n }, (_, i) => Math.round(ip + (op - 1 - ip) * i / (n - 1)));
    const proj = join(STUDIO, "..", "zz-lottie-inspect");
    if (!existsSync(join(proj, "video.json"))) run(process.execPath, [join(STUDIO, "bin", "studio.mjs"), "new", "zz-lottie-inspect", "--look", "orbit"], { capture: true });
    writeFileSync(join(proj, "STORYBOARD.md"), `---\nformat: 1080x1920\nduration: 2s\nmessage: "lottie inspector"\narc: concept-explainer\naudience: "internal"\nmode: autonomous\nmusic: none\n---\n\n## Frame 1 — Inspect\n- voiceover: "Inspect."\n- duration: 2s\n- transition_in: cut\n- status: outline\n- src: compositions/frames/01-inspect.html\n- type: hook\n\nLottie inspector sheet.\n`);
    mkdirSync(join(proj, "spec"), { recursive: true });
    const cols = n <= 9 ? 3 : 4, rows = Math.ceil(n / cols), cw = Math.floor(1040 / cols), ch = Math.floor(1820 / rows);
    const cast = {};
    const hide = flag("hide", null) ? String(flag("hide", "")).split(",").map((h) => (/^\d+$/.test(h) ? +h : h)) : undefined;
    frames.forEach((fr, i) => { cast["c" + i] = { type: "lottie", src: name, hide, w: cw - 30, x: 20 + (i % cols) * cw + 5, y: 70 + Math.floor(i / cols) * ch + 30, at: 0, from: fr, to: fr + 1, enter: false }; });
    writeJson(join(proj, "spec", "01-inspect.json"), { frame: false, camera: "still", world: { fn: "inspect", cols, cw, ch, frames, fr: data.fr, name, cast }, blocks: [] });
    writeFileSync(join(proj, "spec", "01-inspect.js"), `CUSTOM.inspect = function (tl, L, K, b) {
  L.style.background = "repeating-conic-gradient(#e6e6e6 0% 25%, #ffffff 0% 50%) 0 0 / 40px 40px";
  var t = K.el("div", "k-mono", L, K.rich(b.name + " · " + b.frames.length + " moments · " + b.fr + " fps"));
  t.style.cssText += ";position:absolute;left:24px;top:18px;font-size:26px;color:#111";
  b.frames.forEach(function (fr, i) {
    var x = 20 + (i % b.cols) * b.cw, y = 70 + Math.floor(i / b.cols) * b.ch;
    var box = K.el("div", "", L); box.style.cssText = "position:absolute;left:" + x + "px;top:" + y + "px;width:" + (b.cw - 10) + "px;height:" + (b.ch - 10) + "px;border:2px solid #999;box-sizing:border-box";
    var lb = K.el("div", "k-mono", L, "f" + fr + " · " + (fr / b.fr).toFixed(2) + "s");
    lb.style.cssText += ";position:absolute;left:" + (x + 8) + "px;top:" + (y + 4) + "px;font-size:20px;color:#111;background:#ffd84d;padding:2px 6px";
  });
  Object.keys(b.cast).forEach(function (k) { K.block(b.cast[k], L); });
};
`);
    run(process.execPath, [join(STUDIO, "bin", "studio.mjs"), "build", "zz-lottie-inspect", "--no-check"], { capture: true });
    run(process.execPath, [join(STUDIO, "bin", "studio.mjs"), "snap", "zz-lottie-inspect", "--at", "0.5"], { capture: true });
    const raw = join(proj, "snapshots", "frame-00-at-0.5s.png");
    if (!existsSync(raw)) die("snapshot failed — run: studio build zz-lottie-inspect");
    const out = join(LOTTIE_DIR, "_previews", "frames-" + name + ".jpg");
    run("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-q:v", "3", out]);
    // automatic check: subject coverage per moment (tools/lottie_coverage.py) → safe from/to ranges
    const cov = JSON.parse(run("python", [join(STUDIO, "tools", "lottie_coverage.py"), raw, JSON.stringify({ cols, cw, ch, frames })], { capture: true }).stdout);
    console.log(`${name}: frames ${ip}–${op} (${((op - ip) / data.fr).toFixed(2)}s) · sheet → ${out}`);
    console.log("  " + cov.cells.map((c) => `f${c.frame}${c.ok ? "" : c.edge ? "⚠edge" : "⚠" + Math.round(c.cover * 100) + "%"}`).join(" "));
    const bad = cov.cells.filter((c) => !c.ok);
    if (!bad.length) console.log("  ✓ subject fully visible at every sampled moment — safe to loop/move whole");
    else console.log(`  ⚠ subject leaves / shrinks / fades at ${bad.map((c) => "f" + c.frame).join(", ")} — DON'T loop the whole file under motion.`
      + `\n  safe ranges (sampled): ${cov.safe.map((r) => r[0] + "–" + r[1]).join(", ") || "none"} → use from/to inside one, or freeze a pose (from: f, to: f+1)`);
    writeJson(join(LOTTIE_DIR, "_previews", "frames-" + name + ".json"), cov);
    return;
  }
  if (sub === "info" || sub === "list") {
    const names = sub === "info" && args[1] ? [args[1]] : readdirSync(LOTTIE_DIR).filter((f) => f.endsWith(".json") && f !== "LICENSES.json").map((f) => f.replace(/\.json$/, ""));
    const l = ledger();
    for (const n of names) {
      const f = join(LOTTIE_DIR, n + ".json");
      if (!existsSync(f)) { console.log(n + ": missing"); continue; }
      report(n, inspectLottie(readJson(f)), readFileSync(f).length);
      const e = l.find((x) => x.name === n);
      console.log("  " + (e ? `${e.source} #${e.id} · ${e.license}` : "⚠ no licence record"));
    }
    return;
  }
  die('lottie search "<words>" [--n 12] · lottie get <id> <name> · lottie info [name] · lottie frames <name> [--n 12]');
}

// ── DiceBear avatars ───────────────────────────────────────────────────────
// Style licences (dicebear.com/licenses): CC0 styles need no credit; CC BY 4.0 styles need a credit line.
export const DICEBEAR_CC0 = ["notionists", "notionists-neutral", "lorelei", "lorelei-neutral", "open-peeps", "thumbs", "pixel-art", "pixel-art-neutral", "shapes", "identicon", "initials", "rings", "glass", "icons"];
export const DICEBEAR_BY = ["adventurer", "adventurer-neutral", "big-ears", "big-ears-neutral", "big-smile", "croodles", "croodles-neutral", "dylan", "micah", "miniavs", "personas", "toon-head", "fun-emoji"];
const DB = join(STUDIO, "tools", "dicebear");
export function dicebearSvg(style, seed, options = {}) {
  if (!existsSync(join(DB, "node_modules", "@dicebear", "core"))) die("DiceBear not installed — run: npm install (in _studio/tools/dicebear)");
  const r = execFileSync(process.execPath, [join(DB, "render.mjs")], { input: JSON.stringify({ style, seed, options }), maxBuffer: 1 << 26 });
  return r.toString();
}
export function cmdAvatar(args) {
  const [style, seed, ...kv] = args;
  if (!style || !seed) die("avatar <style> <seed> [key=value …]   (CC0: " + DICEBEAR_CC0.join(", ") + ")");
  if (!DICEBEAR_CC0.includes(style) && !DICEBEAR_BY.includes(style)) console.log(`⚠ ${style}: licence unknown here — check dicebear.com/licenses before use`);
  if (DICEBEAR_BY.includes(style)) console.log(`⚠ ${style} is CC BY 4.0 — the video description must credit its designer (see dicebear.com/styles/${style})`);
  const options = {};
  for (const p of kv) { const [k, v] = p.split("="); options[k] = v.includes(",") ? v.split(",") : /^-?\d+(\.\d+)?$/.test(v) ? +v : v === "true" ? true : v === "false" ? false : [v]; }
  const dir = join(STUDIO, "assets", "avatars"); mkdirSync(dir, { recursive: true });
  const out = join(dir, `${style}-${seed}.svg`);
  writeFileSync(out, dicebearSvg(style, seed, options));
  console.log("✓ " + out);
}

// ── Humaaans ───────────────────────────────────────────────────────────────
export const HUM = join(STUDIO, "vendor", "humaaans");
export async function cmdHumaaans(args) {
  if (args[0] === "fetch") {
    const tree = await (await fetch("https://api.github.com/repos/Calinou/humaaans/git/trees/HEAD?recursive=1", { headers: UA })).json();
    const svgs = tree.tree.filter((x) => x.path.startsWith("Flat Assets/") && x.path.endsWith(".svg"));
    for (const s of svgs) {
      const rel = s.path.replace(/^Flat Assets\//, "").replace(/Single Pieces\//, "").replace(/ /g, "-").toLowerCase();
      const out = join(HUM, rel);
      mkdirSync(join(out, ".."), { recursive: true });
      if (!existsSync(out)) await download("https://raw.githubusercontent.com/Calinou/humaaans/HEAD/" + s.path.split("/").map(encodeURIComponent).join("/"), out);
    }
    writeFileSync(join(HUM, "README.md"), "# Humaaans (vendored)\n\nMix-&-match people by Pablo Stanley — https://www.humaaans.com/\nSource mirror: https://github.com/Calinou/humaaans (Flat Assets). humaaans.com states CC0; the mirror's LICENSE file is CC BY 4.0, so credit \"Humaaans by Pablo Stanley\" in descriptions to be safe.\n");
    console.log(`✓ ${svgs.length} SVGs → ${HUM}`);
    return;
  }
  if (!existsSync(HUM)) die("humaaans not vendored — run: studio humaaans fetch");
  const all = [];
  (function walk(d, pre) { for (const f of readdirSync(d, { withFileTypes: true })) { if (f.isDirectory()) walk(join(d, f.name), pre + f.name + "/"); else if (f.name.endsWith(".svg")) all.push(pre + f.name.replace(/\.svg$/, "")); } })(HUM, "");
  const q = (args[0] || "").toLowerCase();
  for (const n of all.filter((n) => n.includes(q))) console.log(n);
}

// ── IconScout (via the IconScout MCP connector) ────────────────────────────────
// The agent searches with the MCP tool search_assets, saves the result list to a JSON file, then:
//   iconscout sheet <results.json>                         numbered preview sheet (start · middle · late of each preview video)
//   iconscout save <slug> <name> "<download_url>" [--creator X] [--title Y] [--premium] [--attribution]
//       download_url comes from the MCP tool download_asset; json → lottie library, svg → svg library; licence recorded.
export const SVG_DIR = join(STUDIO, "assets", "svg");
export async function cmdIconscout(args, flag) {
  const sub = args[0];
  mkdirSync(join(LOTTIE_DIR, "_previews"), { recursive: true });
  if (sub === "sheet") {
    // either a results JSON file, or lottie identifiers ("free-global-delivery-animation_7114633" …) whose preview
    // video URL is derived: cdnl.iconscout.com/lottie/<tier>/thumb/<base>-gif-download-<id>.mp4
    const f = args[1];
    if (!f) die("iconscout sheet <results.json | identifier …> [--name label]");
    let items;
    if (existsSync(f)) { items = readJson(f); if (!Array.isArray(items)) items = items.results || []; }
    else items = args.slice(1).map((idf) => { const m = idf.match(/^(.*)_(\d+)$/); const tier = idf.startsWith("free-") ? "free" : "premium";
      if (!m) return null;
      if (/-illustration$|-icon$/.test(m[1])) { const kind = m[1].endsWith("-icon") ? "icon" : "illustration";
        return { slug: idf, name: m[1], preview: kind === "icon" ? `https://cdn.iconscout.com/icon/${tier}/png-512/${m[1]}-svg-download-png-${m[2]}.png` : `https://cdni.iconscout.com/illustration/${tier}/thumb/${m[1]}-svg-download-png-${m[2]}.png` }; }
      return { slug: idf, name: m[1], preview_video: `https://cdnl.iconscout.com/lottie/${tier}/thumb/${m[1]}-gif-download-${m[2]}.mp4` }; }).filter(Boolean);
    const tiles = join(LOTTIE_DIR, "_previews", "_tiles");
    rmSync(tiles, { recursive: true, force: true }); mkdirSync(tiles, { recursive: true });
    const font = "C\:/Windows/Fonts/arial.ttf";
    let k = 0;
    for (const x of items) {
      const src = x.preview_video || x.preview;
      if (!src) continue;
      const ext = src.split("?")[0].split(".").pop();
      const local = join(LOTTIE_DIR, "_previews", "is-" + x.slug + "." + ext);
      try { if (!existsSync(local)) await download(src, local); } catch { continue; }
      const out = join(tiles, String(k).padStart(3, "0") + ".png");
      const label = `drawtext=fontfile='${font}':text='${k + 1}':x=8:y=6:fontsize=24:fontcolor=black:box=1:boxcolor=0xffd84d`;
      try {
        if (ext === "mp4" || ext === "gif") {
          const nf = +(run("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", local], { capture: true }).stdout.trim()) || 3;
          const pick = [0, Math.floor(nf * 0.45), Math.floor(nf * 0.8)].map((n) => `eq(n\\,${n})`).join("+");
          run("ffmpeg", ["-y", "-loglevel", "error", "-i", local, "-vf", `select='${pick}',scale=200:200:force_original_aspect_ratio=decrease,pad=200:200:(ow-iw)/2:(oh-ih)/2:color=white,tile=3x1:nb_frames=3:padding=4:color=0xdddddd,${label}`, "-vsync", "0", "-frames:v", "1", "-pix_fmt", "rgb24", "-update", "1", out]);
        } else {
          run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=white:s=608x200", "-i", local, "-filter_complex",
            `[1]scale=608:200:force_original_aspect_ratio=decrease[f];[0][f]overlay=(W-w)/2:(H-h)/2,${label}`, "-frames:v", "1", "-pix_fmt", "rgb24", "-update", "1", out]);
        }
      } catch { continue; }
      console.log(`${String(k + 1).padStart(2)}. ${x.slug}  ${x.name} · ${x.contributor || "?"}${x.is_premium ? " · PREMIUM" : ""}${x.attribution_required ? " · attribution" : ""}`);
      k++;
    }
    if (!k) die("no previews");
    const sheet = join(LOTTIE_DIR, "_previews", "iconscout-" + (flag("name", null) || basename(f).replace(/\.json$/, "")).replace(/[^\w-]+/g, "-").slice(0, 40) + ".jpg");
    run("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "1", "-i", join(tiles, "%03d.png"), "-vf", `tile=2x${Math.ceil(k / 2)}:padding=8:color=0x333333`, "-frames:v", "1", "-update", "1", sheet]);
    console.log("\npreview sheet: " + sheet);
    return;
  }
  if (sub === "save") {
    const [, slug, name, url] = args;
    if (!slug || !name || !url) die('iconscout save <slug> <name> "<download_url>" [--creator X] [--title Y]');
    // 2D only (2026-10-02): 3D renders / GLB models are not used — search with asset: illustration | lottie | icon
    if (/(^|[-_/])3d([-_/]|$)|\.(glb|gltf)(\?|$)|%2F3d%2F|\/3d\//i.test(slug + " " + url)) die("3D assets aren't used in this studio (2D only) — pick a flat illustration, icon or Lottie (STYLE.md → Visual vocabulary)");
    const tmp = join(LOTTIE_DIR, "_previews", "_dl-" + name);
    await download(url, tmp);
    const head = readFileSync(tmp, "utf8").slice(0, 200).trim();
    const isJson = head.startsWith("{"), isSvg = /<svg|<\?xml/.test(head);
    if (!isJson && !isSvg) die("unexpected download (not Lottie JSON or SVG): " + head.slice(0, 80));
    const premium = flag("premium", null) != null || process.argv.includes("--premium");
    const entry = { name, source: "IconScout", id: slug, title: flag("title", slug), url: "https://iconscout.com/" + (isJson ? "lottie/" : "") + slug, creator: flag("creator", "IconScout contributor"),
      license: premium ? "IconScout premium (subscription)" : "IconScout free licence (commercial use" + (process.argv.includes("--attribution") ? ", attribution required)" : ", no attribution required)"),
      attribution_required: process.argv.includes("--attribution"), // pass --attribution when search shows attribution_required: true
      attribution: `"${flag("title", slug)}" by ${flag("creator", "IconScout contributor")} on IconScout.`, downloaded: new Date().toISOString().slice(0, 10) };
    if (isJson) {
      const out = join(LOTTIE_DIR, name + ".json");
      writeFileSync(out, readFileSync(tmp)); rmSync(tmp);
      const data = readJson(out), info = inspectLottie(data);
      record({ ...entry, file: "assets/lottie/" + name + ".json", w: info.w, h: info.h, fr: info.fr, seconds: info.seconds });
      report(name, info, readFileSync(out).length);
    } else {
      mkdirSync(SVG_DIR, { recursive: true });
      const out = join(SVG_DIR, name + ".svg");
      writeFileSync(out, readFileSync(tmp)); rmSync(tmp);
      const led = join(SVG_DIR, "LICENSES.json"), l = existsSync(led) ? readJson(led).filter((e) => e.name !== name) : [];
      l.push({ ...entry, file: "assets/svg/" + name + ".svg" }); writeJson(led, l);
      const cols = [...new Set((readFileSync(out, "utf8").match(/#[0-9a-fA-F]{6}\b/g) || []).map((c) => c.toLowerCase()))];
      console.log(`${name}: svg · ${(readFileSync(out).length / 1024).toFixed(0)} KB · colours: ${cols.slice(0, 14).join(" ")}`);
    }
    return;
  }
  die('iconscout sheet <results.json> · iconscout save <slug> <name> "<download_url>" [--creator X] [--title Y]');
}

// ── unDraw (undraw.co — free for commercial use, no attribution; don't redistribute the catalogue) ────────────
// Flat illustrations in one consistent family with a single recolourable accent (#6c63ff) → our signal amber via
// `recolor: "house"` on the art block. No key needed (the site's public search endpoint).
//   undraw search <words…>     numbered preview sheet of the top matches
//   undraw get <slug> <name>   save into the shared svg library (assets/svg/<name>.svg) + licence ledger → art block
const UNDRAW_CACHE = join(LOTTIE_DIR, "_previews", "undraw-search.json");
function rasterSvg(svgFile, pngFile, width) {
  const tool = join(STUDIO, "tools", "svgraster");
  if (!existsSync(join(tool, "node_modules", "@resvg", "resvg-js"))) die("preview renderer not installed — run: npm install (in _studio/tools/svgraster)");
  execFileSync(process.execPath, ["-e", `const {Resvg}=require(${JSON.stringify(join(tool, "node_modules", "@resvg", "resvg-js"))});const fs=require("fs");fs.writeFileSync(process.argv[2],new Resvg(fs.readFileSync(process.argv[1]),{fitTo:{mode:"width",value:${width}},background:"#ffffff"}).render().asPng())`, svgFile, pngFile]);
}
export async function cmdUndraw(args, flag) {
  const sub = args[0];
  mkdirSync(join(LOTTIE_DIR, "_previews"), { recursive: true });
  if (sub === "search") {
    const q = args.slice(1).join(" ");
    if (!q) die("undraw search <words>");
    const r = await fetch("https://undraw.co/api/search?q=" + encodeURIComponent(q));
    if (!r.ok) die("unDraw search failed: HTTP " + r.status);
    const items = ((await r.json()).results || []).slice(0, Number(flag("n", 12)));
    if (!items.length) die("no unDraw results for: " + q);
    const cache = existsSync(UNDRAW_CACHE) ? readJson(UNDRAW_CACHE) : {};
    const tiles = join(LOTTIE_DIR, "_previews", "_tiles");
    rmSync(tiles, { recursive: true, force: true }); mkdirSync(tiles, { recursive: true });
    const font = "C\:/Windows/Fonts/arial.ttf";
    let k = 0;
    for (const it of items) {
      cache[it.newSlug] = { title: it.title, media: it.media };
      const svg = join(LOTTIE_DIR, "_previews", "ud-" + it.newSlug + ".svg"), png = join(tiles, "src-" + k + ".png");
      try { if (!existsSync(svg)) await download(it.media, svg); rasterSvg(svg, png, 400); } catch { continue; }
      run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=white:s=420x320", "-i", png, "-filter_complex",
        `[1]scale=400:300:force_original_aspect_ratio=decrease[f];[0][f]overlay=(W-w)/2:(H-h)/2,drawtext=fontfile='${font}':text='${k + 1}':x=8:y=6:fontsize=24:fontcolor=black:box=1:boxcolor=0xffd84d`,
        "-frames:v", "1", "-pix_fmt", "rgb24", "-update", "1", join(tiles, String(k).padStart(3, "0") + ".png")]);
      console.log(`${String(k + 1).padStart(2)}. ${it.newSlug.padEnd(32)} ${it.title}`);
      k++;
    }
    writeJson(UNDRAW_CACHE, cache);
    for (const f of readdirSync(tiles).filter((x) => x.startsWith("src-"))) rmSync(join(tiles, f));
    const sheet = join(LOTTIE_DIR, "_previews", "undraw-" + q.replace(/[^\w-]+/g, "-").slice(0, 40) + ".jpg");
    run("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "1", "-i", join(tiles, "%03d.png"), "-vf", `tile=3x${Math.ceil(k / 3)}:padding=8:color=0x333333`, "-frames:v", "1", "-update", "1", sheet]);
    console.log("\npreview sheet: " + sheet + "\nthen: studio undraw get <slug> <name>  → art block {name, recolor: \"house\"}");
    return;
  }
  if (sub === "get") {
    const [, slug, name] = args;
    if (!slug || !name) die("undraw get <slug> <name>");
    const cache = existsSync(UNDRAW_CACHE) ? readJson(UNDRAW_CACHE) : {};
    const media = cache[slug]?.media || `https://cdn.undraw.co/illustration/${slug}.svg`;
    mkdirSync(SVG_DIR, { recursive: true });
    const out = join(SVG_DIR, name + ".svg");
    await download(media, out);
    if (!/<svg/.test(readFileSync(out, "utf8").slice(0, 400))) { rmSync(out); die("not an SVG: " + media); }
    const led = join(SVG_DIR, "LICENSES.json"), l = existsSync(led) ? readJson(led).filter((e) => e.name !== name) : [];
    l.push({ name, source: "unDraw", id: slug, title: cache[slug]?.title || slug, url: "https://undraw.co/illustrations", creator: "Katerina Limpitsouni (unDraw)",
      license: "unDraw license (free for commercial use, no attribution required)", attribution_required: false,
      attribution: `"${cache[slug]?.title || slug}" from unDraw.`, file: "assets/svg/" + name + ".svg", downloaded: new Date().toISOString().slice(0, 10) });
    writeJson(led, l);
    const cols = [...new Set((readFileSync(out, "utf8").match(/#[0-9a-fA-F]{6}\b/g) || []).map((c) => c.toLowerCase()))];
    console.log(`${name}: svg · ${(readFileSync(out).length / 1024).toFixed(0)} KB · colours: ${cols.slice(0, 14).join(" ")}\n  use: {"type": "art", "name": "${name}", "recolor": "house"}`);
    return;
  }
  die("undraw search <words> · undraw get <slug> <name>");
}
export { download, rasterSvg };
