# Kredflow style bible

The house standard for every Kredflow Short, decided 2026-10-02. It **supersedes** the following
sections of STUDIO.md: Looks and variety rotation, Recurring character (Meera is retired),
Illustrated scenes, and hand-drawn `world` scenes. STUDIO.md still documents the CLI, voice, specs and render.

**House rules (user decisions 2026-10-02, enforced by the build — not just guidance):**
1. **2D only.** No 3D rendering of any kind (three.js/WebGL, Blender, 3D-style library assets): a cheap 3D render
   always reads worse than a well-made one, and worse than good 2D. Aim at what we can do well. `studio build` fails
   on `"three": true` or any three.js/WebGL code; `studio iconscout save` refuses 3D assets.
2. **Library assets first.** Objects and people come from the libraries already wired in (LottieFiles, IconScout,
   Humaaans, Open Peeps, DiceBear), recoloured to the palette; we draw only the glue (charts, documents, layout).
3. **Full-canvas picture, captions on top.** The picture fills the whole 1080×1920 canvas, including under and below
   the captions. Captions are plain text (no box/card/bar) layered over the picture in the lower third (y ≈1270–1450).
   Only *readable text* keeps out of that band; `studio build` warns on any frame text under the captions.
   **One composition per shot (user decision 2026-10-08):** never lay a shot out as "above the captions" and "below
   the captions". petrol-eats-eggs put a graphic on graphite over an unrelated photo/Lottie strip at the bottom, and the
   two halves read as different things. A shot may hold several elements (a hero, an animation, a chart, labels), but
   they must belong to one picture: one shared background and light across the whole canvas, elements that overlap and
   sit at different depths, connected by motion or lines (a flow, a route, a thread), and each one complementing the
   others' point. No panels, hard horizontal splits, strips or unrelated filler rows. Captions go on last, floating
   over whatever is there.
4. **No sources on screen.** No source/credit/"via"/"illustrative" lines, mastheads or attributions in the video (except a real article screenshot, rule 7) —
   they go in `video.json → upload.sources`, which render prints in the description. `studio build` fails on them.
5. **No recurring character.** People are cast per video (Meera appears only in `petrol-gap`, whose script names her).
6. **No camera zoom (user decision 2026-10-04).** No push / pull / punch-in / Ken Burns on shots or on the whole frame —
   the user found it "very bad", and scaled close-ups cut parts of the frame off. Every shot is a fixed composition where
   everything important is fully on canvas; a cut is a *new composition* (different layout, different evidence), never a
   scaled copy of the last shot. Motion comes from the things in the shot (reveals, draws, Lotties, morphs). The kit's
   ambient camera is off by default; `studio build` warns on any `camera` other than `still`.
7. **News evidence is a real snip of the article (user decision 2026-10-04).** When a frame cites a news story, show a
   cropped screenshot of the actual article page (headline, standfirst, photo, byline — its masthead may show), with the
   key phrase lit in amber; don't re-set the headline in our own type. Capture with headless Chrome (puppeteer-core from
   the HyperFrames npx cache + the installed Chrome), save under `<slug>/assets/photos/`, and still list the article in
   `upload.sources`. We add no credit/source lines of our own on screen.
8. **Vary the objects.** Don't reuse one prop (e.g. the same necklace) in every frame; mix real photos (any source,
   credited in the description) and library assets. Assets that require credit are fine — credit goes in the description.

## The goal of every video

**In under a minute (up to three when the story earns it — see Length), take one confusing money question an Indian viewer actually has, and make them understand
how it works.** They should finish thinking "oh, so that's why" and be able to explain it to a friend.

- **One mechanism, not a pile of facts:** *why* something happens, and who gains or pays.
- **A picture in their head:** a visual model they remember, because the animation taught it.
- **Trust:** evidence they can see (real data, a real headline) — with every source listed in the description.
- **One sentence to repeat:** the takeaway, said plainly.
- **Feel:**
  - a contradiction or question within 2 s;
  - something meaningful changing about every 2 s;
  - a premium, recognisable Kredflow look and sound;
  - honest, with no clickbait the video doesn't pay off.

**Ship test** (all five, before render):
1. Can we state the one question and the one-sentence answer?
2. Is every shot either evidence or explanation (never decoration)?
3. Does each styleframe hold up next to a Bloomberg or Vox frame on the same phone?
4. Does it sound right with the picture off?
5. Does every number have scale, and every claim a source in the description?

Views and followers are the scoreboard, not the goal.

## North star (user brief, 2026-10-02)

Combine the best of several channels; never copy one.

- **Visuals:** Bloomberg + Fern. A premium financial aesthetic in flat 2D: illustrated metaphors, depth from layered parallax, light, grain and vignette, smooth camera.
- **Narrative:** Veritasium + Wendover. Open on a surprising question or contradiction and build tension. Explain systems as chains of cause and effect, incentives and constraints.
- **Information design:** Vox. Maps, timelines, diagrams, annotated documents.
- **Conceptual clarity:** 3Blue1Brown. The animation itself teaches the concept.
- **Atmosphere and sound:** LEMMiNO. Composition, pacing, immersive sound, deliberate silence.

Story comes before editing. Use custom visual explanations rather than literal stock footage. Keep one consistent design language. Show primary evidence for factual claims (and list the sources in the description). Build every Short around a question that makes people want to know what happens next.

Format: YouTube Shorts / Reels, 9:16, 1080×1920, 45–60 s by default, up to 3 min when earned (see Length). The voice is supplied by the user from ElevenLabs.

## Length (user decision 2026-10-05)

45–60 s is the default and stays the right length for most stories. A video may run **up to 3 minutes** (YouTube's
Shorts limit) — but only if it stays entertaining, engaging and informative the whole way; never longer just because
there is more material. Viewers swipe the moment a Short stops paying them.

- **Earn every extra 20–30 s** with something new: a turn, a reveal, a new piece of evidence, or the next question the
  viewer is now asking. More detail on the same point does not count.
- **Re-hook about every 20 s:** each section ends on an open question or a contradiction that pulls into the next.
- **Cut test:** read the script with each beat removed. If the answer and every turn survive without it, cut it.
- **Same pace as a short one:** a shot every ~2–3 s, something changing every ~2.5 s, one explainer model that keeps
  growing; a long video is more turns, not slower beats.
- **Numbers:** 3 per minute of target length (≤ 9 at 3 min), each with context.
- **Agreed at the script gate:** propose the length with one line on what the extra time buys; the user approves it;
  record it as `video.json → maxLength` (seconds, ≤ 180). `studio script` and `studio build` check against it; at the final
  review, look for any stretch that sags (repeats, no new information for ~20 s).

## Long-form (user decision 2026-10-08)

The channel now also makes long-form YouTube videos (first: `rice-water`, "India Is Exporting Its Water"). Same house
identity and rules — 2D only, library assets first, no sources on screen, no camera zoom, real evidence, the ship test —
with these differences:
- **Format:** 16:9, 1920×1080. Length agreed at the script gate (`video.json → maxLength`); rice-water: 12–15 min.
- **Topics:** evergreen systems contradictions with **no popular YouTube video on the same angle** (check view counts
  before pitching; > 100k on the same angle = taken).
- **Structure:** a cold open (the contradiction by ~10 s, a promise of the whole story by ~60 s), then chapters of
  1–2 min. Each chapter is a Short-sized act: its own question, a turn or new evidence, and a last line that pulls into the
  next. Something new every 60–90 s at the story level; pacing inside a chapter is the Shorts pace (a shot every ~2–3 s,
  median ≤ 3.5 s).
- **Captions:** none burned in — the picture gets the whole frame; `studio srt` makes the YouTube CC file. Readable
  on-screen text ≥ 32 px and inside the stage box (x 140–1780, y 110–970).
- **Chapter cards:** a short type moment (chapter word on paper or graphite, ≤ 2.5 s) with a music change — LEMMiNO /
  Veritasium. Chapter titles also go in the description as YouTube chapters (automatic).
- **Explainer model:** one per video still, but it may return once per act (≈ 4–6 times in 14 min), each return showing
  a new state — never the same picture twice.
- **Sound:** a music cue per act (it changes at the big turns), ambience under every scene, nat sound under footage, deliberate silence before reveals, at least 3 SFX per chapter and no upper limit (user decision 2026-10-13).
- **Voice:** one ElevenLabs take per chapter.
- **Numbers:** still ≤ 3 spoken per minute, each with scale.

## What the study showed (17 videos, `_reference/study/`, private, git-ignored)

| channel | median shot | what carries it |
|---|---|---|
| Bloomberg (India traders, Iran oil, chips) | 2.0–2.5 s (short: 2.0) | dark teal/black grade, macro detail shots, interface close-ups, source documents as faded text with one phrase lit, **studio-lit metaphor objects on black** (two baskets of oranges = arbitrage), strict graphic system (black + one signal colour, thin-line isometric diagrams, corner-bracket frame marks) |
| Vox (economics, El Niño, Shorts) | 1.7–4 s | evidence everywhere: real headlines re-set over darkened archive, news clips, experts; **simple** flat maps with halftone texture, one animated idea each; 0.3 s archival montages to compress centuries into 3 s; yellow word-highlight captions |
| Fern | 2.2 s | stylised 3D scenes with real lighting (mannequin figures, 3D city with target in red, drone flights); archival photos composited into lit 3D space; a cream "document" world (NYT-style serif headlines with non-key words faded, portrait org charts, flat maps); small date/place stamps |
| Veritasium | 2.4 s | cold-open glitch, then question; well-lit interviews; warm, chiaroscuro 3D reenactments; chapter cards on texture; archive, terminals, newspaper pages |
| 3Blue1Brown | one continuous shot | **one persistent visual model** (the LLM as a grey block) on black, refined step by step; text and bars update in place; meaning carried by the animation, not cuts |
| Wendover | 2.6 s | cause-and-effect narration; b-roll; a real chart **printed on paper**, filmed with a slow 24 s camera drift; satellite maps with pins; document macro shots |
| LEMMiNO | continuous camera | near-black cinematic frames, slow moves, dark maps with dotted routes, small spaced caps labels, transcript/document inserts, long silences, custom score |
| **Kredflow `petrol-hidden-bill`** | **6.6 s** | code-drawn props, one composition per beat, a number alone on a card, noisy untrimmed SFX → **what we are leaving behind** |

The common thread is not "effects". Every frame does one job, uses the same design language, and is either **evidence** (a document, data, footage) or **explanation** (a metaphor, diagram or model). The frame changes every 2 s or so, and the craft goes into light, type, texture and sound.

## Design language

**Two worlds, one identity.** These alternate as the pattern interrupt:
- **Studio:** near-black graphite, soft light pools. Used for illustrated objects and people, charts, maps, the explainer model.
- **Paper:** warm off-white with paper grain. Used for documents, bills, headlines and timelines (Fern's cream layer, Wendover's printed chart).

**Palette (draft — locked at the first styleframe review):** graphite `#0E1013`, raised `#171A1F`, paper `#ECE6DA`, ink `#15171A`, **Kredflow signal amber `#F2A33A`** (the one accent colour, used sparingly), data-negative `#E5484D`, data-positive `#3DB9A4`, neutral grey `#8A8F98`. No other hues except inside real footage/photos, which get the house grade.

**Type** (fonts already vendored, OFL):
- **Inter**: titles, labels, captions. A neo-grotesk with tight tracking on big sizes.
- **Newsreader**: documents, headlines, quotes. Use the serif for anything that is a "source".
- **JetBrains Mono**: data labels, date/place stamps. Small, uppercase, letter-spaced.
- Never more than these three.

**Texture & finish (every shot):** subtle film grain, a gentle vignette, and a slight lift in the blacks. Footage and photos use one house grade: desaturated, teal shadows, warm highlights.

**Marks:**
- thin corner brackets on featured graphics;
- date/place stamps lower-left (`MUMBAI · OCT 2026`);
- no source lines — sources live in the description (`upload.sources`).

**Captions (one house style, `overlay`):**
- plain text, no box: Inter ≈50 px semi-bold, white with a thin dark outline and soft shadow (reads on graphite and paper);
- key words / numbers in signal amber;
- layered on top of the picture in the lower third, y ≈1270–1450 — the picture continues under and below them;
- maximum two lines; a very light frame may use `spec → "captions": {"tone": "dark"}`, a frame whose key text must sit low may move the band with `{"y": …}`.

## Visual vocabulary (the only building blocks)

1. **Illustrated object / person (2D library asset):** a flat illustration or Lottie from IconScout / LottieFiles / Humaaans / Open Peeps, recoloured to the palette (`recolor`), placed big and animated in place (its own Lottie motion, slides, reveals — no camera zoom). Prefer several assets from one creator per video. *This replaces every code-drawn prop — and there is no 3D.*
2. **The explainer model (3B1B):** one persistent diagram per Short that grows as the story goes — layers, flows, a balance, a pipe network. It returns in 2–3 beats, so the viewer builds a mental model. **Never more than 3 appearances** (user, 2026-10-08: rupee-defence's dollar-queue + money-flow in 7 frames felt repetitive), and each return must look and move differently; otherwise reach for another visual.
3. **Data chart:** real data pulled with `studio data` (World Bank, FRED, or a downloaded RBI/MoSPI CSV) — the source lands in the description automatically, never on the chart. It draws on (DrawSVG), annotates the key moment and can re-scale or morph (MorphSVG) to reveal the story.
4. **Map:** the `map` block / `KM.draw` — Natural Earth world + India from the official outline (all of J&K and Ladakh), studio or paper style. Routes with a moving marker, pins, chokepoints, small spaced-caps labels.
5. **Document / headline:** a real headline or official text, re-set in Newsreader or screenshotted, with the key phrase lit in amber and the rest faded. No masthead or attribution on screen — the publication and date go in the description.
6. **Footage / photo:** any source on the internet, whatever suits the shot best — news/agency photos, stock, Wikimedia,
   YouTube/news clips (user decision 2026-10-08: no licence requirement for images or video; the user accepts the
   copyright/Content-ID risk). Always graded and cropped with intent, and credited in the description (`upload.sources`).
   - **Moves:** parallax, push or match cut.
   - **Montage bursts:** 0.2–0.4 s cuts that compress time.
   - **Never as decoration:** literal stock is texture, not the explanation.
7. **Type moment:** a chapter word or a single number, *only* when paired with context. A big number never appears alone; it comes with its scale (per day, per person, a comparison) or with the object or chart that gives it meaning.
8. **Library animation (LottieFiles / IconScout / Open Peeps):** the primary source for anything that moves — objects, people, reactions. Recolour to the palette, keep one style family per video (flat or outline, never 3D-style), and check their timelines (`studio lottie frames`).

**Banned:**
- 3D rendering of any kind (three.js/WebGL, Blender, 3D-style library assets);
- source / credit lines, mastheads or "illustrative" notes on screen;
- boxed captions (card, bar, pill);
- real-world objects drawn from SVG primitives;
- cartoon avatars as a host;
- emoji;
- a number alone on a flat card;
- slide-deck transitions (push/squeeze) as decoration;
- more than one typeface family per role.

## Editing & pacing (Shorts)

- **Shot length:** median ≈ 1.5–3 s. Something meaningful changes at least every 2 s (a cut, a camera beat, a reveal, an annotation).
- **The insight is the exception:** it gets a 0.6–1 s hold, ideally with near-silence before it (LEMMiNO).
- **Transitions:**
  - mostly hard cuts and match cuts (a shape or motion carries across);
  - whip-blur for energy;
  - dissolves only for time passing.
- **Time compression** uses montage bursts (Vox).
- **Camera:** none — fixed compositions only (house rule 6). Life comes from what moves *inside* the shot, and from cuts to new compositions.

## Story structure (Veritasium + Wendover + 3Blue1Brown)

1. **Hook (0–2 s):** a contradiction, mystery or misconception, shown and said ("Oil is up 50%. Petrol, 8%.").
2. **Tension:** what you'd expect, and why it didn't happen.
3. **Mechanism:** the cause-and-effect chain, shown on the explainer model. Name who has the incentive and who carries the cost.
4. **Evidence:** primary evidence on screen (data, an official document, a headline) — the source itself goes in the description.
5. **Turn:** the reveal the viewer didn't see coming.
6. **Takeaway:** one sentence the viewer can repeat to a friend. End on a loop or a punchline — a complete sentence, then the picture settles and the sound resolves for ≥ 1.2 s (never an abrupt cut); never a "follow" ask (that goes in the description).

Rules:
- At most 3 spoken numbers per minute of target length, each with context.
- 130–150 words for 45–60 s (default); ≈ 155 words per minute when a longer length is agreed (see Length).
- Every claim must be sourceable; sources go in the description.

## Sound (LEMMiNO-grade — rebuilt 2026-10-10; engine in STUDIO.md → Sound)

- **Sound belongs to the picture.** Every sound comes from something on screen: the place (ambience), the footage (its
  own nat sound), a prop or a cut (SFX). If you can't point at its source, cut it.
- **Music:** a cue per act — it changes at the big turns (long-form: per chapter or act), never one bed looping under
  everything. Professional tracks (YouTube Audio Library), not recognisable stock. Ducked under the voice (≈8 dB under
  speech, ≈3 dB in gaps — the user found 15/8 too quiet, 2026-10-11), more present in gaps and on chapter cards.
- **Ambience** under every scene (field, pump house, port, market, office room tone) so silence never sounds empty; it
  changes when the place changes.
- **Nat sound** under real footage, low under the voice and up in the gaps — unless the clip carries a reporter or music.
- **SFX:** professional recordings (Sonniss), levelled by role (hit / whoosh / riser / foley / ui), trimmed, sharing one
  room. Each ≤ 1.2 s (risers excepted); motion and real-action events only; at most one in any 1.5 s window, except a
  designed hit; at least 3 per chapter, no upper limit — every sound the picture motivates (user decision 2026-10-13).
- **Never:** cartoon sounds (cash-register ching, boings, pops on every label); literal noisy textures under the voice;
  stacked SFX; an SFX over a key word of narration; amateur library recordings.
- **Silence** is a tool: 0.3–0.8 s of dropped music before the turn.
- **Review:** the audio-only render is listened to (loudness, overlaps, pumping) before the final render.

## Review 2026-10-03: lessons from the first 9 videos

Read this before designing a new video. Each lesson is something a shipped video got wrong, or something we did well.

**Keep doing:**
- **The two worlds.** Studio and paper scenes alternate as the pattern interrupt.
- **One explainer model that grows.** petrol-gap's litre-as-a-bill returned in 3 beats and grew each time.
- **Real data with sources in the description.** Use `studio data`.
- **A hook object with a readable number at t=0.** rbi's phone showing "₹41,047 · NO CHANGE" is our best hook.
- **Indian IconScout characters**, recoloured to the palette.
- **Our ElevenLabs takes.**
- **A complete-sentence punchline** to end on (nifty).

**Stop doing:**
1. **Still frames.** Every frame of petrol-gap and nifty was one unchanging composition, and nifty's median shot was 7.6 s. A label appearing is not a new shot.
   - Cut inside long frames with `KW.shot` / `KW.cut` on a word — to a *new composition* (evidence, a different layout).
   - Never fake a cut by zooming (house rule 6, user 2026-10-04: no push/pull/zoom at all).
   - `studio build` prints the shot count and median (`craft:`).
2. **An empty lower half.** nifty's content sat in the top 40%, with tiny chart labels over dead graphite.
   - The hero (chart, model, person) should fill 1080 wide and run down behind the captions.
   - Chart labels must be ≥ 28 px so they read on a phone.
3. **Figures as wallpaper.** The same analyst stood in the same spot in 6 of 8 frames, doing nothing. A person appears only when they *act*: they pay, leave, react or hold the evidence. Vary scale and placement, and animate them (Lottie, or a pose swap).
4. **Captions over faces and bodies.** nifty had captions over the sofa investor and the saree woman. Keep figures out of y 1270–1450 or move the band (`"captions": {"y": …}`). Snap every frame with a person at the moment its caption shows.
5. **Too many numbers.** petrol-gap spoke about 9; the limit is 3. Extra numbers go on screen or in the description, not in the voice.
   - Spoken and on-screen numbers must match ("₹32,297 crore" vs "thirty-two thousand crore").
6. **Long hooks.** nifty's first shot ran 9.8 s, and the contradiction landed at ~5 s. Land it by 2 s and cut by 4 s.
   - Keep the whole video to 45–60 s unless a longer length was agreed (see Length) — and land the hook by 2 s either way.
7. **Shipping known defects.** petrol-gap went out with no music bed, 0 SFX and a cut-off last line. A missing bed now fails the build. Never render over a `✗`.
8. **Placeholder graphics.** A real headline with grey "lorem" bars under it reads as unfinished. Show the real text faded, or crop to the headline.
9. **The same two SFX in every video** (bass-impact, whoosh). The kit now has tick, data blip, page turn, paper slide, soft hit, soft boom, sub drop, riser and two room tones. Pick per motion, and use room tone under paper scenes.

**Resources we have and haven't used. Reach for these first:**
- **Map** (`map` / `KM.draw`): never used yet. Any story about money or goods crossing borders (FPI flows, crude via Hormuz) should have one.
- **MorphSVG** (`KW.morph`): never used yet. Use it when one quantity becomes another (−14% → −20%, layers of a litre).
- **Lotties** from the library: 0 in the last two videos. Make people and money *move*.
- **Real photos and footage, graded:** only food-crisis had them. Use them for evidence shots (exchange floors, pump queues).
- **A real headline document** with the key phrase lit. nifty had the perfect one ("longest losing streak since 2001") and didn't show it.
- **`KF.brackets`, date/place stamps, and per-frame `captions.tone`.**
- **`studio snap --loop`** for loop endings.

### Pre-render checklist (in addition to the ship test)
- [ ] `studio build` has no `✗`, and the `craft:` median shot is ≤ 3.5 s.
- [ ] No camera zoom anywhere (house rule 6); nothing important cut off at the canvas edge.
- [ ] The hook's contradiction lands by 2 s, and the first cut comes by 4 s.
- [ ] Every frame's hero is big; nothing on screen is smaller than 28 px.
- [ ] No caption sits over a face, body or key number. Check snaps at caption moments.
- [ ] At most 3 numbers per minute of target length are spoken, and each matches the screen.
- [ ] Longer than 60 s? Only with an agreed `maxLength`, a turn or new evidence every 20–30 s, and no beat that fails the cut test.
- [ ] At least one evidence shot: a headline, document, photo or footage.
- [ ] The map / morph / Lottie question was asked: would one of them explain this beat better?
- [ ] Music cues that change at the turns, ambience/nat sound under every scene, ≥ 3 motivated SFX per chapter (no upper limit), and `studio listen` done.
- [ ] Complete last sentence and ≥ 1.2 s hold (for a loop, `snap --loop`).
- [ ] Compare against the last 3 videos' scenes and assets (`studio variety`).

## Process gates

| # | stage | approved by |
|---|---|---|
| 1 | research brief (question, mechanism, sources) | — |
| 2 | script (+ delivery notes for ElevenLabs) | **user** |
| 3 | styleframes — 6–10 key stills in the house style, compared side by side with the reference frames | **user** |
| 4 | animatic with the user's voice (timing, cuts) | — |
| 5 | animation | — |
| 6 | sound pass + audio-only review | — |
| 7 | final review (contact sheet, seams, loudness) → render | **user** |

"Check passed" is a technical gate, not a quality gate. Quality is judged on stills and audio against this document.

## Hardware notes (this machine)

i5-1135G7, Intel Iris Xe, 8 GB RAM.
- 2D (HTML/SVG/GSAP/lottie-web) renders comfortably at 1080×1920; keep large SVG illustrations under ~100 KB.
- Renders run in the background.
