// Caption skin install + post-processing of captions.mjs output.
// One house style since 2026-10-02: "overlay" — plain text (no box/card/bar), layered on top of the
// full-canvas picture in the lower third. Legacy styles (card/bar/plain/solid/underline) map to it.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { STUDIO, chunkWords, legible } from "./common.mjs";
import { fontFaces } from "./frames.mjs";

export const CAPTION_STYLE = "overlay";
const LEGACY = ["card", "bar", "plain", "solid", "underline"];
// normalise video.json → captions.style; returns [style, notice?]
export function captionStyle(style) {
  if (!style || style === CAPTION_STYLE || style === "none") return [style || CAPTION_STYLE];
  if (LEGACY.includes(style)) return [CAPTION_STYLE, `captions.style "${style}" is retired (boxed captions) — using "overlay" (plain text over the picture). Set it in video.json to silence this.`];
  return [CAPTION_STYLE, `unknown captions.style "${style}" — using "overlay"`];
}

const decl = (o) => Object.entries(o).map(([k, v]) => `${k}: ${v};`).join(" ");

export function installCaptionSkin(dir, look) {
  const c = look.colors;
  // white text + the look's signal colour for emphasis, both over a dark outline/shadow → legible on dark and paper scenes
  const vars = {
    "--c-font": look.stacks.body, "--c-weight": 650, "--c-size": "50px", "--c-track": "-0.01em", "--c-case": "none", "--c-em-weight": 750,
    "--c-ink": "#FFFFFF", "--c-em": legible("#15171A", [c.accentText, c.accent, "#FFFFFF"], 3),
    "--c-stroke": "rgba(10,11,13,0.85)", "--c-stroke-w": "5px", "--c-shadow": "rgba(0,0,0,0.55)",
    "--c-dark-ink": "#15171A", "--c-dark-stroke": "rgba(255,252,245,0.9)", "--c-dark-em": legible("#ECE6DA", [c.neg, "#15171A"], 3),
  };
  let skin = readFileSync(join(STUDIO, "templates", "caption-skin.html"), "utf8");
  skin = skin.replace("/*__CAP_CSS__*/", `.caption-layer { ${decl(vars)} }`).replace("__CAP_CLASS__", "cs-" + CAPTION_STYLE);
  mkdirSync(join(dir, ".hyperframes"), { recursive: true });
  writeFileSync(join(dir, ".hyperframes", "caption-skin.html"), skin);
}

// Replace captions.mjs micro-groups with phrase chunks; inject emphasis words, per-frame caption
// overrides (spec → "captions": {"y", "tone"}) and the look's fonts.
export function postProcessCaptions(dir, look, video, frames = {}) {
  const groupsPath = join(dir, "caption_groups.json");
  const src = JSON.parse(readFileSync(groupsPath, "utf8"));
  const byFrame = new Map();
  for (const g of src.groups) {
    if (!byFrame.has(g.frame)) byFrame.set(g.frame, []);
    byFrame.get(g.frame).push(...g.words);
  }
  const out = [];
  for (const [frame, words] of [...byFrame.entries()].sort((a, b) => a[0] - b[0])) {
    for (const ch of chunkWords(words, video.captions || {})) out.push({ frame, words: ch });
  }
  const groups = out.map((g, gi) => {
    const next = out[gi + 1];
    let end = g.words[g.words.length - 1].end + 0.25;
    if (next) end = Math.min(end, next.words[0].start);
    return { id: `caption-group-${gi}`, frame: g.frame, start: +g.words[0].start.toFixed(3), end: +end.toFixed(3), text: g.words.map((w) => w.text).join(" "), words: g.words.map((w, wi) => ({ ...w, id: `caption-word-${gi}-${wi}` })) };
  });
  src.groups = groups;
  writeFileSync(groupsPath, JSON.stringify(src, null, 2));
  const htmlPath = join(dir, "compositions", "captions.html");
  let html = readFileSync(htmlPath, "utf8");
  html = html.replace(/var GROUPS = \[[\s\S]*?\];\n/, () => `var GROUPS = ${JSON.stringify(groups)};\n`);
  html = html.replace(/var EMPH = \[[^\]]*\];/, `var EMPH = ${JSON.stringify(video.captions?.emphasis || [])};`);
  html = html.replace(/var (FRAMES|SURF) = \{[^}]*\};/, `var FRAMES = ${JSON.stringify(frames)};`);
  html = html.replace(/\s*@font-face \{[^}]*\}/g, "");
  html = html.replace("<style data-brand-tokens>", "<style data-brand-tokens>\n" + fontFaces(look));
  writeFileSync(htmlPath, html);
  return groups;
}
