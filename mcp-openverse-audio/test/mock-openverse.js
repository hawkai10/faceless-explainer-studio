// A tiny local stand-in for the Openverse API + file hosts, so tests run offline and don't
// spend the anonymous rate limit.
import { createServer } from "node:http";

const AUDIO_BYTES = Buffer.alloc(4096, 7); // "audio" payload (content irrelevant, size > 1 KB)

export function record(over = {}) {
  const id = over.id || "00000000-0000-4000-8000-000000000001";
  return {
    id,
    title: "Test Track",
    foreign_landing_url: "https://example.org/track/1",
    url: `/files/${id}.mp3`,
    creator: "Test Artist",
    creator_url: "https://example.org/artist",
    license: "cc0",
    license_version: "1.0",
    license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
    provider: "freesound",
    source: "freesound",
    category: null,
    genres: [],
    filetype: "mp3",
    tags: [{ name: "whoosh" }],
    attribution: null,
    mature: false,
    duration: 2500,
    ...over,
  };
}

export async function startMock(records, { searchResults } = {}) {
  const byId = new Map(records.map((r) => [r.id, r]));
  const hits = [];
  const server = createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    hits.push(u.pathname + u.search);
    const m = u.pathname.match(/^\/v1\/audio\/([0-9a-f-]{36})\/$/);
    if (m) {
      const r = byId.get(m[1]);
      if (!r) { res.writeHead(404); return res.end("{}"); }
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ...r, url: r.url.startsWith("/") ? base + r.url : r.url }));
    }
    if (u.pathname === "/v1/audio/") {
      // real Openverse: anonymous page_size > 20 → 401
      if (Number(u.searchParams.get("page_size")) > 20 && !req.headers.authorization) { res.writeHead(401, { "content-type": "application/json" }); return res.end("{}"); }
      const lic = (u.searchParams.get("license") || "").split(",");
      const list = (searchResults || records).filter((r) => !lic[0] || lic.includes(r.license) || r._ignoreLicenseFilter);
      res.writeHead(200, { "content-type": "application/json", "x-ratelimit-available-anon_burst": "19", "x-ratelimit-available-anon_sustained": "199" });
      return res.end(JSON.stringify({ result_count: list.length, results: list }));
    }
    const f = u.pathname.match(/^\/files\/(.+)$/);
    if (f) {
      if (f[1].startsWith("html")) { res.writeHead(200, { "content-type": "text/html" }); return res.end("<html>nope</html>"); }
      if (f[1].startsWith("tiny")) { res.writeHead(200, { "content-type": "audio/mpeg" }); return res.end("abc"); }
      res.writeHead(200, { "content-type": f[1].endsWith(".ogg") ? "application/ogg" : "audio/mpeg" });
      return res.end(AUDIO_BYTES);
    }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, api: base + "/v1", hits, close: () => new Promise((r) => server.close(r)) };
}
