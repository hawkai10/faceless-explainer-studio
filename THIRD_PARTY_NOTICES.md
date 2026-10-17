# Third-party notices

The studio's own code and docs are licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).
The components below are included under their own licences, which continue to apply to them.

## Included in this repository

| Component | Path | Licence | Source |
|---|---|---|---|
| mcp-openverse-audio (fork of `@pipeworx/mcp-openverse`) | `mcp-openverse-audio/` | MIT — [LICENSE](mcp-openverse-audio/LICENSE) | https://github.com/pipeworx-io/mcp-openverse |
| HyperFrames faceless-explainer scripts | `_studio/vendor/fe-scripts/` | Apache-2.0 | https://github.com/heygen-com/hyperframes |
| Humaaans by Pablo Stanley | `_studio/vendor/humaaans/` | CC0 (humaaans.com); the source mirror states CC BY 4.0, so credit "Humaaans by Pablo Stanley" | https://www.humaaans.com · https://github.com/Calinou/humaaans |
| Tabler Icons 3.48.0 | `_studio/vendor/tabler/` | MIT — [LICENSE](_studio/vendor/tabler/LICENSE) | https://github.com/tabler/tabler-icons |
| world-atlas (Natural Earth) | `_studio/vendor/maps/world*.json`, `india-states-nw.json` | Natural Earth: public domain; world-atlas: ISC | https://github.com/topojson/world-atlas · https://www.naturalearthdata.com |
| DataMeet India outline | `_studio/vendor/maps/india*.json` | CC0 | https://github.com/datameet/maps |
| Webfonts: Archivo, Barlow, Bebas Neue, DM Mono, Hanken Grotesk, IBM Plex Mono, Instrument Serif, Inter, JetBrains Mono, Newsreader, Source Serif 4, Space Grotesk | `_studio/fonts/` | SIL Open Font License 1.1 — [OFL.txt](_studio/fonts/OFL.txt) | https://fonts.google.com |

See `_studio/vendor/*/README.md` for how each vendored file was built.

## Not included — fetched by each user

These sources are used by the studio commands but **nothing from them is redistributed here**. Their terms apply to
anything you download, and several forbid redistributing the files themselves:

| Source | Used by | Terms |
|---|---|---|
| LottieFiles | `studio lottie` | Lottie Simple License / per-asset licence |
| IconScout (free assets) | `studio iconscout` | IconScout licence; check `attribution_required` per asset |
| unDraw | `studio undraw` | unDraw licence (free use; no redistribution as a collection) |
| Open Peeps / react-peeps | `studio peeps` | CC0 / MIT |
| DiceBear | `studio avatar` | per style (CC0 / CC BY) |
| Sonniss GDC Game Audio Bundles | `studio sound` | Sonniss licence — royalty-free use, no redistribution |
| YouTube Audio Library | `studio sound music` | YouTube terms; attribution where the track requires it |
| Openverse | `mcp-openverse-audio` | per-file Creative Commons licence, enforced by the server |
| HyperFrames (npm `hyperframes`) and its agent skills | build and render | Apache-2.0 |

The `_studio/assets/*/LICENSES.json` ledgers list the files the original videos used, with creator, licence and source
URL, so they can be re-fetched.
