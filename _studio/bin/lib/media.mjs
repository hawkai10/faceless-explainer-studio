// Real-world media for the studio (added 2026-10-08; see STUDIO.md → "Media tools"). Images and video may come from any
// source (user decision 2026-10-08) — every one is still credited in the description (upload.sources + PHOTO-CREDITS.md).
//   article <url> [slug] [--name n]           article text + title/date/author (trafilatura; falls back to headless Chrome)
//   snip <slug> <url> <name> "<phrase|alt>"   cropped screenshot of the real article, key phrase lit amber (house rule 7)
//   clip <slug> <url> --from s --to s [--name n] [--credit "…"]   a few seconds of real footage (yt-dlp) → assets/clip/<n>.mp4
//   cutout <slug> <image> [--name n] [--model m]                  subject cut out of a photo → assets/photos/<n>.png (rembg)
//   upscale <slug> <image> [--name n] [--model photo|fidelity|art] [--scale 2|3|4]   AI upscale (Upscayl / Real-ESRGAN, GPU)
//   iconify search <words> [--prefix p] [--n 24] · iconify get <prefix:icon> <name>    any of ~200k open icons → svg library
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, copyFileSync, appendFileSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { STUDIO, die, readJson, writeJson, run } from "./common.mjs";
import { SVG_DIR, LOTTIE_DIR, download, rasterSvg } from "./assets.mjs";

const PY = join(STUDIO, ".venv-media", "Scripts", "python.exe");
const MEDIA = join(STUDIO, "tools", "media", "media.py");
const UPSCAYL = join(STUDIO, "tools", "upscayl");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

function needPy() {
  if (!existsSync(PY)) die("media venv missing — run in _studio: python -m venv .venv-media && .venv-media\\Scripts\\python -m pip install trafilatura \"rembg[cpu]\"");
}
function py(args) { needPy(); return run(PY, ["-I", "-X", "utf8", MEDIA, ...args], { capture: true }).stdout.trim().split(/\r?\n/).pop(); }

// puppeteer-core lives in the HyperFrames npx cache; Chrome is the installed browser
export function puppeteerPath() {
  const root = join(process.env.LOCALAPPDATA || "", "npm-cache", "_npx");
  if (existsSync(root)) for (const d of readdirSync(root)) { const p = join(root, d, "node_modules", "puppeteer-core"); if (existsSync(p)) return p; }
  die("puppeteer-core not found in the npx cache — run any `studio build` once (it installs HyperFrames)");
}
function stem(p) { return basename(p, extname(p)); }
function credit(P, line, row) {
  const v = P.video; v.upload = v.upload || {}; v.upload.sources = v.upload.sources || [];
  if (!v.upload.sources.includes(line)) { v.upload.sources.push(line); writeJson(join(P.dir, "video.json"), v); }
  const pc = join(P.dir, "PHOTO-CREDITS.md");
  if (!existsSync(pc)) writeFileSync(pc, `# Photo & footage credits — ${v.slug} (description only, never on screen)\n\n| file | what | source |\n|---|---|---|\n`);
  if (row && !readFileSync(pc, "utf8").includes(row.split("|")[1])) appendFileSync(pc, row + "\n");
}

// ── article text (research) ─────────────────────────────────────────────────
export async function cmdArticle(P, url, flag) {
  if (!/^https?:\/\//.test(url || "")) die("article <url> [slug] [--name n]");
  let j = JSON.parse(py(["article", url]) || "{}");
  if (j.error) { // some sites (Business Standard) refuse plain fetches — load the page in headless Chrome and extract from its HTML
    const html = join(STUDIO, "tools", "media", "_page.html");
    run(process.execPath, ["-e", `const p=require(${JSON.stringify(puppeteerPath())});(async()=>{const b=await p.launch({executablePath:${JSON.stringify(process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe")},headless:"new",args:["--no-sandbox"]});const g=await b.newPage();await g.setUserAgent(${JSON.stringify(UA)});await g.goto(${JSON.stringify(url)},{waitUntil:"networkidle2",timeout:90000}).catch(()=>{});await new Promise(r=>setTimeout(r,2000));require("fs").writeFileSync(${JSON.stringify(html)},await g.content());await b.close();})()`]);
    j = JSON.parse(py(["article", url, html]) || "{}"); rmSync(html, { force: true });
    if (j.error) die("article: " + j.error + " — " + url);
  }
  console.log(`${j.title}\n${[j.sitename, j.author, j.date].filter(Boolean).join(" · ")}\n${j.url}\n\n${(j.text || "").slice(0, Number(flag("chars", 1500)))}${(j.text || "").length > Number(flag("chars", 1500)) ? "\n…" : ""}`);
  if (P) {
    const dir = join(P.dir, "capture", "articles"); mkdirSync(dir, { recursive: true });
    const name = flag("name", (j.title || "article").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50));
    writeJson(join(dir, name + ".json"), j);
    console.log("\n✓ saved capture/articles/" + name + ".json");
  }
}

// ── article snip (house rule 7) ─────────────────────────────────────────────
export function cmdSnip(P, url, name, phrase, flag) {
  if (!P || !url || !name) die('snip <slug> <url> <name> "<phrase|alternative>" [--extra px] [--root h1]');
  const dir = join(P.dir, "capture", "articles"); mkdirSync(dir, { recursive: true });
  const r = run(process.execPath, [join(STUDIO, "tools", "media", "snip.cjs"), url, join(dir, name), phrase || ""], { capture: true,
    env: { PPTR: puppeteerPath(), ROOT: flag("root", "body"), ...(flag("extra") ? { EXTRA: flag("extra") } : {}) } });
  const info = JSON.parse(r.stdout.trim().split(/\r?\n/).pop() || "{}");
  if (!info.h1 || !info.h1.w) die("snip: no headline found (paywall / blocked?) — look at capture/articles/" + name + "-full.png");
  mkdirSync(join(P.dir, "assets", "photos"), { recursive: true });
  copyFileSync(join(dir, name + ".png"), join(P.dir, "assets", "photos", "art-" + name + ".png"));
  console.log(`✓ assets/photos/art-${name}.png — "${info.title}"${info.hit && info.hit.w ? " (phrase lit)" : " (⚠ phrase not found — nothing lit)"}\n  full page for checking: capture/articles/${name}-full.png`);
  credit(P, `${info.title} — article screenshot (${url})`, `| assets/photos/art-${name}.png | article screenshot: ${info.title} | ${url} |`);
}

// ── footage clip (yt-dlp) ───────────────────────────────────────────────────
export function cmdClip(P, url, flag) {
  if (!P || !url) die('clip <slug> <url> --from <s|mm:ss> --to <s|mm:ss> [--name n] [--credit "…"]');
  const from = flag("from"), to = flag("to");
  if (!from || !to) die("clip needs --from and --to (keep it to the seconds that carry the beat)");
  const name = flag("name", "clip-" + Date.now().toString(36));
  const dir = join(P.dir, "assets", "clip"); mkdirSync(dir, { recursive: true });
  const tmp = join(dir, "_dl-" + name);
  // YouTube needs a JS runtime for its player challenges (yt-dlp ≥ 2025.11 — without one, formats go missing and
  // stream URLs 403 at random); node is always here. One retry covers the remaining transient 403s.
  const JS = ytArgs();
  const meta = run("yt-dlp", [...JS, "--no-playlist", "--print", "%(title)s\t%(uploader)s\t%(webpage_url)s", "--skip-download", url], { capture: true }).stdout.trim().split("\t");
  const dl = [...JS, "--no-playlist", "-f", "bv*[height<=1080][vcodec^=avc1]+ba/bv*[height<=1080]+ba/b[height<=1080]/b", "--download-sections", `*${from}-${to}`,
    "--force-keyframes-at-cuts", "--merge-output-format", "mp4", "-o", tmp + ".%(ext)s", url];
  if (run("yt-dlp", dl, { allowFail: true }).status !== 0) { console.log("· download failed — retrying once"); run("yt-dlp", dl); }
  const got = readdirSync(dir).find((f) => f.startsWith("_dl-" + name));
  if (!got) die("yt-dlp produced no file");
  const out = join(dir, name + ".mp4");
  // the clip's own sound (nat sound) → <name>.nat.flac, mixed into the soundtrack when the spec says video → "nat": true
  const hasAudio = run("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", join(dir, got)], { capture: true }).stdout.trim();
  if (hasAudio) run("ffmpeg", ["-y", "-loglevel", "error", "-i", join(dir, got), "-vn", "-ac", "2", "-ar", "48000", "-c:a", "flac", join(dir, name + ".nat.flac")]);
  // the video itself stays muted (the soundtrack carries its sound), H.264 yuv420p, ≤1920 px on the long side, last frame held 1.5 s
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", join(dir, got), "-an", "-vf", "scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))',tpad=stop_mode=clone:stop_duration=1.5,format=yuv420p",
    "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-movflags", "+faststart", out]);
  rmSync(join(dir, got), { force: true });
  const probe = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "csv=p=0", out], { capture: true }).stdout.trim().replace(/\s+/g, " ");
  console.log(`✓ assets/clip/${name}.mp4 · ${probe}${hasAudio ? ` · nat sound → assets/clip/${name}.nat.flac` : " · (no audio track)"}\n  "${meta[0]}" — ${meta[1]}\n  use: spec → "video": {"id": "${name}", "src": "assets/clip/${name}.mp4", "x": 0, "y": 0, "w": 1080, "h": 1920${hasAudio ? ', "nat": true' : ""}}` +
    (hasAudio ? `\n  listen first: reporter voice-over or music in the clip's audio → leave "nat" off and use an ambience instead` : ""));
  credit(P, flag("credit", `Footage: "${meta[0]}" — ${meta[1]} (${meta[2]}, ${from}–${to})`), `| assets/clip/${name}.mp4 | ${meta[0]} (${from}–${to}) | ${meta[1]} · ${meta[2]} |`);
}

// yt-dlp base args: a JS runtime for YouTube's player challenges, plus the user's browser cookies when
// _studio/.ytbrowser names one (git-ignored; e.g. "firefox") — YouTube asks for sign-in after a burst of downloads.
// Chrome/Edge cookies can't be read on Windows (app-bound encryption); Firefox and Brave work.
function ytArgs() {
  const f = join(STUDIO, ".ytbrowser"), b = existsSync(f) ? readFileSync(f, "utf8").trim() : process.env.STUDIO_YT_BROWSER;
  return ["--js-runtimes", "node", ...(b ? ["--cookies-from-browser", b] : [])];
}

// ── footage preview: low-res copy + timestamped contact sheet, to read clip ranges off by eye ───────────────────
//   studio footage <slug> <url> [--every s] → capture/footage/<id>.mp4 (≤480p, git-ignored) + <id>.jpg; then studio clip
export function cmdFootage(P, url, flag) {
  if (!P || !url) die("footage <slug> <url> [--every s]");
  const dir = join(P.dir, "capture", "footage"); mkdirSync(dir, { recursive: true });
  const JS = ytArgs();
  const [id, title, uploader, dur] = run("yt-dlp", [...JS, "--no-playlist", "--print", "%(id)s\t%(title)s\t%(uploader)s\t%(duration)s", "--skip-download", url], { capture: true }).stdout.trim().split("\t");
  const mp4 = join(dir, id + ".mp4");
  if (!existsSync(mp4)) {
    const dl = [...JS, "--no-playlist", "-f", "bv*[height<=480][vcodec^=avc1]/bv*[height<=480]/b[height<=480]/b", "-o", join(dir, id + ".%(ext)s"), "--remux-video", "mp4", url];
    if (run("yt-dlp", dl, { allowFail: true, capture: true }).status !== 0) run("yt-dlp", dl, { capture: true });
  }
  const sheet = join(dir, id + ".jpg");
  run("python", ["-I", join(STUDIO, "tools", "media", "footage_sheet.py"), mp4, sheet, flag("every", "0"), "8", `${title} — ${uploader}`.slice(0, 110)], { capture: true });
  console.log(`✓ ${sheet}\n  "${title}" — ${uploader} · ${(dur / 60).toFixed(1)} min\n  read a range off the sheet → studio clip ${P.video.slug} ${url} --from <s> --to <s> --name <n>`);
}

// ── photos from Wikimedia Commons (keyless API) ────────────────────────────────────────────────────────────
//   studio photo search <words…> [--n 12]          → numbered results + a preview sheet (assets/../capture/photo-search.jpg)
//   studio photo get <slug> <#|File:Name.jpg|url> <name> [--w 2400] → assets/photos/<name>.jpg + credit (description only)
const PUA = "Mozilla/5.0 (studio photo; Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36";
async function commons(params) {
  const u = "https://commons.wikimedia.org/w/api.php?format=json&origin=*&" + new URLSearchParams(params);
  const r = await fetch(u, { headers: { "User-Agent": PUA } });
  if (!r.ok) die(`Commons API ${r.status}`);
  return r.json();
}
const stripTags = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
async function commonsInfo(titles, w) {
  const j = await commons({ action: "query", titles: titles.join("|"), prop: "imageinfo", iiprop: "url|size|extmetadata", iiurlwidth: String(w || 2400) });
  return Object.values(j.query?.pages || {}).filter((p) => p.imageinfo).map((p) => {
    const ii = p.imageinfo[0], m = ii.extmetadata || {};
    return { title: p.title, url: ii.thumburl || ii.url, page: ii.descriptionurl, w: ii.width, h: ii.height,
      artist: (stripTags(m.Artist?.value) || "unknown").slice(0, 80), licence: stripTags(m.LicenseShortName?.value) || "?", desc: stripTags(m.ImageDescription?.value).slice(0, 140) };
  });
}
export async function cmdPhoto(positional, flag) {
  const [sub, ...rest] = positional;
  const last = join(STUDIO, "assets", ".last-photo-search.json");
  if (sub === "search") {
    const q = rest.join(" ");
    if (!q) die("photo search <words…>");
    const s = await commons({ action: "query", list: "search", srsearch: q + " filetype:bitmap", srnamespace: "6", srlimit: flag("n", "12") });
    const titles = (s.query?.search || []).map((x) => x.title);
    if (!titles.length) return console.log("no photos found");
    const info = (await commonsInfo(titles, 640)).filter((x) => x.w >= 1200);
    writeJson(last, info.map((x) => x.title));
    const dir = join(STUDIO, "assets", "_photo-previews");
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    const files = info.map((x, i) => {
      console.log(`${String(i + 1).padStart(2)}. ${x.w}×${x.h} · ${x.licence} · ${x.artist.slice(0, 40)}\n    ${x.title}${x.desc ? "\n    " + x.desc : ""}`);
      const f = join(dir, `${String(i + 1).padStart(2, "0")}.jpg`);
      run("curl", ["-sSL", "-A", PUA, "-o", f, x.url], { allowFail: true });
      return f;
    });
    const sheet = join(dir, "sheet.jpg");
    run("python", ["-I", join(STUDIO, "tools", "media", "tile_sheet.py"), sheet, "4", ...files], { capture: true, allowFail: true });
    return console.log(`preview: ${sheet} (tiles in result order, left→right) → studio photo get <slug> <#> <name>`);
  }
  if (sub === "get") {
    const [slug, which, name] = rest;
    if (!slug || !which || !name) die("photo get <slug> <#|File:…|commons url> <name> [--w 2400]");
    const P = (await import("./common.mjs")).project((await import("./common.mjs")).slugDir(slug));
    let title = /^\d+$/.test(which) && existsSync(last) ? readJson(last)[+which - 1] : which;
    if (/^https?:/.test(title)) title = "File:" + decodeURIComponent(title.split("/").pop().replace(/^File:/, ""));
    if (!/^File:/.test(title)) title = "File:" + title;
    const [x] = await commonsInfo([title], +flag("w", 2400));
    if (!x) die("not found on Commons: " + title);
    const dir = join(P.dir, "assets", "photos"); mkdirSync(dir, { recursive: true });
    const out = join(dir, name + ".jpg");
    run("curl", ["-sSL", "--fail", "-A", PUA, "-o", out, x.url]);
    credit(P, `Photo: ${x.title.replace(/^File:/, "")} — ${x.artist}, ${x.licence}, via Wikimedia Commons (${x.page})`, `| assets/photos/${name}.jpg | ${x.desc || x.title} | ${x.artist} · ${x.licence} · ${x.page} |`);
    return console.log(`✓ assets/photos/${name}.jpg · ${x.w}×${x.h} source · ${x.licence} · ${x.artist}`);
  }
  die("photo search <words…> | photo get <slug> <#|File:…> <name>");
}

// ── photo cut-out (rembg) ───────────────────────────────────────────────────
export function cmdCutout(P, img, flag) {
  if (!P || !img) die("cutout <slug> <image> [--name n] [--model birefnet-general-lite|birefnet-general|isnet-general-use|u2net]");
  const src = existsSync(img) ? img : join(P.dir, img);
  if (!existsSync(src)) die("no such image: " + img);
  const name = flag("name", stem(src) + "-cut");
  const dir = join(P.dir, "assets", "photos"); mkdirSync(dir, { recursive: true });
  console.log("cutting out (first run downloads the model)…");
  const j = JSON.parse(py(["cutout", src, join(dir, name + ".png"), flag("model", "birefnet-general-lite")]));
  console.log(`✓ assets/photos/${name}.png · ${j.w}×${j.h} (transparent, trimmed to the subject) · model ${j.model}\n  place it like any photo (img with object-fit: contain) — a drop shadow and the house grade make it sit in the scene`);
}

// ── AI upscale (Upscayl's ncnn-vulkan build of Real-ESRGAN; runs on the Iris Xe) ─────────
const UPMODELS = { photo: "upscayl-standard-4x", fidelity: "high-fidelity-4x", art: "digital-art-4x" };
export function cmdUpscale(P, img, flag) {
  if (!P || !img) die("upscale <slug> <image> [--name n] [--model photo|fidelity|art] [--scale 2|3|4]");
  const exe = join(UPSCAYL, "bin", "upscayl-bin.exe");
  if (!existsSync(exe)) die("upscaler missing: _studio/tools/upscayl/bin/upscayl-bin.exe (see STUDIO.md → Media tools)");
  const src = existsSync(img) ? img : join(P.dir, img);
  if (!existsSync(src)) die("no such image: " + img);
  const model = UPMODELS[flag("model", "photo")] || flag("model");
  if (!existsSync(join(UPSCAYL, "models", model + ".param"))) die("unknown model: " + model + " (photo | fidelity | art)");
  const name = flag("name", stem(src) + "-up");
  const out = join(P.dir, "assets", "photos", name + ".png");
  const t0 = Date.now();
  run(exe, ["-i", src, "-o", out, "-m", join(UPSCAYL, "models"), "-n", model, "-s", flag("scale", "4")], { capture: true });
  const size = run("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", out], { capture: true }).stdout.trim();
  console.log(`✓ assets/photos/${name}.png · ${size} · ${model} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

// ── Iconify (api.iconify.design — keyless; each icon set carries its own open licence) ─────────
async function getJson(u) { const r = await fetch(u, { headers: { "User-Agent": PUA } }); if (!r.ok) die(`HTTP ${r.status}: ${u}`); return r.json(); }
export async function cmdIconify(args, flag) {
  const sub = args[0];
  if (sub === "search") {
    const q = args.slice(1).join(" ");
    if (!q) die("iconify search <words> [--prefix set] [--n 24]");
    const n = Number(flag("n", 24));
    const s = await getJson(`https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=${Math.max(32, n)}${flag("prefix") ? "&prefixes=" + flag("prefix") : ""}`);
    const icons = (s.icons || []).slice(0, n);
    if (!icons.length) die("no Iconify results for: " + q);
    const tiles = join(LOTTIE_DIR, "_previews", "_tiles");
    rmSync(tiles, { recursive: true, force: true }); mkdirSync(tiles, { recursive: true });
    const font = "C\\:/Windows/Fonts/arial.ttf";
    let k = 0;
    for (const id of icons) {
      const [pre, nm] = id.split(":"), svg = join(tiles, "i.svg"), png = join(tiles, "src.png");
      try { await download(`https://api.iconify.design/${pre}/${nm}.svg?height=256`, svg); rasterSvg(svg, png, 220); } catch { continue; }
      run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=white:s=260x280", "-i", png, "-filter_complex",
        `[1]scale=200:200:force_original_aspect_ratio=decrease[f];[0][f]overlay=(W-w)/2:(H-h)/2+8,drawtext=fontfile='${font}':text='${k + 1}':x=6:y=4:fontsize=22:fontcolor=black:box=1:boxcolor=0xffd84d`,
        "-frames:v", "1", "-pix_fmt", "rgb24", "-update", "1", join(tiles, String(k).padStart(3, "0") + ".png")]);
      console.log(`${String(k + 1).padStart(2)}. ${id}`);
      k++;
    }
    for (const f of readdirSync(tiles).filter((x) => !/^\d{3}\.png$/.test(x))) rmSync(join(tiles, f));
    const sheet = join(LOTTIE_DIR, "_previews", "iconify-" + q.replace(/[^\w-]+/g, "-").slice(0, 40) + ".jpg");
    run("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "1", "-i", join(tiles, "%03d.png"), "-vf", `tile=6x${Math.ceil(k / 6)}:padding=6:color=0x333333`, "-frames:v", "1", "-update", "1", sheet]);
    console.log("\npreview sheet: " + sheet + "\nthen: studio iconify get <prefix:icon> <name>  → art block {name, recolor: …}");
    return;
  }
  if (sub === "get") {
    const [, id, name] = args;
    if (!id || !id.includes(":") || !name) die("iconify get <prefix:icon> <name>");
    const [pre, nm] = id.split(":");
    const info = (await getJson(`https://api.iconify.design/collections?prefix=${pre}`))[pre] || {};
    mkdirSync(SVG_DIR, { recursive: true });
    const out = join(SVG_DIR, name + ".svg");
    await download(`https://api.iconify.design/${pre}/${nm}.svg?height=512`, out);
    let s = readFileSync(out, "utf8");
    if (!/<svg/.test(s)) { rmSync(out); die("not an SVG: " + id); }
    // monochrome sets draw with currentColor — make that a real colour so `recolor` maps can target it
    s = s.replace(/currentColor/g, "#ece6da"); writeFileSync(out, s);
    const lic = info.license || {}, by = info.author?.name || pre;
    const led = join(SVG_DIR, "LICENSES.json"), l = existsSync(led) ? readJson(led).filter((e) => e.name !== name) : [];
    const attribution = !/^(MIT|Apache-2\.0|ISC|CC0-1\.0|0BSD|Unlicense)$/i.test(lic.spdx || "");
    l.push({ name, source: "Iconify", id, title: `${info.name || pre} — ${nm}`, url: `https://icon-sets.iconify.design/${pre}/${nm}/`, creator: by,
      license: `${lic.title || "?"}${lic.spdx ? " (" + lic.spdx + ")" : ""}`, attribution_required: attribution,
      attribution: `"${nm}" from ${info.name || pre} by ${by} (${lic.title || "open licence"}).`, file: "assets/svg/" + name + ".svg", downloaded: new Date().toISOString().slice(0, 10) });
    writeJson(led, l);
    const cols = [...new Set((s.match(/#[0-9a-fA-F]{6}\b/g) || []).map((c) => c.toLowerCase()))];
    console.log(`${name}: svg · ${info.name || pre} · ${lic.title || "?"}${attribution ? " — credit required (added to the description automatically)" : ""} · colours: ${cols.join(" ")}\n  use: {"type": "art", "name": "${name}", "recolor": {"#ece6da": "#…"}}`);
    return;
  }
  die("iconify search <words> [--prefix set] · iconify get <prefix:icon> <name>");
}
