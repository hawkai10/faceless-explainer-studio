// Chapter renders (long-form, 2026-10-11): render each chapter's picture on its own, stitch, then lay ONE continuous
// soundtrack over the whole thing — so audio never jumps at a join and only changed chapters re-render.
//
//   build    snaps every chapter end to a multiple of 0.1 s (3 frames at 30 fps; exact in the assembler's ms durations)
//            by stretching the chapter's last frame, so the chapter pieces add up to exactly the full timeline.
//   render   index-chNN.html = index.html with only that chapter's scenes, re-based to 0, no <audio> → silent MP4 per
//            chapter (skipped when its fingerprint is unchanged) → concat (stream copy, frame count checked) →
//            master audio (voice mix + premixed soundtrack, the same elements HyperFrames would mix) → mux → raw.mp4.
// See STUDIO.md → Long-form → Chapter renders.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chapterOf, die, readJson, writeJson, run, pad2 } from "./common.mjs";

export const FPS = 30, GRID = 0.1; // chapter boundaries land on whole frames: 0.1 s = 3 frames
const r3 = (x) => Math.round(x * 1000) / 1000;

// chapter spans from the storyboard: [{ch, first, last (frame indexes), start, end}]
export function chapterSpans(sb) {
  const ch = chapterOf(sb), spans = [];
  let t = 0;
  sb.frames.forEach((f, i) => {
    const d = f.durationSeconds || parseFloat(f.duration) || 4, last = spans[spans.length - 1];
    if (last && last.ch === ch[i]) { last.last = i; last.end = r3(t + d); }
    else spans.push({ ch: ch[i], first: i, last: i, start: r3(t), end: r3(t + d) });
    t += d;
  });
  return spans;
}

// Stretch each chapter's last frame so the chapter ends on the 0.1 s grid. Returns the frames it changed.
export function quantizeChapters(P, sb) {
  const path = join(P.dir, "STORYBOARD.md");
  let text = readFileSync(path, "utf8");
  const changed = [];
  let t = 0;
  const ch = chapterOf(sb);
  sb.frames.forEach((f, i) => {
    let d = f.durationSeconds || parseFloat(f.duration) || 4;
    const lastOfChapter = i === sb.frames.length - 1 || ch[i + 1] !== ch[i];
    if (lastOfChapter) {
      const end = t + d, snapped = Math.ceil(end / GRID - 1e-6) * GRID;
      if (snapped - end > 5e-4) {
        const nd = r3(d + snapped - end);
        // rewrite this frame's "- duration:" line (sections start at "## Frame N")
        const re = new RegExp(`(## Frame ${f.number}\\b[\\s\\S]*?\\n- duration: )([\\d.]+)(s?)`);
        if (!re.test(text)) die(`chapter snap: no "- duration:" line for frame ${f.number}`);
        text = text.replace(re, `$1${nd}$3`);
        changed.push(`frame ${f.number} ${d.toFixed(3)} → ${nd.toFixed(3)} s`);
        d = nd;
      }
    }
    t += d;
  });
  if (changed.length) writeFileSync(path, text);
  return changed;
}

// index.html → index-chNN.html for one chapter (scenes only, re-based; all <audio> dropped — the master mix carries sound)
export function chapterIndex(P, span) {
  const html = readFileSync(join(P.dir, "index.html"), "utf8");
  const dur = r3(span.end - span.start), eps = 0.002, bad = [];
  let kept = 0;
  let out = html.replace(/<audio\b[^>]*>\s*<\/audio>/g, "");
  out = out.replace(/<div\b([^>]*?)data-start="([\d.]+)"([^>]*?)data-duration="([\d.]+)"([^>]*)>\s*<\/div>/g, (m, a, s, b, d, c) => {
    const st = +s, en = st + +d;
    if (st >= span.start - eps && en <= span.end + eps) { kept++; return `<div${a}data-start="${r3(st - span.start)}"${b}data-duration="${d}"${c}></div>`; }
    if (st < span.end - eps && en > span.start + eps) bad.push(m.match(/id="([^"]+)"/)?.[1] || "?");
    return "";
  });
  if (bad.length) die(`chapter ${span.ch}: ${bad.join(", ")} crosses the chapter boundary — make each chapter's first frame a cut (transition_in: cut)`);
  if (!kept) die(`chapter ${span.ch}: no scenes found in index.html — run studio build first`);
  out = out.replace(/(<div\s+id="root"[\s\S]*?data-duration=")([\d.]+)(")/, `$1${dur}$3`);
  return { html: out, dur, scenes: kept };
}

// what a chapter's picture depends on: its index, its frame compositions, and every local file those reference
function fingerprint(P, html) {
  const h = createHash("sha256").update(html);
  const srcs = [...html.matchAll(/data-composition-src="([^"]+)"/g)].map((m) => m[1]);
  for (const s of srcs) {
    const f = join(P.dir, s);
    if (!existsSync(f)) continue;
    const body = readFileSync(f, "utf8");
    h.update(s).update(body);
    for (const m of body.matchAll(/(?:src|href)="((?:assets|data|\.\.\/_studio)\/[^"]+)"/g)) {
      const a = join(P.dir, m[1]);
      if (existsSync(a)) { const st = statSync(a); h.update(`${m[1]}|${st.size}|${Math.round(st.mtimeMs)}`); }
    }
  }
  return h.digest("hex").slice(0, 16);
}

// The renderer captures a chapter's very first frame before the timeline is seeked, so frame 0 shows a later state of
// the chapter (1/30 s flash before the card; user, 2026-10-13). Same bug as Modal's chunk 0 (see tools/modal/hfdist.mjs).
// Replace frame 0 with a copy of frame 1. Every chapter piece goes through this one encoder, so all pieces share the
// same H.264 settings and still concat by stream copy. Marks done pieces in the manifest (fixed0).
export const ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "14", "-profile:v", "high", "-pix_fmt", "yuv420p", "-bf", "0", "-g", "60", "-video_track_timescale", "15360"];
export function fixFirstFrame(mp4) {
  const tmp = mp4.replace(/\.mp4$/, ".fix.mp4");
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", mp4, "-vf", "trim=start_frame=1,setpts=PTS-STARTPTS,tpad=start=1:start_mode=clone", ...ENC, "-an", tmp]);
  rmSync(mp4, { force: true });
  renameSync(tmp, mp4);
}

const frameCount = (mp4) => +run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", mp4], { capture: true }).stdout.trim();

// Render the chapters that changed, stitch, and mux the master audio → raw.mp4. `renderOne(entryFile, outMp4)` renders
// one chapter index (local npx or Modal). opts: only = [chapter numbers] to force, force = re-render all.
export function renderChapters(P, sb, raw, renderOne, opts = {}) {
  const spans = chapterSpans(sb);
  const off = spans.filter((s) => Math.abs(s.end / GRID - Math.round(s.end / GRID)) > 1e-3);
  if (off.length) die(`chapter ends off the frame grid (${off.map((s) => "ch" + s.ch + " @" + s.end).join(", ")}) — run studio build (it snaps them)`);
  const dir = join(P.dir, "renders", "chapters"); mkdirSync(dir, { recursive: true });
  const manPath = join(dir, "manifest.json"), man = existsSync(manPath) ? readJson(manPath) : {};
  const t0 = Date.now();
  for (const s of spans) {
    const id = "ch" + pad2(s.ch), entry = `index-${id}.html`, mp4 = join(dir, id + ".mp4");
    const c = chapterIndex(P, s), fp = fingerprint(P, c.html), want = Math.round(c.dur * FPS);
    writeFileSync(join(P.dir, entry), c.html);
    const cached = man[id]?.fp === fp && existsSync(mp4) && frameCount(mp4) === want;
    if (cached && !opts.force && !(opts.only || []).includes(s.ch)) {
      if (!man[id].fixed0) { fixFirstFrame(mp4); man[id].fixed0 = true; writeJson(manPath, man); console.log(`· ${id} unchanged — frame 0 fixed`); }
      console.log(`· ${id} unchanged (${c.dur.toFixed(1)} s) — reusing renders/chapters/${id}.mp4`); continue;
    }
    const t = Date.now();
    console.log(`▶ ${id}: ${c.scenes} scene(s) · ${c.dur.toFixed(1)} s · ${want} frames`);
    renderOne(entry, mp4);
    fixFirstFrame(mp4);
    const got = frameCount(mp4);
    if (got !== want) die(`${id}: rendered ${got} frames, expected ${want} — not stitching a chapter that would drift`);
    man[id] = { fp, frames: got, start: s.start, end: s.end, rendered_at: new Date().toISOString(), fixed0: true };
    writeJson(manPath, man);
    console.log(`✓ ${id} in ${((Date.now() - t) / 60000).toFixed(1)} min`);
  }
  for (const k of Object.keys(man)) if (!spans.some((s) => "ch" + pad2(s.ch) === k)) delete man[k];
  writeJson(manPath, man);
  // stitch the pictures (same encoder settings → stream copy, no re-encode)
  const list = join(dir, "concat.txt");
  writeFileSync(list, spans.map((s) => `file '${join(dir, "ch" + pad2(s.ch) + ".mp4").replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
  const video = join(dir, "_video.mp4");
  run("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-map", "0:v", "-c", "copy", video]);
  const total = spans[spans.length - 1].end, want = Math.round(total * FPS), got = frameCount(video);
  if (got !== want) die(`stitched picture has ${got} frames, timeline needs ${want}`);
  // one continuous soundtrack for the whole video: voice lines (through the voice chain) + the premix
  const audio = masterAudio(P, sb, total, join(dir, "_audio.wav"));
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", video, "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-shortest", raw]);
  for (const f of [video, audio]) rmSync(f, { force: true });
  console.log(`✓ stitched ${spans.length} chapters · ${got} frames · ${(total / 60).toFixed(2)} min · one continuous soundtrack (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
}

// The elements index.html plays — voice per frame (v.mix through the chain, else the raw line) at the frame start
// + the bed (the premixed soundtrack) — summed once at full length.
export function masterAudio(P, sb, total, out) {
  const meta = readJson(join(P.dir, "audio_meta.json"));
  const starts = new Map(); let t = 0;
  for (const f of sb.frames) { starts.set(f.number, t); t += f.durationSeconds || parseFloat(f.duration) || 4; }
  const ins = [], parts = [];
  const add = (file, at, vol) => {
    const k = parts.length; ins.push("-i", join(P.dir, file));
    parts.push(`[${k}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${vol},adelay=${Math.round(at * 1000)}:all=1[a${k}]`);
  };
  for (const v of meta.voices || []) { const f = v.mix && existsSync(join(P.dir, v.mix)) ? v.mix : v.path; if (existsSync(join(P.dir, f))) add(f, starts.get(v.frame) || 0, 1); }
  if (meta.bgm?.path && existsSync(join(P.dir, meta.bgm.path))) add(meta.bgm.path, 0, meta.bgm.volume ?? 1);
  if (!parts.length) die("no audio to mix — run studio audio and studio build first");
  const script = join(P.dir, "renders", "chapters", "_master.txt");
  writeFileSync(script, parts.join(";\n") + `;\n${parts.map((_, k) => `[a${k}]`).join("")}amix=inputs=${parts.length}:normalize=0:dropout_transition=0,apad=whole_dur=${total.toFixed(3)},atrim=0:${total.toFixed(3)}[out]`);
  run("ffmpeg", ["-y", "-loglevel", "error", ...ins, "-filter_complex_script", script, "-map", "[out]", "-c:a", "pcm_s24le", out]);
  return out;
}

// Preview one chapter for review: its picture (rendered or reused, like a chapter render) + that stretch of the
// full-length soundtrack (mixed once, normalised to −14 LUFS like the final, then cut) → renders/preview-chNN.mp4
export function previewChapter(P, sb, n, renderOne) {
  const span = chapterSpans(sb).find((s) => s.ch === n);
  if (!span) die(`no chapter ${n}`);
  const dir = join(P.dir, "renders", "chapters"); mkdirSync(dir, { recursive: true });
  const id = "ch" + pad2(n), entry = `index-${id}.html`, mp4 = join(dir, id + ".mp4");
  const c = chapterIndex(P, span), fp = fingerprint(P, c.html), want = Math.round(c.dur * FPS);
  const manPath = join(dir, "manifest.json"), man = existsSync(manPath) ? readJson(manPath) : {};
  writeFileSync(join(P.dir, entry), c.html);
  if (!(man[id]?.fp === fp && existsSync(mp4) && frameCount(mp4) === want)) {
    console.log(`▶ ${id}: rendering ${c.dur.toFixed(1)} s (${want} frames)…`);
    renderOne(entry, mp4);
    fixFirstFrame(mp4);
    const got = frameCount(mp4);
    if (got !== want) die(`${id}: rendered ${got} frames, expected ${want}`);
    man[id] = { fp, frames: got, start: span.start, end: span.end, rendered_at: new Date().toISOString(), fixed0: true };
    writeJson(manPath, man);
  } else {
    if (!man[id].fixed0) { fixFirstFrame(mp4); man[id].fixed0 = true; writeJson(manPath, man); }
    console.log(`· ${id} picture unchanged — reusing it`);
  }
  const total = chapterSpans(sb).slice(-1)[0].end;
  const wav = masterAudio(P, sb, total, join(dir, "_audio.wav"));
  const norm = join(dir, "_audio_norm.wav");
  const m = run("ffmpeg", ["-hide_banner", "-nostats", "-i", wav, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], { capture: true }).stderr;
  const j = JSON.parse(m.slice(m.lastIndexOf("{"), m.lastIndexOf("}") + 1));
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-af", `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`, "-ar", "48000", norm]);
  const out = join(P.dir, "renders", `preview-${id}.mp4`);
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", mp4, "-ss", span.start.toFixed(3), "-t", (span.end - span.start).toFixed(3), "-i", norm, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", out]);
  for (const f of [wav, norm]) rmSync(f, { force: true });
  console.log(`✓ ${out} · ${(span.end - span.start).toFixed(1)} s · picture + the final soundtrack for that stretch`);
  return out;
}
