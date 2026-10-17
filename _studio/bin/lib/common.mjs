// Shared helpers for the studio CLI.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseStoryboard } from "../../vendor/fe-scripts/lib/storyboard.mjs";

export const STUDIO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const VIDEOS = resolve(STUDIO, "..");
export const FE = join(STUDIO, "vendor", "fe-scripts");
export const SKILLS = join(process.env.USERPROFILE || process.env.HOME || "", ".claude", "skills");
export const HF = process.env.STUDIO_HF || "hyperframes@0.8.141"; // STUDIO_HF=hyperframes@x.y.z to try a new version on one build
export const W = 1080, H = 1920;
// Formats (2026-10-08): Shorts are portrait 1080×1920 (the default); long-form YouTube videos are landscape 1920×1080
// (video.json → "format": "landscape"). Everything that used to assume 1080×1920 asks canvas(video) instead.
// Stage = the box normal blocks are laid out in; the caption band only exists for burned-in captions (Shorts).
export const FORMATS = {
  portrait: { W: 1080, H: 1920, stage: { left: 80, width: 920, top: 200, bottom: 1640 } },
  landscape: { W: 1920, H: 1080, stage: { left: 140, width: 1640, top: 110, bottom: 970 } },
};
export const isLong = (video) => video?.format === "landscape";
export function canvas(video) { const f = FORMATS[isLong(video) ? "landscape" : "portrait"]; return { ...f, landscape: isLong(video) }; }

export function die(msg) { console.error("✗ " + msg); process.exit(1); }
export const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
export const writeJson = (p, o) => writeFileSync(p, JSON.stringify(o, null, 2));
export const pad2 = (n) => String(n).padStart(2, "0");

// House characters (_studio/cast.json) recur across videos: a peep block's `figure` resolves here first,
// video.json → cast layers on top. IDENTITY keys are locked — only pose (body) and face change per scene.
export const IDENTITY = ["hair", "facialHair", "accessory"];
export function houseCast() {
  const p = join(STUDIO, "cast.json");
  if (!existsSync(p)) return {};
  const c = readJson(p); delete c._about;
  // retired characters stay on record but are no longer house cast (Meera, retired 2026-10-02)
  for (const k of Object.keys(c)) if (c[k]?.retired) delete c[k];
  return c;
}
// Ending styles (video.json → ending). No video ends on a follow ask any more: the series ask lives in
// upload.follow (description) and the pinned comment. loop = last line runs into the hook; punchline = a final beat.
// No abrupt endings (user decision 2026-10-03): the last line is a complete sentence and the last frame holds at
// least END_HOLD seconds after the final word, so the picture settles and the sound resolves before the video ends.
// A per-video pads.last can lengthen the hold but never shorten it below END_HOLD.
export const END_HOLD = 1.2;
// Length (user decision 2026-10-05): 45–60 s is the default; a video may run up to 3 min (YouTube's Shorts limit) when
// the story earns it — agreed with the user at the script gate and recorded as video.json → maxLength (seconds, ≤ 180).
// Spoken numbers scale with it: 3 per minute of target length.
export const SHORT_DEFAULT = 60, SHORT_CAP = 180;
// Long-form (landscape) videos: length is agreed per video (rice-water: 12–15 min → maxLength 900); no Shorts cap.
export const LONG_DEFAULT = 900;
export function lengthTarget(video) {
  if (isLong(video)) {
    const max = +video?.maxLength || LONG_DEFAULT;
    return { max, long: true, longForm: true, numbers: Math.max(3, Math.round(3 * max / 60)) };
  }
  const max = Math.min(SHORT_CAP, Math.max(SHORT_DEFAULT, +video?.maxLength || SHORT_DEFAULT));
  return { max, long: max > SHORT_DEFAULT, numbers: Math.max(3, Math.round(3 * max / 60)) };
}
// Chapters (long-form): each frame carries `- chapter: N` in STORYBOARD.md; video.json → chapters [{n, title}] names
// them (YouTube chapter timestamps in the description). Frames without the bullet belong to the previous frame's chapter.
export function chapterOf(sb) {
  let cur = 0;
  return sb.frames.map((f) => { if (f.extra?.chapter != null && f.extra.chapter !== "") cur = +f.extra.chapter; return cur; });
}
export const ENDINGS = { loop: { pad: 1.2 }, punchline: { pad: 1.6 } };
// the final voiceover line must finish its sentence (no "…for the year when" cut-offs)
export const ENDS_SENTENCE = /[.!?…]["”’')\]]*\s*$/;
export const FOLLOW_ASK = /\b(follow|subscribe|like and share|hit the bell)\b/i;

export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: opts.capture ? "pipe" : "inherit", encoding: "utf8", shell: cmd === "npx" && process.platform === "win32", cwd: opts.cwd, env: { ...process.env, ...(opts.env || {}) }, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 && !opts.allowFail) die(`${cmd} ${args.join(" ")} failed (exit ${r.status})\n${(r.stderr || "") + (r.stdout || "")}`.slice(0, 4000));
  return r;
}
export const node = (script, args, opts) => run(process.execPath, [script, ...args], opts);
export const npx = (args, opts) => run("npx", ["--yes", HF, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)), opts);

// Finished videos are moved into "Produced Video/<slug>"; new ones are scaffolded at videos/<slug>.
export const PRODUCED = join(VIDEOS, "Produced Video");
export function slugDir(slug) {
  if (existsSync(join(resolve(slug), "video.json"))) return resolve(slug);
  for (const d of [join(VIDEOS, slug), join(PRODUCED, slug)]) if (existsSync(join(d, "video.json"))) return d;
  return join(VIDEOS, slug);
}
// A library path written relative to the project ("../_studio/assets/…") — still found after the project moved
// one level deeper into "Produced Video/".
export function libPath(dir, rel) {
  const r = resolve(dir, rel);
  if (existsSync(r)) return r;
  const m = String(rel).replace(/\\/g, "/").match(/(?:^|\/)_studio\/(.+)$/);
  return m ? join(STUDIO, m[1]) : r;
}

// Project resolution: explicit dir, or cwd if it has video.json.
export function project(argDir) {
  const dir = resolve(argDir || process.cwd());
  if (!existsSync(join(dir, "video.json"))) die(`not a studio project (no video.json): ${dir}`);
  const video = readJson(join(dir, "video.json"));
  const look = readJson(join(STUDIO, "looks", video.look + ".json"));
  return { dir, video, look };
}
export function storyboard(dir) {
  return parseStoryboard(readFileSync(join(dir, "STORYBOARD.md"), "utf8"));
}
export function frameId(f) { return f.src.replace(/^.*\//, "").replace(/\.html$/, ""); }

// ── word cues ──────────────────────────────────────────────────────────────
const NUMW = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 };
export function norm(w) {
  let s = String(w).toLowerCase().replace(/[₹$€£]/g, "").replace(/[^a-z0-9%']/g, "").replace(/'/g, "");
  if (s in NUMW) s = String(NUMW[s]);
  if (s === "lac" || s === "lacs" || s === "lakhs") s = "lakh";
  return s;
}
// cue grammar: number | "start[+/-x]" | "end[+/-x]" | "word[#n][$][+/-x]" | "two words[#n]"
// word$ = end of the word instead of its start.
export function makeResolver(words, frameDur, label) {
  const nw = words.map((w) => norm(w.text));
  return function resolveCue(cue) {
    if (typeof cue === "number") return cue;
    const m = String(cue).trim().match(/^(.*?)(?:([+-])(\d+(?:\.\d+)?))?$/);
    let key = m[1].trim(), off = m[3] ? (m[2] === "-" ? -1 : 1) * parseFloat(m[3]) : 0;
    if (key === "start" || key === "") return round(Math.max(0, off));
    if (key === "end") return round(Math.max(0, frameDur + off));
    let useEnd = false, nth = 1;
    if (key.endsWith("$")) { useEnd = true; key = key.slice(0, -1); }
    const h = key.match(/^(.*)#(\d+)$/); if (h) { key = h[1]; nth = +h[2]; }
    const seq = key.split(/\s+/).map(norm).filter(Boolean);
    let seen = 0;
    for (let i = 0; i + seq.length <= nw.length; i++) {
      let ok = true;
      for (let j = 0; j < seq.length; j++) {
        const a = nw[i + j], b = seq[j];
        // near-matches count too (one letter off on words ≥ 6 letters): since captions take the script's spelling
        // (WhisperX alignment, 2026-10-08), a cue written against Whisper ("fertilizer") still finds "fertiliser"
        if (!(a === b || (b.length >= 4 && a.startsWith(b)) || (b.length >= 6 && a.length === b.length && [...a].filter((c, k) => c !== b[k]).length <= 1))) { ok = false; break; }
      }
      if (ok && ++seen === nth) {
        const w = useEnd ? words[i + seq.length - 1].end : words[i].start;
        return round(Math.max(0, w + off));
      }
    }
    throw new Error(`${label}: cue "${cue}" not found. Words: ${words.map((w) => w.text).join(" ")}`);
  };
}
const round = (x) => Math.round(x * 1000) / 1000;
// Walk a spec; every key named `at` or ending in `At` is a cue (scalar or array).
export function resolveCues(obj, resolveCue) {
  if (Array.isArray(obj)) return obj.map((v) => resolveCues(v, resolveCue));
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "at" || /At$/.test(k)) out[k] = Array.isArray(v) ? v.map(resolveCue) : v == null ? v : resolveCue(v);
    else out[k] = resolveCues(v, resolveCue);
  }
  return out;
}

// ── caption text normalisation + phrase chunking ───────────────────────────
const SMALL = new Set(["a", "an", "the", "to", "of", "and", "or", "for", "on", "in", "with", "your", "my", "our", "their", "at", "by", "is", "it", "its", "that", "this", "as", "but", "if", "so", "you", "we", "they", "from"]);
// Take display text (casing/punctuation) from the script, timing from ASR. Aligns by
// normalised token; falls back to ASR text for any stretch that doesn't line up.
export function alignToScript(words, script) {
  if (!script) return words.map((w) => ({ ...w }));
  const toks = script.replace(/[—–]/g, " — ").split(/\s+/).filter((t) => t && t !== "—" && norm(t));
  const out = words.map((w) => ({ ...w }));
  let j = 0;
  for (let i = 0; i < out.length && j < toks.length; i++) {
    const a = norm(out[i].text);
    if (a === norm(toks[j])) { out[i].text = toks[j++]; continue; }
    // look ahead a little in the script for a resync point
    let k = j + 1; while (k < Math.min(toks.length, j + 4) && norm(toks[k]) !== a) k++;
    if (k < toks.length && norm(toks[k]) === a) { j = k; out[i].text = toks[j++]; }
  }
  return out;
}
export function normaliseCaptionWords(words, cfg = {}, script) {
  const out = alignToScript(words, script);
  const curr = cfg.currency == null ? "₹" : cfg.currency;
  const units = /^(lakh|lakhs|lac|lacs|crore|crores)[.,:;?!]*$/i;
  for (let i = 0; i < out.length; i++) {
    const t = out[i].text;
    if (/^lacs?([.,:;?!]*)$/i.test(t)) out[i].text = t.replace(/^lac(s?)/i, "lakh");
    const nx = out[i + 1] ? out[i + 1].text : "";
    if (curr && units.test(nx)) {
      const n = norm(t);
      // decimals ("1.8 lakh"): norm() drops the point, so keep the token as spoken
      if (/^\d+\.\d+[.,:;?!]*$/.test(t)) out[i].text = curr + t;
      // keep the token as written ("14,000" stays grouped; trailing punctuation stays) — just prefix the currency
      else if (/^\d+(\.\d+)?$/.test(n) && !/^[₹$€£]/.test(t)) out[i].text = curr + t;
    }
  }
  // user map: { "spoken phrase": "Display Text" } applied on consecutive words
  for (const [from, to] of Object.entries(cfg.map || {})) {
    const seq = from.split(/\s+/).map(norm);
    for (let i = 0; i + seq.length <= out.length; i++) {
      if (seq.every((s, j) => norm(out[i + j].text) === s)) {
        // a key that ends in its own punctuation ("E.M.I.") consumes it; only the rest trails ("E.M.I.," → ",")
        const keyTrail = from.match(/[.,:;?!]+$/)?.[0] || "";
        let trail = out[i + seq.length - 1].text.match(/[.,:;?!]+$/)?.[0] || "";
        if (keyTrail && trail.startsWith(keyTrail)) trail = trail.slice(keyTrail.length);
        const toks = to.split(/\s+/);
        const span = out.slice(i, i + seq.length);
        const repl = toks.map((tk, j) => ({ ...span[Math.min(j, span.length - 1)], text: tk }));
        repl[repl.length - 1].end = span[span.length - 1].end;
        repl[repl.length - 1].text += trail;
        out.splice(i, seq.length, ...repl);
      }
    }
  }
  return out;
}
export function chunkWords(words, cfg = {}) {
  const max = cfg.maxWords || 5, maxChars = cfg.maxChars || 26;
  const chunks = [];
  let cur = [];
  const len = (arr) => arr.map((w) => w.text).join(" ").length;
  const hard = (w) => /[.?!:;]$/.test(w.text);
  const soft = (w) => /[,—–]$/.test(w.text);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    cur.push(w);
    const nx = words[i + 1];
    const glued = nx && (/^[₹$€£]/.test(w.text) || /^\d/.test(w.text)) && /^(lakh|crore|k|million|billion|%)/i.test(nx.text);
    if (!nx) break;
    if (glued) continue;
    if (hard(w)) { chunks.push(cur); cur = []; continue; }
    if (soft(w) && cur.length >= 2) { chunks.push(cur); cur = []; continue; }
    if (cur.length >= max || len(cur) >= maxChars) {
      // don't end a chunk on a small function word — carry it forward
      if (cur.length > 2 && SMALL.has(norm(w.text))) { cur.pop(); chunks.push(cur); cur = [w]; }
      else { chunks.push(cur); cur = []; }
    }
  }
  if (cur.length) chunks.push(cur);
  // merge orphans (1 word or < 0.55s) into a neighbour within the same sentence
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const dur = c[c.length - 1].end - c[0].start;
    if (c.length === 1 || dur < 0.55) {
      const prev = chunks[i - 1];
      const canPrev = prev && !hard(prev[prev.length - 1]) && prev.length + c.length <= max + 1;
      const next = chunks[i + 1];
      const canNext = next && !hard(c[c.length - 1]) && next.length + c.length <= max + 1;
      if (canPrev) { prev.push(...c); chunks.splice(i, 1); i--; }
      else if (canNext) { next.unshift(...c); chunks.splice(i, 1); i--; }
    }
  }
  return chunks;
}
export function isDark(hex) {
  const m = String(hex).match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4;
}

// ── colour math (hex only) ──────────────────────────────────────────────────
export function hexRgb(h) { const m = String(h).match(/^#?([0-9a-f]{6})$/i); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function rgbHex(c) { return "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join(""); }
export function mix(a, b, t) { const A = hexRgb(a), B = hexRgb(b); if (!A || !B) return a; return rgbHex(A.map((v, i) => v + (B[i] - v) * t)); }
function lum(h) { const c = hexRgb(h); if (!c) return 0.5; const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); }
export function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
// first candidate reaching `min` contrast on `bg`, else the best one
export function legible(bg, cands, min = 4.5) { let best = cands[0], bc = 0; for (const c of cands) { const k = contrast(c, bg); if (k >= min) return c; if (k > bc) { bc = k; best = c; } } return best; }
