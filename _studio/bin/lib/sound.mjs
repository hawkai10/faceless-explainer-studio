// Sound engine (2026-10-10) — replaces the raw "bed + SFX lanes" mix that sounded pasted on (SFX files from −70 to
// −10 LUFS all multiplied by 0.35, no shared space, one looping bed, silent footage). See STUDIO.md → Sound.
//
// The build premixes everything except the voice into ONE soundtrack (assets/mix/soundtrack.mp3), levelled against the
// measured narration:
//   music     video.json → music [{file, at, from?, gain?, fade?}] — cues by seconds, "f12", "f12+1.5" or "ch3";
//             {file: null} = silence until the next cue (a dip before a reveal). Legacy bed: video.json → bgm {file}.
//   ambience  spec → "ambience": "<file>" | {file, gain?, from?} | "none" — carries over to later frames until changed;
//             crossfades 1 s at every change.
//   nat sound spec → video {…, "nat": true | {gain}} — the clip's own audio (studio clip saves assets/clip/<n>.nat.flac).
//   SFX       spec → sfx [{file, at, role?, gain?, dur?}] — levelled by role (hit/whoosh/riser/foley/ui), leading
//             silence trimmed, short fades, one shared short room reverb so they sit in the same space.
// Music, ambience and nat sound duck under speech on a word-timed envelope (no pumping). The voice gets a light
// broadcast chain (low-cut, de-ess, gentle compression) → assets/voice/mix/ (words and pauses untouched).
// The library: studio sound index|search|get (Sonniss GDC bundles) · studio sound music (YouTube Audio Library tracks).
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join, relative } from "node:path";
import { STUDIO, die, readJson, writeJson, run, libPath, chapterOf } from "./common.mjs";

export const AUDIO = join(STUDIO, "assets", "audio");
export const SONNISS = join(AUDIO, "sonniss");
const LEDGER = join(AUDIO, "LICENSES.json");
const IR = join(AUDIO, "ir-room.wav");
const LEVELS = join(AUDIO, ".levels.json");

// Levels relative to the narration's integrated loudness (V). Beds are matched on integrated loudness, one-shots on
// their loudest 400 ms (max momentary) — so a quiet recording and a hot one land at the same level.
export const ROLES = { hit: -3, whoosh: -8, riser: -8, foley: -9, ui: -12 };
const BEDS = { music: { gap: 3, under: 8 }, ambience: { gap: 16, under: 22 }, nat: { gap: 10, under: 20 } };
export const VOICE_CHAIN = "highpass=f=70,deesser=i=0.25,acompressor=threshold=0.125:ratio=2:attack=8:release=120:knee=3";

const probeDur = (p) => +parseFloat(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], { capture: true }).stdout) || 0;
const rel = (p) => p.replace(/\\/g, "/");
const r3 = (x) => +x.toFixed(3);

// ── measurement (cached by path + size + mtime) ──────────────────────────────────────────────────────────────────
let levels;
export function measure(file) {
  levels ||= existsSync(LEVELS) ? readJson(LEVELS) : {};
  const st = statSync(file), key = `${rel(file)}|${st.size}|${Math.round(st.mtimeMs)}`;
  if (levels[key]) return levels[key];
  const res = run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "apad=pad_dur=0.5,ebur128=peak=true", "-f", "null", "-"], { capture: true, allowFail: true });
  if (res.status !== 0) return { I: -70, M: -70, peak: -70, dur: 0, unreadable: true };
  const e = res.stderr || "";
  let M = -70;
  for (const m of e.matchAll(/\bM:\s*(-?[\d.]+)/g)) M = Math.max(M, +m[1]);
  const I = +((e.match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop()?.match(/-?[\d.]+/)?.[0] ?? -70);
  const pk = (e.match(/Peak:\s+(-?[\d.]+|-inf) dBFS/g) || []).pop()?.match(/-?[\d.]+/)?.[0];
  const r = { I, M: r3(M), peak: pk != null ? +pk : -70, dur: probeDur(file) };
  levels[key] = r;
  writeJson(LEVELS, levels);
  return r;
}

// ── ledger ────────────────────────────────────────────────────────────────────────────────────────────────────────
const ledger = () => (existsSync(LEDGER) ? readJson(LEDGER) : []);
function ledgerEntry(abs) {
  const a = rel(abs);
  return ledger().find((e) => e.file && a.endsWith("/" + e.file)) || null;
}
function roleOf(x, abs) {
  if (x.role) { if (!ROLES[x.role]) die(`sfx role "${x.role}" — use ${Object.keys(ROLES).join(" | ")}`); return x.role; }
  const led = ledgerEntry(abs);
  if (led?.role && ROLES[led.role]) return led.role;
  const n = basename(abs).toLowerCase();
  if (/whoosh|swish|swoosh|wipe|pass[-_ ]?by|transition/.test(n)) return "whoosh";
  if (/riser|rise|build|swell/.test(n)) return "riser";
  if (/impact|hit|boom|sub|drop|thud|slam|stamp/.test(n)) return "hit";
  if (/blip|click|tick|ui|beep|notif|pop/.test(n)) return "ui";
  return "foley";
}

// ── voice chain ───────────────────────────────────────────────────────────────────────────────────────────────────
// Voice lines are written as STEREO at −3 dB per side (the equal-loudness pan). HyperFrames/Chrome play a mono file at
// full level on both sides (+3 dB) while ffmpeg upmixes at −3 dB, so mono lines made the render's voice/music balance
// differ from `studio listen` by 3 dB (found on zz-chapter-test, 2026-10-11). Stereo files play the same everywhere.
const VOICE_PAN = "pan=stereo|c0=0.7071*c0|c1=0.7071*c0";
const VOICE_VER = "v2-stereo"; // bump to regenerate every project's voice/mix
export function processVoices(P, meta) {
  const chain = P.video.sound?.voiceChain === false ? "" : VOICE_CHAIN + ",";
  const dir = join(P.dir, "assets", "voice", "mix"); mkdirSync(dir, { recursive: true });
  const stamp = join(dir, ".version"), want = VOICE_VER + (chain ? "" : "-nochain");
  const fresh = existsSync(stamp) && readFileSync(stamp, "utf8") === want;
  let n = 0;
  for (const v of meta.voices || []) {
    const src = join(P.dir, v.path), out = join(dir, basename(v.path).replace(/\.\w+$/, ".wav"));
    if (!existsSync(src)) continue;
    if (!fresh || !existsSync(out) || statSync(out).mtimeMs < statSync(src).mtimeMs) {
      run("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-af", `aformat=channel_layouts=mono,${chain}${VOICE_PAN}`, "-ar", "48000", out]);
      n++;
    }
    v.mix = rel(relative(P.dir, out));
  }
  writeFileSync(stamp, want);
  return n;
}

// ── timeline helpers ──────────────────────────────────────────────────────────────────────────────────────────────
export function timeline(sb) {
  let t = 0;
  const ch = chapterOf(sb);
  return sb.frames.map((f, i) => { const d = f.durationSeconds || parseFloat(f.duration) || 4; const r = { number: f.number, start: t, dur: d, chapter: ch[i] }; t += d; return r; });
}
function cueTime(at, ft) {
  if (typeof at === "number") return at;
  const s = String(at ?? 0).trim();
  let m = s.match(/^f(\d+)\s*([+-]\s*[\d.]+)?$/i);
  if (m) { const f = ft.find((x) => x.number === +m[1]); if (!f) die(`music cue "${at}": no frame ${m[1]}`); return f.start + (m[2] ? +m[2].replace(/\s/g, "") : 0); }
  m = s.match(/^ch(\d+)\s*([+-]\s*[\d.]+)?$/i);
  if (m) { const f = ft.find((x) => x.chapter === +m[1]); if (!f) die(`music cue "${at}": no chapter ${m[1]}`); return f.start + (m[2] ? +m[2].replace(/\s/g, "") : 0); }
  if (/^[\d.]+$/.test(s)) return +s;
  die(`can't read cue time "${at}" — use seconds, "f12", "f12+1.5" or "ch3"`);
}

// Narration timeline for ducking: speech spans from the word times (merged across pauses < 0.9 s) and the
// narration's integrated loudness (all lines placed at their frame starts, mixed, measured).
export function duckPlan(P, ft, meta, total) {
  const starts = new Map(ft.map((f) => [f.number, f.start]));
  const spans = [];
  for (const v of meta.voices || []) {
    const w = v.words || [], s0 = starts.get(v.frame);
    if (!w.length || s0 == null) continue;
    spans.push([s0 + w[0].start, s0 + w[w.length - 1].end]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const regions = [];
  for (const s of spans) { const r = regions[regions.length - 1]; if (r && s[0] - r[1] < 0.9) r[1] = Math.max(r[1], s[1]); else regions.push([...s]); }
  // envelope 0..1: ramps up 0.3 s before speech, back down over 0.6 s after it. Regions are ≥ 0.9 s apart, so the
  // ramps never overlap and a flat sum (not a nested max — long-form has hundreds of regions) is the envelope.
  const ramp = ([a, b]) => `min(clip((t-${(a - 0.3).toFixed(2)})/0.3\\,0\\,1)\\,clip((${(b + 0.6).toFixed(2)}-t)/0.6\\,0\\,1))`;
  const expr = regions.length ? `min(1\\,${regions.map(ramp).join("+")})` : "0";
  const ins = [], parts = [];
  const lines = (meta.voices || []).filter((v) => existsSync(join(P.dir, v.mix || v.path)));
  lines.forEach((v, i) => {
    ins.push("-i", join(P.dir, v.mix || v.path));
    parts.push(`[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round((starts.get(v.frame) || 0) * 1000)}:all=1[v${i}]`);
  });
  if (!ins.length) return { voiceLufs: -18, regions, expr };
  const graph = join(P.dir, "assets", "mix", "_voice.txt");
  writeFileSync(graph, `${parts.join(";\n")};\n${lines.map((_, i) => `[v${i}]`).join("")}amix=inputs=${lines.length}:normalize=0,loudnorm=print_format=json[o]`);
  const r = run("ffmpeg", ["-hide_banner", "-nostats", ...ins, "-filter_complex_script", graph, "-map", "[o]", "-t", total.toFixed(2), "-f", "null", "-"], { capture: true });
  const j = JSON.parse(r.stderr.slice(r.stderr.lastIndexOf("{"), r.stderr.lastIndexOf("}") + 1));
  return { voiceLufs: +j.input_i, regions, expr };
}

// A small-room impulse response (0.6 s RT60, darkened), generated — no third-party IR licence to track.
function ensureIR() {
  if (existsSync(IR)) return IR;
  run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "aevalsrc='(random(0)*2-1)*exp(-t*11.5)|(random(1)*2-1)*exp(-t*11.5)':s=48000:d=0.7",
    "-af", "adelay=12:all=1,highpass=f=250,lowpass=f=5500,afade=t=in:d=0.003", "-c:a", "pcm_s16le", IR]);
  return IR;
}

// ── the premix ────────────────────────────────────────────────────────────────────────────────────────────────────
export function hasMusic(video) { return !!(video.bgm?.file || (video.music || []).some((c) => c.file)); }

export function mixSoundtrack(P, sb, built, meta) {
  const ft = timeline(sb), total = ft.reduce((a, f) => a + f.dur, 0);
  const cfg = P.video.sound || {}, warn = [];
  const bed = (k) => ({ ...BEDS[k], ...(k === "music" && P.video.bgm ? { gap: P.video.bgm.gap ?? BEDS.music.gap, under: P.video.bgm.under ?? BEDS.music.under } : {}), ...(cfg[k] || {}) });
  mkdirSync(join(P.dir, "assets", "mix"), { recursive: true });
  const voiced = processVoices(P, meta);
  const duck = duckPlan(P, ft, meta, total), V = duck.voiceLufs;
  const els = []; // {bus, file, start, off, dur, gain, fin, fout, loop, filters}

  // music cues
  const cues = (P.video.music?.length ? P.video.music : P.video.bgm?.file ? [{ file: P.video.bgm.file, at: 0, fade: 1.2 }] : [])
    .map((c) => ({ ...c, t: Math.max(0, cueTime(c.at, ft)) })).sort((a, b) => a.t - b.t);
  const M = bed("music");
  cues.forEach((c, i) => {
    if (!c.file) return;
    const prev = cues[i - 1], next = cues[i + 1], src = libPath(P.dir, c.file);
    if (!existsSync(src)) die(`music file not found: ${src}`);
    // track → track: a crossfade of `fade` s centred on the cue · into silence ({file: null}): out by the cue time
    const xin = prev?.file ? c.fade ?? 1.5 : 0, xout = next?.file ? next.fade ?? 1.5 : 0;
    const start = Math.max(0, c.t - xin / 2), end = next ? Math.min(total, next.t + xout / 2) : total;
    const fin = prev?.file ? xin : c.fade ?? 1.2, fout = next ? (next.file ? xout : next.fade ?? 0.4) : Math.min(3, (end - start) / 4);
    // "from": "end" back-times the cue: the track's own ending lands on the cue's end (the last cue resolves on the
    // final frame instead of being faded out mid-phrase)
    const m = measure(src), dur = end - start, off = c.from === "end" ? Math.max(0, m.dur - dur) : c.from ?? 0;
    if (off + dur > m.dur + 0.05) warn.push(`music ${basename(src)} is ${m.dur.toFixed(0)}s but plays ${(off + dur).toFixed(0)}s from ${start.toFixed(0)}s — it loops (audible seam); add a cue with another track or a later "from"`);
    els.push({ bus: "music", file: src, src: c.file, start, off, dur, gain: V - M.gap - m.I + (c.gain || 0), fin, fout, loop: off + dur > m.dur, pre: "", filters: "" });
  });
  if (P.video.music?.length) {
    // long-form: a bed that never changes for minutes reads as stock — warn past 4 min on one cue
    for (const e of els.filter((x) => x.bus === "music")) if (e.dur > 240) warn.push(`music ${basename(e.file)} runs ${(e.dur / 60).toFixed(1)} min without a change from ${e.start.toFixed(0)}s — add a cue at the next turn`);
  }

  // ambience (carried across frames until changed)
  const A = bed("ambience"), amb = [], ambAt = [];
  let cur = null;
  built.forEach((b, i) => {
    const a = b.spec.ambience;
    if (a !== undefined) cur = a === "none" || a === null ? null : typeof a === "string" ? { file: a } : a;
    ambAt[i] = !!cur;
    const key = cur ? `${cur.file}|${cur.gain || 0}|${cur.from || 0}` : null, last = amb[amb.length - 1];
    if (last && last.key === key) last.end = ft[i].start + ft[i].dur;
    else amb.push({ key, a: cur, start: ft[i].start, end: ft[i].start + ft[i].dur });
  });
  for (const s of amb) {
    if (!s.a) continue;
    const src = libPath(P.dir, s.a.file);
    if (!existsSync(src)) die(`ambience file not found: ${src}`);
    const m = measure(src), start = Math.max(0, s.start - 0.5), end = Math.min(total, s.end + 0.5);
    els.push({ bus: "ambience", file: src, src: s.a.file, start, off: s.a.from || 0, dur: end - start, gain: V - A.gap - m.I + (s.a.gain || 0), fin: start ? 1 : 0.6, fout: end < total ? 1 : Math.min(3, end - start), loop: (s.a.from || 0) + end - start > m.dur, filters: "highpass=f=40" });
  }

  // nat sound from footage
  const N = bed("nat"), clipsWithoutSound = [];
  built.forEach((b, i) => {
    for (const v of Array.isArray(b.spec.video) ? b.spec.video : b.spec.video ? [b.spec.video] : []) {
      if (!v.nat) { if (!ambAt[i]) clipsWithoutSound.push(`${b.id}/${basename(String(v.src))}`); continue; }
      const o = typeof v.nat === "object" ? v.nat : {};
      const src = join(P.dir, o.file || String(v.src).replace(/\.\w+$/, ".nat.flac"));
      if (!existsSync(src)) { warn.push(`${b.id}: nat sound ${rel(relative(P.dir, src))} missing — re-run studio clip (it now keeps the clip's audio) or drop "nat"`); continue; }
      const m = measure(src), st = v.start ?? 0, dur = Math.min(v.dur ?? ft[i].dur - st, m.dur);
      if (dur <= 0.1) continue;
      els.push({ bus: "nat", file: src, src: null, start: ft[i].start + st, off: 0, dur, gain: V - N.gap - m.I + (o.gain || 0), fin: 0.25, fout: Math.min(0.4, dur / 3), loop: false, filters: "highpass=f=60" });
    }
  });

  // SFX
  const sfxMeta = [];
  built.forEach((b, i) => {
    for (const x of b.spec.sfx || []) {
      const src = libPath(P.dir, x.file);
      if (!existsSync(src)) die(`${b.id}: sfx file not found: ${src}`);
      const m = measure(src), role = roleOf(x, src);
      const legacy = x.volume != null ? 20 * Math.log10(Math.max(0.01, x.volume) / 0.35) : 0;
      const dur = Math.min(m.dur, x.dur ?? m.dur), at = x.at ?? 0;
      const gain = Math.max(-30, Math.min(30, V + ROLES[role] - m.M + (x.gain ?? legacy)));
      els.push({ bus: "sfx", file: src, src: x.file, start: ft[i].start + at, off: 0, dur, gain, fin: 0.004, fout: Math.min(0.12, dur * 0.3), loop: false,
        pre: "silenceremove=start_periods=1:start_threshold=-50dB,", filters: `highpass=f=${role === "hit" ? 25 : 90},lowpass=f=16000` });
      sfxMeta.push({ frame: sb.frames[i].number, file: rel(relative(P.dir, src)), source: x.file, offset_s: at, duration_s: r3(dur), role, gain_db: +gain.toFixed(1) });
    }
  });

  // graph → one filter script (long-form graphs are far past the Windows command-line limit)
  const ins = [], lines = [], buses = { music: [], ambience: [], nat: [], sfx: [] };
  els.forEach((e, k) => {
    if (e.loop) ins.push("-stream_loop", "-1");
    ins.push("-i", e.file);
    const fout = Math.max(0.004, Math.min(e.fout, e.dur / 2)), fin = Math.max(0.004, Math.min(e.fin, e.dur / 2));
    lines.push(`[${k}:a]${e.pre || ""}atrim=start=${e.off.toFixed(3)}:duration=${e.dur.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo${e.filters ? "," + e.filters : ""},volume=${e.gain.toFixed(2)}dB,afade=t=in:d=${fin.toFixed(3)},afade=t=out:st=${Math.max(0, e.dur - fout).toFixed(3)}:d=${fout.toFixed(3)},adelay=${Math.round(Math.max(0, e.start) * 1000)}:all=1[e${k}]`);
    buses[e.bus].push(`[e${k}]`);
  });
  const outs = [];
  const sum = (name, list, post) => {
    if (!list.length) return;
    lines.push(`${list.join("")}amix=inputs=${list.length}:normalize=0:dropout_transition=0${post ? "," + post : ""}[${name}]`);
    outs.push(`[${name}]`);
  };
  const duckExpr = (b) => { const g = Math.pow(10, -(b.under - b.gap) / 20); return duck.regions.length ? `volume=1-${(1 - g).toFixed(4)}*${duck.expr}:eval=frame` : ""; };
  // music: a gentle dip where the voice lives, then the duck
  sum("mus", buses.music, ["equalizer=f=2500:t=o:w=1.2:g=-3", duckExpr(M)].filter(Boolean).join(","));
  sum("amb", buses.ambience, duckExpr(A));
  sum("nat", buses.nat, duckExpr(N));
  if (buses.sfx.length) {
    const ir = ensureIR(), k = els.length;
    ins.push("-i", ir);
    // wet level relative to the dry SFX (default −16 dB: a room you feel, not hear). afir peak-normalises the IR,
    // which leaves its output ~31 dB under the input (measured on a stamp, 2026-10-10) — IR_CAL brings it back.
    const wet = cfg.reverb ?? -16, IR_CAL = 31.3;
    lines.push(`${buses.sfx.join("")}amix=inputs=${buses.sfx.length}:normalize=0:dropout_transition=0,asplit=2[sd][sw]`);
    lines.push(`[${k}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[ir]`);
    lines.push(`[sw][ir]afir,volume=${(IR_CAL + wet).toFixed(1)}dB[sr]`);
    lines.push(`[sd][sr]amix=inputs=2:normalize=0[sfx]`);
    outs.push("[sfx]");
  }
  const out = join(P.dir, "assets", "mix", "soundtrack.mp3");
  if (!outs.length) { meta.bgm = null; meta.sfx = []; meta.sound = { voiceLufs: V, music: [], ambience: [], nat: [], sfx: [], clipsWithoutSound }; return { warn, voiced }; }
  lines.push(`${outs.join("")}amix=inputs=${outs.length}:normalize=0:dropout_transition=0,apad=whole_dur=${total.toFixed(3)},atrim=0:${total.toFixed(3)},alimiter=limit=0.89:level=0[out]`);
  const script = join(P.dir, "assets", "mix", "_graph.txt");
  writeFileSync(script, lines.join(";\n"));
  run("ffmpeg", ["-y", "-loglevel", "error", ...ins, "-filter_complex_script", script, "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "320k", "-ar", "48000", out]);
  const pick = (bus) => els.filter((e) => e.bus === bus).map((e) => ({ file: e.src || rel(relative(P.dir, e.file)), start: r3(e.start), dur: r3(e.dur), gain_db: +e.gain.toFixed(1) }));
  meta.bgm = { path: "assets/mix/soundtrack.mp3", volume: 1, source: "premix", premix: true };
  meta.sfx = []; // premixed — the assembler emits no SFX lanes
  meta.sound = { voiceLufs: V, ducked: duck.regions.length, music: pick("music"), ambience: pick("ambience"), nat: pick("nat"), sfx: sfxMeta, clipsWithoutSound };
  return { warn, voiced };
}

// Library files a mix used (for credits): music + ambience + SFX sources.
export function soundSources(meta) {
  if (meta?.sound) return [...meta.sound.music, ...meta.sound.ambience].map((x) => x.file).concat(meta.sound.sfx.map((x) => x.source)).filter(Boolean);
  return [meta?.bgm?.source, ...(meta?.sfx || []).map((x) => x.source)].filter(Boolean);
}

// ── library: studio sound index | search | get | music ──────────────────────────────────────────────────────────────
// WAV header → duration without spawning ffprobe for every one of ~10k files
function wavInfo(p) {
  const fd = openSync(p, "r"), buf = Buffer.alloc(65536);
  try {
    const n = readSync(fd, buf, 0, buf.length, 0);
    if (buf.toString("ascii", 0, 4) !== "RIFF") return null;
    let o = 12, fmt = null;
    while (o + 8 <= n) {
      const id = buf.toString("ascii", o, o + 4), size = buf.readUInt32LE(o + 4);
      if (id === "fmt ") fmt = { ch: buf.readUInt16LE(o + 10), sr: buf.readUInt32LE(o + 12), bps: buf.readUInt32LE(o + 16) };
      if (id === "data" && fmt) return { ch: fmt.ch, sr: fmt.sr, dur: r3(size / fmt.bps) };
      o += 8 + size + (size % 2);
    }
    return fmt ? { ch: fmt.ch, sr: fmt.sr, dur: r3((statSync(p).size - 44) / fmt.bps) } : null;
  } finally { closeSync(fd); }
}
function walk(dir, out = []) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.name === "__MACOSX" || d.name.startsWith("._")) continue; // macOS resource forks inside the zips
    if (d.isDirectory()) walk(p, out); else if (/\.(wav|flac|mp3|ogg)$/i.test(d.name)) out.push(p);
  }
  return out;
}
const words = (s) => s.toLowerCase().replace(/([a-z])([A-Z])/g, "$1 $2").split(/[^a-z0-9]+/).filter((w) => w.length > 1);
const INDEX = join(SONNISS, "index.json"), LAST = join(AUDIO, ".last-search.json");

function cmdIndex() {
  if (!existsSync(SONNISS)) die(`no library at ${SONNISS} — unzip the Sonniss GDC bundle there first (STUDIO.md → Sound)`);
  const files = walk(SONNISS);
  const rows = [];
  for (const p of files) {
    const r = rel(relative(SONNISS, p)), info = /\.wav$/i.test(p) ? wavInfo(p) : null;
    const parts = r.split("/");
    rows.push({ p: r, pack: parts.length > 2 ? parts[1] : parts[0], dur: info?.dur ?? null, ch: info?.ch ?? null, sr: info?.sr ?? null, w: [...new Set(words(r.replace(/\.\w+$/, "")))] });
  }
  writeJson(INDEX, rows);
  console.log(`✓ indexed ${rows.length} sounds from ${new Set(rows.map((x) => x.pack)).size} packs → ${INDEX}`);
}

// remote catalog of every yearly Sonniss bundle (tools/sonniss/sonniss.py catalog) — single sounds fetched on demand
const CATALOG = join(SONNISS, "catalog.json"), SONNISS_PY = join(STUDIO, "tools", "sonniss", "sonniss.py");
function searchRows() {
  const local = existsSync(INDEX) ? readJson(INDEX).map((r) => ({ ...r, local: true })) : [];
  const have = new Set(local.map((r) => r.p));
  const remote = existsSync(CATALOG) ? readJson(CATALOG).map((r) => ({ p: `${r.b}/${r.m}`, url: r.url, m: r.m, b: r.b, bytes: r.bytes, pack: r.m.split("/")[0], dur: null, w: [...new Set(words(r.m.replace(/\.\w+$/, "")))] })).filter((r) => !have.has(r.p)) : [];
  if (!local.length && !remote.length) die("no sound library yet — studio sound index (local bundle) and/or the remote catalog (STUDIO.md → Sound)");
  return local.concat(remote);
}

function cmdSearch(q, flag) {
  if (!q.length) die("sound search <words…> [--min s] [--max s] [--n 20] [--local]");
  let rows = searchRows();
  if (process.argv.includes("--local")) rows = rows.filter((r) => r.local);
  const terms = q.flatMap((x) => words(x));
  const min = +flag("min", 0), max = +flag("max", 1e9), n = +flag("n", 20);
  const hits = rows.map((r) => {
    const name = words(basename(r.p));
    let s = r.local ? 0.5 : 0;
    for (const t of terms) { if (name.some((w) => w === t)) s += 3; else if (r.w.some((w) => w === t)) s += 2; else if (r.w.some((w) => w.startsWith(t))) s += 1; else return null; }
    return { ...r, s };
  }).filter((r) => r && (r.dur == null || (r.dur >= min && r.dur <= max))).sort((a, b) => b.s - a.s || (a.dur ?? 0) - (b.dur ?? 0)).slice(0, n);
  if (!hits.length) return console.log("no matches — try fewer or broader words");
  writeJson(LAST, hits.map((h) => (h.local ? { p: h.p } : { p: h.p, url: h.url, m: h.m })));
  hits.forEach((h, i) => {
    if (!h.local) return console.log(`${String(i + 1).padStart(3)}. ${(h.bytes / 1e6).toFixed(1).padStart(6)}MB  [remote ${h.b}] ${h.m}`);
    const m = measure(join(SONNISS, h.p));
    if (m.unreadable) return console.log(`${String(i + 1).padStart(3)}. (unreadable) ${h.p}`);
    console.log(`${String(i + 1).padStart(3)}. ${(h.dur ?? m.dur).toFixed(1).padStart(6)}s   I ${String(m.I).padStart(6)} · M ${String(m.M).padStart(6)} · pk ${String(m.peak).padStart(5)}  ${h.ch === 1 ? "mono  " : "      "}${h.p}`);
  });
  console.log(`→ studio sound get <#> <name> --role hit|whoosh|riser|foley|ui|ambience [--from s --to s]   (remote ones download first)`);
}

function cmdGet(pos, flag) {
  const [which, name] = pos;
  if (!which || !name) die("sound get <#n|path-in-library> <name> --role hit|whoosh|riser|foley|ui|ambience [--from s] [--to s]");
  const pick = /^\d+$/.test(which) && existsSync(LAST) ? readJson(LAST)[+which - 1] : { p: which };
  if (!pick) die(`no result #${which} in the last search`);
  const src = typeof pick === "string" ? pick : pick.p;
  let abs = existsSync(src) ? src : join(SONNISS, src);
  if (!existsSync(abs) && pick.url) {
    mkdirSync(join(abs, ".."), { recursive: true });
    console.log(`fetching ${pick.m} from the ${src.split("/")[0]} bundle…`);
    run("python", ["-I", SONNISS_PY, "fetch", pick.url, pick.m, abs], { capture: true });
  }
  if (!existsSync(abs)) die("no such sound: " + src);
  const role = flag("role", null);
  if (!role || !(ROLES[role] || role === "ambience")) die(`--role is required: ${Object.keys(ROLES).join(" | ")} | ambience`);
  const sub = role === "ambience" ? "ambience" : "sfx", dir = join(AUDIO, sub); mkdirSync(dir, { recursive: true });
  const out = join(dir, name + ".flac");
  const cut = [...(flag("from") ? ["-ss", flag("from")] : []), ...(flag("to") ? ["-to", flag("to")] : [])];
  // one-shots: leading silence trimmed so the cue lands on its word; everything 48 kHz stereo, peak −1 dBFS
  const af = [role === "ambience" ? null : "silenceremove=start_periods=1:start_threshold=-55dB", "aformat=channel_layouts=stereo"].filter(Boolean).join(",");
  run("ffmpeg", ["-y", "-loglevel", "error", ...cut, "-i", abs, "-af", af, "-ar", "48000", "-sample_fmt", "s32", "-c:a", "flac", out]);
  const pk = measure(out).peak;
  if (pk > -1 || pk < -6) { const tmp = out.replace(/\.flac$/, "._n.flac"); run("ffmpeg", ["-y", "-loglevel", "error", "-i", out, "-af", `volume=${(-1 - pk).toFixed(2)}dB`, "-sample_fmt", "s32", "-c:a", "flac", tmp]); renameSync(tmp, out); }
  const m = measure(out), origin = rel(relative(SONNISS, abs));
  const L = ledger().filter((e) => e.file !== `assets/audio/${sub}/${name}.flac`);
  L.push({ title: basename(abs).replace(/\.\w+$/, ""), creator: origin.split("/").length > 2 ? origin.split("/")[1] : origin.split("/")[0], source: "sonniss",
    source_url: "https://sonniss.com/gameaudiogdc/", license_name: "Sonniss GDC Game Audio Bundle licence (royalty-free, commercial use, no attribution; no redistribution, no AI training)",
    license_url: "https://sonniss.com/gdc-bundle-license/", public_domain: false, attribution_required: false, commercial_use: true, kind: sub === "ambience" ? "ambience" : "sfx", role,
    file: `assets/audio/${sub}/${name}.flac`, origin, duration_s: m.dur, bytes: statSync(out).size, sha256: createHash("sha256").update(readFileSync(out)).digest("hex"), downloaded_at: new Date().toISOString() });
  writeJson(LEDGER, L);
  const use = role === "ambience" ? `spec → "ambience": "../_studio/assets/audio/ambience/${name}.flac"` : `spec → "sfx": [{"file": "../_studio/assets/audio/sfx/${name}.flac", "at": "<cue>", "role": "${role}"}]`;
  console.log(`✓ ${rel(relative(STUDIO, out))} · ${m.dur.toFixed(1)}s · I ${m.I} · M ${m.M} · role ${role}\n  use: ${use}`);
}

// Music library entries. Sources: YouTube Audio Library (user downloads; YouTube-only licence) or CC BY composers such as
// Scott Buckley (--source "Scott Buckley" --licence "CC BY 4.0" --attribution "…" --url <track page>). File names carry a
// source prefix (yt-, sb-) and are git-ignored — the composers forbid re-uploading the raw tracks.
function cmdMusic(pos, flag) {
  const [file, name] = pos;
  if (!file || !name) die('sound music <file|url> <name> --title "…" --artist "…" [--source "YouTube Audio Library"] [--prefix yt-] [--licence "…"] [--url page] [--attribution "…"] [--mood …]');
  const dir = join(AUDIO, "music"); mkdirSync(dir, { recursive: true });
  const prefix = flag("prefix", "yt-"), base = prefix + name, out = join(dir, base + ".mp3");
  if (/^https?:/.test(file)) run("curl", ["-sSL", "--fail", "-A", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36", "-o", out, file]);
  else if (!existsSync(file)) die("no such file: " + file);
  else if (/.mp3$/i.test(file)) copyFileSync(file, out); else run("ffmpeg", ["-y", "-loglevel", "error", "-i", file, "-c:a", "libmp3lame", "-b:a", "320k", out]);
  const m = measure(out), attribution = flag("attribution", null), source = flag("source", "YouTube Audio Library"), yt = /youtube/i.test(source);
  const L = ledger().filter((e) => e.file !== `assets/audio/music/${base}.mp3`);
  L.push({ title: flag("title", basename(file).replace(/.w+$/, "")), creator: flag("artist", null), source,
    source_url: flag("url", yt ? "https://studio.youtube.com/channel/UC/music" : /^https?:/.test(file) ? file : null),
    license_name: flag("licence", yt ? (attribution ? "YouTube Audio Library (attribution required)" : "YouTube Audio Library (YouTube use, no attribution)") : null),
    license_url: yt ? "https://support.google.com/youtube/answer/3376882" : /CC BY 4.0/i.test(flag("licence", "")) ? "https://creativecommons.org/licenses/by/4.0/" : null,
    public_domain: false, attribution_required: !!attribution, attribution, commercial_use: true, kind: "music",
    mood: flag("mood", null), file: `assets/audio/music/${base}.mp3`, duration_s: m.dur, bytes: statSync(out).size, sha256: createHash("sha256").update(readFileSync(out)).digest("hex"), downloaded_at: new Date().toISOString() });
  writeJson(LEDGER, L);
  console.log(`✓ ${rel(relative(STUDIO, out))} · ${(m.dur / 60).toFixed(1)} min · I ${m.I} LUFS${attribution ? " · attribution goes into the description automatically" : ""}
  use: video.json → "music": [{"file": "../_studio/assets/audio/music/${base}.mp3", "at": "ch0"}]`);
}

export function cmdSound(positional, flag) {
  const [sub, ...rest] = positional;
  if (sub === "index") return cmdIndex();
  if (sub === "search") return cmdSearch(rest, flag);
  if (sub === "get") return cmdGet(rest, flag);
  if (sub === "music") return cmdMusic(rest, flag);
  die("sound index | search <words…> [--min s --max s --n 20] | get <#|path> <name> --role r [--from s --to s] | music <file> <name> --title … --artist …");
}
