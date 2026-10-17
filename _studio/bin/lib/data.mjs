// studio data — pull a real data series into <project>/data/<name>.json and record its source in
// video.json → upload.sources (the description; sources never go on screen). Frames read it as DATA[name].
// Keyless sources only:
//   wb   <INDICATOR> [--country IND] [--from 2000] [--to 2026]      World Bank Indicators API (no key)
//   fred <SERIES>    [--from 2022-01-01] [--freq Monthly] [--agg avg] FRED graph CSV (no key)
//   csv  <file> --date <col> --value <col> --source "RBI DBIE, …"   a file you downloaded (RBI DBIE, MoSPI, PPAC…)
// Common: --name <key> (default from the id) --title "…" --unit "…" --scale 1
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { die, readJson, writeJson } from "./common.mjs";

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
async function getText(url) {
  const r = await fetch(url, { headers: { "user-agent": "kredflow-studio/1.0" } });
  if (!r.ok) die(`${url} → HTTP ${r.status}`);
  return r.text();
}
function parseCsv(text) {
  const rows = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  const split = (l) => { const out = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); };
  const head = split(rows[0]);
  return rows.slice(1).map((l) => { const c = split(l); return Object.fromEntries(head.map((h, i) => [h, c[i]])); });
}

export async function cmdData(dir, video, args, flag) {
  const [src, id] = args;
  if (!src || !id) die('usage: studio data <slug> wb <INDICATOR> [--country IND] | fred <SERIES> [--from YYYY-MM-DD --freq Monthly --agg avg] | csv <file> --date <col> --value <col> --source "…"');
  const scale = Number(flag("scale", 1));
  let rec;
  if (src === "wb") {
    const c = flag("country", "IND"), from = flag("from", "1990"), to = flag("to", String(new Date().getFullYear()));
    const url = `https://api.worldbank.org/v2/country/${c}/indicator/${id}?format=json&per_page=500&date=${from}:${to}`;
    const j = JSON.parse(await getText(url));
    if (!Array.isArray(j) || !Array.isArray(j[1])) die(`World Bank: no data for ${id} / ${c} (${JSON.stringify(j).slice(0, 160)})`);
    const rows = j[1].filter((r) => r.value != null).map((r) => [r.date, +r.value * scale]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const name = j[1][0]?.indicator?.value || id, country = j[1][0]?.country?.value || c;
    rec = { name: flag("name", slugify(id + "-" + c)), title: flag("title", `${name} — ${country}`), unit: flag("unit", ""), series: rows,
      source: `World Bank, World Development Indicators — ${name} (${id}), ${country}`, url: `https://data.worldbank.org/indicator/${id}?locations=${c.slice(0, 2)}` };
  } else if (src === "fred") {
    const q = new URLSearchParams({ id });
    if (flag("from")) q.set("cosd", flag("from")); if (flag("to")) q.set("coed", flag("to"));
    if (flag("freq")) q.set("fq", flag("freq")); if (flag("agg")) q.set("fam", flag("agg"));
    const rows = parseCsv(await getText("https://fred.stlouisfed.org/graph/fredgraph.csv?" + q))
      .map((r) => [r.observation_date || r.DATE, r[id]]).filter((r) => r[1] !== "" && r[1] != null && r[1] !== ".").map((r) => [r[0], +r[1] * scale]);
    if (!rows.length) die(`FRED: no rows for ${id}`);
    let title = flag("title", null);
    if (!title) { const page = await getText(`https://fred.stlouisfed.org/series/${id}`).catch(() => ""); title = (page.match(/<title>([^<|]+)/) || [])[1]?.replace(/\s*\([A-Z0-9]+\)\s*$/, "").trim() || id; }
    rec = { name: flag("name", slugify(id)), title, unit: flag("unit", ""), series: rows,
      source: `FRED, Federal Reserve Bank of St. Louis — ${title} (${id})${flag("freq") ? ", " + flag("freq").toLowerCase() + (flag("agg") ? " " + flag("agg") : "") : ""}`, url: `https://fred.stlouisfed.org/series/${id}` };
  } else if (src === "csv") {
    const f = id; if (!existsSync(f)) die("csv file not found: " + f);
    const dc = flag("date"), vc = flag("value"), source = flag("source");
    if (!dc || !vc || !source) die('csv needs --date <column> --value <column> --source "Publisher, table, date"');
    const rows = parseCsv(readFileSync(f, "utf8")).map((r) => [r[dc], Number(String(r[vc]).replace(/,/g, "")) * scale]).filter((r) => r[0] && !Number.isNaN(r[1]));
    if (!rows.length) die(`no rows read — columns are: ${Object.keys(parseCsv(readFileSync(f, "utf8"))[0] || {}).join(", ")}`);
    rec = { name: flag("name", slugify(vc)), title: flag("title", vc), unit: flag("unit", ""), series: rows, source, url: flag("url", "") };
  } else die(`unknown source "${src}" — wb | fred | csv`);
  rec.fetched = new Date().toISOString().slice(0, 10);
  mkdirSync(join(dir, "data"), { recursive: true });
  writeJson(join(dir, "data", rec.name + ".json"), rec);
  // the source goes in the description (upload.sources), never on screen
  const vp = join(dir, "video.json"), v = readJson(vp);
  v.upload = v.upload || {}; v.upload.sources = Array.isArray(v.upload.sources) ? v.upload.sources : [];
  const line = `${rec.source}${rec.url ? " — " + rec.url : ""} (retrieved ${rec.fetched})`;
  if (!v.upload.sources.some((s) => s.startsWith(rec.source))) { v.upload.sources.push(line); writeJson(vp, v); }
  const s = rec.series, vals = s.map((r) => r[1]);
  console.log(`✓ data/${rec.name}.json — ${rec.title}\n  ${s.length} points · ${s[0][0]} → ${s[s.length - 1][0]} · min ${Math.min(...vals).toFixed(2)} · max ${Math.max(...vals).toFixed(2)} · last ${vals[vals.length - 1].toFixed(2)}`);
  console.log(`  source recorded in video.json → upload.sources · use it in a frame as DATA["${rec.name}"].series`);
}
