// Script ↔ transcript matching for local TTS takes (Parler): word-level alignment → per-line error
// counts (QA) and per-line word spans (to cut a multi-line take back into lines).
// Numbers compare by value ("five thousand" = "5,000", "twenty-five" = "25", "four point eight" = "4.8", "a hundred" = "100"); "₹5,000" = "5000 rupees", "$100" = "100 dollars".

const ONES = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ALIAS = { lac: "lakh", lacs: "lakh", lakhs: "lakh", crores: "crore", rs: "rupees", inr: "rupees" };

function rawTokens(s) {
  return String(s).toLowerCase()
    .replace(/₹\s*([\d.,]+(?:\s*(?:lakh|lakhs|lac|lacs|crore|crores|k))?)/g, "$1 rupees")
    .replace(/\$\s*([\d.,]+(?:\s*(?:million|billion|k))?)/g, "$1 dollars")
    .replace(/\ba (hundred|thousand)\b/g, "one $1")
    .replace(/%/g, " percent ").replace(/(\d),(?=\d)/g, "$1").replace(/[-–—/]/g, " ")
    .replace(/[^a-z0-9.' ]/g, " ").replace(/'/g, "")
    .split(/\s+/).map((t) => t.replace(/^\.+|\.+$/g, "")).filter(Boolean).map((t) => ALIAS[t] || t);
}
// items: [{t, ...meta, w1?}] → number-word runs collapsed into one digit token (keeps the first item's meta)
function mergeNumbers(items) {
  const out = [];
  let run = null;
  const flush = () => { if (run) { out.push({ ...run.first, t: String(run.total + run.cur) + (run.dec ? "." + run.dec : ""), w1: run.w1 }); run = null; } };
  const digit = (t) => (t in ONES && ONES[t] < 10 ? ONES[t] : null);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    // spoken decimals: "four point eight" = "4.8"
    if (run && !run.dec && it.t === "point" && i + 1 < items.length && digit(items[i + 1].t) != null) {
      run.dec = "";
      while (i + 1 < items.length && digit(items[i + 1].t) != null) { i++; run.dec += digit(items[i].t); run.w1 = items[i].w1; }
      continue;
    }
    if (run && run.dec) flush();
    const v = ONES[it.t] ?? TENS[it.t];
    const next = i + 1 < items.length ? items[i + 1].t : null;
    // "seven hundred and seventy-five": "and" inside a number after hundred/thousand
    if (run && it.t === "and" && (run.cur >= 100 || run.total) && next != null && (ONES[next] ?? TENS[next]) != null) continue;
    // years: "twenty twenty-three" = 2023, "nineteen ninety" = 1990
    if (run && TENS[it.t] != null && run.total === 0 && run.cur >= 10 && run.cur < 100 && (run.cur % 10 === 0 || run.cur < 20)) run.cur *= 100;
    if (v != null) { if (!run) run = { first: it, total: 0, cur: 0 }; run.cur += v; run.w1 = it.w1; }
    else if (run && it.t === "hundred") { run.cur = (run.cur || 1) * 100; run.w1 = it.w1; }
    else if (run && it.t === "thousand") { run.total += (run.cur || 1) * 1000; run.cur = 0; run.w1 = it.w1; }
    else { flush(); out.push(it); }
  }
  flush();
  return out;
}
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// Whisper spelling slack: SaaS/"sas", plurals, one-letter slips on longer words.
function same(a, b) {
  if (a === b || a + "s" === b || b + "s" === a) return true;
  if (/^\d/.test(a) || /^\d/.test(b) || Math.min(a.length, b.length) < 3) return false;
  return lev(a, b) <= (Math.max(a.length, b.length) >= 6 ? 2 : 1);
}
// Levenshtein alignment → [{s, h}] (s/h = index or null)
function align(S, H) {
  const n = S.length, m = H.length, D = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) D[i][0] = i;
  for (let j = 0; j <= m; j++) D[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (same(S[i - 1], H[j - 1]) ? 0 : 1));
  const pairs = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (same(S[i - 1], H[j - 1]) ? 0 : 1)) { pairs.push({ s: --i, h: --j }); }
    else if (i > 0 && D[i][j] === D[i - 1][j] + 1) pairs.push({ s: --i, h: null });
    else pairs.push({ s: null, h: --j });
  }
  return pairs.reverse();
}

/**
 * Match a take's Whisper words against the script lines it should contain.
 * lines: string[]; words: [{text,start,end}]; returns per-line {n, errs, first, last, heard} + ok.
 * A line fails when it has more than max(1, maxWer·n) errors, or no words were heard for it.
 */
export function matchTake(lines, words, maxWer = 0.2) {
  const S = mergeNumbers(lines.flatMap((l, li) => rawTokens(l).map((t) => ({ t, li }))));
  const H = mergeNumbers(words.flatMap((w, wi) => rawTokens(w.text).map((t) => ({ t, w0: wi, w1: wi }))));
  const res = lines.map(() => ({ n: 0, errs: 0, first: null, last: null, heard: [] }));
  for (const x of S) res[x.li].n++;
  let cur = 0;
  for (const p of align(S.map((x) => x.t), H.map((x) => x.t))) {
    if (p.s != null) cur = S[p.s].li;
    const r = res[cur];
    if (p.s == null || p.h == null || !same(S[p.s].t, H[p.h].t)) r.errs++;
    if (p.h != null) {
      const h = H[p.h];
      r.heard.push(h.t);
      if (p.s != null) { r.first = r.first == null ? h.w0 : Math.min(r.first, h.w0); r.last = r.last == null ? h.w1 : Math.max(r.last, h.w1); }
    }
  }
  let prevLast = -1;
  for (const r of res) {
    r.wer = r.n ? r.errs / r.n : 0;
    r.ok = r.first != null && r.first > prevLast && r.errs <= Math.max(1, Math.floor(maxWer * r.n));
    if (r.last != null) prevLast = r.last;
  }
  return { lines: res, ok: res.every((r) => r.ok), score: Math.max(...res.map((r) => (r.first == null ? 9 : r.wer))) };
}

/** Cut points (seconds) for each line of a matched take: keeps ~0.1 s lead-in and ~0.15 s tail, never overlapping. */
export function cutPlan(match, words) {
  const L = match.lines;
  return L.map((r, i) => {
    const s = words[r.first].start, e = words[r.last].end;
    const pe = i > 0 ? words[L[i - 1].last].end : null, ns = i < L.length - 1 ? words[L[i + 1].first].start : null;
    const start = pe == null ? Math.max(0, s - 0.1) : Math.max(s - 0.1, (pe + s) / 2);
    const end = ns == null ? e + 0.3 : Math.min(e + 0.15, (e + ns) / 2);
    const round = (x) => Math.round(x * 1000) / 1000;
    return {
      start: round(start), end: round(end),
      words: words.slice(r.first, r.last + 1).map((w, k) => ({ id: "w" + k, text: w.text, start: round(w.start - start), end: round(w.end - start) })),
    };
  });
}

/**
 * Re-time Whisper's words with forced-alignment times for the KNOWN script line (added 2026-10-08).
 *   whisper: [{text, start, end}] (what Whisper heard — keeps its digits/symbols, e.g. "90", "$30", so captions show numbers)
 *   aligned: [{word, start, end}] (every script word, timed by the wav2vec2 aligner)
 * → [{id, text, start, end}]:
 *   • a heard word that matches nothing in the script (a phantom from breath or silence, e.g. "lead") is dropped;
 *   • a heard word that is NOT in the script anywhere ("comma" for "calmer", "straight" for "rate") takes the script's word;
 *     a heard word that IS in the script keeps Whisper's spelling (Whisper may reorder "$50 billion" vs "fifty billion dollars");
 *   • times come from the aligner only when they agree with Whisper's within 0.35 s (the aligner occasionally slips by
 *     ~1 s on a run of short words) — otherwise Whisper's times stay;
 *   • a script word Whisper missed is inserted with its aligned times, unless a heard symbol already implies it ("$" → dollars).
 */
export function retimeWords(whisper, aligned, tol = 0.35) {
  const S = mergeNumbers(aligned.flatMap((a, k) => rawTokens(a.word).map((t) => ({ t, k, w1: k }))));
  const H = mergeNumbers(whisper.flatMap((w, wi) => rawTokens(w.text).map((t) => ({ t, w0: wi, w1: wi }))));
  const inScript = new Set(S.map((x) => x.t)), heard = new Set(H.map((x) => x.t));
  const out = [], used = new Set();
  for (const p of align(S.map((x) => x.t), H.map((x) => x.t))) {
    if (p.h == null && p.s != null) { // Whisper missed it → insert the script word (unless a heard symbol implies it)
      const s = S[p.s];
      if (heard.has(s.t)) continue;
      for (let k = s.k; k <= s.w1; k++) if (!used.has("a" + k)) { used.add("a" + k); out.push({ text: aligned[k].word, start: aligned[k].start, end: aligned[k].end }); }
      continue;
    }
    if (p.s == null) continue; // heard but not in the script → phantom, drop
    const s = S[p.s], h = H[p.h];
    for (let wi = h.w0; wi <= h.w1; wi++) {
      if (used.has("w" + wi)) continue;
      used.add("w" + wi);
      const w = whisper[wi], a0 = aligned[s.k], a1 = aligned[s.w1];
      const agree = Math.abs(a0.start - w.start) <= tol;
      const keep = /\d/.test(w.text) || rawTokens(w.text).every((t) => inScript.has(t));
      out.push({ text: keep ? w.text : aligned.slice(s.k, s.w1 + 1).map((a) => a.word).join(" "), start: agree ? a0.start : w.start, end: agree ? a1.end : w.end });
    }
  }
  // keep the spoken order (alignment order) and make times monotonic — mixing aligned and Whisper times must never
  // swap two neighbours ("So on" → "on So")
  let t = 0;
  for (const w of out) { w.start = Math.max(+w.start, t); w.end = Math.max(+w.end, w.start + 0.02); t = w.start + 0.01; }
  return out.map((w, i) => ({ id: "w" + i, text: w.text, start: +w.start.toFixed(3), end: +w.end.toFixed(3) }));
}
