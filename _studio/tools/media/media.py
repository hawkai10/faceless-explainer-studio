"""Studio media helpers that run in _studio/.venv-media (python -m venv .venv-media; pip install trafilatura "rembg[cpu]").

  article <url> [html_file]          → JSON {title, author, date, sitename, url, text} on stdout (trafilatura)
  cutout <in> <out.png> [model]      → subject cut out of a photo, transparent PNG trimmed to the subject (rembg)
"""
import json
import sys


def article(url, html_file=None):
    import trafilatura
    html = open(html_file, encoding="utf-8", errors="replace").read() if html_file else trafilatura.fetch_url(url)
    if not html:
        print(json.dumps({"error": "fetch failed"}))
        return
    doc = trafilatura.bare_extraction(html, url=url, with_metadata=True, include_comments=False, favor_precision=True)
    if doc is None:
        print(json.dumps({"error": "no article text found"}))
        return
    d = doc.as_dict() if hasattr(doc, "as_dict") else dict(doc)
    out = {k: d.get(k) for k in ("title", "author", "date", "sitename", "url", "description", "text")}
    out["url"] = out.get("url") or url
    print(json.dumps(out, ensure_ascii=False))


def cutout(src, dst, model="birefnet-general-lite"):
    from PIL import Image
    from rembg import new_session, remove
    img = Image.open(src).convert("RGB")
    res = remove(img, session=new_session(model), post_process_mask=True)
    box = res.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if box:
        pad = 6
        res = res.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(res.width, box[2] + pad), min(res.height, box[3] + pad)))
    res.save(dst)
    print(json.dumps({"out": dst, "w": res.width, "h": res.height, "model": model}))


if __name__ == "__main__":
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "article":
        article(*args)
    elif cmd == "cutout":
        cutout(*args)
    else:
        sys.exit("unknown command " + cmd)
