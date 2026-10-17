"""Sonniss GDC archive without downloading 200 GB (2026-10-10).

Every yearly bundle on sonniss.com/gameaudiogdc is a set of plain zip files served with HTTP range support, so the
zip central directories can be read remotely (a few hundred KB each) and single sounds pulled out of them.

  python sonniss.py catalog <out.json>               list every sound in every bundle part (scrapes the archive page)
  python sonniss.py fetch <zip-url> <member> <out>   download + inflate one member

Licence: royalty-free, commercial, no attribution; no redistribution of the raw files, no AI/ML training
(https://sonniss.com/gdc-bundle-license/). Standard library only.
"""
import io, json, re, sys, time, urllib.request, zipfile

PAGE = "https://sonniss.com/gameaudiogdc/"
UA = {"User-Agent": "Mozilla/5.0 (studio sonniss catalog)"}


class HttpFile(io.RawIOBase):
    """Seekable read-only view of a remote file through Range requests."""

    def __init__(self, url):
        self.url, self.pos, self.size = url, 0, None
        # Cloudflare occasionally answers 200 without honouring the range (rate limiting) — back off and retry
        for attempt in range(6):
            req = urllib.request.Request(url, headers={**UA, "Range": "bytes=0-0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                cr = r.headers.get("Content-Range")
            if cr:
                self.size = int(cr.split("/")[1])
                break
            time.sleep(5 * (attempt + 1))
        if self.size is None: raise IOError("server ignores range requests right now")

    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos

    def readinto(self, b):
        if self.pos >= self.size: return 0
        end = min(self.size, self.pos + len(b)) - 1
        for attempt in range(5):
            try:
                req = urllib.request.Request(self.url, headers={**UA, "Range": f"bytes={self.pos}-{end}"})
                with urllib.request.urlopen(req, timeout=120) as r:
                    if r.status != 206: raise IOError("range ignored")
                    data = r.read()
                break
            except Exception:
                if attempt == 4: raise
                time.sleep(3 * (attempt + 1))
        b[:len(data)] = data
        self.pos += len(data)
        return len(data)


def open_zip(url, buf=1 << 20):
    return zipfile.ZipFile(io.BufferedReader(HttpFile(url), buffer_size=buf))


def links():
    html = urllib.request.urlopen(urllib.request.Request(PAGE, headers=UA), timeout=60).read().decode("utf8", "replace")
    return sorted(set(re.findall(r'https://downloads\.sonniss\.com/[^"\']+\.zip', html)))


def bundle_of(url):
    name = urllib.request.unquote(url.rsplit("/", 1)[1])
    m = re.search(r"GDC ?-? ?(20\d\d)", name)
    return f"gdc{m.group(1)}" if m else "gdc2026"  # the current year's parts carry no year in the name


def catalog(out):
    rows, urls = [], links()
    for i, url in enumerate(urls, 1):
        try:
            z = open_zip(url, buf=1 << 16)
            n = 0
            for zi in z.infolist():
                if zi.is_dir() or "__MACOSX" in zi.filename or not re.search(r"\.(wav|flac|aif|aiff|mp3|ogg)$", zi.filename, re.I): continue
                rows.append({"b": bundle_of(url), "url": url, "m": zi.filename, "bytes": zi.file_size})
                n += 1
            print(f"[{i}/{len(urls)}] {n:5d} sounds  {urllib.request.unquote(url.rsplit('/', 1)[1])}", flush=True)
        except Exception as e:
            print(f"[{i}/{len(urls)}] FAILED {url}: {e}", flush=True)
        time.sleep(1.5)
    json.dump(rows, open(out, "w", encoding="utf8"))
    print(f"catalog: {len(rows)} sounds from {len(urls)} parts -> {out}")


def fetch(url, member, out):
    z = open_zip(url)
    with z.open(member) as src, open(out, "wb") as dst:
        while True:
            chunk = src.read(1 << 20)
            if not chunk: break
            dst.write(chunk)
    print(out)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "catalog": catalog(sys.argv[2])
    elif cmd == "fetch": fetch(sys.argv[2], sys.argv[3], sys.argv[4])
    else: print(__doc__)
