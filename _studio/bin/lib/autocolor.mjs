// recolor: "auto" — map every colour of a library asset onto the Kredflow palette automatically (added 2026-10-08).
// Library SVGs/Lotties arrive in their artists' colours; hand-written {"#src": "#dst"} maps took several rounds per video
// and still let dark clothes vanish on graphite (rupee-defence). This maps by perceptual family (OKLCH via chroma.js):
//   • skin tones → the house warm browns (light / dark)
//   • neutrals → a slate ramp that keeps the asset's own light/dark order but stays readable on the ground
//     ("auto" = graphite ground: darkest neutral lands at a visible slate; "auto-paper" = paper ground: lightest stays darker than paper)
//   • blues/purples (the usual "brand accent", e.g. unDraw #6c63ff) and yellows/oranges → amber; reds/pinks → red; greens/cyans → teal
//     — each in a light / mid / dark step chosen by the source lightness
// Options (object form): {"preset": "auto"|"auto-paper", "strip": true (near-white flat backgrounds → none), "#src": "#dst" overrides}.
import { createRequire } from "node:module";
import { join } from "node:path";
import { STUDIO } from "./common.mjs";

let chroma = null;
function C() {
  if (!chroma) {
    try { chroma = createRequire(join(STUDIO, "tools", "color", "package.json"))("chroma-js"); }
    catch { throw new Error('recolor "auto" needs chroma-js — run: npm install (in _studio/tools/color)'); }
  }
  return chroma;
}
const FAMILY = {
  amber: ["#F7C77E", "#F2A33A", "#C9822A"],
  red: ["#F08A8D", "#E5484D", "#B4472E"],
  teal: ["#A9DCD2", "#3DB9A4", "#2A8576"],
};
const SKIN = ["#d9a37e", "#c68a63", "#8d5a3b"];

export function hexesIn(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g)) out.add("#" + m[1].toLowerCase());
  return [...out];
}

// autoMap(colours[], {ground: "dark"|"paper", strip}) → {"#src": "#dst" | "none"}
export function autoMap(colours, o = {}) {
  const c = C(), paper = o.ground === "paper", map = {};
  const info = colours.map((h) => { const [L, ch, hue] = c(h).oklch(); return { h, L, ch: ch || 0, hue: isNaN(hue) ? 0 : hue }; });
  const neutrals = info.filter((x) => x.ch < 0.045 && !isSkin(x));
  const Ls = neutrals.map((x) => x.L), lo = Math.min(...Ls, 1), hi = Math.max(...Ls, 0);
  for (const x of info) {
    if (o.strip && x.ch < 0.02 && x.L > 0.94) { map[x.h] = "none"; continue; }
    if (isSkin(x)) { map[x.h] = x.L > 0.78 ? SKIN[0] : x.L > 0.6 ? SKIN[1] : SKIN[2]; continue; }
    if (x.ch < 0.045) {
      // keep the asset's own order, squeezed into a band that reads on the ground
      const t = hi - lo < 0.02 ? 0.5 : (x.L - lo) / (hi - lo);
      const [a, b] = paper ? [0.2, 0.72] : [0.46, 0.94];
      map[x.h] = c.oklch(a + (b - a) * t, 0.012, 255).hex();
      continue;
    }
    const fam = x.hue >= 200 && x.hue < 330 ? "amber" : x.hue >= 330 || x.hue < 40 ? "red" : x.hue < 115 ? "amber" : "teal";
    const step = x.L > 0.82 ? 0 : x.L > 0.55 ? 1 : 2;
    map[x.h] = FAMILY[fam][step];
  }
  return map;
}
function isSkin(x) { return x.hue >= 15 && x.hue <= 75 && x.ch >= 0.025 && x.ch <= 0.16 && x.L >= 0.45 && x.L <= 0.92; }

// recolor spec → {"#src": "#dst"} for this asset's colours. Returns null when the spec isn't an auto preset.
export function autoRecolor(spec, colours) {
  const preset = typeof spec === "string" ? spec : spec && spec.preset;
  if (preset !== "auto" && preset !== "auto-paper") return null;
  const over = typeof spec === "object" ? Object.fromEntries(Object.entries(spec).filter(([k]) => k.startsWith("#")).map(([k, v]) => [k.toLowerCase(), v])) : {};
  return { ...autoMap(colours, { ground: preset === "auto-paper" ? "paper" : "dark", strip: typeof spec === "object" && !!spec.strip }), ...over };
}

// replace whole hex tokens only ("#fff" must not eat the start of "#ffffff")
// one pass, so a colour that was just written is never mapped again
export function applySvgMap(svg, map) {
  const m = Object.fromEntries(Object.entries(map || {}).map(([k, v]) => [k.toLowerCase(), v]));
  if (!Object.keys(m).length) return svg;
  return svg.replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g, (x) => (x.toLowerCase() in m ? m[x.toLowerCase()] : x));
}
