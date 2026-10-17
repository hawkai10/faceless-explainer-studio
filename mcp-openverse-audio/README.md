# mcp-openverse-audio

A local **stdio MCP server for Claude Code** that finds, downloads and license-tracks
**royalty-free music and sound effects** from [Openverse](https://openverse.org)
(Jamendo, Freesound, Wikimedia Commons — ~5 million audio records).

Fork of [`pipeworx-io/mcp-openverse`](https://github.com/pipeworx-io/mcp-openverse) (MIT). The original
Openverse tools are kept; the Pipeworx gateway plumbing is removed and the audio workflow is added:

- `search_music` / `search_sfx` — license-safe search with duration, category, license, commercial-use and source filters
- `download_audio` — re-verifies the license with Openverse, saves under `assets/audio/music|sfx/`, records provenance
- `list_audio_licenses` — the ledger plus a ready-to-paste credits block
- kept from upstream: `search_audio`, `get_audio` (now with a `license_check` verdict), `audio_related`, `search_images`, `get_image`, `image_related`

No API key, no paid service. Node ≥ 20, one dependency (`@modelcontextprotocol/sdk`).

## License policy

Enforced in `src/licenses.js`, applied to search results **and again at download time** against a fresh
Openverse record (search results and caller input are never trusted).

| License | Used? | Notes |
|---|---|---|
| CC0 1.0, Public Domain Mark | ✅ preferred (tier 0) | no attribution required (credited anyway in the ledger) |
| CC BY (any version) | ✅ (tier 1) | commercial OK, **attribution required** |
| CC BY-SA | ⚠️ only with `allow_share_alike: true` | putting music under a video makes the video an adaptation → it would have to be BY-SA too |
| CC BY-ND | ❌ | syncing audio to video is an adaptation, which ND forbids |
| CC BY-NC, BY-NC-SA, BY-NC-ND, NC-Sampling+ | ❌ | non-commercial |
| Sampling+ | ❌ | retired license, unclear commercial scope |
| anything unrecognised | ❌ | |

"Unclear licensing" is also refused: missing license, missing version (for BY/BY-SA), a license URL that
doesn't match the license code, no source page, no creator on an attribution license, or a mature flag.

**Search order:** by default (`license_mode: "prefer_public_domain"`) the server asks Openverse for
CC0/PDM first and only fills remaining slots with CC BY. `public_domain_only` never returns BY;
`commercial` ranks all usable licenses together.

## Downloads and the ledger

`download_audio(id)` → `<project>/assets/audio/music/<title>-<id8>.<ext>` or `…/sfx/…`, and appends to
`<project>/assets/audio/LICENSES.json` (a JSON array):

```json
{
  "openverse_id": "4c3ed74a-8e6d-4dc5-9d16-e2aa0678b047",
  "title": "Whoosh Whoosh Boom",
  "creator": "adh.dreaming",
  "creator_url": "https://freesound.org/people/adh.dreaming/",
  "source": "freesound",
  "source_url": "https://freesound.org/people/adh.dreaming/sounds/…",
  "openverse_url": "https://openverse.org/audio/4c3ed74a-…",
  "file_url": "https://cdn.freesound.org/previews/…mp3",
  "license": "cc0", "license_version": "1.0", "license_name": "CC0 1.0",
  "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
  "public_domain": true, "attribution_required": false,
  "attribution": "\"Whoosh Whoosh Boom\" by adh.dreaming is marked with CC0 1.0 …",
  "share_alike": false, "commercial_use": true,
  "kind": "sfx", "file": "assets/audio/sfx/whoosh-whoosh-boom-4c3ed74a.mp3",
  "duration_s": 1, "bytes": 25728, "sha256": "…",
  "downloaded_at": "2026-09-27T18:39:01.201Z",
  "verified": "license re-checked against the Openverse API record at download time"
}
```

Guarantees: the file is streamed to a `.part` file (150 MB cap, sha256), the ledger is written atomically,
and only then is the file moved into place — every file in `assets/audio/` has a ledger entry. Re-downloading
the same id is a no-op. A `LICENSES.json` that isn't a JSON array is never overwritten. MIDI (scores, not
recordings) and non-audio responses are refused.

**Project folder:** `project_dir` argument → else `AUDIO_PROJECT_ROOT` env → else the server's working
directory (Claude Code starts stdio servers in the project you launched it from).

**Credits:** anything with `attribution_required: true` must be credited where the video is published
(e.g. the YouTube description). `list_audio_licenses` prints the block.

## Filters

| | `search_music` | `search_sfx` |
|---|---|---|
| default sources | `jamendo,wikimedia_audio` | `freesound,wikimedia_audio` |
| duration | `min_seconds` (default 30), `max_seconds` | `max_seconds` (default 30), `min_seconds` |
| `category` | corporate, ambient, cinematic, electronic, acoustic, classical, piano, lofi, upbeat, calm, jazz, hiphop, orchestral (or free text) | transition, whoosh, impact, ui, click, notification, ambience, nature, weather, foley, riser, swoosh, cash, typing (or free text) |
| extra | `instrumental: true` | |
| both | `license_mode`, `license` (`cc0,pdm,by`), `allow_share_alike`, `source`, `limit` (≤ 20) | |

Why `category` is a keyword rather than Openverse's `category` filter: Openverse leaves `category` empty for
Freesound and Wikimedia records, so `category=sound_effect` silently hides ~600k sound effects. Duration uses
Openverse's `length` buckets server-side, then exact seconds client-side.

## Install

This server lives inside the `videos` repo (`videos/mcp-openverse-audio/`). After cloning the repo:

```bash
cd videos/mcp-openverse-audio
npm install
npm test          # offline unit tests against a mock Openverse (16 tests)
npm run e2e       # live: real server over stdio → search → download → ledger → NC refusal (~8 API calls)
```

### Claude Code (stdio)

The repo root has a `.mcp.json` that registers it automatically when Claude Code is started in `videos/`
(approve it once when prompted); downloads then go to the shared library `videos/_studio/assets/audio/`.
To use it from another folder:

```bash
# available in one project (run inside it) — downloads go to that project's assets/audio/
claude mcp add openverse-audio -- node /absolute/path/mcp-openverse-audio/src/server.js

# or everywhere, with a fixed library folder
claude mcp add -s user openverse-audio -e AUDIO_PROJECT_ROOT=/path/to/library -- node /absolute/path/mcp-openverse-audio/src/server.js
```

Check with `claude mcp list` (should show `✓ Connected`) or `/mcp` inside Claude Code. Then just ask:
*"Find a calm instrumental background track under 3 minutes and a short whoosh for transitions, and download both."*

### Environment

| var | default | |
|---|---|---|
| `AUDIO_PROJECT_ROOT` | server cwd | where `assets/audio/` lives when `project_dir` isn't passed |
| `OPENVERSE_CLIENT_ID`, `OPENVERSE_CLIENT_SECRET` | — | optional; raises the rate limit (register free at https://api.openverse.org/v1/#tag/auth) |
| `AUDIO_MAX_BYTES` | 157286400 | per-file download cap |
| `OPENVERSE_API_BASE` | `https://api.openverse.org/v1` | used by the tests to point at a mock |

**Rate limits:** anonymous Openverse allows ~20 requests/min and ~200/day. A search costs 1–2 requests
(2 when public-domain results must be topped up with CC BY), a download 1. Responses are cached for 10 minutes;
every result reports `openverse_rate_limit`.

## Files

```
src/server.js     stdio MCP wiring (stdout = protocol, logs → stderr)
src/tools.js      tool schemas + dispatch (new audio tools + the six upstream tools)
src/audio.js      search_music / search_sfx: license passes, filters, ranking
src/licenses.js   the license policy + attribution text
src/download.js   download_audio, LICENSES.json ledger, list_audio_licenses
src/openverse.js  API client: timeouts, optional OAuth, cache, rate-limit messages
test/             offline tests (mock Openverse)   scripts/e2e.mjs  live stdio test
```

## Caveats

- Openverse mirrors metadata from the source sites; the ledger stores the source page so you can re-check it.
  Freesound files are the source's HQ MP3 previews (originals need a Freesound login).
- Wikimedia titles are sometimes raw filenames; Kevin MacLeod tracks there are CC BY 3.0 (credit required).
- This tool applies a conservative policy; it is not legal advice.

## License

MIT — original `mcp-openverse` © 2026 Mojibake Inc. (Pipeworx); fork changes © 2026 the fork's contributors. See `LICENSE`.
