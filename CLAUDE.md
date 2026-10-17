# Videos

Explainer videos here are made with the studio production line. Read `_studio/STYLE.md` (house standard) and
`_studio/STUDIO.md` (CLI, workflow, tools) before doing anything, then start with `node _studio/bin/studio.mjs variety`.
Don't load the hyperframes workflow skills or dispatch frame sub-agents unless STUDIO.md says the studio can't handle the task.

House rules (user decisions, enforced by `studio build` — details in STYLE.md → House rules):
- **2D only** — no 3D (three.js/WebGL/Blender/3D assets). Objects and people come from the libraries (LottieFiles,
  IconScout, unDraw, Humaaans, Open Peeps), recoloured to the palette; cast people per video (no recurring character).
- **Full-canvas picture, plain captions on top** — art fills the whole 1080×1920 canvas; captions are plain text (no box)
  in the lower third; only readable text stays out of the caption band.
- **No sources on screen** — they go in `video.json → upload.sources` (the description).
- **No abrupt endings** — the last line is a complete sentence and the picture holds ≥ 1.2 s after it.
- **Pacing and sound** — something changes every ~2.5 s; music that changes at the turns, ambience/nat sound under every
  scene, 3–8 motivated SFX (Sonniss, levelled by role); `studio listen` before render (STUDIO.md → Sound).
- **Length** — 45–60 s by default; up to 3 min only if it stays entertaining, engaging and informative (a new turn or
  evidence every 20–30 s), agreed with the user at the script gate → `video.json → maxLength` (STYLE.md → Length).
- **Voice** — the user records every script in ElevenLabs (`studio script` → their MP3 → `studio split`); no TTS.
- **Tools** — only free tools that need no API key from the user (GSAP plugins, maps, `studio data`, unDraw are wired).
- **One video at the top level** — `studio new` moves every earlier video folder into `Produced Video/` (git-ignored,
  local only) before scaffolding the new one; `zz-*` scratch projects stay (STUDIO.md → Where videos live).
- **Long-form** (16:9 1920×1080, `studio new <slug> --format landscape`): same house rules, but chapters, length agreed
  at the script gate, no burned-in captions (`studio srt` → YouTube CC), one ElevenLabs MP3 per chapter
  (STYLE.md → Long-form, STUDIO.md → Long-form).
- Approval gates: script, people/asset picks (preview sheets), stills before the final render. Render only when asked.
