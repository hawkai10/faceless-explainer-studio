// Regenerates looks/*.json. Edit here, then: node looks/_generate.mjs
// A look = one complete design identity: palette, type, ground, emphasis style,
// motion family (+ camera: ambient moves alternated per frame — push|pull|drift|still), caption style, chrome. Fonts must exist in _studio/fonts.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const F = (family, file, weight, style = "normal") => ({ family, file, weight, style });

const looks = {
  ledger: {
    preset: "blue-professional",
    mood: "consulting-grade restraint: cream, one cobalt accent, research-note calm",
    colors: { bg: "#fdfae7", ink: "#111111", muted: "#6b6b6b", faint: "#9a9a9a", accent: "#1e2bfa", accentText: "#1e2bfa", onAccent: "#fdfae7", neg: "#dc2626", pos: "#059669", surface: "rgba(30,43,250,0.04)", line: "rgba(30,43,250,0.20)", ground: "rgba(30,43,250,0.06)" },
    faces: [F("Space Grotesk", "SpaceGrotesk-Variable.woff2", "300 700"), F("Inter", "Inter-Variable.woff2", "100 900")],
    stacks: { display: '"Space Grotesk", "Inter", sans-serif', body: '"Inter", sans-serif', mono: '"Space Grotesk", "Inter", sans-serif' },
    type: { displayWeight: 700, headWeight: 600, tracking: "-0.02em", case: "none", monoCase: "uppercase", monoTracking: "0.08em", heroScale: 1 },
    shape: { radius: 14, pill: 100, border: 1.5 }, ground: "grid", emph: "color",
    motion: { family: "rise", hero: "slam", camera: ["push", "drift"] }, captions: "card", chrome: "eyebrow",
  },
  forest: {
    preset: "editorial-forest",
    mood: "literary editorial on deep green: serif display, pink as the single voltage",
    colors: { bg: "#2e4a2a", ink: "#efe7d4", muted: "#c2baa6", faint: "#8f9a82", accent: "#e89cb1", accentText: "#f3b3c4", onAccent: "#243a21", neg: "#f2a38a", pos: "#b9d8a8", surface: "rgba(239,231,212,0.06)", line: "rgba(239,231,212,0.22)", ground: "rgba(239,231,212,0.07)" },
    faces: [F("Source Serif 4", "SourceSerif4-Variable.woff2", "200 900"), F("JetBrains Mono", "JetBrainsMono-Variable.woff2", "100 800"), F("IBM Plex Mono", "IBMPlexMono-Medium.woff2", "500"), F("Inter", "Inter-Variable.woff2", "100 900")],
    stacks: { display: '"Source Serif 4", serif', body: '"Inter", sans-serif', mono: '"JetBrains Mono", "IBM Plex Mono", monospace' },
    type: { displayWeight: 500, headWeight: 500, tracking: "-0.015em", case: "none", monoCase: "uppercase", monoTracking: "0.12em", heroScale: 1.05 },
    shape: { radius: 8, pill: 100, border: 2 }, ground: "rules", emph: "italic",
    motion: { family: "mask", hero: "mask", camera: ["drift", "push"] }, captions: "bar", chrome: "index",
  },
  biennale: {
    preset: "biennale-yellow",
    mood: "museum catalogue: parchment, indigo ink, solar-yellow underprint, big tight serif",
    colors: { bg: "#E9E5DB", ink: "#1B2566", muted: "#4a5283", faint: "#8a8fb0", accent: "#F1EE2E", accentText: "#1B2566", onAccent: "#1B2566", neg: "#b8452a", pos: "#1B2566", surface: "rgba(27,37,102,0.04)", line: "rgba(27,37,102,0.35)", ground: "rgba(241,238,46,0.55)" },
    faces: [F("Instrument Serif", "InstrumentSerif-Regular.woff2", "400"), F("Instrument Serif", "InstrumentSerif-Italic.woff2", "400", "italic"), F("Newsreader", "Newsreader-Variable.woff2", "200 800"), F("Archivo", "Archivo-Variable.woff2", "100 900"), F("JetBrains Mono", "JetBrainsMono-Variable.woff2", "100 800"), F("IBM Plex Mono", "IBMPlexMono-Regular.woff2", "400")],
    stacks: { display: '"Instrument Serif", "Newsreader", serif', body: '"Archivo", sans-serif', mono: '"JetBrains Mono", "IBM Plex Mono", monospace' },
    type: { displayWeight: 400, headWeight: 400, tracking: "-0.03em", case: "none", monoCase: "uppercase", monoTracking: "0.1em", heroScale: 1.25 },
    shape: { radius: 0, pill: 0, border: 1 }, ground: "bloom", emph: "marker",
    motion: { family: "blur", hero: "blur", camera: ["pull", "drift"] }, captions: "plain", chrome: "index",
  },
  broadside: {
    preset: "broadside",
    mood: "protest poster: ink-black plane, massive lowercase type, fire-orange as the only voltage",
    colors: { bg: "#111111", ink: "#F0ECE5", muted: "#a8a49a", faint: "#6e6c64", accent: "#E85D26", accentText: "#F26A33", onAccent: "#111111", neg: "#E85D26", pos: "#F0ECE5", surface: "rgba(240,236,229,0.05)", line: "#3a3935", ground: "rgba(240,236,229,0.05)" },
    faces: [F("Barlow", "Barlow-Black.woff2", "900"), F("Barlow", "Barlow-ExtraBold.woff2", "800"), F("Barlow", "Barlow-Bold.woff2", "700"), F("Barlow", "Barlow-SemiBold.woff2", "600"), F("Barlow", "Barlow-Medium.woff2", "500"), F("IBM Plex Mono", "IBMPlexMono-Medium.woff2", "500"), F("IBM Plex Mono", "IBMPlexMono-SemiBold.woff2", "600"), F("Inter", "Inter-Variable.woff2", "100 900")],
    stacks: { display: '"Barlow", "Inter", sans-serif', body: '"Barlow", "Inter", sans-serif', mono: '"IBM Plex Mono", monospace' },
    type: { displayWeight: 900, headWeight: 800, tracking: "-0.035em", case: "lowercase", monoCase: "uppercase", monoTracking: "0.14em", heroScale: 1.2 },
    shape: { radius: 0, pill: 0, border: 1 }, ground: "plain", emph: "color",
    motion: { family: "slam", hero: "slam", camera: ["push", "pull"] }, captions: "solid", chrome: "index",
  },
  coral: {
    preset: "coral",
    mood: "bold magazine: cream, ink and coral surfaces meeting at hard edges, condensed caps",
    colors: { bg: "#F5F0E8", ink: "#1A1A1A", muted: "#5f5f5f", faint: "#9a9a9a", accent: "#E85D5D", accentText: "#C83F3F", onAccent: "#F5F0E8", neg: "#C83F3F", pos: "#1A1A1A", surface: "#E8E0D4", line: "#1A1A1A", ground: "rgba(232,93,93,0.9)" },
    faces: [F("Bebas Neue", "BebasNeue-Regular.woff2", "400"), F("Inter", "Inter-Variable.woff2", "100 900"), F("JetBrains Mono", "JetBrainsMono-Variable.woff2", "100 800")],
    stacks: { display: '"Bebas Neue", "Inter", sans-serif', body: '"Inter", sans-serif', mono: '"JetBrains Mono", "Inter", monospace' },
    type: { displayWeight: 400, headWeight: 400, tracking: "0.005em", case: "uppercase", monoCase: "uppercase", monoTracking: "0.12em", heroScale: 1.35 },
    shape: { radius: 0, pill: 0, border: 3 }, ground: "hatch", emph: "block",
    motion: { family: "slide", hero: "slide", camera: ["drift", "push"] }, captions: "solid", chrome: "bar",
  },
  riso: {
    preset: "cobalt-grid",
    mood: "two-colour risograph: paper, electric cobalt ink, graph grid, serif with italic emphasis",
    colors: { bg: "#F0EBDE", ink: "#1F2BE0", muted: "#4b55d8", faint: "#8d93e6", accent: "#1F2BE0", accentText: "#1F2BE0", onAccent: "#F0EBDE", neg: "#1F2BE0", pos: "#1F2BE0", surface: "rgba(31,43,224,0.05)", line: "rgba(31,43,224,0.45)", ground: "rgba(31,43,224,0.10)" },
    faces: [F("Newsreader", "Newsreader-Variable.woff2", "200 800"), F("Newsreader", "Newsreader-Italic-Variable.woff2", "200 800", "italic"), F("Hanken Grotesk", "HankenGrotesk-Variable.woff2", "100 900"), F("DM Mono", "DMMono-Regular.woff2", "400"), F("DM Mono", "DMMono-Medium.woff2", "500"), F("IBM Plex Mono", "IBMPlexMono-Regular.woff2", "400"), F("Inter", "Inter-Variable.woff2", "100 900")],
    stacks: { display: '"Newsreader", serif', body: '"Hanken Grotesk", "Inter", sans-serif', mono: '"DM Mono", "IBM Plex Mono", monospace' },
    type: { displayWeight: 400, headWeight: 400, tracking: "-0.02em", case: "none", monoCase: "uppercase", monoTracking: "0.1em", heroScale: 1.15 },
    shape: { radius: 0, pill: 100, border: 1.5 }, ground: "graph", emph: "italic",
    motion: { family: "type", hero: "type", camera: ["drift", "pull"] }, captions: "underline", chrome: "index",
  },
  orbit: {
    preset: "blue-professional", // nearest hyperframes frame preset (only seeds frame.md)
    mood: "illustrated night world (Kurzgesagt-inspired): deep navy, flat vivid shapes with soft glows, amber + teal, heavy geometric sans",
    colors: { bg: "#101A3D", ink: "#F7F3E8", muted: "#AEB8DC", faint: "#5F6C9E", accent: "#FFB627", accentText: "#FFC857", onAccent: "#101A3D", neg: "#FF6B6B", pos: "#4FD1B5", surface: "rgba(255,255,255,0.07)", line: "rgba(247,243,232,0.22)", ground: "rgba(255,255,255,0.05)" },
    faces: [F("Hanken Grotesk", "HankenGrotesk-Variable.woff2", "100 900"), F("Inter", "Inter-Variable.woff2", "100 900"), F("JetBrains Mono", "JetBrainsMono-Variable.woff2", "100 800")],
    stacks: { display: '"Hanken Grotesk", "Inter", sans-serif', body: '"Inter", sans-serif', mono: '"JetBrains Mono", monospace' },
    type: { displayWeight: 850, headWeight: 750, tracking: "-0.025em", case: "none", monoCase: "uppercase", monoTracking: "0.12em", heroScale: 1.1 },
    shape: { radius: 22, pill: 100, border: 2 }, ground: "plain", emph: "color",
    motion: { family: "rise", hero: "slam", camera: ["push", "drift"] }, captions: "card", chrome: "index",
  },
  // House identity since 2026-10-02 (see _studio/STYLE.md). "Studio" world = this palette; the "paper" world =
  // `surface: "invert"` (warm paper ground, graphite ink). Signal amber is the only accent.
  kredflow: {
    preset: "blue-professional",
    mood: "Kredflow house style: graphite studio + warm paper documents, one signal amber, Inter / Newsreader / JetBrains Mono",
    colors: { bg: "#0E1013", ink: "#ECE6DA", muted: "#A3A7AE", faint: "#5E636B", accent: "#F2A33A", accentText: "#F2A33A", onAccent: "#0E1013", neg: "#E5484D", pos: "#3DB9A4", surface: "rgba(236,230,218,0.05)", line: "rgba(236,230,218,0.18)", ground: "rgba(236,230,218,0.03)" },
    faces: [F("Inter", "Inter-Variable.woff2", "100 900"), F("Newsreader", "Newsreader-Variable.woff2", "200 800"), F("Newsreader", "Newsreader-Italic-Variable.woff2", "200 800", "italic"), F("JetBrains Mono", "JetBrainsMono-Variable.woff2", "100 800")],
    stacks: { display: '"Inter", sans-serif', body: '"Inter", sans-serif', mono: '"JetBrains Mono", monospace', serif: '"Newsreader", serif' },
    type: { displayWeight: 600, headWeight: 600, tracking: "-0.025em", case: "none", monoCase: "uppercase", monoTracking: "0.16em", heroScale: 1 },
    shape: { radius: 2, pill: 2, border: 1 }, ground: "plain", emph: "color",
    motion: { family: "fade", hero: "fade", camera: ["still"] }, captions: "plain", chrome: "index",
  },
};
for (const [id, l] of Object.entries(looks)) writeFileSync(join(HERE, id + ".json"), JSON.stringify({ id, ...l }, null, 2));
console.log("looks:", Object.keys(looks).join(", "));
