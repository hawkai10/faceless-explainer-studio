// Minimal Openverse API client: timeouts, optional OAuth (client credentials), a small response
// cache, and readable rate-limit errors. Anonymous use is limited to ~20 requests/min and
// ~200/day; register a free app (see README) and set OPENVERSE_CLIENT_ID / _SECRET for more.

const BASE = (process.env.OPENVERSE_API_BASE || "https://api.openverse.org/v1").replace(/\/+$/, "");
const UA = "mcp-openverse-audio/0.1 (local Claude Code MCP; fork of pipeworx-io/mcp-openverse)";
const TIMEOUT_MS = 20_000;
const CACHE_TTL_MS = 10 * 60_000;

const cache = new Map(); // url -> { at, data }
let token = null; // { value, expiresAt }
let lastRate = null;

export function apiBase() { return BASE; }
export function rateLimit() { return lastRate; }
/** Openverse rejects anonymous requests with page_size > 20 (HTTP 401). */
export function maxPageSize() { return process.env.OPENVERSE_CLIENT_ID && process.env.OPENVERSE_CLIENT_SECRET ? 500 : 20; }

async function authHeader() {
  const id = process.env.OPENVERSE_CLIENT_ID, secret = process.env.OPENVERSE_CLIENT_SECRET;
  if (!id || !secret) return {};
  if (!token || Date.now() > token.expiresAt - 60_000) {
    const res = await fetch(`${BASE}/auth_tokens/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Openverse auth failed (HTTP ${res.status}) — check OPENVERSE_CLIENT_ID / OPENVERSE_CLIENT_SECRET`);
    const j = await res.json();
    token = { value: j.access_token, expiresAt: Date.now() + (j.expires_in || 3600) * 1000 };
  }
  return { Authorization: `Bearer ${token.value}` };
}

function noteRate(res) {
  const pick = (k) => res.headers.get(k);
  const burst = pick("x-ratelimit-available-anon_burst") ?? pick("x-ratelimit-available-standard_burst");
  const day = pick("x-ratelimit-available-anon_sustained") ?? pick("x-ratelimit-available-standard_sustained");
  if (burst != null || day != null) lastRate = { remaining_per_minute: burst != null ? +burst : null, remaining_per_day: day != null ? +day : null };
}

/** GET a JSON resource under the API base, e.g. get("/audio/", {q:"rain"}). */
export async function get(path, params = {}, { useCache = true } = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")).toString();
  const url = `${BASE}${path}${qs ? "?" + qs : ""}`;
  const hit = cache.get(url);
  if (useCache && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  let res;
  try {
    res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA, ...(await authHeader()) }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new Error(`Openverse unreachable (${e.name === "TimeoutError" ? "timed out" : e.message})`);
  }
  noteRate(res);
  if (res.status === 429) throw new Error("Openverse rate limit reached (HTTP 429). Anonymous use allows ~20 requests/min and ~200/day; wait, or set OPENVERSE_CLIENT_ID/OPENVERSE_CLIENT_SECRET.");
  if (res.status === 404) throw new Error(`Openverse: not found (${path})`);
  if (res.status === 401 || res.status === 403) throw new Error(`Openverse refused the request (HTTP ${res.status}). Anonymous requests must use page_size ≤ 20 and no auth-only filters; with OPENVERSE_CLIENT_ID/SECRET set, check the credentials.`);
  if (!res.ok) throw new Error(`Openverse error HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (useCache) cache.set(url, { at: Date.now(), data });
  return data;
}
