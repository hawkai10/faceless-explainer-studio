# Studio — faceless explainer video production line

A command-line production line for data-driven explainer videos: vertical Shorts (1080×1920, 45 s – 3 min) and
long-form chapters (1920×1080). You write the story, record the voice, pick the assets; the studio turns a
storyboard and per-frame specs into animated HTML compositions ([HyperFrames](https://github.com/heygen-com/hyperframes)
+ GSAP), aligns captions to the voice, mixes music / ambience / SFX against the voiceover, checks the result against a
house standard, and renders the MP4 with an upload kit.

> **Licence: personal and non-commercial use only** — [PolyForm Noncommercial 1.0.0](LICENSE).
> Using the studio for a monetised channel, client work or any other commercial purpose needs a separate licence
> from the author. See [Licence](#licence).

## Features

- **One CLI, end to end** — `studio new → script → split → build → snap → listen → render`, with approval gates
  (script, asset picks, stills) before the final render.
- **House standard enforced by the build** — 2D only, full-canvas pictures with plain captions on top, no on-screen
  sources, no abrupt endings, pacing and sound checks ([`_studio/STYLE.md`](_studio/STYLE.md)).
- **Real data and real imagery** — charts from public datasets (`studio data`), maps (Natural Earth / DataMeet),
  article capture, footage clips, background removal and upscaling — all free, no API keys.
- **Library assets, recoloured** — LottieFiles, IconScout (free tier), unDraw, Humaaans, Open Peeps and DiceBear,
  automatically recoloured to the palette.
- **Sound that belongs** — voice-levelled premix, ambience/nat sound under every scene, curated SFX, music that turns
  with the story; `studio listen` previews the mix before a render.
- **Human voice** — the studio writes a paste-ready ElevenLabs handoff (`studio script`) and cuts your single take into
  per-frame clips (`studio split`); local TTS is a fallback only.
- **Long-form mode** — 16:9 chapters, one voice take per chapter, `.srt` captions for YouTube CC.
- **Optional cloud render** — `studio render <slug> --modal` splits a render into chunks on [Modal](https://modal.com).

## Requirements

| | |
|---|---|
| Node.js | 20 or newer |
| Google Chrome | for rendering and page capture (set `CHROME_PATH` if it is not in the default Windows location) |
| ffmpeg / ffprobe | on `PATH` |
| Python 3.10+ | optional media tools (article extraction, background removal, WhisperX alignment, TTS fallback) |
| yt-dlp | optional, for footage clips |
| HyperFrames skills | installed in `~/.claude/skills` — the studio reads `hyperframes-creative/frame-presets` and `media-use/audio` |

Developed and used on Windows 11; macOS/Linux should work for the Node parts but are untested.

## Quick start

```bash
git clone <this repo> videos && cd videos
npm run setup                       # npm install in the studio's tool folders and the audio MCP server
cp .env.example .env                # optional — only needed for the TTS fallback
node _studio/bin/studio.mjs variety # house checks + what recent videos used
node _studio/bin/studio.mjs new my-first-video
```

Then follow the loop in [`_studio/STUDIO.md`](_studio/STUDIO.md) → *The loop*:

1. Fill `my-first-video/BRIEF.md` and write `STORYBOARD.md`.
2. `studio script my-first-video` → record the script → drop the MP3 in → `studio split my-first-video`.
3. Find and approve assets (`studio lottie search`, `studio undraw search`, `studio iconscout sheet`, …).
4. Write `spec/NN-*.json`, then `studio build` → `studio snap` → `studio listen`.
5. `studio render my-first-video` (or `--modal`).

`npm run studio -- <command>` is a shortcut for `node _studio/bin/studio.mjs <command>`.
Working with an AI coding agent? [`CLAUDE.md`](CLAUDE.md) is the entry point it reads first.

## Library assets (not included)

This repository ships **code, docs, fonts and openly licensed vendored data only**. Third-party media — Lottie
animations, IconScout illustrations, music and sound effects — is **not redistributed**, because most of those
licences forbid it. The ledgers in `_studio/assets/*/LICENSES.json` record what the original videos used and where each
file came from. Fetch your own with the studio commands:

| What | Command / source |
|---|---|
| Lottie animations | `studio lottie search <query>` → `studio lottie get …` |
| IconScout illustrations | IconScout MCP connector → `studio iconscout save …` |
| unDraw, Humaaans, Open Peeps, DiceBear | `studio undraw`, `studio humaaans`, `studio peeps`, `studio avatar` |
| Music / ambience / SFX | `studio sound …` (Sonniss GDC bundles, YouTube Audio Library, Openverse via `mcp-openverse-audio`) |

Each source's own terms apply to whatever you download.

## Repository layout

```
_studio/
  bin/studio.mjs      the CLI (commands in bin/lib/)
  kit/                runtime kit inlined into every composition (house.js, kit.js, kit.css)
  looks/              palettes / type presets
  templates/          caption skin
  tools/              helper packages (maps, colour, peeps, DiceBear, media, Modal render, Sonniss, alignment)
  vendor/             vendored open data: maps, Humaaans, Tabler icons, HyperFrames scripts
  fonts/              OFL webfonts
  STUDIO.md           CLI, workflow and tools reference
  STYLE.md            the house standard
mcp-openverse-audio/  local MCP server for Openverse audio (MIT, separate licence)
<slug>/               the video in progress (git-ignored; `studio new` moves older ones to Produced Video/)
```

## Configuration

| Variable | Used for |
|---|---|
| `OPENROUTER_API_KEY`, `OPENROUTER_TTS_MODEL` | TTS fallback only (`.env`) |
| `CHROME_PATH` | Chrome executable for article capture |
| `STUDIO_HF` | pin another HyperFrames version for one build, e.g. `hyperframes@0.8.141` |
| `STUDIO_YT_BROWSER` | browser to borrow cookies from for yt-dlp (or a one-line `_studio/.ytbrowser` file) |

`.env`, `.mcp.json`, `_studio/history.json` and every video folder are git-ignored. Templates:
[`.env.example`](.env.example), [`.mcp.example.json`](.mcp.example.json),
[`_studio/history.example.json`](_studio/history.example.json).

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md). Security issues: [SECURITY.md](SECURITY.md).

## Licence

Copyright (c) 2026 Arvind Kedia. Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE):

- ✅ Personal use, study, research, hobby projects, and use by non-commercial organisations (charities, schools,
  public research, government).
- ✅ Modifying it and sharing your changes, under the same licence and with the `Required Notice:` line kept.
- ❌ Any commercial use — including running a monetised channel or making videos for clients — without a separate
  licence. Open an issue or contact [@hawkai10](https://github.com/hawkai10) to ask about one.

`mcp-openverse-audio/` is a fork of an MIT-licensed project and stays under its own [MIT licence](mcp-openverse-audio/LICENSE).
Bundled fonts, maps and vendored libraries keep their own licences — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
