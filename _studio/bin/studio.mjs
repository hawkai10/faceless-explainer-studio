#!/usr/bin/env node
// Studio CLI — the production line. See ../STUDIO.md.
//   node _studio/bin/studio.mjs <command> [project-dir] [flags]
// Commands: looks · variety · new <slug> --look <id> · audio · words · build · snap · render · status
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { STUDIO, VIDEOS, FE, SKILLS, HF, die, readJson, writeJson, pad2, run, node, npx, project, storyboard, frameId, normaliseCaptionWords, houseCast, ENDINGS, FOLLOW_ASK, END_HOLD, ENDS_SENTENCE, slugDir, libPath, lengthTarget, SHORT_CAP, PRODUCED, canvas, isLong, chapterOf, LONG_DEFAULT } from "./lib/common.mjs";
import { buildFrames } from "./lib/frames.mjs";
import { installCaptionSkin, postProcessCaptions, captionStyle, CAPTION_STYLE } from "./lib/captions.mjs";
import { loadEnv, voiceProject, transcribeWords, DEFAULT_MODEL, FISH_VOICE, HOUSE_VOICE } from "./lib/tts.mjs";
import { createHash } from "node:crypto";
import { cmdLottie, cmdAvatar, cmdHumaaans, cmdIconscout, cmdUndraw } from "./lib/assets.mjs";
import { cmdData } from "./lib/data.mjs";
import { cmdScript, cmdSplit } from "./lib/eleven.mjs";
import { cmdArticle, cmdSnip, cmdClip, cmdFootage, cmdPhoto, cmdCutout, cmdUpscale, cmdIconify } from "./lib/media.mjs";
import { alignAvailable, forceAlign } from "./lib/align.mjs";
import { mixSoundtrack, hasMusic, soundSources, cmdSound } from "./lib/sound.mjs";
import { quantizeChapters, renderChapters, chapterSpans, chapterIndex, previewChapter } from "./lib/chapters.mjs";
import { retimeWords } from "./lib/voicematch.mjs";

// TTS: video.json → tts {provider: "parler"|"openrouter"|"kokoro", ...}. Projects without a tts block
// keep the Kokoro voice they were made with; new projects default to the Parler house voice (Thoma).
function ttsConfig(video) { return video.tts || { provider: "kokoro", voice: video.voice }; }

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name, def) => { const i = argv.indexOf("--" + name); return i >= 0 ? argv[i + 1] : def; };
const has = (name) => argv.includes("--" + name);
const positional = argv.slice(1).filter((a, i, all) => !a.startsWith("--") && !(all[i - 1] || "").startsWith("--"));
const ENGINE = join(SKILLS, "media-use", "audio", "scripts", "audio.mjs");
const HISTORY = join(STUDIO, "history.json");
const TRANSITIONS = ["cut", "crossfade", "blur-crossfade", "push-slide LEFT", "push-slide RIGHT", "push-slide UP", "push-slide DOWN", "zoom-through", "squeeze"];
const MOTIONS = ["rise", "slam", "mask", "blur", "slide", "type", "fade"];
const BLOCKS = ["flood", "headline", "label", "text", "figure", "bars", "meter", "chips", "cards", "lines", "hero", "cta", "equation", "compare", "tally", "steps", "quote", "tag", "rule", "group", "icon", "scene", "peep", "invoice", "stamp", "lottie", "avatar", "humaaan", "art", "map", "custom"];

const looks = () => readdirSync(join(STUDIO, "looks")).filter((f) => f.endsWith(".json")).map((f) => readJson(join(STUDIO, "looks", f)));
const history = () => (existsSync(HISTORY) ? readJson(HISTORY) : []);

function frameTimes(sb) {
  let t = 0;
  return sb.frames.map((f) => { const d = f.durationSeconds || parseFloat(f.duration) || 4; const r = { id: frameId(f), start: t, dur: d }; t += d; return r; });
}

// ── looks / variety ─────────────────────────────────────────────────────────
function cmdLooks() {
  for (const l of looks()) console.log(`${l.id.padEnd(10)} ${l.mood}\n${"".padEnd(10)} ground=${l.ground} emph=${l.emph} motion=${l.motion.family}/${l.motion.hero} captions=${l.captions} chrome=${l.chrome}`);
}
const PROMPTS = [
  "a document the viewer already knows (a bill, payslip, statement) that fills in, line by line, to reveal the mechanism",
  "one number that transforms into another on screen (morph / recount / split)",
  "a before/after split where one side collapses",
  "a flow diagram: money or data moving between two or three nodes",
  "a timeline that scrubs forward with a playhead",
  "a typographic collage: one key sentence broken into scaled fragments",
  "a single chart that re-scales mid-frame to reveal the real story",
  "a ledger/receipt/invoice that fills in line by line",
  "a map or grid where cells light up to show proportion",
  "a stacked comparison that tips over like a balance",
  "a question typed, deleted and retyped as the reframe",
  "a zoom from one detail out to the whole system",
    ];
// One house identity (STYLE.md): no look / caption / transition rotation. Uniqueness comes from the story's own
// central visual idea — so this lists what recent videos did (to avoid restaging them) and the house rules.
const HOUSE_LOOK = "kredflow";
function cmdVariety() {
  const h = history(), recent = h.slice(-3);
  console.log(`History: ${h.length} video(s) · house look "${HOUSE_LOOK}" for every video`);
  for (const e of recent) {
    console.log(`  ${e.date} ${e.slug.padEnd(30)} hook=[${e.hook.join(",") || "custom"}] ending=${e.ending || "?"}${e.characters?.length ? " cast=" + e.characters.join("+") : ""}`);
    let d = e.assets ? e : null;
    if (!d && existsSync(join(slugDir(e.slug), "video.json"))) try { const P = project(slugDir(e.slug)); d = designRecord(P, readdirSync(join(P.dir, "spec")).filter((f) => /^\d{2,3}-.*\.json$/.test(f)).sort().map((f) => readJson(join(P.dir, "spec", f)))); } catch { /* project gone */ }
    if (d?.worlds?.length) console.log(`      scenes: ${d.worlds.join(" · ")}`);
    if (d?.assets?.length) console.log(`      assets: ${d.assets.join(", ")}  ← don't reach for these by default`);
  }
  console.log(`\nBefore writing specs, open the last 2–3 videos' spec/ files and renders/contact-sheet.jpg: note their central visual`);
  console.log(`idea, hook and signature moments, then design this one from its own story — reuse a model (e.g. the bill) only when the topic needs it.`);
  const p1 = PROMPTS[h.length % PROMPTS.length], p2 = PROMPTS[(h.length * 5 + 3) % PROMPTS.length];
  console.log(`\nCentral idea seeds (pick one, or better):\n  • ${p1}\n  • ${p2}`);
  const lastEnd = h[h.length - 1]?.ending, nextEnd = lastEnd === "loop" ? "punchline" : "loop";
  console.log(`\nEnding (video.json → ending): ${nextEnd} suggested${lastEnd ? " (last: " + lastEnd + ")" : ""}. Either way the last line is a complete sentence and the picture holds ≥ ${END_HOLD}s after it.`);
  console.log(`\nHouse rules (enforced by build): 2D only · library assets for objects and people (cast per video) · picture fills the whole canvas,`);
  console.log(`plain-text captions on top in the lower third · no sources on screen (upload.sources) · something changes every ~${PACE_GAP}s ·`);
  console.log(`music that changes at the turns + ambience/nat sound + ${SFX_MIN}–${SFX_MAX} motivated SFX (no upper limit), never on a key word · no abrupt ending · no follow ask (upload.follow).`);
}

// ── new ─────────────────────────────────────────────────────────────────────
// Starting a new video first moves every earlier video out of videos/ into "Produced Video/<slug>" (git-ignored, kept
// locally only), so the top level holds just the video in progress (user decision 2026-10-07). zz-* scratch projects
// (lottie inspection, kit previews) are tools, not videos: they stay put, and creating one never moves anything.
function archiveVideos(slug) {
  const old = readdirSync(VIDEOS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== slug && !d.name.startsWith("zz-") && existsSync(join(VIDEOS, d.name, "video.json")))
    .map((d) => d.name);
  const clash = old.filter((name) => existsSync(join(PRODUCED, name)));
  if (clash.length) die(`can't move ${clash.join(", ")}: already in Produced Video — merge or rename, then re-run studio new (nothing was moved)`);
  if (old.length) mkdirSync(PRODUCED, { recursive: true });
  for (const name of old) {
    const to = join(PRODUCED, name);
    try { renameSync(join(VIDEOS, name), to); } catch (e) { die(`couldn't move ${name} into Produced Video (${e.code}) — stop its preview server / close files open in it, then re-run studio new`); }
    console.log(`✓ moved ${name} → Produced Video/${name}`);
  }
}
function cmdNew() {
  const slug = positional[0];
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) die("usage: studio new <kebab-slug> --look <id> [--voice am_michael] [--title \"...\"]");
  const lookId = flag("look", HOUSE_LOOK);
  if (!lookId || !existsSync(join(STUDIO, "looks", lookId + ".json"))) die(`--look must be one of: ${looks().map((l) => l.id).join(", ")}`);
  const look = readJson(join(STUDIO, "looks", lookId + ".json"));
  const dir = join(VIDEOS, slug);
  if (existsSync(dir)) die(`${dir} already exists`);
  // --format landscape = a long-form YouTube video (16:9 1920×1080, chapters, no burned-in captions — CC via studio srt)
  const long = flag("format", "portrait") === "landscape";
  const cv = canvas({ format: long ? "landscape" : "portrait" }), dims = `${cv.W}x${cv.H}`;
  if (!slug.startsWith("zz-")) archiveVideos(slug);
  for (const d of ["assets/fonts", "assets/voice", "compositions/frames", "spec", "renders", "capture/extracted", ".hyperframes"]) mkdirSync(join(dir, d), { recursive: true });
  writeJson(join(dir, "package.json"), { name: slug, private: true, type: "module", scripts: { dev: `npx --yes ${HF} preview`, check: `npx --yes ${HF} check`, render: `npx --yes ${HF} render` } });
  writeJson(join(dir, "hyperframes.json"), { $schema: "https://hyperframes.heygen.com/schema/hyperframes.json", registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry", paths: { blocks: "compositions", components: "compositions/components", assets: "assets" }, media: { autoProxy: true }, authoringSkill: "faceless-explainer" });
  writeJson(join(dir, "meta.json"), { id: slug, name: slug, createdAt: new Date().toISOString() });
  writeFileSync(join(dir, "index.html"), `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root" data-composition-id="main" data-width="${cv.W}" data-height="${cv.H}" data-duration="1"></div></body></html>\n`);
  for (const f of new Set(look.faces.map((x) => x.file))) copyFileSync(join(STUDIO, "fonts", f), join(dir, "assets", "fonts", f));
  writeJson(join(dir, "capture", "extracted", "tokens.json"), { title: flag("title", slug), description: "", colors: [], fonts: [] });
  node(join(FE, "build-frame.mjs"), ["--preset", look.preset, "--hyperframes", dir, "--preset-dir", join(SKILLS, "hyperframes-creative", "frame-presets")], { capture: true });
  const video = {
    slug, title: flag("title", slug), look: lookId,
    tts: flag("tts", "parler") === "parler"
      ? { provider: "parler", model: HOUSE_VOICE.model, voice: HOUSE_VOICE.voice, description: HOUSE_VOICE.description, seed: HOUSE_VOICE.seed }
      : flag("tts") === "openrouter"
        ? { provider: "openrouter", model: flag("tts-model", DEFAULT_MODEL), voice: flag("voice", FISH_VOICE.voice), speed: Number(flag("speed", FISH_VOICE.speed)) }
        : { provider: "kokoro" },
    voice: "am_michael", speed: 1.0,
    ...(long ? { format: "landscape", maxLength: LONG_DEFAULT, chapters: [] } : {}),
    captions: { style: long ? "none" : CAPTION_STYLE, emphasis: [], map: {}, maxWords: 5, currency: "₹" },
    pads: { default: 0.4 }, bgm: null,
    assets: {}, // named presets: {"meera": {"type": "art", "name": "…", "recolor": "house"}} → use in specs as {"use": "meera"}
    ending: history().slice(-1)[0]?.ending === "loop" ? "punchline" : "loop",
    upload: { title: "", description: "", sources: [], follow: "", hashtags: [], pinned: "", thumbAt: 0.05 },
  };
  writeJson(join(dir, "video.json"), video);
  installCaptionSkin(dir, look);
  writeFileSync(join(dir, "STORYBOARD.md"), `---\nformat: ${dims}\nduration: ${long ? "840s" : "55s"}\nmessage: ""\narc: concept-explainer\naudience: ""\nmode: autonomous\nmusic: none\n---\n\n<!-- One "## Frame N — Title" per beat. Required bullets: voiceover, transition_in, src (compositions/frames/NN-slug.html), status, duration (estimate; audio overwrites). Visuals live in spec/NN-slug.json. See _studio/STUDIO.md -->\n`);
  writeFileSync(join(dir, "BRIEF.md"), `---\nworkflow: faceless-explainer\nflow: automation\nstoryboard: no\nmessage: ""\ndestination: ${long ? "youtube (long-form)" : "youtube-shorts"}\naspect: ${dims}\nlanguage: en\naudience: ""\nlength: ${long ? "agreed at the script gate (video.json maxLength)" : "45-60s (up to 180s only if earned: video.json maxLength)"}\nangle: concept\n---\n\n## Intent\n\n`);
  writeFileSync(join(dir, "CLAUDE.md"), `# Studio project\n\nThis video is built with the studio production line. Read \`../_studio/STUDIO.md\` first; do not load the hyperframes workflow skills unless the guide says so.\n`);
  console.log(`✓ new project ${dir}\n  look=${lookId} (${look.mood})\n  captions=${video.captions.style} tts=${video.tts.provider}${video.tts.model ? ":" + video.tts.model : ""}${video.tts.voice ? " / " + video.tts.voice : ""}\n  next: write STORYBOARD.md (+ BRIEF.md), then: studio audio ${slug}`);
}

// ── audio ───────────────────────────────────────────────────────────────────
function writeScript(P, sb) {
  const t = ttsConfig(P.video);
  const label = t.provider === "parler" ? `${t.voice || "Thoma"} / ${t.model || HOUSE_VOICE.model} (Parler, local)`
    : t.provider === "openrouter" ? (t.model || DEFAULT_MODEL) + (t.voice ? " / " + t.voice : "") + " (OpenRouter)" : P.video.voice + " (Kokoro)";
  const lines = [`# SCRIPT — ${P.video.slug}`, "", `**Voice:** ${label}`, "", "---", ""];
  sb.frames.forEach((f) => {
    const vo = (f.voiceover || "").replace(/^["“]|["”]$/g, "").trim();
    if (!vo) return;
    lines.push(`## Line ${f.number} — ${f.title} (Frame ${f.number})`, "", "    " + vo, "");
  });
  // long-form keeps the hand-written SCRIPT.md (the approved narration + picture notes) — the line list goes to renders/
  writeFileSync(isLong(P.video) ? join(P.dir, "renders", "SCRIPT-lines.md") : join(P.dir, "SCRIPT.md"), lines.join("\n"));
}
function probeDur(p) {
  const r = run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], { capture: true });
  return +parseFloat(r.stdout).toFixed(3);
}
async function cmdAudio() {
  const P = project(positional[0] && slugDir(positional[0]));
  let sb = storyboard(P.dir);
  if (!sb.frames.length) die("STORYBOARD.md has no frames");
  writeScript(P, sb);
  const tts = ttsConfig(P.video);
  let meta;
  mkdirSync(join(P.dir, "assets", "voice", "raw"), { recursive: true });
  // every frame voiced from a file (the ElevenLabs flow: studio split wires voice_file) → no TTS at all, whatever video.json says
  const allFiles = sb.frames.every((f) => f.extra?.voice_file || !(f.voiceover || "").trim());
  if (tts.provider === "openrouter" || tts.provider === "parler" || allFiles) {
    if (tts.provider === "openrouter" && !allFiles) loadEnv();
    console.log(allFiles ? "· voice: recorded takes (voice_file on every frame) — no TTS" : `· tts: ${tts.provider} · ${tts.model || (tts.provider === "parler" ? HOUSE_VOICE.model : process.env.OPENROUTER_TTS_MODEL || DEFAULT_MODEL)}${tts.voice ? " · voice " + tts.voice : ""}`);
    // frames with `- voice_file: <path>` use real audio (an interview clip…) instead of TTS — still transcribed for captions/cues
    const real = sb.frames.filter((f) => f.extra?.voice_file), fileVoices = real.map(voiceFromFile.bind(null, P));
    alignFileVoices(P, real, fileVoices);
    const rest = sb.frames.filter((f) => !f.extra?.voice_file && (f.voiceover || "").trim());
    const r = rest.length ? await voiceProject(P.dir, rest, tts) : { voices: [], model: null };
    for (const v of r.voices) copyFileSync(v.raw, join(P.dir, v.path));
    const all = [...fileVoices, ...r.voices].sort((a, b) => a.frame - b.frame);
    meta = { bgm: null, voices: all.map(({ raw, ...v }) => v), sfx: [], tts: { provider: tts.provider, model: r.model, voice: tts.voice || null } };
  } else {
    const args = ["--script", join(P.dir, "SCRIPT.md"), "--storyboard", join(P.dir, "STORYBOARD.md"), "--hyperframes", P.dir, "--out", join(P.dir, "audio_meta.json"), "--voice", P.video.voice];
    if (P.video.speed && P.video.speed !== 1) args.push("--speed", String(P.video.speed));
    node(join(FE, "audio.mjs"), args, { env: { HF_MEDIA_ENGINE: ENGINE } });
    meta = readJson(join(P.dir, "audio_meta.json"));
    for (const v of meta.voices) copyFileSync(join(P.dir, v.path), join(P.dir, "assets", "voice", "raw", basename(v.path)));
  }
  const lastFrame = Math.max(...meta.voices.map((v) => v.frame));
  const lastLine = (sb.frames.find((f) => f.number === lastFrame)?.voiceover || "").replace(/^["“]|["”]$/g, "").trim();
  if (lastLine && !ENDS_SENTENCE.test(lastLine)) die(`the last line ends mid-sentence ("…${lastLine.slice(-40)}") — finish the sentence; a video never cuts off on an unfinished thought (STUDIO.md → Story & script rules → ending)`);
  for (const v of meta.voices) {
    const abs = join(P.dir, v.path), raw = join(P.dir, "assets", "voice", "raw", basename(v.path));
    const pads = P.video.pads || {};
    let pad = pads[pad2(v.frame)] ?? (v.frame === lastFrame ? pads.last ?? ENDINGS[P.video.ending]?.pad ?? 1.6 : pads.default ?? 0.4);
    if (v.frame === lastFrame && pad < END_HOLD) { console.log(`⚠ last-frame hold ${pad}s raised to ${END_HOLD}s — the picture settles after the final word (no abrupt endings)`); pad = END_HOLD; }
    run("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-af", `apad=pad_dur=${pad}`, abs]);
    v.duration_s = probeDur(abs);
  }
  const lastVo = sb.frames.find((f) => f.number === lastFrame)?.voiceover || "";
  if (FOLLOW_ASK.test(lastVo)) console.log(`⚠ the last line asks viewers to follow/subscribe — end on the loop or punchline instead; the ask goes in video.json → upload.follow`);
  if (!ENDINGS[P.video.ending]) console.log(`⚠ video.json → ending is not set (${Object.keys(ENDINGS).join(" | ")}) — the last frame holds 1.6 s`);
  if (P.video.bgm?.file) {
    const src = libPath(P.dir, P.video.bgm.file);
    mkdirSync(join(P.dir, "assets", "music"), { recursive: true });
    copyFileSync(src, join(P.dir, "assets", "music", basename(src)));
    meta.bgm = { path: "assets/music/" + basename(src), volume: P.video.bgm.volume ?? 0.1 };
  }
  writeJson(join(P.dir, "audio_meta.json"), meta);
  writeJson(join(P.dir, "audio_words.raw.json"), meta.voices.map((v) => ({ frame: v.frame, words: v.words })));
  node(join(FE, "audio.mjs"), ["sync-durations", "--audio-meta", join(P.dir, "audio_meta.json"), "--storyboard", join(P.dir, "STORYBOARD.md")], { capture: true });
  const total = meta.voices.reduce((a, v) => a + v.duration_s, 0);
  const words = meta.voices.reduce((a, v) => a + (v.words?.length || 0), 0);
  const speech = meta.voices.reduce((a, v) => a + (v.words?.length ? v.words[v.words.length - 1].end - v.words[0].start : 0), 0);
  console.log(`✓ audio: ${meta.voices.length} lines · ${total.toFixed(1)}s total · ${words} words · ${(words / speech * 60).toFixed(0)} wpm speech / ${(words / total * 60).toFixed(0)} wpm effective`);
  printWords(P);
}
function voiceFromFile(P, f) {
  const nn = pad2(f.number), rawDir = join(P.dir, "assets", "voice", "raw");
  const src = resolve(P.dir, f.extra.voice_file);
  if (!existsSync(src)) die(`frame ${nn}: voice_file not found: ${src}`);
  const raw = join(rawDir, nn + ".wav"), fp = join(rawDir, nn + ".json");
  const hash = createHash("sha1").update(readFileSync(src)).digest("hex");
  let words;
  if (existsSync(raw) && existsSync(fp) && readJson(fp).hash === hash) words = readJson(fp).words;
  else {
    run("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", "44100", raw]);
    words = transcribeWords(raw);
    writeJson(fp, { hash, provider: "file", file: f.extra.voice_file, text: lineText(f), words });
  }
  console.log(`  voice ${nn}: real audio ${basename(src)} · ${words.length} words`);
  return { frame: f.number, path: `assets/voice/${nn}.wav`, raw, words };
}
const lineText = (f) => (f.voiceover || "").replace(/^["“]|["”]$/g, "").trim();
// Exact word times for real-audio frames (added 2026-10-08): force-align each clip's known line (WhisperX) and re-time
// Whisper's words with it — phantom words dropped, mis-heard words take the script's spelling, digits stay digits.
// One aligner run for every clip that isn't aligned yet; results cached in assets/voice/raw/NN.json (aligned: true).
function alignFileVoices(P, frames, voices) {
  if (!alignAvailable() || has("no-align")) return;
  const all = voices.map((v, i) => ({ v, f: frames[i], fp: join(P.dir, "assets", "voice", "raw", pad2(v.frame) + ".json") })).filter((x) => lineText(x.f));
  // the aligner's script-word times are cached (alignedWords) — re-timing can be redone without re-running it
  const todo = all.filter((x) => { const j = readJson(x.fp); return !j.alignedWords || j.alignedText !== lineText(x.f); });
  if (todo.length) {
    console.log(`  aligning ${todo.length} line(s) to the script (WhisperX)…`);
    const res = forceAlign(todo.map((x) => ({ wav: x.v.raw, segments: [{ text: lineText(x.f), start: 0, end: probeDur(x.v.raw) }] })));
    todo.forEach((x, i) => { const j = readJson(x.fp); writeJson(x.fp, { ...j, whisper: j.whisper || x.v.words, alignedWords: res[i][0], alignedText: lineText(x.f) }); });
  }
  for (const x of all) {
    const j = readJson(x.fp), before = j.whisper || x.v.words;
    const words = retimeWords(before, j.alignedWords);
    const gone = before.filter((w) => !words.some((n) => n.text === w.text)).map((w) => w.text);
    const fixed = words.filter((w) => !before.some((o) => o.text === w.text)).map((w) => w.text);
    writeJson(x.fp, { ...j, whisper: before, words, aligned: true });
    x.v.words = words;
    if (gone.length || fixed.length) console.log(`    ${pad2(x.v.frame)}: ${gone.length ? "heard " + gone.join(" ") : ""}${fixed.length ? " → script " + fixed.join(" ") : " (dropped)"}`);
  }
}
function printWords(P) {
  const raw = existsSync(join(P.dir, "audio_words.raw.json")) ? readJson(join(P.dir, "audio_words.raw.json")) : [];
  const sb = storyboard(P.dir);
  for (const f of sb.frames) {
    const w = raw.find((r) => r.frame === f.number);
    console.log(`${frameId(f)} (${f.duration}): ${w ? w.words.map((x) => x.text).join(" ") : "(silent)"}`);
  }
}

// ── build ───────────────────────────────────────────────────────────────────
// caption band as fractions of 1080×1920 (x 70–1010, y 1270–1450) for `hyperframes check --caption-zone`
const CAPTION_ZONE = "x0=0.065;y0=0.661;x1=0.935;y1=0.755;severity=warning";
function summarise(out) {
  return out.split(/\r?\n/).filter((l) => /✗|error\(s\)|warning\(s\)|Check (passed|failed)|errors?, \d+ warnings?/.test(l) && !/Try rgb/.test(l)).join("\n");
}
// Sound: one premixed soundtrack (music cues + ambience + nat sound + SFX by role, shared room) + the voice chain.
// The engine lives in lib/sound.mjs (STUDIO.md → Sound); audio_meta gets bgm = the premix, sfx = [] (no lanes).
function mixAudio(P, sb, built, meta) {
  const r = mixSoundtrack(P, sb, built, meta), s = meta.sound;
  if (!s || !meta.bgm) return console.log("· audio mix: nothing to premix (no music, ambience, nat sound or SFX) — voice only");
  console.log(`✓ audio mix: voice ${s.voiceLufs.toFixed(1)} LUFS${r.voiced ? ` (chain on ${r.voiced} line(s))` : ""} · ${s.music.length} music cue(s) · ${s.ambience.length} ambience · ${s.nat.length} nat · ${s.sfx.length} sfx → assets/mix/soundtrack.mp3`);
  for (const w of r.warn) console.log("⚠ " + w);
}
// Credits for every library asset used (from the LICENSES.json next to it). Unrecorded = don't publish.
function audioCredits(P, meta) {
  const used = soundSources(meta);
  const out = [], missing = [];
  for (const rel of [...new Set(used)]) {
    const abs = libPath(P.dir, rel).split("\\").join("/");
    const m = abs.match(/^(.*)\/assets\/audio\/(music|sfx|ambience)\/[^/]+$/);
    const ledger = m && join(m[1], "assets", "audio", "LICENSES.json");
    const entry = ledger && existsSync(ledger) ? readJson(ledger).find((e) => abs.endsWith("/" + e.file)) : null;
    if (!entry) { missing.push(rel); continue; }
    out.push(entry);
  }
  return { entries: out, missing };
}
function cmdBuild() {
  const P = project(positional[0] && slugDir(positional[0]));
  // long-form: chapter ends snap to whole frames so chapter renders stitch exactly (lib/chapters.mjs)
  if (isLong(P.video)) { const ch = quantizeChapters(P, storyboard(P.dir)); if (ch.length) console.log(`✓ chapter ends snapped to the frame grid: ${ch.join(" · ")}`); }
  const sb = storyboard(P.dir);
  const rawPath = join(P.dir, "audio_words.raw.json");
  const metaPath = join(P.dir, "audio_meta.json");
  const raw = existsSync(rawPath) ? readJson(rawPath) : [];
  const meta = existsSync(metaPath) ? readJson(metaPath) : null;
  mkdirSync(join(P.dir, "assets", "fonts"), { recursive: true });
  for (const f of new Set(P.look.faces.map((x) => x.file))) if (!existsSync(join(P.dir, "assets", "fonts", f))) copyFileSync(join(STUDIO, "fonts", f), join(P.dir, "assets", "fonts", f));
  const { built, errors } = buildFrames(P, sb, { voices: raw });
  if (errors.length) die("frame build errors:\n  " + errors.join("\n  "));
  // statuses → animated
  let sbText = readFileSync(join(P.dir, "STORYBOARD.md"), "utf8").replace(/^- status: .*$/gm, "- status: animated");
  writeFileSync(join(P.dir, "STORYBOARD.md"), sbText);
  console.log(`✓ frames: ${built.length} built from spec/`);
  if (meta) {
    for (const v of meta.voices) {
      const r = raw.find((x) => x.frame === v.frame);
      const fr = sb.frames.find((f) => f.number === v.frame);
      if (r) v.words = normaliseCaptionWords(r.words, P.video.captions, (fr?.voiceover || "").replace(/^["“]|["”]$/g, ""));
    }
    writeJson(metaPath, meta);
    if (P.video.captions?.style !== "none") {
      const [cs, csNote] = captionStyle(P.video.captions?.style);
      if (csNote) console.log("⚠ " + csNote);
      installCaptionSkin(P.dir, P.look);
      node(join(FE, "captions.mjs"), ["build", "--storyboard", join(P.dir, "STORYBOARD.md"), "--audio-meta", metaPath, "--hyperframes", P.dir, "--out", join(P.dir, "caption_groups.json")], { capture: true });
      // per-frame caption overrides: spec → "captions": {"y": px, "tone": "dark"}
      const capFrames = {}; built.forEach((b, i) => { const c = b.spec.captions; if (c && (c.y != null || c.tone)) capFrames[sb.frames[i].number] = { y: c.y, tone: c.tone }; });
      const g = postProcessCaptions(P.dir, P.look, P.video, capFrames);
      console.log(`✓ captions: ${g.length} phrase chunks (${cs}: plain text over the picture)`);
    }
    mixAudio(P, sb, built, meta);
    writeJson(metaPath, meta);
  }
  node(join(FE, "assemble-index.mjs"), ["--storyboard", join(P.dir, "STORYBOARD.md"), "--hyperframes", P.dir], { capture: true });
  const ti = node(join(FE, "transitions.mjs"), ["inject", "--storyboard", join(P.dir, "STORYBOARD.md"), "--hyperframes", P.dir], { capture: true });
  node(join(FE, "transitions.mjs"), ["verify", "--storyboard", join(P.dir, "STORYBOARD.md"), "--index", join(P.dir, "index.html")], { capture: true });
  console.log("✓ assembled: " + (ti.stdout.split("\n")[0] || "").replace(/^✓\s*/, ""));
  houseAudit(P, sb, built);
  if (has("no-check")) return;
  const lint = npx(["lint"], { cwd: P.dir, capture: true, allowFail: true });
  console.log("lint: " + (summarise(lint.stdout + lint.stderr) || "ok"));
  // captions overlay the full-canvas picture (lower third, y 1270–1450): readable frame text must stay out of that band.
  // Long-form has no burned-in captions (CC via studio srt), so there is no caption band to keep clear.
  const burned = P.video.captions?.style !== "none";
  const samples = String(Math.min(120, Math.max(24, Math.round(sb.frames.length * 1.2))));
  const chk = npx(["check", "--samples", samples, ...(burned ? ["--caption-zone", CAPTION_ZONE] : []), ...(has("timeout") ? ["--timeout", flag("timeout")] : [])], { cwd: P.dir, capture: true, allowFail: true });
  const s = summarise(chk.stdout + chk.stderr);
  console.log("check:\n" + s);
  const hits = [...new Set((chk.stdout + chk.stderr).split(/\r?\n/).filter((l) => /caption_zone_collision/.test(l)).map((l) => { const m = l.match(/(t=[\d.]+s) caption_zone_collision #el-([\w-]+)\S*.*?("[^"]*")/); return m ? `${m[2]} ${m[1]}: ${m[3]}` : l.trim(); }))];
  if (hits.length) console.log(`⚠ text under the captions (keep readable frame text out of y 1270–1450, or move that frame's band with spec → "captions": {"y": …}):\n  ` + hits.join("\n  "));
  if (/Check failed/.test(s)) { console.log("(full report: npx " + HF + " check, in the project dir)"); process.exitCode = 2; }
}

// peep/avatar figures used in a build: { all: count, house: [house-character keys] }
function usedFigures(built) {
  const hc = houseCast(), house = new Set(); let all = 0;
  (function walk(o) {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    if (o.type === "peep" || o.type === "avatar") { all++; if (hc[o.figure]) house.add(o.figure); }
    Object.values(o).forEach(walk);
  })(built.map((b) => [b.spec.blocks || [], b.spec.world || {}]));
  return { all, house: [...house] };
}
// ── house audit (2026-10-03) — replaces the old look/variety rotation checks ─────────────────────
// Only checks that match STYLE.md's house rules: pacing (something changes every ~2 s), sound (a bed + a few
// trimmed SFX on motion, never on a key word), the ending, and no slide chrome / follow CTA.
const PACE_GAP = 2.5, SFX_MIN = 3, SFX_MAX = 8, SFX_SPACING = 1.5, SFX_MAX_LEN = 1.2;
function cueTimes(spec, dur) {
  const out = [];
  (function walk(o, k) {
    if (typeof o === "number") { if ((k === "at" || /At$/.test(k)) && o >= 0 && o <= dur) out.push(o); return; }
    if (!o || typeof o !== "object") return;
    for (const key in o) { if (key === "sfx") continue; const x = o[key]; if (Array.isArray(x)) x.forEach((y) => walk(y, key)); else walk(x, key); }
  })(spec, "");
  return out;
}
// pacing: every frame start and every cued reveal is a "change"; flag stretches longer than PACE_GAP
function pacingAudit(sb, built) {
  const ft = frameTimes(sb), ev = [];
  built.forEach((b, i) => { ev.push(ft[i].start); for (const t of cueTimes(b.spec, ft[i].dur)) ev.push(ft[i].start + t); });
  const end = ft.reduce((a, f) => a + f.dur, 0);
  ev.sort((a, b) => a - b);
  const gaps = [];
  for (let i = 0; i < ev.length; i++) {
    const a = ev[i], b = i + 1 < ev.length ? ev[i + 1] : end, limit = i + 1 < ev.length ? PACE_GAP : PACE_GAP + END_HOLD;
    if (b - a > limit) { const fi = ft.findIndex((f) => a >= f.start - 1e-6 && a < f.start + f.dur); gaps.push(`${(b - a).toFixed(1)}s still from ${a.toFixed(1)}s (${ft[fi]?.id || "?"}) — add a reveal, camera beat or cut on a word`); }
  }
  return gaps;
}
// sound: bed + SFX count, spacing, length, and never on top of a key word
function soundAudit(P, sb, meta) {
  const warn = [], ft = frameTimes(sb), byNum = new Map(sb.frames.map((f, i) => [f.number, ft[i]]));
  if (!meta) return warn;
  const S = meta.sound;
  if (S ? !S.music.length : !meta.bgm) warn.push("no music — every video needs it (video.json → music cues, or bgm; STYLE.md → Sound)");
  if (S) {
    // the old Openverse/Freesound kit is what sounded pasted on — the Sonniss picks replace it
    const old = S.sfx.filter((x) => /\.mp3$/i.test(x.source || "") && /assets\/audio\/sfx\//.test(x.source || ""));
    if (old.length) warn.push(`${old.length} SFX from the old Freesound kit (${[...new Set(old.map((x) => basename(x.source)))].join(", ")}) — pick replacements with studio sound search`);
    if (!S.ambience.length && !S.nat.length && isLong(P.video)) warn.push("no ambience or nat sound anywhere — every scene needs a place to sound like (spec → \"ambience\", video → \"nat\")");
    const silentClips = (S.clipsWithoutSound || []);
    if (silentClips.length) warn.push(`footage without its own sound: ${silentClips.join(", ")} — add "nat": true to the video (or an ambience)`);
  }
  const sfx = (S ? S.sfx : meta.sfx || []).map((x) => ({ ...x, t: (byNum.get(x.frame)?.start || 0) + x.offset_s })).sort((a, b) => a.t - b.t);
  // long-form: the minimum is per chapter (each chapter is a Short-sized act); there is no maximum (user 2026-10-13)
  const nCh = isLong(P.video) ? new Set(chapterOf(sb)).size : 1, lo = SFX_MIN * nCh, hi = SFX_MAX * nCh;
  if (sfx.length < lo) warn.push(`${sfx.length} sound effect(s) — put ${lo}–${hi} short SFX on the big motion moments (spec → "sfx")${nCh > 1 ? ` (${SFX_MIN}–${SFX_MAX} per chapter)` : ""}`);
  // no upper limit (user decision 2026-10-13): every SFX the picture motivates goes in
  for (let i = 1; i < sfx.length; i++) if (sfx[i].t - sfx[i - 1].t < SFX_SPACING) warn.push(`SFX at ${sfx[i - 1].t.toFixed(1)}s and ${sfx[i].t.toFixed(1)}s are < ${SFX_SPACING}s apart — one SFX per 1.5 s`);
  for (const x of sfx) if (x.duration_s > SFX_MAX_LEN + 0.05 && !/riser/i.test(x.file)) warn.push(`SFX ${basename(x.file)} plays ${x.duration_s.toFixed(1)}s — trim to ≤ ${SFX_MAX_LEN}s (spec sfx "dur")`);
  const em = (P.video.captions?.emphasis || []).map((w) => w.toLowerCase());
  for (const x of sfx) {
    const v = (meta.voices || []).find((y) => y.frame === x.frame);
    const w = (v?.words || []).find((y) => x.offset_s >= y.start - 0.05 && x.offset_s <= y.end);
    if (!w) continue;
    const t = String(w.text).toLowerCase().replace(/[^\w₹%.,]/g, "");
    if (em.includes(t.replace(/[.,]+$/, "")) || /\d|₹|%/.test(t)) warn.push(`SFX ${basename(x.file)} lands on the key word "${w.text}" (${x.t.toFixed(1)}s) — move it just before or after the word`);
  }
  return warn;
}
// Review 2026-10-03: cued label reveals kept "pacing" green while whole frames sat on one composition for 7–10 s.
// A *shot* is a frame start or a KW.cut(tl, el, b.<cue>) in the frame's .js — measured separately from reveals.
const SHOT_MEDIAN = 3.5, HOOK_CUT = 4;
function shotStarts(P, sb, built) {
  const ft = frameTimes(sb), out = [];
  built.forEach((b, i) => {
    out.push(ft[i].start);
    const js = join(P.dir, "spec", b.id + ".js");
    if (!existsSync(js)) return;
    for (const m of readFileSync(js, "utf8").matchAll(/KW\.cut\(\s*tl\s*,\s*[^,]+,\s*b\.(\w+)/g)) {
      const t = b.spec.world?.[m[1]] ?? b.spec[m[1]];
      if (typeof t === "number" && t > 0.05 && t < ft[i].dur) out.push(ft[i].start + t);
    }
  });
  return [...new Set(out.map((t) => +t.toFixed(2)))].sort((a, b) => a - b);
}
function craftAudit(P, sb, built, meta) {
  const warn = [], ft = frameTimes(sb), total = ft.reduce((a, f) => a + f.dur, 0);
  // house rule 6 (user 2026-10-04): no camera zoom — every frame should be camera "still"
  const moving = built.filter((b) => b.spec.camera && b.spec.camera !== "still").map((b) => b.id || b.spec.id || "?");
  if (moving.length) warn.push(`${moving.length} frame(s) use a camera move (${moving.join(", ")}) — house rule 6: no zoom/push/pull; set "camera": "still"`);
  const shots = shotStarts(P, sb, built), lens = shots.map((t, i) => (shots[i + 1] ?? total) - t), sorted = [...lens].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0, longest = Math.max(...lens), li = lens.indexOf(longest);
  const shotLine = `shots: ${shots.length} · median ${median.toFixed(1)}s · longest ${longest.toFixed(1)}s at ${shots[li]?.toFixed(1)}s`;
  if (median > SHOT_MEDIAN) warn.push(`median shot ${median.toFixed(1)}s (target 1.5–3s) — cut inside long frames with KW.shot/KW.cut on a word, or split the frame`);
  const firstCut = shots[1] ?? total;
  if (firstCut > HOOK_CUT) warn.push(`the hook holds one shot for ${firstCut.toFixed(1)}s — land the contradiction by ~2s and cut by ${HOOK_CUT}s`);
  // length: 45–60 s by default; up to 3 min only when agreed (video.json → maxLength) and the story earns it
  const L = lengthTarget(P.video);
  if (L.longForm) { if (total > L.max + 0.05) warn.push(`${(total / 60).toFixed(1)} min long — over the agreed ${(L.max / 60).toFixed(1)} min (video.json → maxLength); tighten the script`); }
  else if (total > SHORT_CAP + 0.05) warn.push(`${total.toFixed(1)}s long — over the 3-minute Shorts limit; YouTube won't treat it as a Short`);
  else if (total > L.max + 0.05) warn.push(`${total.toFixed(1)}s long — target is ${L.long ? "≤ " + L.max : "45–" + L.max}s${L.long ? " (video.json → maxLength)" : "; longer only if the story earns it — agree it with the user and set video.json → maxLength (STYLE.md → Length)"}`);
  const nums = new Set();
  for (const v of meta?.voices || []) for (const w of v.words || []) { const t = String(w.text).replace(/[^\d.%]/g, "").replace(/\.$/, ""); if (/\d/.test(t)) nums.add(t); }
  if (nums.size > L.numbers) warn.push(`${nums.size} numbers spoken (${[...nums].join(", ")}) — STYLE allows ${L.numbers} (3 per minute of target length), each with context; cut the rest from the voice (they can stay on screen or in the description)`);
  return { warn, shotLine };
}
function houseAudit(P, sb, built) {
  const warn = [];
  // zz-* projects are internal scratch builds (lottie inspection, kit previews) — never published, so no bed required
  if (!hasMusic(P.video) && !basename(P.dir).startsWith("zz-")) { console.log("✗ no music: video.json → music (or bgm) is empty — every video needs it (STYLE.md → Sound)"); process.exitCode = 2; }
  const walk = (bs, acc) => { for (const b of bs || []) { acc.push(b.type); if (b.children) walk(b.children, acc); } return acc; };
  if (built.some((b) => b.spec.chrome && typeof b.spec.chrome === "object")) warn.push("slide chrome (section label row) used — remove it");
  const pace = pacingAudit(sb, built);
  const meta = existsSync(join(P.dir, "audio_meta.json")) ? readJson(join(P.dir, "audio_meta.json")) : null;
  const sound = soundAudit(P, sb, meta);
  const lastB = built[built.length - 1], lastF = sb.frames[sb.frames.length - 1];
  const lastLine = (lastF?.voiceover || "").replace(/^["“]|["”]$/g, "").trim();
  const endErr = [];
  if (lastLine && !ENDS_SENTENCE.test(lastLine)) endErr.push(`the last line ends mid-sentence ("…${lastLine.slice(-40)}") — finish the sentence and re-voice it`);
  const lv = (existsSync(join(P.dir, "audio_meta.json")) ? readJson(join(P.dir, "audio_meta.json")).voices : []).find((v) => v.frame === lastF?.number);
  const lastWord = lv?.words?.length ? lv.words[lv.words.length - 1].end : null, lastDur = lastF?.durationSeconds || parseFloat(lastF?.duration) || 0;
  if (lastWord != null && lastDur - lastWord < END_HOLD - 0.05) endErr.push(`the last frame ends ${(lastDur - lastWord).toFixed(2)}s after the final word (needs ≥ ${END_HOLD}s so the picture settles) — run studio audio again (pads.last can't go below ${END_HOLD})`);
  // the picture should have landed before the hold: nothing new starting in the last 0.6 s
  let lastCue = 0; (function walkC(o, k) { if (typeof o === "number") { if (k === "at" || /At$/.test(k)) lastCue = Math.max(lastCue, o); return; } if (!o || typeof o !== "object") return; for (const key in o) { const x = o[key]; if (Array.isArray(x)) x.forEach((y) => walkC(y, key)); else walkC(x, key); } })(lastB?.spec || {}, "");
  if (lastDur && lastCue > lastDur - 0.6) warn.push(`the last frame still starts motion at ${lastCue.toFixed(2)}s of ${lastDur.toFixed(2)}s — let the picture settle for the final beat`);
  if (endErr.length) { console.log("✗ abrupt ending:\n  " + endErr.join("\n  ")); process.exitCode = 2; }
  if (!ENDINGS[P.video.ending]) warn.push(`video.json → ending not set (${Object.keys(ENDINGS).join("|")})`);
  if (walk(lastB?.spec.blocks, []).includes("cta") || FOLLOW_ASK.test(lastF?.voiceover || "")) warn.push("the last frame is a follow/CTA — end on the loop or punchline; the ask goes in upload.follow");
  if (P.video.ending === "loop") console.log(`ending: loop — run studio snap ${P.video.slug} --loop and check the last frame hands back to frame 1`);
  console.log(pace.length ? "pacing: ⚠ " + pace.length + " still stretch(es) > " + PACE_GAP + "s:\n  " + pace.join("\n  ") : "pacing: ✓ something changes at least every " + PACE_GAP + "s");
  const craft = craftAudit(P, sb, built, meta);
  console.log(craft.warn.length ? `craft: ${craft.shotLine}\n  ⚠ ` + craft.warn.join("\n  ⚠ ") : `craft: ✓ ${craft.shotLine}`);
  const sfxN = (meta?.sound ? meta.sound.sfx : meta?.sfx || []).length;
  console.log(!meta ? "sound: – no audio yet (studio audio)" : sound.length ? "sound: ⚠ " + sound.join("\n  ⚠ ") : "sound: ✓ music + " + sfxN + " SFX, spaced and off the key words");
  if (warn.length) console.log("house: ⚠ " + warn.join(" · "));
}

// ── peeps ── list Open Peeps part names for peep blocks / video.json → cast: studio peeps [filter]
function cmdPeeps() {
  const tool = join(STUDIO, "tools", "peeps");
  if (!existsSync(join(tool, "node_modules", "react-peeps"))) die("figure renderer not installed — run: npm install (in _studio/tools/peeps)");
  run(process.execPath, [join(tool, "render.cjs"), "--list", positional[0] || ""]);
}

// ── icons ── search the vendored Tabler outline set by name + tags: studio icons invoice [cash ...]
function cmdIcons() {
  const q = positional.map((w) => w.toLowerCase());
  if (!q.length) die("usage: studio icons <word> [word...]");
  const idx = readJson(join(STUDIO, "vendor", "tabler", "index.json"));
  const hits = Object.entries(idx).map(([name, tags]) => {
    let sc = 0;
    for (const w of q) { if (name === w) sc += 10; else if (name.split("-").includes(w)) sc += 5; else if (name.includes(w)) sc += 3; if ((" " + tags + " ").includes(" " + w + " ")) sc += 2; }
    return { name, sc, tags };
  }).filter((h) => h.sc > 0).sort((a, b) => b.sc - a.sc || a.name.length - b.name.length).slice(0, 24);
  console.log(hits.length ? hits.map((h) => `${h.name.padEnd(28)} ${h.tags.slice(0, 70)}`).join("\n") : "no matches");
}

// ── snap / render ───────────────────────────────────────────────────────────
function defaultTimes(sb) {
  const ft = frameTimes(sb);
  return [0.05, ...ft.map((f) => +(f.start + f.dur * 0.9).toFixed(2))];
}
function cmdSnap() {
  const P = project(positional[0] && slugDir(positional[0]));
  const sb = storyboard(P.dir), end = frameTimes(sb).reduce((a, f) => a + f.dur, 0);
  // --loop: the seam a looping Short replays through — frame 1's first moment next to the very end
  // --chapter N (long-form): the start + 90% point of every frame in that chapter
  let chTimes = null;
  if (has("chapter")) {
    const ch = chapterOf(sb), want = +flag("chapter"), ft = frameTimes(sb);
    chTimes = ft.filter((_, i) => ch[i] === want).flatMap((f) => [+(f.start + 0.3).toFixed(2), +(f.start + f.dur * 0.9).toFixed(2)]).join(",");
    if (!chTimes) die(`no frames in chapter ${want} (STORYBOARD.md → "- chapter: N" bullets)`);
  }
  const times = has("loop") ? `0.05,${(end - 0.1).toFixed(2)}` : flag("at") || chTimes || defaultTimes(sb).join(",");
  if (has("chapter") && isLong(P.video)) {
    // a long-form timeline is too heavy to load for a snapshot on this laptop (navigation timeout) — snapshot the chapter's
    // own timeline (index-chNN.html, the one chapter renders use) standing in for index.html, times rebased to the chapter
    const span = chapterSpans(sb).find((x) => x.ch === +flag("chapter")), idx = join(P.dir, "index.html"), keep = join(P.dir, "index.full.html");
    const local = times.split(",").map((t) => (+t - span.start).toFixed(2)).join(",");
    copyFileSync(idx, keep);
    writeFileSync(idx, chapterIndex(P, span).html);
    const r = npx(["snapshot", "--at", local], { cwd: P.dir, capture: true, allowFail: true });
    copyFileSync(keep, idx); rmSync(keep, { force: true });
    if (r.status !== 0) die("snapshot failed: " + (r.stdout + r.stderr).slice(-2000));
  } else npx(["snapshot", "--at", times], { cwd: P.dir, capture: true });
  const sheets = readdirSync(join(P.dir, "snapshots")).filter((f) => f.startsWith("contact-sheet"));
  if (has("loop")) console.log("loop seam: the end should hand straight back to frame 1 (same scene, prop or number) so the replay is seamless");
  console.log(`✓ snapshots at ${times}\n  ${sheets.map((s) => join(P.dir, "snapshots", s)).join("\n  ")}`);
}
function loudnorm(input, output) {
  const total = probeDur(input), fadeAt = Math.max(0, total - 0.8).toFixed(2);
  const r = run("ffmpeg", ["-hide_banner", "-nostats", "-i", input, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], { capture: true });
  const j = JSON.parse((r.stderr || "").slice(r.stderr.lastIndexOf("{"), r.stderr.lastIndexOf("}") + 1));
  const af = `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,aresample=48000,afade=t=out:st=${fadeAt}:d=0.8`;
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", input, "-c:v", "copy", "-af", af, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", output]);
  const m = run("ffmpeg", ["-hide_banner", "-nostats", "-i", output, "-af", "ebur128=peak=true", "-f", "null", "-"], { capture: true });
  const I = (m.stderr.match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop();
  return { before: +j.input_i, after: I ? +I.match(/-?[\d.]+/)[0] : null };
}
// What a video is made of, for studio variety: world fns (the scene ideas) and library assets (art/lottie/humaaan names,
// resolved through video.json → assets presets). Blocks alone said "custom" for every world-built video.
function designRecord(P, specs) {
  const presets = P.video.assets || {}, assets = new Set();
  const base = (o, seen = 0) => (o?.use && presets[o.use] && seen < 5 ? base({ ...presets[o.use], ...o, use: presets[o.use].use }, seen + 1) : o);
  (function walk(o) {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    const b = base(o);
    if (["art", "humaaan"].includes(b.type) && b.name) assets.add(b.name);
    if (b.type === "lottie" && b.src) assets.add(b.src);
    if (b.src && b.as) assets.add(b.src);
    Object.values(o).forEach(walk);
  })(specs);
  return { worlds: specs.map((s) => s.world?.fn).filter(Boolean), assets: [...assets] };
}
function voiceRecord(P) {
  if (existsSync(join(P.dir, "assets", "voice", "eleven", "full.mp3"))) return { provider: "elevenlabs", source: P.video.voiceover_source || "ElevenLabs, user-supplied" };
  return P.video.tts || { provider: "kokoro", voice: P.video.voice };
}
function cmdRender() {
  const P = project(positional[0] && slugDir(positional[0]));
  const sb = storyboard(P.dir);
  const raw = join(P.dir, "renders", "raw.mp4"), final = join(P.dir, "renders", P.video.slug + ".mp4");
  const rel = P.dir.slice(VIDEOS.length + 1).replace(/\\/g, "/");
  // cloud render: HyperFrames distributed chunks on Modal (_studio/tools/modal/render.py; free monthly credit)
  const modal = (entry, out) => run("modal", ["run", join(STUDIO, "tools", "modal", "render.py"), "--slug", rel, "--chunks", flag("chunks", "32"),
    "--entry", entry, "--out", out.slice(P.dir.length + 1).replace(/\\/g, "/")], { cwd: VIDEOS, env: { PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" } });
  if (isLong(P.video) && !has("whole")) {
    // long-form: chapter by chapter (unchanged chapters reused), stitched, one continuous soundtrack (lib/chapters.mjs)
    const only = (flag("chapters", "") || "").split(",").filter(Boolean).map(Number);
    renderChapters(P, sb, raw, has("modal") ? modal : (entry, out) => npx(["render", "--composition", entry, "--quality", "high", "--output", out], { cwd: P.dir, capture: true }),
      { only, force: has("force") });
  } else if (has("modal")) modal("index.html", raw);
  else npx(["render", "--quality", "high", "--output", raw], { cwd: P.dir, capture: true });
  const loud = loudnorm(raw, final);
  // contact sheet from the final MP4
  const times = isLong(P.video) ? longSheetTimes(sb) : defaultTimes(sb).slice(0, 12);
  const tmp = join(P.dir, "renders", "_cs"); mkdirSync(tmp, { recursive: true });
  times.forEach((t, i) => run("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(t), "-i", final, "-frames:v", "1", "-vf", isLong(P.video) ? "scale=384:-1" : "scale=270:-1", join(tmp, pad2(i) + ".png")]));
  const cols = isLong(P.video) ? 6 : 4, n = times.length, rows = Math.ceil(n / cols);
  if (isLong(P.video)) { const srt = writeSrt(P, sb); console.log(`✓ subtitles: ${srt.file} (${srt.cues} cues) — upload as YouTube CC (English)`); }
  run("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "1", "-i", join(tmp, "%02d.png"), "-vf", `tile=${cols}x${rows}:padding=6:color=black`, "-frames:v", "1", join(P.dir, "renders", "contact-sheet.jpg")]);
  const dur = probeDur(final);
  const metaNow = existsSync(join(P.dir, "audio_meta.json")) ? readJson(join(P.dir, "audio_meta.json")) : null;
  const cr = audioCredits(P, metaNow);
  const req = cr.entries.filter((e) => e.attribution_required);
  // visual assets used by the frames (Lottie / DiceBear / Humaaans), recorded by build → assets/visual-credits.json
  const vis = existsSync(join(P.dir, "assets", "visual-credits.json")) ? readJson(join(P.dir, "assets", "visual-credits.json")) : [];
  for (const v of vis.filter((x) => x.attribution_required)) if (!req.some((r) => r.attribution === v.attribution)) req.push({ ...v, source_url: v.url }); // one line per licence/source
  const creditsTxt = [
    req.length ? "Credits (required — paste into the video description):" : "No attribution required.",
    ...req.map((e) => `• ${e.attribution} Source: ${e.source_url}`),
    ...(cr.entries.some((e) => !e.attribution_required) ? ["", "Also used (public domain, credit optional):", ...cr.entries.filter((e) => !e.attribution_required).map((e) => `• "${e.title}" by ${e.creator} (${e.license_name}) ${e.source_url}`)] : []),
    ...(vis.some((e) => !e.attribution_required) ? ["", "Visual assets (no attribution required):", ...vis.filter((e) => !e.attribution_required).map((e) => `• ${e.attribution} ${e.url || ""}`)] : []),
  ].join("\n");
  writeFileSync(join(P.dir, "renders", "CREDITS.txt"), creditsTxt + "\n");
  if (cr.missing.length) console.log(`⚠ NO LICENSE RECORD for: ${cr.missing.join(", ")} — do not publish until resolved`);
  const up = uploadKit(P, final, req);
  // production record + history
  const specs = sb.frames.map((f) => { const p = join(P.dir, "spec", frameId(f) + ".json"); return existsSync(p) ? readJson(p) : {}; });
  const walk = (bs, acc) => { for (const b of bs || []) { acc.push(b.type); if (b.children) walk(b.children, acc); } return acc; };
  const blocks = [...new Set(specs.flatMap((s) => walk(s.blocks, [])))];
  const motions = [...new Set([P.look.motion.family, P.look.motion.hero, ...specs.map((s) => s.motion).filter(Boolean), ...specs.map((s) => s.heroMotion).filter(Boolean)])];
  const record = {
    slug: P.video.slug, title: P.video.title, date: new Date().toISOString().slice(0, 10), look: P.look.id,
    captions: captionStyle(P.video.captions?.style)[0], motions, blocks,
    hook: walk(specs[0]?.blocks, []), transitions: [...new Set(sb.frames.slice(1).map((f) => f.transitionIn || f.extra?.transition_in).filter(Boolean))],
    surfaces: specs.map((s) => s.surface || "base"), grounds: [...new Set(specs.map((s) => s.ground || P.look.ground))],
    custom: specs.filter((s) => walk(s.blocks, []).includes("custom")).length, duration_s: dur, loudness: loud,
    ending: P.video.ending || "follow-cta", characters: usedFigures(specs.map((spec) => ({ spec }))).house,
    ...designRecord(P, specs),
  };
  writeJson(join(P.dir, "production.json"), {
    ...record, voice: voiceRecord(P), message: sb.globals?.message, audience: sb.globals?.audience,
    frames: frameTimes(sb).map((f, i) => ({ ...f, title: sb.frames[i].title, voiceover: sb.frames[i].voiceover, transition_in: sb.frames[i].transitionIn, spec: specs[i] })),
    audio_assets: cr.entries.map((e) => ({ title: e.title, creator: e.creator, license: e.license_name, attribution_required: e.attribution_required, source_url: e.source_url, openverse_id: e.openverse_id })),
    outputs: { final: "renders/" + P.video.slug + ".mp4", raw: "renders/raw.mp4", contact_sheet: "renders/contact-sheet.jpg", credits: "renders/CREDITS.txt", upload: "renders/UPLOAD.md", thumbnail: "renders/thumbnail.jpg" },
  });
  if (!has("no-history")) {
    const h = history().filter((e) => e.slug !== record.slug);
    h.push(record); writeJson(HISTORY, h);
  }
  console.log(creditsTxt);
  console.log(`✓ render: ${final}\n  ${dur}s · loudness ${loud.before} → ${loud.after} LUFS\n  contact sheet: ${join(P.dir, "renders", "contact-sheet.jpg")}`);
  console.log(`✓ upload kit: ${join(P.dir, "renders", "UPLOAD.md")} · thumbnail ${join(P.dir, "renders", "thumbnail.jpg")}${up.length ? "\n  ⚠ " + up.join("\n  ⚠ ") : ""}`);
}
// Upload kit (video.json → upload): paste-ready title / description (+ required credits) / hashtags /
// pinned comment + a full-res thumbnail frame. Returns warnings; missing copy is marked TODO, never invented here.
function uploadKit(P, final, credits) {
  const u = P.video.upload || {}, warn = [];
  const tags = (u.hashtags || []).map((t) => "#" + String(t).replace(/^#/, "").replace(/\s+/g, ""));
  if (!u.title) warn.push("upload.title is empty"); else if (u.title.length > 70) warn.push(`upload.title is ${u.title.length} chars (keep ≤ 70; the first ~40 show in the feed)`);
  if (!u.description) warn.push("upload.description is empty");
  const sources = (Array.isArray(u.sources) ? u.sources : u.sources ? [u.sources] : []).filter(Boolean);
  if (!sources.length) warn.push("upload.sources is empty — every claim needs a source in the description (sources never go on screen)");
  if (!u.pinned) warn.push("upload.pinned is empty");
  if (!u.follow) warn.push("upload.follow is empty (the series ask that replaced the spoken follow line)");
  if (tags.length < 3 || tags.length > 5) warn.push(`${tags.length} hashtags (use 3–5)`);
  const long = isLong(P.video);
  if (!long && !tags.some((t) => /^#shorts$/i.test(t))) warn.push("hashtags lack #Shorts");
  if (long && tags.some((t) => /^#shorts$/i.test(t))) warn.push("#Shorts on a long-form video — remove it");
  const chap = long ? chapterStamps(P, storyboard(P.dir)) : { lines: [], warn: [] };
  warn.push(...chap.warn);
  const thumbAt = u.thumbAt ?? 0.05;
  run("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(thumbAt), "-i", final, "-frames:v", "1", "-q:v", "2", join(P.dir, "renders", "thumbnail.jpg")]);
  // YouTube caps the description at 5,000 chars: a long source list goes in condensed as
  // upload.descriptionSources / upload.descriptionCredits (the full upload.sources stays the record)
  const shownSources = Array.isArray(u.descriptionSources) && u.descriptionSources.length ? u.descriptionSources : sources;
  const creditLines = Array.isArray(u.descriptionCredits) && u.descriptionCredits.length ? u.descriptionCredits : credits.map((e) => `${e.attribution} Source: ${e.source_url}`);
  const description = [u.description || "TODO: description", ...(chap.lines.length ? ["", "Chapters:", ...chap.lines] : []), ...(shownSources.length ? ["", "Sources:", ...shownSources.map((x) => "• " + x)] : []), ...(u.follow ? ["", u.follow] : []), ...(creditLines.length ? ["", "Credits:", ...creditLines] : []), "", tags.join(" ")].join("\n");
  if (description.length > 5000) warn.push(`description is ${description.length} chars — YouTube allows 5,000; condense into upload.descriptionSources / descriptionCredits`);
  const md = [
    `# Upload kit — ${P.video.slug}`, "",
    `Video: \`renders/${basename(final)}\` · Thumbnail: \`renders/thumbnail.jpg\` (frame at ${thumbAt}s)`, "",
    "## Title", "", u.title || "TODO: title", "",
    "## Description (paste as-is — includes sources, required credits and hashtags)", "", "```", description, "```", "",
    "## Pinned comment", "", u.pinned || "TODO: pinned comment", "",
    ...(warn.length ? ["## ⚠ Fix before publishing", "", ...warn.map((w) => "- " + w), ""] : []),
  ].join("\n");
  writeFileSync(join(P.dir, "renders", "UPLOAD.md"), md);
  return warn;
}
// ── long-form helpers ── chapter timestamps (YouTube: first at 0:00, ≥ 3 chapters, each ≥ 10 s) and subtitles
const stamp = (t) => { const s = Math.floor(t), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };
function chapterStarts(sb) {
  const ch = chapterOf(sb), ft = frameTimes(sb), out = [];
  ch.forEach((c, i) => { if (!out.length || out[out.length - 1].n !== c) out.push({ n: c, start: ft[i].start }); });
  return out;
}
function chapterStamps(P, sb) {
  const starts = chapterStarts(sb), names = new Map((P.video.chapters || []).map((c) => [+c.n, c.title])), warn = [];
  if (starts.length < 3) warn.push(`${starts.length} chapter(s) — YouTube needs ≥ 3 for chapter timestamps (STORYBOARD.md "- chapter: N")`);
  starts.forEach((c, i) => { const next = starts[i + 1]?.start ?? frameTimes(sb).reduce((a, f) => a + f.dur, 0); if (next - c.start < 10) warn.push(`chapter ${c.n} runs ${(next - c.start).toFixed(1)} s — YouTube chapters must be ≥ 10 s`); if (!names.get(c.n)) warn.push(`chapter ${c.n} has no title (video.json → chapters [{n, title}])`); });
  return { lines: starts.map((c, i) => `${stamp(i ? c.start : 0)} ${names.get(c.n) || "Chapter " + c.n}`), warn };
}
function longSheetTimes(sb) {
  const ft = frameTimes(sb), total = ft.reduce((a, f) => a + f.dur, 0), n = 24;
  return Array.from({ length: n }, (_, i) => +(0.05 + (total - 0.2) * i / (n - 1)).toFixed(2));
}
// SRT from the aligned narration (audio_meta words placed at their frame starts). Cues break at sentence ends,
// ≤ 2 lines × 42 chars, ≤ 6 s, ≥ 1 s; text keeps the script's spelling (studio audio force-aligns it).
function writeSrt(P, sb) {
  const meta = readJson(join(P.dir, "audio_meta.json")), ft = frameTimes(sb);
  const start = new Map(sb.frames.map((f, i) => [f.number, ft[i].start]));
  const words = [], vo = new Map(sb.frames.map((f) => [f.number, (f.voiceover || "").replace(/^["“]|["”]$/g, "").trim()]));
  for (const v of meta.voices || []) {
    const ws = v.words || [];
    ws.forEach((w, k) => {
      let text = String(w.text);
      // Whisper often drops the last full stop: the script's line end decides where a sentence ends
      const last = k === ws.length - 1, end = (vo.get(v.frame) || "").match(/[.!?…]["”’)]*$/);
      if (last && end && !/[.!?…,;:]["”’)]*$/.test(text)) text += end[0];
      words.push({ text, start: (start.get(v.frame) || 0) + w.start, end: (start.get(v.frame) || 0) + w.end, lineEnd: last });
    });
  }
  words.sort((a, b) => a.start - b.start);
  const cues = []; let cur = [];
  const flush = () => { if (cur.length) cues.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.text).join(" ") }); cur = []; };
  for (const w of words) {
    const text = [...cur.map((x) => x.text), w.text].join(" ");
    if (cur.length && (text.length > 84 || w.end - cur[0].start > 6 || w.start - cur[cur.length - 1].end > 0.9)) flush();
    cur.push(w);
    if ((/[.!?…]["”’)]*$/.test(w.text) && cur.map((x) => x.text).join(" ").length > 20) || (w.lineEnd && /[.!?…]["”’)]*$/.test(w.text))) flush();
  }
  flush();
  const ts = (t) => { const ms = Math.round(t * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s2 = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s2).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };
  const wrap = (t) => { if (t.length <= 42) return t; const mid = t.length / 2; let best = -1; for (let i = 0; i < t.length; i++) if (t[i] === " " && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i; return best < 0 ? t : t.slice(0, best) + "\n" + t.slice(best + 1); };
  const body = cues.map((c, i) => { const end = Math.max(c.end + 0.15, c.start + 1); const next = cues[i + 1]?.start; return `${i + 1}\n${ts(c.start)} --> ${ts(next ? Math.min(end, next - 0.02) : end)}\n${wrap(c.text)}\n`; }).join("\n");
  mkdirSync(join(P.dir, "renders"), { recursive: true });
  const file = join(P.dir, "renders", P.video.slug + ".en.srt");
  writeFileSync(file, body);
  return { file, cues: cues.length };
}
function cmdSrt() {
  const P = project(positional[0] && slugDir(positional[0]));
  if (!existsSync(join(P.dir, "audio_meta.json"))) die("no audio_meta.json — run studio audio first");
  const sb = storyboard(P.dir), r = writeSrt(P, sb);
  console.log(`✓ ${r.file} · ${r.cues} cues`);
  if (isLong(P.video)) { const c = chapterStamps(P, sb); console.log("chapters:\n  " + c.lines.join("\n  ") + (c.warn.length ? "\n  ⚠ " + c.warn.join("\n  ⚠ ") : "")); }
}
function cmdStatus() {
  const P = project(positional[0] && slugDir(positional[0]));
  const sb = storyboard(P.dir);
  const ft = frameTimes(sb);
  const ch = chapterOf(sb);
  ft.forEach((f, i) => console.log(`${isLong(P.video) ? "ch" + String(ch[i]).padStart(2, "0") + " " : ""}${f.id.padEnd(28)} ${f.start.toFixed(2).padStart(7)}s +${f.dur.toFixed(2)}s  spec:${existsSync(join(P.dir, "spec", f.id + ".json")) ? "✓" : "✗"}`));
  console.log(`total ${ft.reduce((a, f) => a + f.dur, 0).toFixed(2)}s · look=${P.look.id}`);
}

// ── listen ── audio-only preview (STYLE.md gate 6: "does it sound right with the picture off?"). Mixes exactly what
// the build placed — voice lines at their frame starts, the ducked bed, each SFX at its cue — normalises like render
// (−14 LUFS, fade-out over the end hold), writes renders/listen.m4a and prints loudness + the sound audit.
function cmdListen() {
  const P = project(positional[0] && slugDir(positional[0]));
  const sb = storyboard(P.dir);
  const metaPath = join(P.dir, "audio_meta.json");
  if (!existsSync(metaPath)) die("no audio_meta.json — run studio audio and studio build first");
  const meta = readJson(metaPath), ft = frameTimes(sb), total = ft.reduce((a, f) => a + f.dur, 0);
  const start = new Map(sb.frames.map((f, i) => [f.number, ft[i].start]));
  const ins = [], parts = [];
  const add = (file, at, vol, dur) => {
    const k = parts.length; ins.push("-i", join(P.dir, file));
    const ms = Math.max(0, Math.round(at * 1000));
    parts.push(`[${k}:a]aresample=48000,aformat=channel_layouts=stereo${dur ? `,atrim=0:${dur.toFixed(3)}` : ""},volume=${vol},adelay=${ms}:all=1[a${k}]`);
  };
  for (const v of meta.voices || []) add(v.mix || v.path, start.get(v.frame) || 0, 1);
  if (meta.bgm) add(meta.bgm.path, 0, meta.bgm.volume ?? 1);
  for (const x of meta.sfx || []) add(x.file, (start.get(x.frame) || 0) + x.offset_s, x.volume ?? 0.35, x.duration_s);
  if (!parts.length) die("nothing to mix");
  const n = parts.length, labels = parts.map((_, k) => `[a${k}]`).join("");
  const fade = Math.max(0, total - 0.8).toFixed(2);
  const graph = parts.join(";") + `;${labels}amix=inputs=${n}:normalize=0:duration=longest,apad=whole_dur=${total.toFixed(3)},atrim=0:${total.toFixed(3)},loudnorm=I=-14:TP=-1.5:LRA=11,afade=t=out:st=${fade}:d=0.8[out]`;
  mkdirSync(join(P.dir, "renders"), { recursive: true });
  const out = join(P.dir, "renders", "listen.m4a");
  run("ffmpeg", ["-y", "-loglevel", "error", ...ins, "-filter_complex", graph, "-map", "[out]", "-c:a", "aac", "-b:a", "192k", out]);
  const m = run("ffmpeg", ["-hide_banner", "-nostats", "-i", out, "-af", "ebur128=peak=true", "-f", "null", "-"], { capture: true }).stderr || "";
  const I = (m.match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop(), LRA = (m.match(/LRA:\s+([\d.]+) LU/g) || []).pop(), pk = (m.match(/Peak:\s+(-?[\d.]+) dBFS/g) || []).pop();
  console.log(`✓ listen: ${out}\n  ${total.toFixed(1)}s · ${meta.voices?.length || 0} voice lines · ${meta.sound ? `soundtrack: ${meta.sound.music.length} music cue(s) · ${meta.sound.ambience.length} ambience · ${meta.sound.nat.length} nat · ${meta.sound.sfx.length} SFX` : (meta.bgm ? "bed " + basename(meta.bgm.source || meta.bgm.path) : "NO MUSIC BED") + ` · ${(meta.sfx || []).length} SFX`}`);
  console.log(`  loudness ${I ? I.replace(/\s+/g, " ") : "?"} · ${LRA ? LRA.replace(/\s+/g, " ") : ""} · true peak ${pk ? pk.replace(/Peak:\s+/, "") : "?"}`);
  const sound = soundAudit(P, sb, meta);
  console.log(sound.length ? "sound: ⚠ " + sound.join("\n  ⚠ ") : "sound: ✓ bed + SFX spaced and off the key words");
  console.log("Listen with the picture off: is every word clear over the bed, does the music arc (build → change at the turn → resolve), any SFX that sounds noisy or late?");
}

const CMDS = { lottie: () => cmdLottie(argv.slice(1).filter((a, i, all) => !a.startsWith("--") && !(all[i - 1] || "").startsWith("--")), flag), avatar: () => cmdAvatar(argv.slice(1)), humaaans: () => cmdHumaaans(argv.slice(1)), iconscout: () => cmdIconscout(argv.slice(1).filter((a, i, all) => !a.startsWith("--") && !(all[i - 1] || "").startsWith("--")), flag), icons: cmdIcons, peeps: cmdPeeps, looks: cmdLooks, variety: cmdVariety, new: cmdNew, audio: cmdAudio, words: () => printWords(project(positional[0] && slugDir(positional[0]))), build: cmdBuild, snap: cmdSnap, listen: cmdListen, data: () => { const P = project(positional[0] && slugDir(positional[0])); return cmdData(P.dir, P.video, positional.slice(1), flag); }, undraw: () => cmdUndraw(positional, flag), script: () => cmdScript(project(positional[0] && slugDir(positional[0]))), split: () => cmdSplit(project(positional[0] && slugDir(positional[0])), positional, flag), render: cmdRender, status: cmdStatus, srt: cmdSrt,
  article: () => cmdArticle(positional[1] ? project(slugDir(positional[1])) : null, positional[0], flag),
  snip: () => cmdSnip(project(positional[0] && slugDir(positional[0])), positional[1], positional[2], positional[3], flag),
  clip: () => cmdClip(project(positional[0] && slugDir(positional[0])), positional[1], flag),
  photo: () => cmdPhoto(positional, flag),
  footage: () => cmdFootage(project(positional[0] && slugDir(positional[0])), positional[1], flag),
  cutout: () => cmdCutout(project(positional[0] && slugDir(positional[0])), positional[1], flag),
  upscale: () => cmdUpscale(project(positional[0] && slugDir(positional[0])), positional[1], flag),
  iconify: () => cmdIconify(positional, flag),
  sound: () => cmdSound(positional, flag),
  // long-form review: one chapter's picture + its stretch of the final soundtrack → renders/preview-chNN.mp4
  preview: () => { const P = project(positional[0] && slugDir(positional[0])); if (!has("chapter")) die("preview <slug> --chapter N [--modal]");
    const rel = P.dir.slice(VIDEOS.length + 1).split("\\").join("/");
    const one = has("modal") ? (entry, out) => run("modal", ["run", join(STUDIO, "tools", "modal", "render.py"), "--slug", rel, "--chunks", flag("chunks", "32"), "--entry", entry, "--out", out.slice(P.dir.length + 1).split("\\").join("/")], { cwd: VIDEOS, env: { PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" } })
      : (entry, out) => npx(["render", "--composition", entry, "--quality", "high", "--output", out], { cwd: P.dir, capture: true });
    previewChapter(P, storyboard(P.dir), +flag("chapter"), one); } };
if (!CMDS[cmd]) {
  console.log("studio <looks|variety|new|audio|words|script|split|build|snap|listen|data|undraw|render|status|icons|peeps|lottie|avatar|humaaans|iconscout|article|snip|clip|cutout|upscale|iconify|sound> [slug] [flags]\n  new <slug> --look <id> [--title ...] [--tts parler|openrouter|kokoro] [--tts-model id] [--voice id]\n  build [slug] [--no-check] · snap [slug] [--at 1,2,3] · render [slug] [--no-history] [--modal [--chunks 32]]");
  process.exit(cmd ? 1 : 0);
}
await CMDS[cmd]();
