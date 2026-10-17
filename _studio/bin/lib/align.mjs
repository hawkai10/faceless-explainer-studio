// Forced alignment of the known script to recorded audio (WhisperX's wav2vec2 aligner, _studio/.venv-align) and
// silence detection — used by `studio split` (cut each line at the real pause) and `studio audio` (exact word times
// for captions and cues, no phantom or mis-heard words). Added 2026-10-08. Without the venv both fall back to Whisper.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { STUDIO, run } from "./common.mjs";

export const ALIGN_PY = join(STUDIO, ".venv-align", "Scripts", "python.exe");
const ALIGN = join(STUDIO, "tools", "align", "align.py");
export const alignAvailable = () => existsSync(ALIGN_PY) && existsSync(ALIGN);

// jobs: [{wav, segments: [{text, start, end}]}] → per job, per segment: [{word, start, end}]
export function forceAlign(jobs) {
  const dir = mkdtempSync(join(tmpdir(), "studio-align-"));
  try {
    const f = join(dir, "jobs.json");
    writeFileSync(f, JSON.stringify(jobs));
    const r = run(ALIGN_PY, ["-I", "-X", "utf8", ALIGN, f], { capture: true });
    return JSON.parse(r.stdout.trim().split(/\r?\n/).pop());
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// [[start, end], …] of silences (default −40 dB for ≥ 0.08 s) in a wav
export function silences(wav, db = -40, minDur = 0.08) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", wav, "-af", `silencedetect=n=${db}dB:d=${minDur}`, "-f", "null", "-"], { encoding: "utf8" });
  const out = [], txt = r.stderr || "";
  let s = null;
  for (const m of txt.matchAll(/silence_(start|end): ([\d.]+)/g)) {
    if (m[1] === "start") s = +m[2]; else if (s != null) { out.push([s, +m[2]]); s = null; }
  }
  return out;
}
// the middle of the longest silence inside (a, b) — the cleanest cut between two lines; null if none
export function quietestCut(sil, a, b) {
  let best = null;
  for (const [s, e] of sil) {
    const lo = Math.max(s, a), hi = Math.min(e, b);
    if (hi - lo > 0.04 && (!best || hi - lo > best[1] - best[0])) best = [lo, hi];
  }
  return best ? (best[0] + best[1]) / 2 : null;
}
