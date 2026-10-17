# Studio — faceless explainer production line

> **Read `_studio/STYLE.md` first (house standard since 2026-10-02).** It supersedes the looks/variety rotation,
> the recurring character (Meera is retired), the illustrated-scene and hand-drawn `world` guidance below, and the
> "check passed = done" mindset. This file still documents the CLI, voice, specs, audio and render mechanics.
>
> **House rules since 2026-10-02 (enforced by the build — see STYLE.md → House rules):** 2D only (no three.js/WebGL,
> no 3D assets) · library assets first · the picture fills the whole canvas and plain-text captions (no box) sit on top
> of it in the lower third · no sources/credits on screen (`upload.sources` → description) · no recurring character.

The one document to read before making a video. It replaces the hyperframes workflow skills
for this channel: **do not load `/faceless-explainer`, `/hyperframes` or their references** —
everything they taught is baked into the kit, the CLI and the rules below. (Load a skill only
for something the studio genuinely can't do, e.g. real footage or a website capture.)

Format: 9:16 1080×1920, 45–60 s by default, up to 3 min when the story earns it (STYLE.md → Length; `video.json → maxLength`), Shorts / Reels. Voice: **the user records every script in ElevenLabs (Sagar)** — `studio script` → their MP3 → `studio split` (local Parler / Fish / Kokoro TTS remain as fallbacks only). No paid services or API keys on our side.

**Long-form (16:9, added 2026-10-08 — first video `rice-water`):** `studio new <slug> --format landscape` scaffolds a
1920×1080 YouTube video (`video.json → format: "landscape"`, `maxLength` in seconds, `chapters: [{n, title}]`, captions
`none`). Everything else is the same production line; the differences:
- **Canvas:** `canvas(video)` in `bin/lib/common.mjs` (`FORMATS`) — stage box x 140–1780, y 110–970; frames get `CW`/`CH`
  globals (1920/1080) and `--cw/--ch/--sw` CSS vars, and `KW.shot/svg`, `world`, `flood`, `bars`, maps use them. Write
  world code against `CW`/`CH`, never 1080/1920.
- **Chapters:** every frame that starts a chapter carries `- chapter: N` in STORYBOARD.md (later frames inherit it).
  `studio status` shows the chapter column; `studio snap <slug> --chapter N` snaps only that chapter (two moments per frame).
- **Voice — one ElevenLabs take per chapter:** `studio script` writes one paste block per chapter →
  the user saves `assets/voice/eleven/chNN.mp3` (ch00 = cold open) → `studio split <slug>` matches each take against only
  its own chapter's frames (`--chapter N` re-splits one replaced take). A chapter's last frame can get a longer breath with
  `video.json → pads.{"NN": 1.5}`.
- **No burned-in captions:** `studio srt <slug>` (and `render`) writes `renders/<slug>.en.srt` from the aligned words
  (sentence ends from the script, ≤ 2 × 42 chars, ≤ 6 s) — upload it as YouTube CC. The build skips the caption-band check.
- **Upload kit:** the description gets YouTube chapter timestamps automatically (≥ 3 chapters, each ≥ 10 s, first at
  0:00 — the build warns otherwise); no `#Shorts`. The render's contact sheet samples 24 moments across the whole video.
- **Audits:** length against `maxLength` (no 3-minute cap); SFX floor of 3 **per chapter** (no upper limit since 2026-10-13); pacing / shot median /
  hook rules unchanged. `build` scales `check --samples` with the frame count (`--timeout ms` passes through).
- **Sound:** music cues per act/chapter (`video.json → music`), ambience, nat sound and SFX premixed against the voice
  (see Sound).
- **Chapter renders (2026-10-11, `bin/lib/chapters.mjs`):** `studio render <slug>` renders a long-form video **chapter by
  chapter** and stitches it; `--chapters 3,5` forces those chapters, `--force` re-renders all, `--whole` = the old
  single pass, `--modal` sends each chapter to Modal. How it stays seamless:
  - `build` snaps every chapter end to the 0.1 s grid (3 frames at 30 fps; exact in the assembler's ms durations) by
    stretching the chapter's last frame by < 0.1 s, so the chapter pieces add up to exactly the full timeline.
  - Each chapter renders from `index-chNN.html` (index.html with only its scenes, re-based to 0, no audio) → silent
    `renders/chapters/chNN.mp4`; its frame count must equal the chapter length × 30 or the render stops. A scene that
    crosses a chapter boundary is refused — **every chapter's first frame is a cut** (chapter cards are anyway).
  - Unchanged chapters are reused (fingerprint of the chapter index + frame HTML + referenced asset sizes/mtimes in
    `renders/chapters/manifest.json`).
  - Pictures concat by stream copy (same encoder settings, no re-encode); the **sound is never cut per chapter**: voice
    (through the chain) + the premixed soundtrack are summed once at full length and muxed over the stitched picture,
    so music crossfades, ambience and ducking run straight through the joins. Then the usual −14 LUFS / contact sheet.
- **Not yet:** a designed 1280×720 thumbnail frame. Smoke-test projects: `zz-landscape-test`, `zz-chapter-test`.

```
node videos/_studio/bin/studio.mjs <command> [slug]
  variety                       what to vary this time (read FIRST)
  looks                         the six design identities
  new <slug> [--look <id>]      move earlier videos into Produced Video/, then scaffold videos/<slug> (house look kredflow)
  script <slug>                 ElevenLabs handoff: checks the script, writes renders/ELEVENLABS.md (paste-ready + delivery notes)
  split <slug> [mp3]            cut the one ElevenLabs MP3 (assets/voice/eleven/full.mp3) into per-frame clips + wire voice_file
  audio <slug>                  SCRIPT.md from storyboard → TTS (Parler/OpenRouter/Kokoro) → Whisper timings → pauses → durations; prints words
  words <slug>                  re-print each frame's spoken words (for cues)
  build <slug>                  specs → frames → captions → assemble → transitions → lint + check
  data <slug> wb|fred|csv <id>  real data series → <slug>/data/<name>.json (DATA[name] in frames) + source → upload.sources
  undraw search <words…> | get  unDraw flat illustrations (free, no attribution) → preview sheet / save as an `art` asset
  listen <slug>                 audio-only mix (voice + soundtrack, as render plays it) → renders/listen.m4a + loudness + sound audit
  sound index|search|get|music  sound library: Sonniss GDC bundles (local + every year remotely) · YouTube Audio Library tracks (see Sound)
  snap <slug> [--at 1,2]        contact sheet (default: hook + each frame at 90%); --loop = the replay seam (start vs end)
  render <slug> [--modal]       MP4 → loudness −14 LUFS → contact sheet → production.json → history (--modal: cloud render, see Cloud render)
  status <slug>                 frame timing table
  icons <word> [word…]          search the vendored Tabler icon set (5,000+ line icons, MIT) for the `icon` block
  iconscout sheet|save …        preview sheet from IconScout identifiers / save a download_url into the library (see Asset libraries)
  article <url> [slug]          article text + date for research (trafilatura)          ┐
  snip <slug> <url> <n> "<p>"   real article screenshot, phrase lit (house rule 7)      │
  clip <slug> <url> --from --to real footage, the seconds that matter (yt-dlp)          │ Media & quality tools
  cutout <slug> <image>         subject cut out of a photo → transparent PNG (rembg)    │ (added 2026-10-08)
  upscale <slug> <image>        AI upscale for small photos (Upscayl / Real-ESRGAN)     │
  iconify search|get …          ~200k open icons → art block                            ┘
  peeps [filter]                list Open Peeps part names (bodies, faces, hair…) for `peep` blocks / video.json → cast
  lottie search "<words>"       LottieFiles search → numbered preview sheet (start · middle · late of each animation)
  lottie get <id|noto:<cp>> <n> download into _studio/assets/lottie/<n>.json + licence ledger + inspection (⚠ rasters/text/expressions)
  lottie info [name]            inspect library files (size, fps, length, palette, licence)
  lottie frames <name> [--hide] render the asset at 12–16 moments + auto-check the subject stays in frame → safe from/to ranges
  avatar <style> <seed> [k=v]   DiceBear avatar SVG (CC0 styles: notionists, lorelei, open-peeps, thumbs…)
  humaaans [filter] | fetch     list / vendor the Humaaans figures and parts
```

**Before designing:** read STYLE.md → *Review 2026-10-03* (what the first 9 videos got wrong, and unused tools) and
tick its pre-render checklist before asking for a render.

**Where videos live (user decision 2026-10-07):** the top level holds only the video in progress. `studio new <slug>`
first moves every earlier video folder, whole, into `videos/Produced Video/<slug>`, then scaffolds `videos/<slug>`.
It stops before moving anything if a name already exists in Produced Video, and says so if a folder is locked (stop the
preview server). `zz-*` scratch projects (lottie inspection, kit previews) stay at the top level and never trigger it.
`Produced Video/` is git-ignored: finished videos are kept on this machine only, not uploaded. Every command (`build`,
`status`, `render`, `variety`…) still finds a slug in either place, and `../_studio/…` paths in an older
video.json/spec still resolve after the move.

## The loop (what a video costs)

1. `studio variety` → see the last 3 videos (open their spec/ + contact sheets) and the house rules; pick this video's own
   central visual idea. Research the facts; pull real series with `studio data` (sources land in upload.sources).
2. `studio new <slug>` (moves the previous videos into Produced Video/ first; house look kredflow); fill `BRIEF.md` (5 lines) and write `STORYBOARD.md` (story + voiceover as
   spoken words, optional `- delivery:` notes). **Approval gate: script → user.**
3. Voice (ElevenLabs, see **Voice — ElevenLabs**): `studio script <slug>` → hand `renders/ELEVENLABS.md` to the user → they
   save one MP3 at `assets/voice/eleven/full.mp3` → `studio split <slug>` → `studio audio <slug>` (prints every frame's words).
   Find assets while waiting: `studio undraw search`, `studio lottie search`, IconScout (show preview sheets; the user picks
   people), define them once in `video.json → assets`.
4. Write `spec/NN-slug.json` for each frame (+ `spec/NN-slug.js` for the 1–2 bespoke frames).
5. `studio build <slug>` → must end `Check passed`. `studio snap <slug>` → look at the sheet once, fix, rebuild.
   With `ending: loop`, also `studio snap <slug> --loop` (frame 1's start next to the very end: the replay seam).
   Then `studio listen <slug>` and listen with the picture off (STYLE.md gate 6): words clear over the music, music changes at the turns, every scene has a place-sound, no noisy/late SFX.
6. Fill `video.json → upload` (see **Upload kit**) — render turns it into `renders/UPLOAD.md` + `renders/thumbnail.jpg`.
   `studio render <slug>` (add `--modal` to render in the cloud, ~2.5× faster — see **Cloud render**; rendering is user-gated: render when the user asked for a finished video, otherwise offer preview/render). Review `renders/contact-sheet.jpg`; spot-check 2–3 seams with ffmpeg frames if anything moved.
7. Deliver: MP4 path, duration, contact sheet, frame ids, `renders/UPLOAD.md` (and any ⚠ it printed).

Token discipline: never read the kit, looks or CLI source unless something breaks; never read
generated `compositions/*.html`; read `studio` output, the spec files you wrote, and images.
No sub-agents — specs are small enough to write directly.

## Cloud render — `studio render <slug> --modal` (added 2026-10-10)

Renders the MP4 on Modal (the user's account; **Starter plan = $30 free credit every month**, nothing billed so far) using
HyperFrames' own distributed mode: one container plans (compile + audio), `--chunks` containers (default 32, 4 cores /
4 GB) each render a slice of frames at once, one assembles; only the final MP4 comes back, then the usual loudness /
contact sheet / upload kit run locally. Ephemeral app with a 2 s idle window, so nothing keeps billing after the command.
Code: `_studio/tools/modal/render.py` (+ `hfdist.mjs`); direct use `modal run _studio/tools/modal/render.py --slug <slug>`.
- Measured on rupee-defence (127.6 s, 3828 frames): **2 min 49 s vs ~6.7 min on the laptop, ≈ $0.13**; every frame matches
  the local render (PSNR ≥ 31 dB, avg 34.6 — software vs Iris Xe rasterising), same frame count, duration and loudness.
  Fixed overhead ≈ 1.5 min (upload + plan + assemble), so it pays off on longer videos; a 15-min long-form ≈ $1.
- Linux capture shows the wrong scene on the very first frame only; `hfdist.mjs` copies captured frame 1 over frame 0 in
  chunk 0 before HyperFrames encodes it (lossless). Keep that if you upgrade HyperFrames, then re-check frame 0.
- Don't bother tuning the laptop: its default (low-memory profile, 1 worker, Iris Xe Chrome) beat 2–3 workers, `--gpu`,
  `standard` quality and `--experimental-fast-capture` (fails self-verify on Windows). One big Modal container
  (`--mode single`) is *slower* than the laptop (no GPU in the cloud) — only the chunked mode wins.
- Check spend: `modal billing summary` (metered vs billed). The image is cached; a changed `render.py` image section
  rebuilds once (~5 min).

## Voice — ElevenLabs (the user records every script; 2026-10-03)

1. Write `STORYBOARD.md` (voiceover as spoken words; optional `- delivery: warm, slower on the number` per frame).
2. `studio script <slug>` → `renders/ELEVENLABS.md`: one paste-ready block (a paragraph per frame) + a line table with
   delivery notes. It stops on a mid-sentence last line or a follow ask, and warns on digits/symbols (write them as
   spoken), initialisms, over-long beats and a total outside 130–150 words (or over the agreed `maxLength`; hard stop past 3 min).
3. The user generates it as ONE take and saves the MP3 to `<slug>/assets/voice/eleven/full.mp3`.
4. `studio split <slug>` → Whisper (medium.en) aligns the take to the script word by word (numbers by value), prints any
   line that differs, cuts `assets/voice/eleven/NN.wav` at the middle of each pause (clips keep the natural pacing),
   adds `- voice_file:` to each frame and sets `pads.default: 0`. Tested on petrol-gap's take: 8/8 lines, 0 errors.
5. `studio audio <slug>` → `studio build <slug>`. Whisper mishearings in captions → `captions.map`.

## Voice (TTS — fallback only)

**House voice (user-chosen 2026-09-28): Indic Parler-TTS speaker "Thoma", expressive.** `studio new` writes it:
`video.json → tts`: `{"provider": "parler", "model": "ai4bharat/indic-parler-tts", "voice": "Thoma", "seed": 7,
"description": "Thoma delivers an engaging, expressive narration at a moderate pace with a slightly low pitch. The recording is of very high quality, with very clear audio and no background noise."}`
Sample: `_studio/samples/voices/P-thoma-expressive.wav`. Use it for every video unless the user asks otherwise, and
don't reword `description` — it *is* the voice (Parler has no speaker ids; pace/pitch/tone come from that sentence).
Runs locally on CPU (~1 min per line, the model loads once per `studio audio` run) via `_studio/.venv-parler`
(`python -m venv` + `pip install git+https://github.com/huggingface/parler-tts.git soundfile`) and `bin/lib/parler.py`.
The model is gated: it needs the licence accepted on huggingface.co and a saved HF token (`hf auth login`); already
done on this machine, and the model is cached. Parler has no `speed` knob — adjust pace in the description only if the user asks.
**Takes + QA (automatic):** consecutive lines are voiced together as one continuous take (≤ `tts.chunkWords`, default 45
words — Parler degrades past ~30 s, so never one pass for the whole script), which keeps Thoma's tone steady and the
flow natural across lines; each take is Whisper-transcribed, matched word-by-word against the script (numbers match by
value: "five thousand" = "5,000"), then cut back into `raw/NN.wav`. A take that drops or garbles words is re-voiced with
a new seed (`tts.tries`, default 3); if all fail, `studio audio` stops and prints expected vs heard for the line —
reword it (shorter, plainer, numbers as spoken). Only if Whisper is mishearing a *correct* take, raise `tts.maxWer`
(default 0.2 per line). Takes cache as `raw/take-<hash>.wav/.json`; editing one line re-voices only its take.
Alternatives: `studio new --tts openrouter` (Fish Audio "ELITE" `d8a1340984ee4b63ad1ffae27a6a4339`, speed 0.95; key in
`videos/.env` as `OPENROUTER_API_KEY` — never print it; a pinned `voice` is mandatory or Fish picks a random speaker per
line) and `--tts kokoro` (uses `video.json → voice`, e.g. `am_michael`; projects without a `tts` block stay on Kokoro).
Unchanged lines are reused from `assets/voice/raw/NN.wav` (fingerprint `NN.json`, includes the voice settings), so
re-running `studio audio` after editing one line only re-voices that line.

## Upload kit

`video.json → upload` — write it yourself (the CLI never invents copy) once the script is final:
```json
"upload": { "title": "…", "description": "…", "sources": ["…"], "follow": "…", "hashtags": ["Shorts", "…"], "pinned": "…", "thumbAt": 0.05 }
```
- **title** ≤ 70 chars, front-load the hook's conflict or number in the first ~40 (that's what the feed shows); no clickbait
  the video doesn't pay off; ₹/lakh formatting as on screen.
- **description** 2–3 short lines: the payoff in one sentence + the practical move. No links unless the user gives them.
- **follow** one series-shaped line appended to the description ("Follow for one money story a week.")
  — the follow ask that used to be spoken now lives only here (and in the pinned comment if it fits).
  Render appends the required audio credits and the hashtags.
- **hashtags** 3–5, always `Shorts`, then topic tags (`SaaS`, `cashflow`, `IndianStartups`…).
- **sources** (array) every source behind the video's claims, one line each (publication/dataset, what it backs, date).
  Render prints them as a "Sources:" block in the description and warns when empty. **Sources never go on screen.**
- **pinned** one question that invites a reply from the audience (founders/CFOs), tied to the video's decision.
- **thumbAt** seconds into the video for `renders/thumbnail.jpg` — the frame where the hook reads best (default 0.05).
- **descriptionSources / descriptionCredits** (long-form, added 2026-10-14) YouTube caps the description at **5,000
  chars** (render warns above it). When the full `sources` list + ledger credits won't fit (rice-water: 165 lines,
  ~28k chars), write condensed arrays: sources grouped by topic (publisher + date, no URLs) and credits as one line each
  for music / footage channels / photo authors by licence. The description uses them; `sources` stays the full record.
`studio render` writes `renders/UPLOAD.md` (paste-ready) and warns on anything missing; fix the warnings and re-render
before delivering (or edit UPLOAD.md if the video is already final).

## Story & script rules

- Structure: hook (≤3 s, the conflict or number) → reframe/thesis by beat 2 → 3–5 body beats on one
  consistent stage → insight → one practical move → **ending** (below). Not the source text's order.
- 130–150 words for ~55 s (default). Longer only when agreed (STYLE.md → Length): ≈ 155 words per minute of `video.json → maxLength`. The voice speaks ~160–165 wpm; the CLI adds pauses (0.4 s/line; after the last line
  0.25 s for a loop, 1.0 s for a punchline) → ~150 wpm effective. Short sentences, one idea per clause, cues the frame can reveal on.
- Write numbers the way they should be *spoken* in `voiceover` ("twelve lakh", "one lakh a month").
  Captions automatically show "₹12 lakh" / "₹1 lakh" (a number before lakh/crore gets ₹).
  Other display fixes go in `video.json → captions.map` (`{"b two b": "B2B"}`).
- Indian formatting on screen: ₹12L, ₹1,00,000, ₹12 lakh, crore. Hypothetical examples, no real companies.
- Captions emphasis: `video.json → captions.emphasis` = 5–10 key words; ₹ values / numbers / % are automatic.
- **No spoken or on-screen follow ask** (user decision 2026-10-02, from the Shorts study: none of the 27 top Shorts
  ended on one; they ended on a loop, a punchline or a link). The series ask lives in `upload.follow` (description) and
  the pinned comment. `video.json → ending` picks the last beat (`studio new` alternates it; `studio variety` suggests one):
  - **No abrupt endings (user decision 2026-10-03, enforced).** The last line is a **complete sentence**, and the
    last frame **holds ≥ 1.2 s after the final word**: the picture settles (no new motion in the last 0.6 s) and the
    sound resolves (render fades the audio out over the last 0.8 s). `studio audio` stops on a mid-sentence last
    line and raises any `pads.last` below 1.2 s; `studio build` fails on either. (petrol-gap ended "…for the year
    when" with `pads.last: 0` and the user found the ending abrupt.)
  - **`loop`** — the last line is a complete sentence whose *meaning* leads back to the hook, and the last frame
    settles on frame 1's opening scene/prop/number, so a replay feels natural. Never cut the sentence off to force the
    loop. Write the ending first, then the hook that grows out of it. E.g. "…Don't let the default choose." → "Next
    week, your EMI might not change." End hold 1.2 s.
  - **`punchline`** — one short final sting (the insight as a twist); end hold 1.6 s.
  The `cta` block stays in the kit for other uses but never as a "follow" end card; build warns on a CTA last frame
  or a follow/subscribe line.

## STORYBOARD.md (lean)

```markdown
---
format: 1080x1920
duration: 55s
message: "the one sentence"
arc: concept-explainer
audience: "..."
mode: autonomous
music: none
---

## Frame 1 — The standoff
- voiceover: "Your customer wants to pay one lakh a month. You want twelve lakh today."
- duration: 5s
- transition_in: cut
- status: outline
- src: compositions/frames/01-standoff.html
- type: hook

One line: what this frame must make the viewer understand.
```
Transitions (registry names only): `cut` (frame 1 always) · `crossfade` · `blur-crossfade` ·
`push-slide LEFT|RIGHT|UP|DOWN` · `zoom-through` · `squeeze`. Use 2–3 per video.

## Sound (rebuilt 2026-10-10 — the old mix "sounded weird, like it doesn't belong")

Why the old sound failed: SFX were copied raw and multiplied by `volume: 0.35` while the files ranged from −70 to −10
LUFS; they were amateur Freesound/Openverse recordings (mixed mics, rooms, 11 kHz files); nothing shared a space (no
EQ, reverb or fades); one bed looped for the whole video; footage was silent. The engine (`bin/lib/sound.mjs`) now
**premixes everything except the voice into one soundtrack** (`assets/mix/soundtrack.mp3`, emitted as the bed; no SFX
lanes) and levels every element **against the measured narration (V, integrated LUFS)**:

| layer | where | level | notes |
|---|---|---|---|
| **music** | `video.json → "music": [{"file", "at", "from"?, "gain"?, "fade"?}]` | V−3 in gaps, V−8 under speech (user pick 2026-10-11: music clearly present) | cues at seconds, `"f12"`, `"f12+1.5"` or `"ch3"`; `"from"` = seconds into the track, or `"end"` to back-time it (the track's own ending lands on the cue's end — use it for the last cue); track→track crossfade `fade` s (default 1.5) centred on the cue; `{"file": null, "at": "f14-0.6", "fade": 0.4}` = silence until the next cue (the dip before a reveal); static gain (dynamics kept), −3 dB dip at 2.5 kHz where the voice lives. Legacy `bgm: {file, gap, under}` = one cue at 0 |
| **ambience** | spec → `"ambience": "<file>"` or `{"file", "gain"?, "from"?}` or `"none"` | V−16 in gaps, V−22 under speech | carries over to later frames until a frame changes it; 1 s crossfades; long-form build warns when nothing has a place-sound |
| **nat sound** | spec → `video: {…, "nat": true \| {"gain"}}` | V−10 in gaps, V−20 under speech | the clip's own audio (`studio clip` saves `assets/clip/<n>.nat.flac`); listen first — reporter VO or music in it → leave `nat` off, use an ambience |
| **SFX** | spec → `"sfx": [{"file", "at", "role"?, "gain"?, "dur"?}]` | loudest 400 ms at V + role offset: `hit` −3 · `whoosh` −8 · `riser` −8 · `foley` −9 · `ui` −12 | leading silence trimmed (lands on its cue), 4 ms in / ≤120 ms out fades, high/low-pass, one shared small-room reverb (generated IR, wet −16 dB; `sound.reverb`). Role from spec, else the ledger, else the file name. `gain` = dB on top. Legacy `volume` still read (0.35 = 0 dB) |
| **voice** | automatic | — | broadcast chain: low-cut 70 Hz, light de-ess, 2:1 compression → `assets/voice/mix/` (the assembler plays these). Words and pauses untouched. `video.json → sound.voiceChain: false` bypasses |

Ducking is a word-timed envelope (ramps 0.3 s before speech, recovers over 0.6 s; pauses < 0.9 s stay ducked — no
pumping). Per-layer overrides: `video.json → "sound": {"music": {"gap", "under"}, "ambience": {…}, "nat": {…}, "reverb": -16}`.
`studio listen` mixes exactly what render plays (voice mix + soundtrack). Build warns on: no music, a music cue that
loops or runs > 4 min unchanged (long-form), footage with no sound under it, SFX from the old Freesound kit.

**Sound design rules:** every sound comes from something on screen (footage, a prop, a cut) — ambience under every
scene so silence never sounds empty, nat sound under real footage, designed hits only at real turns, no cartoon sounds
(cash-register "ching", boings), 0.3–0.8 s of dropped music before a reveal. Music changes at the big turns
(long-form: a cue per act/chapter; YouTube Audio Library tracks).

### Library
- **Sonniss GDC bundles** (professional field recordings and designed SFX; royalty-free, commercial, no attribution;
  **no redistribution of raw files, no AI training** — https://sonniss.com/gdc-bundle-license/). Local only, git-ignored:
  `_studio/assets/audio/sonniss/` holds the unzipped current bundle (`gdc2026/…`, ~7 GB) plus `catalog.json`, a remote
  listing of **every yearly bundle** (2016–2026, built by `python -I _studio/tools/sonniss/sonniss.py catalog
  _studio/assets/audio/sonniss/catalog.json` — reads the zip directories over HTTP ranges, nothing big downloaded).
  - `studio sound index` — index the unzipped local bundle (re-run after unzipping more).
  - `studio sound search <words…> [--min s --max s --n 20 --local]` — local hits show length + loudness, `[remote gdcYYYY]`
    hits show size; names are descriptive ("rain on tin roof, heavy, ORTF stereo").
  - `studio sound get <#> <name> --role hit|whoosh|riser|foley|ui|ambience [--from s --to s]` — remote picks are pulled
    out of their zip first; writes a 48 kHz stereo FLAC (one-shots trimmed of leading silence, peak −1 dBFS) to
    `_studio/assets/audio/sfx|ambience/<name>.flac` + a ledger entry with its role. These FLACs are git-ignored too
    (licence) — `origin` in the ledger says where to fetch them again.
- **Music — YouTube Audio Library** (studio.youtube.com → Audio library; Content-ID-managed, YouTube-only licence, which
  fits — we only publish there). The user downloads the picked tracks; `studio sound music <file> <name> --title "…"
  --artist "…" [--mood …] [--attribution "…"]` files them as `music/yt-<name>.mp3` (git-ignored) with a ledger entry.
  Tracks marked "attribution required" get `--attribution` and the line lands in the description automatically.
- **Old kit** (Openverse/Freesound mp3s in `sfx/`, Kevin MacLeod / Scott Buckley beds in `music/`): kept so old projects
  rebuild; don't use them in new videos (build warns).
- **Credits:** `studio render` writes `renders/CREDITS.txt` from the ledger (`assets/audio/LICENSES.json`) and warns if any
  used file has no record (never publish then). Sonniss needs no credit; CC BY / attribution tracks are listed.

## Specs — `spec/NN-slug.json`

Canvas zones (2026-10-02): **the picture is the whole 1080×1920 canvas** — worlds, art, characters, charts and
backgrounds run edge to edge, under and below the captions. Block stage x 80–1000, y 200–1640. Captions are plain
text layered on top in the lower third (y ≈1270–1450). Keep-outs apply to **readable text only**: the caption band
(`studio build` runs `check --caption-zone` and lists any frame text under the captions) and the platform UI (bottom
~280 px, right rail x > 950 from y ~1000). Put faces above y ≈1250. Per-frame caption tweaks: `"captions": {"y": px,
"tone": "dark"}` in the frame spec.
Blocks stack top→bottom in a flex column (CSS does layout — never compute pixel positions for
normal blocks). Budget ≈ 900 px of height: a headline ~110–220, bars 340–380, meter ~130,
chips ~70, cards ~120 each, figure l ~200 / xl ~260; gaps 34.

Frame keys: `align` ("center") · `justify`
("start"|"end"|"between") · `surface` ("invert"|"accent") · `ground` (grid|graph|rules|dots|bloom|hatch|plain)
· `motion` (rise|slam|mask|blur|slide|type|fade — overrides the look) · `heroMotion` · `emph` (color|italic|marker|block|underline)
· `animateFirst` (true = let t≈0 elements animate in; default keeps them visible on frame 0 for the thumbnail) · `blocks` []
· `camera` (push|pull|drift|still — overrides the look's alternating ambient move) · `cameraAmt` (default 0.035 ≈ 3.5%)
· `frame: false` (turn off auto-framing) · `icons` [names] (extra icons a custom `.js` draws via `K.icon`).

**Automatic on every frame (kit):** *auto-framing* — the stage keeps only the blocks revealed so far centred and glides
as each new block lands (unrevealed blocks no longer leave the hook stranded at the top); off when `justify` is set.
*Ambient camera* — a slow push / pull / drift across the whole frame with a parallax ground, alternating per frame from
the look's list, so nothing sits dead still between reveals. Don't fight either with manual `mt` offsets or `justify`
unless the layout genuinely needs it.

**No slide chrome.** These are videos, not decks: no "03 — THE VENDOR" section rows, no "part 2 of 7"
counters, no slide titles. (The kit still supports `chrome: {label}` but it is off by default — don't use it.)

**Cues** — any key named `at` or ending in `At` (`subAt`, `outAt`, `strikeAt`…) takes seconds or words from this
frame's narration (a cue under any other key name is NOT resolved):
`"price"` first occurrence · `"price#2"` second · `"working capital"` phrase · `"month$"` end of word ·
`"price+0.3"` / `"-0.2"` offsets · `"start"`, `"end-1"`. Unknown word → build fails and lists the words.
Reveal on the word that names the thing; never dump everything at 0.

Text: `*emph*` → look's emphasis; `~~word~~` → strikable (strike cue on the line); `\n` → line break.
Money/multiples (₹12L, 3X, 40%) always keep case. `keepCase: true` on a block keeps its text as typed.

| block | props (all optional except the obvious) |
|---|---|
| `headline` | text, size h1\|h2\|h3\|h4, at (one or array per line), tone, motion |
| `label` | text, at, size(px), tone — small mono chrome |
| `text` | text, at, size, tone — body copy (sparingly) |
| `figure` | value, unit, unitAt, label, labelAt, size xl\|l\|m\|s \| px, tone (accent\|ink\|muted\|neg), count {from,to,prefix,suffix,decimals,group:"in"}, tag {text,at}, align |
| `bars` | n, labels[] \| labelPrefix, dir up\|down, height, max, barWidth, axisLabel {text,at,side}, at, series[{values[], at, tone, stagger, dur, ghostAt, lineAt, label{text,bar,px,tone,at,count}}] |
| `meter` | label, steps[{at,value,dur}], suffix, prefix |
| `chips` | items[{text,at,tone,icon}], align |
| `cards` | items[{title,sub,at,icon,iconTone,rows[{text,at,tone,px}]}], numbered, focusLast, titlePx, gap |
| `lines` | items[{text,at,strike,size,tone}], align, size, gap — statements, optional strike |
| `hero` | text, at, px, tone, ring (true\|radius), glow |
| `equation` | parts[{text,at,tone}], size, align |
| `compare` | left/right {label,value,sub,at,tone,px,count} — two columns with a divider |
| `tally` | n, text, at, stagger, strikeAt, label, labelAt, width, height — fanned stack of slips |
| `steps` | items[{title,sub,at}] — vertical timeline with a drawing rail |
| `quote` | text, at, by, byAt, size |
| `icon` | name, px (260), tone, at, stroke (1.6), draw (true = strokes draw on), dur, label, labelAt, align — one big line-art prop; or items[{name,label,at,tone}], px (150), gap — a row of icon+label. Names: `studio icons <word>` |
| `tag` | text, at, tone — single pill |
| `cta` | text, sub, at, subAt, rings, align |
| `flood` | text, sub, subAt, label, at, outAt, tone accent|ink|paper, from bottom|left|top, px, align, motion — **pattern interrupt**: full-bleed colour takeover with one big statement, wipes away at `outAt` |
| `rule` / `spacer` | at / h, grow |
| `group` | children[], gap, alignItems, justify — side-by-side row |
| `scene` | w (920), h (980), children[] — a fixed box; children are placed with `x`/`y` (px from its top-left). See **Illustrated scenes** |
| `peep` | figure (cast name) or body/hair/facialHair/accessory, face, px (330 wide), mirror, tone (accent = accent strokes), at, from left\|right\|up\|fade, bob (true), bobAmp (7), bobDelay, lean[{at,deg}], hop[{at}], faces[{face,at}] — hand-drawn Open Peeps figure |
| `invoice` | w (400), h, title, no, rows[[l,r,"muted"?]], total[l,r], add{text,at,strikeAt,px}, joltAt, tilt (−2), at — paper document; `add` is a handwritten line that writes on |
| `stamp` | text ("NO."), w (180), h (102), rotate (−8), color bg\|ink\|accent (bg = on a paper document), at — slams in; SVG so it may overlap a document |
| `lottie` | src (library name), w, h, at, speed, loop, from/to (frames), recolor {"#src":"#dst"}, hide [layer name\|ind], enter (fade\|pop\|false), showAt — a downloaded Lottie that **starts on its cue** (see Asset libraries) |
| `avatar` | figure (video.json → cast.<n>.dicebear {style, seed, options}) or style+seed, options, px, faces[{at, options}], hop[{at}], from, mirror — DiceBear character, consistent by seed |
| `art` | name (library SVG from `studio iconscout save`), px, recolor {"#src":"#dst"\|"none"}, at, from, mirror, bob — static illustration (IconScout) |
| `humaaan` | name (`studio humaaans`), px, recolor {"#src":"#dst"}, at, from, mirror, bob — Humaaans figure |
| `map` | region "india"\|"world"\|[[lonW,latS],[lonE,latN]], w, h, style studio\|paper, projection, highlight {name\|id: colour}, india "accent"\|"plain", pins [{lon,lat,label,at}], routes [{from,to,at,dur,dashed}], at — see **Tools** |
| `custom` | fn (+ any props you want) — see below |

**Asset presets** — define a cast member or prop once in `video.json → "assets"` and use it anywhere in a spec as
`{"use": "name"}` with any overrides: `"assets": {"meera": {"type": "art", "name": "is-meera-pump", "recolor": {…}}}` →
`"meera": {"use": "meera", "bob": false}`. A preset may `use` another (pose variants); recolour maps merge. petrol-gap uses
`meera` and `meera-balance`.

Every block also takes `mt` (margin-top px), `self` (align-self), `width`, `full`, `x`/`y` (absolute, rare), `keepCase`.

## Recurring character — Meera (RETIRED 2026-10-02 — kept for history)

> Superseded: there is no recurring character. `cast.json` marks Meera `retired`, so the build no longer locks or
> requires her. A video casts its own people per video from the 2D libraries (`video.json → cast`, or `art`/`lottie`
> blocks declared in `world`). `petrol-gap` (whose script names her) shows Meera as an IconScout illustration.

Kredflow has one recurring character, like Kurzgesagt's birds: **Meera**, a full-colour DiceBear `toon-head`
(warm brown skin, dark top bun, mustard turtleneck), defined once in `_studio/cast.json`. Reference sheet:
`_studio/samples/meera.png`. (The user rejected the two-colour Open Peeps version as "ugly"; she is not a `peep`.)
```json
{"type": "avatar", "figure": "meera", "px": 420, "face": "smile",
 "faces": [{"at": "letter-0.1", "face": "worried"}, {"at": "choose", "face": "delighted"}], "hop": [{"at": "choose"}]}
```
- **Expressions** (`face` / `faces[].face`): smile, delighted, wink, calm, worried, sad, surprised, angry. Swap ~0.1 s
  before the word so the face lands with it.
- **Fixed:** style, seed, hair, skin — `studio build` refuses overrides. **May change:** `options.clothes` /
  `options.clothesColor` (an outfit for the role), plus `px`, `from`, `mirror`, `hop`, position. Credit (CC BY 4.0) is
  added to the description automatically.
- **She is the person in the story** whenever there is one: the borrower, the founder, the shopper. Name her in the
  voiceover ("Meera has a fifty lakh home loan…"); she's hypothetical, so the no-real-companies rule still holds.
  Other people (a banker, a customer) stay one-off figures. Why: the Shorts study's best finance format is "one person,
  one amount, one twist", and a recognisable face carries a channel across videos that otherwise look different.
- She's head-and-shoulders, so **props do the acting** around her (phone, bank letter, notes, a stamp) — same rule as
  Illustrated scenes. Vary her scale (small in a world vs a big close-up), where she sits, and what she holds/reacts to.
  One to three appearances per video is typical.
- She is the one *intended* repeat across videos; the variety rules apply to everything around her — don't restage her
  previous scene. Her dark hair can melt into near-black grounds: on a very dark surface give her a lighter disc/glow
  behind the head.
- `studio variety` shows how often she appeared recently; render records her in `history.json → characters`; build
  warns when a person appears and it isn't her.

## Illustrated scenes (user favourite — use them)

The user loved the first illustrated scene (`upi-mdr-anim-sample` frame 05: seller writes "+ UPI fee ₹200" on the
buyer's invoice, the buyer reacts, a NO. stamp slams). Aim for **1–3 per video** wherever people or a transaction are
in the story: buyer/seller, founder/CFO, customer/vendor, a team, a bank. Style = *mostly-still characters, the props
do the acting*: figures only enter, breathe, lean, hop and swap faces; documents, stamps, phones, notes, tags move.
Never attempt walking/limb animation — it reads cheap.

- **Cast:** Meera (above, an `avatar`) is the main person; peeps are for one-off figures, defined in
  `video.json → "cast": {"seller": {"body": "Explaining", "hair": "Medium", "face": "Cheeky"}, "buyer": {...}}`,
  then `{"type": "peep", "figure": "seller", ...}`. Part names: `studio peeps [filter]` (bust bodies such as Device,
  Paper, Explaining, Coffee, PointingUp, ArmsCrossed read best at video scale; standing BW/WB bodies for full figures).
  Good reaction faces: Smile, Cheeky, Calm → ConcernedFear, Concerned, Awe, Hectic, SmileBig, Driven.
- **Colour is automatic:** `studio build` renders each figure/face once per frame palette (stroke = ink, fill = bg) into
  `assets/peeps/` via `_studio/tools/peeps` (Open Peeps CC0 + react-peeps MIT; run `npm install` there once on a new machine).
  Works on any look and surface — an `invert` surface gives the riso-negative look the user liked.
- **Frame keys for scenes:** `"frame": false, "camera": "still", "animateFirst": true` — auto-framing and the ambient
  camera push make props collide with heads for the first second.
- **Similarity check (user feedback 2026-09-30).** `upi-mdr-who-really-pays` and `gst-before-you-get-paid` both
  used "two people at opposite ends of a bill + a stamp", and the user saw them as the same video. Nothing is banned:
  the same cast, a prop or even a staging may come back when the story genuinely calls for it. What must not happen is
  reaching for an earlier composition by default, or a video that reads as a repeat overall. Before writing specs, read
  the last 2–3 videos' `spec/` files and note their scene compositions, props and signature moments; design this
  video from its own plot first, then compare. Where something overlaps, keep it only if the topic needs it, and make
  it visibly different (one figure vs a crowd, close-up vs wide, where the prop sits, what moves). Check the move and
  CTA frames too. The layout below is a record of what fits the box, **not a template**.
- **Layout (scene 920×980, proven):** headline h3 at y 0 · document x 260 y 84 w 400 h ~446 · figures px 330 at
  y 540, x −20 (left) and x 610 mirrored (right) · stamp inside the document's blank footer (x ~448 y ~414) · a verdict
  `tag` at y ~556 between the heads. Keep documents **clear of heads** (the busts' heads sit in the top 35% of the
  figure box) and never put a stamp over readable numbers — give the document an empty footer for it.
- **Timing:** figure entrances at 0.1/0.2, document at 0.25; the action on the words (`add`, `No`); reaction faces
  and hops ~0.1 s *before* the word so the face lands with it; stamps get a stamp SFX (+ a quiet impact).
- Anything the blocks can't do (money flying between people, a price tag ticking, a phone screen) → a `custom`
  `.js` that still uses `peep`/`invoice` via `K.block(spec, parent)`; promote good props into the kit.
- **Check at 1 s, the key word, and the end** with `studio snap --at …`: nothing overlapping a face, no clipped text.

## Illustrated worlds, real footage, real audio (added 2026-10-01)

User feedback on `food-crisis-full-godowns` v1: typographic frames on an empty ground read as "a lot of text, very
little animation", with blank space above, below and beside the stage. The bar since then is **Kurzgesagt /
Veritasium**: every frame is a full-bleed illustrated scene (top to bottom, edge to edge, running behind the captions)
where several things move at once, with real photos/footage as evidence. Text is a few big labels, not sentences.

- **`world`** frame key: `"world": {"fn": "name", ...cues}` → `CUSTOM.name(tl, layer, K, props)` draws on a 1080×1920
  layer inside the camera, behind the stage (draw ~60 px past each edge as bleed for camera moves). Cue keys (`at`,
  `…At`) inside `world` resolve like any block. `K.layer("front")` = a full-canvas layer above the stage (overlays,
  lower-thirds, dims); `K.root`, `K.cam`, `K.host` are exposed too. `"blocks": []` is fine for a world-only frame.
- **`kit/house.js`** (studio-wide, 2D) is inlined into every frame before the project's `spec/_shared.js`: `KF.C`
  palette, `KF.text`, `KF.stamp`, `KF.brackets`, `KF.finish` (grain + vignette), `KF.place(K, layer, b.asset, {x, y, px, at})`
  (a library asset declared in `world`, so the build resolves/recolours it), `KF.bill` (the paper receipt model),
  `KW.shot/cut/studio/paper/svg/drawOn/sweep/scale/pts`. There is no 3D stage and no source-line helper.
- **`spec/_shared.js`** (per project) is inlined after it — put the video's scene library there (charts, models).
  `petrol-gap/spec/_shared.js` is the reference (`CH26` chart + Meera forecourt, `LB` bill-as-litre model).
- **`video`** frame key: `{"id", "src", "x", "y", "w", "h", "radius", "start"?, "dur"?}` places a muted, framework-owned
  `<video class="clip">` (src relative to the project, e.g. `assets/clip/x.mp4`) inside an untimed wrapper above the
  world. Animate the wrapper via `K.video(id)`, never the `<video>`. Pad the clip with a held last frame
  (`ffmpeg … -vf tpad=stop_mode=clone:stop_duration=1.5`) so it never runs out before the transition.
- **`voice_file`** storyboard bullet: `- voice_file: assets/clip/x.wav` makes `studio audio` use that real audio
  (an interview line) instead of TTS for the frame; it is still Whisper-timed for captions, cues and music ducking. Keep
  `voiceover` = the words actually spoken (captions take their text from it).
- **Real footage of public figures** (news clips): keep it to the few seconds that carry the quote, crop/punch-in, credit
  the source in the description only (never on screen); the user accepts the Content-ID risk per video.
- **Photos & footage**: any source — whatever suits the shot best (user decision 2026-10-08: no licence requirement for
  images or video; the user accepts the copyright/Content-ID risk). Record each in the project's `PHOTO-CREDITS.md` and
  `upload.sources` (description only). NASA imagery (Wikimedia "Public domain") is great for maps/satellite views.
- Look **`orbit`** (dark navy, amber/teal, Hanken Grotesk) was made for this style.

## Asset libraries (added 2026-10-01) — use these before drawing anything by hand

User direction: don't hand-animate cars, people, ships, mail, etc. Reach for a library asset first; draw only the
glue (layout, backgrounds, data, the one bespoke idea). Evaluation of the libraries the user proposed:

| library | verdict | licence | how it's wired |
|---|---|---|---|
| **LottieFiles** | **primary source** for animated objects, characters, icons, scenes | Lottie Simple License: free, commercial, no attribution (don't redistribute the raw files) | `studio lottie search/get` (public GraphQL API + CDN), `lottie` block / `K.lottie()` |
| **Noto animated emoji** (Google) | ❌ **don't use** — the user finds them low-effort and bad-looking (2026-10-01) | CC BY 4.0 | `lottie get noto:…` still works but warns; use LottieFiles / IconScout animations or Open Peeps instead |
| **DiceBear** | recurring characters/narrators that stay identical across videos (same seed) | per style: CC0 (notionists, lorelei, open-peeps, thumbs…) or CC BY 4.0 (micah, personas, adventurer… credit auto-added) | `tools/dicebear` (local npm, offline), `avatar` block, `studio avatar` |
| **Humaaans** | full-body people in poses (32 figures + heads/bodies/legs parts), recolourable | CC0 per humaaans.com (mirror says CC BY 4.0 → credited) | vendored `vendor/humaaans`, `humaaan` block |
| **Lordicon** | small animated UI icons — **not wired** | free tier = attribution required, licence text mixes "commercial OK" with "NoDerivatives"; PRO removes attribution | possible later via their Lottie JSON if the user buys PRO or accepts attribution |
| **IconScout** | **wired (MCP connector)** — best free source of *Indian* characters/scenes (IconScout Store packs: sabzi stalls, saree shoppers, vendors) + flat icons; its free Lottie stock is thin | free assets: commercial, mostly no attribution (check `attribution_required` per asset → `--attribution`); user approved free-only downloads (each uses their quota) | MCP `search_assets` → `studio iconscout sheet <identifier…>` (preview sheet) → MCP `download_asset` → `studio iconscout save <slug> <name> "<url>" --creator X --title Y` → `art` block (svg) or `lottie` block (json). Search with `asset: illustration | lottie | icon` only — `save` refuses 3D assets. Strip the pale background blob with `recolor: {"#edf1fc": "none"}` |

**Rules from user feedback (2026-10-01) — non-negotiable:**
1. **Check an animation's own timeline before adding motion to it.** Many library files have an intro/outro (the
   subject appears, drives off, fades, pops out). Looping or moving such a file makes the subject vanish mid-scene
   (the v3 godown truck drove off-frame halfway across the road). Before using any asset that loops, moves, or plays
   its whole timeline: `studio lottie frames <name> [--hide …]` → look at the sheet + read its verdict; if it flags
   frames, play only a safe range (`from`/`to`), or freeze a good pose (`from: f, to: f+1`) and let our motion do
   the travelling. `studio build` warns about every whole-timeline lottie that is unsafe or never inspected — clear
   those warnings before rendering. After building, snap the moments where moved assets cross the frame.
2. **No Google Noto emoji.** Use proper illustrated animations (LottieFiles, IconScout) and, for people, IconScout
   characters or Open Peeps (`peep` blocks / `studio peeps`).

**Workflow (per video):** plan each scene's *actors* (things that move: vehicles, people, money, weather, arrows,
reactions) → `studio lottie search "<thing>"` → read the preview sheet image → `studio lottie get <id> <name>`
(check its ⚠ lines: raster images = soft + not recolourable; text layers; expressions; >400 KB) → use it.
- **Style consistency is the whole game.** Library assets come from many artists: per video pick one family (flat or
  outline — never mix, never 3D), prefer several assets from the **same creator** (search results show the creator), and
  **recolour** every asset into the look's palette with `recolor` (`studio lottie info <name>` prints its colours).
- **Timing:** a `lottie` starts on its `at` cue (one-shot holds its last frame; `loop: true` cycles to the frame end);
  `from`/`to` play a segment, `speed` retimes. Implementation note: HyperFrames' own lottie adapter auto-discovers
  every lottie-web instance and seeks it to frame time — the kit neutralises that (private seek + one whole-frame
  driver tween), so never call `anim.goToAndStop` yourself; never animate the lottie container to scale 0 (it stops
  drawing) — entrances go on the block wrapper (`enter: "pop"` does this).
- **In world/custom code:** list the asset in the frame spec (`"lotties": [{"src": "van-red", "as": "van-teal", "recolor": {…}}]`)
  then `var r = K.lottie(parent, {key: "van-teal", w: 420, at: 1.2, loop: true})` → place/move `r.box`'s parent.
- **Credits are automatic:** build writes `assets/visual-credits.json`; render puts required lines (Noto, CC BY
  avatar styles, Humaaans) into `renders/CREDITS.txt` and the upload description. Every Lottie must have a ledger
  entry (`_studio/assets/lottie/LICENSES.json`, written by `lottie get`) or the build fails.
- Library: `_studio/assets/lottie/` (shared across videos — reuse before downloading again; `studio lottie info`).
  Actors in world scenes: declare them as blocks in `world.cast` ({id: {type, src|name, x, y, w|px, at, enter, loop, mirror, hide, from, to, layer: "front"?}}) and place them with `KZ.cast(K, layer, b.cast)` / `KZ.castFront` (see food-crisis-full-godowns v3). Noto files are 1024² at 60 fps; some only show their subject after an intro (seedling grows from a seed — use `from`), some end empty (`to`), and 👀 1f440 renders without pupils in lottie-web (avoid).
  Reference project: `zz-assets-demo` (lottie loop + recolour + cue-started Noto emoji + avatar face swap + humaaan).

## Tools (added 2026-10-03 — all free, no API keys)

- **GSAP plugins** (MorphSVG, DrawSVG, SplitText, MotionPath — free for commercial use since 2025) load with every
  frame and are registered by `kit/house.js`. Helpers (seek-safe): `KW.morph(tl, path, toD, t, dur)` shape → shape ·
  `KW.split(tl, el, t, {by: "words"|"chars"})` word/char reveal · `KW.along(tl, el, path, t, dur, {rotate})` move along a
  curve · `KW.drawSVG(tl, el, t, dur)` stroke draw-on for any SVG shape. Plain GSAP `morphSVG`/`drawSVG` props work too.
- **Maps** — `map` block or `KM.draw(K, host, {...})` (set `"maps": true` in the spec when only custom code draws one).
  World = Natural Earth 110m (public domain); **India is always drawn from DataMeet's official outline (CC0) — all of
  J&K, Ladakh and Aksai Chin** — never from the world file alone (vendor/maps/README.md). Returns `project([lon, lat])`
  for placing your own marks. Studio and paper styles; pins and routes (with a mover dot) appear on cues.
- **Real data** — `studio data <slug> wb FP.CPI.TOTL.ZG --country IND --from 2010` (World Bank) ·
  `studio data <slug> fred DCOILBRENTEU --from 2024-01-01 --freq Monthly --agg avg --name brent` (FRED, keyless CSV) ·
  `studio data <slug> csv file.csv --date Date --value Value --source "RBI DBIE, …"` (RBI DBIE / MoSPI / PPAC downloads —
  those have no public API). Writes `data/<name>.json` (series [[date, value]]), and adds the source line to
  `upload.sources` automatically. Frames read `DATA[name].series`. EIA needs a key — not wired (user: no API keys).
- **unDraw** — `studio undraw search <words>` → numbered preview sheet; `studio undraw get <slug> <name>` → `art` block.
  One flat family with a single accent: use `"recolor": "house"` (accent → amber, skin → warm brown; add explicit pairs
  with `{"preset": "house", "#3f3d56": "#…"}`). Avoid scenes with "$" for Indian money stories (or cover with ₹).
  Free for commercial use, no attribution; don't redistribute the catalogue. Previews need `npm install` in
  `_studio/tools/svgraster` (resvg) once.
- Considered, not wired: Freesound / Pexels (need API keys), Rive (deterministic integration effort, mixed community
  quality), Storyset (attribution + caps), Remotion / Manim / Motion Canvas (duplicate renderers).
- Reference project: `zz-tools-demo` (map route, FRED chart with DrawSVG + MotionPath + MorphSVG, SplitText, unDraw).

## Media & quality tools (added 2026-10-08 — open source, free, no API keys)

Chosen after the rupee-defence review (repos checked for stars + recent activity). Images and video may come from any
source (user decision 2026-10-08); every one is still credited in the description — the commands below add the credit
lines to `upload.sources` and `PHOTO-CREDITS.md` themselves.

| command / feature | what it is for | under the hood |
|---|---|---|
| `studio article <url> [slug] [--chars n]` | research: clean article text + title, date, author; saves `capture/articles/<name>.json` with a slug. Falls back to headless Chrome for sites that block plain fetches (Business Standard) | trafilatura (6.9k ★) in `_studio/.venv-media` |
| `studio snip <slug> <url> <name> "<phrase\|alt>" [--extra px]` | house rule 7: cropped screenshot of the real article, key phrase lit amber → `assets/photos/art-<name>.png` (+ full page in `capture/articles/` to check) | puppeteer-core + Chrome, `tools/media/snip.cjs` |
| `studio clip <slug> <url> --from s --to s [--name n]` | real footage: just the seconds that carry the beat → `assets/clip/<n>.mp4` (muted, H.264, ≤1920 px, last frame held 1.5 s) + its own sound → `<n>.nat.flac`. Place with spec → `"video": {id, src, x, y, w, h, "nat": true}` (nat = mix the clip's sound, see Sound) and animate its wrapper via `K.video(id)`. Runs yt-dlp with `--js-runtimes node` (YouTube 403s without a JS runtime) and retries once | yt-dlp (196k ★) + ffmpeg |
| `studio cutout <slug> <image> [--name n] [--model m]` | cut a person/ship/object out of a photo → transparent PNG trimmed to the subject, for layered Fern/Bloomberg compositions (add a drop shadow + house grade) | rembg (25k ★) with BiRefNet-lite (first run downloads the model) |
| `studio upscale <slug> <image> [--model photo\|fidelity\|art] [--scale 2\|3\|4]` | small news photos (≈800 px) → full-frame sharpness; ~1 min per image on the Iris Xe | Upscayl's ncnn-vulkan Real-ESRGAN (`tools/upscayl`, models upscayl-standard / high-fidelity / digital-art) |
| `studio iconify search <words> [--prefix set]` · `iconify get <prefix:icon> <name>` | ~200k open icons in 150+ consistent families (filled, duotone, emoji-style) → `art` block; licence + credit recorded per set (credit auto-added when the set requires it) | api.iconify.design (keyless) |
| `recolor: "auto"` / `"auto-paper"` (or `{"preset": "auto", "strip": true, "#src": "#dst"}`) on any `art`/`lottie` | maps every colour to the house palette by family — skin → warm browns, neutrals → a slate ramp that stays readable on graphite (or paper), blues/purples/yellows → amber, reds → red, greens → teal; `strip` drops flat near-white backgrounds. Explicit pairs override. Replaces most hand-written maps | chroma.js (10.6k ★) in `tools/color` |
| `KP.chart(K, host, {x, y, w, h, marks: (Plot) => [...], xAxis, yAxis, grid})` + `KP.reveal(tl, svg, t)` + `KP.date(iso)` | house-style charts in a few lines (lines draw on, bars grow, dots pop on the cue). Loads when the code calls `KP.*` or spec has `"plot": true`. Defaults: 5 x-ticks, 6 y-ticks, 28 px mono labels | Observable Plot 0.6.17 (5.4k ★) on d3 7.9 |
| `"maps": {"detail": "50m", "region": [[W,S],[E,N]]}` (or a `map` block with `detail: "50m"` + `region`) | zoomed regional maps with real coastlines (the Gulf, a state, a coast) — Natural Earth 1:50m clipped to the box at build time (~20–120 KB inlined), India from `india-detail.json` (official outline, ~6× finer). Cached in `vendor/maps/_cache` | mapshaper (4.2k ★) in `tools/maps` |
| `studio split` / `studio audio` alignment | the known script is force-aligned to the take: `split` cuts each line in the longest real silence between lines (no word tails spilling into the next clip); `audio` re-times every caption word — phantom words dropped, mis-heard words take the script's spelling, digits stay digits ("₹90"). `--no-align` skips it | WhisperX aligner (24k ★) in `_studio/.venv-align` |

Setup on a new machine (once): `python -m venv _studio/.venv-media && _studio/.venv-media/Scripts/python -m pip install trafilatura "rembg[cpu]"` ·
`python -m venv _studio/.venv-align && _studio/.venv-align/Scripts/python -m pip install whisperx` · `npm install` in
`_studio/tools/color` and `_studio/tools/maps` · `pip install -U yt-dlp` · Upscayl: unzip `upscayl-bin` (github.com/upscayl/upscayl-ncnn
releases) into `tools/upscayl/bin` and the `.param/.bin` models from upscayl/upscayl `resources/models` into `tools/upscayl/models`.
HyperFrames version: `STUDIO_HF=hyperframes@x.y.z` tries another version on one command (see Extending → upgrade deliberately).

## Bespoke frames — `spec/NN-slug.js`

At least one per video; this is where the video gets its own idea. Register a function:

```js
CUSTOM.balance = function (tl, w, K, b) { /* w = the block's box, b = its spec (cues resolved) */ };
```
`K`: `el(tag, cls, parent, html)` · `rich(text)` (use for any visible text — ₹ case, *emph*) · `icon(name, parent, {px,tone,at,stroke,draw})` (list names in spec `icons`) ·
`enter(node, t, kind, motion)` kind text|item|hero|chrome · `strike(node,t)` · `dim(nodes,t,to)` ·
`countUp(node,t,{from,to,prefix,suffix,dur})` · `drawPath(svgPath,len,t,dur)` · `svg(tag,attrs,parent)` ·
`block(spec, parent)` · `tl` · `look`. Colours only via CSS vars: `--bg --ink --muted --faint --accent
--accentText --onAccent --neg --pos --surface --line`; fonts `--fd --fb --fm`; scale `--ds`.
Rules: `fromTo` only, no exits, no `repeat`/`yoyo`, no random/Date, transforms/opacity/clip-path only
(never animate width/height/top/left), stay inside `w`, finish by the frame end. Optional
`spec/NN-slug.css` for extra styles (prefix every selector with a unique class).
When a bespoke frame is good and reusable, promote it into `kit/kit.js` as a block and add a row above.

## House checks (2026-10-03 — replaces the old variety rotation)

One house look, one caption style, no look/transition/surface rotation (STYLE.md). `studio build` prints:
- **pacing** — every frame start and every cued reveal counts as a change; any stretch > 2.5 s with nothing new is
  listed with its frame and time. Fix it with a reveal on a word, a camera beat or a cut (name a cue for every reveal
  so it is measurable; fixed-time tweens inside a shot don't count).
- **sound** — a music bed; ≥ 3 SFX on motion moments (no upper limit); ≤ 1 SFX per 1.5 s; each ≤ 1.2 s (risers excepted); never
  starting on a key word (emphasis words, numbers, ₹, %). `studio listen` prints the same audit with loudness.
- **craft** (review 2026-10-03, warnings) — shots = frame starts + `KW.cut(tl, el, b.<cue>)` in the frame's `.js`.
  Prints the shot count, median and longest shot. Warns when:
  - the median shot is > 3.5 s;
  - the hook's first cut comes after 4 s;
  - more than half the frames are `camera: "still"`;
  - the video runs over 60 s;
  - more than 3 distinct numbers are spoken (from the Whisper words).
- **music bed** — `video.json → bgm` empty → the build fails (petrol-gap shipped without one).
- **ending** — complete last sentence + ≥ 1.2 s hold (build fails), no new motion in the last 0.6 s, no follow CTA.
- **captions** — any readable frame text under the caption band; **guards** — 3D and on-screen source lines fail the build.

`studio variety` lists the last 3 videos (hook, ending, cast) and idea seeds. Uniqueness comes from each video's own
central visual idea: open the last 2–3 videos' `spec/` and contact sheets before designing, and reuse a model (the
bill, the chart) only when the topic needs it. Within the rules, invent — the kit is a floor, not a template.

## Quality bar (check before render)

- Scale: the hero element should read from arm's length on a phone — figures `l`/`xl`, charts ≥ 300 px tall, icons ≥ 200 px
  when they carry the idea. A frame that is mostly empty stage is a frame that needs a bigger idea, not more text.
- Icons: one visual language per video (Tabler outline only; never mix in emoji or other icon sets); use an icon when it
  *is* the metaphor (invoice, calendar, vault), not as decoration on every chip.
- Squint: one element dominates each frame; ≤ ~12 words of on-screen text per frame; never print the narration sentence (captions do that).
- Hook frame readable at t=0 (the kit keeps t≈0 elements visible — don't set `animateFirst` on frame 1).
- Every reveal lands on its word; the back half of each frame still develops; the last frame holds.
- Contrast: surfaces are auto-checked; if `check` flags contrast, change `tone`, don't fight the palette.
- `check` known noise: 1–4 px `text_box_overflow` on `#caption-word-*`; info-level overlaps during transitions.

## Extending

- New look: add it to `looks/_generate.mjs` (palette, faces, stacks, type, shape, ground, emph, motion, captions, chrome, preset), `node looks/_generate.mjs`. Fonts: OFL only; download to `fonts/` as subset woff2 (`pyftsubset … --flavor=woff2`, keep U+20B9 ₹). A display font without ₹ needs a fallback in its stack that has it.
- New block: add `B.name` in `kit/kit.js` (follow the existing ones), a table row here, and the name to `BLOCKS` in `bin/studio.mjs`.
- Images and video may come from any source (user decision 2026-10-08). Other vendored assets (fonts, icons, code, audio)
  keep the free-for-commercial-use rule (CC0, PD, MIT, OFL, CC BY with credit); match the house style and record the source
  + licence next to the files (see `vendor/tabler/README.md`).
  Icons: `vendor/tabler` (Tabler Icons outline, MIT) — to update, `npm pack @tabler/icons`, regenerate `outline.json` + `index.json`.
- **Remotion** was considered (2026-10-02) and not adopted: HyperFrames already renders HTML/GSAP/lottie-web
  deterministically, so it would duplicate the renderer; the 2D quality gap is assets, not the engine (and Remotion
  needs a paid company licence above three people).
- Pipeline scripts under `vendor/fe-scripts` are a frozen copy of the faceless-explainer skill scripts; HyperFrames is pinned to 0.8.141 (upgraded 2026-10-08 from 0.7.84 after rebuilding rupee-defence on both: frames ≥37 dB PSNR — visually identical — and the render 6.7 min vs ~9.5). Upgrade deliberately: `STUDIO_HF=hyperframes@x.y.z` on a copy, build + snap + render, compare, then bump `HF` in bin/lib/common.mjs.

## Lessons already paid for (don't relearn)

- Sub-composition CSS is scoped under the frame root at render: never style the root by class. The generator puts look vars inline on `#root`.
- Frames are inlined + minified to stay under the lint size limit; don't hand-edit generated HTML — edit spec/kit and rebuild.
- Font `src` must be `assets/fonts/…` (root-relative); `../../` fails lint.
- Whisper transcribes numbers as digits and lakh as "LAC"; captions take text from the script, timing from Whisper.
- Kokoro output is ~−21 LUFS, Fish ~−12 LUFS (Parler varies); render normalises everything to −14 LUFS / −1.5 dBTP.
- OpenRouter Fish TTS returns raw 16-bit PCM (`audio/pcm;rate=44100`); only `mp3`/`pcm` formats are accepted; an unknown `voice` id → HTTP 400.
- Shorts/Reels UI covers the bottom ~280 px and a right rail; captions sit at y ≈1270–1450 over the picture, which still fills the canvas.
- STORYBOARD.md frames need a `- duration:` line (any value) — `studio audio` only rewrites existing ones; without it assemble fails "no positive duration".
- Since 2026-10-08 real-audio frames are force-aligned (WhisperX): captions take the script's spelling for mis-heard words, phantom words are dropped, and cues may be written with the script's words (a one-letter spelling difference still matches). Digits still come from Whisper ("90", "$30"), so the notes below on numbers still apply.
- Cues and captions use the *Whisper* tokens, not the script: "zero point four" → `0.4%`, "fifty thousand" → `50,000`, misheard words ("suit charges"). Cue on plain words, and put caption fixes in `captions.map` keyed by the Whisper text (`studio audio` prints it).
- Parler mispronounces initialisms unpredictably ("EMI" came out "EY"/"EV"/"e-May" in 3 of 5 lines; RBI was fine). Write
  them as letters in `voiceover` ("E.M.I.") and add `captions.map: {"E.M.I.": "EMI"}` (a key ending in punctuation
  consumes it, so no stray "EMI." mid-sentence). Small-model Whisper also mishears correct takes ("arbor has" for "RBI
  is"): second-opinion a doubtful line with `npx hyperframes@0.8.141 transcribe <wav> -m medium.en --json` before re-voicing.
- QA number matching (`bin/lib/voicematch.mjs`) handles "four point eight" = 4.8, "seven hundred and seventy-five",
  "twenty twenty-three" = 2023, "a hundred" = 100 and Whisper's "$100" = "100 dollars" (added 2026-10-02).
- `peep` figures work inside `world.cast` too (build renders their faces); `K.block` places them by `x`/`y`. Don't add
  your own bob — the peep block already breathes.
- `figure` with `count` shows its `from` value (e.g. "0.0%") from the start of the frame, before its cue. Only use `count` when the figure should be on screen from t≈0; otherwise drop `count` and let the value slam in on its word.
