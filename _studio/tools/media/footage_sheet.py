"""Contact sheet of a video with timestamps, for picking clip ranges by eye (studio footage).

    python footage_sheet.py <video> <out.jpg> [every_s] [cols] [title]

Grabs one frame every `every_s` seconds (default: ~48 frames across the video), tiles them, and stamps each tile with
its time (mm:ss) so a range can be read straight off the sheet and passed to `studio clip --from --to`.
"""
import json, math, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont


def dur(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", path], capture_output=True, text=True).stdout
    return float(json.loads(out)["format"]["duration"])


def main():
    src, out = sys.argv[1], sys.argv[2]
    d = dur(src)
    every = float(sys.argv[3]) if len(sys.argv) > 3 and float(sys.argv[3]) > 0 else max(2.0, round(d / 48))
    cols = int(sys.argv[4]) if len(sys.argv) > 4 else 8
    title = sys.argv[5] if len(sys.argv) > 5 else os.path.basename(src)
    times = [t for t in [i * every for i in range(int(d // every) + 1)] if t < d - 0.2]
    W, H = 320, 180
    tmp = tempfile.mkdtemp()
    # one ffmpeg pass, frames at the chosen interval
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-vf", f"fps=1/{every},scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2",
                    os.path.join(tmp, "f%04d.jpg")], check=True)
    files = sorted(f for f in os.listdir(tmp) if f.endswith(".jpg"))
    rows = math.ceil(len(files) / cols)
    sheet = Image.new("RGB", (cols * W, rows * H + 36), "black")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("arialbd.ttf", 18); big = ImageFont.truetype("arial.ttf", 20)
    except OSError:
        font = big = ImageFont.load_default()
    draw.text((8, 8), f"{title}  ·  {d / 60:.1f} min  ·  every {every:g}s", fill="white", font=big)
    for k, f in enumerate(files):
        t = k * every
        im = Image.open(os.path.join(tmp, f))
        x, y = (k % cols) * W, (k // cols) * H + 36
        sheet.paste(im, (x, y))
        label = f"{int(t // 60)}:{int(t % 60):02d}"
        draw.rectangle([x, y, x + 62, y + 24], fill="black")
        draw.text((x + 5, y + 2), label, fill="#ffc94d", font=font)
    sheet.save(out, quality=82)
    print(out, len(files), "frames")


if __name__ == "__main__":
    main()
