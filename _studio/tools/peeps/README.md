# peeps — illustrated figures for studio scenes

Figures are **Open Peeps** by Pablo Stanley (https://www.openpeeps.com/) — **CC0 1.0**: free for commercial use, no attribution needed.
Rendered with `react-peeps` 0.1.10 (MIT, https://github.com/CeamKrier/react-peeps) + React 17 (MIT).

`studio build` calls `render.cjs` automatically for every `peep` block (colours = the frame's surface palette) and caches
the SVGs in the project's `assets/peeps/`. Setup once: `npm install` in this folder (node_modules is git-ignored).
Part names: `node _studio/bin/studio.mjs peeps [filter]`.
