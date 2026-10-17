/* Studio kit runtime — inlined into every generated frame by bin/build-frames.mjs.
   Globals provided by the generator: FID, DUR, SPEC (cues already resolved to seconds),
   LOOK, CUSTOM (array of bespoke block functions), IDX, TOTAL.
   Contract: one paused GSAP timeline, fromTo entrances only, no exits, no repeat/yoyo,
   no randomness, transforms/opacity/clip-path/filter only. */
(function () {
  var host = document.querySelector('[data-composition-id="' + FID + '"]');
  var stage = host.querySelector(".k-stage");
  var chromeEl = host.querySelector(".k-chrome");
  var frameRoot = stage.parentNode.parentNode; // stage → .k-cam → this frame's root
  var tl = gsap.timeline({ paused: true });
  var uid = 0;

  // ── dom helpers ──────────────────────────────────────────────────────────
  function el(tag, cls, parent, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    if (parent) parent.appendChild(n);
    return n;
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  // *emph*  ~~strikable~~  \n handled by callers
  function rich(s) {
    return esc(s)
      .replace(/~~(.+?)~~/g, '<span class="k-stw k-st">$1<i class="k-strike"></i></span>')
      .replace(/\*(.+?)\*/g, '<span class="k-em">$1</span>')
      // money / multiples keep their case in lowercase or uppercase looks (₹12L, 3X, 40%)
      .replace(/([₹$€£−-]*[₹$€£]\d[\d,.]*[A-Za-z%]{0,3}|\b\d[\d,.]*[KLMBX%]\b)/g, '<span class="k-nc">$1</span>');
  }
  function num(v, d) { return typeof v === "number" ? v : d; }
  function arr(v) { return Array.isArray(v) ? v : v == null ? [] : [v]; }
  function tone(t) { return t ? " t-" + t : ""; }

  // ── motion families ──────────────────────────────────────────────────────
  // kind: text | hero | item | chrome | soft
  var FAM = {
    rise: {
      text: [{ opacity: 0, y: 36 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }],
      item: [{ opacity: 0, y: 48 }, { opacity: 1, y: 0, duration: 0.65, ease: "expo.out" }],
      hero: [{ opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.8, ease: "expo.out" }],
    },
    slam: {
      text: [{ opacity: 0, scale: 1.16, filter: "blur(6px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.42, ease: "expo.out" }],
      item: [{ opacity: 0, x: -70 }, { opacity: 1, x: 0, duration: 0.38, ease: "expo.out" }],
      hero: [{ opacity: 0, scale: 1.55, filter: "blur(14px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.6, ease: "expo.out" }],
    },
    mask: {
      text: [{ clipPath: "inset(0% 0% 100% 0%)", y: 34 }, { clipPath: "inset(0% 0% 0% 0%)", y: 0, duration: 0.85, ease: "expo.out" }],
      item: [{ clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.75, ease: "power3.inOut" }],
      hero: [{ clipPath: "inset(0% 0% 100% 0%)", y: 70 }, { clipPath: "inset(0% 0% 0% 0%)", y: 0, duration: 1.05, ease: "expo.out" }],
    },
    blur: {
      text: [{ opacity: 0, filter: "blur(16px)", scale: 1.03 }, { opacity: 1, filter: "blur(0px)", scale: 1, duration: 0.9, ease: "power2.out" }],
      item: [{ opacity: 0, filter: "blur(10px)", y: 20 }, { opacity: 1, filter: "blur(0px)", y: 0, duration: 0.8, ease: "power2.out" }],
      hero: [{ opacity: 0, filter: "blur(26px)", scale: 1.08 }, { opacity: 1, filter: "blur(0px)", scale: 1, duration: 1.2, ease: "power2.out" }],
    },
    slide: {
      text: [{ opacity: 0, x: -120, clipPath: "inset(0% 100% 0% 0%)" }, { opacity: 1, x: 0, clipPath: "inset(0% 0% 0% 0%)", duration: 0.6, ease: "power4.out" }],
      item: [{ opacity: 0, x: 160 }, { opacity: 1, x: 0, duration: 0.55, ease: "power4.out" }],
      hero: [{ clipPath: "inset(0% 100% 0% 0%)", x: -60 }, { clipPath: "inset(0% 0% 0% 0%)", x: 0, duration: 0.8, ease: "power4.out" }],
    },
    type: {
      // text/hero are typed character-by-character (see typeOn); item = stepped rise
      text: null,
      item: [{ opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.32, ease: "steps(4)" }],
      hero: null,
    },
    fade: {
      text: [{ opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power2.out" }],
      item: [{ opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power2.out" }],
      hero: [{ opacity: 0 }, { opacity: 1, duration: 0.8, ease: "power2.out" }],
    },
  };
  var CHROME = [{ opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }];

  function famFor(kind, override) {
    if (override) return override;
    if (kind === "hero") return SPEC.heroMotion || LOOK.motion.hero || LOOK.motion.family;
    return SPEC.motion || LOOK.motion.family;
  }
  function clone(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }

  // split text nodes into per-char spans (keeps .k-em / .k-st wrappers intact)
  function splitChars(node) {
    var out = [];
    (function walk(n) {
      var kids = Array.prototype.slice.call(n.childNodes);
      kids.forEach(function (c) {
        if (c.nodeType === 3) {
          var frag = document.createDocumentFragment();
          var parts = c.textContent.split(/(\s+)/);
          parts.forEach(function (w) {
            if (!w) return;
            if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(w)); return; }
            var ws = document.createElement("span");
            ws.style.display = "inline-block";
            ws.style.whiteSpace = "nowrap";
            for (var i = 0; i < w.length; i++) {
              var s = document.createElement("span");
              s.textContent = w[i];
              ws.appendChild(s);
              out.push(s);
            }
            frag.appendChild(ws);
          });
          c.parentNode.replaceChild(frag, c);
        } else if (c.nodeType === 1 && !c.classList.contains("k-strike")) walk(c);
      });
    })(node);
    return out;
  }
  function typeOn(node, t, kind) {
    var chars = splitChars(node);
    if (!chars.length) return;
    var total = kind === "hero" ? 0.7 : Math.min(0.9, 0.035 * chars.length);
    var step = total / chars.length;
    tl.set(chars, { opacity: 0 }, 0);
    chars.forEach(function (c, i) { tl.set(c, { opacity: 1 }, t + i * step); });
  }

  function enter(node, t, kind, override) {
    if (t == null) t = 0;
    kind = kind || "text";
    if (kind === "chrome") { tl.fromTo(node, CHROME[0], clone(CHROME[1]), t); return; }
    // anything cued at the very top of a frame is legible on frame 0 (thumbnail-safe hooks)
    if (t < 0.05 && !SPEC.animateFirst) { tl.fromTo(node, { scale: 1.04 }, { scale: 1, duration: 0.45, ease: "power3.out" }, 0); return; }
    var fam = famFor(kind, override);
    var k = kind === "soft" ? "item" : kind;
    if (fam === "type" && (k === "text" || k === "hero")) { typeOn(node, t, k); return; }
    var def = (FAM[fam] || FAM.rise)[k] || FAM.rise[k];
    var to = clone(def[1]);
    tl.fromTo(node, clone(def[0]), to, t);
  }
  function strike(node, t) {
    var s = node.querySelector(".k-strike");
    if (!s) { s = el("i", "k-strike", node); node.classList.add("k-stw"); }
    tl.fromTo(s, { scaleX: 0 }, { scaleX: 1, duration: 0.38, ease: "power3.out" }, t);
    tl.fromTo(s.parentNode, { opacity: 1 }, { opacity: 0.5, duration: 0.38, ease: "power2.out" }, t);
  }
  function dim(nodes, t, to) {
    tl.fromTo(nodes, { opacity: 1 }, { opacity: to == null ? 0.45 : to, duration: 0.6, ease: "power2.inOut" }, t);
  }
  function fmtNum(v, o) {
    var d = o.decimals || 0;
    var s = (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);
    if (o.group === "in" || o.group === "intl") {
      var p = s.split("."), i = p[0], neg = i[0] === "-";
      if (neg) i = i.slice(1);
      if (o.group === "in" && i.length > 3) i = i.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + i.slice(-3);
      else if (o.group === "intl") i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      s = (neg ? "-" : "") + i + (p[1] ? "." + p[1] : "");
    }
    return (o.prefix || "") + s + (o.suffix || "");
  }
  function countUp(node, t, o) {
    var proxy = { v: num(o.from, 0) };
    node.style.textTransform = "none";
    node.textContent = fmtNum(proxy.v, o);
    tl.fromTo(proxy, { v: num(o.from, 0) }, {
      v: o.to, duration: num(o.dur, 0.9), ease: "power3.out",
      onUpdate: function () { node.textContent = fmtNum(proxy.v, o); },
    }, t);
  }
  function drawPath(path, len, t, dur) {
    path.setAttribute("stroke-dasharray", String(len));
    tl.fromTo(path, { strokeDashoffset: len }, { strokeDashoffset: 0, duration: dur || 0.8, ease: "power3.out" }, t);
  }
  var SVGNS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  // Tabler outline icon (ICONS = only the icons this spec uses, injected by the generator).
  // draw: strokes draw on over `dur` (default) — false = enter as an item.
  function icon(name, parent, o) {
    o = o || {};
    var px = o.px || 120, nodes = ICONS[name] || [];
    var col = o.tone === "ink" ? "var(--ink)" : o.tone === "muted" ? "var(--muted)" : o.tone === "neg" ? "var(--neg)" : "var(--accentText)";
    var s = svg("svg", { width: px, height: px, viewBox: "0 0 24 24", fill: "none", "stroke-width": o.stroke || 1.6, "stroke-linecap": "round", "stroke-linejoin": "round" }, parent);
    s.style.stroke = col; s.style.display = "block"; s.style.flex = "none"; s.style.overflow = "visible";
    var parts = nodes.map(function (nd) { var p = svg(nd[0], nd[1], s); p.setAttribute("pathLength", "1"); return p; });
    if (o.at != null) {
      if (o.draw === false || o.at < 0.05) enter(s, o.at, "item", o.motion);
      else parts.forEach(function (p, i) { drawPath(p, 1, o.at + i * 0.08, o.dur || 0.9); });
    }
    return s;
  }

  var K = { tl: tl, el: el, rich: rich, enter: enter, strike: strike, dim: dim, countUp: countUp, fmtNum: fmtNum, drawPath: drawPath, svg: svg, icon: icon, splitChars: splitChars, look: LOOK, spec: SPEC };

  // ── blocks ───────────────────────────────────────────────────────────────
  var B = {};

  B.headline = function (b, w) {
    var lines = String(b.text).split("\n");
    var ats = arr(b.at);
    lines.forEach(function (ln, i) {
      var n = el("div", "k-head k-line k-" + (b.size || "h2") + tone(b.tone), w, rich(ln));
      var t = ats[i] != null ? ats[i] : (ats[0] || 0) + i * 0.14;
      enter(n, t, b.kind || "text", b.motion);
    });
  };
  B.label = function (b, w) {
    var n = el("div", "k-mono" + tone(b.tone), w, rich(b.text));
    if (b.size) n.style.fontSize = b.size + "px";
    enter(n, b.at || 0, "chrome");
  };
  B.text = function (b, w) {
    var n = el("div", "k-body" + tone(b.tone), w, rich(b.text));
    if (b.size) n.style.fontSize = b.size + "px";
    enter(n, b.at || 0, "text", b.motion || (famFor("text") === "type" ? "fade" : null));
  };
  B.figure = function (b, w) {
    var sizes = { xl: 210, l: 160, m: 116, s: 84 };
    var px = (b.px || sizes[b.size || "l"]);
    if (b.label) { var lb = el("div", "k-mono", w, rich(b.label)); lb.style.marginBottom = "10px"; enter(lb, b.labelAt != null ? b.labelAt : b.at, "chrome"); }
    var row = el("div", "k-row", w); row.style.alignItems = "baseline"; row.style.gap = "18px";
    if (b.align === "center") row.style.justifyContent = "center";
    var v = el("div", "k-display" + tone(b.tone || "accent"), row, rich(b.value || ""));
    v.style.fontSize = "calc(" + px + "px * var(--ds))";
    v.style.fontVariantNumeric = "tabular-nums";
    v.style.lineHeight = "1";
    if (b.count) countUp(v, b.count.at != null ? b.count.at : b.at, b.count);
    enter(v, b.at || 0, b.kind || "hero", b.motion);
    if (b.unit) {
      var u = el("div", "k-head t-muted", row, rich(b.unit));
      u.style.fontSize = "calc(" + Math.round(px * 0.34) + "px * var(--ds))";
      enter(u, b.unitAt != null ? b.unitAt : b.at, "item");
    }
    if (b.tag) {
      var tg = el("div", "k-chip t-accent", w, rich(b.tag.text));
      tg.style.marginTop = "18px";
      enter(tg, b.tag.at, "item");
    }
  };
  B.bars = function (b, w) {
    var W = (typeof CW !== "undefined" && CW > CH ? 1640 : 920), H = b.height || 340, n = b.n || 12, dir = b.dir || "up";
    var colW = W / n, barW = Math.round(colW * (b.barWidth || 0.62));
    var labH = 44;
    w.style.width = W + "px";
    w.style.height = H + labH + "px";
    var axisY = dir === "up" ? H : labH;
    var max = b.max || 0;
    (b.series || []).forEach(function (s) { (s.values || []).forEach(function (v) { if (Math.abs(v) > max) max = Math.abs(v); }); });
    if (b.axisLabel) {
      var al = el("div", "k-mono", w, rich(b.axisLabel.text || b.axisLabel));
      al.style.textAlign = b.axisLabel.side === "left" ? "left" : "right"; al.style.height = "38px";
      enter(al, b.axisLabel.at != null ? b.axisLabel.at : b.at, "chrome");
      w.style.height = H + labH + 38 + "px";
      w = el("div", "", w); w.style.position = "relative"; w.style.width = W + "px"; w.style.height = H + labH + "px";
    }
    var axis = el("div", "", w);
    axis.style.cssText = "position:absolute;left:0;width:" + W + "px;height:2px;top:" + (axisY - 1) + "px;background:var(--line);transform-origin:0 50%";
    tl.fromTo(axis, { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: "power3.out" }, b.at || 0);
    var labels = b.labels || Array.from({ length: n }, function (_, i) { return (b.labelPrefix == null ? "M" : b.labelPrefix) + (i + 1); });
    labels.forEach(function (tx, i) {
      var l = el("div", "k-mono", w, esc(tx));
      l.style.cssText += ";position:absolute;font-size:19px;letter-spacing:0.02em;text-align:center;width:" + colW + "px;left:" + i * colW + "px;top:" + (dir === "up" ? H + 12 : 8) + "px";
      tl.fromTo(l, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power2.out" }, (b.at || 0) + 0.2 + i * 0.02);
    });
    (b.series || []).forEach(function (s, si) {
      var bars = [], tips = [];
      var st = s.stagger != null ? s.stagger : 0.06, k = 0;
      (s.values || []).forEach(function (v, i) {
        if (!v) { tips.push(null); return; }
        var h = Math.max(4, Math.round((Math.abs(v) / max) * (H - 20)));
        var bar = el("div", "", w);
        var col = s.tone === "ink" ? "var(--ink)" : s.tone === "muted" ? "var(--faint)" : s.tone === "neg" ? "var(--neg)" : "var(--accent)";
        var left = Math.round(i * colW + (colW - barW) / 2);
        bar.style.cssText = "position:absolute;left:" + left + "px;width:" + barW + "px;height:" + h + "px;background:" + col + ";" +
          (dir === "up" ? "top:" + (axisY - h) + "px;transform-origin:50% 100%;border-radius:" + (LOOK.shape.radius ? "6px 6px 0 0" : "0")
                        : "top:" + (axisY + 1) + "px;transform-origin:50% 0%;border-radius:" + (LOOK.shape.radius ? "0 0 6px 6px" : "0"));
        tl.fromTo(bar, { scaleY: 0 }, { scaleY: 1, duration: s.dur || 0.7, ease: "power3.out" }, (s.at || 0) + st * k++);
        bars.push(bar);
        tips.push([left + barW / 2, dir === "up" ? axisY - h : axisY + h]);
        if (s.label && (s.label.bar == null ? i === 0 : s.label.bar === i)) {
          var lb = el("div", "k-display" + tone(s.label.tone || (s.tone === "ink" ? "ink" : "accent")), w, rich(s.label.text));
          var fs = s.label.px || 64;
          var fsz = fs * (LOOK.ds || 1), tall = h > fsz + 16;
          var ly = dir === "up" ? (tall ? axisY - h - 4 : axisY - h - fsz - 12) : (tall ? axisY + h - fsz : axisY + h + 14);
          var lx = tall ? left + barW + 18 : Math.max(0, left - 10);
          lb.style.cssText += ";position:absolute;white-space:nowrap;font-size:calc(" + fs + "px * var(--ds));line-height:1;left:" + lx + "px;top:" + ly + "px";
          if (s.label.count) countUp(lb, s.label.at != null ? s.label.at : s.at, s.label.count);
          enter(lb, s.label.at != null ? s.label.at : s.at, "item");
        }
      });
      if (s.ghostAt != null) dim(bars, s.ghostAt, 0.16);
      if (s.lineAt != null) {
        var pts = tips.filter(Boolean);
        if (pts.length > 1) {
          var sv = svg("svg", { class: "k-svg", width: W, height: H + labH, viewBox: "0 0 " + W + " " + (H + labH) }, w);
          sv.style.left = "0"; sv.style.top = "0";
          var d = "M" + pts.map(function (p) { return p[0] + " " + p[1]; }).join(" L");
          var len = 0; for (var i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          var p = svg("path", { d: d, fill: "none", stroke: s.lineColor || "var(--accent)", "stroke-width": 4, "stroke-linecap": "round", "stroke-linejoin": "round" }, sv);
          p.style.stroke = s.lineColor || "var(--accent)";
          drawPath(p, Math.ceil(len), s.lineAt, 0.9);
        }
      }
    });
  };
  B.meter = function (b, w) {
    w.classList.add("w-full");
    var top = el("div", "k-row", w); top.style.justifyContent = "space-between"; top.style.marginBottom = "14px";
    var lab = el("div", "k-body t-ink", top, rich(b.label || "")); lab.style.fontSize = "32px"; lab.style.fontWeight = "600";
    var ro = el("div", "k-display t-accent", top, ""); ro.style.fontSize = "calc(46px * var(--ds))";
    var tr = el("div", "k-track", w);
    var fill = el("div", "k-fill", tr);
    var steps = b.steps || [];
    var first = steps[0] ? steps[0].at : b.at || 0;
    enter(top, b.at != null ? b.at : first, "item");
    enter(tr, b.at != null ? b.at : first, "item");
    var prev = 0, o = { suffix: b.suffix == null ? "%" : b.suffix, prefix: b.prefix || "" };
    ro.textContent = fmtNum(0, o);
    tl.set(fill, { scaleX: 0 }, 0);
    steps.forEach(function (s) {
      var dur = s.dur || 0.8;
      tl.fromTo(fill, { scaleX: prev / 100 }, { scaleX: s.value / 100, duration: dur, ease: "power3.inOut", immediateRender: false }, s.at);
      countUp(ro, s.at, { from: prev, to: s.value, dur: dur, suffix: o.suffix, prefix: o.prefix });
      prev = s.value;
    });
  };
  B.chips = function (b, w) {
    var row = el("div", "k-row", w); row.style.flexWrap = "wrap"; row.style.gap = "16px";
    if (b.align === "center") row.style.justifyContent = "center";
    (b.items || []).forEach(function (it) {
      var c = el("div", "k-chip" + tone(it.tone), row, it.icon ? "" : rich(it.text));
      if (it.icon) { c.style.display = "inline-flex"; c.style.alignItems = "center"; c.style.gap = "12px"; icon(it.icon, c, { px: 34, tone: it.tone || "ink", stroke: 2 }); el("span", "", c, rich(it.text)); }
      enter(c, it.at, "item", b.motion);
    });
  };
  B.cards = function (b, w) {
    w.classList.add("w-full");
    var col = el("div", "k-col", w); col.style.gap = (b.gap || 18) + "px";
    var cards = [];
    (b.items || []).forEach(function (it, i) {
      var c = el("div", "k-card", col);
      var head = el("div", "k-row", c);
      if (b.numbered) el("div", "k-num", head, String(i + 1));
      else if (it.icon) icon(it.icon, head, { px: 60, tone: it.iconTone || "accent", stroke: 1.8 });
      var tx = el("div", "k-col", head); tx.style.gap = "6px";
      var ti = el("div", "k-head t-ink", tx, rich(it.title)); ti.style.fontSize = "calc(" + (b.titlePx || 50) + "px * var(--ds))";
      if (it.sub) { var su = el("div", "k-body", tx, rich(it.sub)); su.style.fontSize = "30px"; }
      (it.rows || []).forEach(function (r) {
        var rw = el("div", "k-head" + tone(r.tone || "ink"), c, rich(r.text));
        rw.style.fontSize = "calc(" + (r.px || 40) + "px * var(--ds))"; rw.style.marginTop = "14px";
        if (!b.numbered) rw.style.marginLeft = "0"; else rw.style.marginLeft = "82px";
        enter(rw, r.at, "item");
      });
      enter(c, it.at, "item", b.motion);
      cards.push(c);
    });
    if (b.focusLast && cards.length > 1) dim(cards.slice(0, -1), b.items[b.items.length - 1].at + 0.1, 0.5);
  };
  B.lines = function (b, w) {
    var col = el("div", "k-col", w); col.style.gap = (b.gap || 10) + "px";
    if (b.align === "center") col.style.alignItems = "center";
    (b.items || []).forEach(function (it) {
      var n = el("div", "k-head k-" + (it.size || b.size || "h2") + tone(it.tone), col, rich(it.text));
      n.style.display = "inline-block"; n.style.position = "relative";
      enter(n, it.at, "text", b.motion);
      if (it.strike != null) strike(n, it.strike);
    });
  };
  B.hero = function (b, w) {
    var box = el("div", "", w); box.style.position = "relative";
    if (b.glow) {
      var g = el("div", "", box);
      g.style.cssText = "position:absolute;left:50%;top:50%;width:760px;height:760px;margin:-380px 0 0 -380px;border-radius:50%;background:radial-gradient(circle, var(--glow, rgba(128,128,128,0.18)) 0%, transparent 62%);";
      g.style.setProperty("--glow", b.glowColor || "color-mix(in srgb, var(--accent) 22%, transparent)");
      tl.fromTo(g, { opacity: 0 }, { opacity: 1, duration: 0.9, ease: "power2.out" }, b.at + 0.1);
    }
    if (b.ring) {
      var R = b.ring === true ? 300 : b.ring;
      var sv = svg("svg", { class: "k-svg", width: R * 2 + 8, height: R * 2 + 8 }, box);
      sv.style.left = "50%"; sv.style.top = "50%"; sv.style.marginLeft = -(R + 4) + "px"; sv.style.marginTop = -(R + 4) + "px";
      var c = svg("circle", { cx: R + 4, cy: R + 4, r: R, fill: "none", "stroke-width": 2, transform: "rotate(-90 " + (R + 4) + " " + (R + 4) + ")" }, sv);
      c.style.stroke = "var(--accent)"; c.style.opacity = "0.55";
      drawPath(c, Math.ceil(2 * Math.PI * R), b.at + 0.05, 1.1);
    }
    var n = el("div", "k-display" + tone(b.tone || "accent"), box, rich(b.text));
    n.style.position = "relative";
    n.style.fontSize = "calc(" + (b.px || 220) + "px * var(--ds))";
    n.style.lineHeight = "1";
    enter(n, b.at, "hero", b.motion);
  };
  B.cta = function (b, w) {
    var box = el("div", "k-col", w); box.style.alignItems = b.align === "start" ? "flex-start" : "center"; box.style.gap = "34px"; box.style.position = "relative";
    if (b.rings) {
      var sv = svg("svg", { class: "k-svg", width: 940, height: 940 }, box);
      sv.style.left = "50%"; sv.style.top = "0"; sv.style.marginLeft = "-470px"; sv.style.marginTop = "-400px";
      [150, 240, 330, 420].forEach(function (r, i) {
        var c = svg("circle", { cx: 470, cy: 470, r: r, fill: "none", "stroke-width": 1.5, transform: "rotate(-90 470 470)" }, sv);
        c.style.stroke = "var(--accent)"; c.style.opacity = String(0.28 - i * 0.05);
        drawPath(c, Math.ceil(2 * Math.PI * r), b.at + 0.2 + i * 0.35, 0.9);
      });
    }
    var btn = el("div", "k-cta", box, rich(b.text || "Follow")); btn.style.position = "relative";
    enter(btn, b.at, "item", b.motion || "rise");
    if (b.sub) {
      var s = el("div", "k-head k-h4 t-ink", box, rich(b.sub).replace(/\n/g, "<br>"));
      s.style.position = "relative"; s.style.textAlign = b.align === "start" ? "left" : "center"; s.style.lineHeight = "1.25";
      enter(s, b.subAt != null ? b.subAt : b.at + 0.6, "text", "fade");
    }
  };
  B.equation = function (b, w) {
    var row = el("div", "k-row", w); row.style.gap = "18px"; row.style.flexWrap = "wrap";
    if (b.align === "center") row.style.justifyContent = "center";
    (b.parts || []).forEach(function (p) {
      var n = el("div", "k-head k-" + (b.size || "h3") + tone(p.tone || "ink"), row, rich(p.text));
      enter(n, p.at, "item", b.motion);
    });
  };
  B.compare = function (b, w) {
    w.classList.add("w-full");
    var row = el("div", "k-row", w); row.style.alignItems = "stretch"; row.style.gap = "0";
    [b.left, b.right].forEach(function (side, i) {
      if (!side) return;
      var c = el("div", "k-col", row); c.style.flex = "1"; c.style.padding = i ? "0 0 0 36px" : "0 36px 0 0"; c.style.gap = "10px";
      if (i) c.style.borderLeft = "var(--bw) solid var(--line)";
      if (side.label) el("div", "k-mono", c, rich(side.label));
      var v = el("div", "k-display" + tone(side.tone || (i ? "accent" : "ink")), c, rich(side.value || ""));
      v.style.fontSize = "calc(" + (side.px || 110) + "px * var(--ds))"; v.style.lineHeight = "1";
      if (side.sub) { var s = el("div", "k-body", c, rich(side.sub)); s.style.fontSize = "30px"; }
      if (side.count) countUp(v, side.at, side.count);
      enter(c, side.at, "item", b.motion);
    });
  };
  B.tally = function (b, w) {
    var n = b.n || 12, box = el("div", "", w);
    box.style.position = "relative"; box.style.width = (b.width || 420) + "px"; box.style.height = (b.height || 230) + "px";
    var slips = [];
    for (var i = 0; i < n; i++) {
      var s = el("div", "k-slip", box, '<div style="height:3px;width:60%;background:var(--faint);margin-bottom:14px"></div>' + rich(b.text || ""));
      s.style.left = (i * ((b.width || 420) - 250) / Math.max(1, n - 1)) + "px";
      s.style.top = (i % 2) * 8 + i * 4 + "px";
      s.style.transform = "rotate(" + (-6 + i * (12 / Math.max(1, n - 1))) + "deg)";
      tl.fromTo(s, { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }, b.at + i * (b.stagger || 0.06));
      slips.push(s);
    }
    if (b.strikeAt != null) {
      var ln = el("div", "", box);
      ln.style.cssText = "position:absolute;left:-10px;right:-10px;top:50%;height:3px;background:var(--muted);transform:rotate(-14deg);transform-origin:0 50%";
      tl.fromTo(ln, { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: "power3.out" }, b.strikeAt);
    }
    if (b.label) {
      var lb = el("div", "k-mono", w, rich(b.label)); lb.style.marginTop = "18px";
      enter(lb, b.labelAt != null ? b.labelAt : b.strikeAt != null ? b.strikeAt : b.at, "chrome");
    }
  };
  B.steps = function (b, w) {
    w.classList.add("w-full");
    var col = el("div", "k-col", w); col.style.gap = (b.gap || 34) + "px"; col.style.position = "relative";
    var items = b.items || [];
    var rail = el("div", "", col);
    rail.style.cssText = "position:absolute;left:13px;top:18px;bottom:18px;width:2px;background:var(--line);transform-origin:50% 0";
    tl.fromTo(rail, { scaleY: 0 }, { scaleY: 1, duration: Math.max(0.6, (items.length ? items[items.length - 1].at - items[0].at : 0.6)), ease: "none" }, items.length ? items[0].at : 0);
    items.forEach(function (it) {
      var r = el("div", "k-row", col); r.style.alignItems = "flex-start"; r.style.gap = "30px";
      var dot = el("div", "", r); dot.style.cssText = "width:28px;height:28px;border-radius:50%;background:var(--accent);flex:none;margin-top:12px;position:relative";
      var tx = el("div", "k-col", r); tx.style.gap = "4px";
      el("div", "k-head k-h4 t-ink", tx, rich(it.title));
      if (it.sub) { var s = el("div", "k-body", tx, rich(it.sub)); s.style.fontSize = "30px"; }
      tl.fromTo(dot, { scale: 0 }, { scale: 1, duration: 0.4, ease: "power3.out" }, it.at);
      enter(tx, it.at, "item", b.motion);
    });
  };
  B.quote = function (b, w) {
    var m = el("div", "k-display t-accent", w, "&ldquo;"); m.style.fontSize = "calc(200px * var(--ds))"; m.style.lineHeight = "0.6"; m.style.opacity = "0.5";
    enter(m, b.at, "item", "fade");
    var n = el("div", "k-head k-" + (b.size || "h3") + " t-ink", w, rich(b.text).replace(/\n/g, "<br>"));
    enter(n, b.at, "text", b.motion);
    if (b.by) { var by = el("div", "k-mono", w, rich(b.by)); by.style.marginTop = "18px"; enter(by, b.byAt != null ? b.byAt : b.at + 0.5, "chrome"); }
  };
  // Icon prop: one big drawn icon (+ optional label), or a row of icon+label items.
  //   { type:"icon", name, px, tone, at, stroke, draw, label, labelAt, align }  |  { type:"icon", items:[{name,label,at,tone}], px, gap }
  B.icon = function (b, w) {
    if (b.items) {
      var row = el("div", "k-row", w); row.style.gap = (b.gap || 56) + "px"; row.style.alignItems = "flex-start";
      if (b.align === "center") row.style.justifyContent = "center";
      b.items.forEach(function (it) {
        var c = el("div", "k-col", row); c.style.alignItems = "center"; c.style.gap = "18px";
        icon(it.name, c, { px: b.px || 150, tone: it.tone || b.tone, at: it.at, stroke: b.stroke, draw: b.draw });
        if (it.label) { var l = el("div", "k-mono", c, rich(it.label)); l.style.textAlign = "center"; enter(l, (it.at || 0) + 0.25, "chrome"); }
      });
      return;
    }
    var box = el("div", "k-col", w); box.style.gap = "22px";
    if (b.align === "center") box.style.alignItems = "center";
    icon(b.name, box, { px: b.px || 260, tone: b.tone, at: b.at || 0, stroke: b.stroke, draw: b.draw, dur: b.dur, motion: b.motion });
    if (b.label) { var lb = el("div", "k-mono", box, rich(b.label)); enter(lb, b.labelAt != null ? b.labelAt : (b.at || 0) + 0.3, "chrome"); }
  };
  B.tag = function (b, w) {
    var c = el("div", "k-chip" + tone(b.tone || "accent"), w, rich(b.text));
    enter(c, b.at, "item", b.motion);
  };
  B.rule = function (b, w) {
    w.classList.add("w-full");
    var r = el("div", "", w); r.style.cssText = "height:" + (b.weight || 2) + "px;width:100%;background:var(--line);transform-origin:0 50%";
    tl.fromTo(r, { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: "power3.out" }, b.at || 0);
  };
  B.spacer = function (b, w) { w.style.height = (b.h || 40) + "px"; w.style.flex = b.grow ? "1" : "none"; };
  B.group = function (b, w) {
    w.classList.add("w-full");
    var row = el("div", "k-row", w);
    row.style.alignItems = b.alignItems || "flex-start"; row.style.gap = (b.gap || 32) + "px";
    if (b.justify) row.style.justifyContent = b.justify;
    (b.children || []).forEach(function (c) { block(c, row); });
  };
  // Pattern interrupt: a full-bleed colour flood takes over the whole canvas (above the stage),
  // lands one big statement, then wipes away and hands the frame back. tone: accent | ink | paper.
  B.flood = function (b, w) {
    w.style.position = "absolute"; w.style.width = "0"; w.style.height = "0"; // out of the flex flow
    var tones = { accent: ["var(--accent)", "var(--onAccent)"], ink: ["var(--ink)", "var(--bg)"], paper: ["var(--bg)", "var(--ink)"] };
    var t = tones[b.tone || "accent"] || tones.accent;
    var o = el("div", "", frameRoot); // the frame's own root, outside the camera layer (ids are rewritten at render; querySelector(host) can match the index mount div)
    o.style.cssText = "position:absolute;left:0;top:0;width:" + CW + "px;height:" + CH + "px;z-index:5;background:" + t[0] + ";color:" + t[1] + ";display:flex;flex-direction:column;align-items:" + (b.align === "start" ? "flex-start" : "center") + ";justify-content:center;padding:" + (CW > CH ? "0 160px" : "0 80px 600px") + ";box-sizing:border-box;text-align:" + (b.align === "start" ? "left" : "center");
    o.style.setProperty("--accentText", t[1]);
    var from = { bottom: "inset(100% 0% 0% 0%)", left: "inset(0% 100% 0% 0%)", top: "inset(0% 0% 100% 0%)" }[b.from || "bottom"];
    var gone = { bottom: "inset(0% 0% 100% 0%)", left: "inset(0% 0% 0% 100%)", top: "inset(100% 0% 0% 0%)" }[b.from || "bottom"];
    tl.fromTo(o, { clipPath: from }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.5, ease: "expo.out" }, b.at);
    if (b.label) { var lb = el("div", "k-mono", o, rich(b.label)); lb.style.color = "inherit"; lb.style.opacity = "0.75"; lb.style.marginBottom = "26px"; enter(lb, b.at + 0.2, "chrome"); }
    var big = el("div", "k-display", o, rich(b.text || ""));
    big.style.fontSize = "calc(" + (b.px || 250) + "px * var(--ds))"; big.style.lineHeight = "0.95"; big.style.color = "inherit";
    enter(big, b.at + 0.12, "hero", b.motion);
    if (b.sub) { var sb = el("div", "k-head k-h3", o, rich(b.sub)); sb.style.color = "inherit"; sb.style.marginTop = "24px"; enter(sb, b.subAt != null ? b.subAt : b.at + 0.45, "text", b.motion); }
    if (b.outAt != null) tl.fromTo(o, { clipPath: "inset(0% 0% 0% 0%)" }, { clipPath: gone, duration: 0.45, ease: "power3.in", immediateRender: false }, b.outAt - 0.2);
  };
  // ── illustrated scenes ───────────────────────────────────────────────────
  // scene: a fixed-size box whose children are placed with x/y (px, top-left of the box).
  B.scene = function (b, w) {
    w.style.position = "relative"; w.style.width = (b.w || 920) + "px"; w.style.height = (b.h || 980) + "px";
    (b.children || []).forEach(function (c) { block(c, w); });
  };
  // peep: an Open Peeps figure (SVGs rendered at build time in this frame's palette → b.srcs, b.aspect).
  // Mostly-still character: entrance, slow breathing bob, leans, a reaction hop, face swaps on cues.
  B.peep = function (b, w) {
    var px = b.px || 330, ph = Math.round(px * (b.aspect || 1200 / 850));
    w.style.width = px + "px"; w.style.height = ph + "px"; w.style.transformOrigin = "50% 100%";
    var box = el("div", "", w);
    box.style.cssText = "position:absolute;left:0;top:0;width:" + px + "px;height:" + ph + "px" + (b.mirror ? ";transform:scaleX(-1)" : "");
    var srcs = b.srcs || {}, faces = {}, first = null;
    Object.keys(srcs).forEach(function (f) {
      var im = el("img", "", box);
      im.src = srcs[f];
      im.style.cssText = "position:absolute;left:0;top:0;width:" + px + "px;height:" + ph + "px;opacity:0";
      faces[f] = im; if (!first) first = f;
    });
    var cur = b.face && faces[b.face] ? b.face : first;
    if (cur) faces[cur].style.opacity = "1";
    var t0 = b.at || 0;
    var from = b.from || (b.mirror ? "right" : "left");
    var fx = from === "left" ? -90 : from === "right" ? 90 : 0, fy = from === "up" ? 70 : 0;
    tl.fromTo(w, { opacity: 0, x: fx, y: fy }, { opacity: 1, x: 0, y: 0, duration: 0.6, ease: "power3.out" }, t0);
    if (b.bob !== false) {
      var amp = b.bobAmp || 7, s = t0 + 0.8 + (b.bobDelay || 0);
      while (s + 1.2 < DUR - 0.1) {
        tl.fromTo(box, { y: 0 }, { y: -amp, duration: 0.6, ease: "sine.inOut", immediateRender: false }, s);
        tl.fromTo(box, { y: -amp }, { y: 0, duration: 0.6, ease: "sine.inOut", immediateRender: false }, s + 0.6);
        s += 1.25;
      }
    }
    var rot = 0;
    (b.lean || []).forEach(function (l) {
      tl.fromTo(w, { rotation: rot }, { rotation: l.deg, duration: l.dur || 0.4, ease: l.ease || "back.out(1.6)", immediateRender: false }, l.at);
      rot = l.deg;
    });
    (b.hop || []).forEach(function (h) {
      var t = h.at;
      tl.fromTo(w, { scaleY: 1 }, { scaleY: 1.05, duration: 0.14, ease: "power2.out", immediateRender: false }, t);
      tl.fromTo(w, { scaleY: 1.05 }, { scaleY: 1, duration: 0.45, ease: "power2.inOut", immediateRender: false }, t + 0.14);
    });
    (b.faces || []).forEach(function (f) {
      if (!faces[f.face] || f.face === cur) return;
      tl.fromTo(faces[cur], { opacity: 1 }, { opacity: 0, duration: 0.12, immediateRender: false }, f.at);
      tl.fromTo(faces[f.face], { opacity: 0 }, { opacity: 1, duration: 0.12, immediateRender: false }, f.at);
      cur = f.face;
    });
  };
  // invoice: a paper document (ink card, bg text). rows [[left,right]], total [l,r], a handwritten
  // `add` line that writes on at add.at and is struck at add.strikeAt; joltAt = knocked by a stamp.
  B.invoice = function (b, w) {
    var W = b.w || 400;
    var rc = el("div", "", w);
    rc.style.cssText = "width:" + W + "px;" + (b.h ? "height:" + b.h + "px;" : "") + "background:var(--ink);color:var(--bg);border-radius:6px;" +
      "padding:30px 32px;box-sizing:border-box;font-family:var(--fm);transform-origin:50% 0";
    function row(l, r, css) {
      var d = el("div", "", rc);
      d.style.cssText = "display:flex;justify-content:space-between;align-items:baseline;gap:20px;" + (css || "");
      el("span", "", d, rich(l)); el("span", "", d, rich(r));
    }
    function rule() { el("div", "", rc).style.cssText = "border-top:2px dashed var(--bg);opacity:0.5;margin:18px 0"; }
    row(b.title || "TAX INVOICE", b.no || "", "font-size:20px;letter-spacing:0.12em;opacity:0.7");
    rule();
    (b.rows || []).forEach(function (r, i) { row(r[0], r[1], "font-size:28px" + (i ? ";margin-top:8px" : "") + (r[2] === "muted" ? ";opacity:0.7" : "")); });
    if (b.total) { rule(); row(b.total[0], b.total[1], "font-size:36px;font-weight:700"); }
    if (b.add) {
      var fee = el("div", "", rc);
      fee.style.cssText = "position:relative;margin-top:24px;font-family:var(--fd);font-style:italic;font-size:" + (b.add.px || 46) + "px;line-height:1;white-space:nowrap";
      fee.innerHTML = rich(b.add.text);
      tl.fromTo(fee, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: b.add.dur || 0.75, ease: "power1.inOut" }, b.add.at);
      if (b.add.strikeAt != null) {
        var sk = el("div", "", fee);
        sk.style.cssText = "position:absolute;left:-6px;top:52%;width:calc(100% + 12px);height:5px;background:var(--bg);transform-origin:0 50%";
        tl.fromTo(sk, { scaleX: 0 }, { scaleX: 1, duration: 0.3, ease: "power2.out" }, b.add.strikeAt);
      }
    }
    tl.fromTo(rc, { opacity: 0, y: -40, rotation: (b.tilt || -2) - 4 }, { opacity: 1, y: 0, rotation: b.tilt || -2, duration: 0.6, ease: "back.out(1.6)" }, b.at || 0);
    if (b.joltAt != null) {
      tl.fromTo(w, { y: 0 }, { y: 10, duration: 0.06, ease: "power2.out", immediateRender: false }, b.joltAt);
      tl.fromTo(w, { y: 10 }, { y: 0, duration: 0.5, ease: "elastic.out(1, 0.4)", immediateRender: false }, b.joltAt + 0.06);
    }
  };
  // stamp: a rubber stamp that slams in (SVG, so it may sit over a document without a text-overlap error).
  B.stamp = function (b, w) {
    var W = b.w || 180, H = b.h || 102, col = "var(--" + (b.color || "bg") + ")";
    w.style.width = W + "px"; w.style.height = H + "px";
    var sv = svg("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H }, w);
    svg("rect", { x: 5, y: 5, width: W - 10, height: H - 10, rx: 14, fill: "none", stroke: col, "stroke-width": Math.max(6, H * 0.085) }, sv);
    var tx = svg("text", { x: W / 2, y: H * 0.77, "text-anchor": "middle", fill: col, "font-size": H * 0.78, "font-family": "var(--fd)" }, sv);
    tx.textContent = b.text || "NO.";
    var r = b.rotate != null ? b.rotate : -8;
    tl.fromTo(w, { opacity: 0, scale: 2.6, rotation: r - 12 }, { opacity: 1, scale: 1, rotation: r, duration: 0.2, ease: "power4.in" }, (b.at || 0) - 0.12);
  };
  // ── external assets ──────────────────────────────────────────────────────
  // Lottie, driven by THIS frame's paused GSAP timeline (not the global adapter): it starts on its own cue,
  // can loop, run a segment or change speed, and every seek re-derives the frame → render-safe.
  //   K.lottie(parent, {src|key, w, h, at, speed, loop, from, to, hold, fit}) → {box, anim, dur}
  function lottieAt(parent, o) {
    var data = LOTTIES[o.key || o.src];
    var LW = window["lot" + "tie"]; // reached indirectly so lint only expects the player script in frames that use it
    if (!data || !LW) throw new Error("studio kit: lottie asset/player missing: " + (o.key || o.src) + " (list it in a lottie block or spec.lotties)");
    var box = el("div", "k-lottie", parent);
    var w = o.w || data.w, h = o.h || Math.round((o.w || data.w) * data.h / data.w);
    box.style.cssText += ";width:" + w + "px;height:" + h + "px;position:relative" + (o.mirror ? ";transform:scaleX(-1)" : "");
    var anim = LW.loadAnimation({ container: box, renderer: "svg", loop: false, autoplay: false, animationData: JSON.parse(JSON.stringify(data)),
      rendererSettings: { preserveAspectRatio: o.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet" } });
    var fr = data.fr, f0 = o.from != null ? o.from : data.ip, f1 = o.to != null ? o.to : data.op, len = f1 - f0, sp = o.speed || 1;
    var t0 = o.at || 0, one = len / fr / sp;
    // frame for frame-local time t (s); before the cue → first frame, one-shots hold their last whole frame
    function frameAt(t) { var lt = Math.max(0, t - t0); return o.loop ? f0 + ((lt * fr * sp) % len) : Math.min(f1 - 1, f0 + lt * fr * sp); }
    // HyperFrames' lottie adapter auto-discovers every lottie-web instance (lottie.getRegisteredAnimations) and
    // seeks it to frame-local time with goToAndStop — which would override the cue. Keep a private seek for our
    // driver and turn the public one into a no-op so only this timeline moves the animation.
    var go = anim.goToAndStop.bind(anim);
    anim.goToAndStop = function () {};
    go(f0, true);
    lotDrive.push({ go: go, frameAt: frameAt, last: -1 });
    if (lotDrive.length === 1) { // ONE driver spanning the whole frame: every seek (forward, back, random) re-derives every Lottie's frame
      var px = { t: 0 };
      tl.fromTo(px, { t: 0 }, { t: DUR, duration: DUR, ease: "none", onUpdate: function () {
        for (var i = 0; i < lotDrive.length; i++) { var d = lotDrive[i], f = d.frameAt(px.t); if (f !== d.last) { d.go(f, true); d.last = f; } }
      } }, 0);
    }
    return { box: box, anim: anim, dur: one };
  }
  var lotDrive = [];
  K.lottie = lottieAt;
  // block: {type:"lottie", src, w, h, at, speed, loop, from, to, recolor, enter ("pop"|"fade"|false, default fade), showAt}
  B.lottie = function (b, w) {
    var r = lottieAt(w, b);
    var t = b.showAt != null ? b.showAt : b.at || 0;
    // entrances go on the block wrapper, never on lottie's own container (a 0-scale container stops lottie drawing)
    if (b.enter === "pop") tl.fromTo(w, { scale: 0.01, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(1.8)" }, t);
    else if (b.enter !== false && t > 0.05) tl.fromTo(w, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: "power2.out" }, t);
  };
  // stacked image variants that swap on cues (avatar faces) + entrance + breathing bob
  function variants(w, srcs, px, aspect, b) {
    var ph = Math.round(px * aspect);
    w.style.width = px + "px"; w.style.height = ph + "px"; w.style.position = w.style.position || "relative";
    var box = el("div", "", w); box.style.cssText = "position:absolute;left:0;top:0;width:" + px + "px;height:" + ph + "px" + (b.mirror ? ";transform:scaleX(-1)" : "");
    var imgs = {};
    Object.keys(srcs).forEach(function (k, i) { var im = el("img", "", box); im.src = srcs[k]; im.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;opacity:" + (i ? 0 : 1); imgs[k] = im; });
    var t0 = b.at || 0;
    if (t0 > 0.05 || b.from) tl.fromTo(w, { opacity: 0, y: b.from === "up" || !b.from ? 60 : 0, x: b.from === "left" ? -90 : b.from === "right" ? 90 : 0 }, { opacity: 1, y: 0, x: 0, duration: 0.6, ease: "power3.out" }, t0);
    if (b.bob !== false) { var t = t0 + 0.6, up = true; while (t < DUR) { tl.fromTo(box, { y: up ? 0 : -6 }, { y: up ? -6 : 0, duration: 1.3, ease: "sine.inOut", immediateRender: false }, t); t += 1.3; up = !up; } }
    var cur = Object.keys(srcs)[0];
    (b.faces || []).forEach(function (f, i) {
      var nk = "f" + i; if (!imgs[nk]) return;
      tl.fromTo(imgs[cur], { opacity: 1 }, { opacity: 0, duration: 0.08, immediateRender: false }, f.at);
      tl.fromTo(imgs[nk], { opacity: 0 }, { opacity: 1, duration: 0.08, immediateRender: false }, f.at);
      cur = nk;
    });
    (b.hop || []).forEach(function (h) { tl.fromTo(box, { y: 0 }, { y: -26, duration: 0.16, ease: "power2.out", immediateRender: false }, h.at); tl.fromTo(box, { y: -26 }, { y: 0, duration: 0.34, ease: "bounce.out", immediateRender: false }, h.at + 0.16); });
    return box;
  }
  // DiceBear avatar: {type:"avatar", figure | style+seed, options, px, faces:[{at, options}], hop:[{at}], from, mirror}
  B.avatar = function (b, w) { variants(w, b.srcs || {}, b.px || 300, 1, b); };
  // Humaaans figure: {type:"humaaan", name, px, recolor, at, from, mirror, bob}
  // library SVG illustration (IconScout etc.): {type:"art", name, px, recolor, at, from, mirror, bob}
  B.art = function (b, w) { var s = {}; s.base = b.src; variants(w, s, b.px || 300, b.aspect || 1, b); };
  B.humaaan = function (b, w) { var s = {}; s.base = b.src; variants(w, s, b.px || 300, b.aspect || 1.5, b); };

  // map (vendor/maps via house.js KM.draw): {type:"map", region "india"|"world"|[[lon,lat],[lon,lat]], w, h, style
  // "studio"|"paper", projection, highlight {name|id: colour}, india ("accent"|"plain"), pins [{lon,lat,label,at}],
  // routes [{from:[lon,lat], to:[lon,lat], at, dur}], at}
  B.map = function (b, w) {
    var W = b.w || 920, H = b.h || 900;
    w.style.width = W + "px"; w.style.height = H + "px";
    var o = {}; for (var k in b) o[k] = b[k];
    o.x = 0; o.y = 0; o.w = W; o.h = H;
    KM.draw(K, w, o);
  };

  B.custom = function (b, w) {
    var fn = CUSTOM[b.fn];
    if (b.html) w.innerHTML = b.html;
    if (fn) fn(tl, w, K, b);
  };

  function block(b, parent) {
    var w = el("div", "k-b" + (b.full ? " w-full" : ""), parent);
    if (b.mt != null) w.style.marginTop = b.mt + "px";
    if (b.self) w.style.alignSelf = b.self;
    if (b.keepCase) w.style.setProperty("--case", "none");
    if (b.width) w.style.width = b.width + "px";
    if (b.x != null || b.y != null) { w.style.position = "absolute"; if (b.x != null) w.style.left = b.x + "px"; if (b.y != null) w.style.top = b.y + "px"; }
    var fn = B[b.type];
    if (!fn) throw new Error("studio kit: unknown block type " + b.type);
    fn(b, w);
    return w;
  }
  K.block = block;

  // ── chrome ───────────────────────────────────────────────────────────────
  // Chrome (section label row) is OFF unless a spec explicitly asks for it — these are videos,
  // not decks: no "part N of M" counters, no slide titles by default.
  if (chromeEl && SPEC.chrome && typeof SPEC.chrome === "object") {
    var ch = SPEC.chrome || {};
    var style = ch.style || LOOK.chrome;
    var label = ch.label || "";
    var counter = ch.counter === true ? String(IDX).padStart(2, "0") + " / " + String(TOTAL).padStart(2, "0") : "";
    if (style === "eyebrow") {
      var acc = el("div", "", chromeEl); acc.style.cssText = "position:absolute;left:0;top:4px;width:60px;height:4px;border-radius:2px;background:var(--accent)";
      var eb = el("div", "k-mono t-accent", chromeEl, esc(label)); eb.style.cssText += ";position:absolute;left:0;top:22px;font-weight:600;font-size:26px";
      var ct = el("div", "k-mono", chromeEl, counter); ct.style.cssText += ";position:absolute;right:0;top:22px;font-variant-numeric:tabular-nums";
      tl.fromTo([acc, eb, ct], CHROME[0], clone(CHROME[1]), 0.05);
    } else if (style === "bar") {
      var bar = el("div", "", chromeEl); bar.style.cssText = "position:absolute;left:0;top:10px;height:46px;padding:0 18px;display:flex;align-items:center;background:var(--ink);color:var(--bg);font-family:var(--fm);font-size:22px;letter-spacing:var(--mtrk);text-transform:uppercase";
      bar.textContent = (counter ? counter.split(" / ")[0] + "  " : "") + label;
      var rr = el("div", "", chromeEl); rr.style.cssText = "position:absolute;left:0;right:0;top:32px;height:3px;background:var(--ink);transform-origin:0 50%;z-index:-1";
      tl.fromTo(rr, { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: "power4.out" }, 0.02);
      tl.fromTo(bar, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.45, ease: "power4.out" }, 0.05);
    } else if (style === "index") {
      var ix = el("div", "k-mono t-ink", chromeEl, (counter ? counter.split(" / ")[0] + " — " : "") + esc(label)); ix.style.cssText += ";position:absolute;left:0;top:14px;font-size:24px";
      var ru = el("div", "", chromeEl); ru.style.cssText = "position:absolute;left:0;right:0;top:54px;height:1px;background:var(--line);transform-origin:0 50%";
      var tot = el("div", "k-mono", chromeEl, counter ? "/ " + String(TOTAL).padStart(2, "0") : ""); tot.style.cssText += ";position:absolute;right:0;top:14px;font-size:24px";
      tl.fromTo(ru, { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: "power3.out" }, 0.02);
      tl.fromTo([ix, tot], CHROME[0], clone(CHROME[1]), 0.08);
    }
  }

  // earliest cue (seconds) anywhere inside a block spec
  function firstCue(b) {
    var m = Infinity;
    (function walk(o, k) {
      if (typeof o === "number") { if (k === "at" || /At$/.test(k)) m = Math.min(m, o); return; }
      if (!o || typeof o !== "object") return;
      for (var key in o) { var v = o[key]; if (Array.isArray(v)) v.forEach(function (x) { walk(x, key); }); else walk(v, key); }
    })(b, "");
    return m === Infinity ? 0 : m;
  }
  // ── world layer ──────────────────────────────────────────────────────────
  // SPEC.world {fn, ...props}: a full-bleed CW×CH (1080×1920 Shorts / 1920×1080 long-form) illustrated scene drawn by CUSTOM[fn] behind the
  // stage, inside the camera (so it moves with the ambient camera; draw ~60 px past every edge as bleed).
  // K.layer(name) makes more full-canvas layers ("back" behind the stage, "front" above it); the
  // frame's <video> wrappers (SPEC.video, static in the template, above the world, below the stage)
  // are reachable as K.video(id) — animate the wrapper, never the <video> itself.
  var camEl = stage.parentNode, layers = {};
  function layer(name) {
    if (layers[name]) return layers[name];
    var L = el("div", "k-layer k-layer-" + name);
    L.style.cssText = "position:absolute;left:0;top:0;width:" + CW + "px;height:" + CH + "px;overflow:visible;pointer-events:none";
    if (name === "front") camEl.appendChild(L); else camEl.insertBefore(L, camEl.firstChild);
    return (layers[name] = L);
  }
  K.root = frameRoot; K.cam = camEl; K.host = host; K.layer = layer;
  K.video = function (id) { return host.querySelector('[data-k-video="' + id + '"]'); };
  if (SPEC.world && SPEC.world.fn) {
    var wfn = CUSTOM[SPEC.world.fn];
    if (!wfn) throw new Error("studio kit: world fn not found: " + SPEC.world.fn);
    var wl = layer("world");
    wfn(tl, wl, K, SPEC.world);
  }

  var flow = [];
  (SPEC.blocks || []).forEach(function (b) {
    var w = block(b, stage);
    if (b.type !== "flood" && b.x == null && b.y == null) flow.push({ w: w, t: firstCue(b) });
  });

  // ── auto-framing ─────────────────────────────────────────────────────────
  // Blocks that haven't been revealed yet still take layout space, so a centred stack reads
  // top-heavy until its last block lands. Instead, keep what's VISIBLE centred on the stage and
  // glide as blocks arrive (final state = the normal centred layout). Off for justify'd stages
  // or SPEC.frame === false. Positions are measured lazily at first render (after fonts load).
  (function autoFrame() {
    if (SPEC.frame === false || SPEC.justify || flow.length < 2) return;
    var times = flow.map(function (x) { return Math.max(0, x.t); }).sort(function (a, b) { return a - b; })
      .filter(function (t, i, a) { return i === 0 || t - a[i - 1] > 0.05; });
    if (times.length < 2) return;
    // glide i runs from max(0, t_i − 0.12) for ≤ 0.85 s, always finishing before the next one starts
    var glides = times.map(function (t, i) {
      var s = Math.max(0, t - 0.12), next = times[i + 1];
      return { s: s, d: Math.max(0.25, Math.min(0.85, (next == null ? DUR : next - 0.12) - s)) };
    });
    var ease = gsap.parseEase("power3.inOut"), keys = null;
    // Measured on first render with real layout (a hidden frame measures 0 → retry later; wait for fonts).
    function measure() {
      var H = stage.offsetHeight;
      if (!H) return null;
      var m = flow.map(function (x) { return { t: x.t, top: x.w.offsetTop, bot: x.w.offsetTop + x.w.offsetHeight }; });
      return times.map(function (t) {
        var lo = Infinity, hi = -Infinity;
        m.forEach(function (x) { if (x.t <= t + 0.001) { lo = Math.min(lo, x.top); hi = Math.max(hi, x.bot); } });
        return lo === Infinity ? 0 : Math.max(-lo, Math.min(H - hi, H / 2 - (lo + hi) / 2));
      });
    }
    function yAt(t) {
      var k = keys || measure();
      if (!k) return 0;
      if (!keys && (!document.fonts || document.fonts.status === "loaded")) keys = k; // cache once real fonts laid out
      var y = k[0];
      for (var i = 1; i < times.length; i++) {
        var g = glides[i];
        if (t <= g.s) break;
        y = k[i - 1] + (k[i] - k[i - 1]) * ease(Math.min(1, (t - g.s) / g.d));
      }
      return y;
    }
    // one proxy tween spanning the frame: every seek re-derives the stage offset from the time (seek-safe)
    var px = { t: 0 };
    tl.fromTo(px, { t: 0 }, { t: DUR, duration: DUR, ease: "none", onUpdate: function () { gsap.set(stage, { y: yAt(px.t) }); } }, 0);
  })();

  // ── ambient camera ───────────────────────────────────────────────────────
  // A slow move on every frame keeps the picture alive between reveals. The look lists its moves
  // (LOOK.motion.camera) and frames alternate through them; SPEC.camera overrides
  // (push | pull | drift | still), SPEC.cameraAmt sets strength (default 0.035 ≈ 3.5% scale).
  // The background moves further than the content → a little parallax depth.
  (function camera() {
    var moves = LOOK.motion.camera || ["push"];
    var kind = SPEC.camera || "still"; // house rule 6 (2026-10-04): no ambient zoom unless a spec asks for it (build warns)
    if (kind === "still") return;
    var a = num(SPEC.cameraAmt, LOOK.motion.cameraAmt || 0.035);
    var cam = stage.parentNode, bg = frameRoot.querySelector(".k-bg");
    var o = { duration: DUR, ease: "sine.inOut" };
    function mv(node, from, to) { var t = clone(o); for (var k in to) t[k] = to[k]; tl.fromTo(node, from, t, 0); }
    if (kind === "push") { mv(cam, { scale: 1 }, { scale: 1 + a }); if (bg) mv(bg, { scale: 1.02 }, { scale: 1.02 + a * 1.8 }); }
    else if (kind === "pull") { mv(cam, { scale: 1 + a }, { scale: 1 }); if (bg) mv(bg, { scale: 1.02 + a * 1.8 }, { scale: 1.02 }); }
    else if (kind === "drift") { mv(cam, { y: a * 360, scale: 1 + a * 0.3 }, { y: -a * 360, scale: 1 + a * 0.3 }); if (bg) mv(bg, { y: -a * 700, scale: 1.08 }, { y: a * 700, scale: 1.08 }); }
  })();

  tl.to({}, { duration: DUR }, 0); // span the full frame
  window.__timelines = window.__timelines || {};
  window.__timelines[FID] = tl;
})();
