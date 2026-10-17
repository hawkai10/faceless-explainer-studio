"""Numbered preview sheet from a list of images (studio photo search).

    python tile_sheet.py <out.jpg> <cols> <img1> <img2> ...     (missing/unreadable images become grey tiles)
"""
import math, sys
from PIL import Image, ImageDraw, ImageFont

out, cols, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
W, H = 420, 280
rows = max(1, math.ceil(len(files) / cols))
sheet = Image.new("RGB", (cols * W, rows * H), (20, 20, 22))
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("arialbd.ttf", 26)
except OSError:
    font = ImageFont.load_default()
for i, f in enumerate(files):
    x, y = (i % cols) * W, (i // cols) * H
    try:
        im = Image.open(f).convert("RGB")
        im.thumbnail((W - 6, H - 6))
        sheet.paste(im, (x + (W - im.width) // 2, y + (H - im.height) // 2))
    except Exception:
        draw.rectangle([x + 3, y + 3, x + W - 3, y + H - 3], fill=(60, 60, 64))
    draw.rectangle([x, y, x + 46, y + 34], fill=(0, 0, 0))
    draw.text((x + 8, y + 3), str(i + 1), fill=(255, 201, 77), font=font)
sheet.save(out, quality=85)
print(out)
