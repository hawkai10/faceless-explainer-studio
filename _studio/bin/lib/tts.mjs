// TTS providers + local Whisper word timings:
//   parler     — local AI4Bharat Indic Parler-TTS (house voice), run via _studio/.venv-parler + lib/parler.py
//   openrouter — fish-audio/s2.1-pro-free:free; key + model from videos/.env (OPENROUTER_API_KEY) — never commit .env
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STUDIO, VIDEOS, HF, run } from "./common.mjs";
import { cutPlan, matchTake } from "./voicematch.mjs";

const ENDPOINT = "https://openrouter.ai/api/v1/audio/speech";
export const DEFAULT_MODEL = "fish-audio/s2.1-pro-free:free";
// Former house narrator (2026-09-28, before Parler): Fish Audio "ELITE" — https://fish.audio/m/d8a1340984ee4b63ad1ffae27a6a4339
export const FISH_VOICE = { voice: "d8a1340984ee4b63ad1ffae27a6a4339", speed: 0.95, name: "ELITE (Fish Audio)" };
// House narrator for every video (user-chosen 2026-09-28): Indic Parler-TTS speaker "Thoma", expressive description.
// Sample: _studio/samples/voices/P-thoma-expressive.wav
export const PARLER_MODEL = "ai4bharat/indic-parler-tts";
export const HOUSE_VOICE = {
  provider: "parler", model: PARLER_MODEL, voice: "Thoma", seed: 7, name: "Thoma (Indic Parler-TTS, expressive)",
  description: "Thoma delivers an engaging, expressive narration at a moderate pace with a slightly low pitch. The recording is of very high quality, with very clear audio and no background noise.",
};
const PARLER_PY = join(STUDIO, ".venv-parler", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const PARLER_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "parler.py");

/** Load videos/.env into process.env (existing env vars win). */
export function loadEnv() {
  const p = join(VIDEOS, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Synthesize one line to a WAV file. Retries on 429 / 5xx (free tier throttles). */
export async function synth(text, outWav, { model, voice, speed } = {}) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY missing — put it in videos/.env (see .env.example)");
  const body = { model: model || process.env.OPENROUTER_TTS_MODEL || DEFAULT_MODEL, input: text, response_format: "pcm" };
  if (voice) body.voice = voice;
  if (speed && speed !== 1) body.speed = speed; // OpenRouter speech `speed` (0.8 ≈ −16% pace)
  let last = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt) await sleep(Math.min(30_000, 2000 * 2 ** (attempt - 1)));
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "videos-studio" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (e) { last = e.message; continue; }
    if (res.status === 429 || res.status >= 500) { last = `HTTP ${res.status} ${(await res.text()).slice(0, 160)}`; continue; }
    if (!res.ok) throw new Error(`OpenRouter TTS HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const ctype = res.headers.get("content-type") || "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2000) throw new Error(`OpenRouter TTS returned only ${buf.length} bytes for: "${text.slice(0, 60)}"`);
    const tmp = outWav + ".raw";
    writeFileSync(tmp, buf);
    if (/audio\/pcm/i.test(ctype)) {
      const rate = (ctype.match(/rate=(\d+)/) || [, "44100"])[1], ch = (ctype.match(/channels=(\d+)/) || [, "1"])[1];
      run("ffmpeg", ["-y", "-loglevel", "error", "-f", "s16le", "-ar", rate, "-ac", ch, "-i", tmp, outWav]);
    } else {
      run("ffmpeg", ["-y", "-loglevel", "error", "-i", tmp, outWav]); // mp3 etc.
    }
    rmSync(tmp, { force: true });
    return body.model;
  }
  throw new Error(`OpenRouter TTS failed after retries: ${last}`);
}

/** Word timings for a WAV via the local Whisper in the HyperFrames CLI. */
export function transcribeWords(wav) {
  const dir = mkdtempSync(join(tmpdir(), "studio-tx-"));
  try {
    run("npx", ["--yes", HF, "transcribe", `"${wav}"`, "-d", `"${dir}"`, "--json"], { capture: true });
    const j = JSON.parse(readFileSync(join(dir, "transcript.json"), "utf8"));
    const words = Array.isArray(j) ? j : j.words || [];
    return words.map((w, i) => ({ id: "w" + i, text: w.text ?? w.word, start: w.start, end: w.end }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/**
 * Voice every storyboard line into <project>/assets/voice/raw/NN.wav (unpadded) and return
 * audio_meta-shaped voices. Lines whose text/model/voice are unchanged are reused from
 * assets/voice/raw/NN.wav (+ NN.json fingerprint) — no API call / no regeneration.
 */
export async function voiceProject(dir, frames, cfg = {}) {
  if (cfg.provider === "parler") return voiceParler(dir, frames, cfg);
  const model = cfg.model || process.env.OPENROUTER_TTS_MODEL || DEFAULT_MODEL;
  // Without a voice id Fish picks a RANDOM speaker per request → a different narrator on every line.
  if (!cfg.voice) throw new Error("video.json → tts.voice is required (a Fish Audio voice id) — without it every line gets a different random narrator. See STUDIO.md → Voice.");
  const rawDir = join(dir, "assets", "voice", "raw");
  mkdirSync(rawDir, { recursive: true });
  const voices = [];
  for (const f of frames) {
    const text = lineText(f);
    if (!text) continue;
    const nn = String(f.number).padStart(2, "0");
    const raw = join(rawDir, nn + ".wav"), fp = join(rawDir, nn + ".json");
    const hash = createHash("sha1").update([model, cfg.voice || "", cfg.speed || 1, text].join("|")).digest("hex");
    const cached = existsSync(raw) && existsSync(fp) && JSON.parse(readFileSync(fp, "utf8")).hash === hash;
    let words;
    if (cached) {
      words = JSON.parse(readFileSync(fp, "utf8")).words;
      process.stdout.write(`  voice ${nn}: cached\n`);
    } else {
      await synth(text, raw, { model, voice: cfg.voice, speed: cfg.speed });
      words = transcribeWords(raw);
      writeFileSync(fp, JSON.stringify({ hash, provider: "openrouter", model, voice: cfg.voice || null, speed: cfg.speed || 1, text, words }, null, 2));
      process.stdout.write(`  voice ${nn}: ${model}${cfg.voice ? " / " + cfg.voice : ""} · ${words.length} words\n`);
    }
    voices.push({ frame: f.number, path: `assets/voice/${nn}.wav`, raw, words });
  }
  return { model, voices };
}

const lineText = (f) => (f.voiceover || "").replace(/^["“]|["”]$/g, "").trim();

/**
 * Parler: consecutive lines are voiced together as one continuous take (≤ tts.chunkWords words, default 45 —
 * Parler was trained on ≤30 s clips, so a whole script in one pass degrades), then each take is
 * transcribed, checked word-by-word against the script (QA), and cut back into per-line WAVs.
 * A take that drops/garbles words is re-voiced with a new seed (tts.tries, default 3); if every try
 * fails, audio stops and names the line. Takes are cached by text+voice (raw/take-<hash>.wav/.json),
 * so editing one line only re-voices the take containing it.
 */
async function voiceParler(dir, frames, cfg) {
  const model = cfg.model || PARLER_MODEL;
  if (!cfg.description) throw new Error("video.json → tts.description is required for parler (it defines the narrator). See STUDIO.md → Voice.");
  if (!existsSync(PARLER_PY)) throw new Error(`Parler venv missing (${PARLER_PY}) — see STUDIO.md → Voice for setup.`);
  const rawDir = join(dir, "assets", "voice", "raw");
  mkdirSync(rawDir, { recursive: true });
  const maxWords = cfg.chunkWords ?? 45, maxWer = cfg.maxWer ?? 0.2, tries = cfg.tries ?? 3, seed0 = cfg.seed ?? 7;
  const lines = frames.map((f) => ({ f, nn: String(f.number).padStart(2, "0"), text: lineText(f) })).filter((l) => l.text);
  const takes = [];
  let cur = [], n = 0;
  for (const l of lines) {
    const w = l.text.split(/\s+/).length;
    if (cur.length && n + w > maxWords) { takes.push(cur); cur = []; n = 0; }
    cur.push(l); n += w;
  }
  if (cur.length) takes.push(cur);
  const T = takes.map((ls, i) => {
    const hash = createHash("sha1").update(["take-v1", model, cfg.description, seed0, maxWer, ...ls.map((l) => l.text)].join("|")).digest("hex");
    const base = join(rawDir, "take-" + hash.slice(0, 12));
    const json = base + ".json", cached = existsSync(base + ".wav") && existsSync(json) && JSON.parse(readFileSync(json, "utf8")).hash === hash;
    return { i, lines: ls, text: ls.map((l) => l.text).join(" "), hash, base, cached, rec: cached ? JSON.parse(readFileSync(json, "utf8")) : null };
  });
  // drop takes from earlier versions of the script
  const keep = new Set(T.map((t) => basename(t.base)));
  for (const f of readdirSync(rawDir)) if (/^take-/.test(f) && !keep.has(f.replace(/(\.try\d+)?\.(wav|json)$/, ""))) rmSync(join(rawDir, f), { force: true });

  for (let attempt = 0; attempt < tries; attempt++) {
    const todo = T.filter((t) => !t.rec);
    if (!todo.length) break;
    const seed = seed0 + attempt * 101;
    const job = join(rawDir, "_parler_job.json");
    writeFileSync(job, JSON.stringify({ model, description: cfg.description, lines: todo.map((t) => ({ text: t.text, out: `${t.base}.try${attempt}.wav`, seed })) }));
    process.stdout.write(`  parler: ${attempt ? "re-voicing" : "voicing"} ${todo.length} take(s)${attempt ? ` with seed ${seed}` : ""} on CPU (~1 min per take)…\n`);
    run(PARLER_PY, [PARLER_SCRIPT, job], { capture: true });
    rmSync(job, { force: true });
    for (const t of todo) {
      const wav = `${t.base}.try${attempt}.wav`, words = transcribeWords(wav);
      const m = matchTake(t.lines.map((l) => l.text), words, maxWer);
      if (!t.best || m.score < t.best.m.score) t.best = { m, words, wav, seed };
      if (m.ok) { t.rec = { hash: t.hash, seed, words, match: m.lines.map(({ heard, ...r }) => r) }; t.okWav = wav; }
      else process.stdout.write(`  take ${t.i + 1} (seed ${seed}) failed QA: ${m.lines.map((r, k) => (r.ok ? null : `frame ${t.lines[k].nn}`)).filter(Boolean).join(", ")}\n`);
    }
  }
  const failed = T.filter((t) => !t.rec);
  if (failed.length) {
    const msg = failed.flatMap((t) => t.best.m.lines.map((r, k) => (r.ok ? null : `  frame ${t.lines[k].nn}: expected "${t.lines[k].text}"\n            heard    "${r.heard.join(" ")}"`)).filter(Boolean));
    throw new Error(`Parler dropped or garbled words after ${tries} tries (best takes kept in ${rawDir}):\n${msg.join("\n")}\nReword the line (shorter, plainer words, numbers spelled as spoken), or if Whisper is mishearing a correct take, raise video.json → tts.maxWer.`);
  }
  const voices = [];
  for (const t of T) {
    if (!t.cached) {
      copyFileSync(t.okWav, t.base + ".wav");
      writeFileSync(t.base + ".json", JSON.stringify(t.rec, null, 2));
      for (const f of readdirSync(rawDir)) if (f.startsWith(basename(t.base) + ".try")) rmSync(join(rawDir, f), { force: true });
    }
    const plan = cutPlan({ lines: t.rec.match }, t.rec.words);
    const errs = t.rec.match.reduce((a, r) => a + r.errs, 0), toks = t.rec.match.reduce((a, r) => a + r.n, 0);
    process.stdout.write(`  take ${t.i + 1}: frames ${t.lines[0].nn}–${t.lines[t.lines.length - 1].nn} · ${toks} words · ${errs} mismatch(es) · seed ${t.rec.seed}${t.cached ? " · cached" : ""}\n`);
    t.lines.forEach((l, k) => {
      const raw = join(rawDir, l.nn + ".wav"), p = plan[k];
      run("ffmpeg", ["-y", "-loglevel", "error", "-i", t.base + ".wav", "-ss", String(p.start), "-to", String(p.end), raw]);
      writeFileSync(join(rawDir, l.nn + ".json"), JSON.stringify({ provider: "parler", model, voice: cfg.voice || null, take: basename(t.base), text: l.text, words: p.words }, null, 2));
      voices.push({ frame: l.f.number, path: `assets/voice/${l.nn}.wav`, raw, words: p.words });
    });
  }
  return { model, voices };
}
