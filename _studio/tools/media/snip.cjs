// Article snip: open the real page, light the key phrase in amber, save a full-page view (for inspection) and a clip
// from the headline down through the paragraph that holds the phrase. Usage: node snip.cjs <url> <out-name> "<phrase>"
const puppeteer = require(process.env.PPTR);
const [url, name, phrase] = process.argv.slice(2);
(async () => {
  const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"] });
  const p = await b.newPage();
  await p.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36");
  await p.setViewport({ width: +(process.env.VW || 1100), height: 1600, deviceScaleFactor: +(process.env.DPR || 2) });
  await p.goto(url, { waitUntil: "networkidle2", timeout: 90000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  // lazy-rendered article bodies (Tribune, …) only exist after a scroll: step down the page, then back to the top
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); } scrollTo(0, 0); });
  await new Promise((r) => setTimeout(r, 800));
  const info = await p.evaluate((phrase, root) => {
    // drop overlays: cookie/consent bars, sticky ads, popups
    for (const el of document.querySelectorAll("body *")) {
      const s = getComputedStyle(el);
      if ((s.position === "fixed" || s.position === "sticky") && (el.offsetHeight < innerHeight * 0.9 || !el.querySelector("h1"))) el.style.display = "none";
      if (s.filter && s.filter.includes("blur")) el.style.filter = "none"; // paywall modals blur the page behind them
    }
    document.documentElement.style.overflow = document.body.style.overflow = "visible";
    for (const el of document.querySelectorAll("iframe, [id*=ad-], [class*=advert], [class*=ads-], .adsbygoogle")) el.style.display = "none";
    const h1 = document.querySelector("h1");
    let hit = null;
    for (const ph of phrase.split("|").filter(Boolean)) {
      const walker = document.createTreeWalker(document.querySelector(root) || document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const n = walker.currentNode, i = n.data.replace(/[   ]/g, " ").replace(/[‘’]/g, "'").toLowerCase().indexOf(ph.toLowerCase());
        if (i < 0) continue;
        const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + ph.length);
        const m = document.createElement("mark"); m.style.cssText = "background:#F2A33A;color:#111;padding:0 2px;border-radius:2px";
        r.surroundContents(m); hit = m; break;
      }
    }
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; };
    const para = hit ? hit.closest("p, li, blockquote, div") : null;
    return { h1: box(h1), hit: box(hit), para: box(para), title: h1 ? h1.innerText : document.title };
  }, phrase || "", process.env.ROOT || "body");
  await p.screenshot({ path: name + "-full.png", fullPage: true });
  if (info.h1) {
    const top = Math.max(0, info.h1.y - 30 - +(process.env.ABOVE || 0)), bottom = process.env.EXTRA ? info.h1.y + info.h1.h + +process.env.EXTRA : info.para ? Math.max(info.para.y + info.para.h + 30, info.h1.y + info.h1.h + 200) : info.h1.y + 900;
    const x = Math.max(0, Math.min(info.h1.x, info.para?.x ?? info.h1.x) - 30), w = Math.min(1100 - x, Math.max(info.h1.w, info.para?.w || 0) + 60);
    await p.screenshot({ path: name + ".png", clip: { x, y: top, width: w, height: Math.min(bottom - top, 2400) } });
  }
  console.log(JSON.stringify(info));
  await b.close();
})();
