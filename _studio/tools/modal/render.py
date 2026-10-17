"""Render a studio project on Modal (cloud CPU) instead of the laptop.

    modal run _studio/tools/modal/render.py --slug rupee-defence [--chunks 32] [--cpu 4] [--mem 4096] [--out renders/raw-modal.mp4]
    modal run _studio/tools/modal/render.py --slug rupee-defence --mode single [--cpu 16] [--mem 32768]

mode "dist" (default): HyperFrames' own distributed render (@hyperframes/producer/distributed) — one container plans
(compile + audio mix), `--chunks` containers each render a slice of frames in parallel, one assembles; files move
between them on the `studio-render` Volume, only the final MP4 comes back. Software GL, byte-identical chunks.
mode "single": one container runs `hyperframes render` (benchmarked slower than the laptop — 2026-10-10).

Ephemeral app: everything stops when the command exits, so nothing keeps billing. Pinned to the studio's HyperFrames
version; Chrome pinned to the headless-shell build HyperFrames' Cloud Run image uses.
"""
import io, json, os, re, shutil, subprocess, tarfile, time, uuid
from pathlib import Path

import modal

HF_VER = os.environ.get("STUDIO_HF", "hyperframes@0.8.141").split("@")[1]
CHROME = "148.0.7778.167"
ROOT = Path(__file__).resolve().parents[3] if modal.is_local() else Path("/work")  # the repo root (parent of _studio/)
SKIP = {"renders", "snapshots", "capture", "node_modules", ".git"}  # capture/ = raw downloads + research (GBs), never referenced by frames
HERE = Path(__file__).resolve().parent

PKG = json.dumps({"name": "hfdist", "private": True, "type": "module",
                  "dependencies": {"@hyperframes/producer": HF_VER},
                  "overrides": {f"@hyperframes/{p}": HF_VER for p in ("core", "engine", "lint", "parsers", "studio-server")}})
image = (
    modal.Image.from_registry("node:22.23.3-bookworm-slim", add_python="3.11")
    .apt_install(
        "ca-certificates", "curl", "unzip", "ffmpeg",
        "libgbm1", "libnss3", "libatk-bridge2.0-0", "libdrm2", "libxcomposite1", "libxdamage1", "libxrandr2",
        "libcups2", "libasound2", "libpangocairo-1.0-0", "libxshmfence1", "libgtk-3-0",
        "fonts-liberation", "fonts-noto-color-emoji", "fonts-noto-cjk", "fonts-noto-core", "fonts-noto-extra",
        "fonts-noto-ui-core", "fonts-freefont-ttf", "fonts-dejavu-core", "fontconfig",
    )
    .env({"PUPPETEER_SKIP_DOWNLOAD": "true", "PUPPETEER_SKIP_CHROMIUM_DOWNLOAD": "true", "CONTAINER": "true",
          "HYPERFRAMES_CHROME_PATH": "/opt/chrome/chrome-headless-shell",
          "PRODUCER_HEADLESS_SHELL_PATH": "/opt/chrome/chrome-headless-shell"})
    .run_commands(
        "fc-cache -f",
        f"npx --yes @puppeteer/browsers install chrome-headless-shell@{CHROME} --path /opt/puppeteer",
        "mkdir -p /opt/chrome && ln -s \"$(find /opt/puppeteer/chrome-headless-shell -name chrome-headless-shell -type f | head -n1)\" /opt/chrome/chrome-headless-shell && /opt/chrome/chrome-headless-shell --version",
        f"mkdir -p /opt/hfdist && cd /opt/hfdist && echo '{PKG}' > package.json && npm install --no-audit --no-fund",
        f"npm install -g hyperframes@{HF_VER}",
    )
    .add_local_file(HERE / "hfdist.mjs", "/opt/hfdist/hfdist.mjs")
)
app = modal.App("studio-render", image=image)
vol = modal.Volume.from_name("studio-render", create_if_missing=True)
VOL = Path("/vol")


def bundle(slug: str, entry: str = "index.html") -> bytes:
    """tar.gz of the project as <name>/ (minus renders/snapshots) plus the ../_studio files its HTML references.
    entry: the composition to render (a chapter's index-chNN.html for chapter renders) — shipped as index.html."""
    proj = ROOT / slug
    shared = set()
    for f in [proj / entry, *proj.glob("compositions/**/*.html")]:
        shared.update(re.findall(r"\.\./(_studio/[^\"'\s)]+)", f.read_text(encoding="utf-8", errors="ignore")))
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz", compresslevel=3) as tar:
        for p in proj.rglob("*"):
            rel = p.relative_to(proj)
            if not p.is_file() or rel.parts[0] in SKIP or re.fullmatch(r"index(-ch\d+)?\.html", rel.as_posix()):
                continue
            tar.add(p, arcname=f"{proj.name}/{rel.as_posix()}")
        tar.add(proj / entry, arcname=f"{proj.name}/index.html")
        for s in sorted(shared):
            if (ROOT / s).is_file():
                tar.add(ROOT / s, arcname=s)
            else:
                print(f"  ⚠ missing shared file {s}")
    return buf.getvalue()


def hfdist(*args: str) -> dict:
    r = subprocess.run(["node", "/opt/hfdist/hfdist.mjs", *args], capture_output=True, text=True)
    out = r.stdout + r.stderr
    m = re.search(r"^RESULT (.+)$", r.stdout, re.M)
    if r.returncode != 0 or not m:
        raise RuntimeError(f"hfdist {args[0]} failed (rc {r.returncode}):\n{out[-5000:]}")
    return {**json.loads(m.group(1)), "log": out[-3000:]}


def unpack_plan(job: str) -> str:
    vol.reload()
    shutil.rmtree("/tmp/plan", ignore_errors=True)
    with tarfile.open(VOL / job / "plan.tar") as t:
        t.extractall("/tmp")
    return "/tmp/plan"


@app.function(cpu=4.0, memory=8192, timeout=1800, volumes={VOL: vol}, scaledown_window=2)
def plan_job(data: bytes, name: str, job: str, cfg: dict) -> dict:
    t0 = time.time()
    tarfile.open(fileobj=io.BytesIO(data), mode="r:gz").extractall("/work")
    res = hfdist("plan", f"/work/{name}", "/tmp/plan", json.dumps(cfg))
    (VOL / job / "chunks").mkdir(parents=True, exist_ok=True)
    with tarfile.open(VOL / job / "plan.tar", "w") as t:
        t.add("/tmp/plan", arcname="plan")
    vol.commit()
    return {**res, "plan_mb": (VOL / job / "plan.tar").stat().st_size / 1e6, "secs": time.time() - t0}


@app.function(cpu=4.0, memory=4096, timeout=1800, volumes={VOL: vol}, retries=1, scaledown_window=2)
def render_chunk(job: str, i: int) -> dict:
    t0 = time.time()
    plan_dir = unpack_plan(job)
    res = hfdist("chunk", plan_dir, str(i), "/tmp/chunk.mp4")
    shutil.copyfile("/tmp/chunk.mp4", VOL / job / "chunks" / f"{i:04d}.mp4")
    vol.commit()
    res.pop("log")
    return {**res, "i": i, "secs": time.time() - t0}


@app.function(cpu=2.0, memory=4096, timeout=1800, volumes={VOL: vol}, scaledown_window=2)
def assemble_job(job: str, n: int) -> dict:
    t0 = time.time()
    plan_dir = unpack_plan(job)
    chunks = [str(VOL / job / "chunks" / f"{i:04d}.mp4") for i in range(n)]
    res = hfdist("assemble", plan_dir, "/tmp/final.mp4", *chunks)
    mp4 = Path("/tmp/final.mp4").read_bytes()
    shutil.rmtree(VOL / job, ignore_errors=True)
    vol.commit()
    return {**res, "mp4": mp4, "secs": time.time() - t0}


@app.function(cpu=16.0, memory=32768, timeout=1800, scaledown_window=2)
def render_single(data: bytes, name: str, workers: str) -> dict:
    t0 = time.time()
    tarfile.open(fileobj=io.BytesIO(data), mode="r:gz").extractall("/work")
    out = f"/work/{name}/renders/raw.mp4"
    r = subprocess.run(["hyperframes", "render", "--quality", "high", "--workers", workers, "--output", out],
                       cwd=f"/work/{name}", capture_output=True, text=True)
    log = (r.stdout + r.stderr)[-6000:]
    if r.returncode != 0 or not os.path.exists(out):
        raise RuntimeError(f"render failed (rc {r.returncode}):\n{log}")
    return {"mp4": open(out, "rb").read(), "log": log, "secs": time.time() - t0}


@app.local_entrypoint()
def main(slug: str, mode: str = "dist", chunks: int = 32, cpu: float = 4.0, mem: int = 4096,
         workers: str = "auto", out: str = "renders/raw-modal.mp4", entry: str = "index.html"):
    t0 = time.time()
    data, name = bundle(slug, entry), Path(slug).name
    video = json.loads((ROOT / slug / "video.json").read_text(encoding="utf-8"))
    width, height = (1920, 1080) if video.get("format") == "landscape" else (1080, 1920)
    print(f"bundle {len(data) / 1e6:.1f} MB in {time.time() - t0:.1f}s")
    if mode == "single":
        res = render_single.with_options(cpu=cpu, memory=mem).remote(data, name, workers)
        print(res["log"])
    else:
        job = f"{name}-{uuid.uuid4().hex[:8]}"
        cfg = {"fps": 30, "width": width, "height": height, "format": "mp4", "quality": "high",
               "maxParallelChunks": chunks, "runtimeCap": "none"}
        t1 = time.time()
        p = plan_job.remote(data, name, job, cfg)
        print(f"plan: {p['chunkCount']} chunks · {p['totalFrames']} frames · plan {p['plan_mb']:.1f} MB · "
              f"{p['secs']:.0f}s in container, {time.time() - t1:.0f}s incl. upload/start")
        t2 = time.time()
        rs = list(render_chunk.with_options(cpu=cpu, memory=mem).starmap([(job, i) for i in range(p["chunkCount"])]))
        secs = sorted(r["secs"] for r in rs)
        fps = [r["framesEncoded"] / r["secs"] for r in rs]
        print(f"chunks: {time.time() - t2:.0f}s wall · per chunk {secs[0]:.0f}–{secs[-1]:.0f}s · "
              f"{min(fps):.1f}–{max(fps):.1f} fps each · {rs[0]['captureMode']} · {cpu:g} cores/{mem} MiB each")
        t3 = time.time()
        res = assemble_job.remote(job, p["chunkCount"])
        print(f"assemble: {time.time() - t3:.0f}s")
    dest = ROOT / slug / out
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(res["mp4"])
    print(f"✓ {dest}  ({len(res['mp4']) / 1e6:.1f} MB) · total {time.time() - t0:.0f}s")
