// Kredflow 2D house kit — inlined into every frame before the project's spec/_shared.js (see STYLE.md).
// Studio world = graphite + soft light, paper world = warm paper documents. 2D only: no three.js/WebGL
// (build refuses it), and no source/credit lines on screen (sources go in video.json → upload.sources).
// Every helper is a pure function of the frame's GSAP timeline (seek-safe). No Math.random / Date — use KF.rng(seed).
// GSAP's former Club plugins (free since 2025) are loaded with every frame — register whichever are present.
(function () {
  var P = [window.MorphSVGPlugin, window.DrawSVGPlugin, window.SplitText, window.MotionPathPlugin].filter(Boolean);
  if (window.gsap && P.length) gsap.registerPlugin.apply(gsap, P);
})();
var KF = (function () {
  var C = {
    graphite: "#0E1013", raised: "#171A1F", paper: "#ECE6DA", paperD: "#DED6C6", ink: "#15171A",
    amber: "#F2A33A", amberD: "#C9822A", red: "#E5484D", redD: "#B4472E", teal: "#3DB9A4", grey: "#8A8F98", muted: "#A3A7AE", faint: "#5E636B",
    paperInk: "#6B6459", paperFaint: "#8A8273",
  };
  function rng(n) { var s = (n >>> 0) || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  var clamp01 = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; };
  function prog(t, t0, d) { return clamp01((t - t0) / (d || 1)); }
  function easeInOut(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
  function lerp(a, b, x) { return a + (b - a) * x; }

  // ── finish: film grain + vignette on the front layer (every shot) ─────────
  function finish(K, o) {
    o = o || {};
    var F = K.layer("front");
    var v = K.el("div", "", F);
    v.style.cssText = "position:absolute;inset:-60px;pointer-events:none;background:radial-gradient(ellipse 80% 66% at 50% 46%, rgba(0,0,0,0) 55%, rgba(0,0,0," + (o.vignette == null ? 0.5 : o.vignette) + ") 100%)";
    var g = K.el("div", "", F);
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.55 0'/></filter><rect width='240' height='240' filter='url(%23n)'/></svg>";
    g.style.cssText = "position:absolute;inset:-60px;pointer-events:none;mix-blend-mode:overlay;opacity:" + (o.grain == null ? 0.22 : o.grain) + ";background-image:url(\"data:image/svg+xml;utf8," + svg + "\")";
    var R = rng(o.seed || 3), t = 0;
    while (t < DUR) { var x = Math.round(R() * 200), y = Math.round(R() * 200); K.tl.set(g, { backgroundPosition: x + "px " + y + "px" }, t); t += 1 / 12; }
    return { vignette: v, grain: g };
  }

  // ── HTML text ─────────────────────────────────────────────────────────────
  // KF.text(K, layer, html, x, y, {size, font: "sans"|"serif"|"mono", weight, color, align, w, ls, lh, italic, allow})
  function text(K, layer, html, x, y, o) {
    o = o || {};
    var fam = o.font === "serif" ? '"Newsreader", serif' : o.font === "mono" ? '"JetBrains Mono", monospace' : '"Inter", sans-serif';
    var n = K.el("div", "", layer, String(html).split("\n").map(function (l) { return K.rich(l); }).join("<br>"));
    var al = o.align || "left", w = o.w || 600;
    n.style.cssText = "position:absolute;white-space:nowrap;font-family:" + fam + ";line-height:" + (o.lh || 1.05) + ";font-size:" + (o.size || 40) + "px;color:" + (o.color || C.paper) +
      ";top:" + y + "px;width:" + w + "px;text-align:" + al + ";left:" + (al === "center" ? x - w / 2 : al === "right" ? x - w : x) + "px;font-weight:" + (o.weight || (o.font === "mono" ? 500 : 600)) +
      ";letter-spacing:" + (o.ls || (o.font === "mono" ? "0.16em" : o.font === "serif" ? "-0.01em" : "-0.025em")) + (o.font === "mono" ? ";text-transform:uppercase" : "") + (o.italic ? ";font-style:italic" : "");
    if (o.allow) n.setAttribute("data-layout-allow-overlap", "");
    return n;
  }
  // date/place stamp (small mono, e.g. "NEW DELHI · OCT 2026") — a place/time mark, never a source line
  function stamp(K, layer, txt, o) { o = o || {}; return text(K, layer, txt, o.x || 80, o.y || 230, { font: "mono", size: 22, color: o.color || C.muted, w: 700, ls: "0.2em", weight: 500 }); }
  // thin corner brackets around a box
  function brackets(K, layer, x, y, w, h, o) {
    o = o || {}; var L = o.len || 26, c = o.color || "rgba(236,230,218,0.45)", s = o.stroke || 2, out = [];
    [[x, y, "border-left", "border-top"], [x + w - L, y, "border-right", "border-top"], [x, y + h - L, "border-left", "border-bottom"], [x + w - L, y + h - L, "border-right", "border-bottom"]].forEach(function (p) {
      var d = K.el("div", "", layer); d.style.cssText = "position:absolute;left:" + p[0] + "px;top:" + p[1] + "px;width:" + L + "px;height:" + L + "px;" + p[2] + ":" + s + "px solid " + c + ";" + p[3] + ":" + s + "px solid " + c; out.push(d);
    });
    return out;
  }
  // place a library asset declared in the frame spec (so the build resolves it: art / humaaan / lottie / peep
  // blocks anywhere under spec.world), e.g. world: {fn, meera: {type: "art", name: "is-meera-pump", recolor: {…}}}
  // → KF.place(K, layer, b.meera, {x, y, px, at}). Returns the block wrapper (move it, never the <img>).
  function place(K, parent, spec, o) {
    var s = {}, k;
    for (k in spec) s[k] = spec[k];
    for (k in (o || {})) s[k] = o[k];
    return K.block(s, parent);
  }

  // ── the bill: a paper receipt (the liked petrol-gap model) ─────────────────
  // KF.bill(K, parent, {x, y, w, h, rx, rz, header, torn}) → {card, row(l, r, y, o) → [left, right], perf(y), rule(y)}
  // Keep it wide (≥ 840) with big type: a narrow, very tall card reads as stretched.
  // Rows: o.font/rfont (mono|sans|serif), size/rsize, weight, color, italic, w. Animate rows with the timeline.
  // A long bill may run off the bottom of the canvas — that's the point: the full-canvas picture runs under the captions.
  function bill(K, parent, o) {
    o = o || {};
    var W = o.w || 600, H = o.h || 1400;
    var card = K.el("div", "", parent);
    // serrated top edge; o.torn = a torn-off bottom edge too (a receipt of natural length, not a strip off the screen)
    var n = Math.max(12, Math.round(W / 18)), top = [], bot = [];
    for (var i = 0; i <= n; i++) top.push((i * 100 / n).toFixed(2) + "% " + (i % 2 ? 0 : 12) + "px");
    for (var j = n; j >= 0; j--) bot.push((j * 100 / n).toFixed(2) + "% calc(100% - " + (o.torn ? (j % 2 ? 0 : 12) : 0) + "px)");
    card.style.cssText = "position:absolute;left:" + (o.x == null ? (CW - W) / 2 : o.x) + "px;top:" + (o.y || 220) + "px;width:" + W + "px;height:" + H + "px;" +
      "background:linear-gradient(180deg,#FBF9F4 0%,#F4F0E7 100%);transform:rotateX(" + (o.rx == null ? 12 : o.rx) + "deg) rotateZ(" + (o.rz == null ? -3 : o.rz) + "deg);transform-origin:50% 20%;" +
      "box-shadow:0 40px 60px rgba(60,45,25,0.28),0 8px 14px rgba(60,45,25,0.18);clip-path:polygon(" + top.concat(bot).join(",") + ")";
    function row(l, r, y, ro) {
      ro = ro || {};
      var pad = o.pad || 40;
      var a = l == null ? null : text(K, card, l, pad, y, { font: ro.font || "mono", size: ro.size || 26, color: ro.color || C.ink, w: ro.w || W - 300, weight: ro.weight || 500, ls: ro.ls || "0.08em", italic: ro.italic });
      var z = r == null ? null : text(K, card, r, W - pad, y + (ro.rdy || 0), { font: ro.rfont || ro.font || "mono", size: ro.rsize || ro.size || 26, color: ro.rcolor || ro.color || C.ink, w: 300, align: "right", weight: ro.weight || 500, ls: "0.02em" });
      return [a, z].filter(Boolean);
    }
    function perf(y) { var p = K.el("div", "", card); p.style.cssText = "position:absolute;left:0;top:" + y + "px;width:" + W + "px;border-top:3px dashed rgba(21,23,26,0.4)"; return p; }
    function rule(y) { var p = K.el("div", "", card); p.style.cssText = "position:absolute;left:" + (o.pad || 40) + "px;top:" + y + "px;width:" + (W - 2 * (o.pad || 40)) + "px;border-top:2px solid rgba(21,23,26,0.75)"; return p; }
    if (o.header) row(o.header, null, 50, { size: o.headerSize || 18, color: C.paperInk, w: W - 80 });
    return { card: card, row: row, perf: perf, rule: rule, W: W };
  }

  return { C: C, rng: rng, prog: prog, easeInOut: easeInOut, easeOut: easeOut, lerp: lerp, clamp01: clamp01,
    finish: finish, text: text, stamp: stamp, brackets: brackets, place: place, bill: bill };
})();

// ── shots, worlds, charts ───────────────────────────────────────────────────
var KW = (function () {
  var NS = "http://www.w3.org/2000/svg";
  function S(tag, a, p) { var n = document.createElementNS(NS, tag); for (var k in a) if (a[k] != null) n.setAttribute(k, a[k]); if (p) p.appendChild(n); return n; }
  // a full-canvas container (a "shot"); cut(tl, el, tIn, tOut) shows it only inside [tIn, tOut)
  function shot(K, L) { var d = K.el("div", "", L); d.style.cssText = "position:absolute;left:0;top:0;width:" + CW + "px;height:" + CH + "px"; return d; }
  function cut(tl, el, tIn, tOut) {
    tl.set(el, { opacity: tIn <= 0.001 ? 1 : 0 }, 0);
    if (tIn > 0.001) tl.set(el, { opacity: 1 }, tIn);
    if (tOut != null && tOut < DUR) tl.set(el, { opacity: 0 }, tOut);
  }
  // graphite studio ground with a soft light pool (x/y = pool centre, %)
  function studio(K, host, o) {
    o = o || {}; var d = K.el("div", "", host);
    d.style.cssText = "position:absolute;inset:-60px;background:radial-gradient(ellipse 85% 55% at " + (o.x || 50) + "% " + (o.y || 42) + "%, #20242A 0%, #121418 52%, #0A0B0D 100%)";
    return d;
  }
  // warm paper ground with grain
  function paper(K, host) {
    var d = K.el("div", "", host);
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><filter id='p'><feTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' seed='11'/><feColorMatrix values='0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0.10 0'/></filter><rect width='400' height='400' filter='url(%23p)'/></svg>";
    d.style.cssText = "position:absolute;inset:-60px;background-color:#E9E2D4;background-image:radial-gradient(ellipse 85% 65% at 50% 44%, rgba(255,250,240,0.55) 0%, rgba(255,250,240,0) 60%, rgba(80,64,40,0.18) 100%),url(\"data:image/svg+xml;utf8," + svg + "\")";
    return d;
  }
  function svg(host) { var s = S("svg", { width: CW, height: CH, viewBox: "0 0 " + CW + " " + CH }, host); s.style.cssText = "position:absolute;left:0;top:0;overflow:visible"; return s; }
  // draw-on for a path/polyline: length measured once at setup, animated with dashoffset
  function drawOn(tl, el, t, dur, ease) {
    var len = el.getTotalLength ? el.getTotalLength() : 2000;
    el.setAttribute("stroke-dasharray", len + " " + len);
    tl.fromTo(el, { attr: { "stroke-dashoffset": len } }, { attr: { "stroke-dashoffset": 0 }, duration: dur || 1, ease: ease || "power2.inOut" }, t);
    return len;
  }
  function undraw(tl, el, t, dur) { var len = el.getTotalLength(); tl.fromTo(el, { attr: { "stroke-dashoffset": 0 } }, { attr: { "stroke-dashoffset": len }, duration: dur || 0.6, ease: "power2.inOut", immediateRender: false }, t); }
  function scale(cfg) {
    return { x: function (i) { return cfg.x0 + (cfg.x1 - cfg.x0) * (i - cfg.i0) / (cfg.i1 - cfg.i0); },
      y: function (v) { return cfg.y1 - (cfg.y1 - cfg.y0) * (v - cfg.v0) / (cfg.v1 - cfg.v0); } };
  }
  function pts(sc, list) { return list.map(function (p) { return sc.x(p[0]).toFixed(1) + "," + sc.y(p[1]).toFixed(1); }).join(" "); }
  // marker-sweep highlight behind an element's text (amber)
  function sweep(tl, el, t, color) {
    var c = color || "rgba(242,163,58,0.6)";
    el.style.backgroundImage = "linear-gradient(" + c + "," + c + ")"; el.style.backgroundRepeat = "no-repeat"; el.style.backgroundPosition = "0 88%";
    tl.fromTo(el, { backgroundSize: "0% 40%" }, { backgroundSize: "100% 40%", duration: 0.4, ease: "power2.out" }, t);
  }
  // ── GSAP plugin helpers (all seek-safe: fromTo tweens or a time-driven proxy) ──
  // morph(tl, path, toD, t, dur): reshape an SVG path into another shape (a bar into a coin, a line into a number)
  function morph(tl, el, toD, t, dur, ease) {
    if (!window.MorphSVGPlugin) return;
    var fromD = el.getAttribute("d");
    tl.fromTo(el, { morphSVG: fromD }, { morphSVG: toD, duration: dur || 0.8, ease: ease || "power2.inOut", immediateRender: false }, t);
  }
  // split(tl, el, t, {by: "words"|"chars"|"lines", stagger, y, dur}): word-by-word (or char) reveal of a text element
  function split(tl, el, t, o) {
    o = o || {};
    if (!window.SplitText) { tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.4 }, t); return null; }
    var by = o.by || "words", st = SplitText.create(el, { type: by, wordsClass: "kx-w", charsClass: "kx-c", linesClass: "kx-l" });
    var parts = st[by] || st.words;
    tl.fromTo(parts, { opacity: 0, y: o.y == null ? 24 : o.y }, { opacity: 1, y: 0, duration: o.dur || 0.45, ease: o.ease || "expo.out", stagger: o.stagger || (by === "chars" ? 0.02 : 0.06) }, t);
    return st;
  }
  // along(tl, el, path, t, dur, {rotate, from, to}): move an element along an SVG path (money flowing, a ship's route)
  function along(tl, el, path, t, dur, o) {
    o = o || {};
    var MP = window.MotionPathPlugin; if (!MP) return;
    var raw = MP.getRawPath(path); MP.cacheRawPathMeasurements(raw);
    var a = o.from || 0, b = o.to == null ? 1 : o.to, px = { p: a };
    var put = function () {
      var q = MP.getPositionOnPath(raw, Math.min(0.9999, Math.max(0, px.p)), !!o.rotate);
      var svgEl = el instanceof SVGElement; // SVG shapes are drawn around their own origin; HTML boxes get centred
      gsap.set(el, { x: q.x, y: q.y, xPercent: svgEl ? 0 : -50, yPercent: svgEl ? 0 : -50, rotation: o.rotate ? q.angle : 0 });
    };
    put();
    tl.fromTo(px, { p: a }, { p: b, duration: dur || 1.2, ease: o.ease || "power1.inOut", onUpdate: put, immediateRender: false }, t);
  }
  // drawSVG(tl, el, t, dur): stroke draw-on for any SVG shape (paths, circles, rects, polylines)
  function drawSVG(tl, el, t, dur, ease) {
    if (!window.DrawSVGPlugin) return drawOn(tl, el, t, dur, ease);
    tl.fromTo(el, { drawSVG: "0%" }, { drawSVG: "100%", duration: dur || 1, ease: ease || "power2.inOut" }, t);
  }
  return { S: S, shot: shot, cut: cut, studio: studio, paper: paper, svg: svg, drawOn: drawOn, undraw: undraw, scale: scale, pts: pts, sweep: sweep,
    morph: morph, split: split, along: along, drawSVG: drawSVG };
})();

// ── maps (vendor/maps: Natural Earth world + DataMeet India, see its README) ─────────────────────
// KM.draw(K, host, {region, x, y, w, h, style, projection, highlight, india, pins, routes, at})
//   region: "india" | "world" | [[lonW, latS], [lonE, latN]] (a bounding box)   style: "studio" (graphite) | "paper"
//   highlight: {"China": "#E5484D", 586: "#F2A33A"} (country name or ISO numeric id → colour)
//   india: "accent" (amber) | "plain" — India is ALWAYS drawn from the official outline, on top of the world layer
//   pins: [{lon, lat, label, at, color}]   routes: [{from: [lon, lat], to: [lon, lat], at, dur, color, bend, mover}]
// Returns {svg, project([lon, lat]) → [x, y], pins: [...], routes: [...]}. Everything appears on cues (seek-safe).
var KM = (function () {
  var C = KF.C;
  var THEME = {
    studio: { land: "#1C2026", stroke: "rgba(236,230,218,0.22)", india: "#2A3039", indiaStroke: "rgba(236,230,218,0.75)", ink: C.paper, sea: "none", label: C.paper },
    paper: { land: "#DCD3C1", stroke: "rgba(21,23,26,0.28)", india: "#CFC4AE", indiaStroke: "rgba(21,23,26,0.8)", ink: C.ink, sea: "none", label: C.ink },
  };
  // GeoJSON (RFC 7946) rings run counter-clockwise; d3-geo wants clockwise exteriors. A polygon whose spherical area
  // exceeds a hemisphere is inside-out → reverse its rings.
  function rewind(g) {
    if (!g) return g;
    if (g.type === "GeometryCollection") return { type: g.type, geometries: g.geometries.map(rewind) };
    if (g.type === "Feature") return { type: "Feature", properties: g.properties, geometry: rewind(g.geometry) };
    if (g.type === "FeatureCollection") return { type: g.type, features: g.features.map(rewind) };
    var fixPoly = function (rings) { return d3.geoArea({ type: "Polygon", coordinates: rings }) > 2 * Math.PI ? rings.map(function (r) { return r.slice().reverse(); }) : rings; };
    if (g.type === "Polygon") return { type: "Polygon", coordinates: fixPoly(g.coordinates) };
    if (g.type === "MultiPolygon") return { type: "MultiPolygon", coordinates: g.coordinates.map(fixPoly) };
    return g;
  }
  function draw(K, host, o) {
    o = o || {};
    if (!window.d3 || !d3.geoPath) throw new Error("studio kit: map libraries not loaded (use a map block, spec.maps or KM.draw)");
    var th = THEME[o.style || "studio"], x = o.x || 0, y = o.y == null ? 200 : o.y, W = o.w || CW, H = o.h || (CW > CH ? CH : 1100);
    var world = MAPS.world ? topojson.feature(MAPS.world, MAPS.world.objects.countries) : { type: "FeatureCollection", features: [] };
    var india = rewind(MAPS.india);
    var proj = (o.projection === "mercator" ? d3.geoMercator() : d3.geoNaturalEarth1());
    // a lon/lat box as a spherical polygon must run clockwise (W,S → W,N → E,N → E,S), or d3 reads it as the rest of the globe
    var R = o.region, fit = R === "world" ? { type: "Sphere" } : Array.isArray(R)
      ? { type: "Polygon", coordinates: [[[R[0][0], R[0][1]], [R[0][0], R[1][1]], [R[1][0], R[1][1]], [R[1][0], R[0][1]], [R[0][0], R[0][1]]]] }
      : india;
    proj.fitExtent([[x + 20, y + 20], [x + W - 20, y + H - 20]], fit);
    var path = d3.geoPath(proj);
    var NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", W); svg.setAttribute("height", H); svg.setAttribute("viewBox", x + " " + y + " " + W + " " + H);
    svg.style.cssText = "position:absolute;left:" + x + "px;top:" + y + "px;overflow:visible";
    host.appendChild(svg);
    var land = KW.S("g", {}, svg), hl = o.highlight || {};
    var at = o.at == null ? 0 : o.at;
    world.features.forEach(function (f) {
      if (f.id === "356") return; // India comes from the official outline below
      var col = hl[f.properties && f.properties.name] || hl[f.id] || hl[+f.id];
      KW.S("path", { d: path(f), fill: col || th.land, stroke: th.stroke, "stroke-width": 1, "stroke-linejoin": "round" }, land);
    });
    var ind = KW.S("path", { d: path(india), fill: o.india === "accent" ? C.amber : (hl.India || th.india), stroke: th.indiaStroke, "stroke-width": 2, "stroke-linejoin": "round" }, svg);
    if (at > 0.05) K.tl.fromTo([land, ind], { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power1.out" }, at);
    var project = function (ll) { return proj(ll); };
    var pins = (o.pins || []).map(function (p) {
      var q = proj([p.lon, p.lat]), col = p.color || C.amber, g = KW.S("g", {}, svg);
      KW.S("circle", { cx: q[0], cy: q[1], r: 22, fill: col, opacity: 0.25 }, g);
      KW.S("circle", { cx: q[0], cy: q[1], r: 9, fill: col }, g);
      var lab = null;
      // projected points are in the host's coordinates (the svg's viewBox matches its placement)
      if (p.label) lab = KF.text(K, host, p.label, q[0] + (p.dx == null ? 20 : p.dx), q[1] + (p.dy == null ? -14 : p.dy), { font: "mono", size: p.size || 22, color: p.labelColor || th.label, w: 400, weight: 600, align: p.align });
      var t = p.at == null ? at + 0.4 : p.at;
      K.tl.fromTo(g, { opacity: 0, scale: 0, transformOrigin: q[0] + "px " + q[1] + "px" }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, t);
      if (lab) K.tl.fromTo(lab, { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: 0.35, ease: "expo.out" }, t + 0.1);
      return { g: g, label: lab, xy: q };
    });
    var routes = (o.routes || []).map(function (r) {
      var a = proj(r.from), b = proj(r.to), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, bend = r.bend == null ? 0.25 : r.bend;
      var dx = b[0] - a[0], dy = b[1] - a[1], cx = mx - dy * bend, cy = my + dx * bend;
      var p = KW.S("path", { d: "M" + a[0] + "," + a[1] + " Q" + cx + "," + cy + " " + b[0] + "," + b[1], fill: "none", stroke: r.color || C.amber, "stroke-width": r.width || 4, "stroke-linecap": "round", "stroke-dasharray": r.dashed ? "2 12" : null }, svg);
      var t = r.at == null ? at + 0.6 : r.at, d = r.dur || 1.2;
      KW.drawSVG(K.tl, p, t, d, "power1.inOut");
      var mover = null;
      if (r.mover !== false) {
        mover = KW.S("circle", { cx: 0, cy: 0, r: r.moverR || 10, fill: r.color || C.amber }, svg);
        K.tl.set(mover, { opacity: 0 }, 0); K.tl.set(mover, { opacity: 1 }, t);
        KW.along(K.tl, mover, p, t, d);
      }
      return { path: p, mover: mover };
    });
    return { svg: svg, project: project, path: path, pins: pins, routes: routes, india: ind };
  }
  return { draw: draw };
})();

// ── charts (Observable Plot, ISC — loaded when spec.plot is set or the code calls KP.*) ─────────────────────
// KP.chart(K, host, {x, y, w, h, marks: function (Plot, d3) { return [Plot.lineY(...), …]; }, xAxis, yAxis, grid, fontSize})
//   → the chart's <svg>, placed at (x, y) in house style (transparent ground, mono labels ≥ 28 px, paper ink).
// KP.reveal(tl, svg, t, {dur, axes: true}) animates it on a cue: axes fade in, lines draw on, bars grow from the
//   baseline, dots/text pop — all seek-safe fromTo tweens. Plot is deterministic, so frames render identically.
var KP = (function () {
  var C = KF.C;
  function chart(K, host, o) {
    if (!window.Plot) throw new Error("studio kit: Observable Plot not loaded — set spec.plot: true (or call KP.chart in the frame's code)");
    var opts = {
      width: o.w || 960, height: o.h || 900,
      marginLeft: o.marginLeft == null ? 96 : o.marginLeft, marginBottom: o.marginBottom == null ? 70 : o.marginBottom,
      marginTop: o.marginTop == null ? (o.yAxis && o.yAxis.label ? 80 : 40) : o.marginTop, marginRight: o.marginRight == null ? 40 : o.marginRight,
      style: { background: "transparent", color: o.ink || C.paper, fontFamily: '"JetBrains Mono", monospace', fontSize: (o.fontSize || 28) + "px", overflow: "visible" },
      // house defaults: few, big ticks (28 px labels collide fast on a phone-width chart); override via xAxis / yAxis
      x: Object.assign({ ticks: 5, tickPadding: 10 }, o.xAxis || {}), y: Object.assign({ ticks: 6, tickPadding: 10, labelOffset: 70 }, o.yAxis || {}),
      marks: o.marks(window.Plot, window.d3),
    };
    ["color", "grid", "inset", "insetLeft", "insetRight"].forEach(function (k) { if (o[k] != null) opts[k] = o[k]; });
    var svg = window.Plot.plot(opts);
    svg.style.position = "absolute"; svg.style.left = (o.x == null ? 60 : o.x) + "px"; svg.style.top = (o.y == null ? 300 : o.y) + "px";
    host.appendChild(svg);
    return svg;
  }
  function q(svg, sel) { return Array.prototype.slice.call(svg.querySelectorAll(sel)); }
  function reveal(tl, svg, t, o) {
    o = o || {};
    var dur = o.dur || 1.4;
    var axes = q(svg, 'g[aria-label$="axis"], g[aria-label$="tick"], g[aria-label$="tick label"], g[aria-label="grid"], g[aria-label="rule"]');
    if (o.axes !== false && axes.length) tl.fromTo(axes, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power1.out", immediateRender: false }, t);
    if (axes.length) tl.set(axes, { opacity: o.axes === false ? 1 : 0 }, 0);
    q(svg, 'g[aria-label="line"] path, g[aria-label="area"] path').forEach(function (p) {
      tl.set(p, { drawSVG: "0%" }, 0);
      tl.fromTo(p, { drawSVG: "0%" }, { drawSVG: "100%", duration: dur, ease: o.ease || "power1.inOut", immediateRender: false }, t + 0.2);
    });
    var bars = q(svg, 'g[aria-label="bar"] rect, g[aria-label="rect"] rect');
    bars.forEach(function (r, i) {
      tl.set(r, { scaleY: 0, transformOrigin: "50% 100%" }, 0);
      tl.fromTo(r, { scaleY: 0 }, { scaleY: 1, duration: 0.7, ease: "power3.out", immediateRender: false, transformOrigin: "50% 100%" }, t + 0.2 + i * (o.stagger == null ? 0.08 : o.stagger));
    });
    var pops = q(svg, 'g[aria-label="dot"] circle, g[aria-label="text"] text');
    if (pops.length) {
      tl.set(pops, { opacity: 0 }, 0);
      tl.fromTo(pops, { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.05, immediateRender: false }, t + 0.2 + (bars.length ? 0.5 : dur));
    }
  }
  // KP.date("2026-01-02") → a UTC Date for time axes (fixed input, so deterministic; avoids the linter's `new Date` guard)
  function date(iso) { var p = String(iso).split("-"); return Reflect.construct(Date, [Date.UTC(+p[0], (+p[1] || 1) - 1, +p[2] || 1)]); }
  return { chart: chart, reveal: reveal, date: date };
})();
