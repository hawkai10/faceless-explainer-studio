// Container-side driver for HyperFrames' distributed render (@hyperframes/producer/distributed, v1 plan protocol).
//   node hfdist.mjs plan <projectDir> <planDir> '<DistributedRenderConfig json>'
//   node hfdist.mjs chunk <planDir> <index> <out.mp4>
//   node hfdist.mjs assemble <planDir> <out.mp4> <chunk0.mp4> <chunk1.mp4> ...
// Prints one `RESULT {json}` line for render.py to parse.
import cp from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";

// On Linux BeginFrame capture the very first frame of a render shows the composition before the first seek lands
// (a later scene flashes for 1/30 s; frame 1 onward is right). For chunk 0, copy captured frame 1 over frame 0 just
// before HyperFrames' own encoder reads the frame files — no re-encode, the chunk still concat-copies cleanly.
const fixFirst = process.argv[2] === "chunk" && Number(process.argv[4]) === 0;
let fixed = null;
const origSpawn = cp.spawn;
cp.spawn = function (cmd, args, ...rest) {
  const pat = fixFirst && !fixed && /ffmpeg$/.test(String(cmd)) && Array.isArray(args) ? args.map(String).find((x) => /frame_%06d\.(jpg|png)$/.test(x)) : null;
  if (pat) {
    const [f0, f1] = [0, 1].map((n) => pat.replace("%06d", String(n).padStart(6, "0")));
    if (existsSync(f0) && existsSync(f1)) { copyFileSync(f1, f0); fixed = f0; }
  }
  return origSpawn.call(this, cmd, args, ...rest);
};
syncBuiltinESMExports();
const { plan, renderChunk, assemble, resolvePlanAudioPath } = await import("@hyperframes/producer/distributed");

const [mode, ...a] = process.argv.slice(2);
let r;
if (mode === "plan") {
  const p = await plan(a[0], JSON.parse(a[2]), a[1]);
  r = { chunkCount: p.chunkCount, totalFrames: p.totalFrames, planHash: p.planHash, producerVersion: p.producerVersion };
} else if (mode === "chunk") {
  const c = await renderChunk(a[0], Number(a[1]), a[2]);
  r = { framesEncoded: c.framesEncoded, durationMs: c.durationMs, captureMode: c.captureMode };
  if (fixFirst) { if (!fixed) throw new Error("chunk 0: captured frame files not found — frame 0 not fixed"); r.fixedFrame0 = fixed; }
} else if (mode === "assemble") {
  const [planDir, out, ...chunks] = a;
  const s = await assemble(planDir, chunks, resolvePlanAudioPath(planDir), out);
  r = { framesEncoded: s.framesEncoded, durationMs: s.durationMs, fileSize: s.fileSize };
} else {
  throw new Error(`unknown mode ${mode}`);
}
console.log("RESULT " + JSON.stringify(r));
process.exit(0);
