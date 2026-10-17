# Vendored map data (for the `map` block / `KM.draw`)

| file | what | source | licence |
|---|---|---|---|
| `world.json` | countries, 1:110m, TopoJSON (`objects.countries`, ISO numeric ids) | [world-atlas@2](https://github.com/topojson/world-atlas) `countries-110m.json`, built from [Natural Earth](https://www.naturalearthdata.com/) | Natural Earth: public domain; world-atlas: ISC |
| `world-50m.json` | countries, 1:50m, TopoJSON — never inlined whole; `studio build` clips it to a frame's region with mapshaper (`spec.maps.detail: "50m"`) into `_cache/` | world-atlas@2 `countries-50m.json` (Natural Earth) | public domain / ISC |
| `india-detail.json` | the same official India outline at ~6× the detail (`-dissolve -simplify 4% keep-shapes`, ~160 KB) — used with 50m maps | DataMeet `india-composite.geojson` | CC0 |
| `india.json` | India's outline as India officially depicts it (incl. all of Jammu & Kashmir, Ladakh, Aksai Chin), GeoJSON, simplified to ~25 KB | [DataMeet maps](https://github.com/datameet/maps/tree/master/Country) `india-composite.geojson`, simplified with mapshaper (`-dissolve -simplify 0.6% keep-shapes`) | CC0 |

**Why `india.json` exists:** Natural Earth draws India's *de facto* borders. Published maps of India for an Indian
audience must show the official boundary, so the map kit always draws India from `india.json` on top of the
world layer. Never show India from the world file alone.

Credits are optional (CC0 / public domain). Natural Earth may be credited in the description as "Made with Natural Earth".
To update: re-download, re-run the mapshaper command above, keep the file small (it is inlined into each map frame).
| `india-states-nw.json` | Punjab + Haryana state outlines (GeoJSON, simplified 30%) | Natural Earth 1:10m admin-1 states/provinces | public domain |
