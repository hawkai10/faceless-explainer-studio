// ElevenLabs handoff (the user voices every script in ElevenLabs, voice "Sagar" — no TTS on our side).
//   studio script <slug>        checks the script, writes renders/ELEVENLABS.md: one paste-ready block (one paragraph per
//                               frame) + a per-line table with delivery notes (storyboard bullet `- delivery: …`)
//   studio split <slug> [mp3]   cuts the one MP3 you generated (default assets/voice/eleven/full.mp3) into per-frame clips
//                               assets/voice/eleven/NN.wav by aligning Whisper words to the script, wires `- voice_file:`
//                               into STORYBOARD.md and sets pads.default 0 (the clips keep the natural pauses).
//                               Then: studio audio <slug> → studio build <slug>.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { HF, die, pad2, readJson, writeJson, run, storyboard, ENDS_SENTENCE, FOLLOW_ASK, lengthTarget, SHORT_CAP, isLong, chapterOf } from "./common.mjs";
import { matchTake } from "./voicematch.mjs";
import { alignAvailable, forceAlign, silences, quietestCut } from "./align.mjs";

const lineText = (f) => (f.voiceover || "").replace(/^["“]|["”]$/g, "").trim();
const WPM = 155; // ElevenLabs Sagar ≈ 150–160 wpm incl. natural pauses

// ── checks shared by script (before recording) ──
function scriptChecks(sb, video) {
  const errs = [], warns = [];
  const lines = sb.frames.map(lineText);
  const last = lines[lines.length - 1] || "";
  if (!ENDS_SENTENCE.test(last)) errs.push(`the last line ends mid-sentence ("…${last.slice(-40)}") — finish it (no abrupt endings)`);
  if (FOLLOW_ASK.test(last)) errs.push("the last line asks viewers to follow/subscribe — that goes in upload.follow");
  sb.frames.forEach((f, i) => {
    const t = lines[i], n = pad2(f.number);
    if (!t) errs.push(`frame ${n} has no voiceover`);
    if (/\d/.test(t)) warns.push(`frame ${n}: digits in "${t.match(/\S*\d\S*/)[0]}" — write numbers as spoken ("twelve lakh", "fourteen thousand crore")`);
    if (/[₹$%]/.test(t)) warns.push(`frame ${n}: symbol in the line — write it as spoken ("rupees", "percent")`);
    const caps = t.match(/\b[A-Z]{2,5}s?\b/g);
    if (caps) warns.push(`frame ${n}: initialisms ${[...new Set(caps)].join(", ")} — check ElevenLabs reads them as letters; if not, write "E.M.I." and add captions.map`);
    if (t.split(/\s+/).length > 32) warns.push(`frame ${n}: ${t.split(/\s+/).length} words in one beat — split it (a frame should change every few seconds)`);
  });
  const words = lines.join(" ").split(/\s+/).filter(Boolean).length;
  const secs = words / WPM * 60;
  const L = lengthTarget(video), maxWords = Math.round(L.max * WPM / 60);
  if (L.longForm) {
    if (words > maxWords + 20) warns.push(`${words} words ≈ ${(secs / 60).toFixed(1)} min — over the agreed ${(L.max / 60).toFixed(1)} min (≈ ${maxWords} words); tighten`);
    return { errs, warns, words, secs, lines };
  }
  if (words > Math.round(SHORT_CAP * WPM / 60) + 10) errs.push(`${words} words ≈ ${secs.toFixed(0)} s — over the 3-minute Shorts limit; cut it`);
  else if (words < 110) warns.push(`${words} words ≈ ${secs.toFixed(0)} s — aim for 130–150 words (45–60 s)`);
  else if (!L.long && words > 160) warns.push(`${words} words ≈ ${secs.toFixed(0)} s — over 60 s. Default is 130–150 words; go longer only if the story earns it (STYLE.md → Length): agree it with the user at the script gate and set video.json → maxLength (≤ ${SHORT_CAP})`);
  else if (L.long && words > maxWords + 10) warns.push(`${words} words ≈ ${secs.toFixed(0)} s — over the agreed maxLength ${L.max} s (≈ ${maxWords} words); tighten`);
  else if (L.long && words > 160) warns.push(`long Short: ${words} words ≈ ${secs.toFixed(0)} s (maxLength ${L.max} s) — every extra 20–30 s must bring a new turn or evidence; cut any beat that only adds detail (STYLE.md → Length)`);
  return { errs, warns, words, secs, lines };
}

export function cmdScript(P) {
  const sb = storyboard(P.dir);
  const c = scriptChecks(sb, P.video);
  const paste = c.lines.join("\n\n");
  const rows = sb.frames.map((f, i) => `| ${pad2(f.number)} | ${f.title || ""} | ${c.lines[i]} | ${(f.extra?.delivery || "").replace(/\|/g, "/")} |`);
  if (isLong(P.video)) return writeChapterScript(P, sb, c, rows);
  const md = [
    `# ElevenLabs script — ${P.video.slug}`, "",
    `Voice: **${P.video.voiceover_source || "ElevenLabs (Sagar)"}** · ${c.words} words ≈ ${c.secs.toFixed(0)} s · ending: ${P.video.ending || "?"}`, "",
    "## Paste this as ONE generation", "",
    "One paragraph per frame — the blank lines give natural pauses, and `studio split` finds each line in the take.", "",
    "```", paste, "```", "",
    "## Line by line (delivery notes)", "",
    "| # | beat | line | delivery |", "|---|---|---|---|", ...rows, "",
    "## Then", "",
    `1. Download the MP3 to \`${P.video.slug}/assets/voice/eleven/full.mp3\`.`,
    `2. \`studio split ${P.video.slug}\` — cuts it into one clip per frame and wires them into STORYBOARD.md.`,
    `3. \`studio audio ${P.video.slug}\` → \`studio build ${P.video.slug}\`.`, "",
    ...(c.errs.length || c.warns.length ? ["## Checks", "", ...c.errs.map((e) => "- ✗ " + e), ...c.warns.map((w) => "- ⚠ " + w), ""] : []),
  ].join("\n");
  mkdirSync(join(P.dir, "renders"), { recursive: true });
  const out = join(P.dir, "renders", "ELEVENLABS.md");
  writeFileSync(out, md);
  console.log(`✓ ${out}\n  ${sb.frames.length} lines · ${c.words} words ≈ ${c.secs.toFixed(0)} s`);
  for (const w of c.warns) console.log("⚠ " + w);
  if (c.errs.length) { for (const e of c.errs) console.log("✗ " + e); console.log("✗ fix these before recording"); process.exitCode = 2; }
}

// Long-form (user decision 2026-10-08): one ElevenLabs generation — and one MP3 — per chapter, so a chapter can be
// re-generated alone and every take stays within the per-generation limit. Files: assets/voice/eleven/chNN.mp3.
function chapterGroups(sb) {
  const ch = chapterOf(sb), groups = [];
  sb.frames.forEach((f, i) => { const g = groups[groups.length - 1]; if (g && g.n === ch[i]) g.idx.push(i); else groups.push({ n: ch[i], idx: [i] }); });
  return groups;
}
export const chapterFile = (n) => join("assets", "voice", "eleven", `ch${pad2(n)}.mp3`);
function writeChapterScript(P, sb, c, rows) {
  const names = new Map((P.video.chapters || []).map((x) => [+x.n, x.title]));
  const groups = chapterGroups(sb);
  const blocks = groups.flatMap((g) => {
    const w = g.idx.map((i) => c.lines[i]).join(" ").split(/\s+/).filter(Boolean).length;
    return [`### Chapter ${g.n}${names.get(g.n) ? " — " + names.get(g.n) : ""} · ${w} words ≈ ${(w / WPM * 60).toFixed(0)} s → save as \`${chapterFile(g.n).replace(/\\/g, "/")}\``, "", "```", g.idx.map((i) => c.lines[i]).join("\n\n"), "```", ""];
  });
  const md = [
    `# ElevenLabs script — ${P.video.slug} (long-form)`, "",
    `Voice: **${P.video.voiceover_source || "ElevenLabs (Sagar)"}** · ${c.words} words ≈ ${(c.secs / 60).toFixed(1)} min · ${groups.length} chapters`, "",
    "## Generate ONE take per chapter", "",
    "Same voice and settings for every chapter. One paragraph per frame — the blank lines give natural pauses, and `studio split` finds each line in its chapter's take.", "",
    ...blocks,
    "## Line by line (delivery notes)", "",
    "| # | beat | line | delivery |", "|---|---|---|---|", ...rows, "",
    "## Then", "",
    `1. Save each chapter's MP3 as \`${P.video.slug}/assets/voice/eleven/chNN.mp3\` (ch00 = cold open).`,
    `2. \`studio split ${P.video.slug}\` — cuts every chapter take into one clip per frame and wires them into STORYBOARD.md (re-run after replacing any chapter).`,
    `3. \`studio audio ${P.video.slug}\` → \`studio build ${P.video.slug}\`.`, "",
    ...(c.errs.length || c.warns.length ? ["## Checks", "", ...c.errs.map((e) => "- ✗ " + e), ...c.warns.map((w) => "- ⚠ " + w), ""] : []),
  ].join("\n");
  mkdirSync(join(P.dir, "renders"), { recursive: true });
  const out = join(P.dir, "renders", "ELEVENLABS.md");
  writeFileSync(out, md);
  console.log(`✓ ${out}\n  ${sb.frames.length} lines in ${groups.length} chapters · ${c.words} words ≈ ${(c.secs / 60).toFixed(1)} min`);
  for (const w of c.warns) console.log("⚠ " + w);
  if (c.errs.length) { for (const e of c.errs) console.log("✗ " + e); console.log("✗ fix these before recording"); process.exitCode = 2; }
}

// Whisper (HyperFrames CLI) with a chosen model — medium.en is much more reliable on a full take than the default
function transcribe(wav, model) {
  const dir = mkdtempSync(join(tmpdir(), "studio-split-"));
  try {
    run("npx", ["--yes", HF, "transcribe", `"${wav}"`, "-d", `"${dir}"`, "-m", model, "--json"], { capture: true });
    const j = JSON.parse(readFileSync(join(dir, "transcript.json"), "utf8"));
    return (Array.isArray(j) ? j : j.words || []).map((w, i) => ({ id: "w" + i, text: w.text ?? w.word, start: w.start, end: w.end }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

export function cmdSplit(P, positional, flag) {
  const sb = storyboard(P.dir);
  if (isLong(P.video) && !positional[1] && P.video.voiceTakes?.length) {
    // takes that each cover several chapters (rice-water: the user combined 10 chapter takes into 3) —
    // video.json → voiceTakes: [{file, chapters: [first, last]}]; each take is split against only its chapters' frames
    let sbText = readFileSync(join(P.dir, "STORYBOARD.md"), "utf8"), done = 0;
    const ch = chapterOf(sb), only = process.argv.includes("--take") ? +flag("take") : null;
    P.video.voiceTakes.forEach((tk, k) => {
      if (only != null && only !== k + 1) return;
      const src = join(P.dir, tk.file), [a, b] = tk.chapters;
      if (!existsSync(src)) return console.log(`⚠ take ${k + 1}: ${tk.file} missing — skipped`);
      const frames = sb.frames.filter((_, i) => ch[i] >= a && ch[i] <= b);
      console.log(`── take ${k + 1}: chapters ${a}–${b} (${frames.length} frames)`);
      sbText = splitTake(P, src, frames, flag, sbText, `_take${k + 1}`);
      done++;
    });
    if (!done) die("no voice takes found (video.json → voiceTakes)");
    return finishSplit(P, sbText, `${done} take(s)`);
  }
  if (isLong(P.video) && !positional[1]) {
    // one take per chapter: split each against only its own frames (--chapter N re-splits just one)
    const only = process.argv.includes("--chapter") ? +flag("chapter") : null;
    let sbText = readFileSync(join(P.dir, "STORYBOARD.md"), "utf8"), done = 0;
    for (const g of chapterGroups(sb)) {
      if (only != null && g.n !== only) continue;
      const src = join(P.dir, chapterFile(g.n));
      if (!existsSync(src)) { console.log(`⚠ chapter ${g.n}: no take at ${chapterFile(g.n)} — skipped`); continue; }
      console.log(`── chapter ${g.n} (${g.idx.length} frames)`);
      sbText = splitTake(P, src, g.idx.map((i) => sb.frames[i]), flag, sbText, `_ch${pad2(g.n)}`);
      done++;
    }
    if (!done) die("no chapter takes found (assets/voice/eleven/chNN.mp3)");
    return finishSplit(P, sbText, `${done} chapter take(s)`);
  }
  const src = resolve(P.dir, positional[1] || join("assets", "voice", "eleven", "full.mp3"));
  if (!existsSync(src)) die(`no take at ${src} — download the ElevenLabs MP3 there (or pass its path)`);
  const sbText = splitTake(P, src, sb.frames, flag, readFileSync(join(P.dir, "STORYBOARD.md"), "utf8"), "_full");
  return finishSplit(P, sbText, `${sb.frames.length} clips`);
}
// cut one take into one clip per frame (frames = the lines it contains, in order); returns the updated storyboard text
function splitTake(P, src, frames, flag, sbText, tag) {
  const outDir = join(P.dir, "assets", "voice", "eleven");
  mkdirSync(outDir, { recursive: true });
  const wav = join(outDir, tag + ".wav");
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", "44100", wav]);
  const model = flag("model", "medium.en");
  console.log(`transcribing ${src} (Whisper ${model})…`);
  const words = transcribe(wav, model);
  if (!words.length) die("Whisper heard no words");
  const lines = frames.map(lineText);
  const m = matchTake(lines, words, Number(flag("max-wer", 0.35)));
  if (!m.ok) P._splitWarn = true;
  const report = m.lines.map((r, i) => `  ${pad2(frames[i].number)} ${r.ok ? "✓" : "⚠"} ${r.n} words, ${r.errs} off${r.ok ? "" : `\n     script: ${lines[i]}\n     heard:  ${r.heard.join(" ")}`}`);
  console.log(report.join("\n"));
  const missing = m.lines.map((r, i) => (r.first == null ? pad2(frames[i].number) : null)).filter(Boolean);
  if (missing.length) die(`no words found for line(s) ${missing.join(", ")} — was the whole script generated, in order?`);
  // line spans: Whisper's word times, refined by forced alignment of the script (WhisperX) when .venv-align exists —
  // Whisper often ends a line early (rupee-defence: "stampede" spilled 0.26 s into the next clip)
  const L = m.lines, total = words[words.length - 1].end;
  let spans = L.map((r) => [words[r.first].start, words[r.last].end]);
  if (alignAvailable() && !process.argv.includes("--no-align")) {
    console.log("aligning the script to the take (WhisperX)…");
    const segs = spans.map(([s, e], i) => ({ text: lines[i], start: Math.max(i ? spans[i - 1][1] : 0, s - 0.3), end: Math.min(i < spans.length - 1 ? spans[i + 1][0] : total + 1, e + 0.6) }));
    const al = forceAlign([{ wav, segments: segs }])[0];
    // trust the aligner over Whisper: Whisper's first word can be a phantom from a breath (rupee-defence line 14 "lead")
    spans = al.map((ws, i) => (ws.length && ws[ws.length - 1].end > ws[0].start ? [ws[0].start, ws[ws.length - 1].end] : spans[i]));
  }
  // cut points: in the longest real silence between two lines (−40 dB), else the middle of the gap — every clip keeps
  // its share of the natural pause and no word tail spills into the next clip
  const sil = silences(wav);
  const between = spans.map((sp, i) => (i < spans.length - 1 ? quietestCut(sil, sp[1], spans[i + 1][0]) ?? (sp[1] + spans[i + 1][0]) / 2 : null));
  const cuts = spans.map(([s, e], i) => ({ start: i ? between[i - 1] : Math.max(0, s - 0.15), end: i < spans.length - 1 ? between[i] : Math.min(total + 0.6, e + 0.6) }));
  frames.forEach((f, i) => {
    const nn = pad2(f.number), rel = `assets/voice/eleven/${nn}.wav`, c = cuts[i];
    run("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-ss", c.start.toFixed(3), "-to", c.end.toFixed(3), "-af", "afade=t=in:d=0.02,areverse,afade=t=in:d=0.04,areverse", join(P.dir, rel)]);
    // wire `- voice_file:` under this frame's heading (replace or insert after its voiceover bullet)
    const block = sbText.match(new RegExp(`## Frame ${f.number}\\b[\\s\\S]*?(?=\\n## Frame |$)`));
    if (!block) return;
    let b = block[0];
    if (/^- voice_file: .*$/m.test(b)) b = b.replace(/^- voice_file: .*$/m, `- voice_file: ${rel}`);
    else b = b.replace(/^(- voiceover: .*)$/m, `$1\n- voice_file: ${rel}`);
    sbText = sbText.replace(block[0], b);
    console.log(`  ✓ ${rel}  ${c.start.toFixed(2)}–${c.end.toFixed(2)} s (${(c.end - c.start).toFixed(2)} s)`);
  });
  rmSync(wav, { force: true });
  return sbText;
}
function finishSplit(P, sbText, what) {
  writeFileSync(join(P.dir, "STORYBOARD.md"), sbText);
  const vp = join(P.dir, "video.json"), v = readJson(vp);
  v.pads = { ...(v.pads || {}), default: 0 }; // the clips carry the natural pauses; the end hold is enforced separately
  v.voiceover_source = v.voiceover_source || "ElevenLabs (Sagar), user-supplied";
  writeJson(vp, v);
  console.log(`✓ ${what} wired into STORYBOARD.md (pads.default = 0)${!P._splitWarn ? "" : " — ⚠ some lines differ from the script: fix captions via captions.map, or re-generate those lines"}\n  next: studio audio ${P.video.slug} → studio build ${P.video.slug}`);
}
